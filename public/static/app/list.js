import { dom, handleAuthFailure, showUnauthorizedState, state } from "./shared.js";
import {
  applySearch,
  createEmptyState,
  createSvgIcon,
  formatDate,
  getAuthorizedItemUrl,
  getDomain,
  getSearchTokenLabel,
  looksLikeStructuredSearchDraft,
  parseSearchTokenDraft,
  renderItemProgressMeta,
  renderTagPills,
  searchFieldDefinitions,
  setupTagInput,
} from "./utils.js";

const DELETE_TYPE_VALUES = ["article", "video", "pdf", "ebook", "podcast"];

const deleteFacetsData = { tags: [], authors: [], domains: [] };
let hasLoadedDeleteFacets = false;
let deleteBy = "tag";
let deleteSelectedValues = [];

function updateTagFilterDisplay() {
  if (!dom.tagFilterValue) return;
  const total = state.selectedTags.length + state.excludedTags.length;
  if (total === 0) {
    dom.tagFilterValue.textContent = "All";
  } else if (total === 1) {
    dom.tagFilterValue.textContent =
      state.selectedTags[0] ?? `not ${state.excludedTags[0]}`;
  } else {
    dom.tagFilterValue.textContent = `${total} selected`;
  }
}

function updateTypeFilterDisplay() {
  if (!dom.typeFilterValue) return;

  if (state.selectedTypes.length === 0) {
    dom.typeFilterValue.textContent = "All";
  } else if (state.selectedTypes.length === 1) {
    const [value] = state.selectedTypes;
    dom.typeFilterValue.textContent =
      value.charAt(0).toUpperCase() + value.slice(1);
  } else {
    dom.typeFilterValue.textContent = `${state.selectedTypes.length} selected`;
  }
}

function updateTagDropdownState() {
  dom.tagOptions?.querySelectorAll(".dropdown-option[data-value]").forEach((label) => {
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

function updateSelectedTags() {
  updateTagFilterDisplay();
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
}

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

function createItemActionButton({ action, className, title, icon }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.title = title;
  button.appendChild(icon);
  return button;
}

function createItemElement(item) {
  const article = document.createElement("article");
  article.className = item.is_read ? "item read" : "item";
  article.dataset.id = String(item.id);

  const content = document.createElement("div");
  content.className = "item-content";

  const left = document.createElement("div");
  left.className = "item-col-left";

  const type = document.createElement("span");
  type.className = `item-type type-${item.type}`;
  type.textContent = item.type;

  const date = document.createElement("span");
  date.className = "item-date";
  date.textContent = formatDate(item.created_at);

  left.append(type, date);

  const progress = renderItemProgressMeta(item);
  if (progress) left.appendChild(progress);

  const right = document.createElement("div");
  right.className = "item-col-right";

  const title = document.createElement("span");
  title.className = "item-title";
  title.dataset.action = "open-reader";
  title.textContent = item.title || item.url;

  const meta = document.createElement("div");
  meta.className = "item-meta";

    const domainStr = getDomain(item.url);
  const domain = document.createElement("button");
  domain.type = "button";
  domain.className = "item-domain item-filter-btn";
  domain.textContent = domainStr;
  domain.title = "Filter by domain · Shift+click to exclude";
  domain.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.shiftKey) toggleExclude("domain", domainStr);
    else toggleInclude("domain", domainStr);
  });
  meta.appendChild(domain);

  if (item.author) {
    const author = document.createElement("button");
    author.type = "button";
    author.className = "item-author item-filter-btn";
    author.textContent = item.author;
    author.title = "Filter by author · Shift+click to exclude";
    author.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.shiftKey) toggleExclude("author", item.author);
      else toggleInclude("author", item.author);
    });
    meta.appendChild(author);
  }

  if (item.highlight_count) {
    const highlights = document.createElement("span");
    highlights.className = "item-has-highlights";
    highlights.title = `${item.highlight_count} highlight${item.highlight_count > 1 ? "s" : ""}`;
    highlights.append(
      createSvgIcon(
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          width: "12",
          height: "12",
        },
        [
          { name: "path", attributes: { d: "M12 2L2 7l10 5 10-5-10-5z" } },
          { name: "path", attributes: { d: "M2 17l10 5 10-5" } },
          { name: "path", attributes: { d: "M2 12l10 5 10-5" } },
        ],
      ),
      document.createTextNode(` ${item.highlight_count}`),
    );
    meta.appendChild(highlights);
  }

  if (Array.isArray(item.tags)) {
    item.tags.forEach((tag) => {
      const tagButton = document.createElement("button");
      tagButton.type = "button";
      tagButton.className = "item-tag";
      tagButton.dataset.action = "filter-tag";
      tagButton.dataset.tag = tag;
      tagButton.textContent = `#${tag}`;
      meta.appendChild(tagButton);
    });
  }

  right.append(title, meta);
  content.append(left, right);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const actionRow = document.createElement("div");
  actionRow.className = "item-actions-row";

  actionRow.append(
    createItemActionButton({
      action: "toggle-read",
      className: item.is_read ? "btn-action is-read" : "btn-action",
      title: item.is_read ? "Mark unread" : "Mark read",
      icon: createSvgIcon(
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        [{ name: "path", attributes: { d: "M20 6L9 17l-5-5" } }],
      ),
    }),
    createItemActionButton({
      action: "delete-item",
      className: "btn-action btn-delete",
      title: "Delete",
      icon: createSvgIcon(
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        [{ name: "path", attributes: { d: "M18 6L6 18M6 6l12 12" } }],
      ),
    }),
  );

  const moreButton = createItemActionButton({
    action: "open-menu",
    className: "btn-more",
    title: "More options",
    icon: createSvgIcon(
      {
        viewBox: "0 0 24 24",
        fill: "currentColor",
      },
      [
        { name: "circle", attributes: { cx: "5", cy: "12", r: "2" } },
        { name: "circle", attributes: { cx: "12", cy: "12", r: "2" } },
        { name: "circle", attributes: { cx: "19", cy: "12", r: "2" } },
      ],
    ),
  });

  actions.append(actionRow, moreButton);
  article.append(content, actions);
  return article;
}

