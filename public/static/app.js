import { initForm } from "./app/form.js";
import { initList } from "./app/list.js";
import { initReader } from "./app/reader.js";
import { initReaderFont } from "./app/reader-font.js";
import { dom, initAuthUi, loadAuthUi, state } from "./app/shared.js";
import { initTheme } from "./app/theme.js";

const app = { dom, state };

initTheme();
initAuthUi();
initReaderFont();

initList(app);
initReader(app);
initForm(app);

loadAuthUi().then(async () => {
	app.loadSavedViews?.();
	app.loadItems?.();
	app.loadTags?.();
	await app.handleShareTarget?.();
});
