import { state } from "./shared.js";

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout(promise, ms, message) {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isValidUrl(value) {
  return URL.canParse(value);
}

export function getSupportedUploadFiles(fileList) {
  return Array.from(fileList || []).filter((file) =>
    /\.(pdf|epub)$/i.test(file.name || ""),
  );
}

export function parseTitleAuthorFromFilename(name) {
  const base = (name || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = base
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return { author: parts[0], title: parts.slice(1).join(" - ") };
  }

  return { title: base, author: "" };
}

export function setupTagInput(input, tagArray, container) {
  if (!input || !container) return;

  let activeSuggestionIndex = -1;

  const suggestionsEl = document.createElement("div");
  suggestionsEl.className = "tag-suggestions";
  suggestionsEl.style.display = "none";
  container.appendChild(suggestionsEl);

  const getMatchingSuggestions = () => {
    const query = input.value.trim().toLowerCase();
    const source = Array.isArray(state.availableTags) ? state.availableTags : [];
    if (!query) return [];

    return source
      .filter((tag) => {
        const normalized = String(tag || "").trim().toLowerCase();
        return normalized && !tagArray.includes(normalized) && normalized.includes(query);
      })
      .sort((left, right) => {
        const leftStarts = left.startsWith(query) ? 0 : 1;
        const rightStarts = right.startsWith(query) ? 0 : 1;
        if (leftStarts !== rightStarts) return leftStarts - rightStarts;
        return left.localeCompare(right);
      })
      .slice(0, 6);
  };

  const closeSuggestions = () => {
    activeSuggestionIndex = -1;
    suggestionsEl.replaceChildren();
    suggestionsEl.style.display = "none";
    container.classList.remove("has-tag-suggestions");
  };

  const addTag = (rawTag) => {
    const tag = String(rawTag || "").trim().toLowerCase();
    if (!tag || tagArray.includes(tag)) return false;
    tagArray.push(tag);
    renderTagPills(tagArray, container, input);
    input.value = "";
    closeSuggestions();
    return true;
  };

  const commitActiveOrTypedTag = () => {
    const suggestions = getMatchingSuggestions();
    if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
      return addTag(suggestions[activeSuggestionIndex]);
    }
    return addTag(input.value);
  };

  const renderSuggestions = () => {
    const suggestions = getMatchingSuggestions();
    if (suggestions.length === 0) {
      closeSuggestions();
      return;
    }

    if (activeSuggestionIndex >= suggestions.length) {
      activeSuggestionIndex = suggestions.length - 1;
    }

    const items = suggestions.map((tag, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        index === activeSuggestionIndex
          ? "tag-suggestion is-active"
          : "tag-suggestion";
      button.textContent = tag;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        addTag(tag);
        input.focus();
      });
      return button;
    });

    suggestionsEl.replaceChildren(...items);
    suggestionsEl.style.display = "flex";
    container.classList.add("has-tag-suggestions");
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      commitActiveOrTypedTag();
      return;
    }

    if (event.key === "ArrowDown") {
      const suggestions = getMatchingSuggestions();
      if (suggestions.length === 0) return;
      event.preventDefault();
      activeSuggestionIndex =
        activeSuggestionIndex >= suggestions.length - 1 ? 0 : activeSuggestionIndex + 1;
      renderSuggestions();
      return;
    }

    if (event.key === "ArrowUp") {
      const suggestions = getMatchingSuggestions();
      if (suggestions.length === 0) return;
      event.preventDefault();
      activeSuggestionIndex =
        activeSuggestionIndex <= 0 ? suggestions.length - 1 : activeSuggestionIndex - 1;
      renderSuggestions();
      return;
    }

    if (event.key === "Escape") {
      closeSuggestions();
      return;
    }

    if (
      event.key === "Backspace" &&
      input.value === "" &&
      tagArray.length > 0
    ) {
      tagArray.pop();
      renderTagPills(tagArray, container, input);
    }
  });

  input.addEventListener("input", () => {
    activeSuggestionIndex = -1;
    renderSuggestions();
  });

  input.addEventListener("focus", () => {
    renderSuggestions();
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      closeSuggestions();
    }, 120);
  });
}

