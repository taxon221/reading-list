import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "../db";
import { cookieOptions, hash, secret } from "./sessions";
import { readBoundedBytes } from "./content-utils";
import { allowRequest, clientAddress } from "./rate-limit";
import type { Hono } from "hono";
import { extractUrlFromText } from "./import-utils";
import { importUploadFileForUser } from "./item-store";
import { resolveRequestUser } from "./auth";
import type { AppBindings } from "./types";

function redirectWithParams(
	c: { redirect: (location: string, status?: 302 | 303) => Response },
	params: Record<string, string>,
) {
	const search = new URLSearchParams(params);
	return c.redirect(`/?${search.toString()}`, 303);
}

export function registerShareRoutes(app: Hono<AppBindings>) {
	app.get("/api/pending-share", async (c) => {
		const { user } = await resolveRequestUser(c);
		if (!user) return c.json({ error: "Sign in again." }, 401);
		const token = getCookie(c, "reading_share") || "";
		const row = db
			.query(
				"DELETE FROM pending_shares WHERE token_hash=? AND expires_at>? RETURNING payload",
			)
			.get(hash(token), Date.now()) as { payload: Uint8Array } | null;
		deleteCookie(c, "reading_share", { path: "/" });
		if (!row) return c.json({ pending: false });
		const data = JSON.parse(new TextDecoder().decode(row.payload));
		if (data.file) {
			const file = new File(
				[Buffer.from(data.file.body, "base64")],
				data.file.name,
				{ type: data.file.type },
			);
			const imported = await importUploadFileForUser(user.id, file);
			if (imported.ok === false) return c.json({ error: imported.reason }, 400);
			return c.json({
				pending: true,
				item: imported.id,
				title: imported.title,
			});
		}
		return c.json({ pending: true, ...data });
	});
	app.post("/share-target", async (c) => {
		const { status, user } = await resolveRequestUser(c);
		if (status === 401 || !user) {
			// Signed-out shares are stored until sign-in; cap them per client so
			// one visitor can't fill the shared queue.
			if (!allowRequest(`share:${clientAddress(c)}`, 10, 900000))
				return c.json({ error: "Too many shares. Please sign in first." }, 429);
			const bytes = await readBoundedBytes(
				new Response(c.req.raw.body),
				25 * 1024 * 1024,
			).catch(() => null);
			if (!bytes)
				return c.json({ error: "Shared files must be under 25 MB." }, 413);
			const form = await new Response(bytes, {
				headers: { "Content-Type": c.req.header("content-type") || "" },
			})
				.formData()
				.catch(() => null);
			if (!form) return c.json({ error: "Invalid shared content." }, 400);
			const file = form.get("files") || form.get("file");
			const payload =
				file instanceof File
					? {
							file: {
								name: file.name,
								type: file.type,
								body: Buffer.from(await file.arrayBuffer()).toString("base64"),
							},
						}
					: {
							url: String(
								form.get("url") ||
									extractUrlFromText(String(form.get("text") || "")),
							),
							title: String(form.get("title") || ""),
						};
			const token = secret();
			db.query("DELETE FROM pending_shares WHERE expires_at<=?").run(
				Date.now(),
			);
			const total = db
				.query("SELECT COUNT(*) AS count FROM pending_shares")
				.get() as { count: number };
			if (
				total.count >= 50 ||
				(
					db
						.query(
							"SELECT COALESCE(SUM(length(payload)),0) AS bytes FROM pending_shares",
						)
						.get() as { bytes: number }
				).bytes +
					JSON.stringify(payload).length >
					128 * 1024 * 1024
			)
				return c.json(
					{ error: "Too many pending shares. Please sign in first." },
					429,
				);
			db.query("INSERT INTO pending_shares VALUES (?,?,?)").run(
				hash(token),
				new TextEncoder().encode(JSON.stringify(payload)),
				Date.now() + 900000,
			);
			setCookie(c, "reading_share", token, {
				...cookieOptions(c),
				maxAge: 900,
			});
			return redirectWithParams(c, { share: "auth-required" });
		}

		const form = await c.req.formData();
		const fileEntries = form.getAll("files");
		const fallbackSingle = form.get("file");
		const files = (
			fileEntries.length > 0
				? fileEntries
				: fallbackSingle
					? [fallbackSingle]
					: []
		).filter(
			(entry): entry is File => typeof entry !== "string" && !!entry?.name,
		);

		if (files.length > 0) {
			const result = await importUploadFileForUser(user.id, files[0]);
			if (result.ok === false) {
				return redirectWithParams(c, {
					share: "file-error",
					message: result.reason,
				});
			}

			return redirectWithParams(c, {
				share: "imported",
				item: String(result.id),
				title: result.title,
			});
		}

		const rawUrl = String(form.get("url") || "").trim();
		const rawText = String(form.get("text") || "").trim();
		const rawTitle = String(form.get("title") || "").trim();
		const sharedUrl = rawUrl || extractUrlFromText(rawText);

		if (sharedUrl && URL.canParse(sharedUrl)) {
			const params: Record<string, string> = {
				share: "link",
				url: sharedUrl,
			};
			if (rawTitle) params.title = rawTitle;
			else if (rawText && rawText !== sharedUrl) params.title = rawText;
			return redirectWithParams(c, params);
		}

		return redirectWithParams(c, { share: "empty" });
	});
}
