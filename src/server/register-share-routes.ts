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
	app.post("/share-target", async (c) => {
		const { status, user } = await resolveRequestUser(c);
		if (status === 401 || !user) {
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
