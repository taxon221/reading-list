import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { isIP } from "node:net";
import { basename, extname, resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { verifyAccessToken } from "./access";
import { dataDir, db, initDb } from "./db";

type CurrentUser = {
  id: number;
  email: string;
  display_name: string;
  is_admin: number;
  created_at: string;
};

type ItemRow = {
  id: number;
  user_id: number;
  url: string;
  title: string;
  author: string;
  type: string;
  notes: string;
  created_at: string;
  is_read: number;
  reading_progress: string;
};

type HighlightRow = {
  id: number;
  user_id: number;
  item_id: number;
  selected_text: string;
  note: string;
  created_at: string;
};

type TagRow = {
  name: string;
};

type UserPreferencesRow = {
  user_id: number;
  saved_views: string;
};

type SavedViewRecord = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
};

type AppBindings = {
  Variables: {
    currentUser: CurrentUser;
  };
};

const app = new Hono<AppBindings>();

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
    // CDN-Cache-Control tells Cloudflare (and other CDNs) not to cache at the edge,
    // even if a "Cache Everything" rule is configured.
    c.header("CDN-Cache-Control", "no-store");
  }
});
app.use("/static/*", serveStatic({ root: "./public" }));
app.get(
  "/manifest.webmanifest",
  serveStatic({ path: "./public/manifest.webmanifest" }),
);
app.get("/pdf-reader.html", serveStatic({ path: "./public/pdf-reader.html" }));
app.get("/", serveStatic({ path: "./public/index.html" }));
app.get("/api/auth/info", async (c) => c.json(await getAuthUiUrls(c)));
app.get("/auth/logout", (c) => {
  const target = getAppLogoutTarget(c) || getAuthRouteBase(c) || "/";
  return c.redirect(target);
});
app.get("/auth/switch", (c) => {
  const target =
    getSwitchAccountTarget(c) || getAppLogoutTarget(c) || getAuthRouteBase(c) || "/";
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

const uploadsDir = `${dataDir}/uploads`;
const uploadsRoot = resolve(uploadsDir);
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const allowedUploadExtensions = new Set(["pdf", "epub"]);
const bootstrapAdminEmail = normalizeEmail(Bun.env.BOOTSTRAP_ADMIN_EMAIL);
const publicAppUrl = normalizeUrl(Bun.env.APP_PUBLIC_URL);
const cloudflareAccessTeamDomain = normalizeUrl(
  Bun.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
);

function normalizeEmail(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase();
}

function normalizeUrl(value: string | undefined | null): string {
  return (value || "").trim().replace(/\/+$/, "");
}

function defaultDisplayName(email: string): string {
  const localPart = email.split("@")[0]?.trim();
  return localPart || email;
}

function getLocalDevAuthEmail(): string {
  return normalizeEmail(Bun.env.LOCAL_DEV_AUTH_EMAIL);
}

function getConfiguredAuthMode() {
  const value = (Bun.env.AUTH_MODE || "").trim().toLowerCase();
  if (value === "local" || value === "cloudflare") return value;
  return "";
}

function getCurrentUser(c: Context<AppBindings>): CurrentUser {
  return c.get("currentUser");
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** Public browser origin when the app is reached via reverse proxy (Bun URL is loopback). */
function getForwardedPublicOrigin(c: Context<AppBindings>): string {
  const rawProto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const rawHost = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  if (!rawProto || !rawHost) return "";

  const proto = rawProto.toLowerCase();
  if (proto !== "http" && proto !== "https") return "";

  const host = rawHost.toLowerCase();
  if (!host || host.includes("/") || host.includes(" ")) return "";

  return `${proto}://${host}`;
}

function getAuthRouteBase(c: Context<AppBindings>): string {
  if (publicAppUrl) return publicAppUrl;

  const requestUrl = new URL(c.req.url);
  if (isLoopbackHostname(requestUrl.hostname)) {
    const forwarded = getForwardedPublicOrigin(c);
    if (forwarded) return forwarded;
    return "";
  }

  return requestUrl.origin;
}

function getAppLogoutTarget(c: Context<AppBindings>): string {
  const authRouteBase = getAuthRouteBase(c);
  return authRouteBase ? `${authRouteBase}/cdn-cgi/access/logout` : "";
}

function getSwitchAccountTarget(c: Context<AppBindings>): string {
  if (getConfiguredAuthMode() === "cloudflare" && cloudflareAccessTeamDomain) {
    return `${cloudflareAccessTeamDomain}/cdn-cgi/access/logout`;
  }

  return getAppLogoutTarget(c);
}

async function getAuthUiUrls(c: Context<AppBindings>) {
  const authRouteBase = getAuthRouteBase(c);
  const { user } = await resolveRequestUser(c);

  return {
    authMode: getConfiguredAuthMode(),
    publicAppUrl,
    loginUrl: authRouteBase,
    logoutUrl: authRouteBase ? `${authRouteBase}/auth/logout` : "",
    switchAccountUrl: authRouteBase ? `${authRouteBase}/auth/switch` : "",
    currentUser: user
      ? {
          email: user.email,
          displayName: user.display_name,
          isAdmin: Boolean(user.is_admin),
        }
      : null,
  };
}

function getLocalDevIdentity(c: Context<AppBindings>) {
  if (getConfiguredAuthMode() !== "local") return null;

  const localDevAuthEmail = getLocalDevAuthEmail();
  if (!localDevAuthEmail) return null;

  const hostname = new URL(c.req.url).hostname.toLowerCase();
  if (!isLoopbackHostname(hostname)) return null;

  return {
    email: localDevAuthEmail,
    displayName: defaultDisplayName(localDevAuthEmail),
  };
}

async function resolveRequestUser(c: Context<AppBindings>) {
  let identity = getLocalDevIdentity(c);

  if (!identity && getConfiguredAuthMode() === "cloudflare") {
    identity = await verifyAccessToken(
      c.req.header("cf-access-jwt-assertion"),
    ).catch(() => null);
  }

  if (!identity?.email) {
    return { status: 401, user: null };
  }

  return {
    status: 200,
    user: findUserByEmail(identity.email) || ensureUser(identity.email, identity.displayName),
  };
}

function findUserByEmail(email: string): CurrentUser | null {
  return (
    (db.query("SELECT * FROM users WHERE email = ?").get(email) as
      | CurrentUser
      | undefined) || null
  );
}

function ensureUser(email: string, displayName: string): CurrentUser | null {
  if (!email) return null;

  const isAdmin = email === bootstrapAdminEmail ? 1 : 0;

  db.query(
    `
      INSERT INTO users (email, display_name, is_admin)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        display_name = COALESCE(NULLIF(excluded.display_name, ''), users.display_name),
        is_admin = CASE
          WHEN excluded.is_admin = 1 THEN 1
          ELSE users.is_admin
        END
    `,
  ).run(email, displayName || defaultDisplayName(email), isAdmin);

  return findUserByEmail(email);
}

function normalizeSavedViewName(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function sanitizeSavedViewFilters(filters: unknown): Record<string, unknown> {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return {};
  }

  return filters as Record<string, unknown>;
}

function sanitizeSavedViews(savedViews: unknown): SavedViewRecord[] {
  if (!Array.isArray(savedViews)) return [];

  const seenIds = new Set<string>();
  const normalized: SavedViewRecord[] = [];

  for (const entry of savedViews) {
    if (!entry || typeof entry !== "object") continue;

    const name = normalizeSavedViewName((entry as { name?: unknown }).name);
    if (!name) continue;

    let id = String((entry as { id?: unknown }).id || "").trim().slice(0, 120);
    if (!id) {
      id = crypto.randomUUID();
    }
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    normalized.push({
      id,
      name,
      filters: sanitizeSavedViewFilters((entry as { filters?: unknown }).filters),
    });

    if (normalized.length >= 100) break;
  }

  return normalized;
}

function getUserSavedViews(userId: number): SavedViewRecord[] {
  const row = db
    .query("SELECT saved_views FROM user_preferences WHERE user_id = ?")
    .get(userId) as UserPreferencesRow | undefined;

  if (!row?.saved_views) return [];

  try {
    return sanitizeSavedViews(JSON.parse(row.saved_views));
  } catch {
    return [];
  }
}

function setUserSavedViews(userId: number, savedViews: unknown): SavedViewRecord[] {
  const normalized = sanitizeSavedViews(savedViews);

  db.query(
    `
      INSERT INTO user_preferences (user_id, saved_views)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        saved_views = excluded.saved_views,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(userId, JSON.stringify(normalized));

  return normalized;
}

function getOwnedItem(id: string | number | bigint, userId: number) {
  return (db
    .query("SELECT * FROM items WHERE id = ? AND user_id = ?")
    .get(id, userId) as ItemRow | undefined) || null;
}

function deleteOwnedItem(currentUser: CurrentUser, id: number): boolean {
  const item = getOwnedItem(id, currentUser.id) as { url: string } | null;
  if (!item) return false;
  if (item.url) removeUploadedFileIfExists(item.url);
  db.query("DELETE FROM item_tags WHERE item_id = ?").run(id);
  db.query("DELETE FROM highlights WHERE item_id = ? AND user_id = ?").run(
    id,
    currentUser.id,
  );
  db.query("DELETE FROM items WHERE id = ? AND user_id = ?").run(
    id,
    currentUser.id,
  );
  return true;
}

function getOwnedHighlight(id: string | number | bigint, userId: number) {
  return (db
    .query("SELECT * FROM highlights WHERE id = ? AND user_id = ?")
    .get(id, userId) as HighlightRow | undefined) || null;
}

function getItemTags(
  itemId: string | number | bigint,
  userId: number,
): string[] {
  return db
    .query(
      `
        SELECT t.name
        FROM tags t
        JOIN item_tags it ON t.id = it.tag_id
        WHERE it.item_id = ? AND t.user_id = ?
        ORDER BY t.name
      `,
    )
    .all(itemId, userId)
    .map((tag) => (tag as TagRow).name);
}

function normalizeTagNames(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tagName of tags) {
    const trimmed = String(tagName || "")
      .trim()
      .toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function attachTagsToItem(
  itemId: string | number | bigint,
  userId: number,
  tags: unknown,
) {
  const normalizedTags = normalizeTagNames(tags);
  if (normalizedTags.length === 0) return;

  const insertTag = db.query(
    "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)",
  );
  const getTag = db.query("SELECT id FROM tags WHERE user_id = ? AND name = ?");
  const insertItemTag = db.query(
    "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
  );

  for (const tagName of normalizedTags) {
    insertTag.run(userId, tagName);
    const tag = getTag.get(userId, tagName) as { id: number } | undefined;
    if (tag?.id) {
      insertItemTag.run(itemId, tag.id);
    }
  }
}

function detectType(url: string, contentType?: string): string {
  const urlLower = url.toLowerCase();

  if (
    urlLower.includes("youtube.com") ||
    urlLower.includes("youtu.be") ||
    urlLower.includes("vimeo.com") ||
    urlLower.includes("twitch.tv") ||
    urlLower.includes("dailymotion.com")
  ) {
    return "video";
  }

  if (
    urlLower.includes("podcasts.apple.com") ||
    urlLower.includes("open.spotify.com/episode") ||
    urlLower.includes("open.spotify.com/show") ||
    urlLower.includes("overcast.fm") ||
    urlLower.includes("pocketcasts.com") ||
    urlLower.includes("castro.fm") ||
    urlLower.includes("anchor.fm")
  ) {
    return "podcast";
  }

  if (urlLower.endsWith(".pdf")) {
    return "pdf";
  }

  if (urlLower.endsWith(".epub")) {
    return "ebook";
  }

  if (contentType) {
    if (contentType.includes("application/pdf")) return "pdf";
    if (contentType.includes("application/epub+zip")) return "ebook";
    if (contentType.includes("video/")) return "video";
    if (contentType.includes("audio/")) return "podcast";
  }

  return "article";
}

function parseTitle(html: string): string | null {
  const ogMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogMatch) return decodeHtmlEntities(ogMatch[1].trim());

  const ogMatchAlt = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
  );
  if (ogMatchAlt) return decodeHtmlEntities(ogMatchAlt[1].trim());

  const twitterMatch = html.match(
    /<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (twitterMatch) return decodeHtmlEntities(twitterMatch[1].trim());

  const twitterMatchAlt = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:title["']/i,
  );
  if (twitterMatchAlt) return decodeHtmlEntities(twitterMatchAlt[1].trim());

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) return decodeHtmlEntities(titleMatch[1].trim());

  return null;
}

function parseAuthor(html: string): string | null {
  const patterns = [
    /<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']author["']/i,
    /<meta[^>]*property=["']article:author["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:author["']/i,
    /<meta[^>]*name=["']twitter:creator["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:creator["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const author = decodeHtmlEntities(match[1].trim()).replace(/^@/, "");
      if (author) return author;
    }
  }

  return null;
}

function normalizePreviewImageUrl(sourceUrl: string, value: string | null): string | null {
  const trimmed = decodeHtmlEntities(String(value || "").trim());
  if (!trimmed) return null;
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("javascript:")
  ) {
    return null;
  }

  try {
    return absoluteAttributeUrl(new URL(sourceUrl), trimmed);
  } catch {
    return null;
  }
}

function getPreviewImageCandidateValue(
  document: Document,
  selector: string,
): string | null {
  const node = document.querySelector(selector);
  if (!node) return null;

  if (node.tagName === "META") return node.getAttribute("content");
  if (node.tagName === "LINK") return node.getAttribute("href");
  return node.getAttribute("src");
}

function parsePreviewImage(html: string, sourceUrl: string): string | null {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url: sourceUrl, virtualConsole });
  const { document } = dom.window;

  const prioritizedSelectors = [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
  ];

  for (const selector of prioritizedSelectors) {
    const normalized = normalizePreviewImageUrl(
      sourceUrl,
      getPreviewImageCandidateValue(document, selector),
    );
    if (normalized) return normalized;
  }

  const imageNodes = document.querySelectorAll("article img[src], main img[src], img[src]");
  const candidates = Array.from(imageNodes, (node) => node as Element).slice(0, 8);
  for (const node of candidates) {
    const rawSrc = node.getAttribute("src");
    const normalized = normalizePreviewImageUrl(sourceUrl, rawSrc);
    if (!normalized) continue;
    if (/\b(icon|logo|avatar)\b/i.test(normalized)) continue;
    return normalized;
  }

  return null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

    if (char === "\n") {
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (char === "\r") continue;

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function getHeaderIndex(headers: string[], names: string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

function parseReadwiseTags(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let tags: string[] = [];

  if (trimmed.startsWith("[")) {
    const matches = trimmed.match(/'([^']+)'/g);
    if (matches && matches.length > 0) {
      tags = matches.map((value) => value.slice(1, -1));
    } else {
      const inner = trimmed.replace(/^\[|\]$/g, "");
      tags = inner.split(",").map((tag) => tag.trim());
    }
  } else {
    tags = trimmed.split(",").map((tag) => tag.trim());
  }

  const cleaned = tags
    .map((tag) =>
      tag
        .replace(/^['"]|['"]$/g, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  return [...new Set(cleaned)];
}

function normalizeReadwiseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().replace("T", " ").replace("Z", "");
}

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function absoluteAttributeUrl(baseUrl: URL, value: string): string {
  if (!value || value.startsWith("#")) return value;
  if (
    value.startsWith("data:") ||
    value.startsWith("javascript:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:")
  ) {
    return value;
  }

  if (URL.canParse(value)) {
    return value;
  }

  if (URL.canParse(value, baseUrl)) {
    return new URL(value, baseUrl).toString();
  }

  return value;
}

function absolutizeDocumentUrls(document: Document, baseUrl: URL) {
  for (const attribute of ["src", "href", "poster"]) {
    const nodes = document.querySelectorAll<HTMLElement>(`[${attribute}]`);
    for (const node of Array.from(nodes)) {
      const value = node.getAttribute(attribute);
      if (!value) continue;
      node.setAttribute(attribute, absoluteAttributeUrl(baseUrl, value));
    }
  }
}

function serializeDocumentHtml(html: string, sourceUrl: string) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url: sourceUrl, virtualConsole });
  const { document } = dom.window;
  const baseUrl = new URL(sourceUrl);

  absolutizeDocumentUrls(document, baseUrl);

  if (!document.querySelector("base")) {
    const base = document.createElement("base");
    base.href = baseUrl.toString();
    document.head?.prepend(base);
  }

  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
}

function extractArticleContent(html: string, sourceUrl: string) {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(html, { url: sourceUrl, virtualConsole });
  const { document } = dom.window;
  const baseUrl = new URL(sourceUrl);

  absolutizeDocumentUrls(document, baseUrl);

  const article = new Readability(document).parse();
  if (article?.content) {
    return {
      title: article.title || parseTitle(html) || fallbackTitle(sourceUrl),
      byline: article.byline || parseAuthor(html) || "",
      excerpt: article.excerpt || "",
      content: article.content,
    };
  }

  const bodyContent = document.body?.innerHTML?.trim();
  return {
    title: parseTitle(html) || fallbackTitle(sourceUrl),
    byline: parseAuthor(html) || "",
    excerpt: "",
    content: bodyContent || "",
  };
}

function getFileExtension(name: string): string {
  return extname(name || "")
    .toLowerCase()
    .replace(".", "");
}

function normalizeFilenameBase(name: string): string {
  return basename(name, extname(name))
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTitleAuthorFromFilename(name: string): {
  title: string;
  author: string;
} {
  const base = normalizeFilenameBase(name);
  const parts = base
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      author: parts[0],
      title: parts.slice(1).join(" - "),
    };
  }

  return { title: base, author: "" };
}

function sanitizeFilenamePart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function createStoredFilename(originalName: string, extension: string): string {
  const parsed = parseTitleAuthorFromFilename(originalName);
  const base = sanitizeFilenamePart(parsed.title || "file") || "file";
  return `${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
}

function detectUploadedFileType(extension: string): string {
  return extension === "pdf" ? "pdf" : "ebook";
}

function parseUploadTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((tag) =>
          String(tag || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
    }
  } catch {
    return raw
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
}

function getUploadFilename(url: string): string | null {
  if (!url.startsWith("/uploads/")) return null;
  const filename = url.slice("/uploads/".length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;
  return filename;
}

function resolveUploadPath(filename: string): string | null {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;

  const filePath = resolve(uploadsRoot, filename);
  const relativePath = filePath.slice(uploadsRoot.length);
  if (
    filePath !== uploadsRoot &&
    !(relativePath.startsWith("/") || relativePath.startsWith("\\"))
  ) {
    return null;
  }

  return filePath;
}

function removeUploadedFileIfExists(url: string) {
  const filename = getUploadFilename(url);
  if (!filename) return;

  const filePath = resolveUploadPath(filename);
  if (!filePath) return;
  if (!existsSync(filePath)) return;

  try {
    unlinkSync(filePath);
  } catch {}
}

function getOwnedUploadFile(
  filename: string,
  userId: number,
): { path: string; type: string } | null {
  const filePath = resolveUploadPath(filename);
  if (!filePath) return null;

  const item = db
    .query("SELECT type FROM items WHERE user_id = ? AND url = ? LIMIT 1")
    .get(userId, `/uploads/${filename}`) as { type: string } | undefined;

  if (!item || !existsSync(filePath)) return null;

  return { path: filePath, type: item.type };
}

function getUploadContentType(type: string, filename: string): string {
  if (type === "pdf" || filename.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }

  if (type === "ebook" || filename.toLowerCase().endsWith(".epub")) {
    return "application/epub+zip";
  }

  return "application/octet-stream";
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  const version = isIP(normalized);

  if (version === 4) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (version === 6) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

async function getSafeRemoteUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return null;
  }

  if (isPrivateIpAddress(hostname)) {
    return null;
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (
      records.length === 0 ||
      records.some((record) => isPrivateIpAddress(record.address))
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return parsed.toString();
}

app.get("/api/fetch-meta", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "URL is required" }, 400);

  const safeUrl = await getSafeRemoteUrl(url);
  if (!safeUrl) {
    return c.json({ error: "URL is not allowed" }, 400);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ReadingListBot/1.0)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") || "";
    const type = detectType(safeUrl, contentType);
    let title: string | null = null;
    let author: string | null = null;
    let image: string | null = null;

    if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml")
    ) {
      const html = await response.text();
      title = parseTitle(html);
      author = parseAuthor(html);
      image = parsePreviewImage(html, safeUrl);
    }

    if (!title) {
      try {
        title = new URL(safeUrl).hostname.replace("www.", "");
      } catch {
        title = safeUrl;
      }
    }

    return c.json({ title, type, author, image });
  } catch {
    let fallbackTitle = safeUrl;
    try {
      fallbackTitle = new URL(safeUrl).hostname.replace("www.", "");
    } catch {
      fallbackTitle = safeUrl;
    }
    return c.json({
      title: fallbackTitle,
      type: detectType(safeUrl),
      author: null,
      image: null,
    });
  }
});

app.get("/api/proxy", async (c) => {
  const url = c.req.query("url");
  const mode = c.req.query("mode");
  if (!url) return c.json({ error: "URL is required" }, 400);

  const safeUrl = await getSafeRemoteUrl(url);
  if (!safeUrl) {
    return c.json({ error: "URL is not allowed" }, 400);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return c.json({ error: "Failed to fetch content" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";

    // For PDFs, return the URL to be loaded directly in iframe
    if (contentType.includes("application/pdf")) {
      return c.json({ type: "pdf", url: safeUrl });
    }

    if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml")
    ) {
      const html = await response.text();

      if (mode === "parsed") {
        const article = extractArticleContent(html, safeUrl);
        return c.json({
          type: "html",
          url: safeUrl,
          title: article.title,
          byline: article.byline,
          excerpt: article.excerpt,
          content: article.content,
        });
      }

      return c.json({
        type: "html",
        url: safeUrl,
        title: parseTitle(html) || fallbackTitle(safeUrl),
        content: serializeDocumentHtml(html, safeUrl),
      });
    }

    // For other content types, return info
    return c.json({ type: "unsupported", contentType, url: safeUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: "Failed to fetch content", message },
      500,
    );
  }
});

app.get("/api/proxy/pdf", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "URL is required" }, 400);

  const safeUrl = await getSafeRemoteUrl(url);
  if (!safeUrl) {
    return c.json({ error: "URL is not allowed" }, 400);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/pdf,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return c.json({ error: "Failed to fetch PDF" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("application/pdf") &&
      !safeUrl.toLowerCase().includes(".pdf")
    ) {
      return c.json({ error: "URL did not return a PDF document" }, 400);
    }

    const bytes = await response.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return c.json({ error: "Failed to fetch PDF" }, 500);
  }
});

app.get("/api/proxy/epub", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "URL is required" }, 400);

  const safeUrl = await getSafeRemoteUrl(url);
  if (!safeUrl) {
    return c.json({ error: "URL is not allowed" }, 400);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/epub+zip,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return c.json({ error: "Failed to fetch EPUB" }, 502);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("application/epub+zip") &&
      !safeUrl.toLowerCase().includes(".epub")
    ) {
      return c.json({ error: "URL did not return an EPUB document" }, 400);
    }

    const bytes = await response.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return c.json({ error: "Failed to fetch EPUB" }, 500);
  }
});

