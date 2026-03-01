let selectedTypes = [];
let selectedTags = [];
let pendingTags = [];
let editTags = [];
let fetchedMeta = null;
let isFetching = false;
let currentDropdownItemId = null;
let currentDropdownItemUrl = null;
let currentReaderId = null;
let readerIframe = null;
let currentHighlights = [];
let pendingSelectionText = "";
let searchQuery = "";
let currentEpubBook = null;
let currentEpubRendition = null;
let pendingUploadFile = null;

const form = document.getElementById("add-item-form");
const urlInput = document.getElementById("url");
const titleInput = document.getElementById("title");
const authorInput = document.getElementById("author");
const typeSelect = document.getElementById("type-select");
const tagInput = document.getElementById("tag-input");
const tagsContainer = document.getElementById("tags-input");
const submitBtn = document.getElementById("submit-btn");
const itemsList = document.getElementById("items-list");
const searchInput = document.getElementById("search-input");
const fileUploadInput = document.getElementById("file-upload-input");
const addFormSection = document.querySelector(".add-form");
const defaultUrlPlaceholder =
  urlInput?.getAttribute("placeholder") || "Paste a URL...";

const typeDropdown = document.getElementById("type-dropdown");
const typeFilterBtn = document.getElementById("type-filter-btn");
const typeFilterValue = document.getElementById("type-filter-value");
const typeMenu = document.getElementById("type-menu");
const typeSearch = document.getElementById("type-search");
const typeOptions = document.getElementById("type-options");
const typeClear = document.getElementById("type-clear");

const tagDropdown = document.getElementById("tag-dropdown");
const tagFilterBtn = document.getElementById("tag-filter-btn");
const tagFilterValue = document.getElementById("tag-filter-value");
const tagMenu = document.getElementById("tag-menu");
const tagSearch = document.getElementById("tag-search");
const tagOptions = document.getElementById("tag-options");
const tagClear = document.getElementById("tag-clear");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editIdInput = document.getElementById("edit-id");
const editUrlInput = document.getElementById("edit-url");
const editTitleInput = document.getElementById("edit-title");
const editTypeSelect = document.getElementById("edit-type");
const editTagInput = document.getElementById("edit-tag-input");
const editTagsContainer = document.getElementById("edit-tags-input");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");

const readerModal = document.getElementById("reader-modal");
const readerTitle = document.getElementById("reader-title");
const readerContent = document.getElementById("reader-content");
const readerClose = document.getElementById("reader-close");
const readerOpenOriginal = document.getElementById("reader-open-original");
const readerSidebar = document.getElementById("reader-sidebar");
const readerToggleNotes = document.getElementById("reader-toggle-notes");
const sidebarHighlights = document.getElementById("sidebar-highlights");
const highlightsCount = document.getElementById("highlights-count");

const itemDropdownMenu = document.getElementById("item-dropdown-menu");
const dropdownEdit = document.getElementById("dropdown-edit");
const dropdownOpenUrl = document.getElementById("dropdown-open-url");

const selectionPopup = document.getElementById("selection-popup");
const popupHighlightBtn = document.getElementById("popup-highlight-btn");

const noteModal = document.getElementById("note-modal");
const noteModalClose = document.getElementById("note-modal-close");
const noteModalQuote = document.getElementById("note-modal-quote");
const noteModalText = document.getElementById("note-modal-text");
const noteModalCancel = document.getElementById("note-modal-cancel");
const noteModalSave = document.getElementById("note-modal-save");

const viewTabs = document.querySelectorAll(".view-tab");
const readingListView = document.getElementById("reading-list-view");
const notesView = document.getElementById("notes-view");
const notesList = document.getElementById("notes-list");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");

if (importBtn && importFile) {
  importBtn.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;

    const originalText = importBtn.textContent;
    importBtn.disabled = true;
    importBtn.textContent = "Importing...";

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/import/readwise", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.error || "Import failed.");
        return;
      }

      alert(
        `Imported ${data.imported} items. Duplicates: ${data.duplicate}. Skipped: ${data.skipped}. Errors: ${data.errors}.`,
      );
      loadItems();
      loadTags();
    } catch {
      alert("Import failed. Please try again.");
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = originalText || "Import CSV";
      importFile.value = "";
    }
  });
}

if (fileUploadInput) {
  fileUploadInput.addEventListener("change", () => {
    const files = fileUploadInput.files;
    if (files && files.length > 0) stageSelectedFiles(files);
  });
}

function preventDropDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

if (addFormSection) {
  ["dragenter", "dragover"].forEach((eventName) => {
    addFormSection.addEventListener(eventName, (event) => {
      preventDropDefaults(event);
      addFormSection.classList.add("drag-over");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    addFormSection.addEventListener(eventName, (event) => {
      preventDropDefaults(event);
      addFormSection.classList.remove("drag-over");
    });
  });

  addFormSection.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) stageSelectedFiles(files);
  });
}

async function fetchMetadata(url) {
  if (!url || !isValidUrl(url)) return null;
  try {
    const response = await fetch(
      `/api/fetch-meta?url=${encodeURIComponent(url)}`,
    );
    return await response.json();
  } catch {
    return null;
  }
}

