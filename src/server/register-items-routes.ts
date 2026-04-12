import type { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "./auth";
import { normalizeStoredPreviewImage } from "./content-utils";
import {
	attachTagsToItem,
	deleteOwnedItem,
	getItemTags,
	getOwnedHighlight,
	getOwnedItem,
	getUserSavedViews,
	removeUploadedFileIfExists,
	setUserSavedViews,
} from "./item-store";
import type { AppBindings, ItemRow } from "./types";

export function registerItemRoutes(app: Hono<AppBindings>) {
	app.get("/api/items", (c) => {
		const currentUser = getCurrentUser(c);
		const tagsParam = c.req.query("tags");
		const excludeTagsParam = c.req.query("exclude_tags");
		const typesParam = c.req.query("types");

		const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
		const excludeTags = excludeTagsParam
			? excludeTagsParam.split(",").filter(Boolean)
			: [];
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
			const author = (row.author || "").trim();
			if (author) authors.add(author);
			try {
				const host = new URL(row.url).hostname
					.replace(/^www\./i, "")
					.toLowerCase();
				if (host) domains.add(host);
			} catch {
				/* ignore */
			}
		}

		return c.json({
			authors: [...authors].sort((left, right) => left.localeCompare(right)),
			domains: [...domains].sort((left, right) => left.localeCompare(right)),
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
		const { url, title, author, type, tags, preview_image } =
			await c.req.json();

		if (!url) return c.json({ error: "URL is required" }, 400);
		const previewImage = normalizeStoredPreviewImage(preview_image);

		const result = db
			.query(
				"INSERT INTO items (user_id, url, title, author, type, preview_image) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				currentUser.id,
				url,
				title || "",
				author || "",
				type || "article",
				previewImage,
			);

		attachTagsToItem(result.lastInsertRowid, currentUser.id, tags);
		return c.json({ id: result.lastInsertRowid, success: true }, 201);
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
		).run(serialized, id, currentUser.id);

		return c.json({ success: true });
	});

	app.put("/api/items/:id", async (c) => {
		const currentUser = getCurrentUser(c);
		const id = c.req.param("id");
		const { url, title, author, type, tags, notes, preview_image } =
			await c.req.json();
		const existingItem = getOwnedItem(id, currentUser.id) as {
			url: string;
			author: string;
			preview_image: string;
		} | null;

		if (!existingItem) return c.json({ error: "Item not found" }, 404);

		if (existingItem.url && existingItem.url !== url) {
			removeUploadedFileIfExists(existingItem.url);
		}

		const nextAuthor =
			author !== undefined ? String(author || "") : existingItem.author || "";
		const nextPreviewImage =
			normalizeStoredPreviewImage(preview_image) ||
			(url === existingItem.url ? existingItem.preview_image : "");

		db.query(
			"UPDATE items SET url = ?, title = ?, author = ?, type = ?, preview_image = ?, notes = ? WHERE id = ? AND user_id = ?",
		).run(
			url,
			title || "",
			nextAuthor,
			type || "article",
			nextPreviewImage,
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
			? body.values.map((value) => String(value || "").trim()).filter(Boolean)
			: typeof body?.value === "string"
				? [body.value.trim()].filter(Boolean)
				: [];
		if (values.length === 0) {
			return c.json({ error: "At least one value is required" }, 400);
		}

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
			ids = rows.map((row) => row.id);
		} else if (by === "author") {
			const normalizedValues = values.map((value) => value.toLowerCase());
			const placeholders = normalizedValues.map(() => "?").join(",");
			const rows = db
				.query(
					`SELECT id FROM items WHERE user_id = ? AND lower(trim(author)) IN (${placeholders})`,
				)
				.all(currentUser.id, ...normalizedValues) as { id: number }[];
			ids = rows.map((row) => row.id);
		} else if (by === "type") {
			const placeholders = values.map(() => "?").join(",");
			const rows = db
				.query(
					`SELECT id FROM items WHERE user_id = ? AND type IN (${placeholders})`,
				)
				.all(currentUser.id, ...values) as { id: number }[];
			ids = rows.map((row) => row.id);
		} else if (by === "domain") {
			const needles = new Set(
				values.map((value) => value.replace(/^www\./i, "").toLowerCase()),
			);
			const rows = db
				.query("SELECT id, url FROM items WHERE user_id = ?")
				.all(currentUser.id) as { id: number; url: string }[];
			ids = rows
				.filter((row) => {
					try {
						const host = new URL(row.url).hostname
							.replace(/^www\./i, "")
							.toLowerCase();
						for (const needle of needles) {
							if (host === needle || host.endsWith(`.${needle}`)) return true;
						}
						return false;
					} catch {
						return false;
					}
				})
				.map((row) => row.id);
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

		return c.json(
			getOwnedHighlight(result.lastInsertRowid, currentUser.id),
			201,
		);
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
}
