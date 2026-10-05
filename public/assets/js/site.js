import { initCursor, initMagnets, initHero, initTicker, setCursorEnabled } from "./fx.js";
import { esc, safeUrl, icon, SOCIALS, socialUrl, loadSite, normalize, parseMedia, coverOf, analyze, monthSummary, monthLong, monthName, monthsBetween, cap, DELIVERABLES } from "./common.js";

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let site;

boot();

async function boot() {
  site = normalize(await loadSite());
  renderHero();
  renderRoles();
  renderWork();
  renderJourney();
  renderServices();
  renderClients();
  renderContact();
  initChrome();
  watchReveals();
  initHero();
  initCursor();
  initMagnets();
  const hash = location.hash.match(/^#trabajo-(.+)$/);
  if (hash) openProject(hash[1]);
}

/* ---------- Portada ---------- */
function renderHero() {
  const p = site.profile;
  $("#heroTitle").textContent = p.tagline || "";
  $("#heroIntro").textContent = p.intro || "";
  $("#heroWho").textContent = p.name || "Lamont";
  const photo = safeUrl(p.photo);
  if (photo) $("#heroPhoto").src = photo;
  const logo = safeUrl(p.logo);
  if (logo) document.querySelectorAll(".js-logo").forEach((img) => { img.src = logo; });
  const years = Number(p.years) || 0;
  $("#badge").hidden = !years;
  $("#badgeNum").textContent = `+${years}`;
  $("#footName").textContent = `${p.name || "Lamont"} · ${new Date().getFullYear()}`;
  const alias = p.alias || "Lamont";
  document.title = `${alias} — ${p.roles?.slice(0, 3).join(", ") || "Portafolio"}`;
  $('meta[name="description"]')?.setAttribute("content", `Portafolio de ${p.name} (${alias}). ${p.intro || ""}`.trim());
}

function renderRoles() {
  const roles = site.profile.roles.filter(Boolean);
  const host = $("#roles");
  if (!roles.length) return host.parentElement.remove();
  // se espera a la tipografía para medir bien el ancho del bucle
  (document.fonts?.ready ?? Promise.resolve()).then(() => initTicker(host, $("#rolesTrack"), roles.map(esc)));
}

/* ---------- Trabajos ---------- */
let filter = "all";
const catName = (id) => site.categories.find((c) => c.id === id)?.name || "";
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const RATIOS = ["1 / 1", "5 / 4", "4 / 5", "1 / 1", "4 / 5"];

function visibleProjects() {
  return site.projects
    .filter((p) => p.visible !== false)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || String(b.date).localeCompare(String(a.date)));
}

function renderWork() {
  const all = visibleProjects();
  const used = site.categories.filter((c) => all.some((p) => p.category === c.id));
  const filters = $("#filters");
  if (all.length > 1 && used.length > 1) {
    filters.innerHTML = [{ id: "all", name: "Todo", n: all.length }, ...used.map((c) => ({ ...c, n: all.filter((p) => p.category === c.id).length }))]
      .map((c) => `<button class="pill" role="tab" data-cat="${esc(c.id)}" aria-selected="${c.id === filter}">${esc(c.name)} <small>${c.n}</small></button>`).join("");
    filters.onclick = (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn || btn.dataset.cat === filter) return;
      filter = btn.dataset.cat;
      filters.querySelectorAll(".pill").forEach((b) => b.setAttribute("aria-selected", b === btn));
      const work = $("#work");
      work.querySelectorAll(".card").forEach((c) => c.classList.add("is-out"));
      setTimeout(() => paintCards(), reduceMotion ? 0 : 220);
    };
  } else filters.innerHTML = "";
  paintCards();
}

function paintCards() {
  const work = $("#work");
  const list = visibleProjects().filter((p) => filter === "all" || p.category === filter);
  if (!list.length) {
    work.innerHTML = `<div class="empty"><strong>Aquí van mis trabajos</strong>Todavía no hay proyectos publicados. Agrégalos desde el panel de administración.</div>`;
    return;
  }
  work.innerHTML = list.map((p, i) => cardHTML(p, i)).join("");
  work.querySelectorAll(".card").forEach((card, i) => {
    card.style.setProperty("--d", `${Math.min(i, 8) * 55}ms`);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("in")));
    card.addEventListener("click", () => openProject(card.dataset.id));
    if (matchMedia("(hover: hover)").matches && !reduceMotion) {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 5}deg`);
        card.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 5}deg`);
      });
      card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    }
  });
}

