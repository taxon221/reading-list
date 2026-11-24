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
	releaseObserver,
	destroyed = false,
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
function releasePage(entry) {
	entry.gen += 1;
	entry.rendered = false;
	entry.task?.cancel();
	entry.task = null;
	entry.textLayer?.cancel();
	entry.textLayer = null;
	for (const canvas of entry.element.querySelectorAll("canvas"))
		canvas.width = canvas.height = 0;
	entry.element.replaceChildren();
}
async function renderPage(number) {
	const entry = pages.get(number);
	// Skip pages scrolled past while queued, so the visible page renders next.
	if (!entry || entry.rendered || !entry.near || destroyed) return;
	const gen = ++entry.gen;
	const isCancelled = () => destroyed || gen !== entry.gen || !entry.near;
	entry.rendered = true;
	let canvas = null;
	try {
		const page = await pdf.getPage(number);
		if (isCancelled()) return;
		const viewport = page.getViewport({ scale: entry.scale });
		const previousHeight = entry.element.getBoundingClientRect().height;
		const above = entry.element.getBoundingClientRect().bottom < 0;
		entry.element.style.width = `${viewport.width}px`;
		entry.element.style.height = `${viewport.height}px`;
		if (above) window.scrollBy(0, viewport.height - previousHeight);
		canvas = document.createElement("canvas");
		canvas.className = "pdf-canvas";
		const ratio = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.floor(viewport.width * ratio);
		canvas.height = Math.floor(viewport.height * ratio);
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;
		const textLayerEl = document.createElement("div");
		textLayerEl.className = "textLayer";
		entry.element.style.setProperty("--scale-factor", String(entry.scale));
		entry.element.style.setProperty(
			"--total-scale-factor",
			String(entry.scale),
		);
		entry.element.replaceChildren(canvas, textLayerEl);
		const renderTask = page.render({
			canvasContext: canvas.getContext("2d"),
			viewport,
			transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
		});
		entry.task = renderTask;
		await renderTask.promise;
		entry.task = null;
		if (isCancelled()) {
			canvas.width = canvas.height = 0;
			return;
		}
		const textLayer = new TextLayer({
			textContentSource: page.streamTextContent(),
			container: textLayerEl,
			viewport,
		});
		entry.textLayer = textLayer;
		await textLayer.render();
		entry.textLayer = null;
		if (isCancelled()) {
			canvas.width = canvas.height = 0;
			return;
		}
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
	} catch (error) {
		if (gen === entry.gen) {
			entry.task = null;
			entry.textLayer = null;
		}
		if (
			isCancelled() ||
			error?.name === "RenderingCancelledException" ||
			error?.name === "AbortException"
		) {
			if (canvas) canvas.width = canvas.height = 0;
			if (gen === entry.gen) entry.rendered = false;
			return;
		}
		entry.rendered = false;
		entry.element.textContent = "Couldn't render this page.";
	}
}
function progressRatio() {
	const root = document.scrollingElement || document.documentElement;
	const max = root.scrollHeight - root.clientHeight;
	return max > 0 ? Math.max(0, Math.min(1, root.scrollTop / max)) : 0;
}
function showCurrentPage() {
	const page = document
		.elementFromPoint(innerWidth / 2, innerHeight / 2)
		?.closest(".pdf-page");
	if (page)
		statusEl.textContent = `Page ${page.dataset.page} of ${pdf.numPages}`;
}
function postProgress() {
	if (progressTicking) return;
	progressTicking = true;
	requestAnimationFrame(() => {
		progressTicking = false;
		showCurrentPage();
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
			pages.set(number, {
				element,
				scale,
				rendered: false,
				near: false,
				gen: 0,
				task: null,
				textLayer: null,
			});
			containerEl.append(element);
		}
		const root = document.scrollingElement || document.documentElement;
		root.scrollTop = (root.scrollHeight - root.clientHeight) * initialProgress;
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const number = Number(entry.target.dataset.page);
					pages.get(number).near = entry.isIntersecting;
					if (entry.isIntersecting)
						renderQueue = renderQueue.then(() => renderPage(number));
				}
			},
			{ rootMargin: "1000px 0px" },
		);
		// Canvases take several MB each; free pages far from view. The placeholder
		// keeps its size, and highlights are reapplied when the page renders again.
		releaseObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const page = pages.get(Number(entry.target.dataset.page));
					if (
						entry.isIntersecting ||
						(!page.rendered && !page.task && !page.textLayer)
					)
						continue;
					releasePage(page);
				}
			},
			{ rootMargin: "4000px 0px" },
		);
		for (const entry of pages.values()) {
			observer.observe(entry.element);
			releaseObserver.observe(entry.element);
		}
		showCurrentPage();
		window.addEventListener("scroll", postProgress, { passive: true });
		window.addEventListener(
			"pagehide",
			() => {
				destroyed = true;
				observer.disconnect();
				releaseObserver.disconnect();
				for (const page of pages.values()) {
					page.gen += 1;
					page.task?.cancel();
					page.textLayer?.cancel();
				}
				pdf.destroy();
			},
			{ once: true },
		);
	} catch {
		statusEl.textContent = "Couldn't load this PDF. Reopen it to try again.";
	}
}
void start();
