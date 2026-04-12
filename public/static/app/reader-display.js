import { dom, state } from "./shared.js";
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

export function showReaderError(url, message) {
	if (!dom.readerContent) return;
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

	const linkWrap = createReaderNode("<p></p>");
	const link = createReaderNode("<a></a>");
	const authorizedUrl = getAuthorizedItemUrl(url);
	if (URL.canParse(authorizedUrl, window.location.origin)) {
		const parsedUrl = new URL(authorizedUrl, window.location.origin);
		if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
			link.href = parsedUrl.toString();
		}
	}
	link.target = "_blank";
	link.rel = "noopener";
	link.textContent = "Open in new tab →";
	linkWrap.appendChild(link);

	wrapper.append(icon, messageEl, linkWrap);
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
	const isDark = document.documentElement.classList.contains("dark");
	const title = escapeReaderHtml(data.title || "");
	const byline = escapeReaderHtml(data.byline || "");
	const excerpt = escapeReaderHtml(data.excerpt || "");
	const content = data.content || "";
	const background = isDark ? "#101419" : "#f7f1e6";
	const text = isDark ? "#f2ede3" : "#231a14";
	const muted = isDark ? "#bcae97" : "#7b6553";
	const accent = isDark ? "#ffba5c" : "#c46d23";
	const rule = isDark ? "rgba(255,255,255,0.08)" : "rgba(35,26,20,0.1)";
	const quote = isDark ? "rgba(255,186,92,0.16)" : "rgba(196,109,35,0.09)";

	return `<!DOCTYPE html>
<html lang="en" data-reader-kind="parsed-article">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${title || "Article"}</title>
    <style>
      :root{color-scheme:${isDark ? "dark" : "light"};--rl-reader-bg:${background};--rl-reader-text:${text};--rl-reader-muted:${muted};--rl-reader-accent:${accent};--rl-reader-rule:${rule};--rl-reader-quote:${quote}}
      html{scroll-behavior:smooth;background:var(--rl-reader-bg)}
      body{margin:0 auto;padding:96px 20px 120px;max-width:44rem;background:var(--rl-reader-bg);color:var(--rl-reader-text);font-family:"Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,serif;font-size:20px;line-height:1.78;letter-spacing:.01em;-webkit-text-size-adjust:100%}
      .rl-reader-header{margin:0 0 2.6rem;padding-bottom:1.4rem;border-bottom:1px solid var(--rl-reader-rule)}
      .rl-reader-header h1{margin:0 0 .7rem;font-size:clamp(2rem,4vw,3.2rem);line-height:1.03;letter-spacing:-.02em}
      .rl-byline,.rl-excerpt{margin:.35rem 0 0;color:var(--rl-reader-muted)}
      .rl-excerpt{font-size:.98em}
      img,video,iframe{max-width:100%;height:auto;border-radius:18px}
      figure{margin-inline:0}
      pre,code{white-space:pre-wrap;word-break:break-word}
      a{color:var(--rl-reader-accent)}
      blockquote{margin-inline:0;padding:.2rem 1rem;border-left:3px solid var(--rl-reader-accent);background:var(--rl-reader-quote);border-radius:0 14px 14px 0}
      table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}
      hr{border:0;border-top:1px solid var(--rl-reader-rule);margin:2rem 0}
      span.reader-highlight{background:rgba(255,190,92,.35);border-radius:.25em;padding:.04em .02em}
    </style>
    <script>
      window.__readingListSetTheme=function(theme){if(!theme)return;const root=document.documentElement;root.style.colorScheme=theme.isDark?"dark":"light";root.style.setProperty("--rl-reader-bg",theme.background);root.style.setProperty("--rl-reader-text",theme.text);root.style.setProperty("--rl-reader-muted",theme.muted);root.style.setProperty("--rl-reader-accent",theme.accent);root.style.setProperty("--rl-reader-rule",theme.rule);root.style.setProperty("--rl-reader-quote",theme.quote)}
    </script>
  </head>
  <body>
    <header class="rl-reader-header"><h1>${title}</h1>${byline ? `<p class="rl-byline">${byline}</p>` : ""}${excerpt ? `<p class="rl-excerpt">${excerpt}</p>` : ""}</header>
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
		background: isDark ? "#101419" : "#f7f1e6",
		text: isDark ? "#f2ede3" : "#231a14",
		muted: isDark ? "#bcae97" : "#7b6553",
		accent: isDark ? "#ffba5c" : "#c46d23",
		rule: isDark ? "rgba(255,255,255,0.08)" : "rgba(35,26,20,0.1)",
		quote: isDark ? "rgba(255,186,92,0.16)" : "rgba(196,109,35,0.09)",
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
		return;
	}

	doc.documentElement.style.colorScheme = theme.isDark ? "dark" : "light";
	doc.documentElement.style.setProperty("--rl-reader-bg", theme.background);
	doc.documentElement.style.setProperty("--rl-reader-text", theme.text);
	doc.documentElement.style.setProperty("--rl-reader-muted", theme.muted);
	doc.documentElement.style.setProperty("--rl-reader-accent", theme.accent);
	doc.documentElement.style.setProperty("--rl-reader-rule", theme.rule);
	doc.documentElement.style.setProperty("--rl-reader-quote", theme.quote);
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
	iframe.src = `/pdf-reader.html?file=${encodeURIComponent(fileUrl)}${progressQuery}`;

	dom.readerContent.replaceChildren(iframe);
	state.readerIframe = iframe;

	iframe.onload = () => {
		readerApi.setupIframeSelectionListener?.();
		readerApi.scheduleApplyHighlightsToDocument?.();
	};
}

export async function fetchParsedArticle(articleUrl, itemUrl) {
	const safeArticleUrl = getSafeReaderFetchUrl(
		articleUrl,
		new Set(["/api/proxy"]),
	);
	if (!safeArticleUrl) {
		showReaderError(itemUrl, "This article URL is not supported.");
		return null;
	}

	const response = await fetch(safeArticleUrl).catch(() => null);
	if (!response) {
		showReaderError(
			itemUrl,
			"Failed to load content. The site may not allow embedding.",
		);
		return null;
	}

	return await withTimeout(
		response.json(),
		15000,
		"Timed out loading article.",
	);
}
