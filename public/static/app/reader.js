import {
	buildParsedArticleDocument,
	createReaderLoadingState,
	createVideoIframe,
	fetchParsedArticle,
	getReaderSourceUrl,
	lockBackgroundScroll,
	mountPdfReader,
	openReaderOriginal,
	resetEpubReader,
	revokeReaderBlobUrl,
	setReaderSidebarOpen,
	showReaderError,
	syncOpenArticleTheme,
	toggleReaderSidebar,
	unlockBackgroundScroll,
} from "./reader-display.js";
import { openEpubReader } from "./reader-epub.js";
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
	Object.assign(readerApi, initReaderHighlights(app, readerApi));

	async function openReader(id, itemUrl, title, type) {
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

		const articleUrl = getReaderSourceUrl(itemUrl, "article");
		if (!articleUrl) {
			showReaderError(
				itemUrl,
				"This URL is not supported. Only local files and public http(s) URLs can be opened.",
			);
			return;
		}

		const data = await fetchParsedArticle(articleUrl, itemUrl);
		if (!data) return;
		if (data.error) {
			showReaderError(itemUrl, data.message || "Failed to load content");
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

	function closeReader() {
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
		app.loadItems?.();
	}

	Object.assign(readerApi, {
		closeReader,
		openReader,
		setReaderSidebarOpen,
	});

	app.openReader = openReader;
	app.loadAllHighlights = readerApi.loadAllHighlights;

	dom.readerClose?.addEventListener("click", closeReader);
	dom.readerToggleNotes?.addEventListener("click", () => {
		setReaderSidebarOpen(dom.readerSidebar?.classList.contains("hidden"));
	});

	document.addEventListener("keydown", (event) => {
		const readerOpen =
			dom.readerModal && dom.readerModal.style.display !== "none";

		if (readerOpen && !shouldIgnoreKeyboardShortcut(event)) {
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
		}

		if (event.key !== "Escape") return;

		if (dom.noteModal && dom.noteModal.style.display !== "none") {
			readerApi.closeNoteModal?.();
		} else if (readerOpen) {
			closeReader();
		} else if (dom.editModal && dom.editModal.style.display !== "none") {
			app.closeEditModal?.();
		}

		app.closeItemMenu?.();
		readerApi.hideSelectionPopup?.();
	});

	document.addEventListener("readinglist:themechange", syncOpenArticleTheme);
}