app.get("/api/uploads/:filename", async (c) => {
  const currentUser = getCurrentUser(c);
  const filename = c.req.param("filename");
  const upload = getOwnedUploadFile(filename, currentUser.id);

  if (!upload) {
    return c.json({ error: "File not found" }, 404);
  }

  return new Response(Bun.file(upload.path), {
    headers: {
      "Content-Type": getUploadContentType(upload.type, filename),
      "Cache-Control": "no-store",
    },
  });
});

app.post("/api/import/readwise", async (c) => {
  try {
    const currentUser = getCurrentUser(c);
    const contentType = c.req.header("content-type") || "";
    let csv = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (file && typeof file !== "string") {
        csv = await file.text();
      }
    } else if (
      contentType.includes("text/csv") ||
      contentType.includes("text/plain")
    ) {
      csv = await c.req.text();
    } else {
      const body = await c.req.json().catch(() => null);
      if (body?.csv) csv = body.csv;
    }

    if (!csv || !csv.trim()) {
      return c.json({ error: "CSV file is required" }, 400);
    }

    const rows = parseCsv(csv);
    if (rows.length === 0) {
      return c.json({ error: "CSV is empty" }, 400);
    }

    const headerRow = rows.shift() || [];
    const headers = headerRow.map(normalizeHeader);

    const urlIndex = getHeaderIndex(headers, ["url"]);
    if (urlIndex === -1) {
      return c.json({ error: "CSV missing URL column" }, 400);
    }

    const titleIndex = getHeaderIndex(headers, ["title"]);
    const authorIndex = getHeaderIndex(headers, ["author", "authors", "creator"]);
    const tagsIndex = getHeaderIndex(headers, [
      "document tags",
      "document_tags",
      "documenttags",
      "tags",
    ]);
    const savedIndex = getHeaderIndex(headers, [
      "saved date",
      "saved_date",
      "saved at",
      "saved_at",
      "saved",
    ]);

    let imported = 0;
    let duplicate = 0;
    let skipped = 0;
    let errors = 0;

    const seen = new Set<string>();
    const insertItem = db.query(
      "INSERT INTO items (user_id, url, title, author, type, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))",
    );
    const existingItem = db.query(
      "SELECT id FROM items WHERE user_id = ? AND url = ?",
    );
    const insertTag = db.query(
      "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)",
    );
    const getTag = db.query("SELECT id FROM tags WHERE user_id = ? AND name = ?");
    const insertItemTag = db.query(
      "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
    );

    const importTx = db.transaction((dataRows: string[][]) => {
      for (const row of dataRows) {
        try {
          const url = row[urlIndex]?.trim();
          if (!url) {
            skipped++;
            continue;
          }

          if (seen.has(url)) {
            duplicate++;
            continue;
          }

          const existing = existingItem.get(currentUser.id, url) as
            | { id: number }
            | undefined;
          if (existing?.id) {
            duplicate++;
            continue;
          }

          seen.add(url);

          const title =
            (titleIndex !== -1 ? row[titleIndex] : "")?.trim() ||
            fallbackTitle(url);
          const author =
            (authorIndex !== -1 ? row[authorIndex] : "")?.trim() || "";
          const tagsRaw = tagsIndex !== -1 ? row[tagsIndex] : "";
          const tags = parseReadwiseTags(tagsRaw);
          const savedRaw = savedIndex !== -1 ? row[savedIndex] : "";
          const createdAt = normalizeReadwiseDate(savedRaw);
          const type = detectType(url);

          const result = insertItem.run(
            currentUser.id,
            url,
            title || "",
            author,
            type || "article",
            createdAt,
          );
          const itemId = result.lastInsertRowid;

          if (tags.length > 0) {
            for (const tagName of tags) {
              insertTag.run(currentUser.id, tagName);
              const tag = getTag.get(currentUser.id, tagName) as
                | { id: number }
                | undefined;
              if (tag?.id) {
                insertItemTag.run(itemId, tag.id);
              }
            }
          }

          imported++;
        } catch {
          errors++;
        }
      }
    });

    importTx(rows);

    return c.json({ success: true, imported, duplicate, skipped, errors });
  } catch (error) {
    console.error("Readwise CSV import failed:", error);
    return c.json(
      {
        error:
          "Import failed on the server. If this keeps happening, check host logs (disk space, DB permissions, or request timeouts).",
      },
      500,
    );
  }
});

