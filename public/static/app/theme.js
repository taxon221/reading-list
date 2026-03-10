import { dom } from "./shared.js";

function toggleThemeMode() {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  const isDark = root.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function initTheme() {
  const storedTheme = localStorage.getItem("theme");

  if (
    storedTheme === "dark" ||
    (!storedTheme &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }

  dom.themeToggle?.addEventListener("click", toggleThemeMode);
  dom.readerThemeToggle?.addEventListener("click", toggleThemeMode);
}
