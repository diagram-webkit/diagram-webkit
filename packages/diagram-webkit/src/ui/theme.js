// Light/dark theme. The theme is data-theme on the container root;
// the choice is stored under `${namespace}-theme` when persistence is on.

export const THEME_DARK = "dark";
export const THEME_LIGHT = "light";
const STORAGE_KEY = "theme";

/** @param {import("../dom/context").Context & Record<string, any>} ctx */
export function createTheme(ctx) {
  const buttons = new Set();

  function getInitialTheme() {
    if (ctx.s.theme === THEME_DARK || ctx.s.theme === THEME_LIGHT) return ctx.s.theme;
    const saved = ctx.storage.get(STORAGE_KEY);
    if (saved === THEME_DARK || saved === THEME_LIGHT) return saved;
    // Dark theme is not the default even when the system prefers it.
    return THEME_LIGHT;
  }

  let currentTheme = getInitialTheme();

  function renderButton(button) {
    const isDark = currentTheme === THEME_DARK;
    button.classList.toggle("active", isDark);
    const label = button.querySelector(".theme-label");
    if (label) label.textContent = isDark ? ctx.texts.themeLight : ctx.texts.themeDark;
    button.setAttribute("aria-pressed", isDark ? "true" : "false");
    const action = isDark ? ctx.texts.themeToLight : ctx.texts.themeToDark;
    button.setAttribute("aria-label", action);
    button.setAttribute("title", action);
  }

  function applyTheme(theme, { persist = false } = {}) {
    currentTheme = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
    ctx.root.dataset.theme = currentTheme;
    if (persist) ctx.storage.set(STORAGE_KEY, currentTheme);
    buttons.forEach(renderButton);
    ctx.notifyStateChange();
  }

  function toggleTheme() {
    applyTheme(currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK, { persist: true });
    return currentTheme;
  }

  function bindToggleButton(button) {
    buttons.add(button);
    renderButton(button);
    button.addEventListener("click", toggleTheme, { signal: ctx.signal });
  }

  ctx.root.dataset.theme = currentTheme;

  return { getCurrentTheme: () => currentTheme, applyTheme, toggleTheme, bindToggleButton };
}