app.post("/api/import/file", async (c) => {
  const currentUser = getCurrentUser(c);
  const contentType = c.req.header("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Multipart form upload required" }, 400);
  }

  const form = await c.req.formData();
  const tags = parseUploadTags((form.get("tags") as string) || null);
  const titleOverride = ((form.get("title") as string) || "").trim();
  const authorOverride = ((form.get("author") as string) || "").trim();

  const fileEntries = form.getAll("files");
  const fallbackSingle = form.get("file");
  const files =
    fileEntries.length > 0
      ? fileEntries
      : fallbackSingle
        ? [fallbackSingle]
        : [];
  const validFiles = files.filter(
    (entry): entry is File => typeof entry !== "string" && !!entry?.name,
  );

  if (validFiles.length === 0) {
    return c.json({ error: "No files provided" }, 400);
  }

  const insertItem = db.query(
    "INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)",
  );
  const insertTag = db.query(
    "INSERT OR IGNORE INTO tags (user_id, name) VALUES (?, ?)",
  );
  const getTag = db.query("SELECT id FROM tags WHERE user_id = ? AND name = ?");
  const insertItemTag = db.query(
    "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
  );

  let imported = 0;
  let skipped = 0;
  const failedFiles: Array<{ name: string; reason: string }> = [];

  for (const file of validFiles) {
    let storedUrl = "";
    try {
      const extension = getFileExtension(file.name);
      if (!allowedUploadExtensions.has(extension)) {
        skipped++;
        failedFiles.push({
          name: file.name,
          reason: `Unsupported file type: .${extension || "unknown"}`,
        });
        continue;
      }

      const parsed = parseTitleAuthorFromFilename(file.name);
      const title =
        validFiles.length === 1 && titleOverride
          ? titleOverride
          : parsed.title || file.name;
      const author =
        validFiles.length === 1 && authorOverride
          ? authorOverride
          : parsed.author || "";
      const storedFilename = createStoredFilename(file.name, extension);
      storedUrl = `/uploads/${storedFilename}`;
      const storedPath = resolveUploadPath(storedFilename);
      if (!storedPath) {
        throw new Error("Generated upload path is invalid.");
      }
      const fileBuffer = new Uint8Array(await file.arrayBuffer());
      await Bun.write(storedPath, fileBuffer);

      const type = detectUploadedFileType(extension);
      const result = insertItem.run(
        currentUser.id,
        storedUrl,
        title,
        author,
        type,
      );
      const itemId = result.lastInsertRowid;

      for (const tagName of tags) {
        insertTag.run(currentUser.id, tagName);
        const tag = getTag.get(currentUser.id, tagName) as
          | { id: number }
          | undefined;
        if (tag?.id) {
          insertItemTag.run(itemId, tag.id);
        }
      }

      imported++;
    } catch (error: unknown) {
      if (storedUrl) removeUploadedFileIfExists(storedUrl);
      skipped++;
      failedFiles.push({
        name: file.name,
        reason:
          error instanceof Error ? error.message : "Failed to process file.",
      });
    }
  }

  if (imported === 0) {
    return c.json(
      {
        error: "No supported files uploaded",
        skipped,
        failed_files: failedFiles,
      },
      400,
    );
  }

  return c.json({
    success: true,
    imported,
    skipped,
    failed_files: failedFiles,
  });
});