function getSupportedUploadFiles(fileList) {
  return Array.from(fileList || []).filter((file) =>
    /\.(pdf|epub)$/i.test(file.name || ""),
  );
}

function parseTitleAuthorFromFilename(name) {
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

function clearPendingUploadFile() {
  pendingUploadFile = null;
  urlInput.placeholder = defaultUrlPlaceholder;
  if (fileUploadInput) fileUploadInput.value = "";
}

function stageSelectedFiles(fileList) {
  const files = getSupportedUploadFiles(fileList);
  if (files.length === 0) {
    alert("Please choose a PDF or EPUB file.");
    return;
  }

  if (files.length > 1) {
    alert("Please choose one file at a time.");
  }

  const file = files[0];
  pendingUploadFile = file;
  urlInput.value = "";
  urlInput.placeholder = `Selected file: ${file.name}`;

  const parsed = parseTitleAuthorFromFilename(file.name);
  if (!titleInput.value.trim()) titleInput.value = parsed.title || file.name;
  if (!authorInput.value.trim() && parsed.author)
    authorInput.value = parsed.author;
  typeSelect.value = file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "ebook";
}

async function addPendingUploadFile() {
  if (!pendingUploadFile) return;

  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Adding...";

  try {
    const formData = new FormData();
    formData.append("file", pendingUploadFile);
    formData.append("tags", JSON.stringify(pendingTags));
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    if (title) formData.append("title", title);
    if (author) formData.append("author", author);

    const response = await fetch("/api/import/file", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const failed = (data.failed_files || [])
        .map((entry) => `- ${entry.name}: ${entry.reason}`)
        .join("\n");
      const message = [
        data.error || "File upload failed.",
        failed ? `\n${failed}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      alert(message);
      return;
    }

    if (
      (data.skipped || 0) > 0 ||
      (data.failed_files && data.failed_files.length)
    ) {
      const failed = (data.failed_files || [])
        .map((entry) => `- ${entry.name}: ${entry.reason}`)
        .join("\n");
      const message = [
        `Imported ${data.imported || 0} file(s).`,
        data.skipped ? `Skipped ${data.skipped} file(s).` : "",
        failed ? `\nDetails:\n${failed}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      alert(message);
    }

    form.reset();
    pendingTags = [];
    renderTagPills(pendingTags, tagsContainer, tagInput);
    fetchedMeta = null;
    clearPendingUploadFile();
    loadItems();
    loadTags();
  } catch {
    alert("File upload failed. Please try again.");
  } finally {
    if (fileUploadInput) fileUploadInput.value = "";
    submitBtn.disabled = false;
    submitBtn.textContent = originalText || "Add";
  }
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

let fetchTimeout = null;
urlInput.addEventListener("input", (e) => {
  const url = e.target.value.trim();
  if (fetchTimeout) clearTimeout(fetchTimeout);
  fetchedMeta = null;

  if (url && pendingUploadFile) {
    clearPendingUploadFile();
  }

  if (!url || !isValidUrl(url)) {
    if (!pendingUploadFile) {
      titleInput.value = "";
      authorInput.value = "";
      typeSelect.value = "article";
    }
    return;
  }

  fetchTimeout = setTimeout(async () => {
    isFetching = true;
    submitBtn.textContent = "...";
    const meta = await fetchMetadata(url);
    if (meta && urlInput.value.trim() === url) {
      fetchedMeta = meta;
      titleInput.value = meta.title || "";
      authorInput.value = meta.author || "";
      typeSelect.value = meta.type || "article";
    }
    isFetching = false;
    submitBtn.textContent = "Add";
  }, 300);
});

function setupTagInput(input, tagArray, container) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const tag = input.value.trim().toLowerCase();
      if (tag && !tagArray.includes(tag)) {
        tagArray.push(tag);
        renderTagPills(tagArray, container, input);
      }
      input.value = "";
    } else if (
      e.key === "Backspace" &&
      input.value === "" &&
      tagArray.length > 0
    ) {
      tagArray.pop();
      renderTagPills(tagArray, container, input);
    }
  });
}

function renderTagPills(tagArray, container, input) {
  container.querySelectorAll(".tag-pill").forEach((p) => p.remove());
  tagArray.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.innerHTML = `${escapeHtml(tag)}<button type="button">×</button>`;
    pill.querySelector("button").addEventListener("click", () => {
      const idx = tagArray.indexOf(tag);
      if (idx > -1) tagArray.splice(idx, 1);
      renderTagPills(tagArray, container, input);
    });
    container.insertBefore(pill, input);
  });
}

setupTagInput(tagInput, pendingTags, tagsContainer);
setupTagInput(editTagInput, editTags, editTagsContainer);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) {
    if (pendingUploadFile) {
      await addPendingUploadFile();
      return;
    }
    if (fileUploadInput) fileUploadInput.click();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Adding...";

  try {
    if (isFetching) await new Promise((r) => setTimeout(r, 500));

    let title = titleInput.value.trim();
    let author = authorInput.value.trim() || fetchedMeta?.author || "";
    let type = typeSelect.value;

    if (!title && !fetchedMeta) {
      const meta = await fetchMetadata(url);
      if (meta) {
        title = meta.title || "";
        author = author || meta.author || "";
        type = meta.type || type;
      }
    }

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title, author, type, tags: pendingTags }),
    });

    if (response.ok) {
      form.reset();
      pendingTags = [];
      renderTagPills(pendingTags, tagsContainer, tagInput);
      fetchedMeta = null;
      clearPendingUploadFile();
      loadItems();
      loadTags();
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add";
  }
});