function coverHTML(p) {
  const cover = coverOf(p);
  if (cover?.kind === "image") return `<img src="${esc(cover.src)}" alt="" loading="lazy" decoding="async">`;
  if (cover?.kind === "video") return `<video src="${esc(cover.src)}" muted loop playsinline preload="metadata" data-hover-play></video>`;
  const v = hash(p.title || "x") % 4;
  const ico = { video: "film-strip", diseno: "paint-brush", social: "megaphone", youtube: "monitor-play", comunidad: "chats-circle", estrategia: "target", direccion: "sparkle" }[p.category] || "sparkle";
  return `<div class="gen gen--${v}"><b>${esc((p.title || "?").trim()[0]?.toUpperCase() || "?")}</b>${icon(ico)}</div>`;
}

function cardHTML(p, i) {
  const hasVideo = (p.media || []).some((m) => ["embed", "video"].includes(parseMedia(m.url)?.type));
  const ratio = p.featured ? "4 / 5" : RATIOS[(hash(p.id || p.title) + i) % RATIOS.length];
  return `<button class="card" data-id="${esc(p.id)}" style="--ar:${ratio}" aria-label="Abrir ${esc(p.title)}">
    <div class="card__cover">${coverHTML(p)}</div>
    <div class="card__scrim"></div>
    <div class="card__top"><span class="card__tag">${esc(catName(p.category) || "Proyecto")}</span>${p.demo ? `<span class="card__demo">Ejemplo</span>` : hasVideo ? `<span class="card__play">${icon("play-fill")}</span>` : ""}</div>
    <div class="card__info"><h3 class="card__title">${esc(p.title)}</h3><span class="card__meta">${esc([p.client, p.date && cap(monthLong(p.date))].filter(Boolean).join(" · "))}</span></div>
    <span class="card__go">${icon("arrow-up-right")}</span>
  </button>`;
}

document.addEventListener("pointerover", (e) => {
  const v = e.target.closest?.("[data-hover-play]");
  if (v) v.play?.().catch(() => {});
});
document.addEventListener("pointerout", (e) => {
  const v = e.target.closest?.("[data-hover-play]");
  if (v) v.pause?.();
});

/* ---------- Visor ---------- */
const viewer = $("#viewer");
let items = [], idx = 0, current;

function openProject(id) {
  current = site.projects.find((p) => p.id === id);
  if (!current) return;
  items = (current.media || []).map((m) => ({ ...parseMedia(m.url), caption: m.caption })).filter((m) => m.src);
  idx = 0;
  paintViewer();
  if (!viewer.open) { viewer.showModal(); setCursorEnabled(false); }
  history.replaceState(null, "", `#trabajo-${id}`);
}

function stageHTML(m) {
  if (!m) return `<div style="width:100%;aspect-ratio:4/3;max-height:60dvh">${coverHTML(current)}</div>`;
  if (m.type === "image") return `<img src="${esc(m.src)}" alt="${esc(m.caption || current.title)}">`;
  if (m.type === "video") return `<video src="${esc(m.src)}" controls playsinline autoplay muted loop></video>`;
  if (m.type === "embed") return `<iframe class="${m.vertical ? "vertical" : ""}" src="${esc(m.src)}" title="${esc(current.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  return `<a class="btn btn--accent" href="${esc(m.src)}" target="_blank" rel="noopener">Abrir enlace ${icon("arrow-up-right")}</a>`;
}

function paintViewer() {
  const p = current;
  const thumbs = items.length > 1
    ? `<div class="viewer__thumbs">${items.map((m, i) => `<button data-i="${i}" aria-label="Medio ${i + 1}" aria-current="${i === idx}">${m.type === "image" || m.thumb ? `<img src="${esc(m.thumb || m.src)}" alt="" loading="lazy">` : icon(m.type === "link" ? "link" : "play-fill")}</button>`).join("")}</div>`
    : "<div></div>";
  const link = safeUrl(p.link);
  $("#viewerBody").innerHTML = `
    <div class="viewer__media"><div class="viewer__stage">${stageHTML(items[idx])}</div>${thumbs}</div>
    <div class="viewer__info">
      <span class="chip" style="align-self:start">${esc(catName(p.category) || "Proyecto")}</span>
      <h3>${esc(p.title)}</h3>
      <div class="viewer__meta">${esc([p.client, p.date && cap(monthLong(p.date))].filter(Boolean).join(" · "))}</div>
      ${p.description ? `<p>${esc(p.description)}</p>` : ""}
      ${(p.tags || []).length ? `<div class="tags">${p.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${link ? `<a class="btn btn--ghost" href="${esc(link)}" target="_blank" rel="noopener">Ver publicación ${icon("arrow-up-right")}</a>` : ""}
    </div>`;
  $("#viewerBody").querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => { idx = Number(b.dataset.i); paintViewer(); }));
}

