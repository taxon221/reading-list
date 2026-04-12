import { dom, state } from "./shared.js";
import {
	createEmptyState,
	formatDate,
	getIframeDocument,
	isMobileViewport,
	shouldIgnoreKeyboardShortcut,
} from "./utils.js";

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function createNode(html) {
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	return template.content.firstElementChild;
}

function getActiveSelectionText(doc) {
	if (!doc) return "";

	const selection = doc.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return "";
	}

	return selection.toString().trim();
}

function truncateText(value, maxLength = 150) {
	if (!value || value.length <= maxLength) return value || "";
	return `${value.slice(0, maxLength)}...`;
}

function createSidebarHighlight(highlight) {
	return createNode(`
    <div class="sidebar-highlight" data-id="${highlight.id}">
      <div class="sidebar-highlight-quote" data-action="scroll-highlight" data-id="${highlight.id}">${escapeHtml(truncateText(highlight.selected_text))}</div>
      ${highlight.note ? `<div class="sidebar-highlight-note">${escapeHtml(highlight.note)}</div>` : ""}
      <div class="sidebar-highlight-actions">
        <button type="button" class="sidebar-highlight-btn" data-action="edit-highlight" data-id="${highlight.id}">Edit</button>
        <button type="button" class="sidebar-highlight-btn delete" data-action="delete-highlight" data-id="${highlight.id}">Delete</button>
      </div>
    </div>`);
}

function highlightTextInDocument(doc, text, highlightId = null) {
	const normalizedSearch = (text || "").replace(/\u00a0/g, " ").trim();
	if (!normalizedSearch) return;

	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
	const nodeData = [];
	let combined = "";
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const norm = (node.textContent || "").replace(/\u00a0/g, " ");
		nodeData.push({
			node,
			normStart: combined.length,
			normLength: norm.length,
		});
		combined += norm;
	}

	const pattern = normalizedSearch
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\s+/g, "\\s+");

	const match = new RegExp(pattern).exec(combined);
	if (!match) return;

	const matchStart = match.index;
	const matchEnd = matchStart + match[0].length;

	const segments = nodeData
		.filter(
			(entry) =>
				entry.normStart < matchEnd &&
				entry.normStart + entry.normLength > matchStart,
		)
		.map((entry) => ({
			node: entry.node,
			start: Math.max(0, matchStart - entry.normStart),
			end: Math.min(entry.normLength, matchEnd - entry.normStart),
		}))
		.reverse();

	for (const { node: textNode, start, end } of segments) {
		if (start >= end) continue;
		try {
			const range = doc.createRange();
			range.setStart(textNode, start);
			range.setEnd(textNode, end);
			const span = doc.createElement("span");
			span.className = "reading-list-highlight";
			if (highlightId !== null) span.dataset.highlightId = String(highlightId);
			range.surroundContents(span);
		} catch {}
	}
}

function createHighlightCard(highlight) {
	const itemUrl = escapeHtml(highlight.item_url || "");
	const itemTitle = escapeHtml(highlight.item_title || "");
	const itemType = escapeHtml(highlight.item_type || "article");
	return createNode(`
    <div class="highlight-card" data-id="${highlight.id}">
      <div class="highlight-card-header">
        <div class="highlight-card-source">
          <a href="#" data-action="open-highlight-reader" data-item-id="${highlight.item_id}" data-item-url="${itemUrl}" data-item-title="${itemTitle}" data-item-type="${itemType}">${itemTitle || "Untitled"}</a>
        </div>
        <span class="highlight-card-date">${escapeHtml(formatDate(highlight.created_at))}</span>
      </div>
      <div class="highlight-card-quote" data-action="open-at-highlight" data-id="${highlight.id}" data-item-id="${highlight.item_id}" data-item-url="${itemUrl}" data-item-title="${itemTitle}" data-item-type="${itemType}">${escapeHtml(highlight.selected_text)}</div>
      ${highlight.note ? `<div class="highlight-card-note">${escapeHtml(highlight.note)}</div>` : ""}
      <div class="highlight-card-actions">
        <button type="button" class="highlight-card-btn" data-action="edit-highlight-list" data-id="${highlight.id}">Edit Note</button>
        <button type="button" class="highlight-card-btn delete" data-action="delete-highlight-list" data-id="${highlight.id}">Delete</button>
      </div>
    </div>`);
}

