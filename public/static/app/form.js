import {
  defaultUrlPlaceholder,
  dom,
  handleAuthFailure,
  showUnauthorizedState,
  state,
} from "./shared.js";
import {
  extractUrlFromText,
  getSupportedUploadFiles,
  isValidUrl,
  parseTitleAuthorFromFilename,
  renderTagPills,
  setupTagInput,
  wait,
} from "./utils.js";

function preventDropDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

async function fetchMetadata(url) {
  if (!url || !isValidUrl(url)) return null;

  const response = await fetch(
    `/api/fetch-meta?url=${encodeURIComponent(url)}`,
  ).catch(() => null);
  if (!response?.ok) return null;
  return response.json();
}

function clearPendingUploadFile() {
  state.pendingUploadFile = null;
  if (dom.urlInput) dom.urlInput.placeholder = defaultUrlPlaceholder;
  if (dom.fileUploadInput) dom.fileUploadInput.value = "";
}

function resetAddForm(app) {
  dom.form?.reset();
  state.pendingTags.length = 0;
  renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);
  state.fetchedMeta = null;
  clearPendingUploadFile();
  app.loadItems?.();
  app.loadTags?.();
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
  state.pendingUploadFile = file;

  if (dom.urlInput) {
    dom.urlInput.value = "";
    dom.urlInput.placeholder = `Selected file: ${file.name}`;
  }

  const parsed = parseTitleAuthorFromFilename(file.name);
  if (dom.titleInput && !dom.titleInput.value.trim()) {
    dom.titleInput.value = parsed.title || file.name;
  }
  if (dom.authorInput && !dom.authorInput.value.trim() && parsed.author) {
    dom.authorInput.value = parsed.author;
  }
  if (dom.typeSelect) {
    dom.typeSelect.value = file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "ebook";
  }
}

async function addPendingUploadFile(app) {
  if (!state.pendingUploadFile || !dom.submitBtn) return;
  if (state.isUnauthorized) {
    showUnauthorizedState(state.authMessage);
    return;
  }

  const originalText = dom.submitBtn.textContent;
  dom.submitBtn.disabled = true;
  dom.submitBtn.textContent = "Adding...";

  try {
    const formData = new FormData();
    formData.append("file", state.pendingUploadFile);
    formData.append("tags", JSON.stringify(state.pendingTags));
    const title = dom.titleInput?.value.trim();
    const author = dom.authorInput?.value.trim();
    if (title) formData.append("title", title);
    if (author) formData.append("author", author);

    const response = await fetch("/api/import/file", {
      method: "POST",
      body: formData,
    }).catch(() => null);
    if (!response) {
      alert("File upload failed. Please try again.");
      return;
    }

    if (handleAuthFailure(response)) {
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      const failed = (data.failed_files || [])
        .map((entry) => `- ${entry.name}: ${entry.reason}`)
        .join("\n");
      const message = [data.error || "File upload failed.", failed && `\n${failed}`]
        .filter(Boolean)
        .join("\n");
      alert(message);
      return;
    }

    if (
      (data.skipped || 0) > 0 ||
      data.failed_files?.length
    ) {
      const failed = (data.failed_files || [])
        .map((entry) => `- ${entry.name}: ${entry.reason}`)
        .join("\n");
      const message = [
        `Imported ${data.imported || 0} file(s).`,
        data.skipped ? `Skipped ${data.skipped} file(s).` : "",
        failed && `\nDetails:\n${failed}`,
      ]
        .filter(Boolean)
        .join("\n");
      alert(message);
    }

    resetAddForm(app);
  } finally {
    if (dom.fileUploadInput) dom.fileUploadInput.value = "";
    dom.submitBtn.disabled = false;
    dom.submitBtn.textContent = originalText || "Add";
  }
}

function initImport(app) {
  if (!dom.importBtn || !dom.importFile) return;

  dom.importBtn.addEventListener("click", () => dom.importFile?.click());
  dom.importFile.addEventListener("change", async () => {
    if (state.isUnauthorized) {
      showUnauthorizedState(state.authMessage);
      return;
    }

    const file = dom.importFile?.files?.[0];
    if (!file) return;

    const originalText = dom.importBtn.textContent;
    dom.importBtn.disabled = true;
    dom.importBtn.textContent = "Importing...";

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/import/readwise", {
        method: "POST",
        body: formData,
      }).catch(() => null);
      if (!response) {
        alert("Import failed. Please try again.");
        return;
      }

      if (handleAuthFailure(response)) {
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Import failed.");
        return;
      }

      alert(
        `Imported ${data.imported} items. Duplicates: ${data.duplicate}. Skipped: ${data.skipped}. Errors: ${data.errors}.`,
      );
      app.loadItems?.();
      app.loadTags?.();
    } finally {
      dom.importBtn.disabled = false;
      dom.importBtn.textContent = originalText || "Import CSV";
      dom.importFile.value = "";
    }
  });
}