function renderItems(items) {
  if (!dom.itemsList) return;
  if (items.length === 0) {
    dom.itemsList.replaceChildren(
      createEmptyState("No items yet", "Paste a URL above to get started"),
    );
  } else {
    dom.itemsList.replaceChildren(...items.map(createItemElement));
  }
}

function renderTagOptions(tags) {
  if (!dom.tagOptions) return;

  if (tags.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dropdown-empty";
    empty.textContent = "No tags yet";
    dom.tagOptions.replaceChildren(empty);
    return;
  }

  const options = tags.map((tag) => {
    const label = document.createElement("label");
    label.className = "dropdown-option";
    label.dataset.value = tag.name;

    const indicator = document.createElement("span");
    indicator.className = "tag-state-indicator";
    indicator.dataset.state = state.excludedTags.includes(tag.name)
      ? "exclude"
      : state.selectedTags.includes(tag.name)
      ? "include"
      : "off";

    const count = document.createElement("span");
    count.className = "option-count";
    count.textContent = String(tag.count);

    label.append(indicator, document.createTextNode(`${tag.name} `), count);
    label.addEventListener("click", (e) => {
      e.preventDefault();
      const next = { off: "include", include: "exclude", exclude: "off" };
      const nextState = next[indicator.dataset.state] ?? "off";
      indicator.dataset.state = nextState;
      state.selectedTags = state.selectedTags.filter((t) => t !== tag.name);
      state.excludedTags = state.excludedTags.filter((t) => t !== tag.name);
      if (nextState === "include") state.selectedTags.push(tag.name);
      if (nextState === "exclude") state.excludedTags.push(tag.name);
      updateTagFilterDisplay();
      renderFilterChips();
      loadItems();
    });
    return label;
  });

  dom.tagOptions.replaceChildren(...options);
}

