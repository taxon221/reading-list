import { DELETE_TYPE_VALUES } from "./list-constants.js";
import { initListDelete, invalidateListDeleteFacets } from "./list-delete.js";
import { createListEditing } from "./list-edit.js";
import { createListFilters } from "./list-filters.js";
import { createListRenderer } from "./list-render.js";
import { createSavedViews } from "./list-saved-views.js";
import { initListSearch, syncListSearchUi } from "./list-search.js";
import { dom, handleAuthFailure, state } from "./shared.js";
import { shouldIgnoreKeyboardShortcut } from "./utils.js";
import {
	captureProgressSnapshot,
	mergePendingProgress,
} from "./reader-progress.js";

function showView(view) {
	dom.viewTabs.forEach((tab) => {
		tab.classList.toggle("active", tab.dataset.view === view);
	});

	if (dom.readingListView) {
		dom.readingListView.style.display = view === "reading-list" ? "" : "none";
	}
	if (dom.notesView) {
		dom.notesView.style.display = view === "notes" ? "" : "none";
	}
}

const READ_STATUS_KEY = "reading-list-read-status";
const READ_STATUSES = ["all", "unread", "in-progress"];

function setReadStatus(status) {
	state.readStatus = status;
	try {
		localStorage.setItem(READ_STATUS_KEY, status);
	} catch {}
}