export function renderTagPills(tagArray, container, input) {
  if (!container || !input) return;

  container.querySelectorAll(".tag-pill").forEach((pill) => {
    pill.remove();
  });
  tagArray.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = tag;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "×";
    button.addEventListener("click", () => {
      const index = tagArray.indexOf(tag);
      if (index !== -1) tagArray.splice(index, 1);
      renderTagPills(tagArray, container, input);
    });

    pill.appendChild(button);
    container.insertBefore(pill, input);
  });
}

export const searchFieldDefinitions = Object.freeze([
  {
    field: "type",
    label: "type",
    aliases: ["type", "kind"],
    defaultOperator: "equals",
    negativeOperator: "not_equals",
    supportedOperators: ["equals", "not_equals"],
  },
  {
    field: "website",
    label: "website",
    aliases: ["website", "site", "domain"],
    defaultOperator: "contains",
    negativeOperator: "not_contains",
    supportedOperators: ["contains", "equals", "not_contains", "not_equals"],
  },
  {
    field: "title",
    label: "title",
    aliases: ["title"],
    defaultOperator: "contains",
    negativeOperator: "not_contains",
    supportedOperators: ["contains", "equals", "not_contains", "not_equals"],
  },
  {
    field: "author",
    label: "author",
    aliases: ["author", "by"],
    defaultOperator: "contains",
    negativeOperator: "not_contains",
    supportedOperators: ["contains", "equals", "not_contains", "not_equals"],
  },
  {
    field: "tag",
    label: "tag",
    aliases: ["tag", "tags"],
    defaultOperator: "equals",
    negativeOperator: "not_equals",
    supportedOperators: ["equals", "contains", "not_equals", "not_contains"],
  },
]);

const searchFieldAliasMap = searchFieldDefinitions.reduce((map, definition) => {
  definition.aliases.forEach((alias) => {
    map[alias] = definition;
  });
  return map;
}, {});

const searchOperatorDefinitions = [
  { raw: "does not contain", operator: "not_contains" },
  { raw: "not contains", operator: "not_contains" },
  { raw: "not contain", operator: "not_contains" },
  { raw: "not_contains", operator: "not_contains" },
  { raw: "not", operator: "negate" },
  { raw: "is not", operator: "not_equals" },
  { raw: "!=", operator: "not_equals" },
  { raw: "!~", operator: "not_contains" },
  { raw: "!", operator: "negate" },
  { raw: "contains", operator: "contains" },
  { raw: "equals", operator: "equals" },
  { raw: "==", operator: "equals" },
  { raw: "is", operator: "equals" },
  { raw: "~", operator: "contains" },
  { raw: "=", operator: "equals" },
];

function stripWrappingQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeSearchValue(value) {
  return stripWrappingQuotes(value).replace(/\s+/g, " ").trim();
}

function resolveSearchField(fieldName) {
  return searchFieldAliasMap[String(fieldName || "").trim().toLowerCase()] || null;
}

function getSearchOperatorLabel(operator) {
  if (operator === "equals") return "=";
  if (operator === "not_equals") return "!=";
  if (operator === "not_contains") return "!~";
  return "~";
}

export function looksLikeStructuredSearchDraft(input) {
  const trimmed = String(input || "").trim().toLowerCase();
  if (!trimmed) return false;
  const match = trimmed.match(/^(?:(?:!|-)\s*)?([a-z]+)/);
  if (!match) return false;
  return Boolean(resolveSearchField(match[1]));
}