function applyClientFilters(items) {
  let result = applySearch(items, state.searchQuery, state.searchTokens);
  if (state.selectedDomains.length > 0)
    result = result.filter((i) => state.selectedDomains.includes(getDomain(i.url)));
  if (state.excludedDomains.length > 0)
    result = result.filter((i) => !state.excludedDomains.includes(getDomain(i.url)));
  if (state.selectedAuthors.length > 0)
    result = result.filter((i) =>
      state.selectedAuthors.some((a) => (i.author || "").toLowerCase() === a.toLowerCase()),
    );
  if (state.excludedAuthors.length > 0)
    result = result.filter((i) =>
      !state.excludedAuthors.some((a) => (i.author || "").toLowerCase() === a.toLowerCase()),
    );
  return result;
}

function getSearchFieldDefinition(field) {
  return (
    searchFieldDefinitions.find(
      (definition) =>
        definition.field === field || definition.aliases.includes(String(field || "").toLowerCase()),
    ) || null
  );
}

function getSearchFieldValues(field) {
  const items = Array.from(state.itemsById.values());
  if (field === "type") return [...DELETE_TYPE_VALUES];
  if (field === "website") {
    return [...new Set(items.map((item) => getDomain(item.url)).filter(Boolean))].sort();
  }
  if (field === "author") {
    return [...new Set(items.map((item) => (item.author || "").trim()).filter(Boolean))].sort();
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

function renderSearchResults() {
  renderSearchSuggestions();
  renderItems(applyClientFilters(Array.from(state.itemsById.values())));
}

function commitSearchToken(token) {
  if (!token || !token.value) return false;
  if (!state.searchTokens.some((entry) => isSameSearchToken(entry, token))) {
    state.searchTokens = [...state.searchTokens, token];
  }
  state.searchQuery = "";
  if (dom.searchInput) dom.searchInput.value = "";
  renderSearchTokenList();
  renderSearchResults();
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
  state.searchTokens = state.searchTokens.filter((_, tokenIndex) => tokenIndex !== index);
  renderSearchTokenList();
  renderSearchResults();
}

function createSearchTokenChip(token, index) {
  const chip = document.createElement("span");
  chip.className =
    token.operator === "not_contains" || token.operator === "not_equals"
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

  return [preferredOperator, ...defaults.filter((operator) => operator !== preferredOperator)];
}

function getSearchDraftContext(trimmed) {
  const parsed = parseSearchTokenDraft(trimmed);
  const fieldTokenMatch = trimmed.match(/^(?:([!-])\s*)?([a-z]+)\b/i);
  const definition = getSearchFieldDefinition(parsed?.field || fieldTokenMatch?.[2]);
  if (!definition) {
    return { parsed, definition: null, operator: null, valueQuery: "" };
  }

  const working = fieldTokenMatch?.[1] ? trimmed.slice(1).trim() : trimmed;
  const rest = working.replace(/^[a-z]+\b/i, "").trim();
  let operator = fieldTokenMatch?.[1] ? definition.negativeOperator : definition.defaultOperator;
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

function getSearchSuggestions() {
  const trimmed = state.searchQuery.trim();
  if (!trimmed) return [];

  const suggestions = [];
  const { parsed, definition, operator, valueQuery } = getSearchDraftContext(trimmed);

  if (definition) {
    const operators = getSearchOperatorVariants(definition, operator);
    const values = getSearchFieldValues(definition.field);
    const matchedValues = valueQuery
      ? values.filter((value) => value.toLowerCase().includes(valueQuery.toLowerCase()))
      : [];

    if (valueQuery) {
      operators.forEach((variant) => {
        const token = createSearchFieldToken(definition.field, variant, valueQuery);
        suggestions.push({
          key: `typed:${definition.field}:${variant}:${valueQuery.toLowerCase()}`,
          element: createSearchSuggestionButton({
            text: getSearchTokenLabel(token),
            title: "Add this filter",
            className:
              variant === "not_contains" || variant === "not_equals"
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
          const token = createSearchFieldToken(definition.field, variant, value);
          suggestions.push({
            key: `match:${definition.field}:${variant}:${value.toLowerCase()}`,
            element: createSearchSuggestionButton({
              text: getSearchTokenLabel(token),
              title: "Use a matching value",
              className:
                variant === "not_contains" || variant === "not_equals"
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
            text: getSearchTokenLabel(createSearchFieldToken(definition.field, variant, sampleValue)),
            title: "Continue this filter",
            className:
              variant === "not_contains" || variant === "not_equals"
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
                renderSearchSuggestions();
              }
            },
          }),
        });
      });
    }
  } else if (!looksLikeStructuredSearchDraft(trimmed)) {
    const token = parsed?.kind === "text" ? parsed : { kind: "text", value: trimmed };
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
                renderSearchSuggestions();
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

function renderSearchSuggestions() {
  if (!dom.searchSuggestions || !dom.searchShell) return;

  const shouldShow = state.searchInputFocused && Boolean(state.searchQuery.trim());
  if (!shouldShow) {
    dom.searchSuggestions.replaceChildren();
    dom.searchSuggestions.style.display = "none";
    dom.searchShell.classList.remove("has-search-suggestions");
    return;
  }

  const suggestions = getSearchSuggestions().slice(0, 6);
  if (suggestions.length === 0) {
    dom.searchSuggestions.replaceChildren();
    dom.searchSuggestions.style.display = "none";
    dom.searchShell.classList.remove("has-search-suggestions");
    return;
  }

  dom.searchSuggestions.replaceChildren(...suggestions.map(({ element }) => element));
  dom.searchSuggestions.style.display = "flex";
  dom.searchShell.classList.add("has-search-suggestions");
}

function renderFilteredItems() {
  renderItems(applyClientFilters(Array.from(state.itemsById.values())));
}

async function loadItems() {
  if (state.isUnauthorized) return;

  const params = new URLSearchParams();
  if (state.selectedTags.length > 0) params.set("tags", state.selectedTags.join(","));
  if (state.excludedTags.length > 0) params.set("exclude_tags", state.excludedTags.join(","));
  if (state.selectedTypes.length > 0) params.set("types", state.selectedTypes.join(","));

  const url = `/api/items${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url).catch(() => null);
  if (!response) return;
  if (handleAuthFailure(response)) return;
  if (!response.ok) return;

  const items = await response.json();
  state.itemsById = new Map(items.map((item) => [Number(item.id), item]));
  renderItems(applyClientFilters(items));
}

async function loadTags() {
  if (state.isUnauthorized) return;

  const response = await fetch("/api/tags").catch(() => null);
  if (!response) return;
  if (handleAuthFailure(response)) return;
  if (!response.ok) return;

  const tags = await response.json();
  hasLoadedDeleteFacets = false;
  renderTagOptions(tags);
  updateTagFilterDisplay();
}

function toggleInclude(type, value) {
  const selected = `selected${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  const excluded = `excluded${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  if (state[selected].includes(value)) {
    state[selected] = state[selected].filter((v) => v !== value);
  } else {
    state[selected] = [...state[selected], value];
    state[excluded] = state[excluded].filter((v) => v !== value);
  }
  renderFilterChips();
  if (type === "domain" || type === "author") {
    renderItems(applyClientFilters(Array.from(state.itemsById.values())));
  } else {
    loadItems();
  }
}

function toggleExclude(type, value) {
  const selected = `selected${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  const excluded = `excluded${type.charAt(0).toUpperCase() + type.slice(1)}s`;
  if (state[excluded].includes(value)) {
    state[excluded] = state[excluded].filter((v) => v !== value);
  } else {
    state[excluded] = [...state[excluded], value];
    state[selected] = state[selected].filter((v) => v !== value);
  }
  renderFilterChips();
  if (type === "domain" || type === "author") {
    renderItems(applyClientFilters(Array.from(state.itemsById.values())));
  } else {
    loadItems();
  }
}

function filterByTag(tag) {
  if (state.selectedTags.includes(tag)) return;
  state.selectedTags = [...state.selectedTags, tag];
  state.excludedTags = state.excludedTags.filter((t) => t !== tag);
  updateTagDropdownState();
  updateTagFilterDisplay();
  renderFilterChips();
  loadItems();
}

function createFilterChip(text, onRemove, isExclude) {
  const chip = document.createElement("span");
  chip.className = isExclude ? "filter-chip filter-chip-exclude" : "filter-chip";
  const label = document.createElement("span");
  label.textContent = text;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "filter-chip-remove";
  btn.textContent = "×";
  btn.addEventListener("click", onRemove);
  chip.append(label, btn);
  return chip;
}

function renderFilterChips() {
  if (!dom.filterChips) return;
  const chips = [];

  for (const tag of state.selectedTags) {
    chips.push(createFilterChip(`#${tag}`, () => {
      state.selectedTags = state.selectedTags.filter((t) => t !== tag);
      updateTagDropdownState();
      updateTagFilterDisplay();
      renderFilterChips();
      loadItems();
    }, false));
  }
  for (const tag of state.excludedTags) {
    chips.push(createFilterChip(`not #${tag}`, () => {
      state.excludedTags = state.excludedTags.filter((t) => t !== tag);
      updateTagDropdownState();
      updateTagFilterDisplay();
      renderFilterChips();
      loadItems();
    }, true));
  }
  for (const d of state.selectedDomains) {
    chips.push(createFilterChip(d, () => {
      state.selectedDomains = state.selectedDomains.filter((v) => v !== d);
      renderFilterChips();
      renderItems(applyClientFilters(Array.from(state.itemsById.values())));
    }, false));
  }
  for (const d of state.excludedDomains) {
    chips.push(createFilterChip(`not ${d}`, () => {
      state.excludedDomains = state.excludedDomains.filter((v) => v !== d);
      renderFilterChips();
      renderItems(applyClientFilters(Array.from(state.itemsById.values())));
    }, true));
  }
  for (const a of state.selectedAuthors) {
    chips.push(createFilterChip(`by ${a}`, () => {
      state.selectedAuthors = state.selectedAuthors.filter((v) => v !== a);
      renderFilterChips();
      renderItems(applyClientFilters(Array.from(state.itemsById.values())));
    }, false));
  }
  for (const a of state.excludedAuthors) {
    chips.push(createFilterChip(`not by ${a}`, () => {
      state.excludedAuthors = state.excludedAuthors.filter((v) => v !== a);
      renderFilterChips();
      renderItems(applyClientFilters(Array.from(state.itemsById.values())));
    }, true));
  }

  dom.filterChips.replaceChildren(...chips);
  dom.filterChips.style.display = chips.length ? "" : "none";
}

function getDeleteChoices() {
  if (deleteBy === "tag") return (deleteFacetsData.tags || []).map((tag) => tag.name);
  if (deleteBy === "author") return deleteFacetsData.authors || [];
  if (deleteBy === "domain") return deleteFacetsData.domains || [];
  return DELETE_TYPE_VALUES;
}

function formatDeleteChoice(value) {
  if (deleteBy !== "type") return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderDeleteByOptions() {
  dom.deleteByOptions?.querySelectorAll("[data-delete-by]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.deleteBy === deleteBy);
  });
}

function renderDeleteValueOptions() {
  if (!dom.deleteValueOptions || !dom.deleteValueTextInput) return;

  const query = dom.deleteValueTextInput.value.trim().toLowerCase();
  const values = getDeleteChoices().filter((value) =>
    formatDeleteChoice(value).toLowerCase().includes(query),
  );

  if (values.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dropdown-empty";
    empty.textContent = "No matches";
    dom.deleteValueOptions.replaceChildren(empty);
    return;
  }

  const options = values.map((value) => {
    const label = document.createElement("label");
    label.className = "dropdown-option delete-value-option";
    label.dataset.deleteValue = value;
    label.classList.toggle("is-active", deleteSelectedValues.includes(value));

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = deleteSelectedValues.includes(value);

    label.append(checkbox, document.createTextNode(formatDeleteChoice(value)));
    return label;
  });

  dom.deleteValueOptions.replaceChildren(...options);
}

function updateDeleteValueUi() {
  if (!dom.deleteValueTextInput) return;
  if (deleteBy === "domain") dom.deleteValueTextInput.placeholder = "Search websites...";
  else if (deleteBy === "author") dom.deleteValueTextInput.placeholder = "Search authors...";
  else if (deleteBy === "tag") dom.deleteValueTextInput.placeholder = "Search tags...";
  else dom.deleteValueTextInput.placeholder = "Search types...";
  renderDeleteByOptions();
  renderDeleteValueOptions();
}

function getDeleteFormValue() {
  const typed = (dom.deleteValueTextInput?.value || "").trim();
  if (deleteSelectedValues.length > 0) return [...deleteSelectedValues];
  if (!typed) return [];
  if (deleteBy === "type") return [typed.toLowerCase()];
  return [typed];
}

function clearDeleteForm() {
  deleteBy = "tag";
  deleteSelectedValues = [];
  if (dom.deleteValueTextInput) dom.deleteValueTextInput.value = "";
  updateDeleteValueUi();
}

async function loadDeleteFacets() {
  if (hasLoadedDeleteFacets) return;

  const [tagsRes, facetsRes] = await Promise.all([
    fetch("/api/tags").catch(() => null),
    fetch("/api/items/facets").catch(() => null),
  ]);
  if (tagsRes?.ok) deleteFacetsData.tags = await tagsRes.json();
  if (facetsRes?.ok) {
    const f = await facetsRes.json();
    deleteFacetsData.authors = f.authors || [];
    deleteFacetsData.domains = f.domains || [];
  }

  hasLoadedDeleteFacets = true;
  updateDeleteValueUi();
}

async function openDeleteDropdown() {
  if (state.isUnauthorized) return;
  await loadDeleteFacets();
  const isOpen = dom.deleteDropdown?.classList.contains("open");
  closeAllDropdowns();
  if (isOpen) return;
  dom.deleteDropdown?.classList.add("open");
  dom.deleteValueTextInput?.focus();
}

async function confirmDeleteItems() {
  if (state.isUnauthorized) return;
  const by = deleteBy;
  const values = getDeleteFormValue();
  if (!by || values.length === 0) {
    alert("Choose at least one value.");
    return;
  }
  const preview =
    values.length === 1
      ? `"${formatDeleteChoice(values[0])}"`
      : `${values.length} selected values`;
  if (!confirm(`Delete all items where ${by} matches ${preview}? This cannot be undone.`)) return;

  const response = await fetch("/api/items/delete-by", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ by, values }),
  }).catch(() => null);
  if (!response) {
    alert("Delete failed.");
    return;
  }
  if (handleAuthFailure(response)) return;
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    alert(data.error || "Delete failed.");
    return;
  }

  hasLoadedDeleteFacets = false;
  clearDeleteForm();
  closeAllDropdowns();
  alert(data.deleted ? `Deleted ${data.deleted} item(s).` : "No matching items.");
  loadItems();
  loadTags();
}

function initDeleteDropdown() {
  dom.deleteFilterBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    void openDeleteDropdown();
  });
  dom.deleteConfirm?.addEventListener("click", () => {
    void confirmDeleteItems();
  });
  dom.deleteClear?.addEventListener("click", () => {
    clearDeleteForm();
  });
  dom.deleteByOptions?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-delete-by]");
    if (!option) return;
    deleteBy = option.dataset.deleteBy || "tag";
    deleteSelectedValues = [];
    if (dom.deleteValueTextInput) dom.deleteValueTextInput.value = "";
    updateDeleteValueUi();
    dom.deleteValueTextInput?.focus();
  });
  dom.deleteValueOptions?.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    const value = input.value;
    if (input.checked) {
      if (!deleteSelectedValues.includes(value)) {
        deleteSelectedValues = [...deleteSelectedValues, value];
      }
    } else {
      deleteSelectedValues = deleteSelectedValues.filter((item) => item !== value);
    }
    renderDeleteValueOptions();
  });
  dom.deleteValueTextInput?.addEventListener("input", () => {
    renderDeleteValueOptions();
  });
  dom.deleteValueTextInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmDeleteItems();
    }
  });
}