app.get("/api/items", (c) => {
  const currentUser = getCurrentUser(c);
  const tagsParam = c.req.query("tags");
  const excludeTagsParam = c.req.query("exclude_tags");
  const typesParam = c.req.query("types");

  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const excludeTags = excludeTagsParam ? excludeTagsParam.split(",").filter(Boolean) : [];
  const types = typesParam ? typesParam.split(",").filter(Boolean) : [];

  let query = "SELECT * FROM items WHERE user_id = ?";
  const conditions: string[] = [];
  const params: Array<string | number> = [currentUser.id];

  if (tags.length > 0) {
    const placeholders = tags.map(() => "?").join(",");
    conditions.push(
      `id IN (
        SELECT it.item_id FROM item_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE t.user_id = ? AND t.name IN (${placeholders})
      )`,
    );
    params.push(currentUser.id);
    params.push(...tags);
  }

  if (excludeTags.length > 0) {
    const placeholders = excludeTags.map(() => "?").join(",");
    conditions.push(
      `id NOT IN (
        SELECT it.item_id FROM item_tags it
        JOIN tags t ON it.tag_id = t.id
        WHERE t.user_id = ? AND t.name IN (${placeholders})
      )`,
    );
    params.push(currentUser.id);
    params.push(...excludeTags);
  }

  if (types.length > 0) {
    const placeholders = types.map(() => "?").join(",");
    conditions.push(`type IN (${placeholders})`);
    params.push(...types);
  }

  if (conditions.length > 0) {
    query += ` AND ${conditions.join(" AND ")}`;
  }

  query += " ORDER BY created_at DESC";

  const items = db.query(query).all(...params);

  const itemsWithTags = items.map((item) => {
    const typedItem = item as ItemRow;
    const tags = getItemTags(typedItem.id, currentUser.id);
    const highlightCount = db
      .query(
        "SELECT COUNT(*) as count FROM highlights WHERE item_id = ? AND user_id = ?",
      )
      .get(typedItem.id, currentUser.id) as { count: number };
    return {
      ...typedItem,
      tags,
      highlight_count: highlightCount?.count || 0,
    };
  });

  return c.json(itemsWithTags);
});

