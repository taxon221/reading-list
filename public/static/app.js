import { initNetwork } from "./app/network.js";
import { initAppAuth } from "./app/auth-ui.js";
import { initDrafts, restoreDraft } from "./app/drafts.js";
import { initAccessibility } from "./app/accessibility.js";
import { initLibraryTools } from "./app/library-tools.js";
import { initForm } from "./app/form.js";
import { initList } from "./app/list.js";
import { initReader } from "./app/reader.js";
import { initReaderFont } from "./app/reader-font.js";
import {
	dom,
	initAuthUi,
	loadAuthUi,
	showSignedOutState,
	state,
} from "./app/shared.js";
import { initTheme } from "./app/theme.js";

const app = { dom, state };
window.addEventListener("storage", (event) => {
	if (event.key === "reading-account-event") location.reload();
});
window.addEventListener("reading:account-changed", () => {
	app.closeReader?.({ fromHistory: true });
	state.itemsById.clear();
	state.allHighlights = [];
	state.pendingTags.length = 0;
	state.pendingUploadFile = null;
	dom.form?.reset();
	if (dom.addModal) dom.addModal.style.display = "none";
	dom.notesList?.replaceChildren();
	dom.itemsList?.replaceChildren();
	const note = document.getElementById("recovered-note");
	if (note) note.hidden = true;
});

initNetwork();
initTheme();
initAuthUi();
initReaderFont();

initList(app);
initReader(app);
initForm(app);
initAppAuth(app);
initDrafts();
initAccessibility();
initLibraryTools();

loadAuthUi().then(async () => {
	const showingInvitation = await app.prepareInvitation();
	if (state.authUi.authMode === "app" && !state.authUi.currentUser) {
		showSignedOutState();
		if (!showingInvitation) app.showSignIn();
		return;
	}
	app.loadSavedViews?.();
	await app.loadItems?.();
	app.loadTags?.();
	await app.handleShareTarget?.();
	if (state.authUi.currentUser) await restoreDraft(app);
});