function openItemMenu(button, id, url) {
  if (!dom.itemDropdownMenu) return;

  state.currentDropdownItemId = id;
  state.currentDropdownItemUrl = url;

  const rect = button.getBoundingClientRect();
  dom.itemDropdownMenu.style.top = `${rect.bottom + 4}px`;
  dom.itemDropdownMenu.style.left = `${rect.right - 160}px`;
  dom.itemDropdownMenu.style.display = "block";

  document
    .querySelectorAll(".btn-more")
    .forEach((node) => {
      node.classList.remove("active");
    });
  button.classList.add("active");
}

function closeItemMenu() {
  if (!dom.itemDropdownMenu) return;

  dom.itemDropdownMenu.style.display = "none";
  state.currentDropdownItemId = null;
  state.currentDropdownItemUrl = null;
  document
    .querySelectorAll(".btn-more")
    .forEach((node) => {
      node.classList.remove("active");
    });
}

async function toggleRead(id, currentStatus) {
  if (state.isUnauthorized) return;

  const response = await fetch(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read: !currentStatus }),
  }).catch(() => null);
  if (!response) return;
  if (handleAuthFailure(response)) return;

  loadItems();
}

async function deleteItem(id) {
  if (state.isUnauthorized) return;
  if (!confirm("Delete this item?")) return;
  const response = await fetch(`/api/items/${id}`, { method: "DELETE" }).catch(
    () => null,
  );
  if (!response) return;
  if (handleAuthFailure(response)) return;

  loadItems();
  loadTags();
}