function parseSearchQuery(input) {
  const fieldTokens = [];
  const freeTerms = [];
  const pattern =
    /(?:(title|author|url)\s*:\s*(~)?)\s*(?:"([^"]*)"|(\S+))|(?:"([^"]*)"|(\S+))/gi;
  let match;

  while ((match = pattern.exec(input)) !== null) {
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

function safeRegex(pattern) {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function getItemFieldValue(item, field) {
  if (field === "title") return item.title || "";
  if (field === "author") return item.author || "";
  if (field === "url") return item.url || "";
  return "";
}

function applySearch(items) {
  const query = searchQuery.trim();
  if (!query) return items;

  const parsed = parseSearchQuery(query);
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

async function loadItems() {
  const params = new URLSearchParams();
  if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
  if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
  const url = `/api/items${params.toString() ? "?" + params.toString() : ""}`;
  const response = await fetch(url);
  const items = await response.json();
  renderItems(applySearch(items));
}

async function loadTags() {
  const response = await fetch("/api/tags");
  const tags = await response.json();
  renderTagOptions(tags);
}

function renderItems(items) {
  if (items.length === 0) {
    itemsList.innerHTML = `
      <div class="empty-state">
        <p>No items yet</p>
        <p class="empty-hint">Paste a URL above to get started</p>
      </div>
    `;
    return;
  }

  itemsList.innerHTML = items
    .map(
      (item) => `
    <article class="item ${item.is_read ? "read" : ""}" data-id="${item.id}">
      <div class="item-content">
        <div class="item-col-left">
          <span class="item-type type-${item.type}">${item.type}</span>
          <span class="item-date">${formatDate(item.created_at)}</span>
        </div>
        <div class="item-col-right">
          <span class="item-title" onclick="openReader(${item.id}, '${escapeHtml(item.url).replace(/'/g, "\\'")}', '${escapeHtml(item.title || item.url).replace(/'/g, "\\'")}', '${item.type}')">
            ${escapeHtml(item.title || item.url)}
          </span>
          <div class="item-meta">
            <span class="item-domain">${escapeHtml(getDomain(item.url))}</span>
            ${item.highlight_count ? `<span class="item-has-highlights" title="${item.highlight_count} highlight${item.highlight_count > 1 ? "s" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg> ${item.highlight_count}</span>` : ""}
            ${item.tags?.length ? item.tags.map((t) => `<button class="item-tag" onclick="filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</button>`).join("") : ""}
          </div>
        </div>
      </div>
      <div class="item-actions">
        <div class="item-actions-row">
          <button class="btn-action ${item.is_read ? "is-read" : ""}" onclick="toggleRead(${item.id}, ${item.is_read})" title="${item.is_read ? "Mark unread" : "Mark read"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
          </button>
          <button class="btn-action btn-delete" onclick="deleteItem(${item.id})" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
        <button class="btn-more" onclick="openItemMenu(event, ${item.id}, '${escapeHtml(item.url).replace(/'/g, "\\'")}')" title="More options">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
        </button>
      </div>
    </article>
  `,
    )
    .join("");
}

function renderTagOptions(tags) {
  tagOptions.innerHTML = tags
    .map(
      (tag) => `
    <label class="dropdown-option" data-value="${escapeHtml(tag.name)}">
      <input type="checkbox" value="${escapeHtml(tag.name)}" ${selectedTags.includes(tag.name) ? "checked" : ""} />
      ${escapeHtml(tag.name)} <span class="option-count">${tag.count}</span>
    </label>
  `,
    )
    .join("");

  if (tags.length === 0) {
    tagOptions.innerHTML = '<div class="dropdown-empty">No tags yet</div>';
  }

  tagOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      updateSelectedTags();
      loadItems();
    });
  });
}

function updateSelectedTags() {
  selectedTags = Array.from(
    tagOptions.querySelectorAll('input[type="checkbox"]:checked'),
  ).map((cb) => cb.value);
  updateTagFilterDisplay();
}

function updateTagFilterDisplay() {
  if (selectedTags.length === 0) {
    tagFilterValue.textContent = "All";
  } else if (selectedTags.length === 1) {
    tagFilterValue.textContent = selectedTags[0];
  } else {
    tagFilterValue.textContent = `${selectedTags.length} selected`;
  }
}

function updateSelectedTypes() {
  selectedTypes = Array.from(
    typeOptions.querySelectorAll('input[type="checkbox"]:checked'),
  ).map((cb) => cb.value);
  updateTypeFilterDisplay();
}

function updateTypeFilterDisplay() {
  if (selectedTypes.length === 0) {
    typeFilterValue.textContent = "All";
  } else if (selectedTypes.length === 1) {
    typeFilterValue.textContent =
      selectedTypes[0].charAt(0).toUpperCase() + selectedTypes[0].slice(1);
  } else {
    typeFilterValue.textContent = `${selectedTypes.length} selected`;
  }
}

typeOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
  cb.addEventListener("change", () => {
    updateSelectedTypes();
    loadItems();
  });
});

typeFilterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = typeDropdown.classList.contains("open");
  closeAllDropdowns();
  if (!isOpen) {
    typeDropdown.classList.add("open");
    typeSearch.focus();
  }
});

tagFilterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = tagDropdown.classList.contains("open");
  closeAllDropdowns();
  if (!isOpen) {
    tagDropdown.classList.add("open");
    tagSearch.focus();
  }
});

function closeAllDropdowns() {
  typeDropdown.classList.remove("open");
  tagDropdown.classList.remove("open");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".filter-dropdown")) {
    closeAllDropdowns();
  }
});

typeSearch.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  typeOptions.querySelectorAll(".dropdown-option").forEach((opt) => {
    const value = opt.dataset.value || opt.textContent.toLowerCase();
    opt.style.display = value.includes(query) ? "" : "none";
  });
});

tagSearch.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  tagOptions.querySelectorAll(".dropdown-option").forEach((opt) => {
    const value = opt.dataset.value || "";
    opt.style.display = value.includes(query) ? "" : "none";
  });
});

typeClear.addEventListener("click", () => {
  typeOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  selectedTypes = [];
  updateTypeFilterDisplay();
  loadItems();
});

tagClear.addEventListener("click", () => {
  tagOptions.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
  selectedTags = [];
  updateTagFilterDisplay();
  loadItems();
});

function filterByTag(tag) {
  if (!selectedTags.includes(tag)) {
    selectedTags.push(tag);
    const cb = tagOptions.querySelector(`input[value="${tag}"]`);
    if (cb) cb.checked = true;
    updateTagFilterDisplay();
    loadItems();
  }
}

if (searchInput) {
  let searchDebounce;
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadItems, 120);
  });
}

// View Tabs
viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    viewTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const view = tab.dataset.view;
    if (view === "reading-list") {
      readingListView.style.display = "";
      notesView.style.display = "none";
    } else if (view === "notes") {
      readingListView.style.display = "none";
      notesView.style.display = "";
      loadAllHighlights();
    }
  });
});

// Item dropdown menu functions
function openItemMenu(event, id, url) {
  event.stopPropagation();
  currentDropdownItemId = id;
  currentDropdownItemUrl = url;

  const btn = event.currentTarget;
  const rect = btn.getBoundingClientRect();

  itemDropdownMenu.style.top = `${rect.bottom + 4}px`;
  itemDropdownMenu.style.left = `${rect.right - 160}px`;
  itemDropdownMenu.style.display = "block";

  document
    .querySelectorAll(".btn-more")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}

function closeItemMenu() {
  itemDropdownMenu.style.display = "none";
  currentDropdownItemId = null;
  currentDropdownItemUrl = null;
  document
    .querySelectorAll(".btn-more")
    .forEach((b) => b.classList.remove("active"));
}

dropdownEdit.addEventListener("click", () => {
  if (currentDropdownItemId) {
    openEditModal(currentDropdownItemId);
  }
  closeItemMenu();
});

dropdownOpenUrl.addEventListener("click", () => {
  if (currentDropdownItemUrl) {
    window.open(currentDropdownItemUrl, "_blank", "noopener");
  }
  closeItemMenu();
});

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".item-dropdown-menu") &&
    !e.target.closest(".btn-more")
  ) {
    closeItemMenu();
  }
});

// Reader view functions
function resetEpubReader() {
  try {
    if (
      currentEpubRendition &&
      typeof currentEpubRendition.destroy === "function"
    ) {
      currentEpubRendition.destroy();
    }
  } catch {}

  try {
    if (currentEpubBook && typeof currentEpubBook.destroy === "function") {
      currentEpubBook.destroy();
    }
  } catch {}

  currentEpubRendition = null;
  currentEpubBook = null;
}

async function withTimeout(promise, ms, message) {
  let timer;
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

async function openEpubReader(url) {
  const epubFactory = window.ePub;
  if (typeof epubFactory !== "function") {
    showReaderError(url, "EPUB reader failed to load.");
    return;
  }
  if (typeof window.JSZip !== "function") {
    showReaderError(url, "JSZip is not loaded. EPUB reading is unavailable.");
    return;
  }

  readerContent.innerHTML = `
    <div class="ebook-reader">
      <div class="ebook-toolbar">
        <button type="button" class="ebook-nav-btn" id="ebook-prev">Prev</button>
        <span class="ebook-location" id="ebook-location">Loading...</span>
        <button type="button" class="ebook-nav-btn" id="ebook-next">Next</button>
      </div>
      <div class="ebook-stage" id="ebook-stage"></div>
    </div>
  `;

  const stage = document.getElementById("ebook-stage");
  const locationEl = document.getElementById("ebook-location");
  const prevBtn = document.getElementById("ebook-prev");
  const nextBtn = document.getElementById("ebook-next");
  if (!stage || !locationEl || !prevBtn || !nextBtn) {
    showReaderError(url, "Failed to initialize EPUB reader.");
    return;
  }

  const attachSelectionToCurrentChapter = () => {
    const iframe = stage.querySelector("iframe");
    if (!iframe) return;
    readerIframe = iframe;
    setupIframeSelectionListener();
    applyHighlightsToDocument();
  };

  try {
    const fileResponse = await withTimeout(
      fetch(url),
      15000,
      "Timed out loading EPUB file.",
    );
    if (!fileResponse.ok) {
      throw new Error("Failed to load EPUB file.");
    }

    const fileBuffer = await withTimeout(
      fileResponse.arrayBuffer(),
      15000,
      "Timed out reading EPUB file.",
    );

    const header = new Uint8Array(fileBuffer.slice(0, 4));
    const isZip = header[0] === 0x50 && header[1] === 0x4b;
    if (!isZip) {
      throw new Error("The uploaded file is not a valid EPUB archive.");
    }

    const book = epubFactory(fileBuffer);
    const rendition = book.renderTo(stage, {
      width: "100%",
      height: "100%",
      spread: "none",
    });

    currentEpubBook = book;
    currentEpubRendition = rendition;

    prevBtn.addEventListener("click", () => rendition.prev());
    nextBtn.addEventListener("click", () => rendition.next());

    rendition.on("rendered", () => {
      setTimeout(attachSelectionToCurrentChapter, 30);
    });

    rendition.on("relocated", (location) => {
      const percentage = location?.start?.percentage;
      if (typeof percentage === "number") {
        locationEl.textContent = `${Math.round(percentage * 100)}%`;
      } else {
        locationEl.textContent = "";
      }
    });

    await withTimeout(book.ready, 12000, "EPUB parsing timed out.");
    await withTimeout(rendition.display(), 12000, "EPUB render timed out.");
    attachSelectionToCurrentChapter();

    setTimeout(() => {
      if (!stage.querySelector("iframe")) {
        showReaderError(url, "Failed to render EPUB content.");
      }
    }, 1500);
  } catch (error) {
    resetEpubReader();
    const message =
      error && typeof error.message === "string" && error.message
        ? error.message
        : "Failed to render EPUB. Make sure the file is valid.";
    showReaderError(url, message);
  }
}

async function openReader(id, url, title, type) {
  resetEpubReader();
  currentReaderId = id;
  readerIframe = null;
  currentHighlights = [];
  readerModal.style.display = "flex";
  readerTitle.textContent = title;
  readerOpenOriginal.href = url;

  await loadHighlights(id);

  readerContent.innerHTML = `
    <div class="reader-loading">
      <div class="reader-spinner"></div>
      <p>Loading content...</p>
    </div>
  `;

  if (type === "video") {
    const youtubeMatch = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/,
    );
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);

    if (youtubeMatch) {
      readerContent.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeMatch[1]}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
      return;
    } else if (vimeoMatch) {
      readerContent.innerHTML = `<iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" allowfullscreen></iframe>`;
      return;
    }
  }

  if (type === "pdf" || url.toLowerCase().endsWith(".pdf")) {
    if (!url.startsWith("/uploads/")) {
      readerContent.innerHTML = `<iframe src="${url}"></iframe>`;
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.src = `/pdf-reader.html?file=${encodeURIComponent(url)}`;
    readerContent.innerHTML = "";
    readerContent.appendChild(iframe);
    readerIframe = iframe;

    iframe.onload = () => {
      setupIframeSelectionListener();
      applyHighlightsToDocument();
      setTimeout(applyHighlightsToDocument, 500);
      setTimeout(applyHighlightsToDocument, 1400);
    };
    return;
  }

  if (type === "ebook" || /\.epub$/i.test(url)) {
    await openEpubReader(url);
    return;
  }

  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (data.error) {
      showReaderError(url, data.message || "Failed to load content");
      return;
    }

    if (data.type === "html") {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-same-origin allow-popups";
      readerContent.innerHTML = "";
      readerContent.appendChild(iframe);
      readerIframe = iframe;

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(data.content);
      doc.close();

      iframe.onload = () => {
        applyHighlightsToDocument();
        setupIframeSelectionListener();
      };

      setTimeout(() => {
        applyHighlightsToDocument();
        setupIframeSelectionListener();
      }, 100);
    } else if (data.type === "pdf") {
      readerContent.innerHTML = `<iframe src="${data.url}"></iframe>`;
    } else {
      showReaderError(
        url,
        `This content type (${data.contentType || "unknown"}) cannot be displayed inline.`,
      );
    }
  } catch (error) {
    showReaderError(
      url,
      "Failed to load content. The site may not allow embedding.",
    );
  }
}

function showReaderError(url, message) {
  readerContent.innerHTML = `
    <div class="reader-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <p>${message}</p>
      <p><a href="${url}" target="_blank" rel="noopener">Open in new tab →</a></p>
    </div>
  `;
}

function closeReader() {
  resetEpubReader();
  readerModal.style.display = "none";
  readerContent.innerHTML = "";
  currentReaderId = null;
  readerIframe = null;
  currentHighlights = [];
  hideSelectionPopup();
}

readerClose.addEventListener("click", closeReader);

// Toggle sidebar
readerToggleNotes.addEventListener("click", () => {
  readerSidebar.classList.toggle("hidden");
  readerToggleNotes.classList.toggle("active");
});

// Highlights functionality
async function loadHighlights(itemId) {
  try {
    const response = await fetch(`/api/items/${itemId}/highlights`);
    currentHighlights = await response.json();
    renderSidebarHighlights();
  } catch (error) {
    console.error("Failed to load highlights:", error);
    currentHighlights = [];
  }
}

function renderSidebarHighlights() {
  if (currentHighlights.length === 0) {
    highlightsCount.textContent = "";
    sidebarHighlights.innerHTML = `
      <div class="sidebar-empty">
        <p>No highlights yet</p>
        <p class="empty-hint">Select text to highlight</p>
      </div>
    `;
    return;
  }

  highlightsCount.textContent = `(${currentHighlights.length})`;
  sidebarHighlights.innerHTML = currentHighlights
    .map(
      (h) => `
    <div class="sidebar-highlight" data-id="${h.id}">
      <div class="sidebar-highlight-quote" onclick="scrollToHighlight('${escapeHtml(h.selected_text).replace(/'/g, "\\'")}')">
        ${escapeHtml(h.selected_text.length > 150 ? h.selected_text.substring(0, 150) + "..." : h.selected_text)}
      </div>
      ${h.note ? `<div class="sidebar-highlight-note">${escapeHtml(h.note)}</div>` : ""}
      <div class="sidebar-highlight-actions">
        <button class="sidebar-highlight-btn" onclick="editHighlight(${h.id})">Edit</button>
        <button class="sidebar-highlight-btn delete" onclick="deleteHighlight(${h.id})">Delete</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function applyHighlightsToDocument() {
  if (!readerIframe) return;

  try {
    const doc =
      readerIframe.contentDocument || readerIframe.contentWindow.document;
    if (!doc || !doc.body) return;

    if (!doc.getElementById("reading-list-highlight-style")) {
      const style = doc.createElement("style");
      style.id = "reading-list-highlight-style";
      style.textContent = `
        .reading-list-highlight {
          background-color: rgba(59, 130, 246, 0.3);
          border-radius: 2px;
          padding: 0 2px;
          margin: 0 -2px;
        }
        .reading-list-highlight:hover {
          background-color: rgba(59, 130, 246, 0.5);
        }
      `;
      doc.head.appendChild(style);
    }

    doc.querySelectorAll(".reading-list-highlight").forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    });

    if (currentHighlights.length === 0) return;

    currentHighlights.forEach((highlight) => {
      highlightTextInDocument(doc, highlight.selected_text);
    });
  } catch (error) {
    console.error("Failed to apply highlights:", error);
  }
}

function highlightTextInDocument(doc, text) {
  const walker = doc.createTreeWalker(
    doc.body,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  const nodesToHighlight = [];
  let node;
  const normalizedSearchText = text.replace(/\s+/g, " ").trim();

  while ((node = walker.nextNode())) {
    const nodeText = node.textContent;
    const normalizedNodeText = nodeText.replace(/\s+/g, " ");

    if (
      normalizedSearchText.includes(normalizedNodeText.trim()) ||
      normalizedNodeText.includes(normalizedSearchText)
    ) {
      const index = normalizedNodeText.indexOf(normalizedSearchText);
      if (index !== -1) {
        nodesToHighlight.push({
          node,
          index,
          length: normalizedSearchText.length,
        });
      }
    }
  }

  nodesToHighlight.reverse().forEach(({ node, index, length }) => {
    try {
      const range = doc.createRange();
      range.setStart(node, index);
      range.setEnd(node, Math.min(index + length, node.textContent.length));

      const span = doc.createElement("span");
      span.className = "reading-list-highlight";
      range.surroundContents(span);
    } catch (e) {}
  });
}

function scrollToHighlight(text) {
  if (!readerIframe) return;

  try {
    const doc =
      readerIframe.contentDocument || readerIframe.contentWindow.document;
    const highlights = doc.querySelectorAll(".reading-list-highlight");

    for (const el of highlights) {
      if (el.textContent.includes(text.substring(0, 50))) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });

        // Flash effect
        el.style.backgroundColor = "rgba(59, 130, 246, 0.7)";
        setTimeout(() => {
          el.style.backgroundColor = "";
        }, 1000);
        break;
      }
    }
  } catch (error) {
    console.error("Failed to scroll to highlight:", error);
  }
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 768px)").matches;
}

// Selection handling in iframe
function setupIframeSelectionListener() {
  if (!readerIframe) return;

  try {
    const doc =
      readerIframe.contentDocument || readerIframe.contentWindow.document;
    if (!doc || !doc.documentElement) return;
    if (doc.documentElement.dataset.rlSelectionBound === "1") return;
    doc.documentElement.dataset.rlSelectionBound = "1";

    doc.addEventListener("mouseup", handleIframeSelection);
    doc.addEventListener("touchend", handleIframeSelection);
    doc.addEventListener("selectionchange", handleIframeSelection);

    doc.addEventListener("pointerdown", () => {
      setTimeout(handleIframeSelection, 50);
    });
  } catch (error) {
    console.error("Failed to setup iframe selection listener:", error);
  }
}

function handleIframeSelection() {
  setTimeout(() => {
    if (!readerIframe) return;

    try {
      const doc =
        readerIframe.contentDocument || readerIframe.contentWindow.document;
      const selection = doc.getSelection();
      const selectedText = selection ? selection.toString().trim() : "";

      if (selectedText.length > 0) {
        showSelectionPopup(selection);
      } else {
        hideSelectionPopup();
      }
    } catch (error) {
      console.error("Failed to handle iframe selection:", error);
    }
  }, 35);
}

function showSelectionPopup(selection) {
  if (!selection || selection.rangeCount === 0) return;
  const selectedText = selection.toString().trim();
  if (!selectedText) return;
  pendingSelectionText = selectedText;

  if (isMobileViewport()) {
    selectionPopup.classList.add("mobile-fab");
    selectionPopup.style.left = "";
    selectionPopup.style.top = "";
    selectionPopup.style.display = "block";
    return;
  }

  selectionPopup.classList.remove("mobile-fab");

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Get iframe position
  const iframeRect = readerIframe.getBoundingClientRect();

  // Position popup above the selection
  const popupX = iframeRect.left + rect.left + rect.width / 2 - 54;
  const popupY = iframeRect.top + rect.top - 45;
  const clampedX = Math.max(10, Math.min(window.innerWidth - 118, popupX));
  const clampedY = Math.max(10, popupY);

  selectionPopup.style.left = `${clampedX}px`;
  selectionPopup.style.top = `${clampedY}px`;
  selectionPopup.style.display = "block";
}

function hideSelectionPopup() {
  selectionPopup.classList.remove("mobile-fab");
  selectionPopup.style.left = "";
  selectionPopup.style.top = "";
  selectionPopup.style.display = "none";
  pendingSelectionText = "";
}

// Highlight button click
popupHighlightBtn.addEventListener("click", () => {
  if (pendingSelectionText) {
    openNoteModal(pendingSelectionText);
    hideSelectionPopup();
  }
});

// Note modal functions
function openNoteModal(selectedText) {
  noteModalQuote.textContent = selectedText;
  noteModalText.value = "";
  noteModal.style.display = "flex";
  noteModalText.focus();
}

function closeNoteModal() {
  noteModal.style.display = "none";
  noteModalQuote.textContent = "";
  noteModalText.value = "";
}

noteModalClose.addEventListener("click", closeNoteModal);
noteModalCancel.addEventListener("click", closeNoteModal);
noteModal.addEventListener("click", (e) => {
  if (e.target === noteModal) closeNoteModal();
});

noteModalSave.addEventListener("click", async () => {
  if (!currentReaderId || !noteModalQuote.textContent) return;

  const selectedText = noteModalQuote.textContent;
  const note = noteModalText.value.trim();

  try {
    const response = await fetch(`/api/items/${currentReaderId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_text: selectedText, note }),
    });

    if (response.ok) {
      const highlight = await response.json();
      currentHighlights.push(highlight);
      renderSidebarHighlights();
      applyHighlightsToDocument();

      // Show sidebar if hidden
      if (readerSidebar.classList.contains("hidden")) {
        readerSidebar.classList.remove("hidden");
        readerToggleNotes.classList.add("active");
      }

      closeNoteModal();
    }
  } catch (error) {
    console.error("Failed to save highlight:", error);
    alert("Failed to save highlight. Please try again.");
  }
});

