import { dom, state } from "./shared.js";
import {
	applySearch,
	getDomain,
	getSearchTokenLabel,
	looksLikeStructuredSearchDraft,
	parseSearchTokenDraft,
	searchFieldDefinitions,
} from "./utils.js";

const NEGATIVE_OPERATORS = new Set(["not_contains", "not_equals"]);

let onSearchChanged = () => {};
let searchDebounce = null;
let isInitialized = false;

export function applyListSearch(items) {
	return applySearch(items, state.searchQuery, state.searchTokens);
}

function getSearchFieldDefinition(field) {
	return (
		searchFieldDefinitions.find(
			(definition) =>
				definition.field === field ||
				definition.aliases.includes(String(field || "").toLowerCase()),
		) || null
	);
}

function getSearchFieldValues(field, typeValues) {
	const items = Array.from(state.itemsById.values());
	if (field === "type") return [...typeValues];
	if (field === "website") {
		return [
			...new Set(items.map((item) => getDomain(item.url)).filter(Boolean)),
		].sort();
	}
	if (field === "author") {
		return [
			...new Set(
				items.map((item) => (item.author || "").trim()).filter(Boolean),
			),
		].sort();
	}
	if (field === "tag") {
		return [
			...new Set(
				items
					.flatMap((item) => (Array.isArray(item.tags) ? item.tags : []))
					.map((tag) => String(tag || "").trim())
					.filter(Boolean),
			),
		].sort();
	}
	return [];
}

function isSameSearchToken(left, right) {
	if (!left || !right || left.kind !== right.kind) return false;
	if (left.kind === "text") {
		return left.value.toLowerCase() === right.value.toLowerCase();
	}
	return (
		left.field === right.field &&
		left.operator === right.operator &&
		left.value.toLowerCase() === right.value.toLowerCase()
	);
}

function runSearchChange(immediate = false) {
	clearTimeout(searchDebounce);
	if (immediate) {
		onSearchChanged();
		return;
	}
	searchDebounce = window.setTimeout(() => {
		onSearchChanged();
	}, 90);
}

function createSearchFieldToken(field, operator, value) {
	return {
		kind: "field",
		field,
		operator,
		value,
	};
}

function getSearchOperatorVariants(definition, preferredOperator = "") {
	const defaults = Array.isArray(definition.supportedOperators)
		? definition.supportedOperators
		: definition.defaultOperator === "equals"
			? ["equals", "not_equals"]
			: ["contains", "not_contains"];

	if (!preferredOperator || !defaults.includes(preferredOperator)) {
		return defaults;
	}

	return [
		preferredOperator,
		...defaults.filter((operator) => operator !== preferredOperator),
	];
}

