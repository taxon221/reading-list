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

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const tag = input.value.trim().toLowerCase();
      if (tag && !tagArray.includes(tag)) {
        tagArray.push(tag);
        renderTagPills(tagArray, container, input);
      }
      input.value = "";
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

export function parseSearchQuery(input) {
  const fieldTokens = [];
  const freeTerms = [];
  const pattern =
    /(?:(title|author|url)\s*:\s*(~)?)\s*(?:"([^"]*)"|(\S+))|(?:"([^"]*)"|(\S+))/gi;
  let match = null;

  while (true) {
    match = pattern.exec(input);
    if (match === null) break;

    const field = (match[1] || "").toLowerCase();
    const isRegex = Boolean(match[2]);
    const fieldValue = (match[3] || match[4] || "").trim();
    const freeValue = (match[5] || match[6] || "").trim();

    if (field && fieldValue) {
      fieldTokens.push({ field, isRegex, value: fieldValue });
      continue;
    }

    if (freeValue) freeTerms.push(freeValue);
  }

  return { fieldTokens, freeTerms };
}

export function safeRegex(pattern) {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function getItemFieldValue(item, field) {
  if (field === "title") return item.title || "";
  if (field === "author") return item.author || "";
  if (field === "url") return item.url || "";
  return "";
}

export function applySearch(items, query) {
  const trimmed = query.trim();
  if (!trimmed) return items;

  const parsed = parseSearchQuery(trimmed);
  if (parsed.fieldTokens.length === 0 && parsed.freeTerms.length === 0) {
    return items;
  }

  return items.filter((item) => {
    for (const token of parsed.fieldTokens) {
      const haystack = getItemFieldValue(item, token.field);
      if (token.isRegex) {
        const regex = safeRegex(token.value);
        if (!regex || !regex.test(haystack)) return false;
      } else if (haystack.trim().toLowerCase() !== token.value.toLowerCase()) {
        return false;
      }
    }

    if (parsed.freeTerms.length === 0) return true;

    const combined =
      `${item.title || ""} ${item.author || ""} ${item.url || ""}`.toLowerCase();

    return parsed.freeTerms.every((term) =>
      combined.includes(term.toLowerCase()),
    );
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
