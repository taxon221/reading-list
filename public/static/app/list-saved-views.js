import {
	DELETE_TYPE_VALUES,
	LEGACY_SAVED_VIEWS_STORAGE_KEY,
} from "./list-constants.js";
import { dom, handleAuthFailure, state } from "./shared.js";

const BUILT_IN_VIEWS = Object.freeze([
	{
		id: "builtin-unread",
		name: "Unread",
		filters: { readStatus: "unread" },
	},
	{
		id: "builtin-read",
		name: "Read",
		filters: { readStatus: "read" },
	},
]);

function normalizeViewName(value) {
	return String(value || "")
		.replace(/\s+/g, " ")
		.trim();
}

function sanitizeStringArray(values, { lowercase = false } = {}) {
	if (!Array.isArray(values)) return [];

	const seen = new Set();
	const result = [];

	values.forEach((value) => {
		const trimmed = String(value || "").trim();
		if (!trimmed) return;

		const normalized = lowercase ? trimmed.toLowerCase() : trimmed;
		const key = normalized.toLowerCase();
		if (seen.has(key)) return;

		seen.add(key);
		result.push(normalized);
	});

	return result;
}

function sanitizeSearchToken(token) {
	if (!token || typeof token !== "object") return null;

	if (token.kind === "text") {
		const value = String(token.value || "")
			.replace(/\s+/g, " ")
			.trim();
		return value ? { kind: "text", value } : null;
	}

	if (token.kind !== "field") return null;

	const field = String(token.field || "")
		.trim()
		.toLowerCase();
	const operator = String(token.operator || "")
		.trim()
		.toLowerCase();
	const value = String(token.value || "")
		.replace(/\s+/g, " ")
		.trim();

	if (!field || !operator || !value) return null;
	return { kind: "field", field, operator, value };
}

function sanitizeSavedViewFilters(filters = {}) {
	const readStatus =
		filters.readStatus === "read" || filters.readStatus === "unread"
			? filters.readStatus
			: "all";
	const selectedTypes = sanitizeStringArray(filters.selectedTypes, {
		lowercase: true,
	}).filter((value) => DELETE_TYPE_VALUES.includes(value));
	const selectedTags = sanitizeStringArray(filters.selectedTags, {
		lowercase: true,
	});
	const excludedTags = sanitizeStringArray(filters.excludedTags, {
		lowercase: true,
	}).filter((value) => !selectedTags.includes(value));
	const selectedDomains = sanitizeStringArray(filters.selectedDomains, {
		lowercase: true,
	});
	const excludedDomains = sanitizeStringArray(filters.excludedDomains, {
		lowercase: true,
	}).filter((value) => !selectedDomains.includes(value));
	const selectedAuthors = sanitizeStringArray(filters.selectedAuthors);
	const selectedAuthorKeys = new Set(
		selectedAuthors.map((value) => value.toLowerCase()),
	);
	const excludedAuthors = sanitizeStringArray(filters.excludedAuthors).filter(
		(value) => !selectedAuthorKeys.has(value.toLowerCase()),
	);

	return {
		readStatus,
		selectedTypes,
		selectedTags,
		excludedTags,
		selectedDomains,
		excludedDomains,
		selectedAuthors,
		excludedAuthors,
		searchTokens: Array.isArray(filters.searchTokens)
			? filters.searchTokens.map(sanitizeSearchToken).filter(Boolean)
			: [],
		searchQuery: String(filters.searchQuery || "")
			.replace(/\s+/g, " ")
			.trim(),
	};
}

