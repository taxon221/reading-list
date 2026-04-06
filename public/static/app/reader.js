import { dom, state } from "./shared.js";
import {
  clampProgressRatio,
  createSvgIcon,
  getAuthorizedItemUrl,
  getItemProgressInfo,
  isMobileViewport,
  shouldIgnoreKeyboardShortcut,
  withTimeout,
} from "./utils.js";
import { initReaderHighlights } from "./reader-highlights.js";
import { initReaderProgress } from "./reader-progress.js";

function destroyReaderResource(instance) {
  if (!instance || typeof instance.destroy !== "function") return;
  instance.destroy();
}

function revokeReaderBlobUrl() {
  if (!state.readerBlobUrl) return;
  URL.revokeObjectURL(state.readerBlobUrl);
  state.readerBlobUrl = null;
}

function lockBackgroundScroll() {
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

function unlockBackgroundScroll() {
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

function showReaderError(url, message) {
  if (!dom.readerContent) return;

  const wrapper = document.createElement("div");
  wrapper.className = "reader-error";

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
      { name: "line", attributes: { x1: "12", y1: "16", x2: "12.01", y2: "16" } },
    ],
  );

  const messageEl = document.createElement("p");
  messageEl.textContent = message;

  const linkWrap = document.createElement("p");
  const link = document.createElement("a");
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

function setReaderSidebarOpen(isOpen) {
  if (!dom.readerSidebar || !dom.readerToggleNotes) return;

  dom.readerSidebar.classList.toggle("hidden", !isOpen);
  dom.readerToggleNotes.classList.toggle("active", isOpen);
}

function openReaderOriginal() {
  const link = dom.readerOpenOriginal;
  const href = link?.href || link?.getAttribute?.("href");
  if (!href || href === "#") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function toggleReaderSidebar() {
  setReaderSidebarOpen(Boolean(dom.readerSidebar?.classList.contains("hidden")));
}

function resetEpubReader() {
  destroyReaderResource(state.currentEpubRendition);
  destroyReaderResource(state.currentEpubBook);
  state.currentEpubRendition = null;
  state.currentEpubBook = null;
}

function createReaderLoadingState() {
  const wrapper = document.createElement("div");
  wrapper.className = "reader-loading";

  const spinner = document.createElement("div");
  spinner.className = "reader-spinner";

  const label = document.createElement("p");
  label.textContent = "Loading content...";

  wrapper.append(spinner, label);
  return wrapper;
}

function createVideoIframe(src, allow = "") {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.allowFullscreen = true;
  if (allow) iframe.allow = allow;
  return iframe;
}

function createEpubShell() {
  const wrapper = document.createElement("div");
  wrapper.className = "ebook-reader";

  const toolbar = document.createElement("div");
  toolbar.className = "ebook-toolbar";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ebook-nav-btn";
  prevBtn.id = "ebook-prev";
  prevBtn.textContent = "Prev";

  const locationEl = document.createElement("span");
  locationEl.className = "ebook-location";
  locationEl.id = "ebook-location";
  locationEl.textContent = "Loading...";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ebook-nav-btn";
  nextBtn.id = "ebook-next";
  nextBtn.textContent = "Next";

  toolbar.append(prevBtn, locationEl, nextBtn);

  const stageWrapper = document.createElement("div");
  stageWrapper.className = "ebook-stage";

  const stage = document.createElement("div");
  stage.className = "ebook-stage-frame";
  stage.id = "ebook-stage";

  const prevZone = document.createElement("button");
  prevZone.type = "button";
  prevZone.className = "ebook-tap-zone left";
  prevZone.id = "ebook-zone-prev";
  prevZone.setAttribute("aria-label", "Previous page");

  const nextZone = document.createElement("button");
  nextZone.type = "button";
  nextZone.className = "ebook-tap-zone right";
  nextZone.id = "ebook-zone-next";
  nextZone.setAttribute("aria-label", "Next page");

  stageWrapper.append(stage, prevZone, nextZone);
  wrapper.append(toolbar, stageWrapper);

  return { wrapper, stage, locationEl, prevBtn, nextBtn, prevZone, nextZone };
}

function escapeReaderHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildParsedArticleDocument(data) {
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
      :root {
        color-scheme: ${isDark ? "dark" : "light"};
        --rl-reader-bg: ${background};
        --rl-reader-text: ${text};
        --rl-reader-muted: ${muted};
        --rl-reader-accent: ${accent};
        --rl-reader-rule: ${rule};
        --rl-reader-quote: ${quote};
      }
      html {
        scroll-behavior: smooth;
        background: var(--rl-reader-bg);
      }
      body {
        margin: 0 auto;
        padding: 96px 20px 120px;
        max-width: 44rem;
        background: var(--rl-reader-bg);
        color: var(--rl-reader-text);
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        font-size: 20px;
        line-height: 1.78;
        letter-spacing: 0.01em;
        -webkit-text-size-adjust: 100%;
      }
      .rl-reader-header {
        margin: 0 0 2.6rem;
        padding-bottom: 1.4rem;
        border-bottom: 1px solid var(--rl-reader-rule);
      }
      .rl-reader-header h1 {
        margin: 0 0 0.7rem;
        font-size: clamp(2rem, 4vw, 3.2rem);
        line-height: 1.03;
        letter-spacing: -0.02em;
      }
      .rl-byline,
      .rl-excerpt {
        margin: 0.35rem 0 0;
        color: var(--rl-reader-muted);
      }
      .rl-excerpt {
        font-size: 0.98em;
      }
      img, video, iframe {
        max-width: 100%;
        height: auto;
        border-radius: 18px;
      }
      figure {
        margin-inline: 0;
      }
      pre, code {
        white-space: pre-wrap;
        word-break: break-word;
      }
      a {
        color: var(--rl-reader-accent);
      }
      blockquote {
        margin-inline: 0;
        padding: 0.2rem 1rem;
        border-left: 3px solid var(--rl-reader-accent);
        background: var(--rl-reader-quote);
        border-radius: 0 14px 14px 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        display: block;
        overflow-x: auto;
      }
      hr {
        border: 0;
        border-top: 1px solid var(--rl-reader-rule);
        margin: 2rem 0;
      }
      span.reader-highlight {
        background: rgba(255, 190, 92, 0.35);
        border-radius: 0.25em;
        padding: 0.04em 0.02em;
      }
    </style>
    <script>
      window.__readingListSetTheme = function(theme) {
        if (!theme) return;
        const root = document.documentElement;
        root.style.colorScheme = theme.isDark ? "dark" : "light";
        root.style.setProperty("--rl-reader-bg", theme.background);
        root.style.setProperty("--rl-reader-text", theme.text);
        root.style.setProperty("--rl-reader-muted", theme.muted);
        root.style.setProperty("--rl-reader-accent", theme.accent);
        root.style.setProperty("--rl-reader-rule", theme.rule);
        root.style.setProperty("--rl-reader-quote", theme.quote);
      };
    </script>
  </head>
  <body>
    <header class="rl-reader-header">
      <h1>${title}</h1>
      ${byline ? `<p class="rl-byline">${byline}</p>` : ""}
      ${excerpt ? `<p class="rl-excerpt">${excerpt}</p>` : ""}
    </header>
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

function getReaderSourceUrl(itemUrl, type) {
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

function getSafeReaderFetchUrl(url, allowedPathPrefixes) {
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
    !Array.from(allowedPathPrefixes).some((prefix) =>
      parsedUrl.pathname === prefix || parsedUrl.pathname.startsWith(`${prefix}/`),
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

export function initReader(app) {
  const readerApi = {
    setReaderSidebarOpen,
    openReaderOriginal,
    toggleReaderSidebar,
  };
  Object.assign(readerApi, initReaderProgress());
  Object.assign(readerApi, initReaderHighlights(app, readerApi));

  function syncOpenArticleTheme() {
    const iframe = state.readerIframe;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document || null;
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

  function mountPdfReader(fileUrl, itemId) {
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

  async function openEpubReader(itemUrl) {
    const epubFactory = window.ePub;
    if (typeof epubFactory !== "function") {
      showReaderError(itemUrl, "EPUB reader failed to load.");
      return;
    }
    if (typeof window.JSZip !== "function") {
      showReaderError(itemUrl, "JSZip is not loaded. EPUB reading is unavailable.");
      return;
    }
    if (!dom.readerContent) return;

    const sourceUrl = getReaderSourceUrl(itemUrl, "epub");
    if (!sourceUrl) {
      showReaderError(itemUrl, "This EPUB URL is not supported.");
      return;
    }

    revokeReaderBlobUrl();
    const shell = createEpubShell();
    dom.readerContent.replaceChildren(shell.wrapper);
    const { stage, locationEl, prevBtn, nextBtn, prevZone, nextZone } = shell;

    const attachSelectionToCurrentChapter = () => {
      const iframe = stage.querySelector("iframe");
      if (!iframe) return;
      state.readerIframe = iframe;
      readerApi.setupIframeSelectionListener?.();
      readerApi.scheduleApplyHighlightsToDocument?.();
    };

    const setupMobileDoubleTapZones = (rendition) => {
      if (!isMobileViewport()) return;

      const makeHandler = (callback) => {
        let lastTapAt = 0;

        return (event) => {
          event.preventDefault();
          const now = Date.now();
          if (now - lastTapAt <= 320) {
            lastTapAt = 0;
            readerApi.hideSelectionPopup?.();
            callback();
            return;
          }
          lastTapAt = now;
        };
      };

      prevZone.addEventListener("touchend", makeHandler(() => rendition.prev()), {
        passive: false,
      });
      nextZone.addEventListener("touchend", makeHandler(() => rendition.next()), {
        passive: false,
      });
    };

    const updateEpubLocation = (location, book) => {
      const cfi = location?.start?.cfi || "";
      const directPercentage = location?.start?.percentage;

      if (typeof directPercentage === "number") {
        const ratio = clampProgressRatio(directPercentage);
        const label = `${Math.round(ratio * 100)}%`;
        locationEl.textContent = label;
        return { payload: { kind: "epub", cfi, percentage: ratio }, ratio, label };
      }

      const displayed = location?.start?.displayed;
      if (
        displayed &&
        typeof displayed.page === "number" &&
        typeof displayed.total === "number" &&
        displayed.total > 0
      ) {
        const ratio = clampProgressRatio(displayed.page / displayed.total);
        const label = `${displayed.page}/${displayed.total}`;
        locationEl.textContent = label;
        return {
          payload: {
            kind: "epub",
            cfi,
            page: displayed.page,
            total: displayed.total,
          },
          ratio,
          label,
        };
      }

      if (cfi) {
        try {
          const percentage = book.locations.percentageFromCfi(cfi);
          if (typeof percentage === "number" && !Number.isNaN(percentage)) {
            const ratio = clampProgressRatio(percentage);
            const label = `${Math.round(ratio * 100)}%`;
            locationEl.textContent = label;
            return {
              payload: { kind: "epub", cfi, percentage: ratio },
              ratio,
              label,
            };
          }
        } catch {}
      }

      locationEl.textContent = "";
      return {
        payload: cfi ? { kind: "epub", cfi } : { kind: "epub" },
        ratio: 0,
        label: "0%",
      };
    };

    try {
      const safeSourceUrl = getSafeReaderFetchUrl(
        sourceUrl,
        new Set(["/api/proxy/epub", "/api/uploads"]),
      );
      if (!safeSourceUrl) {
        throw new Error("This EPUB URL is not supported.");
      }

      const fileResponse = await withTimeout(
        fetch(safeSourceUrl),
        15000,
        "Timed out loading EPUB file.",
      );
      if (!fileResponse.ok) {
        throw new Error("Failed to load EPUB file.");
      }

      const fileBuffer = await withTimeout(
        fileResponse.arrayBuffer(),
        15000,
        "Timed out reading EPUB file.",
      );
      const header = new Uint8Array(fileBuffer.slice(0, 4));
      const isZip = header[0] === 0x50 && header[1] === 0x4b;
      if (!isZip) {
        throw new Error("The uploaded file is not a valid EPUB archive.");
      }

      const book = epubFactory(fileBuffer);
      const rendition = book.renderTo(stage, {
        width: "100%",
        height: "100%",
        spread: "none",
      });

      state.currentEpubBook = book;
      state.currentEpubRendition = rendition;

      prevBtn.addEventListener("click", () => rendition.prev());
      nextBtn.addEventListener("click", () => rendition.next());
      setupMobileDoubleTapZones(rendition);

      rendition.on("rendered", () => {
        setTimeout(attachSelectionToCurrentChapter, 30);
      });

      rendition.on("relocated", (location) => {
        const progress = updateEpubLocation(location, book);
        readerApi.setReaderProgress?.(true, progress.ratio, progress.label);
        readerApi.queueReaderProgressSave?.(progress.payload);
      });

      await withTimeout(book.ready, 12000, "EPUB parsing timed out.");
      await withTimeout(
        book.locations.generate(1000),
        12000,
        "EPUB progress indexing timed out.",
      ).catch(() => null);

      const savedProgress = readerApi.getCurrentItemReadingProgress(
        state.currentReaderId,
      );
      const savedCfi =
        savedProgress && savedProgress.kind === "epub" && savedProgress.cfi
          ? savedProgress.cfi
          : undefined;

      if (savedCfi) {
        await withTimeout(
          rendition.display(savedCfi),
          12000,
          "EPUB render timed out.",
        ).catch(() =>
          withTimeout(rendition.display(), 12000, "EPUB render timed out."),
        );
      } else {
        await withTimeout(rendition.display(), 12000, "EPUB render timed out.");
      }

      attachSelectionToCurrentChapter();
      const initialProgress = updateEpubLocation(
        rendition.currentLocation(),
        book,
      );
      readerApi.setReaderProgress?.(
        true,
        initialProgress.ratio,
        initialProgress.label,
      );
      readerApi.queueReaderProgressSave?.(initialProgress.payload);

      setTimeout(() => {
        if (!stage.querySelector("iframe")) {
          showReaderError(itemUrl, "Failed to render EPUB content.");
        }
      }, 1500);
    } catch (error) {
      resetEpubReader();
      showReaderError(
        itemUrl,
        error && typeof error.message === "string" && error.message
          ? error.message
          : "Failed to render EPUB. Make sure the file is valid.",
      );
    }
  }

  async function openReader(id, itemUrl, title, type) {
    resetEpubReader();
    readerApi.stopArticleProgressPoll?.();
    readerApi.stopMobileSelectionPoll?.();
    state.currentReaderId = id;
    state.readerIframe = null;
    state.currentHighlights = [];

    lockBackgroundScroll();
    if (dom.readerModal) dom.readerModal.style.display = "flex";
    if (dom.readerTitle) dom.readerTitle.textContent = title;
    if (dom.readerOpenOriginal) {
      dom.readerOpenOriginal.href = getAuthorizedItemUrl(itemUrl);
    }
    setReaderSidebarOpen(false);

    const currentItem = state.itemsById.get(Number(id));
    const itemProgress = getItemProgressInfo(currentItem);
    if (itemProgress) {
      readerApi.setReaderProgress?.(true, itemProgress.ratio, itemProgress.label);
    } else if (type !== "video" && type !== "podcast") {
      readerApi.setReaderProgress?.(true, 0, "0%");
    } else {
      readerApi.setReaderProgress?.(false);
    }

    await readerApi.loadHighlights?.(id);

    if (dom.readerContent) {
      dom.readerContent.replaceChildren(createReaderLoadingState());
    }

    if (type === "video") {
      const youtubeMatch = itemUrl.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/,
      );
      const vimeoMatch = itemUrl.match(/vimeo\.com\/(\d+)/);

      if (youtubeMatch && dom.readerContent) {
        dom.readerContent.replaceChildren(
          createVideoIframe(
            `https://www.youtube.com/embed/${youtubeMatch[1]}`,
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          ),
        );
        return;
      }
      if (vimeoMatch && dom.readerContent) {
        dom.readerContent.replaceChildren(
          createVideoIframe(`https://player.vimeo.com/video/${vimeoMatch[1]}`),
        );
        return;
      }
    }

    if (type === "pdf" || itemUrl.toLowerCase().endsWith(".pdf")) {
      const fileUrl = getReaderSourceUrl(itemUrl, "pdf");
      if (!fileUrl) {
        showReaderError(itemUrl, "This PDF URL is not supported.");
        return;
      }
      mountPdfReader(fileUrl, id);
      return;
    }

    if (type === "ebook" || /\.epub$/i.test(itemUrl)) {
      await openEpubReader(itemUrl);
      return;
    }

    const articleUrl = getReaderSourceUrl(itemUrl, "article");
    if (!articleUrl) {
      showReaderError(
        itemUrl,
        "This URL is not supported. Only local files and public http(s) URLs can be opened.",
      );
      return;
    }

    const safeArticleUrl = getSafeReaderFetchUrl(
      articleUrl,
      new Set(["/api/proxy"]),
    );
    if (!safeArticleUrl) {
      showReaderError(
        itemUrl,
        "This article URL is not supported.",
      );
      return;
    }

    const response = await fetch(safeArticleUrl).catch(() => null);
    if (!response) {
      showReaderError(
        itemUrl,
        "Failed to load content. The site may not allow embedding.",
      );
      return;
    }

    const data = await response.json();

    if (data.error) {
      showReaderError(itemUrl, data.message || "Failed to load content");
      return;
    }

    if (data.type === "html") {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-same-origin allow-popups";
      if (!dom.readerContent) return;

      revokeReaderBlobUrl();
      dom.readerContent.replaceChildren(iframe);
      state.readerIframe = iframe;

      const articleDocument =
        typeof data.byline === "string" || typeof data.excerpt === "string"
          ? buildParsedArticleDocument(data)
          : data.content;

      state.readerBlobUrl = URL.createObjectURL(
        new Blob([articleDocument], { type: "text/html" }),
      );
      iframe.src = state.readerBlobUrl;

      iframe.onload = () => {
        revokeReaderBlobUrl();
        syncOpenArticleTheme();
        readerApi.scheduleApplyHighlightsToDocument?.();
        readerApi.setupIframeSelectionListener?.();
        readerApi.setupArticleProgressTracking?.(itemUrl);
      };

      setTimeout(() => {
        syncOpenArticleTheme();
        readerApi.scheduleApplyHighlightsToDocument?.();
        readerApi.setupIframeSelectionListener?.();
        readerApi.setupArticleProgressTracking?.(itemUrl);
      }, 100);
      return;
    }

    if (data.type === "pdf") {
      const fileUrl = getReaderSourceUrl(data.url, "pdf");
      if (!fileUrl) {
        showReaderError(itemUrl, "This PDF URL is not supported.");
        return;
      }
      mountPdfReader(fileUrl, id);
      return;
    }

    showReaderError(
      itemUrl,
      `This content type (${data.contentType || "unknown"}) cannot be displayed inline.`,
    );
  }

  function closeReader() {
    resetEpubReader();
    revokeReaderBlobUrl();
    readerApi.stopArticleProgressPoll?.();
    readerApi.stopMobileSelectionPoll?.();
    setReaderSidebarOpen(false);
    readerApi.setReaderProgress?.(false);
    readerApi.flushPendingProgressSave?.();

    if (dom.readerModal) dom.readerModal.style.display = "none";
    if (dom.readerContent) dom.readerContent.replaceChildren();
    state.currentReaderId = null;
    state.readerIframe = null;
    state.currentHighlights = [];
    state.pendingScrollHighlightId = null;
    readerApi.hideSelectionPopup?.();
    readerApi.closeNoteModal?.();
    unlockBackgroundScroll();
    app.loadItems?.();
  }

  Object.assign(readerApi, {
    closeReader,
    openReader,
    setReaderSidebarOpen,
  });

  app.openReader = openReader;
  app.loadAllHighlights = readerApi.loadAllHighlights;

  dom.readerClose?.addEventListener("click", closeReader);
  dom.readerToggleNotes?.addEventListener("click", () => {
    setReaderSidebarOpen(dom.readerSidebar?.classList.contains("hidden"));
  });

  document.addEventListener("keydown", (event) => {
    const readerOpen = dom.readerModal && dom.readerModal.style.display !== "none";

    if (readerOpen && !shouldIgnoreKeyboardShortcut(event)) {
      const k = event.key.toLowerCase();
      if (k === "o") {
        event.preventDefault();
        openReaderOriginal();
        return;
      }
      if (k === "h") {
        event.preventDefault();
        toggleReaderSidebar();
        return;
      }
    }

    if (event.key !== "Escape") return;

    if (dom.noteModal && dom.noteModal.style.display !== "none") {
      readerApi.closeNoteModal?.();
    } else if (readerOpen) {
      closeReader();
    } else if (dom.editModal && dom.editModal.style.display !== "none") {
      app.closeEditModal?.();
    }

    app.closeItemMenu?.();
    readerApi.hideSelectionPopup?.();
  });

  document.addEventListener("readinglist:themechange", syncOpenArticleTheme);
}