function initFileInputs() {
  dom.fileUploadInput?.addEventListener("change", () => {
    const files = dom.fileUploadInput?.files;
    if (files?.length) stageSelectedFiles(files);
  });

  if (!dom.addFormSection) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    dom.addFormSection.addEventListener(eventName, (event) => {
      preventDropDefaults(event);
      dom.addFormSection.classList.add("drag-over");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    dom.addFormSection.addEventListener(eventName, (event) => {
      preventDropDefaults(event);
      dom.addFormSection.classList.remove("drag-over");
    });
  });

  dom.addFormSection.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (files?.length) stageSelectedFiles(files);
  });
}

function initMetadataLookup() {
  dom.urlInput?.addEventListener("input", (event) => {
    const url = event.target.value.trim();
    if (state.fetchTimeout) clearTimeout(state.fetchTimeout);
    state.fetchedMeta = null;

    if (url && state.pendingUploadFile) {
      clearPendingUploadFile();
    }

    if (!url || !isValidUrl(url)) {
      if (!state.pendingUploadFile) {
        if (dom.titleInput) dom.titleInput.value = "";
        if (dom.authorInput) dom.authorInput.value = "";
        if (dom.typeSelect) dom.typeSelect.value = "article";
      }
      return;
    }

    state.fetchTimeout = setTimeout(async () => {
      state.isFetching = true;
      if (dom.submitBtn) dom.submitBtn.textContent = "...";
      const meta = await fetchMetadata(url);
      if (meta && dom.urlInput?.value.trim() === url) {
        state.fetchedMeta = meta;
        if (dom.titleInput) dom.titleInput.value = meta.title || "";
        if (dom.authorInput) dom.authorInput.value = meta.author || "";
        if (dom.typeSelect) dom.typeSelect.value = meta.type || "article";
      }
      state.isFetching = false;
      if (dom.submitBtn) dom.submitBtn.textContent = "Add";
    }, 300);
  });
}

async function submitItemForm(app, event) {
  event.preventDefault();
  if (state.isUnauthorized) {
    showUnauthorizedState(state.authMessage);
    return;
  }

  const url = dom.urlInput?.value.trim() || "";

  if (!url) {
    if (state.pendingUploadFile) {
      await addPendingUploadFile(app);
      return;
    }

    dom.fileUploadInput?.click();
    return;
  }

  if (!dom.submitBtn) return;
  dom.submitBtn.disabled = true;
  dom.submitBtn.textContent = "Adding...";

  try {
    if (state.isFetching) await wait(500);

    let title = dom.titleInput?.value.trim() || "";
    let author =
      dom.authorInput?.value.trim() || state.fetchedMeta?.author || "";
    let type = dom.typeSelect?.value || "article";

    if (!title && !state.fetchedMeta) {
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
      body: JSON.stringify({
        url,
        title,
        author,
        type,
        tags: state.pendingTags,
      }),
    });

    if (handleAuthFailure(response)) return;
    if (!response.ok) return;
    resetAddForm(app);
  } finally {
    dom.submitBtn.disabled = false;
    dom.submitBtn.textContent = "Add";
  }
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

  if (sharedUrl && isValidUrl(sharedUrl) && dom.urlInput) {
    dom.urlInput.value = sharedUrl;
    dom.urlInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (rawTitle && dom.titleInput && !dom.titleInput.value) {
    dom.titleInput.value = rawTitle;
  } else if (
    rawText &&
    dom.titleInput &&
    !dom.titleInput.value &&
    rawText !== sharedUrl
  ) {
    dom.titleInput.value = rawText;
  }

  if (sharedUrl && isValidUrl(sharedUrl)) {
    setTimeout(() => {
      if (dom.urlInput?.value.trim() !== sharedUrl || !dom.form) return;
      if (typeof dom.form.requestSubmit === "function") {
        dom.form.requestSubmit();
        return;
      }
      dom.form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    }, 350);
  }

  if (window.location.search) {
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

export function initForm(app) {
  setupTagInput(dom.tagInput, state.pendingTags, dom.tagsContainer);
  renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);

  initImport(app);
  initFileInputs();
  initMetadataLookup();
  dom.form?.addEventListener("submit", (event) => submitItemForm(app, event));

  app.handleShareTarget = handleShareTarget;
}
