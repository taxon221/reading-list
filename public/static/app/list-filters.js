import { getCurrentFilters } from "./list-saved-views.js";
import { dom, state } from "./shared.js";
import { applySearch, getDomain, parseReadingProgress } from "./utils.js";

function isMobilePwa() {
	const standalone =
		window.matchMedia?.("(display-mode: standalone)")?.matches ||
		window.navigator.standalone === true;
	if (!standalone) return false;

	return (
		window.matchMedia?.("(pointer: coarse)")?.matches ||
		/android|iphone|ipad|ipod/i.test(window.navigator.userAgent || "")
	);
}

function focusDropdownSearch(input) {
	if (!input || isMobilePwa()) return;
	input.focus();
}

function getFilterStateKeys(type) {
	const suffix = `${type.charAt(0).toUpperCase()}${type.slice(1)}s`;
	return {
		selected: `selected${suffix}`,
		excluded: `excluded${suffix}`,
	};
}

export function createListFilters({ refreshList }) {
	function updateTagFilterDisplay() {
		if (!dom.tagFilterValue) return;

		const total = state.selectedTags.length + state.excludedTags.length;
		if (total === 0) {
			dom.tagFilterValue.textContent = "All";
			return;
		}

		if (total === 1) {
			dom.tagFilterValue.textContent =
				state.selectedTags[0] ?? `not ${state.excludedTags[0]}`;
			return;
		}

		dom.tagFilterValue.textContent = `${total} selected`;
	}

	function updateTypeFilterDisplay() {
		if (!dom.typeFilterValue) return;

		if (state.selectedTypes.length === 0) {
			dom.typeFilterValue.textContent = "All";
			return;
		}

		if (state.selectedTypes.length === 1) {
			const [value] = state.selectedTypes;
			dom.typeFilterValue.textContent =
				value.charAt(0).toUpperCase() + value.slice(1);
			return;
		}

		dom.typeFilterValue.textContent = `${state.selectedTypes.length} selected`;
	}

	function updateTagDropdownState() {
		dom.tagOptions
			?.querySelectorAll(".dropdown-option[data-value]")
			.forEach((label) => {
				const tag = label.dataset.value;
				const indicator = label.querySelector(".tag-state-indicator");
				if (!indicator) return;
				indicator.dataset.state = state.excludedTags.includes(tag)
					? "exclude"
					: state.selectedTags.includes(tag)
						? "include"
						: "off";
			});
	}

	function updateSelectedTypes() {
		state.selectedTypes = Array.from(
			dom.typeOptions?.querySelectorAll('input[type="checkbox"]:checked') || [],
		).map((checkbox) => checkbox.value);
		updateTypeFilterDisplay();
	}

	function closeAllDropdowns() {
		dom.typeDropdown?.classList.remove("open");
		dom.tagDropdown?.classList.remove("open");
		dom.deleteDropdown?.classList.remove("open");
		dom.viewsDropdown?.classList.remove("open");
	}

	function syncTypeInputs() {
		dom.typeOptions
			?.querySelectorAll('input[type="checkbox"]')
			.forEach((checkbox) => {
				checkbox.checked = state.selectedTypes.includes(checkbox.value);
			});
	}

	function applyClientFilters(items) {
		const filters = getCurrentFilters();
		if (filters.selectedTypes.length)
			items = items.filter((item) => filters.selectedTypes.includes(item.type));
		if (filters.selectedTags.length)
			items = items.filter((item) =>
				item.tags.some((tag) => filters.selectedTags.includes(tag)),
			);
		if (filters.excludedTags.length)
			items = items.filter(
				(item) => !item.tags.some((tag) => filters.excludedTags.includes(tag)),
			);

		let result = applySearch(items, filters.searchQuery, filters.searchTokens);
		if (filters.selectedDomains.length > 0) {
			result = result.filter((item) =>
				filters.selectedDomains.includes(getDomain(item.url)),
			);
		}
		if (filters.excludedDomains.length > 0) {
			result = result.filter(
				(item) => !filters.excludedDomains.includes(getDomain(item.url)),
			);
		}
		if (filters.selectedAuthors.length > 0) {
			result = result.filter((item) =>
				filters.selectedAuthors.some(
					(author) =>
						(item.author || "").toLowerCase() === author.toLowerCase(),
				),
			);
		}
		if (filters.excludedAuthors.length > 0) {
			result = result.filter(
				(item) =>
					!filters.excludedAuthors.some(
						(author) =>
							(item.author || "").toLowerCase() === author.toLowerCase(),
					),
			);
		}
		if (filters.readStatus === "in-progress") {
			result = result.filter((item) => {
				const progress = parseReadingProgress(item.reading_progress);
				return (
					!item.is_read &&
					progress &&
					Number(progress.ratio || progress.percentage || 0) > 0
				);
			});
		}
		if (filters.readStatus === "read") {
			result = result.filter((item) => Boolean(item.is_read));
		}
		if (filters.readStatus === "unread") {
			result = result.filter((item) => !item.is_read);
		}
		return result;
	}

	function toggleInclude(type, value) {
		const { selected, excluded } = getFilterStateKeys(type);
		if (state[selected].includes(value)) {
			state[selected] = state[selected].filter((entry) => entry !== value);
		} else {
			state[selected] = [...state[selected], value];
			state[excluded] = state[excluded].filter((entry) => entry !== value);
		}

		refreshList();
	}

	function toggleExclude(type, value) {
		const { selected, excluded } = getFilterStateKeys(type);
		if (state[excluded].includes(value)) {
			state[excluded] = state[excluded].filter((entry) => entry !== value);
		} else {
			state[excluded] = [...state[excluded], value];
			state[selected] = state[selected].filter((entry) => entry !== value);
		}

		refreshList();
	}

	function filterByTag(tag) {
		if (state.selectedTags.includes(tag)) return;
		state.selectedTags = [...state.selectedTags, tag];
		state.excludedTags = state.excludedTags.filter((entry) => entry !== tag);
		refreshList();
	}

	function createFilterChip(text, onRemove, isExclude) {
		const chip = document.createElement("span");
		chip.className = isExclude
			? "filter-chip filter-chip-exclude"
			: "filter-chip";

		const label = document.createElement("span");
		label.textContent = text;

		const button = document.createElement("button");
		button.type = "button";
		button.className = "filter-chip-remove";
		button.textContent = "×";
		button.setAttribute("aria-label", `Remove filter ${text}`);
		button.addEventListener("click", onRemove);

		chip.append(label, button);
		return chip;
	}

	function renderFilterChips() {
		if (!dom.filterChips) return;

		const chips = [];

		for (const tag of state.selectedTags) {
			chips.push(
				createFilterChip(
					`#${tag}`,
					() => {
						state.selectedTags = state.selectedTags.filter(
							(entry) => entry !== tag,
						);
						refreshList();
					},
					false,
				),
			);
		}

		for (const tag of state.excludedTags) {
			chips.push(
				createFilterChip(
					`not #${tag}`,
					() => {
						state.excludedTags = state.excludedTags.filter(
							(entry) => entry !== tag,
						);
						refreshList();
					},
					true,
				),
			);
		}

		for (const domain of state.selectedDomains) {
			chips.push(
				createFilterChip(
					domain,
					() => {
						state.selectedDomains = state.selectedDomains.filter(
							(entry) => entry !== domain,
						);
						refreshList();
					},
					false,
				),
			);
		}

		for (const domain of state.excludedDomains) {
			chips.push(
				createFilterChip(
					`not ${domain}`,
					() => {
						state.excludedDomains = state.excludedDomains.filter(
							(entry) => entry !== domain,
						);
						refreshList();
					},
					true,
				),
			);
		}

		for (const author of state.selectedAuthors) {
			chips.push(
				createFilterChip(
					`by ${author}`,
					() => {
						state.selectedAuthors = state.selectedAuthors.filter(
							(entry) => entry !== author,
						);
						refreshList();
					},
					false,
				),
			);
		}

		for (const author of state.excludedAuthors) {
			chips.push(
				createFilterChip(
					`not by ${author}`,
					() => {
						state.excludedAuthors = state.excludedAuthors.filter(
							(entry) => entry !== author,
						);
						refreshList();
					},
					true,
				),
			);
		}

		dom.filterChips.replaceChildren(...chips);
		dom.filterChips.style.display = chips.length ? "" : "none";
	}

	function initDropdowns() {
		// Tell assistive tech whether each filter menu is open.
		for (const dropdown of document.querySelectorAll(".filter-dropdown")) {
			const button = dropdown.querySelector(".filter-btn");
			if (!button) continue;
			const sync = () =>
				button.setAttribute(
					"aria-expanded",
					String(dropdown.classList.contains("open")),
				);
			sync();
			new MutationObserver(sync).observe(dropdown, {
				attributes: true,
				attributeFilter: ["class"],
			});
		}
		dom.typeOptions
			?.querySelectorAll('input[type="checkbox"]')
			.forEach((checkbox) => {
				checkbox.addEventListener("change", () => {
					updateSelectedTypes();
					refreshList();
				});
			});

		dom.typeFilterBtn?.addEventListener("click", (event) => {
			event.stopPropagation();
			const isOpen = dom.typeDropdown?.classList.contains("open");
			closeAllDropdowns();
			if (!isOpen) {
				dom.typeDropdown?.classList.add("open");
				focusDropdownSearch(dom.typeSearch);
			}
		});

		dom.tagFilterBtn?.addEventListener("click", (event) => {
			event.stopPropagation();
			const isOpen = dom.tagDropdown?.classList.contains("open");
			closeAllDropdowns();
			if (!isOpen) {
				dom.tagDropdown?.classList.add("open");
				focusDropdownSearch(dom.tagSearch);
			}
		});

		dom.viewsFilterBtn?.addEventListener("click", (event) => {
			event.stopPropagation();
			const isOpen = dom.viewsDropdown?.classList.contains("open");
			closeAllDropdowns();
			if (!isOpen) {
				dom.viewsDropdown?.classList.add("open");
			}
		});

		document.addEventListener("click", (event) => {
			if (!event.target.closest(".filter-dropdown")) {
				closeAllDropdowns();
			}
		});
		document.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			const open = document.querySelector(".filter-dropdown.open");
			if (!open) return;
			closeAllDropdowns();
			open.querySelector(".filter-btn")?.focus();
		});

		dom.typeSearch?.addEventListener("input", (event) => {
			const query = String(event.target?.value || "").toLowerCase();
			dom.typeOptions
				?.querySelectorAll(".dropdown-option")
				.forEach((option) => {
					const value =
						option.dataset.value || option.textContent.toLowerCase();
					option.style.display = value.includes(query) ? "" : "none";
				});
		});

		dom.tagSearch?.addEventListener("input", (event) => {
			const query = String(event.target?.value || "").toLowerCase();
			dom.tagOptions?.querySelectorAll(".dropdown-option").forEach((option) => {
				const value = option.dataset.value || "";
				option.style.display = value.includes(query) ? "" : "none";
			});
		});

		dom.typeClear?.addEventListener("click", () => {
			dom.typeOptions
				?.querySelectorAll('input[type="checkbox"]')
				.forEach((checkbox) => {
					checkbox.checked = false;
				});
			state.selectedTypes = [];
			refreshList();
		});

		dom.tagClear?.addEventListener("click", () => {
			state.selectedTags = [];
			state.excludedTags = [];
			refreshList();
		});
	}

	return {
		applyClientFilters,
		closeAllDropdowns,
		filterByTag,
		initDropdowns,
		renderFilterChips,
		syncTypeInputs,
		toggleExclude,
		toggleInclude,
		updateTagDropdownState,
		updateTagFilterDisplay,
		updateTypeFilterDisplay,
	};
}
