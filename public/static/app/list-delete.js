import { dom, handleAuthFailure, state } from "./shared.js";

const deleteFacetsData = { tags: [], authors: [], domains: [] };

let hasLoadedDeleteFacets = false;
let deleteBy = "tag";
let deleteSelectedValues = [];
let deleteTypeValues = [];
let closeDropdowns = () => {};
let refreshItems = () => {};
let refreshTags = () => {};
let isInitialized = false;

export function invalidateListDeleteFacets() {
  hasLoadedDeleteFacets = false;
}

function getDeleteChoices() {
  if (deleteBy === "tag") return (deleteFacetsData.tags || []).map((tag) => tag.name);
  if (deleteBy === "author") return deleteFacetsData.authors || [];
  if (deleteBy === "domain") return deleteFacetsData.domains || [];
  return deleteTypeValues;
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
    const facets = await facetsRes.json();
    deleteFacetsData.authors = facets.authors || [];
    deleteFacetsData.domains = facets.domains || [];
  }

  hasLoadedDeleteFacets = true;
  updateDeleteValueUi();
}

async function openDeleteDropdown() {
  if (state.isUnauthorized) return;
  await loadDeleteFacets();
  const isOpen = dom.deleteDropdown?.classList.contains("open");
  closeDropdowns();
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
  closeDropdowns();
  alert(data.deleted ? `Deleted ${data.deleted} item(s).` : "No matching items.");
  refreshItems();
  refreshTags();
}

export function initListDelete({
  closeAllDropdowns,
  loadItems,
  loadTags,
  typeValues = [],
}) {
  closeDropdowns = typeof closeAllDropdowns === "function" ? closeAllDropdowns : () => {};
  refreshItems = typeof loadItems === "function" ? loadItems : () => {};
  refreshTags = typeof loadTags === "function" ? loadTags : () => {};
  deleteTypeValues = [...typeValues];

  if (isInitialized) {
    updateDeleteValueUi();
    return;
  }

  isInitialized = true;

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

  updateDeleteValueUi();
}