export function parseSearchTokenDraft(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  const negatedPrefixMatch = trimmed.match(/^([!-])\s*(.+)$/);
  const negatedPrefix = Boolean(negatedPrefixMatch);
  const working = negatedPrefix ? negatedPrefixMatch[2].trim() : trimmed;
  const fieldMatch = working.match(/^([a-z]+)\b/i);

  if (!fieldMatch) {
    return { kind: "text", value: normalizeSearchValue(working) };
  }

  const definition = resolveSearchField(fieldMatch[1]);
  if (!definition) {
    return { kind: "text", value: normalizeSearchValue(trimmed) };
  }

  let rest = working.slice(fieldMatch[0].length).trim();
  if (!rest) return null;

  let operator = null;
  const lowerRest = rest.toLowerCase();
  const operatorMatch = searchOperatorDefinitions.find(({ raw }) => {
    if (!lowerRest.startsWith(raw)) return false;
    const next = lowerRest.charAt(raw.length);
    return !next || /\s/.test(next);
  });

  if (operatorMatch) {
    operator =
      operatorMatch.operator === "negate"
        ? definition.negativeOperator
        : operatorMatch.operator;
    rest = rest.slice(operatorMatch.raw.length).trim();
  }

  const value = normalizeSearchValue(rest);
  if (!value) return null;

  if (!operator) {
    operator = negatedPrefix
      ? definition.negativeOperator
      : definition.defaultOperator;
  } else if (negatedPrefix) {
    operator =
      operator === "equals"
        ? "not_equals"
        : operator === "contains"
          ? "not_contains"
          : operator;
  }

  return {
    kind: "field",
    field: definition.field,
    operator,
    value,
  };
}

export function getSearchTokenLabel(token) {
  if (!token) return "";
  if (token.kind === "text") {
    return `text contains ${JSON.stringify(token.value)}`;
  }
  return `${token.field} ${getSearchOperatorLabel(token.operator)} ${JSON.stringify(token.value)}`;
}

function getSearchItemValues(item, field) {
  if (field === "title") return [item.title || ""];
  if (field === "author") return [item.author || ""];
  if (field === "type") return [item.type || ""];
  if (field === "website") return [getDomain(item.url)];
  if (field === "tag") return Array.isArray(item.tags) ? item.tags : [];
  return [];
}

function tokenMatchesValue(values, token) {
  const needle = String(token.value || "").toLowerCase();
  if (!needle) return true;

  const normalized = values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (token.operator === "equals") {
    return normalized.some((value) => value === needle);
  }
  if (token.operator === "not_equals") {
    return normalized.every((value) => value !== needle);
  }
  if (token.operator === "not_contains") {
    return normalized.every((value) => !value.includes(needle));
  }
  return normalized.some((value) => value.includes(needle));
}

