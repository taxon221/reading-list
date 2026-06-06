import { dom } from "./shared.js";

const FONT_SIZE_STORAGE_KEY = "reader-font-size";
const FONT_SIZE_MIN = 16;
const FONT_SIZE_MAX = 28;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_DEFAULT = 20;

function clampFontSize(value) {
	return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
}

export function getReaderFontSize() {
	const stored = Number(localStorage.getItem(FONT_SIZE_STORAGE_KEY));
	if (Number.isFinite(stored) && stored >= FONT_SIZE_MIN && stored <= FONT_SIZE_MAX) {
		return stored;
	}
	return FONT_SIZE_DEFAULT;
}

function setReaderFontSize(size) {
	const nextSize = clampFontSize(size);
	localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(nextSize));
	document.documentElement.style.setProperty(
		"--reader-font-size",
		`${nextSize}px`,
	);
	syncFontControls(nextSize);
	document.dispatchEvent(
		new CustomEvent("readinglist:fontsizechange", {
			detail: { size: nextSize },
		}),
	);
}

function syncFontControls(size) {
	const canDecrease = size > FONT_SIZE_MIN;
	const canIncrease = size < FONT_SIZE_MAX;
	if (dom.readerFontDecrease) dom.readerFontDecrease.disabled = !canDecrease;
	if (dom.readerFontIncrease) dom.readerFontIncrease.disabled = !canIncrease;
	if (dom.readerFontLabel) dom.readerFontLabel.textContent = `${size}px`;
}

export function initReaderFont() {
	const initialSize = getReaderFontSize();
	document.documentElement.style.setProperty(
		"--reader-font-size",
		`${initialSize}px`,
	);
	syncFontControls(initialSize);

	dom.readerFontDecrease?.addEventListener("click", () => {
		setReaderFontSize(getReaderFontSize() - FONT_SIZE_STEP);
	});
	dom.readerFontIncrease?.addEventListener("click", () => {
		setReaderFontSize(getReaderFontSize() + FONT_SIZE_STEP);
	});
}
