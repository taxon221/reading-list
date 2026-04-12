import { createReaderHighlightUi } from "./reader-highlight-ui.js";
import {
	dom,
	handleAuthFailure,
	showUnauthorizedState,
	state,
} from "./shared.js";
import { createEmptyState } from "./utils.js";

export function initReaderHighlights(app, readerApi) {
	const highlightUi = createReaderHighlightUi(readerApi);

	async function loadHighlights(itemId) {
		const response = await fetch(`/api/items/${itemId}/highlights`).catch(
			() => null,
		);
		if (response && handleAuthFailure(response)) {
			state.currentHighlights = [];
			highlightUi.renderSidebarHighlights();
			return;
		}

		state.currentHighlights = response?.ok ? await response.json() : [];
		highlightUi.renderSidebarHighlights();
	}

	async function loadAllHighlights() {
		const response = await fetch("/api/highlights").catch(() => null);
		if (!response) {
			state.allHighlights = [];
			if (dom.notesList) {
				dom.notesList.replaceChildren(
					createEmptyState("Failed to load highlights"),
				);
			}
			return;
		}

		if (handleAuthFailure(response)) {
			state.allHighlights = [];
			return;
		}

		state.allHighlights = response.ok ? await response.json() : [];
		highlightUi.renderAllHighlights(state.allHighlights);
	}

	async function updateHighlightNote(highlightId, note) {
		const response = await fetch(`/api/highlights/${highlightId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ note }),
		}).catch(() => null);
		if (response && handleAuthFailure(response)) return false;
		return Boolean(response?.ok);
	}

	async function deleteHighlight(highlightId) {
		const response = await fetch(`/api/highlights/${highlightId}`, {
			method: "DELETE",
		}).catch(() => null);
		if (response && handleAuthFailure(response)) return false;
		return Boolean(response?.ok);
	}

	dom.sidebarHighlights?.addEventListener("click", async (event) => {
		const actionEl = event.target.closest("[data-action]");
		if (!actionEl) return;

		const highlightId = Number(actionEl.dataset.id);
		if (!highlightId) return;

		if (actionEl.dataset.action === "scroll-highlight") {
			highlightUi.scrollToHighlight(highlightId);
			return;
		}

		const highlight = state.currentHighlights.find(
			(item) => item.id === highlightId,
		);
		if (!highlight) return;

		if (actionEl.dataset.action === "edit-highlight") {
			const newNote = prompt("Edit note:", highlight.note || "");
			if (newNote === null) return;
			if (await updateHighlightNote(highlightId, newNote)) {
				loadHighlights(state.currentReaderId);
				loadAllHighlights();
			}
			return;
		}

		if (actionEl.dataset.action === "delete-highlight") {
			if (!confirm("Delete this highlight?")) return;
			if (await deleteHighlight(highlightId)) {
				loadHighlights(state.currentReaderId);
				loadAllHighlights();
			}
		}
	});

	dom.popupHighlightBtn?.addEventListener("click", () => {
		if (!state.pendingSelectionText) return;
		highlightUi.openNoteModal(state.pendingSelectionText);
		highlightUi.hideSelectionPopup();
	});

	dom.noteModalClose?.addEventListener("click", highlightUi.closeNoteModal);
	dom.noteModalCancel?.addEventListener("click", highlightUi.closeNoteModal);
	dom.noteModal?.addEventListener("click", (event) => {
		if (event.target === dom.noteModal) highlightUi.closeNoteModal();
	});

	dom.noteModalSave?.addEventListener("click", async () => {
		if (state.isUnauthorized) {
			highlightUi.closeNoteModal();
			showUnauthorizedState(state.authMessage);
			return;
		}
		if (!state.currentReaderId || !state.pendingSelectionText) return;

		const response = await fetch(
			`/api/items/${state.currentReaderId}/highlights`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					selected_text: state.pendingSelectionText,
					note: dom.noteModalText?.value.trim() || "",
				}),
			},
		).catch(() => null);
		if (response && handleAuthFailure(response)) return;
		if (!response?.ok) return;

		highlightUi.closeNoteModal();
		highlightUi.clearIframeSelection();
		highlightUi.hideSelectionPopup();
		await loadHighlights(state.currentReaderId);
		highlightUi.scheduleApplyHighlightsToDocument();
		if (dom.notesView?.style.display !== "none") {
			loadAllHighlights();
		}
	});

	dom.notesList?.addEventListener("click", async (event) => {
		const actionEl = event.target.closest("[data-action]");
		if (!actionEl) return;

		const highlightId = Number(actionEl.dataset.id);
		if (actionEl.dataset.action === "open-highlight-reader") {
			event.preventDefault();
			app.openReader?.(
				Number(actionEl.dataset.itemId),
				actionEl.dataset.itemUrl || "",
				actionEl.dataset.itemTitle || "",
				actionEl.dataset.itemType || "article",
			);
			return;
		}

		if (actionEl.dataset.action === "open-at-highlight") {
			event.preventDefault();
			state.pendingScrollHighlightId = highlightId;
			app.openReader?.(
				Number(actionEl.dataset.itemId),
				actionEl.dataset.itemUrl || "",
				actionEl.dataset.itemTitle || "",
				actionEl.dataset.itemType || "article",
			);
			return;
		}

		if (!highlightId) return;
		const highlight = state.allHighlights.find(
			(item) => item.id === highlightId,
		);
		if (!highlight) return;

		if (actionEl.dataset.action === "edit-highlight-list") {
			const newNote = prompt("Edit note:", highlight.note || "");
			if (newNote === null) return;
			if (await updateHighlightNote(highlightId, newNote)) {
				if (state.currentReaderId === highlight.item_id) {
					loadHighlights(highlight.item_id);
				}
				loadAllHighlights();
			}
			return;
		}

		if (actionEl.dataset.action === "delete-highlight-list") {
			if (!confirm("Delete this highlight?")) return;
			if (await deleteHighlight(highlightId)) {
				if (state.currentReaderId === highlight.item_id) {
					loadHighlights(highlight.item_id);
					highlightUi.scheduleApplyHighlightsToDocument();
				}
				loadAllHighlights();
			}
		}
	});

	return {
		closeNoteModal: highlightUi.closeNoteModal,
		hideSelectionPopup: highlightUi.hideSelectionPopup,
		loadAllHighlights,
		loadHighlights,
		scheduleApplyHighlightsToDocument:
			highlightUi.scheduleApplyHighlightsToDocument,
		setupIframeSelectionListener: highlightUi.setupIframeSelectionListener,
		stopMobileSelectionPoll: highlightUi.stopMobileSelectionPoll,
	};
}
