import {
	defaultUrlPlaceholder,
	dom,
	handleAuthFailure,
	showUnauthorizedState,
	state,
} from "./shared.js";
import { showToast } from "./toast.js";
import {
	extractUrlFromText,
	getSupportedUploadFiles,
	isValidUrl,
	parseTitleAuthorFromFilename,
	renderTagPills,
	setupTagInput,
	wait,
} from "./utils.js";

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
	if (dom.addFileSummary) {
		dom.addFileSummary.hidden = true;
		dom.addFileSummary.textContent = "No file selected.";
	}
	if (dom.fileUploadInput) dom.fileUploadInput.value = "";
}

function resetAddForm(app) {
	dom.form?.reset();
	state.pendingTags.length = 0;
	renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);
	state.fetchedMeta = null;
	clearPendingUploadFile();
	closeAddModal();
	app.loadItems?.();
	app.loadTags?.();
}

function closeAddMenu() {
	if (!dom.addMenuButton || !dom.addMenu || !dom.addEntry) return;
	dom.addMenuButton.setAttribute("aria-expanded", "false");
	dom.addEntry.classList.remove("open");
	dom.addMenu.hidden = true;
}

function openAddMenu() {
	if (!dom.addMenuButton || !dom.addMenu || !dom.addEntry) return;
	dom.addMenuButton.setAttribute("aria-expanded", "true");
	dom.addEntry.classList.add("open");
	dom.addMenu.hidden = false;
}

function configureAddModal(mode) {
	state.addMode = mode;
	const isRss = mode === "rss";
	const isFile = mode === "file";
	if (dom.addModalTitle) {
		dom.addModalTitle.textContent = isRss
			? "Add RSS feed"
			: isFile
				? "Add PDF / EPUB"
				: "Add link";
	}
	if (dom.addUrlLabel) dom.addUrlLabel.textContent = isRss ? "RSS feed URL" : "URL";
	if (dom.urlInput) {
		dom.urlInput.required = !isFile;
		dom.urlInput.placeholder = isRss
			? "https://example.com/feed.xml"
			: defaultUrlPlaceholder;
		dom.urlInput.value = "";
	}
	if (dom.addUrlGroup) dom.addUrlGroup.hidden = isFile;
	if (dom.addDetailsGroup) dom.addDetailsGroup.hidden = isRss;
	if (dom.addTypeGroup) dom.addTypeGroup.hidden = isFile || isRss;
	if (dom.addFilePicker) dom.addFilePicker.style.display = isFile ? "inline-flex" : "none";
	if (dom.addFileSummary) dom.addFileSummary.hidden = !isFile || !state.pendingUploadFile;
	if (dom.submitBtn) dom.submitBtn.textContent = isRss ? "Add RSS feed" : "Add";
	if (dom.typeSelect && mode === "link") dom.typeSelect.value = "article";
}

function closeAddModal() {
	if (!dom.addModal) return;
	dom.addModal.style.display = "none";
	document.body.classList.remove("modal-open");
}

function openAddModal(mode) {
	closeAddMenu();
	dom.form?.reset();
	state.pendingTags.length = 0;
	renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);
	state.fetchedMeta = null;
	clearPendingUploadFile();
	configureAddModal(mode);
	if (dom.addModal) dom.addModal.style.display = "flex";
	document.body.classList.add("modal-open");
	if (mode === "file") {
		dom.addFilePicker?.focus();
	} else {
		dom.urlInput?.focus();
	}
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
	if (dom.addFileSummary) {
		dom.addFileSummary.hidden = false;
		dom.addFileSummary.textContent = `Selected file: ${file.name}`;
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
			const message = [
				data.error || "File upload failed.",
				failed && `\n${failed}`,
			]
				.filter(Boolean)
				.join("\n");
			alert(message);
			return;
		}

		if ((data.skipped || 0) > 0 || data.failed_files?.length) {
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

function parseCsvRows(text) {
	const rows = [];
	let row = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === ",") {
			row.push(current);
			current = "";
			continue;
		}
		if (char === "\r") continue;

		if (char === "\n") {
			row.push(current);
			if (row.some((c) => c.trim() !== "")) rows.push(row);
			row = [];
			current = "";
			continue;
		}

		current += char;
	}

	if (current.length > 0 || row.length > 0) {
		row.push(current);
		if (row.some((c) => c.trim() !== "")) rows.push(row);
	}

	return rows;
}