async function openEditModal(id) {
  if (state.isUnauthorized) return;

  const response = await fetch(`/api/items/${id}`).catch(() => null);
  if (!response) return;
  if (handleAuthFailure(response)) return;
  if (!response.ok || !dom.editModal) return;

  const item = await response.json();

  if (dom.editIdInput) dom.editIdInput.value = item.id;
  if (dom.editUrlInput) dom.editUrlInput.value = item.url;
  if (dom.editTitleInput) dom.editTitleInput.value = item.title || "";
  if (dom.editTypeSelect) dom.editTypeSelect.value = item.type;

  state.editTags.length = 0;
  if (Array.isArray(item.tags)) {
    state.editTags.push(...item.tags);
  }
  renderTagPills(state.editTags, dom.editTagsContainer, dom.editTagInput);
  dom.editModal.style.display = "flex";
}

function closeEditModal() {
  if (!dom.editModal || !dom.editForm) return;

  dom.editModal.style.display = "none";
  dom.editForm.reset();
  state.editTags.length = 0;
  renderTagPills(state.editTags, dom.editTagsContainer, dom.editTagInput);
}

function initDropdowns() {
  dom.typeOptions?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateSelectedTypes();
      loadItems();
    });
  });

  dom.typeFilterBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = dom.typeDropdown?.classList.contains("open");
    closeAllDropdowns();
    if (!isOpen) {
      dom.typeDropdown?.classList.add("open");
      dom.typeSearch?.focus();
    }
  });

  dom.tagFilterBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = dom.tagDropdown?.classList.contains("open");
    closeAllDropdowns();
    if (!isOpen) {
      dom.tagDropdown?.classList.add("open");
      dom.tagSearch?.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-dropdown")) {
      closeAllDropdowns();
    }
  });

  dom.typeSearch?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    dom.typeOptions?.querySelectorAll(".dropdown-option").forEach((option) => {
      const value = option.dataset.value || option.textContent.toLowerCase();
      option.style.display = value.includes(query) ? "" : "none";
    });
  });

  dom.tagSearch?.addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase();
    dom.tagOptions?.querySelectorAll(".dropdown-option").forEach((option) => {
      const value = option.dataset.value || "";
      option.style.display = value.includes(query) ? "" : "none";
    });
  });

  dom.typeClear?.addEventListener("click", () => {
    dom.typeOptions?.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
    });
    state.selectedTypes = [];
    updateTypeFilterDisplay();
    loadItems();
  });

  dom.tagClear?.addEventListener("click", () => {
    state.selectedTags = [];
    state.excludedTags = [];
    updateTagDropdownState();
    updateTagFilterDisplay();
    renderFilterChips();
    loadItems();
  });
}