$("#viewerClose").addEventListener("click", () => viewer.close());
viewer.addEventListener("click", (e) => { if (e.target === viewer) viewer.close(); });
viewer.addEventListener("close", () => { setCursorEnabled(true); $("#viewerBody").innerHTML = ""; history.replaceState(null, "", location.pathname + location.search); });
viewer.addEventListener("keydown", (e) => {
  if (items.length < 2) return;
  if (e.key === "ArrowRight") { idx = (idx + 1) % items.length; paintViewer(); }
  if (e.key === "ArrowLeft") { idx = (idx - 1 + items.length) % items.length; paintViewer(); }
});

/* ---------- Trayectoria ---------- */
function renderJourney() {
  const section = $("#trayectoria");
  const a = analyze(site);
  if (a.empty) {
    section.hidden = true;
    document.querySelector('.nav__links a[href="#trayectoria"]')?.remove();
    return;
  }

  const years = Number(site.profile.years) || 0;
  const stats = [
    years ? [years, "años creando contenido", "+"] : [a.projects, "proyectos publicados", ""],
    [a.clients, "clientes", ""],
    [a.activeMonths, a.activeMonths === 1 ? "mes activo en el registro" : "meses activos en el registro", ""],
    a.deliveredTotal > 0 ? [a.deliveredTotal, "entregas registradas", ""] : [a.projects, "proyectos publicados", ""],
  ];
  $("#stats").innerHTML = stats.map(([n, label, prefix]) => `<div class="stat"><b data-count="${n}" data-prefix="${prefix}">${prefix}${n}</b><span>${esc(label)}</span></div>`).join("");

  $("#read").innerHTML =
    a.narrative.map((t) => `<p>${esc(t)}</p>`).join("") +
    `<div class="chips">${a.highlights.map((h) => `<span class="chip">${esc(h.label)}: <b>${esc(h.value)}</b></span>`).join("")}</div>`;

  // Barras: últimos 12 meses del registro (los vacíos también cuentan)
  const end = a.last;
  const [ey, em] = end.split("-").map(Number);
  const start = new Date(Date.UTC(ey, em - 12, 1)).toISOString().slice(0, 7);
  const range = monthsBetween(start < a.first ? a.first : start, end);
  const byId = new Map(a.months.map((m) => [m.id, m]));
  const max = Math.max(1, ...range.map((id) => byId.get(id)?.activity || 0));
  $("#chart").innerHTML = `<h4>Actividad por mes</h4>
    <div class="bars" role="img" aria-label="Actividad mensual entre ${esc(monthLong(range[0]))} y ${esc(monthLong(end))}">
      ${range.map((id) => {
        const n = byId.get(id)?.activity || 0;
        return `<div class="bar ${n === max ? "peak" : ""}" tabindex="0"><span class="tip">${esc(cap(monthLong(id)))}: ${n}</span><i style="--h:${(n / max) * 100}%"></i><em>${esc(monthName(id).slice(0, 3))}</em></div>`;
      }).join("")}
    </div>
    <p class="sr-only">Actividad = proyectos publicados + entregas registradas en el mes.</p>`;

  const topMax = Math.max(1, ...a.topClients.map((c) => c.months + c.projects));
  const top = a.topClients.filter((c) => c.months + c.projects > 0).slice(0, 5);
  $("#topClients").innerHTML = top.length
    ? `<h4>Clientes más constantes</h4><ul class="rank">${top.map((c) => `<li><span>${esc(c.name)}</span><span>${c.months} ${c.months === 1 ? "mes" : "meses"}</span><i style="--w:${((c.months + c.projects) / topMax) * 100}%"></i></li>`).join("")}</ul>`
    : "";

  renderLog(a);
  countUp();
}

