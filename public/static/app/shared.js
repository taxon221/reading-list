const byId = (id) => document.getElementById(id);

export const state = {
	isUnauthorized: false,
	authMessage: "",
	authUi: {
		authMode: "",
		setupAvailable: false,
		publicAppUrl: "",
		loginUrl: "",
		logoutUrl: "",
		switchAccountUrl: "",
		currentUser: null,
	},
	selectedTypes: [],
	selectedTags: [],
	excludedTags: [],
	readStatus: "all",
	selectedDomains: [],
	excludedDomains: [],
	selectedAuthors: [],
	excludedAuthors: [],
	availableTags: [],
	pendingTags: [],
	editTags: [],
	fetchedMeta: null,
	isFetching: false,
	fetchTimeout: null,
	currentDropdownItemId: null,
	currentDropdownItemUrl: null,
	currentReaderId: null,
	readerIframe: null,
	readerBlobUrl: null,
	currentHighlights: [],
	allHighlights: [],
	pendingSelectionText: "",
	editingHighlightId: null,
	searchTokens: [],
	searchQuery: "",
	searchInputFocused: false,
	currentEpubBook: null,
	currentEpubRendition: null,
	pendingUploadFile: null,
	addMode: "link",
	itemsById: new Map(),
	pendingProgressSave: null,
	pendingProgressItemId: null,
	pendingProgressPayload: null,
	pendingProgressAccount: null,
	pendingScrollHighlightId: null,
	pendingMobileSelectionCheck: null,
	lockedBodyScrollY: 0,
	articleProgressPoll: null,
	mobileSelectionPoll: null,
	mobilePopupDismissTimer: null,
	savedViews: [],
	activeSavedViewIds: [],
};

