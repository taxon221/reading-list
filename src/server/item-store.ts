import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { dataDir, db } from "../db";
import type {
	CurrentUser,
	HighlightRow,
	ItemRow,
	SavedViewRecord,
	TagRow,
	UserPreferencesRow,
} from "./types";

export const uploadsDir = `${dataDir}/uploads`;
const uploadsRoot = resolve(uploadsDir);

if (!existsSync(uploadsDir)) {
	mkdirSync(uploadsDir, { recursive: true });
}

export const allowedUploadExtensions = new Set(["pdf", "epub"]);

function normalizeSavedViewName(value: unknown): string {
	return String(value || "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 120);
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

		let id = String((entry as { id?: unknown }).id || "")
			.trim()
			.slice(0, 120);
		if (!id) {
			id = crypto.randomUUID();
		}
		if (seenIds.has(id)) continue;
		seenIds.add(id);

		normalized.push({
			id,
			name,
			filters: sanitizeSavedViewFilters(
				(entry as { filters?: unknown }).filters,
			),
		});

		if (normalized.length >= 100) break;
	}

	return normalized;
}

export function getUserSavedViews(userId: number): SavedViewRecord[] {
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

export function setUserSavedViews(
	userId: number,
	savedViews: unknown,
): SavedViewRecord[] {
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

export function getOwnedItem(id: string | number | bigint, userId: number) {
	return (
		(db
			.query("SELECT * FROM items WHERE id = ? AND user_id = ?")
			.get(id, userId) as ItemRow | undefined) || null
	);
}

export function getOwnedHighlight(
	id: string | number | bigint,
	userId: number,
) {
	return (
		(db
			.query("SELECT * FROM highlights WHERE id = ? AND user_id = ?")
			.get(id, userId) as HighlightRow | undefined) || null
	);
}

export function getItemTags(
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

export function normalizeTagNames(tags: unknown): string[] {
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

export function attachTagsToItem(
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

export function deleteOwnedItem(currentUser: CurrentUser, id: number): boolean {
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

export function parseTitleAuthorFromFilename(name: string): {
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

export function createStoredFilename(
	originalName: string,
	extension: string,
): string {
	const parsed = parseTitleAuthorFromFilename(originalName);
	const base = sanitizeFilenamePart(parsed.title || "file") || "file";
	return `${Date.now()}-${crypto.randomUUID()}-${base}.${extension}`;
}

export function detectUploadedFileType(extension: string): string {
	return extension === "pdf" ? "pdf" : "ebook";
}

export function parseUploadTags(raw: string | null): string[] {
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

export function resolveUploadPath(filename: string): string | null {
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

export function removeUploadedFileIfExists(url: string) {
	const filename = getUploadFilename(url);
	if (!filename) return;

	const filePath = resolveUploadPath(filename);
	if (!filePath) return;
	if (!existsSync(filePath)) return;

	try {
		unlinkSync(filePath);
	} catch {}
}

export function getOwnedUploadFile(
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

export function getUploadContentType(type: string, filename: string): string {
	if (type === "pdf" || filename.toLowerCase().endsWith(".pdf")) {
		return "application/pdf";
	}

	if (type === "ebook" || filename.toLowerCase().endsWith(".epub")) {
		return "application/epub+zip";
	}

	return "application/octet-stream";
}

export function getUploadFileExtension(name: string): string {
	return getFileExtension(name);
}
