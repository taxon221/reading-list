import { dom } from "./shared.js";

const THEME_STORAGE_KEY = "theme";
const THEME_MODES = ["system", "dark", "light"];

let systemThemeQuery = null;

function normalizeThemeMode(value) {
	if (value === "dark" || value === "light" || value === "system") {
		return value;
	}
	return "system";
}

function resolveThemeMode(mode) {
	const normalizedMode = normalizeThemeMode(mode);
	if (normalizedMode !== "system") return normalizedMode;
	return systemThemeQuery?.matches ? "dark" : "light";
}

function updateThemeColorMeta(resolvedMode) {
	const themeColor = document.querySelector('meta[name="theme-color"]');
	if (!themeColor) return;
	themeColor.setAttribute(
		"content",
		resolvedMode === "dark" ? "#111111" : "#eef1f4",
	);
}

function syncThemeControls(mode, resolvedMode) {
	[dom.themeToggle, dom.readerThemeToggle].forEach((control) => {
		if (!control) return;
		control.dataset.themeMode = mode;
		control.dataset.resolvedTheme = resolvedMode;
		const label =
			mode === "system"
				? `Theme: Device (${resolvedMode})`
				: `Theme: ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
		control.title = label;
		control.setAttribute("aria-label", label);
	});
}

function dispatchThemeChange(mode, resolvedMode) {
	const isDark = resolvedMode === "dark";
	document.documentElement.style.colorScheme = isDark ? "dark" : "light";
	updateThemeColorMeta(resolvedMode);
	document.dispatchEvent(
		new CustomEvent("readinglist:themechange", {
			detail: { mode, resolvedMode, isDark },
		}),
	);
}

function applyTheme(mode) {
	const root = document.documentElement;
	const normalizedMode = normalizeThemeMode(mode);
	const resolvedMode = resolveThemeMode(normalizedMode);
	const isDark = resolvedMode === "dark";
	root.dataset.themeMode = normalizedMode;
	root.dataset.resolvedTheme = resolvedMode;
	root.classList.toggle("dark", isDark);
	syncThemeControls(normalizedMode, resolvedMode);
	dispatchThemeChange(normalizedMode, resolvedMode);
}

function cycleThemeMode() {
	const root = document.documentElement;
	root.classList.add("theme-switching");
	const currentMode = normalizeThemeMode(
		localStorage.getItem(THEME_STORAGE_KEY),
	);
	const currentIndex = THEME_MODES.indexOf(currentMode);
	const nextMode = THEME_MODES[(currentIndex + 1) % THEME_MODES.length];
	localStorage.setItem(THEME_STORAGE_KEY, nextMode);
	applyTheme(nextMode);

	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.classList.remove("theme-switching");
		});
	});
}

export function initTheme() {
	systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	applyTheme(normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY)));

	const handleSystemThemeChange = () => {
		if (
			normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY)) !== "system"
		)
			return;
		applyTheme("system");
	};

	if (typeof systemThemeQuery.addEventListener === "function") {
		systemThemeQuery.addEventListener("change", handleSystemThemeChange);
	} else if (typeof systemThemeQuery.addListener === "function") {
		systemThemeQuery.addListener(handleSystemThemeChange);
	}

	dom.themeToggle?.addEventListener("click", cycleThemeMode);
	dom.readerThemeToggle?.addEventListener("click", cycleThemeMode);
}
