import type { Hono } from "hono";
import { getCurrentUser } from "./auth";
import {
	extractArticleContent,
	fetchRemoteMetadata,
	getFallbackTitle,
	getSafeRemoteUrl,
	parseTitle,
	serializeDocumentHtml,
} from "./content-utils";
import { getOwnedUploadFile, getUploadContentType } from "./item-store";
import type { AppBindings } from "./types";

export function registerContentRoutes(app: Hono<AppBindings>) {
	app.get("/api/fetch-meta", async (c) => {
		const url = c.req.query("url");
		if (!url) return c.json({ error: "URL is required" }, 400);

		const metadata = await fetchRemoteMetadata(url);
		if (!metadata) {
			return c.json({ error: "URL is not allowed" }, 400);
		}

		return c.json(metadata);
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
					title: parseTitle(html) || getFallbackTitle(safeUrl),
					content: serializeDocumentHtml(html, safeUrl),
				});
			}

			return c.json({ type: "unsupported", contentType, url: safeUrl });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return c.json({ error: "Failed to fetch content", message }, 500);
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
}
