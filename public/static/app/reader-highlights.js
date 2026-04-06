import { dom, handleAuthFailure, showUnauthorizedState, state } from "./shared.js";
import {
  createEmptyState,
  formatDate,
  getIframeDocument,
  isMobileViewport,
  shouldIgnoreKeyboardShortcut,
} from "./utils.js";

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
  const wrapper = document.createElement("div");
  wrapper.className = "sidebar-highlight";
  wrapper.dataset.id = String(highlight.id);

  const quote = document.createElement("div");
  quote.className = "sidebar-highlight-quote";
  quote.dataset.action = "scroll-highlight";
  quote.dataset.id = String(highlight.id);
  quote.textContent = truncateText(highlight.selected_text);

  const actions = document.createElement("div");
  actions.className = "sidebar-highlight-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "sidebar-highlight-btn";
  editButton.dataset.action = "edit-highlight";
  editButton.dataset.id = String(highlight.id);
  editButton.textContent = "Edit";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "sidebar-highlight-btn delete";
  deleteButton.dataset.action = "delete-highlight";
  deleteButton.dataset.id = String(highlight.id);
  deleteButton.textContent = "Delete";

  actions.append(editButton, deleteButton);
  wrapper.append(quote);

  if (highlight.note) {
    const note = document.createElement("div");
    note.className = "sidebar-highlight-note";
    note.textContent = highlight.note;
    wrapper.appendChild(note);
  }

  wrapper.appendChild(actions);
  return wrapper;
}

function renderSidebarHighlights() {
  if (!dom.sidebarHighlights || !dom.highlightsCount) return;

  if (state.currentHighlights.length === 0) {
    dom.highlightsCount.textContent = "";
    dom.sidebarHighlights.replaceChildren(
      createEmptyState("No highlights yet", "Select text to highlight", "sidebar-empty"),
    );
    return;
  }

  dom.highlightsCount.textContent = `(${state.currentHighlights.length})`;
  dom.sidebarHighlights.replaceChildren(
    ...state.currentHighlights.map(createSidebarHighlight),
  );
}

