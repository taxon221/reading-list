import type { Hono } from "hono";
import JSZip from "jszip";
import { db } from "../db";
import { saveArticle } from "./article-store";
import { getCurrentUser } from "./auth";
import { readBoundedBytes, withRemoteResponse } from "./content-utils";
import {
	getOwnedItem,
	getUserSavedViews,
	getOwnedUploadFile,
} from "./item-store";
import type { AppBindings, ItemRow } from "./types";
export function registerLibraryRoutes(app: Hono<AppBindings>) {
	app.get("/api/items/:id/content", async (c) => {
		const user = getCurrentUser(c);
		const item = getOwnedItem(c.req.param("id"), user.id);
		if (!item) return c.json({ error: "Item not found" }, 404);
		const snapshot = await saveArticle(user.id, item.id);
		return snapshot
			? c.json({ type: "html", ...snapshot })
			: c.json(
					{
						error: "Reader unavailable",
						message:
							"We couldn't save a readable copy. You can still open the original page.",
					},
					502,
				);
	});
	app.get("/api/image", async (c) => {
		const user = getCurrentUser(c);
		// Sites without an icon or preview would otherwise be refetched on every
		// visit. Timeouts and server errors may pass, so don't remember those.
		const missing = (transient = false) =>
			c.body(null, 404, {
				"Cache-Control": transient ? "no-store" : "private, max-age=3600",
			});
		const url = c.req.query("url") || "";
		if (url.length > 8192) return c.body(null, 400);
		const cached = db
			.query(
				"SELECT body,content_type FROM media_cache WHERE user_id=? AND url=?",
			)
			.get(user.id, url) as { body: Uint8Array; content_type: string } | null;
		if (cached)
			return new Response(new Uint8Array(cached.body), {
				headers: {
					"Content-Type": cached.content_type,
					"Cache-Control": "private, max-age=86400",
					"X-Content-Type-Options": "nosniff",
				},
			});
		try {
			const result = await withRemoteResponse(
				url,
				{ timeoutMs: 8000 },
				async (response) => {
					const type =
						(response.headers.get("content-type") || "").split(";")[0] || "";
					if (response.status >= 500 || response.status === 429)
						return missing(true);
					if (
						!response.ok ||
						![
							"image/png",
							"image/jpeg",
							"image/webp",
							"image/gif",
							"image/x-icon",
							"image/vnd.microsoft.icon",
							"image/avif",
						].includes(type)
					)
						return missing();
					const body = await readBoundedBytes(response, 2 * 1024 * 1024);
					db.query("INSERT OR REPLACE INTO media_cache VALUES (?,?,?,?,?)").run(
						user.id,
						url,
						type,
						body,
						Date.now(),
					);
					db.query(
						"DELETE FROM media_cache WHERE user_id=? AND url NOT IN (SELECT url FROM media_cache WHERE user_id=? ORDER BY saved_at DESC LIMIT 200)",
					).run(user.id, user.id);
					return new Response(body, {
						headers: {
							"Content-Type": type,
							"Cache-Control": "private, max-age=86400",
							"X-Content-Type-Options": "nosniff",
						},
					});
				},
			);
			return result || missing();
		} catch {
			return missing(true);
		}
	});
	app.get("/api/export", async (c) => {
		const user = getCurrentUser(c);
		const itemTags = new Map<number, string[]>();
		for (const row of db
			.query(
				"SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE t.user_id=? ORDER BY t.name",
			)
			.all(user.id) as { item_id: number; name: string }[]) {
			const names = itemTags.get(row.item_id) ?? [];
			names.push(row.name);
			itemTags.set(row.item_id, names);
		}
		const items = (
			db
				.query("SELECT * FROM items WHERE user_id=? ORDER BY id")
				.all(user.id) as ItemRow[]
		).map((item) => ({ ...item, tags: itemTags.get(item.id) ?? [] }));
		const highlights = db
			.query("SELECT * FROM highlights WHERE user_id=? ORDER BY item_id,id")
			.all(user.id) as {
			item_id: number;
			selected_text: string;
			note: string;
		}[];
		if (c.req.query("format") === "highlights") {
			const quotesByItem = Map.groupBy(highlights, (h) => h.item_id);
			const text = items
				.map((item) => {
					const quotes = quotesByItem.get(item.id) ?? [];
					return quotes.length || item.notes
						? `# ${item.title || item.url}\n\n${item.url}\n\n${item.notes}\n\n${quotes.map((h) => `> ${h.selected_text.replaceAll("\n", "\n> ")}\n\n${h.note}`).join("\n\n")}`
						: "";
				})
				.filter(Boolean)
				.join("\n\n---\n\n");
			return new Response(text, {
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					"Content-Disposition":
						'attachment; filename="reading-list-highlights.md"',
				},
			});
		}
		const tags = db
			.query("SELECT id,name FROM tags WHERE user_id=? ORDER BY name")
			.all(user.id);
		const feeds = db
			.query("SELECT * FROM rss_subscriptions WHERE user_id=?")
			.all(user.id);
		const seen = db
			.query(
				"SELECT seen.* FROM rss_subscription_seen seen JOIN rss_subscriptions s ON s.id=seen.subscription_id WHERE s.user_id=?",
			)
			.all(user.id);
		const snapshots = db
			.query(
				"SELECT s.* FROM article_snapshots s JOIN items i ON i.id=s.item_id WHERE i.user_id=?",
			)
			.all(user.id);
		const zip = new JSZip();
		zip.file(
			"library.json",
			JSON.stringify(
				{
					version: 1,
					exportedAt: new Date().toISOString(),
					account: { email: user.email, displayName: user.display_name },
					items,
					tags,
					highlights,
					feeds,
					seen,
					savedViews: getUserSavedViews(user.id),
					snapshots,
				},
				null,
				2,
			),
		);
		let bytes = 0;
		for (const row of db
			.query(
				"SELECT uf.filename FROM uploaded_files uf JOIN items i ON i.id=uf.item_id WHERE i.user_id=?",
			)
			.all(user.id) as { filename: string }[]) {
			const owned = getOwnedUploadFile(row.filename, user.id);
			if (!owned)
				return c.json(
					{
						error:
							"Your library changed during export or an uploaded file is missing. Please retry or check the server backup.",
					},
					409,
				);
			const file = Bun.file(owned.path);
			bytes += file.size;
			if (bytes > 512 * 1024 * 1024)
				return c.json(
					{
						error:
							"This export is over 512 MB. Use the operator backup command for a complete backup.",
					},
					413,
				);
			// PDFs and EPUBs are already compressed; deflating them only costs time.
			zip.file(`uploads/${row.filename}`, await file.arrayBuffer(), {
				compression: "STORE",
			});
		}
		const media = db
			.query("SELECT url,content_type,body FROM media_cache WHERE user_id=?")
			.all(user.id) as {
			url: string;
			content_type: string;
			body: Uint8Array;
		}[];
		const manifest = media.map((m, i) => {
			zip.file(`media/${i}`, m.body, { compression: "STORE" });
			return { url: m.url, contentType: m.content_type, path: `media/${i}` };
		});
		zip.file("media.json", JSON.stringify(manifest, null, 2));
		zip.file(
			"README.txt",
			"Reading List portable export\nLibrary data, notes, highlights, feeds, saved views, and article snapshots are in library.json.\nUploaded files are in uploads/. Cached article images are listed in media.json.\nAuthentication credentials are deliberately excluded.\n",
		);
		return new Response(
			// JSZip allocates a plain ArrayBuffer; avoid copying a large archive.
			(await zip.generateAsync({
				type: "uint8array",
				compression: "DEFLATE",
			})) as Uint8Array<ArrayBuffer>,
			{
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition":
						'attachment; filename="reading-list-export.zip"',
				},
			},
		);
	});
}