function renderLog(a) {
  const years = [...new Set(a.months.map((m) => m.id.slice(0, 4)))].sort().reverse();
  let year = years[0];
  const yearsEl = $("#years");
  const paint = () => {
    yearsEl.innerHTML = years.length > 1 ? years.map((y) => `<button class="pill" role="tab" data-y="${y}" aria-selected="${y === year}">${y}</button>`).join("") : "";
    const list = a.months.filter((m) => m.id.startsWith(year)).reverse();
    $("#logList").innerHTML = list.map((m, i) => {
      const nums = DELIVERABLES.filter(([k]) => m.deliverables[k] > 0).map(([k, label]) => `<span><b>${m.deliverables[k]}</b>${esc(label)}</span>`).join("");
      const text = m.summary || monthSummary(m);
      const total = m.deliverableTotal || m.projects.length;
      return `<details class="month" ${i === 0 ? "open" : ""}>
        <summary><span class="month__name">${esc(cap(monthName(m.id)))}</span>
          <span class="month__clients">${m.clientList.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</span>
          <span class="month__count">${total ? `${total} ${m.deliverableTotal ? "entregas" : total === 1 ? "proyecto" : "proyectos"}` : ""}</span>
          <span class="month__caret">${icon("caret-down")}</span></summary>
        <div class="month__body">${text ? `<p>${esc(text)}</p>` : ""}${nums ? `<div class="month__nums">${nums}</div>` : ""}
          ${m.wins ? `<p class="month__win">${esc(m.wins)}</p>` : ""}
          ${m.projects.length ? `<div class="tags">${m.projects.map((p) => `<button class="chip" data-open="${esc(p.id)}" style="cursor:pointer;background:rgba(255,255,255,.08);border-color:transparent;color:inherit">${esc(p.title)} ${icon("arrow-up-right")}</button>`).join("")}</div>` : ""}
        </div></details>`;
    }).join("");
  };
  yearsEl.onclick = (e) => { const b = e.target.closest("[data-y]"); if (b) { year = b.dataset.y; paint(); } };
  $("#logList").onclick = (e) => { const b = e.target.closest("[data-open]"); if (b) openProject(b.dataset.open); };
  paint();
}

function countUp() {
  const els = document.querySelectorAll("[data-count]");
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const end = Number(en.target.dataset.count), t0 = performance.now(), dur = 1100;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      en.target.textContent = (en.target.dataset.prefix || "") + Math.round(end * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(tick);
    };
    en.target.textContent = (en.target.dataset.prefix || "") + "0";
    requestAnimationFrame(tick);
  }), { threshold: 0.6 });
  els.forEach((el) => io.observe(el));
}

/* ---------- Servicios (bento sin huecos) ---------- */
function spansFor(n) {
  const rows = [[2, 1, 1], [1, 1, 2], [1, 2, 1], [2, 2]];
  const out = [];
  let r = 0;
  while (out.length < n) {
    const left = n - out.length;
    const row = left >= 4 ? rows[r++ % rows.length] : left === 3 ? [2, 1, 1] : left === 2 ? [2, 2] : [4];
    out.push(...row);
  }
  return out.slice(0, n);
}

function renderServices() {
  const list = site.services;
  const section = $("#servicios");
  if (!list.length) return (section.hidden = true);
  const spans = spansFor(list.length);
  const variants = ["", "accent", "ink", "lines", "soft"];
  $("#bento").innerHTML = list.map((s, i) => `
    <article class="cell ${variants[i % variants.length] ? `cell--${variants[i % variants.length]}` : ""} reveal" style="--span:${spans[i]};--d:${(i % 4) * 70}ms">
      <span class="cell__ico">${icon(s.icon || "sparkle")}</span>
      <div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p></div>
    </article>`).join("");
}