function rowsToCsv(rows) {
	return rows
		.map((row) =>
			row
				.map((cell) => {
					const s = String(cell ?? "");
					return s.includes(",") || s.includes('"') || s.includes("\n")
						? `"${s.replace(/"/g, '""')}"`
						: s;
				})
				.join(","),
		)
		.join("\n");
}

async function postCsvChunk(csvText) {
	const blob = new Blob([csvText], { type: "text/csv" });
	const formData = new FormData();
	formData.append("file", blob, "chunk.csv");

	const response = await fetch("/api/import/readwise", {
		method: "POST",
		body: formData,
	}).catch(() => null);

	if (!response) throw new Error("Network error — no response from server.");
	if (handleAuthFailure(response)) return "auth";

	const raw = await response.text();
	let data = {};
	try {
		data = raw ? JSON.parse(raw) : {};
	} catch {
		data = {};
	}

	if (!response.ok)
		throw new Error(data.error || "Server error during import.");

	return data;
}

const IMPORT_CHUNK_SIZE = 200;
const IMPORT_CHUNK_RETRIES = 2;

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
		dom.importBtn.textContent = "Importing…";

		try {
			const text = await file.text();
			const allRows = parseCsvRows(text);

			if (allRows.length < 2) {
				alert("CSV appears to be empty or has no data rows.");
				return;
			}

			const [headerRow, ...dataRows] = allRows;
			const chunks = [];
			for (let i = 0; i < dataRows.length; i += IMPORT_CHUNK_SIZE) {
				chunks.push(dataRows.slice(i, i + IMPORT_CHUNK_SIZE));
			}

			let totalImported = 0;
			let totalDuplicate = 0;
			let totalSkipped = 0;
			let totalErrors = 0;

			for (let i = 0; i < chunks.length; i++) {
				if (chunks.length > 1) {
					dom.importBtn.textContent = `Importing… ${i + 1}/${chunks.length}`;
				}

				const chunkCsv = rowsToCsv([headerRow, ...chunks[i]]);

				let result = null;
				let lastErr = null;
				for (let attempt = 0; attempt <= IMPORT_CHUNK_RETRIES; attempt++) {
					try {
						result = await postCsvChunk(chunkCsv);
						lastErr = null;
						break;
					} catch (err) {
						lastErr = err;
					}
				}

				if (result === "auth") return;

				if (!result) {
					const partial =
						totalImported > 0
							? `\n\n${totalImported} items were imported before the failure. Re-running the full import is safe — already-imported items will be skipped as duplicates.`
							: "";
					alert(
						`Batch ${i + 1}/${chunks.length} failed: ${lastErr?.message || "Unknown error."}${partial}`,
					);
					if (totalImported > 0) {
						app.loadItems?.();
						app.loadTags?.();
					}
					return;
				}

				totalImported += result.imported ?? 0;
				totalDuplicate += result.duplicate ?? 0;
				totalSkipped += result.skipped ?? 0;
				totalErrors += result.errors ?? 0;
			}

			alert(
				`Imported ${totalImported} items. Duplicates: ${totalDuplicate}. Skipped: ${totalSkipped}. Errors: ${totalErrors}.`,
			);
			app.loadItems?.();
			app.loadTags?.();
		} catch (err) {
			alert(err?.message || "Import failed. Please try again.");
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

		if (state.addMode === "rss") return;

		const initialTitle = dom.titleInput?.value || "";
		const initialAuthor = dom.authorInput?.value || "";
		const initialType = dom.typeSelect?.value || "article";
		state.fetchTimeout = setTimeout(async () => {
			state.isFetching = true;
			if (dom.submitBtn) dom.submitBtn.textContent = "...";
			const meta = await fetchMetadata(url);
			if (meta && dom.urlInput?.value.trim() === url) {
				state.fetchedMeta = meta;
				if (dom.titleInput?.value === initialTitle) {
					dom.titleInput.value = meta.title || "";
				}
				if (dom.authorInput?.value === initialAuthor) {
					dom.authorInput.value = meta.author || "";
				}
				if (dom.typeSelect?.value === initialType) {
					dom.typeSelect.value = meta.type || "article";
				}
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

	if (state.addMode === "file") {
		if (!state.pendingUploadFile) {
			dom.fileUploadInput?.click();
			return;
		}
		await addPendingUploadFile(app);
		return;
	}

	if (!url) return;

	if (!dom.submitBtn) return;
	dom.submitBtn.disabled = true;
	dom.submitBtn.textContent = "Adding...";

	try {
		if (state.addMode === "rss") {
			await importRssFeedUrl(app, url);
			return;
		}

		if (state.isFetching) await wait(500);

		let title = dom.titleInput?.value.trim() || "";
		let author =
			dom.authorInput?.value.trim() || state.fetchedMeta?.author || "";
		let type = dom.typeSelect?.value || "article";
		let previewImage = state.fetchedMeta?.image || "";
		let readingTimeMinutes = state.fetchedMeta?.reading_time_minutes ?? null;

		if (!title && !state.fetchedMeta) {
			const meta = await fetchMetadata(url);
			if (meta) {
				title = meta.title || "";
				author = author || meta.author || "";
				type = meta.type || type;
				previewImage = meta.image || "";
				readingTimeMinutes = meta.reading_time_minutes ?? null;
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
				preview_image: previewImage,
				reading_time_minutes: readingTimeMinutes,
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

function cleanShareParams() {
	if (!window.location.search) return;
	const cleanUrl = `${window.location.origin}${window.location.pathname}`;
	window.history.replaceState({}, document.title, cleanUrl);
}

function handleShareStatusParams(app) {
	const params = new URLSearchParams(window.location.search);
	const shareKind = params.get("share");
	if (!shareKind) return false;

	if (shareKind === "auth-required") {
		showToast("Sign in to save shared content.", { type: "error" });
		cleanShareParams();
		return true;
	}

	if (shareKind === "empty") {
		showToast("Nothing to add from that share.", { type: "error" });
		cleanShareParams();
		return true;
	}

	if (shareKind === "file-error") {
		showToast(params.get("message") || "Could not import shared file.", {
			type: "error",
		});
		cleanShareParams();
		return true;
	}

	if (shareKind === "imported") {
		const itemId = Number(params.get("item"));
		const title = params.get("title") || "File";
		showToast(`Added “${title}” to your reading list.`);
		cleanShareParams();

		if (Number.isFinite(itemId) && itemId > 0) {
			const item = state.itemsById.get(itemId);
			if (item && app.openReader) {
				app.openReader(item.id, item.url, item.title, item.type);
			}
		}
		return true;
	}

	return false;
}

async function handleShareTarget(app) {
	if (handleShareStatusParams(app)) {
		return;
	}

	const params = new URLSearchParams(window.location.search);
	const shareKind = params.get("share");
	const rawUrl = (params.get("url") || "").trim();
	const rawText = (params.get("text") || "").trim();
	const rawTitle = (params.get("title") || "").trim();

	if (
		!shareKind &&
		!params.has("url") &&
		!params.has("text") &&
		!params.has("title")
	) {
		return;
	}

	if (state.isUnauthorized) {
		showToast("Sign in to save shared content.", { type: "error" });
		cleanShareParams();
		return;
	}

	let sharedUrl = rawUrl;
	if (!sharedUrl && rawText) {
		sharedUrl = extractUrlFromText(rawText);
	}

	if (sharedUrl && isValidUrl(sharedUrl)) {
		openAddModal("link");
		if (dom.urlInput) {
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

		cleanShareParams();

		if (shareKind === "link") {
			showToast("Review the link, then tap Add.");
		}

		return;
	}

	cleanShareParams();
}

function setRssStatus(message) {
	if (dom.rssStatus) dom.rssStatus.textContent = message;
}

async function importRssFeedUrl(app, feedUrl) {
	const response = await fetch("/api/rss-subscriptions", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ feed_url: feedUrl }),
	}).catch(() => null);
	if (!response) {
		alert("RSS import failed: no response from server.");
		return false;
	}
	if (handleAuthFailure(response)) return true;

	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		alert(data.error || "RSS import failed.");
		return false;
	}

	alert(`Following RSS feed. ${data.seen || 0} existing post(s) ignored.`);
	await loadRssSubscriptions();
	resetAddForm(app);
	return true;
}

async function importAllRssSubscriptions(app) {
	if (state.isUnauthorized) {
		showUnauthorizedState(state.authMessage);
		return;
	}
	if (!dom.rssImportAllBtn) return;

	const originalText = dom.rssImportAllBtn.textContent;
	dom.rssImportAllBtn.disabled = true;
	dom.rssImportAllBtn.textContent = "Refreshing...";
	setRssStatus("Refreshing RSS subscriptions...");

	try {
		const response = await fetch("/api/rss-subscriptions/import", {
			method: "POST",
		}).catch(() => null);
		if (!response) {
			setRssStatus("RSS refresh failed: no response from server.");
			return;
		}
		if (handleAuthFailure(response)) return;
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			setRssStatus(data.error || "RSS refresh failed.");
			return;
		}

		const results = Array.isArray(data.results) ? data.results : [];
		const imported = results.reduce((sum, result) => sum + (result.imported || 0), 0);
		const failed = results.filter((result) => !result.ok).length;
		setRssStatus(
			failed
				? `Imported ${imported} new item(s); ${failed} feed(s) failed.`
				: `Imported ${imported} new item(s).`,
		);
		app.loadItems?.();
		app.loadTags?.();
	} finally {
		dom.rssImportAllBtn.disabled = false;
		dom.rssImportAllBtn.textContent = originalText || "Refresh RSS";
	}
}

function initRssActions(app) {
	dom.rssImportAllBtn?.addEventListener("click", async () => {
		await importAllRssSubscriptions(app);
		await loadRssSubscriptions();
	});
	dom.rssSubscriptionsList?.addEventListener("click", async (event) => {
		const action = event.target.closest?.("[data-rss-action]");
		if (!action) return;
		const id = action.dataset.rssId;
		if (!id) return;
		if (action.dataset.rssAction === "delete") {
			const response = await fetch(`/api/rss-subscriptions/${id}`, {
				method: "DELETE",
			}).catch(() => null);
			if (!response) return;
			if (handleAuthFailure(response)) return;
			await loadRssSubscriptions();
		}
	});
	dom.accountButton?.addEventListener("click", () => {
		setTimeout(() => loadRssSubscriptions(), 0);
	});
}

function initAddMenu() {
	dom.addMenuButton?.addEventListener("click", (event) => {
		event.stopPropagation();
		const isOpen = dom.addMenuButton?.getAttribute("aria-expanded") === "true";
		if (isOpen) {
			closeAddMenu();
			return;
		}
		openAddMenu();
	});
	dom.addMenu?.addEventListener("click", (event) => {
		const option = event.target.closest?.("[data-add-type]");
		if (!option) return;
		openAddModal(option.dataset.addType || "link");
	});
	dom.addModalClose?.addEventListener("click", closeAddModal);
	dom.addModalCancel?.addEventListener("click", closeAddModal);
	dom.addFilePicker?.addEventListener("click", () => dom.fileUploadInput?.click());
	document.addEventListener("click", (event) => {
		if (dom.addEntry?.contains(event.target)) return;
		closeAddMenu();
	});
}

function renderRssSubscriptions(subscriptions) {
	if (!dom.rssSubscriptionsList) return;
	dom.rssSubscriptionsList.replaceChildren();
	if (!subscriptions.length) {
		const empty = document.createElement("p");
		empty.className = "account-meta";
		empty.textContent = "No RSS feeds yet.";
		dom.rssSubscriptionsList.appendChild(empty);
		return;
	}
	for (const subscription of subscriptions) {
		const row = document.createElement("div");
		row.className = "rss-subscription-row";
		const main = document.createElement("div");
		main.className = "rss-subscription-main";
		const title = document.createElement("strong");
		title.textContent = subscription.title || subscription.feed_url;
		const url = document.createElement("a");
		url.href = subscription.feed_url;
		url.target = "_blank";
		url.rel = "noopener";
		url.textContent = subscription.feed_url;
		main.append(title, url);
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "dropdown-clear";
		remove.dataset.rssAction = "delete";
		remove.dataset.rssId = String(subscription.id);
		remove.textContent = "Remove";
		row.append(main, remove);
		dom.rssSubscriptionsList.appendChild(row);
	}
}

async function loadRssSubscriptions() {
	if (!dom.rssSubscriptionsList || state.isUnauthorized) return;
	const response = await fetch("/api/rss-subscriptions").catch(() => null);
	if (!response) return;
	if (handleAuthFailure(response)) return;
	if (!response.ok) return;
	const subscriptions = await response.json().catch(() => []);
	renderRssSubscriptions(Array.isArray(subscriptions) ? subscriptions : []);
}

export function initForm(app) {
	setupTagInput(dom.tagInput, state.pendingTags, dom.tagsContainer, {
		preferSuggestionOnTab: true,
	});
	renderTagPills(state.pendingTags, dom.tagsContainer, dom.tagInput);

	initImport(app);
	initAddMenu();
	initRssActions(app);
	initFileInputs();
	initMetadataLookup();
	dom.form?.addEventListener("submit", (event) => submitItemForm(app, event));

	app.handleShareTarget = () => handleShareTarget(app);
	app.openAddModal = openAddModal;
}
