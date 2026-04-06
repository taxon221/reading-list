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
  excludedTags: [],
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
  searchTokens: [],
  searchQuery: "",
  searchInputFocused: false,
  currentEpubBook: null,
  currentEpubRendition: null,
  pendingUploadFile: null,
  itemsById: new Map(),
  pendingProgressSave: null,
  pendingProgressItemId: null,
  pendingProgressPayload: null,
  pendingScrollHighlightId: null,
  pendingMobileSelectionCheck: null,
  lockedBodyScrollY: 0,
  articleProgressPoll: null,
  mobileSelectionPoll: null,
  mobilePopupDismissTimer: null,
  savedViews: [],
  activeSavedViewId: "",
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
  searchShell: byId("search-shell"),
  searchTokenList: byId("search-token-list"),
  searchInput: byId("search-input"),
  searchSuggestions: byId("search-suggestions"),
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
    actionEl.textContent = action.label;
    wrapper.appendChild(actionEl);
  }

  return wrapper;
}

function getGuestAuthLink() {
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

function triggerBackgroundNavigation(url) {
  if (!url) return;

  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.src = url;
  document.body.appendChild(frame);

  window.setTimeout(() => {
    frame.remove();
  }, 4000);
}

function beginCloudflareAccountSwitch() {
  const teamLogoutUrl = state.authUi.switchAccountUrl;
  const appLogoutUrl = state.authUi.logoutUrl;
  const returnUrl = state.authUi.loginUrl || window.location.origin || "/";

  if (!teamLogoutUrl) {
    if (appLogoutUrl) window.location.assign(appLogoutUrl);
    else window.location.assign(returnUrl);
    return;
  }

  closeAccountModal();

  if (appLogoutUrl) {
    triggerBackgroundNavigation(appLogoutUrl);
  }

  let redirectStarted = false;
  const redirectToApp = () => {
    if (redirectStarted) return;
    redirectStarted = true;
    window.location.assign(returnUrl);
  };

  const popup = window.open(
    teamLogoutUrl,
    "reading-list-cloudflare-access-switch",
    "popup=yes,width=520,height=720",
  );

  if (!popup) {
    window.location.assign(teamLogoutUrl);
    return;
  }

  popup.focus?.();

  const closedPoll = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(closedPoll);
      redirectToApp();
    }
  }, 400);

  window.setTimeout(() => {
    window.clearInterval(closedPoll);
    redirectToApp();
  }, 2500);
}

function closeAccountModal() {
  if (!dom.accountButton || !dom.accountModalOverlay) return;
  dom.accountButton.setAttribute("aria-expanded", "false");
  dom.accountModalOverlay.hidden = true;
  dom.accountModalOverlay.style.display = "";
  document.body.classList.remove("account-modal-open");
}

function openAccountModal() {
  if (!dom.accountButton || !dom.accountModalOverlay) return;
  dom.accountButton.setAttribute("aria-expanded", "true");
  dom.accountModalOverlay.hidden = false;
  dom.accountModalOverlay.style.display = "flex";
  document.body.classList.add("account-modal-open");
  dom.accountModalClose?.focus();
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

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
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
    accountEntry.hidden = false;
    accountPanelUser.hidden = false;
    accountPanelGuest.hidden = true;

    accountTitle.textContent = state.isUnauthorized
      ? "Signed in — reading list blocked"
      : user.isAdmin
        ? "Admin account"
        : "Signed in";
    accountEmail.textContent = user.email;
    if (state.isUnauthorized) {
      accountMeta.textContent = state.authMessage;
    } else {
      const mode = state.authUi.authMode || "unknown";
      accountMeta.textContent = `Sign-in method: ${mode}`;
    }
    accountMeta.hidden = false;

    const actionHref = state.authUi.switchAccountUrl || state.authUi.logoutUrl;
    const actionLabel = state.authUi.switchAccountUrl ? "Switch account" : "Sign out";
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
    accountGuestMeta.textContent = `Sign-in method: ${mode}`;
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
  state.authUi.authMode = data?.authMode || "";
  state.authUi.publicAppUrl = data?.publicAppUrl || "";
  state.authUi.loginUrl = data?.loginUrl || "";
  state.authUi.logoutUrl = data?.logoutUrl || "";
  state.authUi.switchAccountUrl = data?.switchAccountUrl || "";
  state.authUi.currentUser = data?.currentUser || null;
  renderAccountModal();
}

export function initAuthUi() {
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

  dom.accountAction?.addEventListener("click", (event) => {
    if (!state.authUi.switchAccountUrl) return;

    event.preventDefault();
    beginCloudflareAccountSwitch();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.accountModalOverlay && !dom.accountModalOverlay.hidden) {
      closeAccountModal();
    }
  });
}

export function showUnauthorizedState(
  message = "This account is not authorized for this reading list.",
) {
  state.isUnauthorized = true;
  state.authMessage = message;
  closeAccountModal();
  renderAccountModal();

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

  if (dom.deleteFilterBtn) {
    dom.deleteFilterBtn.disabled = true;
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
