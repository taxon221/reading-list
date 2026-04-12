import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

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

export function detectType(url: string, contentType?: string): string {
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

export function parseTitle(html: string): string | null {
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

export function parseAuthor(html: string): string | null {
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

function normalizePreviewImageUrl(
	sourceUrl: string,
	value: string | null,
): string | null {
	const trimmed = decodeHtmlEntities(value?.trim() || "");
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

export function parsePreviewImage(
	html: string,
	sourceUrl: string,
): string | null {
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

	const imageNodes = document.querySelectorAll(
		"article img[src], main img[src], img[src]",
	);
	const candidates = Array.from(imageNodes).slice(0, 8) as Element[];
	for (const node of candidates) {
		const rawSrc = node.getAttribute("src");
		const normalized = normalizePreviewImageUrl(sourceUrl, rawSrc);
		if (!normalized) continue;
		if (/\b(icon|logo|avatar)\b/i.test(normalized)) continue;
		return normalized;
	}

	return null;
}

export function normalizeStoredPreviewImage(value: unknown): string {
	const trimmed = String(value || "").trim();
	if (!trimmed) return "";

	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.toString();
		}
	} catch {}

	return "";
}

type RemoteMetadata = {
	title: string;
	type: string;
	author: string | null;
	image: string | null;
};

function buildRemoteMetadataFallback(url: string): RemoteMetadata {
	return {
		title: getFallbackTitle(url),
		type: detectType(url),
		author: null,
		image: null,
	};
}

export async function fetchRemoteMetadata(
	rawUrl: string,
): Promise<RemoteMetadata | null> {
	const safeUrl = await getSafeRemoteUrl(rawUrl);
	if (!safeUrl) return null;

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

		return {
			title: title || getFallbackTitle(safeUrl),
			type,
			author,
			image,
		};
	} catch {
		return buildRemoteMetadataFallback(safeUrl);
	}
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

export function serializeDocumentHtml(html: string, sourceUrl: string) {
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

export function extractArticleContent(html: string, sourceUrl: string) {
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

export async function getSafeRemoteUrl(rawUrl: string): Promise<string | null> {
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

export function getFallbackTitle(url: string): string {
	return fallbackTitle(url);
}
