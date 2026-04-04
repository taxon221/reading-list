const byId = (id) => document.getElementById(id);

export const state = {
  isUnauthorized: false,
  authMessage: "",
  authUi: {
    authMode: "",
    publicAppUrl: "",
    loginUrl: "",
    logoutUrl: "",
    switchAccountUrl: "",
    currentUser: null,
  },
  selectedTypes: [],
  selectedTags: [],
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
  searchQuery: "",
  currentEpubBook: null,
  currentEpubRendition: null,
  pendingUploadFile: null,
  itemsById: new Map(),
  pendingProgressSave: null,
  pendingProgressItemId: null,
  pendingProgressPayload: null,
  pendingMobileSelectionCheck: null,
  lockedBodyScrollY: 0,
  articleProgressPoll: null,
  mobileSelectionPoll: null,
  mobilePopupDismissTimer: null,
};

export const dom = {
  form: byId("add-item-form"),
  urlInput: byId("url"),
  titleInput: byId("title"),
  authorInput: byId("author"),
  typeSelect: byId("type-select"),
  tagInput: byId("tag-input"),
  tagsContainer: byId("tags-input"),
  submitBtn: byId("submit-btn"),
  itemsList: byId("items-list"),
  searchInput: byId("search-input"),
  fileUploadInput: byId("file-upload-input"),
  addFormSection: document.querySelector(".add-form"),
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
  envBadge: byId("env-badge"),
  accountMenu: byId("account-menu"),
  accountButton: byId("account-button"),
  accountLabel: byId("account-label"),
  accountPopover: byId("account-popover"),
  accountTitle: byId("account-title"),
  accountEmail: byId("account-email"),
  accountMeta: byId("account-meta"),
  accountAction: byId("account-action"),
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
    actionEl.textContent = action.label;
    wrapper.appendChild(actionEl);
  }

  return wrapper;
}

function closeAccountPopover() {
  if (!dom.accountButton || !dom.accountPopover) return;
  dom.accountButton.setAttribute("aria-expanded", "false");
  dom.accountPopover.hidden = true;
}

function renderAccountMenu() {
  if (
    !dom.accountMenu ||
    !dom.accountButton ||
    !dom.accountLabel ||
    !dom.accountPopover ||
    !dom.accountTitle ||
    !dom.accountEmail ||
    !dom.accountMeta ||
    !dom.accountAction
  ) {
    return;
  }

  const user = state.authUi.currentUser;
  if (!user || state.isUnauthorized) {
    dom.accountMenu.hidden = true;
    closeAccountPopover();
    return;
  }

  const label = user.displayName || user.email;
  dom.accountMenu.hidden = false;
  dom.accountLabel.textContent = label;
  dom.accountTitle.textContent = user.isAdmin ? "Admin account" : "Signed in";
  dom.accountEmail.textContent = user.email;
  dom.accountMeta.textContent = `Auth: ${state.authUi.authMode || "unknown"}`;

  const actionHref = state.authUi.logoutUrl || state.authUi.switchAccountUrl;
  if (actionHref) {
    dom.accountAction.hidden = false;
    dom.accountAction.href = actionHref;
    dom.accountAction.textContent = "Sign out";
  } else {
    dom.accountAction.hidden = true;
    dom.accountAction.removeAttribute("href");
    dom.accountAction.textContent = "";
  }
}

function renderAuthLink() {
  if (!dom.authLink) return;

  if (state.authUi.currentUser && !state.isUnauthorized) {
    dom.authLink.hidden = true;
    dom.authLink.textContent = "";
    dom.authLink.removeAttribute("href");
    return;
  }

  const isLoopback = isLoopbackHost();

  const href = state.isUnauthorized
    ? !isLoopback
      ? state.authUi.switchAccountUrl || state.authUi.logoutUrl
      : state.authUi.loginUrl
    : ""
  const label = state.isUnauthorized
    ? !isLoopback && (state.authUi.switchAccountUrl || state.authUi.logoutUrl)
      ? "Switch account"
      : "Sign in"
      : "";

  if (!href || !label) {
    dom.authLink.hidden = true;
    dom.authLink.textContent = "";
    dom.authLink.removeAttribute("href");
    return;
  }

  dom.authLink.hidden = false;
  dom.authLink.href = href;
  dom.authLink.textContent = label;
}

function renderEnvironmentBadge() {
  if (!dom.envBadge) return;

  const label = state.authUi.authMode;

  if (!label) {
    dom.envBadge.hidden = true;
    dom.envBadge.textContent = "";
    return;
  }

  dom.envBadge.hidden = false;
  dom.envBadge.textContent = label;
}

export async function loadAuthUi() {
  const response = await fetch("/api/auth/info").catch(() => null);
  if (!response?.ok) return;

  const data = await response.json();
  state.isUnauthorized = false;
  state.authUi.authMode = data?.authMode || "";
  state.authUi.publicAppUrl = data?.publicAppUrl || "";
  state.authUi.loginUrl = data?.loginUrl || "";
  state.authUi.logoutUrl = data?.logoutUrl || "";
  state.authUi.switchAccountUrl = data?.switchAccountUrl || "";
  state.authUi.currentUser = data?.currentUser || null;
  renderEnvironmentBadge();
  renderAccountMenu();
  renderAuthLink();
}

export function initAuthUi() {
  if (!dom.accountButton || !dom.accountPopover) return;

  dom.accountButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = dom.accountButton.getAttribute("aria-expanded") === "true";
    dom.accountButton.setAttribute("aria-expanded", isOpen ? "false" : "true");
    dom.accountPopover.hidden = isOpen;
  });

  document.addEventListener("click", (event) => {
    if (!dom.accountMenu?.contains(event.target)) {
      closeAccountPopover();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAccountPopover();
    }
  });
}

export function showUnauthorizedState(
  message = "This account is not authorized for this reading list.",
) {
  state.isUnauthorized = true;
  state.authMessage = message;
  closeAccountPopover();
  renderAccountMenu();
  renderAuthLink();

  let action = null;
  if (!isLoopbackHost() && (state.authUi.switchAccountUrl || state.authUi.logoutUrl)) {
    action = {
      href: state.authUi.switchAccountUrl || state.authUi.logoutUrl,
      label: "Switch account",
    };
  } else if (state.authUi.loginUrl) {
    action = { href: state.authUi.loginUrl, label: "Open protected app" };
  }

  if (dom.addFormSection) {
    dom.addFormSection.style.display = "none";
  }

  if (dom.importBtn) {
    dom.importBtn.disabled = true;
  }

  if (dom.itemsList) {
    dom.itemsList.replaceChildren(
      createStatusState("Not authorized", message, action),
    );
  }

  if (dom.notesList) {
    dom.notesList.replaceChildren(
      createStatusState("Not authorized", message, action),
    );
  }
}

export function handleAuthFailure(response) {
  if (!response || (response.status !== 401 && response.status !== 403)) {
    return false;
  }

  const onProtectedApp =
    !!state.authUi.publicAppUrl &&
    window.location.origin === state.authUi.publicAppUrl;

  showUnauthorizedState(
    response.status === 401
      ? onProtectedApp
        ? "Cloudflare Access login succeeded, but this app could not validate the token. Check CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUD for this hostname."
        : "Cloudflare Access did not provide a user identity."
      : "This account is authenticated, but it is not mapped to a local reading-list user yet.",
  );

  return true;
}
