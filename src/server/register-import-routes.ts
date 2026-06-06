import type { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "./auth";
import { detectType, getFallbackTitle } from "./content-utils";
import {
	getHeaderIndex,
	normalizeHeader,
	normalizeReadwiseDate,
	parseCsv,
	parseReadwiseTags,
} from "./import-utils";
import {
	attachTagsToItem,
	importUploadFileForUser,
	parseTitleAuthorFromFilename,
	parseUploadTags,
} from "./item-store";
import type { AppBindings } from "./types";

export function registerImportRoutes(app: Hono<AppBindings>) {
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
			const authorIndex = getHeaderIndex(headers, [
				"author",
				"authors",
				"creator",
			]);
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
							getFallbackTitle(url);
						const author =
							(authorIndex !== -1 ? row[authorIndex] : "")?.trim() || "";
						const tags = parseReadwiseTags(
							tagsIndex !== -1 ? row[tagsIndex] : "",
						);
						const createdAt = normalizeReadwiseDate(
							savedIndex !== -1 ? row[savedIndex] : "",
						);
						const type = detectType(url);

						const result = insertItem.run(
							currentUser.id,
							url,
							title || "",
							author,
							type || "article",
							createdAt,
						);

						attachTagsToItem(result.lastInsertRowid, currentUser.id, tags);
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

		let imported = 0;
		let skipped = 0;
		const failedFiles: Array<{ name: string; reason: string }> = [];

		for (const file of validFiles) {
			const parsed = parseTitleAuthorFromFilename(file.name);
			const result = await importUploadFileForUser(currentUser.id, file, {
				title:
					validFiles.length === 1 && titleOverride
						? titleOverride
						: parsed.title || file.name,
				author:
					validFiles.length === 1 && authorOverride
						? authorOverride
						: parsed.author || "",
				tags,
			});

			if (result.ok) {
				imported++;
			} else if (result.ok === false) {
				skipped++;
				failedFiles.push({ name: result.name, reason: result.reason });
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
}
