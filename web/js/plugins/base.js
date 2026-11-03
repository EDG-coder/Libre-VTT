// ---------- Plugins: what the browser already had ----------
// Loaded before every other script of the table: the names on window at this moment belong to the
// browser, not to LIBRE VTT, so the registry (registry.js) does not offer them as hooks.
window.__LIBRE_BASE_GLOBALS = new Set(Object.getOwnPropertyNames(window));