export const dom = {
	form: byId("add-item-form"),
	addEntry: byId("add-entry"),
	addMenuButton: byId("add-menu-button"),
	addMenu: byId("add-menu"),
	addModal: byId("add-modal"),
	addModalTitle: byId("add-modal-title"),
	addModalClose: byId("add-modal-close"),
	addModalCancel: byId("add-modal-cancel"),
	addUrlGroup: byId("add-url-group"),
	addUrlLabel: byId("add-url-label"),
	addDetailsGroup: byId("add-details-group"),
	addTypeGroup: byId("add-type-group"),
	addFileSummary: byId("add-file-summary"),
	addFilePicker: byId("add-file-picker"),
	urlInput: byId("url"),
	titleInput: byId("title"),
	authorInput: byId("author"),
	typeSelect: byId("type-select"),
	tagInput: byId("tag-input"),
	tagsContainer: byId("tags-input"),
	submitBtn: byId("submit-btn"),
	rssImportAllBtn: byId("rss-import-all-btn"),
	rssStatus: byId("rss-status"),
	rssSubscriptionsList: byId("rss-subscriptions-list"),
	itemsList: byId("items-list"),
	searchShell: byId("search-shell"),
	searchTokenList: byId("search-token-list"),
	searchInput: byId("search-input"),
	searchSuggestions: byId("search-suggestions"),
	fileUploadInput: byId("file-upload-input"),
	typeDropdown: byId("type-dropdown"),
	typeFilterBtn: byId("type-filter-btn"),
	typeFilterValue: byId("type-filter-value"),
	typeSearch: byId("type-search"),
	typeOptions: byId("type-options"),
	typeClear: byId("type-clear"),
	tagDropdown: byId("tag-dropdown"),
	tagFilterBtn: byId("tag-filter-btn"),
	tagFilterValue: byId("tag-filter-value"),
	tagSearch: byId("tag-search"),
	tagOptions: byId("tag-options"),
	tagClear: byId("tag-clear"),
	editModal: byId("edit-modal"),
	editForm: byId("edit-form"),
	editIdInput: byId("edit-id"),
	editUrlInput: byId("edit-url"),
	editTitleInput: byId("edit-title"),
	editAuthorInput: byId("edit-author"),
	editTypeSelect: byId("edit-type"),
	editTagInput: byId("edit-tag-input"),
	editTagsContainer: byId("edit-tags-input"),
	modalClose: byId("modal-close"),
	modalCancel: byId("modal-cancel"),
	readerModal: byId("reader-modal"),
	readerTitle: byId("reader-title"),
	readerContent: byId("reader-content"),
	readerClose: byId("reader-close"),
	readerOpenOriginal: byId("reader-open-original"),
	readerSidebar: byId("reader-sidebar"),
	readerToggleNotes: byId("reader-toggle-notes"),
	readerThemeToggle: byId("reader-theme-toggle"),
	readerFontDecrease: byId("reader-font-decrease"),
	readerFontIncrease: byId("reader-font-increase"),
	readerFontLabel: byId("reader-font-label"),
	readerProgress: byId("reader-progress"),
	readerProgressFill: byId("reader-progress-fill"),
	readerProgressLabel: byId("reader-progress-label"),
	sidebarHighlights: byId("sidebar-highlights"),
	highlightsCount: byId("highlights-count"),
	itemDropdownMenu: byId("item-dropdown-menu"),
	dropdownEdit: byId("dropdown-edit"),
	dropdownOpenUrl: byId("dropdown-open-url"),
	selectionPopup: byId("selection-popup"),
	popupHighlightBtn: byId("popup-highlight-btn"),
	noteModal: byId("note-modal"),
	noteModalTitle: byId("note-modal-title"),
	noteModalClose: byId("note-modal-close"),
	noteModalQuote: byId("note-modal-quote"),
	noteModalText: byId("note-modal-text"),
	noteModalCancel: byId("note-modal-cancel"),
	noteModalSave: byId("note-modal-save"),
	viewTabs: document.querySelectorAll(".view-tab"),
	readingListView: byId("reading-list-view"),
	notesView: byId("notes-view"),
	notesList: byId("notes-list"),
	importBtn: byId("import-btn"),
	importFile: byId("import-file"),
	deleteDropdown: byId("delete-dropdown"),
	deleteFilterBtn: byId("delete-filter-btn"),
	deleteByOptions: byId("delete-by-options"),
	deleteValueTextInput: byId("delete-value-text"),
	deleteValueOptions: byId("delete-value-options"),
	deleteClear: byId("delete-clear"),
	deleteConfirm: byId("delete-confirm"),
	viewsDropdown: byId("views-dropdown"),
	viewsFilterBtn: byId("views-filter-btn"),
	viewsFilterValue: byId("views-filter-value"),
	viewsOptions: byId("views-options"),
	filterChips: byId("filter-chips"),
	saveViewOpen: byId("save-view-open"),
	saveViewModal: byId("save-view-modal"),
	saveViewModalClose: byId("save-view-modal-close"),
	saveViewForm: byId("save-view-form"),
	saveViewName: byId("save-view-name"),
	saveViewCancel: byId("save-view-cancel"),
	accountEntry: byId("account-entry"),
	accountButton: byId("account-button"),
	accountModalOverlay: byId("account-modal-overlay"),
	accountModalBackdrop: byId("account-modal-backdrop"),
	accountModalClose: byId("account-modal-close"),
	accountPanelUser: byId("account-panel-user"),
	accountPanelGuest: byId("account-panel-guest"),
	accountTitle: byId("account-title"),
	accountEmail: byId("account-email"),
	accountMeta: byId("account-meta"),
	accountAction: byId("account-action"),
	accountGuestMessage: byId("account-guest-message"),
	accountGuestMeta: byId("account-guest-meta"),
	authLink: byId("auth-link"),
	themeToggle: byId("theme-toggle"),
};

export const defaultUrlPlaceholder =
	dom.urlInput?.getAttribute("placeholder") || "Paste a URL...";