function getSearchDraftContext(trimmed) {
	const parsed = parseSearchTokenDraft(trimmed);
	const fieldTokenMatch = trimmed.match(/^(?:([!-])\s*)?([a-z]+)\b/i);
	const definition = getSearchFieldDefinition(
		parsed?.field || fieldTokenMatch?.[2],
	);
	if (!definition) {
		return { parsed, definition: null, operator: null, valueQuery: "" };
	}

	const working = fieldTokenMatch?.[1] ? trimmed.slice(1).trim() : trimmed;
	const rest = working.replace(/^[a-z]+\b/i, "").trim();
	let operator = fieldTokenMatch?.[1]
		? definition.negativeOperator
		: definition.defaultOperator;
	let valueQuery = rest;

	const operatorPatterns = [
		[/^!=\s*/i, "not_equals"],
		[/^!~\s*/i, "not_contains"],
		[/^==\s*/i, "equals"],
		[/^=\s*/i, "equals"],
		[/^~\s*/i, "contains"],
		[/^does not contain\s*/i, "not_contains"],
		[/^not contains?\s*/i, "not_contains"],
		[/^contains\s*/i, "contains"],
		[/^is not\s*/i, "not_equals"],
		[/^equals\s*/i, "equals"],
		[/^is\s*/i, "equals"],
		[/^!\s*/i, definition.negativeOperator],
		[/^not\s+/i, definition.negativeOperator],
	];

	for (const [pattern, nextOperator] of operatorPatterns) {
		if (!pattern.test(valueQuery)) continue;
		operator = nextOperator;
		valueQuery = valueQuery.replace(pattern, "");
		break;
	}

	valueQuery = valueQuery.replace(/^["']|["']$/g, "").trim();
	return { parsed, definition, operator, valueQuery };
}

function commitSearchToken(token) {
	if (!token || !token.value) return false;
	if (!state.searchTokens.some((entry) => isSameSearchToken(entry, token))) {
		state.searchTokens = [...state.searchTokens, token];
	}
	state.searchQuery = "";
	if (dom.searchInput) dom.searchInput.value = "";
	syncListSearchUi();
	runSearchChange(true);
	return true;
}

function commitSearchDraft() {
	const trimmed = (dom.searchInput?.value || "").trim();
	if (!trimmed) return false;

	const parsed = parseSearchTokenDraft(trimmed);
	if (parsed?.kind === "field") {
		return commitSearchToken(parsed);
	}

	if (looksLikeStructuredSearchDraft(trimmed)) {
		return false;
	}

	return commitSearchToken({
		kind: "text",
		value: trimmed.replace(/\s+/g, " "),
	});
}

function removeSearchToken(index) {
	state.searchTokens = state.searchTokens.filter(
		(_, tokenIndex) => tokenIndex !== index,
	);
	syncListSearchUi();
	runSearchChange(true);
}

function createSearchTokenChip(token, index) {
	const chip = document.createElement("span");
	chip.className = NEGATIVE_OPERATORS.has(token.operator)
		? "search-token-chip search-token-chip-negative"
		: "search-token-chip";

	const label = document.createElement("span");
	label.className = "search-token-chip-label";
	label.textContent = getSearchTokenLabel(token);

	const button = document.createElement("button");
	button.type = "button";
	button.className = "search-token-chip-remove";
	button.textContent = "×";
	button.title = "Remove filter";
	button.addEventListener("click", () => {
		removeSearchToken(index);
	});

	chip.append(label, button);
	return chip;
}

function renderSearchTokenList() {
	if (!dom.searchTokenList || !dom.searchShell) return;
	const chips = state.searchTokens.map(createSearchTokenChip);
	dom.searchTokenList.replaceChildren(...chips);
	dom.searchShell.classList.toggle("has-search-tokens", chips.length > 0);
}

function createSearchSuggestionButton({
	text,
	title = "",
	className = "",
	onClick,
}) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `search-suggestion ${className}`.trim();
	button.textContent = text;
	if (title) button.title = title;
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
	});
	button.addEventListener("click", onClick);
	return button;
}

