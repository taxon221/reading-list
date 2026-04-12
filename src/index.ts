import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { initDb } from "./db";
import {
	getAppLogoutTarget,
	getAuthUiUrls,
	getSwitchAccountTarget,
	resolveRequestUser,
} from "./server/auth";
import { registerContentRoutes } from "./server/register-content-routes";
import { registerImportRoutes } from "./server/register-import-routes";
import { registerItemRoutes } from "./server/register-items-routes";
import type { AppBindings } from "./server/types";
import { renderIndexPage } from "./ui/index-page";

const app = new Hono<AppBindings>();
const indexPage = renderIndexPage();

initDb();

app.use("/*", cors());
app.use("/*", async (c, next) => {
	await next();

	const path = c.req.path;
	if (
		path === "/" ||
		path === "/manifest.webmanifest" ||
		path === "/pdf-reader.html" ||
		path.endsWith(".js") ||
		path.endsWith(".css")
	) {
		c.header("Cache-Control", "no-store, max-age=0");
		c.header("CDN-Cache-Control", "no-store");
	}
});

app.use("/static/*", serveStatic({ root: "./public" }));
app.get(
	"/manifest.webmanifest",
	serveStatic({ path: "./public/manifest.webmanifest" }),
);
app.get("/pdf-reader.html", serveStatic({ path: "./public/pdf-reader.html" }));
app.get("/", (c) => c.html(indexPage));

app.get("/api/auth/info", async (c) => c.json(await getAuthUiUrls(c)));
app.get("/auth/logout", (c) => {
	const target = getAppLogoutTarget(c) || "/";
	return c.redirect(target);
});
app.get("/auth/switch", (c) => {
	const target = getSwitchAccountTarget(c) || getAppLogoutTarget(c) || "/";
	return c.redirect(target);
});

app.use("/api/*", async (c, next) => {
	const { status, user } = await resolveRequestUser(c);
	if (status === 401) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	if (!user) {
		return c.json({ error: "Forbidden" }, 403);
	}

	c.set("currentUser", user);
	await next();
});

registerContentRoutes(app);
registerImportRoutes(app);
registerItemRoutes(app);

const port = Bun.env.PORT || 3000;
console.log(`Reading List running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
