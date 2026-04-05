import { dom } from "./shared.js";

let systemThemeQuery = null;

function dispatchThemeChange(isDark) {
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  document.dispatchEvent(
    new CustomEvent("readinglist:themechange", {
      detail: { isDark },
    }),
  );
}

function applyTheme(mode) {
  const root = document.documentElement;
  const resolvedMode =
    mode === "system"
      ? systemThemeQuery?.matches
        ? "dark"
        : "light"
      : mode;
  const isDark = resolvedMode === "dark";
  root.classList.toggle("dark", isDark);
  dispatchThemeChange(isDark);
}

function toggleThemeMode() {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  const nextMode = root.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem("theme", nextMode);
  applyTheme(nextMode);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function initTheme() {
  const storedTheme = localStorage.getItem("theme");
  systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : "system");

  const handleSystemThemeChange = () => {
    const override = localStorage.getItem("theme");
    if (override === "dark" || override === "light") return;
    applyTheme("system");
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(handleSystemThemeChange);
  }

  dom.themeToggle?.addEventListener("click", toggleThemeMode);
  dom.readerThemeToggle?.addEventListener("click", toggleThemeMode);
}
