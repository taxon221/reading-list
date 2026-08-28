import { dom, state } from "./shared.js";
import { getReaderFontSize } from "./reader-font.js";
import {
	clampProgressRatio,
	createSvgIcon,
	getAuthorizedItemUrl,
	withTimeout,
} from "./utils.js";

function createReaderNode(html) {
	const template = document.createElement("template");
	template.innerHTML = html.trim();
	return template.content.firstElementChild;
}

function destroyReaderResource(instance) {
	if (!instance || typeof instance.destroy !== "function") return;
	instance.destroy();
}

export function revokeReaderBlobUrl() {
	if (!state.readerBlobUrl) return;
	URL.revokeObjectURL(state.readerBlobUrl);
	state.readerBlobUrl = null;
}

export function lockBackgroundScroll() {
	if (document.body.dataset.readerScrollLocked === "1") return;

	state.lockedBodyScrollY =
		window.scrollY ||
		window.pageYOffset ||
		document.documentElement.scrollTop ||
		0;
	document.body.dataset.readerScrollLocked = "1";
	document.body.style.position = "fixed";
	document.body.style.top = `-${state.lockedBodyScrollY}px`;
	document.body.style.left = "0";
	document.body.style.right = "0";
	document.body.style.width = "100%";
	document.body.style.overflow = "hidden";
}

export function unlockBackgroundScroll() {
	if (document.body.dataset.readerScrollLocked !== "1") return;

	document.body.dataset.readerScrollLocked = "";
	document.body.style.position = "";
	document.body.style.top = "";
	document.body.style.left = "";
	document.body.style.right = "";
	document.body.style.width = "";
	document.body.style.overflow = "";
	window.scrollTo(0, state.lockedBodyScrollY);
}

export function showReaderError(
	url,
	message,
	actions = [],
	{ includeOpenOriginal = true } = {},
) {
	if (!dom.readerContent) return;
	if (dom.readerProgress) {
		dom.readerProgress.style.display = "none";
	}
	const wrapper = createReaderNode('<div class="reader-error"></div>');

	const icon = createSvgIcon(
		{
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			width: "48",
			height: "48",
		},
		[
			{ name: "circle", attributes: { cx: "12", cy: "12", r: "10" } },
			{ name: "line", attributes: { x1: "12", y1: "8", x2: "12", y2: "12" } },
			{
				name: "line",
				attributes: { x1: "12", y1: "16", x2: "12.01", y2: "16" },
			},
		],
	);

	const messageEl = createReaderNode("<p></p>");
	messageEl.textContent = message;

	const actionsWrap = createReaderNode('<div class="reader-error-actions"></div>');
	if (includeOpenOriginal) {
		const link = createReaderNode('<a class="header-link"></a>');
		const authorizedUrl = getAuthorizedItemUrl(url);
		if (URL.canParse(authorizedUrl, window.location.origin)) {
			const parsedUrl = new URL(authorizedUrl, window.location.origin);
			if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
				link.href = parsedUrl.toString();
			}
		}
		link.target = "_blank";
		link.rel = "noopener";
		link.textContent = "Open original";
		actionsWrap.appendChild(link);
	}

	for (const action of actions) {
		if (!action?.label || typeof action.onClick !== "function") continue;
		const button = createReaderNode(
			'<button type="button" class="header-link"></button>',
		);
		button.textContent = action.label;
		button.addEventListener("click", () => action.onClick(button));
		actionsWrap.appendChild(button);
	}

	wrapper.append(icon, messageEl, actionsWrap);
	dom.readerContent.replaceChildren(wrapper);
}

export function setReaderSidebarOpen(isOpen) {
	if (!dom.readerSidebar || !dom.readerToggleNotes) return;

	dom.readerSidebar.classList.toggle("hidden", !isOpen);
	dom.readerToggleNotes.classList.toggle("active", isOpen);
}

