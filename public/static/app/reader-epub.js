import {
	createEpubShell,
	getReaderSourceUrl,
	getSafeReaderFetchUrl,
	resetEpubReader,
	revokeReaderBlobUrl,
	showReaderError,
} from "./reader-display.js";
import { dom, state } from "./shared.js";
import { clampProgressRatio, isMobileViewport, withTimeout } from "./utils.js";

export async function openEpubReader(itemUrl, readerApi) {
	const epubFactory = window.ePub;
	if (typeof epubFactory !== "function") {
		showReaderError(itemUrl, "EPUB reader failed to load.");
		return;
	}
	if (typeof window.JSZip !== "function") {
		showReaderError(
			itemUrl,
			"JSZip is not loaded. EPUB reading is unavailable.",
		);
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

		prevZone.addEventListener(
			"touchend",
			makeHandler(() => rendition.prev()),
			{
				passive: false,
			},
		);
		nextZone.addEventListener(
			"touchend",
			makeHandler(() => rendition.next()),
			{
				passive: false,
			},
		);
	};

	const updateEpubLocation = (location, book) => {
		const cfi = location?.start?.cfi || "";
		const directPercentage = location?.start?.percentage;

		if (typeof directPercentage === "number") {
			const ratio = clampProgressRatio(directPercentage);
			const label = `${Math.round(ratio * 100)}%`;
			locationEl.textContent = label;
			return {
				payload: { kind: "epub", cfi, percentage: ratio },
				ratio,
				label,
			};
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