app.get("/api/items/facets", (c) => {
  const currentUser = getCurrentUser(c);
  const rows = db
    .query("SELECT url, author FROM items WHERE user_id = ?")
    .all(currentUser.id) as { url: string; author: string }[];

  const authors = new Set<string>();
  const domains = new Set<string>();
  for (const row of rows) {
    const a = (row.author || "").trim();
    if (a) authors.add(a);
    try {
      const host = new URL(row.url).hostname.replace(/^www\./i, "").toLowerCase();
      if (host) domains.add(host);
    } catch {
      /* ignore */
    }
  }

  return c.json({
    authors: [...authors].sort((x, y) => x.localeCompare(y)),
    domains: [...domains].sort((x, y) => x.localeCompare(y)),
  });
});

app.get("/api/tags", (c) => {
  const currentUser = getCurrentUser(c);
  const tags = db
    .query(
      `
        SELECT tags.name, COUNT(items.id) as count
        FROM tags
        LEFT JOIN item_tags ON tags.id = item_tags.tag_id
        LEFT JOIN items ON item_tags.item_id = items.id AND items.user_id = tags.user_id
        WHERE tags.user_id = ?
        GROUP BY tags.id
        HAVING count > 0
        ORDER BY tags.name
      `,
    )
    .all(currentUser.id);
  return c.json(tags);
});