function isLoopbackHost() {
	return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

function createStatusState(title, hint = "", action = null) {
	const wrapper = document.createElement("div");
	wrapper.className = "empty-state";

	const titleEl = document.createElement("p");
	titleEl.textContent = title;
	wrapper.appendChild(titleEl);

	if (hint) {
		const hintEl = document.createElement("p");
		hintEl.className = "empty-hint";
		hintEl.textContent = hint;
		wrapper.appendChild(hintEl);
	}

	if (action?.href && action?.label) {
		const actionEl = document.createElement("a");
		actionEl.className = "header-link";
		actionEl.href = action.href;
		if (state.authUi.authMode === "app")
			actionEl.addEventListener("click", (event) => {
				event.preventDefault();
				window.dispatchEvent(new Event("reading:signin"));
			});
		actionEl.textContent = action.label;
		wrapper.appendChild(actionEl);
	}

	return wrapper;
}

function getGuestAuthLink() {
	if (state.authUi.authMode === "app" && !state.authUi.currentUser) {
		return {
			href: "/#signin",
			label: state.authUi.setupAvailable ? "Set up your account" : "Sign in",
		};
	}
	const isLoopback = isLoopbackHost();

	if (state.isUnauthorized) {
		const href = !isLoopback
			? state.authUi.switchAccountUrl || state.authUi.logoutUrl
			: state.authUi.loginUrl;
		const label =
			!isLoopback && (state.authUi.switchAccountUrl || state.authUi.logoutUrl)
				? "Switch account"
				: "Sign in";
		if (href && label) {
			return { href, label };
		}
	}

	if (!state.authUi.currentUser && state.authUi.loginUrl) {
		return { href: state.authUi.loginUrl, label: "Sign in" };
	}

	return null;
}

function beginCloudflareAccountSwitch() {
	window.location.assign(
		state.authUi.switchAccountUrl || state.authUi.logoutUrl || "/",
	);
}

export function closeAccountModal() {
	if (!dom.accountButton || !dom.accountModalOverlay) return;
	const wasOpen = !dom.accountModalOverlay.hidden;
	dom.accountButton.setAttribute("aria-expanded", "false");
	dom.accountModalOverlay.hidden = true;
	dom.accountModalOverlay.style.display = "";
	document.body.classList.remove("account-modal-open");
	document.body.classList.remove("modal-open");
	if (wasOpen) dom.accountButton.focus();
}

function openAccountModal() {
	if (!dom.accountButton || !dom.accountModalOverlay) return;
	dom.accountButton.setAttribute("aria-expanded", "true");
	dom.accountModalOverlay.hidden = false;
	dom.accountModalOverlay.style.display = "flex";
	document.body.classList.add("account-modal-open");
	document.body.classList.add("modal-open");
	selectSettingsSection("account");
	dom.accountModalClose?.focus();
}

function selectSettingsSection(name) {
	for (const tab of document.querySelectorAll("[data-settings-tab]")) {
		const selected = tab.dataset.settingsTab === name;
		tab.setAttribute("aria-selected", String(selected));
		tab.tabIndex = selected ? 0 : -1;
	}
	for (const panel of document.querySelectorAll("[data-settings-panel]"))
		panel.hidden = panel.dataset.settingsPanel !== name;
	const content = document.querySelector(".settings-content");
	if (content) content.scrollTop = 0;
}

function createGuestAccountIconSvg() {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("class", "account-icon-guest");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", "22");
	svg.setAttribute("height", "22");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2");

	const circle = document.createElementNS(
		"http://www.w3.org/2000/svg",
		"circle",
	);
	circle.setAttribute("cx", "12");
	circle.setAttribute("cy", "7");
	circle.setAttribute("r", "4");

	svg.append(path, circle);
	return svg;
}

function renderAccountButton() {
	if (!dom.accountButton) return;

	const user = state.authUi.currentUser;
	const hasUser = Boolean(user);
	const rawInitial = hasUser
		? (user.displayName || user.email || "").trim().charAt(0)
		: "";
	const avatarText = rawInitial ? rawInitial.toUpperCase() : "";
	const label = hasUser
		? state.isUnauthorized
			? `Account (${user.displayName || user.email}) — list API blocked`
			: `Account for ${user.displayName || user.email}`
		: state.isUnauthorized
			? "Guest account"
			: "Account";

	dom.accountButton.title = label;
	dom.accountButton.setAttribute("aria-label", label);
	dom.accountButton.dataset.state = !hasUser
		? "guest"
		: state.isUnauthorized
			? "unauthorized"
			: "signed-in";
	dom.accountButton.replaceChildren();

	if (hasUser && avatarText) {
		dom.accountButton.textContent = avatarText;
		return;
	}

	if (hasUser) {
		dom.accountButton.textContent = "?";
		return;
	}

	dom.accountButton.appendChild(createGuestAccountIconSvg());
}

function renderAccountModal() {
	renderAccountButton();

	const {
		accountEntry,
		accountButton,
		accountPanelUser,
		accountPanelGuest,
		accountTitle,
		accountEmail,
		accountMeta,
		accountAction,
		accountGuestMessage,
		accountGuestMeta,
		authLink,
	} = dom;

	if (
		!accountEntry ||
		!accountButton ||
		!accountPanelUser ||
		!accountPanelGuest ||
		!accountTitle ||
		!accountEmail ||
		!accountMeta ||
		!accountAction ||
		!accountGuestMessage ||
		!accountGuestMeta ||
		!authLink
	) {
		return;
	}

	const user = state.authUi.currentUser;
	const hasUser = Boolean(user);

	if (hasUser) {
		dom.accountModalOverlay.dataset.guest = "false";
		document.getElementById("settings-tab-security").hidden =
			state.authUi.authMode !== "app";
		document.getElementById("account-invite-section").hidden =
			state.authUi.authMode !== "app" || !user.isAdmin;
		accountEntry.hidden = false;
		accountPanelUser.hidden = false;
		accountPanelGuest.hidden = true;

		accountTitle.textContent = state.isUnauthorized
			? "Signed in — reading list blocked"
			: user.isAdmin
				? "Owner account"
				: "Signed in";
		accountEmail.textContent = user.email;
		if (state.isUnauthorized) {
			accountMeta.textContent = state.authMessage;
		} else {
			accountMeta.textContent = "";
		}
		accountMeta.hidden = !state.isUnauthorized;

		const actionHref = state.authUi.switchAccountUrl || state.authUi.logoutUrl;
		const actionLabel = state.authUi.switchAccountUrl
			? "Switch account"
			: "Sign out";
		if (actionHref) {
			accountAction.hidden = false;
			accountAction.href = actionHref;
			accountAction.textContent = actionLabel;
		} else {
			accountAction.hidden = true;
			accountAction.removeAttribute("href");
			accountAction.textContent = "";
		}
		return;
	}

	dom.accountModalOverlay.dataset.guest = "true";
	accountEntry.hidden = false;
	accountPanelUser.hidden = true;
	accountPanelGuest.hidden = false;

	if (state.isUnauthorized) {
		accountGuestMessage.textContent = state.authMessage;
	} else {
		accountGuestMessage.textContent =
			"Sign in to load and manage your reading list.";
	}

	const mode = state.authUi.authMode;
	if (mode) {
		accountGuestMeta.textContent =
			mode === "app"
				? "Use a passkey or recovery code to sign in."
				: "Sign in to continue.";
		accountGuestMeta.hidden = false;
	} else {
		accountGuestMeta.textContent = "";
		accountGuestMeta.hidden = true;
	}

	const link = getGuestAuthLink();
	if (link) {
		authLink.hidden = false;
		authLink.href = link.href;
		authLink.textContent = link.label;
	} else {
		authLink.hidden = true;
		authLink.removeAttribute("href");
		authLink.textContent = "";
	}
}

export async function loadAuthUi() {
	const response = await fetch("/api/auth/info", {
		credentials: "same-origin",
	}).catch(() => null);
	if (!response?.ok) {
		if (dom.accountEntry) dom.accountEntry.hidden = false;
		state.authUi.currentUser = null;
		renderAccountModal();
		return;
	}

	let data = null;
	try {
		data = await response.json();
	} catch {
		if (dom.accountEntry) dom.accountEntry.hidden = false;
		state.authUi.currentUser = null;
		renderAccountModal();
		return;
	}

	state.isUnauthorized = false;
	if (dom.importBtn) dom.importBtn.disabled = false;
	if (dom.deleteFilterBtn) dom.deleteFilterBtn.disabled = false;
	state.authUi.authMode = data?.authMode || "";
	state.authUi.setupAvailable = data?.setupAvailable === true;
	state.authUi.publicAppUrl = data?.publicAppUrl || "";
	state.authUi.loginUrl = data?.loginUrl || "";
	state.authUi.logoutUrl = data?.logoutUrl || "";
	state.authUi.switchAccountUrl = data?.switchAccountUrl || "";
	const previousEmail = state.authUi.currentUser?.email;
	state.authUi.currentUser = data?.currentUser || null;
	if (previousEmail && previousEmail !== state.authUi.currentUser?.email)
		window.dispatchEvent(new Event("reading:account-changed"));
	renderAccountModal();
}

export function initAuthUi() {
	const settingsTabs = [...document.querySelectorAll("[data-settings-tab]")];
	for (const tab of settingsTabs) {
		tab.addEventListener("click", () =>
			selectSettingsSection(tab.dataset.settingsTab),
		);
		tab.addEventListener("keydown", (event) => {
			if (
				![
					"ArrowUp",
					"ArrowDown",
					"ArrowLeft",
					"ArrowRight",
					"Home",
					"End",
				].includes(event.key)
			)
				return;
			event.preventDefault();
			const visibleTabs = settingsTabs.filter((item) => !item.hidden);
			const index = visibleTabs.indexOf(tab);
			const next =
				event.key === "Home"
					? 0
					: event.key === "End"
						? visibleTabs.length - 1
						: (index +
								(["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) +
								visibleTabs.length) %
							visibleTabs.length;
			selectSettingsSection(visibleTabs[next].dataset.settingsTab);
			visibleTabs[next].focus();
		});
	}
	const compactSettings = window.matchMedia("(max-width: 600px)");
	const syncSettingsOrientation = () =>
		document
			.querySelector(".settings-nav")
			?.setAttribute(
				"aria-orientation",
				compactSettings.matches ? "horizontal" : "vertical",
			);
	compactSettings.addEventListener("change", syncSettingsOrientation);
	syncSettingsOrientation();
	dom.authLink?.addEventListener("click", (event) => {
		if (state.authUi.authMode === "app") {
			event.preventDefault();
			window.dispatchEvent(new Event("reading:signin"));
		}
	});
	dom.accountButton?.addEventListener("click", (event) => {
		event.stopPropagation();
		const isOpen = dom.accountButton?.getAttribute("aria-expanded") === "true";
		if (isOpen) {
			closeAccountModal();
		} else {
			renderAccountModal();
			openAccountModal();
		}
	});

	dom.accountModalBackdrop?.addEventListener("click", () => {
		closeAccountModal();
	});

	dom.accountModalClose?.addEventListener("click", () => {
		closeAccountModal();
	});

	dom.accountAction?.addEventListener("click", async (event) => {
		if (state.authUi.authMode === "app") {
			event.preventDefault();
			await fetch("/api/auth/logout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			localStorage.setItem("reading-account-event", String(Date.now()));
			window.dispatchEvent(new Event("reading:signout"));
			window.location.assign("/#signin");
			window.location.reload();
			return;
		}
		if (!state.authUi.switchAccountUrl) return;

		event.preventDefault();
		localStorage.setItem("reading-account-event", String(Date.now()));
		beginCloudflareAccountSwitch();
	});

	document.addEventListener("keydown", (event) => {
		if (
			event.key === "Escape" &&
			dom.accountModalOverlay &&
			!dom.accountModalOverlay.hidden
		) {
			closeAccountModal();
		}
	});
}

export function showUnauthorizedState(
	message = "This account is not authorized for this reading list.",
	{ title = "Not authorized", actionLabel = "Open protected app" } = {},
) {
	state.isUnauthorized = true;
	state.authMessage = message;
	closeAccountModal();
	renderAccountModal();

	let action = null;
	if (state.authUi.authMode === "app" && !state.authUi.currentUser) {
		action = { href: "/#signin", label: actionLabel };
	} else if (
		!isLoopbackHost() &&
		(state.authUi.switchAccountUrl || state.authUi.logoutUrl)
	) {
		action = {
			href: state.authUi.switchAccountUrl || state.authUi.logoutUrl,
			label: "Switch account",
		};
	} else if (state.authUi.loginUrl) {
		action = { href: state.authUi.loginUrl, label: "Open protected app" };
	}

	if (dom.importBtn) {
		dom.importBtn.disabled = true;
	}

	if (dom.deleteFilterBtn) {
		dom.deleteFilterBtn.disabled = true;
	}

	if (dom.itemsList) {
		dom.itemsList.replaceChildren(createStatusState(title, message, action));
	}

	if (dom.notesList) {
		dom.notesList.replaceChildren(createStatusState(title, message, action));
	}
}

export function showSignedOutState() {
	const setup =
		state.authUi.setupAvailable || sessionStorage.getItem("reading-invite");
	showUnauthorizedState(
		setup
			? "Set up your account to open your reading list."
			: "Sign in to open your reading list.",
		{
			title: "Your reading list awaits",
			actionLabel: setup ? "Set up your account" : "Sign in",
		},
	);
}

function getAuthFailureMessage(status) {
	if (state.authUi.authMode === "cloudflare") {
		if (status === 403)
			return "This account is authenticated, but it is not mapped to a local reading-list user yet.";
		return state.authUi.publicAppUrl &&
			window.location.origin === state.authUi.publicAppUrl
			? "Cloudflare Access login succeeded, but this app could not validate the token. Check CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD for this hostname."
			: "Cloudflare Access did not provide a user identity.";
	}
	return status === 401
		? "Your session has ended. Sign in again to continue; your unfinished work is kept on this device."
		: "You don't have access to this action.";
}

export function handleAuthFailure(response) {
	if (!response || ![401, 403].includes(response.status)) return false;
	void import("./drafts.js").then(({ saveDraft }) => saveDraft());
	showUnauthorizedState(getAuthFailureMessage(response.status));
	if (response.status === 401 && state.authUi.authMode === "app")
		window.dispatchEvent(new Event("reading:signin"));
	return true;
}
