import { dom, state } from "./shared.js";
import {
	clampProgressRatio,
	getIframeDocument,
	parseReadingProgress,
} from "./utils.js";

function setReaderProgress(visible, ratio = 0, label = "0%") {
	if (
		!dom.readerProgress ||
		!dom.readerProgressFill ||
		!dom.readerProgressLabel
	) {
		return;
	}

	if (!visible) {
		dom.readerProgress.style.display = "none";
		return;
	}

	const clampedRatio = clampProgressRatio(ratio);
	dom.readerProgress.style.display = "flex";
	dom.readerProgressFill.style.width = `${Math.round(clampedRatio * 100)}%`;
	dom.readerProgressLabel.textContent =
		label || `${Math.round(clampedRatio * 100)}%`;
}

function stopArticleProgressPoll() {
	if (!state.articleProgressPoll) return;
	clearInterval(state.articleProgressPoll);
	state.articleProgressPoll = null;
}

function getCurrentItemReadingProgress(itemId) {
	const item = state.itemsById.get(Number(itemId));
	return parseReadingProgress(item?.reading_progress);
}

function updateCachedItemProgress(itemId, progress) {
	const numericId = Number(itemId);
	const item = state.itemsById.get(numericId);
	if (!item) return;

	item.reading_progress = JSON.stringify(progress || {});
	state.itemsById.set(numericId, item);
}

function persistReaderProgress(itemId, progress) {
	if (!itemId || !progress || typeof progress !== "object") return;

	void fetch(`/api/items/${itemId}/progress`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ progress }),
	}).then((response) => {
		if (response.ok) updateCachedItemProgress(itemId, progress);
	});
}

function queueReaderProgressSave(progress) {
	if (!state.currentReaderId || !progress || typeof progress !== "object") {
		return;
	}

	if (state.pendingProgressSave) clearTimeout(state.pendingProgressSave);
	state.pendingProgressItemId = state.currentReaderId;
	state.pendingProgressPayload = progress;
	updateCachedItemProgress(state.currentReaderId, progress);

	state.pendingProgressSave = setTimeout(() => {
		const itemId = state.pendingProgressItemId;
		const payload = state.pendingProgressPayload;
		state.pendingProgressSave = null;
		state.pendingProgressItemId = null;
		state.pendingProgressPayload = null;
		persistReaderProgress(itemId, payload);
	}, 350);
}

function flushPendingProgressSave() {
	if (!state.pendingProgressSave) return;

	clearTimeout(state.pendingProgressSave);
	const itemId = state.pendingProgressItemId;
	const payload = state.pendingProgressPayload;
	state.pendingProgressSave = null;
	state.pendingProgressItemId = null;
	state.pendingProgressPayload = null;
	persistReaderProgress(itemId, payload);
}

function normalizeProgressUrl(value) {
	if (typeof value !== "string" || !value.trim()) return "";

	if (URL.canParse(value, window.location.origin)) {
		const parsed = new URL(value, window.location.origin);
		const pathname = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
		return `${parsed.protocol}//${parsed.host}${pathname}`;
	}

	return value
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "")
		.toLowerCase();
}

function parseRatioValue(value, treatAsPercent = false) {
	let numeric = null;

	if (typeof value === "number") {
		numeric = value;
	} else if (typeof value === "string") {
		const cleaned = value.trim();
		if (!cleaned) return null;

		const parsed = Number.parseFloat(cleaned.replace("%", ""));
		if (Number.isFinite(parsed)) {
			numeric = parsed;
			if (cleaned.includes("%")) treatAsPercent = true;
		}
	}

	if (numeric === null || Number.isNaN(numeric)) return null;
	if (treatAsPercent || numeric > 1) numeric /= 100;
	return clampProgressRatio(numeric);
}

function getLegacyAwareArticleRatio(progress, currentUrl) {
	if (progress == null) return null;

	if (typeof progress === "number" || typeof progress === "string") {
		const ratio = parseRatioValue(progress, false);
		return ratio === null ? null : { ratio, shouldMigrateUrl: false };
	}

	if (typeof progress !== "object") return null;
	if (progress.kind && progress.kind !== "article") return null;

	const ratioCandidates = [
		parseRatioValue(progress.ratio, false),
		parseRatioValue(progress.progress, false),
		parseRatioValue(progress.percentage, true),
		parseRatioValue(progress.percent, true),
	].filter((value) => typeof value === "number");

	if (ratioCandidates.length === 0) return null;

	const savedUrl = normalizeProgressUrl(
		progress.url || progress.source_url || progress.article_url,
	);
	const sameUrl = !savedUrl || !currentUrl || savedUrl === currentUrl;
	const ratio = ratioCandidates[0];

	if (sameUrl || ratio >= 0.99) {
		return { ratio, shouldMigrateUrl: !sameUrl };
	}

	return null;
}

