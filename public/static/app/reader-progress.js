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

const recentEdits = new Map();
const savesInFlight = new Map();
let progressRevision = 0;
const progressAccount = () => state.authUi.currentUser?.email || "guest";
const progressKey = (account, itemId) =>
	`reading-progress:${account}:${itemId}`;

function applyProgress(item, progress) {
	item.reading_progress = JSON.stringify(progress);
	const ratio =
		typeof progress.ratio === "number"
			? progress.ratio
			: typeof progress.percentage === "number"
				? progress.percentage
				: progress.total > 0
					? progress.page / progress.total
					: 0;
	if (["article", "pdf", "epub"].includes(progress.kind) && ratio >= 0.99)
		item.is_read = 1;
}

function pendingProgress(account) {
	const pending = new Map();
	const prefix = `reading-progress:${account}:`;
	try {
		for (const key of Object.keys(localStorage)) {
			if (!key.startsWith(prefix)) continue;
			try {
				const progress = JSON.parse(localStorage.getItem(key));
				if (progress && typeof progress === "object")
					pending.set(Number(key.slice(prefix.length)), progress);
			} catch {}
		}
	} catch {}
	return pending;
}

export function captureProgressSnapshot() {
	const account = progressAccount();
	return {
		account,
		revision: progressRevision,
		pending: pendingProgress(account),
	};
}

export function mergePendingProgress(items, snapshot) {
	if (snapshot.account !== progressAccount()) return items;
	const pending = pendingProgress(snapshot.account);
	for (const item of items) {
		const id = Number(item.id);
		const edit = recentEdits.get(id);
		const progress =
			edit?.account === snapshot.account && edit.revision > snapshot.revision
				? edit.progress
				: pending.get(id) || snapshot.pending.get(id);
		if (progress) applyProgress(item, progress);
	}
	return items;
}

function persistReaderProgress(itemId, progress, account = progressAccount()) {
	if (
		!itemId ||
		!progress ||
		typeof progress !== "object" ||
		account !== progressAccount()
	)
		return;
	const key = progressKey(account, itemId);
	const serialized = JSON.stringify(progress);
	const previous = savesInFlight.get(key);
	if (previous?.payload === serialized) return previous.promise;
	const send = async () => {
		if (account !== progressAccount()) return;
		try {
			const response = await fetch(`/api/items/${itemId}/progress`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ progress }),
				keepalive: true,
			});
			if (response.ok && localStorage.getItem(key) === serialized)
				localStorage.removeItem(key);
		} catch {}
	};
	// Preserve write order for this item, even when the network is slow.
	const work = previous ? previous.promise.then(send, send) : send();
	const promise = work.finally(() => {
		if (savesInFlight.get(key)?.promise === promise) savesInFlight.delete(key);
	});
	savesInFlight.set(key, { payload: serialized, promise });
	return promise;
}

function queueReaderProgressSave(progress) {
	if (!state.currentReaderId || !progress || typeof progress !== "object")
		return;
	if (
		state.pendingProgressSave &&
		state.pendingProgressItemId !== state.currentReaderId
	)
		flushPendingProgressSave();
	const id = Number(state.currentReaderId);
	const account = progressAccount();
	const serialized = JSON.stringify(progress);
	const item = state.itemsById.get(id);
	if (item?.reading_progress === serialized) return;
	recentEdits.set(id, { account, revision: ++progressRevision, progress });
	if (item) applyProgress(item, progress);
	try {
		localStorage.setItem(progressKey(account, id), serialized);
	} catch {}
	state.pendingProgressItemId = id;
	state.pendingProgressPayload = progress;
	state.pendingProgressAccount = account;
	// Coalesce updates without indefinitely postponing the save while scrolling.
	if (!state.pendingProgressSave)
		state.pendingProgressSave = setTimeout(flushPendingProgressSave, 350);
}

function flushPendingProgressSave() {
	if (!state.pendingProgressSave) return;
	clearTimeout(state.pendingProgressSave);
	const itemId = state.pendingProgressItemId;
	const payload = state.pendingProgressPayload;
	const account = state.pendingProgressAccount;
	state.pendingProgressSave = null;
	state.pendingProgressItemId = null;
	state.pendingProgressPayload = null;
	state.pendingProgressAccount = null;
	return persistReaderProgress(itemId, payload, account);
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
	window.addEventListener("reading:account-changed", () => {
		recentEdits.clear();
		progressRevision++;
	});
	window.addEventListener("pagehide", flushPendingProgressSave);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flushPendingProgressSave();
	});
	function retryProgress() {
		const account = progressAccount();
		for (const [itemId, progress] of pendingProgress(account))
			void persistReaderProgress(itemId, progress, account);
	}
	window.addEventListener("online", retryProgress);
	window.addEventListener("reading:library-loaded", retryProgress);
	window.addEventListener("message", (event) => {
		if (
			!state.readerIframe ||
			event.source !== state.readerIframe.contentWindow ||
			event.origin !== window.location.origin
		)
			return;

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
		const trackedItemId = state.currentReaderId;
		const trackedIframe = state.readerIframe;
		const isActive = () =>
			state.currentReaderId === trackedItemId &&
			state.readerIframe === trackedIframe;

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
			if (!isActive()) return;
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
			if (!isActive() || Date.now() < restoreGuardUntil) return;

			const measured = getCurrentRatio(event?.target || null);
			const ratio =
				!userScrolledAfterRestore && measured < restoredRatio
					? restoredRatio
					: measured;
			saveRatio(ratio);
		};

		const restoreProgress = (withGuard = false) => {
			if (!isActive()) return;
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
			restoreGuardUntil = 0;
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
