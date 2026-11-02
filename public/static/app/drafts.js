import { dom, state } from "./shared.js";
const database = new Promise((resolve, reject) => {
	const request = indexedDB.open("reading-list-private", 1);
	request.onupgradeneeded = () => request.result.createObjectStore("drafts");
	request.onsuccess = () => resolve(request.result);
	request.onerror = () => reject(request.error);
}).catch(() => null);
function owner() {
	return state.authUi.currentUser?.email || "guest";
}
async function access(mode, operation) {
	try {
		const db = await database;
		if (!db) return null;
		return await new Promise((resolve, reject) => {
			const tx = db.transaction("drafts", mode);
			const request = operation(tx.objectStore("drafts"));
			tx.oncomplete = () => resolve(request?.result);
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		return null;
	}
}
export function saveDraft() {
	const key = owner();
	const record = {
		owner: key,
		saved: Date.now(),
		url: dom.urlInput?.value || "",
		title: dom.titleInput?.value || "",
		author: dom.authorInput?.value || "",
		type: dom.typeSelect?.value || "article",
		tags: [...state.pendingTags],
		mode: state.addMode,
		file: state.pendingUploadFile,
		note: dom.noteModalText?.value || "",
		quote: state.pendingSelectionText,
		itemId: state.currentReaderId,
		highlightId: state.editingHighlightId,
	};
	if (!record.url && !record.file && !record.note) return;
	return access("readwrite", (store) => store.put(record, key));
}
export function clearDraft() {
	return access("readwrite", (store) => store.delete(owner()));
}
export async function restoreDraft(app) {
	let draft = await access("readonly", (store) => store.get(owner()));
	if (!draft && state.authUi.currentUser) {
		draft = await access("readonly", (store) => store.get("guest"));
		if (draft) await access("readwrite", (store) => store.delete("guest"));
	}
	if (!draft || Date.now() - draft.saved > 86400000) return;
	if (draft.url || draft.file) {
		app.openAddModal?.(draft.mode || "link");
		dom.urlInput.value = draft.url;
		dom.titleInput.value = draft.title;
		dom.authorInput.value = draft.author;
		dom.typeSelect.value = draft.type;
		state.pendingTags.splice(
			0,
			state.pendingTags.length,
			...(draft.tags || []),
		);
		state.pendingUploadFile = draft.file || null;
		if (draft.file) {
			dom.addFileSummary.hidden = false;
			dom.addFileSummary.textContent = draft.file.name;
		}
		const { renderTagPills } = await import("./utils.js");
		renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);
	}
	if (draft.note) {
		const note = document.getElementById("recovered-note");
		note.hidden = false;
		note.querySelector("textarea").value = draft.note;
		document.getElementById("restore-note").onclick = async () => {
			const response = await fetch(`/api/items/${draft.itemId}`);
			if (!response.ok) return;
			const item = await response.json();
			state.currentReaderId = item.id;
			state.pendingSelectionText = draft.quote;
			state.editingHighlightId = draft.highlightId;
			dom.noteModalQuote.textContent = draft.quote || "";
			dom.noteModalText.value = note.querySelector("textarea").value;
			dom.noteModal.style.display = "flex";
			note.hidden = true;
		};
	}
}
export function initDrafts() {
	void access("readwrite", (store) => {
		const request = store.openCursor();
		request.onsuccess = () => {
			const cursor = request.result;
			if (cursor) {
				if (Date.now() - cursor.value.saved > 86400000) cursor.delete();
				cursor.continue();
			}
		};
		return request;
	});
	dom.form?.addEventListener("input", () => {
		void saveDraft();
	});
	dom.noteModalText?.addEventListener("input", () => {
		void saveDraft();
	});
	window.addEventListener("pagehide", () => {
		void saveDraft();
	});
}