function getElementRatio(element) {
	if (!element || element.nodeType !== 1) return 0;

	const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
	if (maxScroll <= 0) return 0;

	return clampProgressRatio((Number(element.scrollTop) || 0) / maxScroll);
}

export function initReaderProgress() {
	window.addEventListener("message", (event) => {
		if (!state.readerIframe) return;

		const data = event.data;
		if (!data || data.type !== "reading-progress") return;

		if (data.kind === "pdf" && typeof data.ratio === "number") {
			const ratio = clampProgressRatio(data.ratio);
			setReaderProgress(true, ratio, `${Math.round(ratio * 100)}%`);
			queueReaderProgressSave({ kind: "pdf", ratio });
		}
	});

	function setupArticleProgressTracking(url) {
		if (!state.currentReaderId || !state.readerIframe) return;

		const doc = getIframeDocument(state.readerIframe);
		const win = doc?.defaultView;
		const docEl = doc?.documentElement;
		if (!doc || !win || !docEl) return;
		if (docEl.dataset.rlArticleProgressBound === "1") return;

		stopArticleProgressPoll();
		docEl.dataset.rlArticleProgressBound = "1";

		const currentProgressUrl = normalizeProgressUrl(url);
		let migratedLegacyArticleProgress = false;
		let hasCapturedPositiveRatio = false;
		let hasRestoredNonZeroRatio = false;
		let scrollContainers = [];
		let restoreGuardUntil = 0;
		let restoredRatio = 0;
		let userScrolledAfterRestore = false;
		let userInteractedAfterRestore = false;

		const getScrollRoot = () => doc.scrollingElement || docEl || doc.body;
		const getViewportHeight = (scrollRoot) =>
			Math.max(
				1,
				scrollRoot && scrollRoot !== doc.body
					? Number(scrollRoot.clientHeight) || 0
					: 0,
				Number(win.innerHeight) || 0,
				Number(docEl.clientHeight) || 0,
			);

		const refreshScrollContainers = () => {
			if (!doc.body) {
				scrollContainers = [];
				return;
			}

			scrollContainers = Array.from(doc.body.querySelectorAll("*"))
				.map((node) => ({
					node,
					maxScroll: Math.max(0, node.scrollHeight - node.clientHeight),
				}))
				.filter((entry) => entry.maxScroll > 100)
				.sort((a, b) => b.maxScroll - a.maxScroll)
				.slice(0, 120)
				.map((entry) => entry.node);
		};

		const getRootRatio = () => {
			const scrollRoot = getScrollRoot();
			const docHeight = Math.max(
				Number(scrollRoot?.scrollHeight) || 0,
				Number(docEl.scrollHeight) || 0,
				Number(doc.body?.scrollHeight) || 0,
			);
			const viewportHeight = getViewportHeight(scrollRoot);
			const maxScroll = Math.max(0, docHeight - viewportHeight);
			if (maxScroll <= 0) return 0;

			const top = Math.max(
				Number(scrollRoot?.scrollTop) || 0,
				Number(docEl.scrollTop) || 0,
				Number(doc.body?.scrollTop) || 0,
				Number(win.scrollY) || 0,
				Number(win.pageYOffset) || 0,
			);
			return clampProgressRatio(top / maxScroll);
		};

		const getContainerRatio = (eventTarget) => {
			let best = 0;
			let node =
				eventTarget && eventTarget.nodeType === 3
					? eventTarget.parentElement
					: eventTarget;

			while (
				node &&
				node.nodeType === 1 &&
				node !== doc.body &&
				node !== docEl
			) {
				best = Math.max(best, getElementRatio(node));
				node = node.parentElement;
			}

			for (const container of scrollContainers) {
				best = Math.max(best, getElementRatio(container));
			}

			return best;
		};

		const saveRatio = (ratio) => {
			const clampedRatio = clampProgressRatio(ratio);
			if (clampedRatio > 0) hasCapturedPositiveRatio = true;

			setReaderProgress(
				true,
				clampedRatio,
				`${Math.round(clampedRatio * 100)}%`,
			);
			if (
				clampedRatio <= 0 &&
				!hasCapturedPositiveRatio &&
				!hasRestoredNonZeroRatio
			) {
				return;
			}

			queueReaderProgressSave({ kind: "article", url, ratio: clampedRatio });
		};

		const getCurrentRatio = (eventTarget) =>
			Math.max(getRootRatio(), getContainerRatio(eventTarget));

		const persistRatio = (event) => {
			if (Date.now() < restoreGuardUntil) return;

			const measured = getCurrentRatio(event?.target || null);
			const ratio =
				!userScrolledAfterRestore && measured < restoredRatio
					? restoredRatio
					: measured;
			saveRatio(ratio);
		};

		const restoreProgress = (withGuard = false) => {
			const progress = getCurrentItemReadingProgress(state.currentReaderId);
			const resolved = getLegacyAwareArticleRatio(progress, currentProgressUrl);
			if (!resolved) {
				setReaderProgress(true, 0, "0%");
				return;
			}

			const ratio = resolved.ratio;
			restoredRatio = ratio;
			if (ratio > 0) hasRestoredNonZeroRatio = true;
			if (withGuard && ratio > 0) {
				userScrolledAfterRestore = false;
				userInteractedAfterRestore = false;
				restoreGuardUntil = Date.now() + 1700;
			}

			if (resolved.shouldMigrateUrl && !migratedLegacyArticleProgress) {
				migratedLegacyArticleProgress = true;
				queueReaderProgressSave({ kind: "article", url, ratio });
			}

			const scrollRoot = getScrollRoot();
			const viewportHeight = getViewportHeight(scrollRoot);
			const maxDocScroll = Math.max(
				0,
				Math.max(
					Number(scrollRoot?.scrollHeight) || 0,
					Number(docEl.scrollHeight) || 0,
					Number(doc.body?.scrollHeight) || 0,
				) - viewportHeight,
			);
			const docTarget = maxDocScroll * ratio;

			win.scrollTo(0, docTarget);
			if (scrollRoot) scrollRoot.scrollTop = docTarget;
			docEl.scrollTop = docTarget;
			if (doc.body) doc.body.scrollTop = docTarget;

			const primaryContainer = scrollContainers[0];
			if (primaryContainer) {
				const maxContainerScroll = Math.max(
					0,
					primaryContainer.scrollHeight - primaryContainer.clientHeight,
				);
				primaryContainer.scrollTop = maxContainerScroll * ratio;
			}

			saveRatio(ratio);
		};

		const onScroll = (event) => {
			if (Date.now() >= restoreGuardUntil && userInteractedAfterRestore) {
				userScrolledAfterRestore = true;
			}
			persistRatio(event);
		};

		const markUserInteraction = () => {
			userInteractedAfterRestore = true;
		};

		refreshScrollContainers();
		doc.addEventListener("touchstart", markUserInteraction, {
			passive: true,
			capture: true,
		});
		doc.addEventListener("touchmove", markUserInteraction, {
			passive: true,
			capture: true,
		});
		doc.addEventListener("wheel", markUserInteraction, {
			passive: true,
			capture: true,
		});
		doc.addEventListener("pointerdown", markUserInteraction, {
			passive: true,
			capture: true,
		});
		doc.addEventListener("keydown", markUserInteraction, true);
		doc.addEventListener("scroll", onScroll, { passive: true, capture: true });
		win.addEventListener("scroll", onScroll, { passive: true });
		restoreProgress(true);

		let tick = 0;
		state.articleProgressPoll = setInterval(() => {
			if (!state.currentReaderId || !state.readerIframe) {
				stopArticleProgressPoll();
				return;
			}

			tick += 1;
			if (tick % 10 === 0) refreshScrollContainers();
			persistRatio();
		}, 200);

		setTimeout(refreshScrollContainers, 350);
		setTimeout(() => restoreProgress(false), 320);
		setTimeout(() => persistRatio(), 1300);
	}

	return {
		flushPendingProgressSave,
		getCurrentItemReadingProgress,
		queueReaderProgressSave,
		setReaderProgress,
		setupArticleProgressTracking,
		stopArticleProgressPoll,
	};
}