app.get("/api/preferences/saved-views", (c) => {
  const currentUser = getCurrentUser(c);
  return c.json(getUserSavedViews(currentUser.id));
});

app.put("/api/preferences/saved-views", async (c) => {
  const currentUser = getCurrentUser(c);
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    savedViews: setUserSavedViews(currentUser.id, body?.savedViews),
  });
});

app.post("/api/items", async (c) => {
  const currentUser = getCurrentUser(c);
  const { url, title, author, type, tags } = await c.req.json();

  if (!url) return c.json({ error: "URL is required" }, 400);

  const result = db
    .query(
      `INSERT INTO items (user_id, url, title, author, type) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(currentUser.id, url, title || "", author || "", type || "article");

  const itemId = result.lastInsertRowid;
  attachTagsToItem(itemId, currentUser.id, tags);

  return c.json({ id: itemId, success: true }, 201);
});

app.get("/api/items/:id", (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const item = getOwnedItem(id, currentUser.id);

  if (!item) return c.json({ error: "Item not found" }, 404);

  return c.json({ ...item, tags: getItemTags(id, currentUser.id) });
});

app.patch("/api/items/:id", async (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const item = getOwnedItem(id, currentUser.id);

  if (!item) return c.json({ error: "Item not found" }, 404);

  if (body.is_read !== undefined) {
    db.query("UPDATE items SET is_read = ? WHERE id = ? AND user_id = ?").run(
      body.is_read ? 1 : 0,
      id,
      currentUser.id,
    );
  }

  if (body.title !== undefined) {
    db.query("UPDATE items SET title = ? WHERE id = ? AND user_id = ?").run(
      body.title,
      id,
      currentUser.id,
    );
  }

  if (body.author !== undefined) {
    db.query("UPDATE items SET author = ? WHERE id = ? AND user_id = ?").run(
      body.author,
      id,
      currentUser.id,
    );
  }

  if (body.notes !== undefined) {
    db.query("UPDATE items SET notes = ? WHERE id = ? AND user_id = ?").run(
      body.notes,
      id,
      currentUser.id,
    );
  }

  return c.json({ success: true });
});

app.patch("/api/items/:id/progress", async (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const progress = body?.progress;
  const item = getOwnedItem(id, currentUser.id);

  if (!item) return c.json({ error: "Item not found" }, 404);

  let serialized = "";
  if (progress && typeof progress === "object") {
    try {
      serialized = JSON.stringify(progress);
    } catch {
      serialized = "";
    }
  }

  db.query(
    "UPDATE items SET reading_progress = ? WHERE id = ? AND user_id = ?",
  ).run(
    serialized,
    id,
    currentUser.id,
  );

  return c.json({ success: true });
});

app.put("/api/items/:id", async (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const { url, title, author, type, tags, notes } = await c.req.json();
  const existingItem = getOwnedItem(id, currentUser.id) as
    | { url: string; author: string }
    | null;

  if (!existingItem) return c.json({ error: "Item not found" }, 404);

  if (existingItem?.url && existingItem.url !== url) {
    removeUploadedFileIfExists(existingItem.url);
  }

  const nextAuthor =
    author !== undefined ? String(author || "") : existingItem?.author || "";

  db.query(
    "UPDATE items SET url = ?, title = ?, author = ?, type = ?, notes = ? WHERE id = ? AND user_id = ?",
  ).run(
    url,
    title || "",
    nextAuthor,
    type || "article",
    notes || "",
    id,
    currentUser.id,
  );

  db.query("DELETE FROM item_tags WHERE item_id = ?").run(id);
  attachTagsToItem(id, currentUser.id, tags);

  return c.json({ success: true });
});

app.post("/api/items/delete-by", async (c) => {
  const currentUser = getCurrentUser(c);
  const body = await c.req.json().catch(() => null);
  const by = typeof body?.by === "string" ? body.by.trim().toLowerCase() : "";
  const values = Array.isArray(body?.values)
    ? body.values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : typeof body?.value === "string"
      ? [body.value.trim()].filter(Boolean)
      : [];
  if (values.length === 0) return c.json({ error: "At least one value is required" }, 400);

  let ids: number[] = [];

  if (by === "tag") {
    const placeholders = values.map(() => "?").join(",");
    const rows = db
      .query(
        `
          SELECT DISTINCT i.id AS id FROM items i
          INNER JOIN item_tags it ON it.item_id = i.id
          INNER JOIN tags t ON t.id = it.tag_id AND t.user_id = i.user_id
          WHERE i.user_id = ? AND t.name IN (${placeholders})
        `,
      )
      .all(currentUser.id, ...values) as { id: number }[];
    ids = rows.map((r) => r.id);
  } else if (by === "author") {
    const normalizedValues = values.map((value) => value.toLowerCase());
    const placeholders = normalizedValues.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT id FROM items WHERE user_id = ? AND lower(trim(author)) IN (${placeholders})`,
      )
      .all(currentUser.id, ...normalizedValues) as { id: number }[];
    ids = rows.map((r) => r.id);
  } else if (by === "type") {
    const placeholders = values.map(() => "?").join(",");
    const rows = db
      .query(`SELECT id FROM items WHERE user_id = ? AND type IN (${placeholders})`)
      .all(currentUser.id, ...values) as { id: number }[];
    ids = rows.map((r) => r.id);
  } else if (by === "domain") {
    const needles = new Set(
      values.map((value) => value.replace(/^www\./i, "").toLowerCase()),
    );
    const rows = db
      .query("SELECT id, url FROM items WHERE user_id = ?")
      .all(currentUser.id) as { id: number; url: string }[];
    ids = rows
      .filter((r) => {
        try {
          const host = new URL(r.url).hostname.replace(/^www\./i, "").toLowerCase();
          for (const needle of needles) {
            if (host === needle || host.endsWith(`.${needle}`)) return true;
          }
          return false;
        } catch {
          return false;
        }
      })
      .map((r) => r.id);
  } else {
    return c.json({ error: "by must be tag, author, domain, or type" }, 400);
  }

  const deleteTx = db.transaction((itemIds: number[]) => {
    let deleted = 0;
    for (const id of itemIds) {
      if (deleteOwnedItem(currentUser, id)) deleted++;
    }
    return deleted;
  });

  const deleted = deleteTx(ids);
  return c.json({ success: true, deleted });
});