function initSearch() {
  if (!dom.searchInput || !dom.searchShell) return;

  let searchDebounce = null;
  dom.searchShell.addEventListener("click", () => {
    dom.searchInput?.focus();
  });
  dom.searchInput.addEventListener("focus", () => {
    state.searchInputFocused = true;
    renderSearchSuggestions();
  });
  dom.searchInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      state.searchInputFocused = false;
      renderSearchSuggestions();
    }, 120);
  });
  dom.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value || "";
    renderSearchSuggestions();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      renderFilteredItems();
    }, 90);
  });
  dom.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      if (!state.searchQuery.trim()) return;
      const committed = commitSearchDraft();
      if (committed) event.preventDefault();
      return;
    }

    if (event.key === "Backspace" && !state.searchQuery && state.searchTokens.length > 0) {
      event.preventDefault();
      removeSearchToken(state.searchTokens.length - 1);
      dom.searchInput?.focus();
    }
  });
}

function initViewTabs(app) {
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

function initItemMenu() {
  dom.dropdownEdit?.addEventListener("click", () => {
    if (state.currentDropdownItemId) {
      openEditModal(state.currentDropdownItemId);
    }
    closeItemMenu();
  });

  dom.dropdownOpenUrl?.addEventListener("click", () => {
    if (state.currentDropdownItemUrl) {
      const safeUrl = getAuthorizedItemUrl(state.currentDropdownItemUrl);
      if (safeUrl) {
        window.open(safeUrl, "_blank", "noopener");
      }
    }
    closeItemMenu();
  });

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".item-dropdown-menu") &&
      !event.target.closest(".btn-more")
    ) {
      closeItemMenu();
    }
  });
}