async function editHighlight(highlightId) {
  const highlight = currentHighlights.find((h) => h.id === highlightId);
  if (!highlight) return;

  const newNote = prompt("Edit note:", highlight.note || "");
  if (newNote === null) return;

  try {
    await fetch(`/api/highlights/${highlightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: newNote }),
    });

    highlight.note = newNote;
    renderSidebarHighlights();
  } catch (error) {
    console.error("Failed to update highlight:", error);
  }
}

async function deleteHighlight(highlightId) {
  if (!confirm("Delete this highlight?")) return;

  try {
    await fetch(`/api/highlights/${highlightId}`, { method: "DELETE" });
    currentHighlights = currentHighlights.filter((h) => h.id !== highlightId);
    renderSidebarHighlights();
    applyHighlightsToDocument();
  } catch (error) {
    console.error("Failed to delete highlight:", error);
  }
}

// All highlights view (Notes & Highlights tab)
async function loadAllHighlights() {
  try {
    const response = await fetch("/api/highlights");
    const highlights = await response.json();
    renderAllHighlights(highlights);
  } catch (error) {
    console.error("Failed to load all highlights:", error);
    notesList.innerHTML = `
      <div class="empty-state">
        <p>Failed to load highlights</p>
      </div>
    `;
  }
}

function renderAllHighlights(highlights) {
  if (highlights.length === 0) {
    notesList.innerHTML = `
      <div class="empty-state">
        <p>No highlights yet</p>
        <p class="empty-hint">Select text while reading to save highlights and notes</p>
      </div>
    `;
    return;
  }

  notesList.innerHTML = highlights
    .map(
      (h) => `
    <div class="highlight-card" data-id="${h.id}">
      <div class="highlight-card-header">
        <div class="highlight-card-source">
          <a href="#" onclick="openReaderFromHighlight(${h.item_id}, '${escapeHtml(h.item_url).replace(/'/g, "\\'")}', '${escapeHtml(h.item_title).replace(/'/g, "\\'")}', '${h.item_type}'); return false;">
            ${escapeHtml(h.item_title || "Untitled")}
          </a>
        </div>
        <span class="highlight-card-date">${formatDate(h.created_at)}</span>
      </div>
      <div class="highlight-card-quote">${escapeHtml(h.selected_text)}</div>
      ${h.note ? `<div class="highlight-card-note">${escapeHtml(h.note)}</div>` : ""}
      <div class="highlight-card-actions">
        <button class="highlight-card-btn" onclick="editHighlightFromList(${h.id}, '${escapeHtml(h.note || "").replace(/'/g, "\\'")}')">Edit Note</button>
        <button class="highlight-card-btn delete" onclick="deleteHighlightFromList(${h.id})">Delete</button>
      </div>
    </div>
  `,
    )
    .join("");
}

async function openReaderFromHighlight(itemId, url, title, type) {
  // Switch to reading list view
  viewTabs.forEach((t) => t.classList.remove("active"));
  viewTabs[0].classList.add("active");
  readingListView.style.display = "";
  notesView.style.display = "none";

  // Open reader
  await openReader(itemId, url, title, type);
}

async function editHighlightFromList(highlightId, currentNote) {
  const newNote = prompt("Edit note:", currentNote);
  if (newNote === null) return;

  try {
    await fetch(`/api/highlights/${highlightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: newNote }),
    });
    loadAllHighlights();
  } catch (error) {
    console.error("Failed to update highlight:", error);
  }
}

