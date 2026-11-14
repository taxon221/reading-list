import {
	buildParsedArticleDocument,
	createReaderLoadingState,
	createVideoIframe,
	fetchParsedArticle,
	focusReaderFrame,
	getReaderSourceUrl,
	lockBackgroundScroll,
	mountPdfReader,
	openReaderOriginal,
	resetEpubReader,
	revokeReaderBlobUrl,
	setReaderSidebarOpen,
	showReaderError,
	syncOpenArticleTheme,
	syncPdfReaderTheme,
	toggleReaderSidebar,
	unlockBackgroundScroll,
} from "./reader-display.js";
import {
	handleEpubPageKey,
	openEpubReader,
	syncEpubReaderTheme,
} from "./reader-epub.js";
import { initReaderHighlights } from "./reader-highlights.js";
import { initReaderProgress } from "./reader-progress.js";
import { dom, state } from "./shared.js";
import {
	getAuthorizedItemUrl,
	getItemProgressInfo,
	shouldIgnoreKeyboardShortcut,
} from "./utils.js";

export function initReader(app) {
	const readerApi = {
		openReaderOriginal,
		setReaderSidebarOpen,
		toggleReaderSidebar,
	};
	Object.assign(readerApi, initReaderProgress());
	Object.assign(readerApi, initReaderHighlights(app));

	function getArticleErrorActions() {
		return [{ label: "Open original", onClick: openReaderOriginal }];
	}

	async function openReader(
		id,
		itemUrl,
		title,
		type,
		{ fromHistory = false } = {},
	) {
		if (!fromHistory) {
			const hash = `#item=${id}`;
			if (location.hash !== hash) history.pushState({ reader: true }, "", hash);
		}
		readerApi.flushPendingProgressSave?.();
		resetEpubReader();
		readerApi.stopArticleProgressPoll?.();
		readerApi.stopMobileSelectionPoll?.();
		state.currentReaderId = id;
		state.readerIframe = null;
		state.currentHighlights = [];

		lockBackgroundScroll();
		if (dom.readerModal) dom.readerModal.style.display = "flex";
		if (dom.readerTitle) dom.readerTitle.textContent = title;
		if (dom.readerOpenOriginal) {
			dom.readerOpenOriginal.href = getAuthorizedItemUrl(itemUrl);
		}
		setReaderSidebarOpen(false);

		const currentItem = state.itemsById.get(Number(id));
		const itemProgress = getItemProgressInfo(currentItem);
		if (itemProgress) {
			readerApi.setReaderProgress?.(
				true,
				itemProgress.ratio,
				itemProgress.label,
			);
		} else if (type !== "video" && type !== "podcast") {
			readerApi.setReaderProgress?.(true, 0, "0%");
		} else {
			readerApi.setReaderProgress?.(false);
		}

		await readerApi.loadHighlights?.(id);

		if (dom.readerContent) {
			dom.readerContent.replaceChildren(createReaderLoadingState());
		}

		if (type === "video") {
			const youtubeMatch = itemUrl.match(
				/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/,
			);
			const vimeoMatch = itemUrl.match(/vimeo\.com\/(\d+)/);

			if (youtubeMatch && dom.readerContent) {
				dom.readerContent.replaceChildren(
					createVideoIframe(
						`https://www.youtube.com/embed/${youtubeMatch[1]}`,
						"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
					),
				);
				return;
			}
			if (vimeoMatch && dom.readerContent) {
				dom.readerContent.replaceChildren(
					createVideoIframe(`https://player.vimeo.com/video/${vimeoMatch[1]}`),
				);
				return;
			}
		}

		if (type === "pdf" || itemUrl.toLowerCase().endsWith(".pdf")) {
			const fileUrl = getReaderSourceUrl(itemUrl, "pdf");
			if (!fileUrl) {
				showReaderError(itemUrl, "This PDF URL is not supported.");
				return;
			}
			mountPdfReader(fileUrl, id, readerApi);
			return;
		}

		if (type === "ebook" || /\.epub$/i.test(itemUrl)) {
			await openEpubReader(itemUrl, readerApi);
			return;
		}

		// Prefer the saved clean copy. Fall back to the live proxy, which also
		// handles podcasts/videos, PDFs behind extension-less links, and reports
		// paywall/timeout reasons.
		let data = await fetchParsedArticle(`/api/items/${id}/content`);
		const proxyUrl = getReaderSourceUrl(itemUrl, "article");
		if (data.error && data.error !== "Session ended" && proxyUrl)
			data = await fetchParsedArticle(proxyUrl);
		if (state.currentReaderId !== id) return;
		if (data.error) {
			showReaderError(
				itemUrl,
				data.message || "Failed to load content",
				getArticleErrorActions(),
				{ includeOpenOriginal: false },
			);
			return;
		}

		if (data.type === "html") {
			const iframe = document.createElement("iframe");
			iframe.sandbox = "allow-same-origin allow-popups";
			if (!dom.readerContent) return;

			revokeReaderBlobUrl();
			dom.readerContent.replaceChildren(iframe);
			state.readerIframe = iframe;

			const articleDocument =
				typeof data.byline === "string" || typeof data.excerpt === "string"
					? buildParsedArticleDocument(data)
					: data.content;

			state.readerBlobUrl = URL.createObjectURL(
				new Blob([articleDocument], { type: "text/html" }),
			);
			iframe.src = state.readerBlobUrl;

			iframe.onload = () => {
				revokeReaderBlobUrl();
				focusReaderFrame(iframe);
				syncOpenArticleTheme();
				readerApi.scheduleApplyHighlightsToDocument?.();
				readerApi.setupIframeSelectionListener?.();
				readerApi.setupArticleProgressTracking?.(itemUrl);
			};

			setTimeout(() => {
				syncOpenArticleTheme();
				readerApi.scheduleApplyHighlightsToDocument?.();
				readerApi.setupIframeSelectionListener?.();
				readerApi.setupArticleProgressTracking?.(itemUrl);
			}, 100);
			return;
		}

		if (data.type === "pdf") {
			const fileUrl = getReaderSourceUrl(data.url, "pdf");
			if (!fileUrl) {
				showReaderError(itemUrl, "This PDF URL is not supported.");
				return;
			}
			mountPdfReader(fileUrl, id, readerApi);
			return;
		}

		showReaderError(
			itemUrl,
			`This content type (${data.contentType || "unknown"}) cannot be displayed inline.`,
		);
	}

	function closeReader({ fromHistory = false } = {}) {
		if (!fromHistory && location.hash.startsWith("#item=")) {
			if (history.state?.reader) {
				history.back();
				return;
			}
			history.replaceState({}, "", location.pathname + location.search);
		}
		const closedItemId = state.currentReaderId;
		resetEpubReader();
		revokeReaderBlobUrl();
		readerApi.stopArticleProgressPoll?.();
		readerApi.stopMobileSelectionPoll?.();
		setReaderSidebarOpen(false);
		readerApi.setReaderProgress?.(false);
		readerApi.flushPendingProgressSave?.();

		if (dom.readerModal) dom.readerModal.style.display = "none";
		if (dom.readerContent) dom.readerContent.replaceChildren();
		state.currentReaderId = null;
		state.readerIframe = null;
		state.currentHighlights = [];
		state.pendingScrollHighlightId = null;
		readerApi.hideSelectionPopup?.();
		readerApi.closeNoteModal?.();
		unlockBackgroundScroll();
		if (closedItemId) app.refreshReaderItem?.(closedItemId);
	}

	Object.assign(readerApi, {
		closeReader,
		openReader,
		setReaderSidebarOpen,
	});

	app.openReader = openReader;
	app.closeReader = closeReader;
	async function syncHistory() {
		const id = Number(new URLSearchParams(location.hash.slice(1)).get("item"));
		if (!id) {
			if (state.currentReaderId) closeReader({ fromHistory: true });
			return;
		}
		if (state.currentReaderId === id) return;
		let item = state.itemsById.get(id);
		if (!item) {
			const response = await fetch(`/api/items/${id}`).catch(() => null);
			if (!response?.ok) return;
			item = await response.json();
			state.itemsById.set(id, item);
		}
		await openReader(item.id, item.url, item.title, item.type, {
			fromHistory: true,
		});
	}
	window.addEventListener("message", (event) => {
		if (
			event.origin === location.origin &&
			event.source === state.readerIframe?.contentWindow &&
			event.data?.type === "readinglist:page-rendered"
		)
			readerApi.scheduleApplyHighlightsToDocument?.();
	});
	window.addEventListener("popstate", () => {
		void syncHistory();
	});
	window.addEventListener("reading:library-loaded", () => {
		void syncHistory();
	});

	app.loadAllHighlights = readerApi.loadAllHighlights;

	dom.readerClose?.addEventListener("click", () => closeReader());
	dom.readerToggleNotes?.addEventListener("click", () => {
		setReaderSidebarOpen(dom.readerSidebar?.classList.contains("hidden"));
	});

	document.addEventListener("keydown", (event) => {
		const readerOpen =
			dom.readerModal && dom.readerModal.style.display !== "none";
		const editOpen = dom.editModal && dom.editModal.style.display !== "none";

		if (readerOpen && !editOpen && !shouldIgnoreKeyboardShortcut(event)) {
			if (handleEpubPageKey(event)) {
				event.preventDefault();
				readerApi.hideSelectionPopup?.();
				return;
			}
			const key = event.key.toLowerCase();
			if (key === "o") {
				event.preventDefault();
				openReaderOriginal();
				return;
			}
			if (key === "h") {
				event.preventDefault();
				toggleReaderSidebar();
				return;
			}
			if (key === "t" && state.currentReaderId) {
				event.preventDefault();
				app.openEditModal?.(state.currentReaderId, { focusTagInput: true });
				return;
			}
		}

		if (event.key !== "Escape") return;

		if (dom.noteModal && dom.noteModal.style.display !== "none") {
			readerApi.closeNoteModal?.();
		} else if (dom.editModal && dom.editModal.style.display !== "none") {
			app.closeEditModal?.();
		} else if (readerOpen) {
			closeReader();
		}

		app.closeItemMenu?.();
		readerApi.hideSelectionPopup?.();
	});

	document.addEventListener("readinglist:themechange", () => {
		syncOpenArticleTheme();
		syncPdfReaderTheme();
		syncEpubReaderTheme();
	});
	document.addEventListener("readinglist:fontsizechange", () => {
		syncOpenArticleTheme();
		syncEpubReaderTheme();
	});
}
