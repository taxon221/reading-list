import { DELETE_TYPE_VALUES } from "./list-constants.js";
import { initListDelete, invalidateListDeleteFacets } from "./list-delete.js";
import { createListEditing } from "./list-edit.js";
import { createListFilters } from "./list-filters.js";
import { createListRenderer } from "./list-render.js";
import { createSavedViews, getCurrentFilters } from "./list-saved-views.js";
import { initListSearch, syncListSearchUi } from "./list-search.js";
import { dom, handleAuthFailure, state } from "./shared.js";
import { shouldIgnoreKeyboardShortcut } from "./utils.js";

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

export function initList(app) {
	const filters = createListFilters({ refreshList });
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
	app.loadSavedViews = savedViews.loadSavedViews;
	app.loadTags = loadTags;
	app.showView = showView;
	app.closeEditModal = editing.closeEditModal;
	app.openEditModal = editing.openEditModal;
	app.closeItemMenu = editing.closeItemMenu;

	function renderCurrentItems() {
		renderer.renderItems(
			filters.applyClientFilters(Array.from(state.itemsById.values())),
		);
	}

	function syncFilterUi() {
		filters.syncTypeInputs();
		filters.updateTypeFilterDisplay();
		filters.updateTagDropdownState();
		filters.updateTagFilterDisplay();
		filters.renderFilterChips();
		syncListSearchUi(DELETE_TYPE_VALUES);
		savedViews.syncActiveSavedView();
	}

	function refreshList({ reloadServer = false } = {}) {
		syncFilterUi();
		if (reloadServer) {
			loadItems();
			return;
		}
		renderCurrentItems();
	}

	async function loadItems() {
		if (state.isUnauthorized) return;

		const filtersState = getCurrentFilters();
		const params = new URLSearchParams();
		if (filtersState.selectedTags.length > 0)
			params.set("tags", filtersState.selectedTags.join(","));
		if (filtersState.excludedTags.length > 0) {
			params.set("exclude_tags", filtersState.excludedTags.join(","));
		}
		if (filtersState.selectedTypes.length > 0)
			params.set("types", filtersState.selectedTypes.join(","));

		const url = `/api/items${params.toString() ? `?${params.toString()}` : ""}`;
		const response = await fetch(url).catch(() => null);
		if (!response) return;
		if (handleAuthFailure(response)) return;
		if (!response.ok) return;

		const items = await response.json();
		state.itemsById = new Map(items.map((item) => [Number(item.id), item]));
		syncFilterUi();
		renderer.renderItems(filters.applyClientFilters(items));
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
				refreshList({ reloadServer: true });
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
			dom.urlInput?.focus();
		}
	});
}
