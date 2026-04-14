import {
	dom,
	handleAuthFailure,
	showUnauthorizedState,
	state,
} from "./shared.js";
import {
	getAuthorizedItemUrl,
	renderTagPills,
	setupTagInput,
} from "./utils.js";

export function createListEditing({ app, loadItems, loadTags, filterByTag }) {
	async function fetchPreviewImage(url) {
		if (!url || !URL.canParse(url)) return "";

		const response = await fetch(
			`/api/fetch-meta?url=${encodeURIComponent(url)}`,
		).catch(() => null);
		if (!response?.ok) return "";

		const data = await response.json().catch(() => null);
		return String(data?.image || "").trim();
	}

	function openItemMenu(button, id, url) {
		if (!dom.itemDropdownMenu) return;

		state.currentDropdownItemId = id;
		state.currentDropdownItemUrl = url;

		const rect = button.getBoundingClientRect();
		dom.itemDropdownMenu.style.top = `${rect.bottom + 4}px`;
		dom.itemDropdownMenu.style.left = `${rect.right - 160}px`;
		dom.itemDropdownMenu.style.display = "block";

		document.querySelectorAll(".btn-more").forEach((node) => {
			node.classList.remove("active");
		});
		button.classList.add("active");
	}

	function closeItemMenu() {
		if (!dom.itemDropdownMenu) return;

		dom.itemDropdownMenu.style.display = "none";
		state.currentDropdownItemId = null;
		state.currentDropdownItemUrl = null;
		document.querySelectorAll(".btn-more").forEach((node) => {
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

		const response = await fetch(`/api/items/${id}`, {
			method: "DELETE",
		}).catch(() => null);
		if (!response) return;
		if (handleAuthFailure(response)) return;

		loadItems();
		loadTags();
	}

	async function openEditModal(id, options = {}) {
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
		if (dom.editForm) dom.editForm.dataset.originalUrl = item.url || "";

		state.editTags.length = 0;
		if (Array.isArray(item.tags)) {
			state.editTags.push(...item.tags);
		}
		renderTagPills(state.editTags, dom.editTagsContainer, dom.editTagInput);
		dom.editModal.style.display = "flex";
		if (options.focusTagInput) {
			window.requestAnimationFrame(() => {
				dom.editTagInput?.focus();
			});
		}
	}

	function closeEditModal() {
		if (!dom.editModal || !dom.editForm) return;

		dom.editModal.style.display = "none";
		dom.editForm.reset();
		state.editTags.length = 0;
		renderTagPills(state.editTags, dom.editTagsContainer, dom.editTagInput);
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

	function initItemsList() {
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
				preview_image: "",
				tags: state.editTags,
			};
			const originalUrl = dom.editForm?.dataset.originalUrl || "";
			if (payload.url === originalUrl) {
				payload.preview_image =
					state.itemsById.get(Number(dom.editIdInput?.value))?.preview_image ||
					"";
			} else {
				payload.preview_image = await fetchPreviewImage(payload.url);
			}

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

	return {
		closeEditModal,
		closeItemMenu,
		initEditModal,
		initItemMenu,
		initItemsList,
		openEditModal,
	};
}