app.delete("/api/items/:id", (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return c.json({ error: "Item not found" }, 404);
  }
  if (!deleteOwnedItem(currentUser, numericId)) {
    return c.json({ error: "Item not found" }, 404);
  }
  return c.json({ success: true });
});

// Highlights API
app.get("/api/highlights", (c) => {
  const currentUser = getCurrentUser(c);
  const highlights = db
    .query(
      `SELECT h.*, i.title as item_title, i.url as item_url, i.type as item_type
       FROM highlights h
       JOIN items i ON h.item_id = i.id
       WHERE h.user_id = ? AND i.user_id = ?
       ORDER BY h.created_at DESC`,
    )
    .all(currentUser.id, currentUser.id);
  return c.json(highlights);
});

app.get("/api/items/:id/highlights", (c) => {
  const currentUser = getCurrentUser(c);
  const itemId = c.req.param("id");
  const item = getOwnedItem(itemId, currentUser.id);

  if (!item) return c.json({ error: "Item not found" }, 404);

  const highlights = db
    .query(
      "SELECT * FROM highlights WHERE item_id = ? AND user_id = ? ORDER BY created_at ASC",
    )
    .all(itemId, currentUser.id);
  return c.json(highlights);
});

app.post("/api/items/:id/highlights", async (c) => {
  const currentUser = getCurrentUser(c);
  const itemId = c.req.param("id");
  const { selected_text, note } = await c.req.json();

  if (!selected_text) {
    return c.json({ error: "Selected text is required" }, 400);
  }

  const item = getOwnedItem(itemId, currentUser.id);
  if (!item) return c.json({ error: "Item not found" }, 404);

  const result = db
    .query(
      "INSERT INTO highlights (user_id, item_id, selected_text, note) VALUES (?, ?, ?, ?)",
    )
    .run(currentUser.id, itemId, selected_text, note || "");

  const highlight = getOwnedHighlight(result.lastInsertRowid, currentUser.id);

  return c.json(highlight, 201);
});

app.patch("/api/highlights/:id", async (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const { note } = await c.req.json();
  const highlight = getOwnedHighlight(id, currentUser.id);

  if (!highlight) return c.json({ error: "Highlight not found" }, 404);

  db.query("UPDATE highlights SET note = ? WHERE id = ? AND user_id = ?").run(
    note || "",
    id,
    currentUser.id,
  );

  return c.json(getOwnedHighlight(id, currentUser.id));
});

app.delete("/api/highlights/:id", (c) => {
  const currentUser = getCurrentUser(c);
  const id = c.req.param("id");
  const highlight = getOwnedHighlight(id, currentUser.id);

  if (!highlight) return c.json({ error: "Highlight not found" }, 404);

  db.query("DELETE FROM highlights WHERE id = ? AND user_id = ?").run(
    id,
    currentUser.id,
  );
  return c.json({ success: true });
});

const port = Bun.env.PORT || 3000;
console.log(`Reading List running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