function initItemsList(app) {
  dom.itemsList?.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const itemEl = actionEl.closest(".item");
    const itemId = Number(itemEl?.dataset.id);
    const item = state.itemsById.get(itemId);
    if (!item) return;

    const action = actionEl.dataset.action;
    if (action === "open-reader") {
      app.openReader?.(item.id, item.url, item.title || item.url, item.type);
      return;
    }

    if (action === "filter-tag") {
      filterByTag(actionEl.dataset.tag || "");
      return;
    }

    if (action === "toggle-read") {
      toggleRead(item.id, item.is_read);
      return;
    }

    if (action === "delete-item") {
      deleteItem(item.id);
      return;
    }

    if (action === "open-menu") {
      event.stopPropagation();
      openItemMenu(actionEl, item.id, item.url);
    }
  });
}

function initEditModal() {
  setupTagInput(dom.editTagInput, state.editTags, dom.editTagsContainer);
  renderTagPills(state.editTags, dom.editTagsContainer, dom.editTagInput);

  dom.modalClose?.addEventListener("click", closeEditModal);
  dom.modalCancel?.addEventListener("click", closeEditModal);
  dom.editModal?.addEventListener("click", (event) => {
    if (event.target === dom.editModal) closeEditModal();
  });

  dom.editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.isUnauthorized) {
      showUnauthorizedState(state.authMessage);
      return;
    }

    const payload = {
      url: dom.editUrlInput?.value.trim() || "",
      title: dom.editTitleInput?.value.trim() || "",
      type: dom.editTypeSelect?.value || "article",
      tags: state.editTags,
    };

    const response = await fetch(`/api/items/${dom.editIdInput?.value}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!response) return;
    if (handleAuthFailure(response)) return;

    closeEditModal();
    loadItems();
    loadTags();
  });
}

export function initList(app) {
  app.loadItems = loadItems;
  app.loadTags = loadTags;
  app.showView = showView;
  app.closeEditModal = closeEditModal;
  app.closeItemMenu = closeItemMenu;

  initDropdowns();
  initSearch();
  initViewTabs(app);
  initItemMenu();
  initItemsList(app);
  initEditModal();
  renderSearchTokenList();
  renderSearchSuggestions();
  updateSelectedTypes();
  updateSelectedTags();

  initDeleteDropdown();
}