function matchesSearchToken(item, token) {
  if (!token) return true;
  if (token.kind === "text") {
    const combined =
      `${item.title || ""} ${item.author || ""} ${item.url || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return combined.includes(String(token.value || "").toLowerCase());
  }
  return tokenMatchesValue(getSearchItemValues(item, token.field), token);
}

function parseFreeTextTerms(input) {
  const terms = [];
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match = null;

  while (true) {
    match = pattern.exec(input);
    if (!match) break;
    const value = normalizeSearchValue(match[1] || match[2] || match[3] || "");
    if (value) terms.push(value.toLowerCase());
  }

  return terms;
}

export function applySearch(items, query, tokens = []) {
  const trimmed = String(query || "").trim();
  const draftToken = parseSearchTokenDraft(trimmed);
  const freeTerms =
    trimmed && (!draftToken || draftToken.kind === "text") && !looksLikeStructuredSearchDraft(trimmed)
      ? parseFreeTextTerms(trimmed)
      : [];

  return items.filter((item) => {
    for (const token of tokens) {
      if (!matchesSearchToken(item, token)) return false;
    }

    if (draftToken && draftToken.kind === "field") {
      return matchesSearchToken(item, draftToken);
    }

    if (freeTerms.length === 0) return true;

    const combined =
      `${item.title || ""} ${item.author || ""} ${item.url || ""} ${(item.tags || []).join(" ")}`.toLowerCase();

    return freeTerms.every((term) => combined.includes(term));
  });
}

export function parseReadingProgress(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "object" || typeof raw === "number") return raw;
  if (typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value) return null;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof value === "object" || typeof value === "number") return value;
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      value = JSON.parse(trimmed);
      continue;
    } catch {
      // Keep parsing through the legacy fallbacks below.
    }

    let decoded = trimmed;
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      decoded = trimmed;
    }

    if (decoded !== trimmed) {
      try {
        value = JSON.parse(decoded);
        continue;
      } catch {
        decoded = trimmed;
      }
    }

    const numeric = Number.parseFloat(trimmed.replace("%", ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return typeof value === "object" || typeof value === "number"
    ? value
    : null;
}

export function clampProgressRatio(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function getItemProgressInfo(item) {
  if (!item || item.type === "video" || item.type === "podcast") return null;

  const progress = parseReadingProgress(item.reading_progress);
  if (!progress || typeof progress !== "object") {
    return { ratio: 0, label: "0%" };
  }

  if (progress.kind === "epub") {
    if (
      typeof progress.page === "number" &&
      typeof progress.total === "number" &&
      progress.total > 0
    ) {
      const ratio = clampProgressRatio(progress.page / progress.total);
      return { ratio, label: `${progress.page}/${progress.total}` };
    }

    const ratio = clampProgressRatio(progress.percentage);
    return { ratio, label: `${Math.round(ratio * 100)}%` };
  }

  if (progress.kind === "article" || progress.kind === "pdf") {
    const ratio = clampProgressRatio(progress.ratio);
    return { ratio, label: `${Math.round(ratio * 100)}%` };
  }

  return { ratio: 0, label: "0%" };
}

export function renderItemProgressMeta(item) {
  const info = getItemProgressInfo(item);
  if (!info) return null;

  const stack = document.createElement("div");
  stack.className = "item-progress-stack";
  stack.title = "Reading progress";

  const label = document.createElement("span");
  label.className = "item-progress-label";
  label.textContent = info.label;

  const bar = document.createElement("span");
  bar.className = "item-progress-bar";

  const fill = document.createElement("span");
  fill.className = "item-progress-fill";
  fill.style.width = `${Math.round(info.ratio * 100)}%`;

  bar.appendChild(fill);
  stack.append(label, bar);
  return stack;
}

export function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function getDomain(url) {
  if (typeof url === "string" && url.startsWith("/uploads/")) {
    return "Local file";
  }

  if (URL.canParse(url)) {
    return new URL(url).hostname.replace("www.", "");
  }

  if (typeof url === "string" && url.startsWith("/")) return "Local file";
  return String(url || "").substring(0, 30);
}

export function getAuthorizedItemUrl(url) {
  if (typeof url !== "string" || !url) return "";
  if (!url.startsWith("/uploads/")) return url;

  const filename = url.slice("/uploads/".length);
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) return "";

  return `/api/uploads/${encodeURIComponent(filename)}`;
}

export function createEmptyState(title, hint = "", className = "empty-state") {
  const wrapper = document.createElement("div");
  wrapper.className = className;

  const titleEl = document.createElement("p");
  titleEl.textContent = title;
  wrapper.appendChild(titleEl);

  if (hint) {
    const hintEl = document.createElement("p");
    hintEl.className = "empty-hint";
    hintEl.textContent = hint;
    wrapper.appendChild(hintEl);
  }

  return wrapper;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgNode(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

export function createSvgIcon(attributes, children) {
  const svg = createSvgNode("svg", attributes);
  children.forEach(({ name, attributes: childAttributes }) => {
    svg.appendChild(createSvgNode(name, childAttributes));
  });
  return svg;
}

export function extractUrlFromText(text) {
  if (!text) return "";
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

export function getIframeDocument(iframe) {
  return iframe?.contentDocument || iframe?.contentWindow?.document || null;
}

export function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}