function getSearchSuggestions(typeValues) {
	const trimmed = state.searchQuery.trim();
	if (!trimmed) return [];

	const suggestions = [];
	const { parsed, definition, operator, valueQuery } =
		getSearchDraftContext(trimmed);

	if (definition) {
		const operators = getSearchOperatorVariants(definition, operator);
		const values = getSearchFieldValues(definition.field, typeValues);
		const matchedValues = valueQuery
			? values.filter((value) =>
					value.toLowerCase().includes(valueQuery.toLowerCase()),
				)
			: [];

		if (valueQuery) {
			operators.forEach((variant) => {
				const token = createSearchFieldToken(
					definition.field,
					variant,
					valueQuery,
				);
				suggestions.push({
					key: `typed:${definition.field}:${variant}:${valueQuery.toLowerCase()}`,
					element: createSearchSuggestionButton({
						text: getSearchTokenLabel(token),
						title: "Add this filter",
						className: NEGATIVE_OPERATORS.has(variant)
							? "is-negative"
							: "is-structured",
						onClick: () => {
							commitSearchToken(token);
							dom.searchInput?.focus();
						},
					}),
				});
			});

			matchedValues.slice(0, 4).forEach((value) => {
				operators.forEach((variant) => {
					const token = createSearchFieldToken(
						definition.field,
						variant,
						value,
					);
					suggestions.push({
						key: `match:${definition.field}:${variant}:${value.toLowerCase()}`,
						element: createSearchSuggestionButton({
							text: getSearchTokenLabel(token),
							title: "Use a matching value",
							className: NEGATIVE_OPERATORS.has(variant)
								? "is-negative"
								: "is-structured",
							onClick: () => {
								commitSearchToken(token);
								dom.searchInput?.focus();
							},
						}),
					});
				});
			});
		} else {
			operators.forEach((variant) => {
				const sampleValue = definition.field === "type" ? "article" : "value";
				suggestions.push({
					key: `operator:${definition.field}:${variant}`,
					element: createSearchSuggestionButton({
						text: getSearchTokenLabel(
							createSearchFieldToken(definition.field, variant, sampleValue),
						),
						title: "Continue this filter",
						className: NEGATIVE_OPERATORS.has(variant)
							? "is-negative"
							: "is-structured",
						onClick: () => {
							const operatorText =
								variant === "equals"
									? "="
									: variant === "not_equals"
										? "!="
										: variant === "not_contains"
											? "!~"
											: "~";
							const nextValue = definition.field === "type" ? "article" : "";
							const nextDraft = nextValue
								? `${definition.field} ${operatorText} ${nextValue}`
								: `${definition.field} ${operatorText} `;
							if (dom.searchInput) {
								dom.searchInput.value = nextDraft;
								state.searchQuery = nextDraft;
								dom.searchInput.focus();
								renderSearchSuggestions(typeValues);
							}
						},
					}),
				});
			});
		}
	} else if (!looksLikeStructuredSearchDraft(trimmed)) {
		const token =
			parsed?.kind === "text" ? parsed : { kind: "text", value: trimmed };
		suggestions.push({
			key: `text:${trimmed.toLowerCase()}`,
			element: createSearchSuggestionButton({
				text: getSearchTokenLabel(token),
				title: "Add this text filter",
				className: "is-structured",
				onClick: () => {
					commitSearchToken(token);
					dom.searchInput?.focus();
				},
			}),
		});

		const prefix = trimmed.toLowerCase();
		searchFieldDefinitions
			.filter(
				(entry) =>
					entry.field.startsWith(prefix) ||
					entry.aliases.some((alias) => alias.startsWith(prefix)),
			)
			.slice(0, 2)
			.forEach((entry) => {
				suggestions.push({
					key: `field:${entry.field}`,
					element: createSearchSuggestionButton({
						text: `${entry.field} ${entry.defaultOperator === "equals" ? "=" : "~"}`,
						title: "Start a structured filter",
						className: "is-subtle",
						onClick: () => {
							const nextDraft = `${entry.field} ${entry.defaultOperator === "equals" ? "=" : "~"} `;
							if (dom.searchInput) {
								dom.searchInput.value = nextDraft;
								state.searchQuery = nextDraft;
								dom.searchInput.focus();
								renderSearchSuggestions(typeValues);
							}
						},
					}),
				});
			});
	}

	const seen = new Set();
	return suggestions.filter(({ key }) => {
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function renderSearchSuggestions(typeValues) {
	if (!dom.searchSuggestions || !dom.searchShell) return;

	const shouldShow =
		state.searchInputFocused && Boolean(state.searchQuery.trim());
	if (!shouldShow) {
		dom.searchSuggestions.replaceChildren();
		dom.searchSuggestions.style.display = "none";
		dom.searchShell.classList.remove("has-search-suggestions");
		return;
	}

	const suggestions = getSearchSuggestions(typeValues).slice(0, 6);
	if (suggestions.length === 0) {
		dom.searchSuggestions.replaceChildren();
		dom.searchSuggestions.style.display = "none";
		dom.searchShell.classList.remove("has-search-suggestions");
		return;
	}

	dom.searchSuggestions.replaceChildren(
		...suggestions.map(({ element }) => element),
	);
	dom.searchSuggestions.style.display = "flex";
	dom.searchShell.classList.add("has-search-suggestions");
}

export function syncListSearchUi(typeValues = []) {
	renderSearchTokenList();
	renderSearchSuggestions(typeValues);
}

export function initListSearch({ onChange, typeValues = [] }) {
	onSearchChanged = typeof onChange === "function" ? onChange : () => {};

	if (isInitialized || !dom.searchInput || !dom.searchShell) {
		syncListSearchUi(typeValues);
		return;
	}

	isInitialized = true;

	dom.searchShell.addEventListener("click", () => {
		dom.searchInput?.focus();
	});
	dom.searchInput.addEventListener("focus", () => {
		state.searchInputFocused = true;
		renderSearchSuggestions(typeValues);
	});
	dom.searchInput.addEventListener("blur", () => {
		window.setTimeout(() => {
			state.searchInputFocused = false;
			renderSearchSuggestions(typeValues);
		}, 120);
	});
	dom.searchInput.addEventListener("input", (event) => {
		state.searchQuery = event.target.value || "";
		renderSearchSuggestions(typeValues);
		runSearchChange(false);
	});
	dom.searchInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === "Tab") {
			if (!state.searchQuery.trim()) return;
			const committed = commitSearchDraft();
			if (committed) event.preventDefault();
			return;
		}

		if (
			event.key === "Backspace" &&
			!state.searchQuery &&
			state.searchTokens.length > 0
		) {
			event.preventDefault();
			removeSearchToken(state.searchTokens.length - 1);
			dom.searchInput?.focus();
		}
	});

	syncListSearchUi(typeValues);
}