export function openReaderOriginal() {
	const link = dom.readerOpenOriginal;
	const href = link?.href || link?.getAttribute?.("href");
	if (!href || href === "#") return;
	window.open(href, "_blank", "noopener,noreferrer");
}

export function toggleReaderSidebar() {
	setReaderSidebarOpen(
		Boolean(dom.readerSidebar?.classList.contains("hidden")),
	);
}

export function resetEpubReader() {
	destroyReaderResource(state.currentEpubRendition);
	destroyReaderResource(state.currentEpubBook);
	state.currentEpubRendition = null;
	state.currentEpubBook = null;
}

export function createReaderLoadingState() {
	const wrapper = createReaderNode(
		'<div class="reader-loading"><div class="reader-spinner"></div><p>Loading content...</p></div>',
	);
	return wrapper;
}

export function createVideoIframe(src, allow = "") {
	const iframe = document.createElement("iframe");
	iframe.src = src;
	iframe.allowFullscreen = true;
	if (allow) iframe.allow = allow;
	return iframe;
}

export function createEpubShell() {
	const wrapper = createReaderNode(`
    <div class="ebook-reader">
      <div class="ebook-toolbar">
        <button type="button" class="ebook-nav-btn" id="ebook-prev">Prev</button>
        <span class="ebook-location" id="ebook-location">Loading...</span>
        <button type="button" class="ebook-nav-btn" id="ebook-next">Next</button>
      </div>
      <div class="ebook-stage">
        <div class="ebook-stage-frame" id="ebook-stage"></div>
        <button type="button" class="ebook-tap-zone left" id="ebook-zone-prev" aria-label="Previous page"></button>
        <button type="button" class="ebook-tap-zone right" id="ebook-zone-next" aria-label="Next page"></button>
      </div>
    </div>`);

	return {
		wrapper,
		stage: wrapper.querySelector("#ebook-stage"),
		locationEl: wrapper.querySelector("#ebook-location"),
		prevBtn: wrapper.querySelector("#ebook-prev"),
		nextBtn: wrapper.querySelector("#ebook-next"),
		prevZone: wrapper.querySelector("#ebook-zone-prev"),
		nextZone: wrapper.querySelector("#ebook-zone-next"),
	};
}

function escapeReaderHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function buildParsedArticleDocument(data) {
	const theme = getArticleReaderTheme();
	const {
		isDark,
		background,
		text,
		muted,
		accent,
		rule,
		quote,
		highlight,
	} = theme;
	const fontSize = getReaderFontSize();
	const title = escapeReaderHtml(data.title || "");
	const byline = escapeReaderHtml(data.byline || "");
	const content = data.content || "";

	return `<!DOCTYPE html>
<html lang="en" data-reader-kind="parsed-article">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${title || "Article"}</title>
    <style>
      :root{color-scheme:${isDark ? "dark" : "light"};--rl-reader-bg:${background};--rl-reader-text:${text};--rl-reader-muted:${muted};--rl-reader-accent:${accent};--rl-reader-rule:${rule};--rl-reader-quote:${quote};--rl-reader-highlight:${highlight};--rl-reader-font-size:${fontSize}px}
      html{scroll-behavior:smooth;background:var(--rl-reader-bg)}
      body{margin:0 auto;padding:max(96px, calc(64px + env(safe-area-inset-top))) max(20px, env(safe-area-inset-right)) max(120px, calc(80px + env(safe-area-inset-bottom))) max(20px, env(safe-area-inset-left));max-width:44rem;background:var(--rl-reader-bg);color:var(--rl-reader-text);font-family:"Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,serif;font-size:var(--rl-reader-font-size,20px);line-height:1.78;letter-spacing:.01em;-webkit-text-size-adjust:100%;text-size-adjust:100%}
      .rl-reader-header{margin:0 0 2.6rem;padding-bottom:1.4rem;border-bottom:1px solid var(--rl-reader-rule)}
      .rl-reader-header h1{margin:0 0 .7rem;font-size:clamp(2rem,4vw,3.2rem);line-height:1.03;letter-spacing:-.02em}
      .rl-byline{margin:.35rem 0 0;color:var(--rl-reader-muted)}
      img,video,iframe{max-width:100%;height:auto;border-radius:18px}
      figure{margin-inline:0}
      pre,code{white-space:pre-wrap;word-break:break-word}
      a{color:var(--rl-reader-accent)}
      blockquote{margin-inline:0;padding:.2rem 1rem;border-left:3px solid var(--rl-reader-accent);background:var(--rl-reader-quote);border-radius:0 14px 14px 0}
      table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}
      hr{border:0;border-top:1px solid var(--rl-reader-rule);margin:2rem 0}
      span.reader-highlight{background:var(--rl-reader-highlight);border-radius:.25em;padding:.04em .02em}
    </style>
    <script>
      window.__readingListSetTheme=function(theme){if(!theme)return;const root=document.documentElement;root.style.colorScheme=theme.isDark?"dark":"light";root.style.setProperty("--rl-reader-bg",theme.background);root.style.setProperty("--rl-reader-text",theme.text);root.style.setProperty("--rl-reader-muted",theme.muted);root.style.setProperty("--rl-reader-accent",theme.accent);root.style.setProperty("--rl-reader-rule",theme.rule);root.style.setProperty("--rl-reader-quote",theme.quote);root.style.setProperty("--rl-reader-highlight",theme.highlight)}
      window.__readingListSetFontSize=function(size){if(!size)return;document.documentElement.style.setProperty("--rl-reader-font-size",size+"px")}
    </script>
  </head>
  <body>
    <header class="rl-reader-header"><h1>${title}</h1>${byline ? `<p class="rl-byline">${byline}</p>` : ""}</header>
    ${content}
  </body>
</html>`;
}

function getRemoteReaderUrl(itemUrl) {
	if (!URL.canParse(itemUrl)) return null;

	const parsedUrl = new URL(itemUrl);
	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		return null;
	}

	return parsedUrl.toString();
}

export function getReaderSourceUrl(itemUrl, type) {
	if (typeof itemUrl !== "string" || !itemUrl) return null;
	if (itemUrl.startsWith("/uploads/")) return getAuthorizedItemUrl(itemUrl);

	const remoteUrl = getRemoteReaderUrl(itemUrl);
	if (!remoteUrl) return null;

	if (type === "pdf") {
		return `/api/proxy/pdf?url=${encodeURIComponent(remoteUrl)}`;
	}

	if (type === "epub") {
		return `/api/proxy/epub?url=${encodeURIComponent(remoteUrl)}`;
	}

	if (type === "article") {
		return `/api/proxy?url=${encodeURIComponent(remoteUrl)}&mode=parsed`;
	}

	return remoteUrl;
}

export function getSafeReaderFetchUrl(url, allowedPathPrefixes) {
	if (typeof url !== "string" || !url) return null;

	let parsedUrl;
	try {
		parsedUrl = new URL(url, window.location.origin);
	} catch {
		return null;
	}

	if (parsedUrl.origin !== window.location.origin) {
		return null;
	}

	if (
		!Array.from(allowedPathPrefixes).some(
			(prefix) =>
				parsedUrl.pathname === prefix ||
				parsedUrl.pathname.startsWith(`${prefix}/`),
		)
	) {
		return null;
	}

	return parsedUrl.toString();
}

function getArticleReaderTheme() {
	const isDark = document.documentElement.classList.contains("dark");

	return {
		isDark,
		background: isDark ? "#111111" : "#eef1f4",
		text: isDark ? "#f3f4f6" : "#1a1a1a",
		muted: isDark ? "#9ca3af" : "#6b7280",
		accent: isDark ? "#60a5fa" : "#2563eb",
		rule: isDark ? "#2d2d2d" : "#d8dde3",
		quote: isDark ? "rgba(59,130,246,0.14)" : "rgba(59,130,246,0.08)",
		highlight: isDark
			? "rgba(96,165,250,0.3)"
			: "rgba(59,130,246,0.22)",
	};
}