async function deleteHighlightFromList(highlightId) {
  if (!confirm("Delete this highlight?")) return;

  try {
    await fetch(`/api/highlights/${highlightId}`, { method: "DELETE" });
    loadAllHighlights();
  } catch (error) {
    console.error("Failed to delete highlight:", error);
  }
}

// Close reader with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (noteModal.style.display !== "none") {
      closeNoteModal();
    } else if (readerModal.style.display !== "none") {
      closeReader();
    } else if (editModal.style.display !== "none") {
      closeEditModal();
    }
    closeItemMenu();
    hideSelectionPopup();
  }
});

async function toggleRead(id, currentStatus) {
  await fetch(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read: !currentStatus }),
  });
  loadItems();
}

async function deleteItem(id) {
  if (!confirm("Delete this item?")) return;
  await fetch(`/api/items/${id}`, { method: "DELETE" });
  loadItems();
  loadTags();
}

async function openEditModal(id) {
  const response = await fetch(`/api/items/${id}`);
  const item = await response.json();
  editIdInput.value = item.id;
  editUrlInput.value = item.url;
  editTitleInput.value = item.title || "";
  editTypeSelect.value = item.type;
  editTags = item.tags ? [...item.tags] : [];
  renderTagPills(editTags, editTagsContainer, editTagInput);
  editModal.style.display = "flex";
}

