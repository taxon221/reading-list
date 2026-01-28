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

const form = document.getElementById("add-item-form");
const urlInput = document.getElementById("url");
const titleInput = document.getElementById("title");
const typeSelect = document.getElementById("type-select");
const tagInput = document.getElementById("tag-input");
const tagsContainer = document.getElementById("tags-input");
const submitBtn = document.getElementById("submit-btn");
const itemsList = document.getElementById("items-list");

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

  if (!url || !isValidUrl(url)) {
    titleInput.value = "";
    typeSelect.value = "article";
    return;
  }

  fetchTimeout = setTimeout(async () => {
    isFetching = true;
    submitBtn.textContent = "...";
    const meta = await fetchMetadata(url);
    if (meta && urlInput.value.trim() === url) {
      fetchedMeta = meta;
      titleInput.value = meta.title || "";
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
  if (!url) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Adding...";

  try {
    if (isFetching) await new Promise((r) => setTimeout(r, 500));

    let title = titleInput.value.trim();
    let type = typeSelect.value;

    if (!title && !fetchedMeta) {
      const meta = await fetchMetadata(url);
      if (meta) {
        title = meta.title || "";
        type = meta.type || type;
      }
    }

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title, type, tags: pendingTags }),
    });

    if (response.ok) {
      form.reset();
      pendingTags = [];
      renderTagPills(pendingTags, tagsContainer, tagInput);
      fetchedMeta = null;
      loadItems();
      loadTags();
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add";
  }
});

async function loadItems() {
  const params = new URLSearchParams();
  if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
  if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
  const url = `/api/items${params.toString() ? "?" + params.toString() : ""}`;
  const response = await fetch(url);
  const items = await response.json();
  renderItems(items);
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
async function openReader(id, url, title, type) {
  currentReaderId = id;
  readerIframe = null;
  currentHighlights = [];
  readerModal.style.display = "flex";
  readerTitle.textContent = title;
  readerOpenOriginal.href = url;

  // Load highlights for this item
  await loadHighlights(id);

  // Show loading state
  readerContent.innerHTML = `
    <div class="reader-loading">
      <div class="reader-spinner"></div>
      <p>Loading content...</p>
    </div>
  `;

  // Handle different content types
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
    readerContent.innerHTML = `<iframe src="${url}"></iframe>`;
    return;
  }

  // For articles and other content, use the proxy
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

      // Wait for content to load, then apply highlights and setup selection
      iframe.onload = () => {
        applyHighlightsToDocument();
        setupIframeSelectionListener();
      };

      // Also try immediately in case onload already fired
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
  if (!readerIframe || currentHighlights.length === 0) return;

  try {
    const doc =
      readerIframe.contentDocument || readerIframe.contentWindow.document;
    if (!doc || !doc.body) return;

    // Add highlight styles
    const style = doc.createElement("style");
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

    // Apply each highlight
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

  // Normalize the search text
  const normalizedSearchText = text.replace(/\s+/g, " ").trim();

  while ((node = walker.nextNode())) {
    const nodeText = node.textContent;
    const normalizedNodeText = nodeText.replace(/\s+/g, " ");

    // Check if this node contains part of our text
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

  // Apply highlights (in reverse to not mess up indices)
  nodesToHighlight.reverse().forEach(({ node, index, length }) => {
    try {
      const range = doc.createRange();
      range.setStart(node, index);
      range.setEnd(node, Math.min(index + length, node.textContent.length));

      const span = doc.createElement("span");
      span.className = "reading-list-highlight";
      range.surroundContents(span);
    } catch (e) {
      // Range might be invalid, skip this highlight
    }
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

// Selection handling in iframe
function setupIframeSelectionListener() {
  if (!readerIframe) return;

  try {
    const doc =
      readerIframe.contentDocument || readerIframe.contentWindow.document;

    doc.addEventListener("mouseup", handleIframeSelection);
    doc.addEventListener("touchend", handleIframeSelection);

    // Hide popup when clicking elsewhere
    doc.addEventListener("mousedown", (e) => {
      if (!e.target.closest(".selection-popup")) {
        hideSelectionPopup();
      }
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
  }, 10);
}

function showSelectionPopup(selection) {
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Get iframe position
  const iframeRect = readerIframe.getBoundingClientRect();

  // Position popup above the selection
  const popupX = iframeRect.left + rect.left + rect.width / 2 - 50;
  const popupY = iframeRect.top + rect.top - 45;

  selectionPopup.style.left = `${Math.max(10, popupX)}px`;
  selectionPopup.style.top = `${Math.max(10, popupY)}px`;
  selectionPopup.style.display = "block";

  pendingSelectionText = selection.toString().trim();
}

function hideSelectionPopup() {
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

    // Remove highlight from document
    if (readerIframe) {
      try {
        const doc =
          readerIframe.contentDocument || readerIframe.contentWindow.document;
        const highlights = doc.querySelectorAll(".reading-list-highlight");
        highlights.forEach((el) => {
          const parent = el.parentNode;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        });
        // Re-apply remaining highlights
        applyHighlightsToDocument();
      } catch (e) {
        // Ignore errors
      }
    }
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
  await fetch(`/api/items/${editIdInput.value}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: editUrlInput.value.trim(),
      title: editTitleInput.value.trim(),
      type: editTypeSelect.value,
      tags: editTags,
    }),
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
