import { initCursor, initMagnets } from "./fx.js";

const root = document.documentElement;
const btn = document.getElementById("theme");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Muestra la dirección que no existe (como texto, nunca como HTML)
document.getElementById("nfPath").textContent = location.pathname + location.search;

// Modo diurno / nocturno, igual que el sitio
const label = () => {
  const dark = root.dataset.theme === "dark";
  btn.setAttribute("aria-label", dark ? "Cambiar a modo diurno" : "Cambiar a modo nocturno");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#050c20" : "#eaf0f8");
};
label();
btn.addEventListener("click", () => {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  const apply = () => { root.dataset.theme = next; try { localStorage.setItem("lamont-theme", next); } catch { /* sin almacenamiento */ } label(); };
  if (!document.startViewTransition || reduce) return apply();
  const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" }
  ));
});

// El logo que subas desde el panel también sale aquí
fetch("/api/data").then((r) => (r.ok ? r.json() : null)).then((doc) => {
  const logo = doc?.profile?.logo;
  if (logo && (logo.startsWith("/") || /^https?:\/\//i.test(logo)) && !logo.startsWith("//")) document.querySelectorAll(".js-logo").forEach((i) => { i.src = logo; });
}).catch(() => {});

initCursor();
initMagnets();
