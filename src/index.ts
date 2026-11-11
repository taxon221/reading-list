import { registerLibraryRoutes } from "./server/register-library-routes";
import { registerAuthRoutes } from "./server/register-auth-routes";
import { HTTPException } from "hono/http-exception";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { serveStatic } from "hono/bun";
import { compress } from "hono/compress";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
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
import { registerRssRoutes } from "./server/register-rss-routes";
import { registerShareRoutes } from "./server/register-share-routes";
import type { AppBindings } from "./server/types";
import { renderIndexPage } from "./ui/index-page";

const app = new Hono<AppBindings>();
const indexPage = renderIndexPage();
const protectBrowserForms = csrf({
	origin: (origin, c) =>
		origin === new URL(Bun.env.APP_PUBLIC_URL || c.req.url).origin,
});

initDb();
app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse();
	if (c.req.path.startsWith("/api/auth/"))
		return c.json(
			{ error: "Could not verify this request. Please try again." },
			400,
		);
	console.error("Request failed", error);
	return c.json({ error: "Something went wrong. Please try again." }, 500);
});

app.use(
	"/*",
	secureHeaders({
		crossOriginOpenerPolicy: false,
		strictTransportSecurity: false,
		permissionsPolicy: { camera: [], geolocation: [], microphone: [] },
	}),
);
app.use("/api/*", (c, next) => {
	if (!c.req.header("origin") && !c.req.header("sec-fetch-site")) return next();
	return protectBrowserForms(c, next);
});
app.use("/*", compress());
app.use("/*", async (c, next) => {
	await next();

	const path = c.req.path;
	if (
		path.startsWith("/api/") ||
		path === "/sw.js" ||
		path === "/" ||
		path === "/share-target"
	) {
		// Routes such as /api/image choose their own private caching.
		if (!c.res.headers.has("Cache-Control"))
			c.header("Cache-Control", "no-store, max-age=0");
		c.header("CDN-Cache-Control", "no-store");
	}
});

// Static files keep their URLs across releases, so browsers store them but
// revalidate each use; unchanged files answer with an empty 304.
const revalidateStatic: MiddlewareHandler = async (c, next) => {
	await next();
	const etag = c.res.headers.get("ETag");
	if (c.res.status !== 200 || !etag) return;
	c.header("Cache-Control", "no-cache");
	c.header("CDN-Cache-Control", "no-store");
	const ifNoneMatch = c.req.header("If-None-Match");
	if (ifNoneMatch?.split(",").some((tag) => tag.trim() === etag))
		c.res = new Response(null, { status: 304, headers: c.res.headers });
};
const staticOptions = {
	onFound(path: string, c: Context) {
		const file = Bun.file(path);
		c.header(
			"ETag",
			`W/"${file.size.toString(36)}-${Math.trunc(file.lastModified).toString(36)}"`,
		);
	},
};

app.use(
	"/static/*",
	revalidateStatic,
	serveStatic({ root: "./public", ...staticOptions }),
);
app.get(
	"/manifest.webmanifest",
	revalidateStatic,
	serveStatic({ path: "./public/manifest.webmanifest", ...staticOptions }),
);
app.get(
	"/pdf-reader.html",
	revalidateStatic,
	serveStatic({ path: "./public/pdf-reader.html", ...staticOptions }),
);
app.get("/sw.js", serveStatic({ path: "./public/sw.js" }));
app.get("/", (c) => c.html(indexPage));

registerShareRoutes(app);
registerAuthRoutes(app);

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

registerLibraryRoutes(app);
registerContentRoutes(app);
registerImportRoutes(app);
registerItemRoutes(app);
registerRssRoutes(app);

const port = Bun.env.PORT || 3000;
console.log(`Reading List running at http://localhost:${port}`);

const localMode = Bun.env.AUTH_MODE === "local";
export default {
	port,
	hostname: Bun.env.APP_HOST || (localMode ? "127.0.0.1" : "0.0.0.0"),
	maxRequestBodySize: 128 * 1024 * 1024,
	fetch: app.fetch,
};
