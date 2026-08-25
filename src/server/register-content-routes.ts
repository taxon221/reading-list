import type { Hono } from "hono";
import { getCurrentUser } from "./auth";
import {
	extractArticleContent,
	fetchRemoteMetadata,
	getFallbackTitle,
	parseTitle,
	readResponseText,
	serializeDocumentHtml,
	withRemoteResponse,
} from "./content-utils";
import { getOwnedUploadFile, getUploadContentType } from "./item-store";
import type { AppBindings } from "./types";

function createArticleOpenError(
	reason: "fetch_failed" | "login_required_or_paywalled" | "timeout",
) {
	if (reason === "login_required_or_paywalled") {
		return {
			error: "Failed to fetch content",
			reason,
			message:
				"This article appears to require a subscription or sign-in. Open the original page to continue.",
		};
	}

	if (reason === "timeout") {
		return {
			error: "Failed to fetch content",
			reason,
			message: "This article took too long to load. Open the original page to continue.",
		};
	}

	return {
		error: "Failed to fetch content",
		reason,
		message:
			"We couldn't open this article in the reader. Open the original page to continue.",
	};
}

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

		try {
			const result = await withRemoteResponse(
				url,
				{
					timeoutMs: 15000,
					headers: {
						"User-Agent": "Mozilla/5.0 (compatible; ReadingList/1.0)",
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
						"Accept-Language": "en-US,en;q=0.5",
					},
				},
				async (response, finalUrl) => {
					if (!response.ok) {
						return c.json(
							createArticleOpenError(
								[401, 402, 403, 451].includes(response.status)
									? "login_required_or_paywalled"
									: "fetch_failed",
							),
							502,
						);
					}

					const contentType = response.headers.get("content-type") || "";
					if (contentType.includes("application/pdf")) {
						return c.json({ type: "pdf", url: finalUrl });
					}
					if (
						contentType.includes("text/html") ||
						contentType.includes("application/xhtml")
					) {
						const html = await readResponseText(response);
						if (mode === "parsed") {
							const article = extractArticleContent(html, finalUrl);
							return c.json({
								type: "html",
								url: finalUrl,
								title: article.title,
								byline: article.byline,
								excerpt: article.excerpt,
								content: article.content,
							});
						}
						return c.json({
							type: "html",
							url: finalUrl,
							title: parseTitle(html) || getFallbackTitle(finalUrl),
							content: serializeDocumentHtml(html, finalUrl),
						});
					}
					return c.json({ type: "unsupported", contentType, url: finalUrl });
				},
			);
			return result || c.json({ error: "URL is not allowed" }, 400);
		} catch (error: unknown) {
			return c.json(
				createArticleOpenError(
					error instanceof Error && error.name === "AbortError"
						? "timeout"
						: "fetch_failed",
				),
				500,
			);
		}
	});

	for (const documentType of [
		{ path: "/api/proxy/pdf", label: "PDF", contentType: "application/pdf" },
		{
			path: "/api/proxy/epub",
			label: "EPUB",
			contentType: "application/epub+zip",
		},
	] as const) {
		app.get(documentType.path, async (c) => {
			const url = c.req.query("url");
			if (!url) return c.json({ error: "URL is required" }, 400);

			try {
				const result = await withRemoteResponse(
					url,
					{
						timeoutMs: 20000,
						headers: {
							"User-Agent": "Mozilla/5.0 (compatible; ReadingList/1.0)",
							Accept: `${documentType.contentType},*/*;q=0.8`,
						},
					},
					async (response, finalUrl) => {
						if (!response.ok) {
							return c.json(
								{ error: `Failed to fetch ${documentType.label}` },
								502,
							);
						}
						const contentType = response.headers.get("content-type") || "";
						const extension = `.${documentType.label.toLowerCase()}`;
						if (
							!contentType.includes(documentType.contentType) &&
							!new URL(finalUrl).pathname.toLowerCase().endsWith(extension)
						) {
							return c.json(
								{ error: `URL did not return a ${documentType.label} document` },
								400,
							);
						}
						return new Response(await response.arrayBuffer(), {
							headers: {
								"Content-Type": documentType.contentType,
								"Cache-Control": "no-store",
							},
						});
					},
				);
				return result || c.json({ error: "URL is not allowed" }, 400);
			} catch (error: unknown) {
				return c.json(
					{ error: `Failed to fetch ${documentType.label}` },
					error instanceof Error && error.name === "AbortError" ? 504 : 502,
				);
			}
		});
	}

	app.get("/api/uploads/:filename", async (c) => {
		const currentUser = getCurrentUser(c);
		const filename = c.req.param("filename");
		const upload = getOwnedUploadFile(filename, currentUser.id);

		if (!upload) {
			return c.json({ error: "File not found" }, 404);
		}

		return new Response(Bun.file(upload.path), {
			headers: {
				"Content-Type": getUploadContentType(upload.mediaType),
				"Cache-Control": "no-store",
			},
		});
	});
}