export function createReaderHighlightUi(readerApi) {
	function renderSidebarHighlights() {
		if (!dom.sidebarHighlights || !dom.highlightsCount) return;

		if (state.currentHighlights.length === 0) {
			dom.highlightsCount.textContent = "";
			dom.sidebarHighlights.replaceChildren(
				createEmptyState(
					"No highlights yet",
					"Select text to highlight",
					"sidebar-empty",
				),
			);
			return;
		}

		dom.highlightsCount.textContent = `(${state.currentHighlights.length})`;
		dom.sidebarHighlights.replaceChildren(
			...state.currentHighlights.map(createSidebarHighlight),
		);
	}

	function applyHighlightsToDocument() {
		const doc = getIframeDocument(state.readerIframe);
		if (!doc?.body) return;

		if (!doc.getElementById("reading-list-highlight-style")) {
			const style = doc.createElement("style");
			style.id = "reading-list-highlight-style";
			style.textContent = `
        .reading-list-highlight {
          background-color: rgba(196, 109, 35, 0.32);
          background-color: color-mix(in srgb, var(--rl-reader-accent, #c46d23) 38%, transparent);
          border-radius: 0.2em;
          padding: 0.06em 0.12em;
          margin: 0 -0.06em;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .reading-list-highlight:hover {
          background-color: rgba(196, 109, 35, 0.45);
          background-color: color-mix(in srgb, var(--rl-reader-accent, #c46d23) 52%, transparent);
        }
      `;
			doc.head.appendChild(style);
		}

		const highlightParents = new Set();
		doc.querySelectorAll(".reading-list-highlight").forEach((element) => {
			const parent = element.parentNode;
			if (!parent) return;
			while (element.firstChild) {
				parent.insertBefore(element.firstChild, element);
			}
			parent.removeChild(element);
			highlightParents.add(parent);
		});
		for (const parent of highlightParents) parent.normalize();

		for (const highlight of state.currentHighlights) {
			highlightTextInDocument(doc, highlight.selected_text, highlight.id);
		}
	}

	function applyAndMaybeScroll() {
		applyHighlightsToDocument();
		if (!state.pendingScrollHighlightId) return;
		const highlightId = state.pendingScrollHighlightId;
		const doc = getIframeDocument(state.readerIframe);
		if (!doc?.querySelector(`[data-highlight-id="${highlightId}"]`)) return;
		scrollToHighlight(highlightId);
	}

	function scheduleApplyHighlightsToDocument() {
		applyAndMaybeScroll();
		if (state.currentHighlights.length === 0) return;

		for (const ms of [80, 200, 450, 900, 1600]) {
			setTimeout(applyAndMaybeScroll, ms);
		}

		if (state.pendingScrollHighlightId) {
			setTimeout(() => {
				state.pendingScrollHighlightId = null;
			}, 500);
		}

		const hookFonts = () => {
			const iframeDoc = getIframeDocument(state.readerIframe);
			if (iframeDoc?.fonts?.ready) {
				void iframeDoc.fonts.ready.then(applyAndMaybeScroll);
			}
		};
		hookFonts();
		setTimeout(hookFonts, 120);
	}

	function scrollToHighlight(highlightId) {
		const doc = getIframeDocument(state.readerIframe);
		if (!doc) return;

		const element = doc.querySelector(`[data-highlight-id="${highlightId}"]`);
		if (!element) return;

		element.scrollIntoView({ behavior: "smooth", block: "center" });
		doc
			.querySelectorAll(`[data-highlight-id="${highlightId}"]`)
			.forEach((entry) => {
				entry.style.backgroundColor =
					"color-mix(in srgb, var(--rl-reader-accent, #c46d23) 58%, transparent)";
				setTimeout(() => {
					entry.style.backgroundColor = "";
				}, 1000);
			});
	}

	function clearIframeSelection() {
		const doc = getIframeDocument(state.readerIframe);
		const selection = doc?.getSelection?.();
		if (!selection || selection.rangeCount === 0) return;
		selection.removeAllRanges();
	}

	function hideSelectionPopup() {
		if (!dom.selectionPopup) return;

		if (state.pendingMobileSelectionCheck) {
			clearTimeout(state.pendingMobileSelectionCheck);
			state.pendingMobileSelectionCheck = null;
		}
		if (state.mobilePopupDismissTimer) {
			clearTimeout(state.mobilePopupDismissTimer);
			state.mobilePopupDismissTimer = null;
		}

		dom.selectionPopup.classList.remove("mobile-fab");
		dom.selectionPopup.style.left = "";
		dom.selectionPopup.style.top = "";
		dom.selectionPopup.style.display = "none";
		state.pendingSelectionText = "";
	}

	function stopMobileSelectionPoll() {
		if (!state.mobileSelectionPoll) return;
		clearInterval(state.mobileSelectionPoll);
		state.mobileSelectionPoll = null;
	}

	function scheduleMobilePopupAutoDismiss() {
		if (!isMobileViewport()) return;
		if (!dom.selectionPopup || dom.selectionPopup.style.display === "none")
			return;
		if (state.mobilePopupDismissTimer)
			clearTimeout(state.mobilePopupDismissTimer);

		state.mobilePopupDismissTimer = setTimeout(() => {
			state.mobilePopupDismissTimer = null;
			if (!dom.selectionPopup || dom.selectionPopup.style.display === "none")
				return;
			if (dom.noteModal && dom.noteModal.style.display !== "none") return;
			clearIframeSelection();
			hideSelectionPopup();
		}, 1500);
	}

	function showSelectionPopup(selection) {
		if (!selection || selection.rangeCount === 0 || !dom.selectionPopup) return;

		const selectedText = selection.toString().trim();
		if (!selectedText) return;
		state.pendingSelectionText = selectedText;

		if (isMobileViewport()) {
			dom.selectionPopup.classList.add("mobile-fab");
			dom.selectionPopup.style.left = "";
			dom.selectionPopup.style.top = "";
			dom.selectionPopup.style.display = "block";
			scheduleMobilePopupAutoDismiss();
			return;
		}

		const iframeRect = state.readerIframe?.getBoundingClientRect();
		if (!iframeRect) return;

		dom.selectionPopup.classList.remove("mobile-fab");

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		const popupX = iframeRect.left + rect.left + rect.width / 2 - 54;
		const popupY = iframeRect.top + rect.top - 45;

		dom.selectionPopup.style.left = `${Math.max(
			10,
			Math.min(window.innerWidth - 118, popupX),
		)}px`;
		dom.selectionPopup.style.top = `${Math.max(10, popupY)}px`;
		dom.selectionPopup.style.display = "block";
	}

	function scheduleMobileSelectionProbe() {
		if (!isMobileViewport()) return;
		if (state.pendingMobileSelectionCheck) {
			clearTimeout(state.pendingMobileSelectionCheck);
		}

		let tries = 0;
		const probe = () => {
			state.pendingMobileSelectionCheck = null;

			const doc = getIframeDocument(state.readerIframe);
			const selection = doc?.getSelection?.();
			const selectedText = getActiveSelectionText(doc);
			if (selection && selectedText.length > 0) {
				showSelectionPopup(selection);
				return;
			}

			tries += 1;
			if (tries >= 14) {
				hideSelectionPopup();
				return;
			}

			state.pendingMobileSelectionCheck = setTimeout(probe, 120);
		};

		state.pendingMobileSelectionCheck = setTimeout(probe, 80);
	}

	function handleIframeSelection() {
		const delay = isMobileViewport() ? 120 : 35;

		setTimeout(() => {
			const doc = getIframeDocument(state.readerIframe);
			const selection = doc?.getSelection?.();
			const selectedText = getActiveSelectionText(doc);

			if (selection && selectedText.length > 0) {
				if (state.pendingMobileSelectionCheck) {
					clearTimeout(state.pendingMobileSelectionCheck);
					state.pendingMobileSelectionCheck = null;
				}
				showSelectionPopup(selection);
				return;
			}

			if (!isMobileViewport()) {
				hideSelectionPopup();
				return;
			}

			scheduleMobileSelectionProbe();
		}, delay);
	}

	function startMobileSelectionPoll() {
		stopMobileSelectionPoll();
		if (!isMobileViewport()) return;

		state.mobileSelectionPoll = setInterval(() => {
			const doc = getIframeDocument(state.readerIframe);
			const selection = doc?.getSelection?.();
			const selectedText = getActiveSelectionText(doc);

			if (selection && selectedText.length > 0) {
				showSelectionPopup(selection);
				return;
			}

			hideSelectionPopup();
		}, 180);
	}

	function setupIframeSelectionListener() {
		const doc = getIframeDocument(state.readerIframe);
		if (!doc?.documentElement) return;
		if (doc.documentElement.dataset.rlSelectionBound === "1") return;

		doc.documentElement.dataset.rlSelectionBound = "1";
		doc.addEventListener("mouseup", handleIframeSelection);
		doc.addEventListener("touchend", handleIframeSelection);
		doc.addEventListener("touchcancel", handleIframeSelection);
		doc.addEventListener("selectionchange", handleIframeSelection);
		doc.addEventListener("pointerup", handleIframeSelection);
		doc.addEventListener("selectstart", scheduleMobileSelectionProbe);
		doc.addEventListener("contextmenu", scheduleMobileSelectionProbe);
		doc.addEventListener("pointerdown", () => {
			setTimeout(handleIframeSelection, 50);
		});
		doc.addEventListener("keydown", (event) => {
			if (shouldIgnoreKeyboardShortcut(event)) return;
			const key = event.key.toLowerCase();
			if (key === "o") {
				event.preventDefault();
				readerApi.openReaderOriginal?.();
				return;
			}
			if (key === "h") {
				event.preventDefault();
				readerApi.toggleReaderSidebar?.();
			}
		});
		startMobileSelectionPoll();
	}

	function openNoteModal(selectedText) {
		if (!dom.noteModal || !dom.noteModalQuote || !dom.noteModalText) return;

		dom.noteModalQuote.textContent = selectedText;
		dom.noteModalText.value = "";
		dom.noteModal.style.display = "flex";
		if (!isMobileViewport()) {
			dom.noteModalText.focus();
		}
	}

	function closeNoteModal() {
		if (!dom.noteModal || !dom.noteModalQuote || !dom.noteModalText) return;

		dom.noteModal.style.display = "none";
		dom.noteModalQuote.textContent = "";
		dom.noteModalText.value = "";
	}

	function renderAllHighlights(highlights) {
		if (!dom.notesList) return;

		if (highlights.length === 0) {
			dom.notesList.replaceChildren(
				createEmptyState(
					"No highlights yet",
					"Select text while reading to save highlights and notes",
				),
			);
			return;
		}

		dom.notesList.replaceChildren(...highlights.map(createHighlightCard));
	}

	return {
		clearIframeSelection,
		closeNoteModal,
		hideSelectionPopup,
		openNoteModal,
		renderAllHighlights,
		renderSidebarHighlights,
		scheduleApplyHighlightsToDocument,
		scrollToHighlight,
		setupIframeSelectionListener,
		stopMobileSelectionPoll,
	};
}
