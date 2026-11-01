import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { db } from "../db";
import {
	extractArticleContent,
	withRemoteResponse,
	readResponseText,
	parsePreviewImage,
	detectType,
	fetchRemoteMetadata,
} from "./content-utils";
import { getOwnedItem } from "./item-store";
export type Snapshot = {
	item_id: number;
	url: string;
	title: string;
	byline: string;
	excerpt: string;
	content: string;
	saved_at: string;
};
const inFlight = new Map<string, Promise<Snapshot | null>>();
function parseCleanArticle(content: string, sourceUrl: string) {
	const window = new JSDOM("").window;
	const purifier = createDOMPurify(window);
	const body = purifier.sanitize(content, {
		RETURN_DOM: true,
		USE_PROFILES: { html: true },
		FORBID_TAGS: [
			"script",
			"style",
			"iframe",
			"form",
			"input",
			"button",
			"link",
			"meta",
			"base",
			"object",
			"embed",
			"audio",
			"video",
		],
		FORBID_ATTR: ["style", "srcset"],
	}) as HTMLElement;
	for (const img of body.querySelectorAll("img")) {
		try {
			const url = new URL(img.getAttribute("src") || "", sourceUrl);
			if (!["http:", "https:"].includes(url.protocol)) {
				img.remove();
				continue;
			}
			img.src = `/api/image?url=${encodeURIComponent(url.href)}`;
			img.loading = "lazy";
		} catch {
			img.remove();
		}
	}
	for (const a of body.querySelectorAll("a")) {
		try {
			const url = new URL(a.getAttribute("href") || "", sourceUrl);
			if (!["http:", "https:", "mailto:"].includes(url.protocol))
				a.removeAttribute("href");
			else a.href = url.href;
		} catch {
			a.removeAttribute("href");
		}
		a.target = "_blank";
		a.rel = "noopener noreferrer";
	}
	const result = { content: body.innerHTML, text: body.textContent || "" };
	window.close();
	return result;
}
export function cleanArticle(content: string, sourceUrl: string) {
	return parseCleanArticle(content, sourceUrl).content;
}
export async function saveArticle(
	userId: number,
	itemId: number,
): Promise<Snapshot | null> {
	const item = getOwnedItem(itemId, userId);
	if (!item || item.type !== "article") return null;
	const existing = db
		.query("SELECT * FROM article_snapshots WHERE item_id=? AND url=?")
		.get(itemId, item.url) as Snapshot | null;
	if (existing) return existing;
	const key = `${userId}:${itemId}:${item.url}`;
	const active = inFlight.get(key);
	if (active) return active;
	const pending = (async () => {
		try {
			const result = await withRemoteResponse(
				item.url,
				{
					timeoutMs: 15000,
					headers: {
						"User-Agent": "ReadingList/1.0",
						Accept: "text/html,application/xhtml+xml",
					},
				},
				async (response, finalUrl) => {
					if (
						!response.ok ||
						!/text\/html|application\/xhtml/.test(
							response.headers.get("content-type") || "",
						)
					)
						return null;
					const html = await readResponseText(response);
					const article = extractArticleContent(html, finalUrl);
					const { content, text } = parseCleanArticle(
						article.content,
						finalUrl,
					);
					if (!text.trim()) return null;
					if (getOwnedItem(itemId, userId)?.url !== item.url) return null;
					db.transaction(() => {
						db.query(
							"INSERT OR REPLACE INTO article_snapshots (item_id,url,title,byline,excerpt,content) VALUES (?,?,?,?,?,?)",
						).run(
							itemId,
							item.url,
							article.title || item.title,
							article.byline || "",
							article.excerpt || "",
							content,
						);
						db.query(
							"UPDATE items SET title=CASE WHEN title='' OR title=url THEN ? ELSE title END, author=CASE WHEN author='' THEN ? ELSE author END, preview_image=CASE WHEN preview_image='' THEN ? ELSE preview_image END, reading_time_minutes=COALESCE(reading_time_minutes,?) WHERE id=? AND user_id=? AND url=?",
						).run(
							article.title || item.url,
							article.byline || "",
							parsePreviewImage(html, finalUrl) || "",
							Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200)),
							itemId,
							userId,
							item.url,
						);
					})();
					return db
						.query("SELECT * FROM article_snapshots WHERE item_id=?")
						.get(itemId) as Snapshot;
				},
			);
			return result;
		} catch {
			return null;
		}
	})();
	inFlight.set(key, pending);
	try {
		return await pending;
	} finally {
		inFlight.delete(key);
	}
}
export function canonicalItemUrl(value: unknown) {
	if (typeof value !== "string" || value.length > 8192) return null;
	try {
		const url = new URL(value.trim());
		if (
			!["https:", "http:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return null;
		url.hash = "";
		for (const key of [...url.searchParams.keys()])
			if (
				/^utm_/i.test(key) ||
				["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key)
			)
				url.searchParams.delete(key);
		return url.href;
	} catch {
		return null;
	}
}
// Older items may carry tracking params or a #fragment. Every variant of a URL
// starts with its origin + path, so an indexed range scan finds them cheaply.
export function findDuplicateItem(userId: number, canonicalUrl: string) {
	const { origin, pathname } = new URL(canonicalUrl);
	const prefix = origin + pathname;
	return (
		db
			.query(
				"SELECT id,url FROM items WHERE user_id=? AND url>=? AND url<? ORDER BY id",
			)
			.all(userId, prefix, `${prefix}\uffff`) as { id: number; url: string }[]
	).find((item) => canonicalItemUrl(item.url) === canonicalUrl);
}
export function savedType(url: string, type: unknown) {
	return typeof type === "string" &&
		["article", "pdf", "ebook", "video", "podcast"].includes(type)
		? type
		: detectType(url);
}

export async function enrichSavedItem(userId: number, itemId: number) {
	const item = getOwnedItem(itemId, userId);
	if (!item) return;
	if (item.type === "article") {
		await saveArticle(userId, itemId);
		return;
	}
	const meta = await fetchRemoteMetadata(item.url);
	if (!meta) return;
	db.query(
		"UPDATE items SET title=CASE WHEN title='' THEN ? ELSE title END,author=CASE WHEN author='' THEN ? ELSE author END,preview_image=CASE WHEN preview_image='' THEN ? ELSE preview_image END WHERE id=? AND user_id=? AND url=?",
	).run(
		meta.title,
		meta.author || "",
		meta.image || "",
		itemId,
		userId,
		item.url,
	);
}
