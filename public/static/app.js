import { initForm } from "./app/form.js";
import { initList } from "./app/list.js";
import { initReader } from "./app/reader.js";
import { dom, initAuthUi, loadAuthUi, state } from "./app/shared.js";
import { initTheme } from "./app/theme.js";

const app = { dom, state };

initList(app);
initReader(app);
initForm(app);
initTheme();
initAuthUi();

loadAuthUi();
app.loadItems?.();
app.loadTags?.();
app.handleShareTarget?.();