export function syncOpenArticleTheme() {
	const iframe = state.readerIframe;
	const doc =
		iframe?.contentDocument || iframe?.contentWindow?.document || null;
	if (!doc?.documentElement) return;
	if (doc.documentElement.dataset.readerKind !== "parsed-article") return;

	const theme = getArticleReaderTheme();
	iframe.style.background = theme.background;

	if (typeof iframe.contentWindow?.__readingListSetTheme === "function") {
		iframe.contentWindow.__readingListSetTheme(theme);
	} else {
		doc.documentElement.style.colorScheme = theme.isDark ? "dark" : "light";
		doc.documentElement.style.setProperty("--rl-reader-bg", theme.background);
		doc.documentElement.style.setProperty("--rl-reader-text", theme.text);
		doc.documentElement.style.setProperty("--rl-reader-muted", theme.muted);
		doc.documentElement.style.setProperty("--rl-reader-accent", theme.accent);
		doc.documentElement.style.setProperty("--rl-reader-rule", theme.rule);
		doc.documentElement.style.setProperty("--rl-reader-quote", theme.quote);
		doc.documentElement.style.setProperty(
			"--rl-reader-highlight",
			theme.highlight,
		);
	}

	const fontSize = getReaderFontSize();
	if (typeof iframe.contentWindow?.__readingListSetFontSize === "function") {
		iframe.contentWindow.__readingListSetFontSize(fontSize);
	} else {
		doc.documentElement.style.setProperty(
			"--rl-reader-font-size",
			`${fontSize}px`,
		);
	}
}

function getPdfReaderTheme() {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function syncPdfReaderTheme() {
	const iframe = state.readerIframe;
	if (!iframe?.contentWindow) return;
	iframe.contentWindow.postMessage(
		{ type: "readinglist:theme", theme: getPdfReaderTheme() },
		window.location.origin,
	);
}

export function mountPdfReader(fileUrl, itemId, readerApi) {
	if (!dom.readerContent) return;
	revokeReaderBlobUrl();

	const progress = readerApi.getCurrentItemReadingProgress(itemId);
	const progressRatio =
		progress && progress.kind === "pdf" && typeof progress.ratio === "number"
			? clampProgressRatio(progress.ratio)
			: null;

	const iframe = document.createElement("iframe");
	const progressQuery =
		progressRatio === null ? "" : `&progress=${progressRatio}`;
	const theme = getPdfReaderTheme();
	iframe.src = `/pdf-reader.html?file=${encodeURIComponent(fileUrl)}${progressQuery}&theme=${theme}`;

	dom.readerContent.replaceChildren(iframe);
	state.readerIframe = iframe;

	iframe.onload = () => {
		readerApi.setupIframeSelectionListener?.();
		readerApi.scheduleApplyHighlightsToDocument?.();
	};
}

export async function fetchParsedArticle(articleUrl) {
	const safeArticleUrl = getSafeReaderFetchUrl(
		articleUrl,
		new Set(["/api/proxy"]),
	);
	if (!safeArticleUrl) {
		return {
			error: "Failed to fetch content",
			reason: "unsupported_url",
			message: "This article URL is not supported.",
		};
	}

	const response = await fetch(safeArticleUrl).catch(() => null);
	if (!response) {
		return {
			error: "Failed to fetch content",
			reason: "fetch_failed",
			message: "Failed to load content. The site may not allow embedding.",
		};
	}

	try {
		return await withTimeout(response.json(), 15000, "Timed out loading article.");
	} catch (error) {
		return {
			error: "Failed to fetch content",
			reason: "timeout",
			message:
				error instanceof Error && error.message
					? error.message
					: "Timed out loading article.",
		};
	}
}