function closeEditModal() {
  editModal.style.display = "none";
  editForm.reset();
  editTags = [];
  renderTagPills(editTags, editTagsContainer, editTagInput);
}

modalClose.addEventListener("click", closeEditModal);
modalCancel.addEventListener("click", closeEditModal);
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    url: editUrlInput.value.trim(),
    title: editTitleInput.value.trim(),
    type: editTypeSelect.value,
    tags: editTags,
  };
  await fetch(`/api/items/${editIdInput.value}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  closeEditModal();
  loadItems();
  loadTags();
});

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url.substring(0, 30);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function extractUrlFromText(text) {
  if (!text) return "";
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function handleShareTarget() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("url") && !params.has("text") && !params.has("title")) {
    return;
  }

  const rawUrl = (params.get("url") || "").trim();
  const rawText = (params.get("text") || "").trim();
  const rawTitle = (params.get("title") || "").trim();

  let sharedUrl = rawUrl;
  if (!sharedUrl && rawText) {
    sharedUrl = extractUrlFromText(rawText);
  }

  if (sharedUrl && isValidUrl(sharedUrl)) {
    urlInput.value = sharedUrl;
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (rawTitle && !titleInput.value) {
    titleInput.value = rawTitle;
  } else if (rawText && !titleInput.value && rawText !== sharedUrl) {
    titleInput.value = rawText;
  }

  if (sharedUrl && isValidUrl(sharedUrl)) {
    setTimeout(() => {
      if (urlInput.value.trim() === sharedUrl) {
        if (typeof form.requestSubmit === "function") {
          form.requestSubmit();
        } else {
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        }
      }
    }, 350);
  }

  if (window.location.search) {
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

// Expose functions globally
window.filterByTag = filterByTag;
window.toggleRead = toggleRead;
window.deleteItem = deleteItem;
window.openEditModal = openEditModal;
window.openItemMenu = openItemMenu;
window.openReader = openReader;
window.scrollToHighlight = scrollToHighlight;
window.editHighlight = editHighlight;
window.deleteHighlight = deleteHighlight;
window.openReaderFromHighlight = openReaderFromHighlight;
window.editHighlightFromList = editHighlightFromList;
window.deleteHighlightFromList = deleteHighlightFromList;

// Theme toggle
const themeToggle = document.getElementById("theme-toggle");
const storedTheme = localStorage.getItem("theme");

if (
  storedTheme === "dark" ||
  (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// Initialize
loadItems();
loadTags();
handleShareTarget();