function highlightTextInDocument(doc, text, highlightId = null) {
  const normalizedSearch = (text || "").replace(/\u00a0/g, " ").trim();
  if (!normalizedSearch) return;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodeData = [];
  let combined = "";
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const norm = (n.textContent || "").replace(/\u00a0/g, " ");
    nodeData.push({ node: n, normStart: combined.length, normLength: norm.length });
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
    .filter(e => e.normStart < matchEnd && e.normStart + e.normLength > matchStart)
    .map(e => ({
      node: e.node,
      start: Math.max(0, matchStart - e.normStart),
      end: Math.min(e.normLength, matchEnd - e.normStart),
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
  for (const p of highlightParents) p.normalize();

  for (const highlight of state.currentHighlights) {
    highlightTextInDocument(doc, highlight.selected_text, highlight.id);
  }
}

function applyAndMaybeScroll() {
  applyHighlightsToDocument();
  if (!state.pendingScrollHighlightId) return;
  const id = state.pendingScrollHighlightId;
  const doc = getIframeDocument(state.readerIframe);
  if (!doc?.querySelector(`[data-highlight-id="${id}"]`)) return;
  scrollToHighlight(id);
}

function scheduleApplyHighlightsToDocument() {
  applyAndMaybeScroll();
  if (state.currentHighlights.length === 0) return;

  for (const ms of [80, 200, 450, 900, 1600]) {
    setTimeout(applyAndMaybeScroll, ms);
  }

  if (state.pendingScrollHighlightId) {
    setTimeout(() => { state.pendingScrollHighlightId = null; }, 500);
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
  doc.querySelectorAll(`[data-highlight-id="${highlightId}"]`).forEach(el => {
    el.style.backgroundColor = "color-mix(in srgb, var(--rl-reader-accent, #c46d23) 58%, transparent)";
    setTimeout(() => { el.style.backgroundColor = ""; }, 1000);
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
  if (!dom.selectionPopup || dom.selectionPopup.style.display === "none") return;
  if (state.mobilePopupDismissTimer) clearTimeout(state.mobilePopupDismissTimer);

  state.mobilePopupDismissTimer = setTimeout(() => {
    state.mobilePopupDismissTimer = null;
    if (!dom.selectionPopup || dom.selectionPopup.style.display === "none") {
      return;
    }
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

function setupIframeSelectionListener(readerApi) {
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
    const k = event.key.toLowerCase();
    if (k === "o") {
      event.preventDefault();
      readerApi.openReaderOriginal?.();
      return;
    }
    if (k === "h") {
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

function createHighlightCard(highlight) {
  const card = document.createElement("div");
  card.className = "highlight-card";
  card.dataset.id = String(highlight.id);

  const header = document.createElement("div");
  header.className = "highlight-card-header";

  const source = document.createElement("div");
  source.className = "highlight-card-source";

  const link = document.createElement("a");
  link.href = "#";
  link.dataset.action = "open-highlight-reader";
  link.dataset.itemId = String(highlight.item_id);
  link.dataset.itemUrl = highlight.item_url || "";
  link.dataset.itemTitle = highlight.item_title || "";
  link.dataset.itemType = highlight.item_type || "article";
  link.textContent = highlight.item_title || "Untitled";

  const date = document.createElement("span");
  date.className = "highlight-card-date";
  date.textContent = formatDate(highlight.created_at);

  const quote = document.createElement("div");
  quote.className = "highlight-card-quote";
  quote.textContent = highlight.selected_text;
  quote.dataset.action = "open-at-highlight";
  quote.dataset.id = String(highlight.id);
  quote.dataset.itemId = String(highlight.item_id);
  quote.dataset.itemUrl = highlight.item_url || "";
  quote.dataset.itemTitle = highlight.item_title || "";
  quote.dataset.itemType = highlight.item_type || "article";

  const actions = document.createElement("div");
  actions.className = "highlight-card-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "highlight-card-btn";
  editButton.dataset.action = "edit-highlight-list";
  editButton.dataset.id = String(highlight.id);
  editButton.textContent = "Edit Note";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "highlight-card-btn delete";
  deleteButton.dataset.action = "delete-highlight-list";
  deleteButton.dataset.id = String(highlight.id);
  deleteButton.textContent = "Delete";

  source.appendChild(link);
  header.append(source, date);
  actions.append(editButton, deleteButton);
  card.append(header, quote);

  if (highlight.note) {
    const note = document.createElement("div");
    note.className = "highlight-card-note";
    note.textContent = highlight.note;
    card.appendChild(note);
  }

  card.appendChild(actions);
  return card;
}

export function initReaderHighlights(app, readerApi) {
  async function loadHighlights(itemId) {
    const response = await fetch(`/api/items/${itemId}/highlights`).catch(
      () => null,
    );
    if (response && handleAuthFailure(response)) {
      state.currentHighlights = [];
      renderSidebarHighlights();
      return;
    }

    state.currentHighlights = response?.ok ? await response.json() : [];
    renderSidebarHighlights();
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

  async function loadAllHighlights() {
    const response = await fetch("/api/highlights").catch(() => null);
    if (!response) {
      state.allHighlights = [];
      if (dom.notesList) {
        dom.notesList.replaceChildren(createEmptyState("Failed to load highlights"));
      }
      return;
    }

    if (handleAuthFailure(response)) {
      state.allHighlights = [];
      return;
    }

    state.allHighlights = response.ok ? await response.json() : [];
    renderAllHighlights(state.allHighlights);
  }

  dom.sidebarHighlights?.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const highlightId = Number(actionEl.dataset.id);
    if (!highlightId) return;

    if (actionEl.dataset.action === "scroll-highlight") {
      scrollToHighlight(highlightId);
      return;
    }

    const highlight = state.currentHighlights.find((item) => item.id === highlightId);
    if (!highlight) return;

    if (actionEl.dataset.action === "edit-highlight") {
      const newNote = prompt("Edit note:", highlight.note || "");
      if (newNote === null) return;

      const response = await fetch(`/api/highlights/${highlightId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      }).catch(() => null);
      if (response && handleAuthFailure(response)) return;
      if (!response?.ok) return;

      highlight.note = newNote;
      renderSidebarHighlights();
      return;
    }

    if (actionEl.dataset.action === "delete-highlight") {
      if (!confirm("Delete this highlight?")) return;

      const response = await fetch(`/api/highlights/${highlightId}`, {
        method: "DELETE",
      }).catch(() => null);
      if (response && handleAuthFailure(response)) return;
      if (!response?.ok) return;

      state.currentHighlights = state.currentHighlights.filter(
        (item) => item.id !== highlightId,
      );
      renderSidebarHighlights();
      applyHighlightsToDocument();
    }
  });

  dom.notesList?.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    if (actionEl.dataset.action === "open-highlight-reader") {
      event.preventDefault();
      app.showView?.("reading-list");
      await readerApi.openReader?.(
        Number(actionEl.dataset.itemId),
        actionEl.dataset.itemUrl || "",
        actionEl.dataset.itemTitle || "",
        actionEl.dataset.itemType || "article",
      );
      return;
    }

    if (actionEl.dataset.action === "open-at-highlight") {
      event.preventDefault();
      const highlightId = Number(actionEl.dataset.id);
      state.pendingScrollHighlightId = highlightId;
      app.showView?.("reading-list");
      await readerApi.openReader?.(
        Number(actionEl.dataset.itemId),
        actionEl.dataset.itemUrl || "",
        actionEl.dataset.itemTitle || "",
        actionEl.dataset.itemType || "article",
      );
      return;
    }

    const highlightId = Number(actionEl.dataset.id);
    const highlight = state.allHighlights.find((item) => item.id === highlightId);
    if (!highlight) return;

    if (actionEl.dataset.action === "edit-highlight-list") {
      const newNote = prompt("Edit note:", highlight.note || "");
      if (newNote === null) return;

      const response = await fetch(`/api/highlights/${highlightId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote }),
      }).catch(() => null);
      if (response && handleAuthFailure(response)) return;
      if (!response?.ok) return;

      highlight.note = newNote;
      renderAllHighlights(state.allHighlights);
      return;
    }

    if (actionEl.dataset.action === "delete-highlight-list") {
      if (!confirm("Delete this highlight?")) return;

      const response = await fetch(`/api/highlights/${highlightId}`, {
        method: "DELETE",
      }).catch(() => null);
      if (response && handleAuthFailure(response)) return;
      if (!response?.ok) return;

      state.allHighlights = state.allHighlights.filter(
        (item) => item.id !== highlightId,
      );
      renderAllHighlights(state.allHighlights);
    }
  });

  dom.popupHighlightBtn?.addEventListener("click", () => {
    if (!state.pendingSelectionText) return;

    openNoteModal(state.pendingSelectionText);
    clearIframeSelection();
    hideSelectionPopup();
  });

  dom.noteModalClose?.addEventListener("click", closeNoteModal);
  dom.noteModalCancel?.addEventListener("click", closeNoteModal);
  dom.noteModal?.addEventListener("click", (event) => {
    if (event.target === dom.noteModal) closeNoteModal();
  });

  dom.noteModalSave?.addEventListener("click", async () => {
    if (!state.currentReaderId || !dom.noteModalQuote?.textContent) return;
    if (state.isUnauthorized) {
      showUnauthorizedState(state.authMessage);
      return;
    }

    const response = await fetch(
      `/api/items/${state.currentReaderId}/highlights`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_text: dom.noteModalQuote.textContent,
          note: dom.noteModalText?.value.trim() || "",
        }),
      },
    ).catch(() => null);

    if (response && handleAuthFailure(response)) return;
    if (!response?.ok) {
      alert("Failed to save highlight. Please try again.");
      return;
    }

    const highlight = await response.json();
    state.currentHighlights.push(highlight);
    renderSidebarHighlights();
    applyHighlightsToDocument();
    readerApi.setReaderSidebarOpen?.(true);
    closeNoteModal();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!isMobileViewport()) return;
      if (!dom.selectionPopup || dom.selectionPopup.style.display === "none") {
        return;
      }
      if (dom.noteModal && dom.noteModal.style.display !== "none") return;
      if (dom.selectionPopup.contains(event.target)) return;
      hideSelectionPopup();
      clearIframeSelection();
    },
    true,
  );

  app.loadAllHighlights = loadAllHighlights;

  return {
    scheduleApplyHighlightsToDocument,
    closeNoteModal,
    hideSelectionPopup,
    loadAllHighlights,
    loadHighlights,
    renderSidebarHighlights,
    setupIframeSelectionListener: () => setupIframeSelectionListener(readerApi),
    stopMobileSelectionPoll,
  };
}