export function initList(app) {
	const filters = createListFilters({ refreshList });
	try {
		const saved = localStorage.getItem(READ_STATUS_KEY);
		if (READ_STATUSES.includes(saved)) state.readStatus = saved;
	} catch {}
	document.querySelectorAll("[data-status]").forEach((button) => {
		button.addEventListener("click", () => {
			setReadStatus(button.dataset.status);
			state.activeSavedViewIds = [];
			refreshList();
		});
	});
	window.addEventListener("reading:clear-filters", () => {
		for (const key of [
			"selectedTypes",
			"selectedTags",
			"excludedTags",
			"selectedDomains",
			"excludedDomains",
			"selectedAuthors",
			"excludedAuthors",
			"searchTokens",
			"activeSavedViewIds",
		])
			state[key] = [];
		state.searchQuery = "";
		setReadStatus("all");
		if (dom.searchInput) dom.searchInput.value = "";
		refreshList();
	});
	window.addEventListener("reading:add", () => app.openAddModal?.("link"));
	const renderer = createListRenderer({
		onToggleInclude: filters.toggleInclude,
		onToggleExclude: filters.toggleExclude,
	});
	const savedViews = createSavedViews({
		closeAllDropdowns: filters.closeAllDropdowns,
		refreshList,
	});
	const editing = createListEditing({
		app,
		loadItems,
		loadTags,
		filterByTag: filters.filterByTag,
	});

	app.loadItems = loadItems;
	app.refreshList = refreshList;
	app.refreshReaderItem = (id) => {
		const item = state.itemsById.get(Number(id));
		if (!item) return;
		const existing = dom.itemsList?.querySelector(
			`.item[data-id="${Number(id)}"]`,
		);
		const visible = filters.applyClientFilters([item]).length > 0;
		if (existing && visible) renderer.updateItem(item);
		else if (existing) {
			existing.remove();
			if (!dom.itemsList.querySelector(".item")) renderCurrentItems();
		} else if (visible) renderCurrentItems();
	};
	app.loadSavedViews = savedViews.loadSavedViews;
	app.loadTags = loadTags;
	app.showView = showView;
	app.closeEditModal = editing.closeEditModal;
	app.openEditModal = editing.openEditModal;
	app.closeItemMenu = editing.closeItemMenu;

	function renderCurrentItems() {
		renderer.renderItems(
			filters.applyClientFilters(Array.from(state.itemsById.values())),
			{ empty: state.itemsById.size === 0 },
		);
	}

	function syncFilterUi() {
		document.querySelectorAll("[data-status]").forEach((button) => {
			button.setAttribute(
				"aria-pressed",
				String(button.dataset.status === state.readStatus),
			);
		});
		filters.syncTypeInputs();
		filters.updateTypeFilterDisplay();
		filters.updateTagDropdownState();
		filters.updateTagFilterDisplay();
		filters.renderFilterChips();
		syncListSearchUi(DELETE_TYPE_VALUES);
		savedViews.syncActiveSavedView();
	}

	// Filters apply to the loaded library, so changing them never refetches it.
	function refreshList() {
		syncFilterUi();
		renderCurrentItems();
	}

	let loadSequence = 0;
	async function loadItems() {
		if (state.isUnauthorized) return;
		const sequence = ++loadSequence;

		const url = "/api/items";
		const progressSnapshot = captureProgressSnapshot();
		const status = document.getElementById("library-status");
		status.textContent = "Loading your library…";
		const response = await fetch(url).catch(() => null);
		if (!response || (!response.ok && ![401, 403].includes(response.status))) {
			status.replaceChildren(
				document.createTextNode("Couldn't load your library. "),
			);
			const retry = document.createElement("button");
			retry.className = "header-link";
			retry.textContent = "Try again";
			retry.onclick = loadItems;
			status.append(retry);
			return;
		}
		if (handleAuthFailure(response)) {
			status.textContent = "";
			return;
		}
		let items;
		try {
			items = await response.json();
		} catch {
			status.textContent = "Couldn't load your library. Please try again.";
			return;
		}
		// A newer load started meanwhile; its response is fresher than this one.
		if (
			sequence !== loadSequence ||
			progressSnapshot.account !== (state.authUi.currentUser?.email || "guest")
		)
			return;
		items = mergePendingProgress(items, progressSnapshot);
		status.textContent = "";
		state.itemsById = new Map(items.map((item) => [Number(item.id), item]));
		syncFilterUi();
		renderer.renderItems(filters.applyClientFilters(items), {
			empty: items.length === 0,
		});
		window.dispatchEvent(new Event("reading:library-loaded"));
	}

	async function loadTags() {
		if (state.isUnauthorized) return;

		const response = await fetch("/api/tags").catch(() => null);
		if (!response) return;
		if (handleAuthFailure(response)) return;
		if (!response.ok) return;

		const tags = await response.json();
		state.availableTags = tags
			.map((tag) =>
				String(tag?.name || "")
					.trim()
					.toLowerCase(),
			)
			.filter(Boolean);
		invalidateListDeleteFacets();
		renderer.renderTagOptions(tags, {
			selectedTags: state.selectedTags,
			excludedTags: state.excludedTags,
			onToggleTagState(tagName, nextState) {
				state.selectedTags = state.selectedTags.filter(
					(tag) => tag !== tagName,
				);
				state.excludedTags = state.excludedTags.filter(
					(tag) => tag !== tagName,
				);
				if (nextState === "include") state.selectedTags.push(tagName);
				if (nextState === "exclude") state.excludedTags.push(tagName);
				refreshList();
			},
		});
		filters.updateTagFilterDisplay();
		savedViews.syncActiveSavedView();
	}

	function initViewTabs() {
		dom.viewTabs.forEach((tab) => {
			tab.addEventListener("click", () => {
				const view = tab.dataset.view || "reading-list";
				showView(view);
				if (view === "notes") {
					app.loadAllHighlights?.();
				}
			});
		});
	}

	filters.initDropdowns();
	savedViews.initSavedViews();
	initListSearch({
		onChange: () => {
			renderCurrentItems();
			savedViews.syncActiveSavedView();
		},
		typeValues: DELETE_TYPE_VALUES,
	});
	initViewTabs();
	editing.initItemMenu();
	editing.initItemsList();
	editing.initEditModal();
	syncFilterUi();

	initListDelete({
		closeAllDropdowns: filters.closeAllDropdowns,
		loadItems,
		loadTags,
		typeValues: DELETE_TYPE_VALUES,
	});
	syncListSearchUi(DELETE_TYPE_VALUES);

	function listShortcutsBlocked() {
		if (dom.readerModal && dom.readerModal.style.display !== "none")
			return true;
		if (dom.noteModal && dom.noteModal.style.display !== "none") return true;
		if (dom.editModal && dom.editModal.style.display !== "none") return true;
		if (dom.addModal && dom.addModal.style.display !== "none") return true;
		if (dom.saveViewModal && dom.saveViewModal.style.display !== "none")
			return true;
		if (dom.accountModalOverlay && !dom.accountModalOverlay.hidden) return true;
		return false;
	}

	document.addEventListener("keydown", (event) => {
		const key = event.key.toLowerCase();
		if (key !== "s" && key !== "a") return;
		if (shouldIgnoreKeyboardShortcut(event)) return;
		if (listShortcutsBlocked()) return;
		if (state.isUnauthorized) return;

		event.preventDefault();
		showView("reading-list");
		if (key === "s") {
			dom.searchInput?.focus();
		} else {
			app.openAddModal?.("link");
		}
	});
}