/* ---------- Clientes ---------- */
function renderClients() {
  const named = new Map(site.clients.map((c) => [c.name, c]));
  const a = analyze(site);
  for (const c of a.topClients) if (!named.has(c.name)) named.set(c.name, { name: c.name });
  const list = [...named.values()].filter((c) => c.name);
  if (!list.length) return;
  $("#clientes").hidden = false;
  $("#clients").innerHTML = list.map((c, i) => {
    const logo = safeUrl(c.logo), site_ = safeUrl(c.website);
    const mark = logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : esc(c.name.trim()[0]?.toUpperCase());
    const inner = `<span class="client__mark">${mark}</span><b>${esc(c.name)}</b>`;
    const cls = `client reveal`;
    return site_ ? `<a class="${cls}" style="--d:${(i % 6) * 50}ms" href="${esc(site_)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="${cls}" style="--d:${(i % 6) * 50}ms">${inner}</div>`;
  }).join("");
}

/* ---------- Contacto ---------- */
function renderContact() {
  const p = site.profile;
  $("#availability").textContent = p.availability || "";
  const links = [];
  if (p.email) links.push([`mailto:${p.email}`, "envelope-simple", p.email]);
  const wa = String(p.whatsapp || "").replace(/\D/g, "");
  if (wa) links.push([`https://wa.me/${wa}`, "whatsapp-logo", "WhatsApp"]);
  const nets = SOCIALS.map((n) => ({ ...n, href: socialUrl(n, p.socials[n.key]) })).filter((n) => n.href);
  $("#contactLinks").innerHTML = links.map(([href, ico, label]) => `<li><a href="${esc(href)}" ${href.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}>${icon(ico)} ${esc(label)} ${icon("arrow-up-right", "go")}</a></li>`).join("");
  const pills = nets.map((n) => `<a href="${esc(n.href)}" target="_blank" rel="noopener" aria-label="${esc(n.label)}">${icon(n.icon)}<span>${esc(n.label)}</span></a>`).join("");
  $("#socials").innerHTML = pills;
  $("#footSocials").innerHTML = pills;

  const form = $("#contactForm"), msg = $("#formMsg"), btn = $("#formBtn");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    btn.disabled = true; msg.className = "form__msg"; msg.textContent = "Enviando…";
    try {
      const res = await fetch("/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)).toString() });
      if (!res.ok) throw new Error();
      form.reset(); msg.className = "form__msg ok"; msg.textContent = "Mensaje enviado. Te respondo pronto.";
    } catch {
      msg.className = "form__msg err";
      msg.textContent = p.email ? `No se pudo enviar. Escríbeme a ${p.email}.` : "No se pudo enviar. Intenta de nuevo en un momento.";
    } finally { btn.disabled = false; }
  });
}

/* ---------- Navegación y entradas ---------- */
function initChrome() {
  initTheme();
  initProgress();
  const nav = $("#nav"), burger = $("#burger");
  const onScroll = () => nav.classList.toggle("is-stuck", scrollY > 10);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
  $("#navLinks").addEventListener("click", () => { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); });
}

function watchReveals() {
  const els = document.querySelectorAll(".reveal:not(.in)");
  if (reduceMotion || !("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("in"));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  els.forEach((el) => io.observe(el));
}

/* ---------- Modo diurno / nocturno ---------- */
function initTheme() {
  const root = document.documentElement, btn = $("#theme"), meta = $('meta[name="theme-color"]');
  const label = () => {
    const dark = root.dataset.theme === "dark";
    btn.setAttribute("aria-label", dark ? "Cambiar a modo diurno" : "Cambiar a modo nocturno");
    btn.title = dark ? "Modo diurno" : "Modo nocturno";
    meta?.setAttribute("content", dark ? "#050c20" : "#eaf0f8");
  };
  label();
  btn.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem("lamont-theme", next); } catch { /* sin almacenamiento */ }
      label();
    };
    if (!document.startViewTransition || reduceMotion) return apply();
    // el cambio se despliega como un círculo que sale del botón
    const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" }
    ));
  });
}

/* ---------- Barra de progreso de lectura ---------- */
function initProgress() {
  const bar = $("#progress");
  let raf = 0;
  const update = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty("--p", max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  update();
}
