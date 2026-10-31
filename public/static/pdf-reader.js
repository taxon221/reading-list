import {
	getDocument,
	GlobalWorkerOptions,
	TextLayer,
} from "/static/vendor/pdf.mjs";
const statusEl = document.getElementById("status");
const containerEl = document.getElementById("pdf-container");
const params = new URLSearchParams(location.search);
const fileUrl = params.get("file");
const rawProgress = params.get("progress");
const initialProgress =
	rawProgress === null ? 0 : Math.max(0, Math.min(1, Number(rawProgress) || 0));
const pages = new Map();
let pdf,
	observer,
	progressTicking = false;
let renderQueue = Promise.resolve();
GlobalWorkerOptions.workerSrc = "/static/vendor/pdf.worker.mjs";
function applyTheme(theme) {
	document.documentElement.classList.toggle("dark", theme === "dark");
}
applyTheme(params.get("theme"));
window.addEventListener("message", (event) => {
	if (
		event.origin === location.origin &&
		event.source === parent &&
		event.data?.type === "readinglist:theme"
	)
		applyTheme(event.data.theme);
});
function safeFileUrl(value) {
	try {
		const url = new URL(value, location.origin);
		return url.origin === location.origin &&
			["/api/uploads/", "/api/proxy/pdf"].some((path) =>
				url.pathname.startsWith(path),
			)
			? url.href
			: null;
	} catch {
		return null;
	}
}
async function renderPage(number) {
	const entry = pages.get(number);
	if (!entry || entry.rendered) return;
	entry.rendered = true;
	try {
		const page = await pdf.getPage(number);
		const viewport = page.getViewport({ scale: entry.scale });
		const previousHeight = entry.element.getBoundingClientRect().height;
		const above = entry.element.getBoundingClientRect().bottom < 0;
		entry.element.style.width = `${viewport.width}px`;
		entry.element.style.height = `${viewport.height}px`;
		if (above) window.scrollBy(0, viewport.height - previousHeight);
		const canvas = document.createElement("canvas");
		canvas.className = "pdf-canvas";
		const ratio = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.floor(viewport.width * ratio);
		canvas.height = Math.floor(viewport.height * ratio);
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;
		const textLayer = document.createElement("div");
		textLayer.className = "textLayer";
		entry.element.style.setProperty("--scale-factor", String(entry.scale));
		entry.element.style.setProperty(
			"--total-scale-factor",
			String(entry.scale),
		);
		entry.element.replaceChildren(canvas, textLayer);
		await page.render({
			canvasContext: canvas.getContext("2d"),
			viewport,
			transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
		}).promise;
		await new TextLayer({
			textContentSource: page.streamTextContent(),
			container: textLayer,
			viewport,
		}).render();
		window.dispatchEvent(
			new CustomEvent("readinglist:page-rendered", {
				detail: { page: number },
			}),
		);
		// Highlights are applied by the parent once a page's text becomes available.
		parent.postMessage(
			{ type: "readinglist:page-rendered", page: number },
			location.origin,
		);
	} catch {
		entry.rendered = false;
		entry.element.textContent = "Couldn't render this page.";
	}
}
function progressRatio() {
	const root = document.scrollingElement || document.documentElement;
	const max = root.scrollHeight - root.clientHeight;
	return max > 0 ? Math.max(0, Math.min(1, root.scrollTop / max)) : 0;
}
function postProgress() {
	if (progressTicking) return;
	progressTicking = true;
	requestAnimationFrame(() => {
		progressTicking = false;
		parent.postMessage(
			{ type: "reading-progress", kind: "pdf", ratio: progressRatio() },
			location.origin,
		);
	});
}
async function start() {
	const url = safeFileUrl(fileUrl);
	if (!url) {
		statusEl.textContent = "This PDF URL isn't supported.";
		return;
	}
	try {
		pdf = await getDocument({
			url,
			isEvalSupported: false,
			cMapUrl: "/static/vendor/cmaps/",
			cMapPacked: true,
			standardFontDataUrl: "/static/vendor/standard_fonts/",
			wasmUrl: "/static/vendor/wasm/",
		}).promise;
		statusEl.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`;
		const first = await pdf.getPage(1);
		const size = first.getViewport({ scale: 1 });
		const scale = Math.min(1.35, Math.max(240, innerWidth - 28) / size.width);
		// Size placeholders before rendering so restoring position is immediate and stable.
		for (let number = 1; number <= pdf.numPages; number++) {
			const element = document.createElement("div");
			element.className = "pdf-page";
			element.dataset.page = String(number);
			element.setAttribute("aria-label", `Page ${number}`);
			element.style.width = `${size.width * scale}px`;
			element.style.height = `${size.height * scale}px`;
			pages.set(number, { element, scale, rendered: false });
			containerEl.append(element);
		}
		const root = document.scrollingElement || document.documentElement;
		root.scrollTop = (root.scrollHeight - root.clientHeight) * initialProgress;
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const number = Number(entry.target.dataset.page);
					if (entry.isIntersecting)
						renderQueue = renderQueue.then(() => renderPage(number));
				}
			},
			{ rootMargin: "1000px 0px" },
		);
		for (const entry of pages.values()) observer.observe(entry.element);
		window.addEventListener("scroll", postProgress, { passive: true });
		window.addEventListener(
			"pagehide",
			() => {
				observer.disconnect();
				pdf.destroy();
			},
			{ once: true },
		);
	} catch {
		statusEl.textContent = "Couldn't load this PDF. Reopen it to try again.";
	}
}
void start();