function createSavedViewId() {
	return (
		window.crypto?.randomUUID?.() ||
		`view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	);
}

function sanitizeSavedView(view) {
	if (!view || typeof view !== "object") return null;

	const name = normalizeViewName(view.name);
	if (!name) return null;

	return {
		id: String(view.id || createSavedViewId()),
		name,
		filters: sanitizeSavedViewFilters(view.filters),
	};
}

function getCurrentSavedViewFilters() {
	return sanitizeSavedViewFilters({
		readStatus: state.readStatus,
		selectedTypes: state.selectedTypes,
		selectedTags: state.selectedTags,
		excludedTags: state.excludedTags,
		selectedDomains: state.selectedDomains,
		excludedDomains: state.excludedDomains,
		selectedAuthors: state.selectedAuthors,
		excludedAuthors: state.excludedAuthors,
		searchTokens: state.searchTokens,
		searchQuery: state.searchQuery,
	});
}

function sortValues(values) {
	return [...values].sort((left, right) =>
		String(left).localeCompare(String(right), undefined, {
			sensitivity: "base",
		}),
	);
}

function getSearchTokenSignature(token) {
	if (!token) return "";
	if (token.kind === "text") return `text:${token.value.toLowerCase()}`;
	return `field:${token.field}:${token.operator}:${token.value.toLowerCase()}`;
}

function buildSavedViewSignature(filters) {
	const snapshot = sanitizeSavedViewFilters(filters);
	return JSON.stringify({
		readStatus: snapshot.readStatus,
		selectedTypes: sortValues(snapshot.selectedTypes),
		selectedTags: sortValues(snapshot.selectedTags),
		excludedTags: sortValues(snapshot.excludedTags),
		selectedDomains: sortValues(snapshot.selectedDomains),
		excludedDomains: sortValues(snapshot.excludedDomains),
		selectedAuthors: sortValues(
			snapshot.selectedAuthors.map((value) => value.toLowerCase()),
		),
		excludedAuthors: sortValues(
			snapshot.excludedAuthors.map((value) => value.toLowerCase()),
		),
		searchTokens: sortValues(
			snapshot.searchTokens.map(getSearchTokenSignature),
		),
		searchQuery: snapshot.searchQuery.toLowerCase(),
	});
}

function loadLegacySavedViewsFromStorage() {
	try {
		const raw = window.localStorage.getItem(LEGACY_SAVED_VIEWS_STORAGE_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.map(sanitizeSavedView).filter(Boolean);
	} catch {
		return [];
	}
}

function clearLegacySavedViewsFromStorage() {
	try {
		window.localStorage.removeItem(LEGACY_SAVED_VIEWS_STORAGE_KEY);
	} catch {}
}

function mergeSavedViews(primaryViews, secondaryViews) {
	const merged = [];
	const seenNames = new Set();

	[...primaryViews, ...secondaryViews].forEach((view) => {
		const sanitized = sanitizeSavedView(view);
		if (!sanitized) return;

		const key = sanitized.name.toLowerCase();
		if (seenNames.has(key)) return;
		seenNames.add(key);
		merged.push(sanitized);
	});

	return merged;
}

function getAllViews() {
	return [...BUILT_IN_VIEWS, ...state.savedViews];
}

function getViewsForMatching() {
	return [...state.savedViews, ...BUILT_IN_VIEWS];
}

export function createSavedViews({ closeAllDropdowns, refreshList }) {
	async function persistSavedViews() {
		const response = await fetch("/api/preferences/saved-views", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ savedViews: state.savedViews }),
		}).catch(() => null);

		if (!response) {
			alert("Saved views could not be synced right now.");
			return false;
		}
		if (handleAuthFailure(response)) return false;
		if (!response.ok) {
			alert("Saved views could not be synced right now.");
			return false;
		}

		const data = await response.json().catch(() => ({}));
		state.savedViews = Array.isArray(data?.savedViews)
			? data.savedViews.map(sanitizeSavedView).filter(Boolean)
			: state.savedViews;
		clearLegacySavedViewsFromStorage();
		return true;
	}

	async function loadSavedViews() {
		if (state.isUnauthorized) return;

		const response = await fetch("/api/preferences/saved-views").catch(
			() => null,
		);
		if (!response) return;
		if (handleAuthFailure(response)) return;
		if (!response.ok) return;

		const data = await response.json().catch(() => []);
		const serverViews = (Array.isArray(data) ? data : [])
			.map(sanitizeSavedView)
			.filter(Boolean);
		const legacyViews = loadLegacySavedViewsFromStorage();
		const mergedViews = mergeSavedViews(serverViews, legacyViews);

		state.savedViews = mergedViews;
		updateViewsFilterDisplay();
		renderSavedViewOptions();
		syncActiveSavedView();

		if (
			legacyViews.length > 0 &&
			JSON.stringify(mergedViews) !== JSON.stringify(serverViews)
		) {
			await persistSavedViews();
			syncActiveSavedView();
			return;
		}

		clearLegacySavedViewsFromStorage();
	}

	function updateViewsFilterDisplay() {
		if (!dom.viewsFilterValue) return;
		const activeView = getAllViews().find(
			(view) => view.id === state.activeSavedViewId,
		);
		dom.viewsFilterValue.textContent = activeView?.name || "None";
	}

	function openSaveViewModal() {
		if (!dom.saveViewModal) return;

		const activeName =
			state.savedViews.find((view) => view.id === state.activeSavedViewId)
				?.name || "";
		dom.saveViewModal.style.display = "flex";
		if (dom.saveViewName) {
			dom.saveViewName.value = activeName;
			dom.saveViewName.focus();
			dom.saveViewName.select();
		}
	}

	function closeSaveViewModal() {
		if (!dom.saveViewModal) return;
		dom.saveViewModal.style.display = "none";
		if (dom.saveViewName) dom.saveViewName.value = "";
	}

	async function removeSavedView(viewId) {
		const previousViews = [...state.savedViews];
		state.savedViews = state.savedViews.filter((view) => view.id !== viewId);
		const persisted = await persistSavedViews();
		if (!persisted) {
			state.savedViews = previousViews;
		}
		syncActiveSavedView();
	}

	function renderSavedViewOptions() {
		if (!dom.viewsOptions) return;

		const allViews = getAllViews();
		if (allViews.length === 0) {
			const empty = document.createElement("div");
			empty.className = "dropdown-empty";
			empty.textContent = "No saved views yet";
			dom.viewsOptions.replaceChildren(empty);
			return;
		}

		const options = allViews.map((view) => {
			const isBuiltIn = BUILT_IN_VIEWS.some((entry) => entry.id === view.id);
			const row = document.createElement("label");
			row.className = "dropdown-option";
			row.dataset.value = view.id;

			const content = document.createElement("div");
			content.className = "view-option";

			const labelWrap = document.createElement("span");
			labelWrap.className = "view-option-label";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = view.id === state.activeSavedViewId;
			checkbox.setAttribute("aria-label", `Apply saved view ${view.name}`);

			const text = document.createElement("span");
			text.className = "view-option-text";
			text.textContent = view.name;

			labelWrap.append(checkbox, text);

			content.append(labelWrap);
			if (!isBuiltIn) {
				const removeButton = document.createElement("button");
				removeButton.type = "button";
				removeButton.className = "view-option-remove";
				removeButton.textContent = "×";
				removeButton.title = `Delete ${view.name}`;
				removeButton.setAttribute("aria-label", `Delete saved view ${view.name}`);
				removeButton.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					removeSavedView(view.id);
				});
				content.append(removeButton);
			}
			row.appendChild(content);
			row.addEventListener("click", (event) => {
				event.preventDefault();
				if (view.id === state.activeSavedViewId) {
					clearActiveView();
					return;
				}
				applySavedView(view.id);
				closeAllDropdowns();
			});
			return row;
		});

		dom.viewsOptions.replaceChildren(...options);
	}

	function syncActiveSavedView() {
		const currentSignature = buildSavedViewSignature(
			getCurrentSavedViewFilters(),
		);
		const nextActiveId =
			getViewsForMatching().find(
				(view) => buildSavedViewSignature(view.filters) === currentSignature,
			)?.id || "";

		state.activeSavedViewId = nextActiveId;
		updateViewsFilterDisplay();
		renderSavedViewOptions();
	}

	function clearActiveView() {
		state.readStatus = "all";
		state.selectedTypes = [];
		state.selectedTags = [];
		state.excludedTags = [];
		state.selectedDomains = [];
		state.excludedDomains = [];
		state.selectedAuthors = [];
		state.excludedAuthors = [];
		state.searchTokens = [];
		state.searchQuery = "";

		if (dom.searchInput) dom.searchInput.value = "";

		closeAllDropdowns();
		closeSaveViewModal();
		refreshList({ reloadServer: true });
	}

	function applySavedView(viewId) {
		const view = getAllViews().find((entry) => entry.id === viewId);
		if (!view) return;

		const filters = sanitizeSavedViewFilters(view.filters);
		state.readStatus = filters.readStatus;
		state.selectedTypes = filters.selectedTypes;
		state.selectedTags = filters.selectedTags;
		state.excludedTags = filters.excludedTags;
		state.selectedDomains = filters.selectedDomains;
		state.excludedDomains = filters.excludedDomains;
		state.selectedAuthors = filters.selectedAuthors;
		state.excludedAuthors = filters.excludedAuthors;
		state.searchTokens = filters.searchTokens;
		state.searchQuery = filters.searchQuery;

		if (dom.searchInput) dom.searchInput.value = filters.searchQuery;

		closeAllDropdowns();
		closeSaveViewModal();
		refreshList({ reloadServer: true });
	}

	async function saveCurrentView() {
		const name = normalizeViewName(dom.saveViewName?.value);
		if (!name) {
			dom.saveViewName?.focus();
			return;
		}

		const filters = getCurrentSavedViewFilters();
		const existing = state.savedViews.find(
			(view) => view.name.toLowerCase() === name.toLowerCase(),
		);
		const nextView = {
			id: existing?.id || createSavedViewId(),
			name,
			filters,
		};

		const previousViews = [...state.savedViews];
		state.savedViews = [
			nextView,
			...state.savedViews.filter((view) => view.id !== nextView.id),
		];
		const persisted = await persistSavedViews();
		if (!persisted) {
			state.savedViews = previousViews;
			syncActiveSavedView();
			return;
		}
		closeSaveViewModal();
		syncActiveSavedView();
	}

	function initSavedViews() {
		updateViewsFilterDisplay();
		renderSavedViewOptions();

		dom.saveViewOpen?.addEventListener("click", (event) => {
			event.stopPropagation();
			openSaveViewModal();
		});
		dom.saveViewModalClose?.addEventListener("click", closeSaveViewModal);
		dom.saveViewCancel?.addEventListener("click", closeSaveViewModal);

		dom.saveViewForm?.addEventListener("submit", async (event) => {
			event.preventDefault();
			await saveCurrentView();
		});

		dom.saveViewName?.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeSaveViewModal();
			}
		});

		dom.saveViewModal?.addEventListener("click", (event) => {
			if (event.target === dom.saveViewModal) closeSaveViewModal();
		});

		syncActiveSavedView();
	}

	return {
		initSavedViews,
		loadSavedViews,
		syncActiveSavedView,
		updateViewsFilterDisplay,
	};
}
