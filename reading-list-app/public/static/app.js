let selectedTypes = [];
let selectedTags = [];
let pendingTags = [];
let editTags = [];
let fetchedMeta = null;
let isFetching = false;

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
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="item-title">
            ${escapeHtml(item.title || item.url)}
          </a>
          <div class="item-meta">
            <span class="item-domain">${escapeHtml(getDomain(item.url))}</span>
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
        <button class="btn-more" onclick="openEditModal(${item.id})" title="Edit">
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

window.filterByTag = filterByTag;
window.toggleRead = toggleRead;
window.deleteItem = deleteItem;
window.openEditModal = openEditModal;

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

loadItems();
loadTags();
