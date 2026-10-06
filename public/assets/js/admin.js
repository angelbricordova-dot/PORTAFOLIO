import { esc, safeUrl, icon, SOCIALS, uid, slug, loadSite, normalize, parseMedia, coverOf, analyze, monthSummary, monthLong, monthName, cap, thisMonth, DELIVERABLES } from "./common.js";

const $ = (sel, root = document) => root.querySelector(sel);
const TOKEN_KEY = "lamont_admin_token";
const DRAFT_KEY = "lamont_admin_draft";
const SERVICE_ICONS = "film-strip paint-brush megaphone chats-circle monitor-play target sparkle lightbulb compass palette rocket trend-up video-camera image users-three star heart magic-wand globe trophy".split(" ");

let S = null;          // contenido del sitio (borrador en memoria)
let dirty = false;
let view = "home";
let token = safe(() => localStorage.getItem(TOKEN_KEY));
let filters = { q: "", cat: "all" };
let pending = [];      // testimonios enviados por clientes, esperando revisión

function safe(fn) { try { return fn(); } catch { return null; } }

/* ============ API ============ */
async function api(path, { method = "GET", body, type } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (type) headers["content-type"] = type;
  else if (body && !(body instanceof Blob)) headers["content-type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body && !(body instanceof Blob) && !type ? JSON.stringify(body) : body });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
  if (res.status === 401 && token && path !== "/api/login") { logout("Tu sesión venció. Entra de nuevo."); throw new Error("sesión"); }
  if (!res.ok) throw Object.assign(new Error(data?.error || `Error ${res.status}`), { status: res.status });
  return data;
}

/* ============ Arranque y sesión ============ */
(async function boot() {
  if (token) {
    try { await api("/api/session"); return start(); } catch { token = null; }
  }
  showLogin();
})();

function showLogin(message = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#loginError").textContent = message;
  $("#pw").focus();
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn"), err = $("#loginError");
  btn.disabled = true; err.textContent = "";
  try {
    const out = await api("/api/login", { method: "POST", body: { password: $("#pw").value } });
    token = out.token;
    safe(() => localStorage.setItem(TOKEN_KEY, token));
    $("#pw").value = "";
    await start();
  } catch (error) {
    err.textContent = error.status === 404 || error instanceof SyntaxError
      ? "No encuentro la API. Despliega en Netlify o usa «npm run dev» para probar en local."
      : error.message;
  } finally { btn.disabled = false; }
});

function logout(message = "") {
  token = null;
  safe(() => localStorage.removeItem(TOKEN_KEY));
  showLogin(message);
}
$("#logout").addEventListener("click", () => { if (!dirty || confirm("Tienes cambios sin publicar. ¿Salir de todos modos?")) logout(); });

async function start() {
  S = normalize(await loadSite());
  const draft = safe(() => JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"));
  if (draft?.site && confirm("Encontré cambios sin publicar de tu última sesión. ¿Quieres recuperarlos?")) {
    S = normalize(draft.site);
    dirty = true;
  } else safe(() => localStorage.removeItem(DRAFT_KEY));
  $("#login").hidden = true;
  $("#app").hidden = false;
  applyLogo();
  go(view);
  if (S._migrated) { delete S._migrated; touch(); toast("Agregué tu caso de Airbnb a Servicios y Trabajos. Revísalo y pulsa «Publicar cambios»."); }
  setStatus();
  loadPending();
}

async function loadPending() {
  try { pending = (await api("/api/pending")).items || []; } catch { pending = []; }
  go(view);
}
// Los que ya pasaron al borrador no se muestran como pendientes.
const pendingList = () => pending.filter((p) => !S.testimonials.some((t) => t.pendingId === p.id));

/* ============ Estado y guardado ============ */
function touch() {
  dirty = true;
  safe(() => localStorage.setItem(DRAFT_KEY, JSON.stringify({ site: S, at: Date.now() })));
  setStatus();
}
function setStatus() {
  const el = $("#status");
  el.classList.toggle("dirty", dirty);
  el.textContent = dirty ? "Cambios sin publicar" : S._source === "api" ? "Todo publicado" : "Contenido de ejemplo";
  $("#publish").disabled = !dirty && S._source === "api";
}

async function publish() {
  const btn = $("#publish");
  btn.disabled = true;
  try {
    const { _source, updatedAt, ...doc } = S;
    const out = await api("/api/data", { method: "PUT", body: doc });
    S._source = "api"; S.updatedAt = out.updatedAt;
    dirty = false;
    safe(() => localStorage.removeItem(DRAFT_KEY));
    toast("Publicado. Tu sitio ya muestra los cambios.");
    // los testimonios aprobados dejan de estar pendientes
    const done = pending.filter((p) => S.testimonials.some((t) => t.pendingId === p.id));
    await Promise.all(done.map((p) => api(`/api/pending/${p.id}`, { method: "DELETE" }).catch(() => {})));
    if (done.length) { pending = pending.filter((p) => !done.includes(p)); go(view); }
  } catch (e) {
    if (e.message !== "sesión") toast(e.message || "No se pudo publicar", true);
  } finally { setStatus(); }
}
$("#publish").addEventListener("click", publish);
addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (!$("#app").hidden) publish(); } });
addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

function toast(text, isError = false) {
  const el = document.createElement("div");
  el.className = `toast ${isError ? "err" : ""}`;
  el.innerHTML = `${icon(isError ? "warning" : "check-circle")}<span>${esc(text)}</span>`;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3500);
}

/* ============ Navegación ============ */
const VIEWS = {
  home: ["Resumen", "house"],
  projects: ["Trabajos", "film-strip"],
  testimonials: ["Testimonios", "quotes"],
  months: ["Bitácora mensual", "calendar-blank"],
  clients: ["Clientes", "users"],
  profile: ["Perfil y contacto", "note-pencil"],
  services: ["Servicios", "sparkle"],
  categories: ["Categorías", "tag"],
  backup: ["Respaldo", "floppy-disk"],
};

function applyLogo() {
  const url = safeUrl(S?.profile?.logo) || "/assets/img/logo.webp";
  document.querySelectorAll(".js-logo").forEach((img) => { img.src = url; });
}

function go(name) {
  view = name;
  $("#nav").innerHTML = Object.entries(VIEWS).map(([id, [label, ico]]) => {
    const count = { projects: S.projects.length, testimonials: S.testimonials.length, months: S.months.length, clients: S.clients.length }[id];
    const waiting = id === "testimonials" ? pendingList().length : 0;
    return `<button class="nav-btn" data-go="${id}" ${id === view ? 'aria-current="page"' : ""}>${icon(ico)}${esc(label)}${waiting ? `<b class="dot" title="Pendientes de revisar">${waiting}</b>` : ""}${count != null ? `<small>${count}</small>` : ""}</button>`;
  }).join("");
  $("#title").textContent = VIEWS[name][0];
  paint();
}
$("#nav").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) { go(b.dataset.go); scrollTo(0, 0); } });

function paint() {
  $("#view").innerHTML = ({ home: viewHome, projects: viewProjects, testimonials: viewTestimonials, months: viewMonths, clients: viewClients, profile: viewProfile, services: viewServices, categories: viewCategories, backup: viewBackup })[view]();
}

/* ============ Resumen ============ */
function viewHome() {
  const a = analyze(S);
  const p = S.profile;
  const hasDemo = [...S.projects, ...S.clients, ...S.months].some((x) => x.demo);
  const logged = S.months.some((m) => m.month === thisMonth());
  const steps = [
    [!!p.email || !!p.whatsapp, "Agrega tu correo o WhatsApp para que te contacten", "profile"],
    [S.projects.some((x) => !x.demo), "Sube tu primer trabajo real", "projects"],
    [logged, `Registra ${monthName(thisMonth())} en la bitácora`, "months"],
    [Object.values(p.socials).some(Boolean), "Enlaza tus redes (Instagram, YouTube, TikTok…)", "profile"],
  ];
  return `
    ${S._source !== "api" ? `<div class="banner"><p><b>Aún no has publicado nada.</b> Lo que ves es contenido de ejemplo. Edítalo y pulsa «Publicar cambios».</p></div>` : ""}
    ${hasDemo ? `<div class="banner"><p>Hay <b>contenido de ejemplo</b> mezclado con el tuyo. Bórralo cuando ya tengas trabajos reales.</p><button class="btn btn--sm" data-act="clear-demo">Borrar ejemplos</button></div>` : ""}
    <div class="kpis">
      <div class="kpi kpi--accent"><b>${S.projects.length}</b><span>trabajos</span></div>
      <div class="kpi"><b>${a.clients ?? S.clients.length}</b><span>clientes</span></div>
      <div class="kpi"><b>${S.months.length}</b><span>meses registrados</span></div>
      <div class="kpi"><b>${a.deliveredTotal ?? 0}</b><span>entregas registradas</span></div>
    </div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel__head"><h2>Lectura de tu trayectoria</h2>${a.empty ? "" : `<button class="btn btn--ghost btn--sm" data-act="copy-analysis">${icon("copy")} Copiar</button>`}</div>
        <div class="read">${a.empty ? `<p class="muted">Cuando registres trabajos o meses, aquí aparecerá un análisis automático listo para tu página.</p>` : a.narrative.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
        ${a.highlights?.length ? `<div class="toolbar">${a.highlights.map((h) => `<span class="chip">${esc(h.label)}: <b>${esc(h.value)}</b></span>`).join("")}</div>` : ""}
      </section>
      <section class="panel">
        <h2>Siguientes pasos</h2>
        <ul class="steps">${steps.map(([done, text, target]) => `<li class="${done ? "done" : ""}">${icon(done ? "check-circle" : "arrow-right")}<span>${esc(text)}</span>${done ? "" : `<button class="btn btn--sm btn--ghost" data-go="${target}">Ir</button>`}</li>`).join("")}</ul>
      </section>
    </div>`;
}

/* ============ Trabajos ============ */
function projectThumb(p) {
  const c = coverOf(p);
  if (c?.kind === "image") return `<img src="${esc(c.src)}" alt="" loading="lazy">`;
  if (c?.kind === "video") return `<video src="${esc(c.src)}" muted preload="metadata"></video>`;
  return esc((p.title || "?")[0].toUpperCase());
}

function viewProjects() {
  const list = [...S.projects]
    .filter((p) => (filters.cat === "all" || p.category === filters.cat) && (!filters.q || `${p.title} ${p.client} ${(p.tags || []).join(" ")}`.toLowerCase().includes(filters.q.toLowerCase())))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const cat = (id) => S.categories.find((c) => c.id === id)?.name || "Sin categoría";
  return `
    <div class="toolbar">
      <button class="btn btn--accent" data-act="project-new">${icon("plus")} Nuevo trabajo</button>
      <div class="field"><label class="sr-only" for="q">Buscar</label><input id="q" type="search" placeholder="Buscar por título, cliente o etiqueta" value="${esc(filters.q)}" data-filter="q"></div>
      <div class="field" style="flex:0 1 220px"><label class="sr-only" for="fc">Categoría</label>
        <select id="fc" data-filter="cat"><option value="all">Todas las categorías</option>${S.categories.map((c) => `<option value="${esc(c.id)}" ${filters.cat === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    </div>
    <div class="list">${list.length ? list.map((p) => `
      <article class="item ${p.visible === false ? "is-hidden" : ""}">
        <div class="thumb">${projectThumb(p)}</div>
        <div><h3>${esc(p.title || "Sin título")}</h3>
          <div class="meta"><span class="tag">${esc(cat(p.category))}</span>${p.demo ? `<span class="tag tag--demo">Ejemplo</span>` : ""}<span>${esc([p.client, p.date && cap(monthLong(p.date))].filter(Boolean).join(" · "))}</span><span>${(p.media || []).length} medios</span></div></div>
        <div class="item__actions">
          <button class="icon-btn ${p.featured ? "on" : ""}" data-act="project-star" data-id="${esc(p.id)}" title="Destacar (tarjeta grande)" aria-label="Destacar" aria-pressed="${!!p.featured}">${icon(p.featured ? "star-fill" : "star")}</button>
          <button class="icon-btn" data-act="project-vis" data-id="${esc(p.id)}" title="${p.visible === false ? "Oculto: mostrar" : "Visible: ocultar"}" aria-label="Mostrar u ocultar">${icon(p.visible === false ? "eye-slash" : "eye")}</button>
          <button class="icon-btn" data-act="project-edit" data-id="${esc(p.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button>
          <button class="icon-btn danger" data-act="project-del" data-id="${esc(p.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button>
        </div>
      </article>`).join("") : `<div class="empty"><strong>${S.projects.length ? "Nada coincide con el filtro" : "Aún no hay trabajos"}</strong><span>Sube imágenes, enlaza videos de YouTube o Vimeo y categorízalos.</span><button class="btn btn--accent" data-act="project-new">${icon("plus")} Nuevo trabajo</button></div>`}
    </div>`;
}

let draftMedia = [];
let draftCover = "";

function openProjectForm(id) {
  const existing = S.projects.find((p) => p.id === id);
  const p = existing ? structuredClone(existing) : { id: uid("p"), title: "", client: "", category: S.categories[0]?.id || "", date: thisMonth(), description: "", tags: [], cover: "", media: [], link: "", featured: false, visible: true };
  draftMedia = p.media || [];
  draftCover = p.cover || "";
  openDialog({
    title: existing ? "Editar trabajo" : "Nuevo trabajo",
    body: `
      <div class="field"><label for="d-title">Título</label><input id="d-title" name="title" required maxlength="120" value="${esc(p.title)}"></div>
      <div class="row">
        <div class="field"><label for="d-client">Cliente</label><input id="d-client" name="client" list="client-list" maxlength="80" value="${esc(p.client)}" autocomplete="off"><datalist id="client-list">${S.clients.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist></div>
        <div class="field"><label for="d-cat">Categoría</label><select id="d-cat" name="category">${S.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="d-date">Mes del trabajo</label><input id="d-date" name="date" type="month" required value="${esc(p.date)}"></div>
      </div>
      <div class="field"><label for="d-desc">Descripción</label><textarea id="d-desc" name="description" maxlength="900">${esc(p.description)}</textarea><span class="help">Qué hiciste, el objetivo y el resultado. Dos o tres frases bastan.</span></div>
      <div class="field"><span class="label">Etiquetas</span>${tagInput("tags", p.tags || [], "")}<span class="help">Escribe y pulsa Enter. Ej: Reels, Motion, Miniaturas.</span></div>
      <div class="field"><span class="label">Imágenes y videos</span><div id="mediaBox"></div></div>
      <div class="field"><label for="d-link">Enlace a la publicación (opcional)</label><input id="d-link" name="link" type="url" placeholder="https://" value="${esc(p.link)}"></div>
      <div class="toolbar"><label class="check"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}> Destacado (tarjeta grande)</label><label class="check"><input type="checkbox" name="visible" ${p.visible !== false ? "checked" : ""}> Visible en el sitio</label></div>`,
    onOpen: renderMediaBox,
    onSubmit: (fd, form) => {
      const clientName = String(fd.get("client")).trim();
      const next = {
        ...p,
        title: String(fd.get("title")).trim(),
        client: clientName,
        category: fd.get("category"),
        date: fd.get("date"),
        description: String(fd.get("description")).trim(),
        tags: readTags(form, "tags"),
        media: draftMedia,
        cover: draftCover,
        link: safeUrl(fd.get("link")),
        featured: fd.get("featured") === "on",
        visible: fd.get("visible") === "on",
        demo: false,
      };
      if (clientName && !S.clients.some((c) => c.name.toLowerCase() === clientName.toLowerCase())) S.clients.push({ id: uid("c"), name: clientName, logo: "", website: "" });
      const i = S.projects.findIndex((x) => x.id === p.id);
      if (i >= 0) S.projects[i] = next; else S.projects.unshift(next);
      touch(); go("projects"); toast("Trabajo guardado. Recuerda publicar los cambios.");
    },
  });
}

function renderMediaBox() {
  const box = $("#mediaBox");
  if (!box) return;
  box.innerHTML = `
    <label class="drop" id="drop"><input type="file" id="fileIn" accept="image/*,video/mp4,video/webm" multiple hidden>
      ${icon("upload-simple")}<b>Arrastra archivos o toca para elegir</b><span class="help">Imágenes (se optimizan solas) y clips cortos hasta 5 MB.</span></label>
    <div class="add-link"><input type="url" id="linkIn" placeholder="Pega un enlace de YouTube, Vimeo, Drive o .mp4" aria-label="Enlace de video"><button class="btn btn--sm" type="button" id="linkAdd">Agregar</button></div>
    <div class="media">${draftMedia.map((m, i) => {
      const parsed = parseMedia(m.url);
      const isImg = parsed?.type === "image";
      const thumb = parsed?.thumb ? `<img src="${esc(parsed.thumb)}" alt="">` : parsed?.type === "video" ? `<video src="${esc(parsed.src)}" muted preload="metadata"></video>` : icon(parsed?.type === "embed" ? "play-circle" : "link");
      const label = { image: "Imagen", video: "Video", embed: parsed?.provider === "youtube" ? "YouTube" : parsed?.provider === "vimeo" ? "Vimeo" : "Video", link: "Enlace" }[parsed?.type || "link"];
      const isCover = draftCover && draftCover === m.url;
      return `<div class="media__item"><div class="thumb">${thumb}</div>
        <div><b>${label}</b> ${isCover ? `<span class="is-cover">· portada</span>` : ""}<small>${esc(m.url)}</small></div>
        <div class="item__actions">
          ${isImg ? `<button class="icon-btn ${isCover ? "on" : ""}" type="button" data-media="cover" data-i="${i}" title="Usar como portada" aria-label="Usar como portada">${icon("image")}</button>` : ""}
          <button class="icon-btn" type="button" data-media="up" data-i="${i}" ${i === 0 ? "disabled" : ""} title="Subir" aria-label="Subir">${icon("arrow-up")}</button>
          <button class="icon-btn danger" type="button" data-media="del" data-i="${i}" title="Quitar" aria-label="Quitar">${icon("x")}</button>
        </div></div>`;
    }).join("")}</div>`;

  const fileIn = $("#fileIn"), drop = $("#drop");
  fileIn.addEventListener("change", () => addFiles([...fileIn.files]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
  $("#linkAdd").addEventListener("click", addLink);
  $("#linkIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
}

function addLink() {
  const input = $("#linkIn");
  const parsed = parseMedia(input.value);
  if (!parsed) return toast("Ese enlace no es válido. Debe empezar con https://", true);
  draftMedia.push({ url: parsed.url, caption: "" });
  renderMediaBox();
}

async function addFiles(files) {
  const drop = $("#drop");
  for (const file of files) {
    drop.querySelector("b").textContent = `Subiendo ${file.name}…`;
    try {
      const url = await uploadFile(file);
      draftMedia.push({ url, caption: "" });
      if (!draftCover && file.type.startsWith("image/")) draftCover = url;
    } catch (e) { toast(e.message, true); }
  }
  renderMediaBox();
}

// Las imágenes se reducen y pasan a WebP en el navegador: cargan rápido y caben en el límite de 5 MB.
const AUDIO_EXT = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", weba: "audio/webm" };
async function uploadFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  let blob = file, type = AUDIO_EXT[ext] || file.type;
  if (type.startsWith("image/") && type !== "image/gif") {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.86));
    type = "image/webp";
  }
  if (!blob) throw new Error("No pude procesar la imagen");
  if (blob.size > 5.5 * 1024 * 1024) throw new Error(`${file.name} pesa más de 5 MB. Para videos largos usa un enlace de YouTube o Vimeo.`);
  const out = await api("/api/upload", { method: "POST", body: blob, type });
  return out.url;
}

$("#dlg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-media]");
  if (!b) return;
  const i = Number(b.dataset.i);
  if (b.dataset.media === "del") { if (draftCover === draftMedia[i].url) draftCover = ""; draftMedia.splice(i, 1); }
  if (b.dataset.media === "up" && i > 0) [draftMedia[i - 1], draftMedia[i]] = [draftMedia[i], draftMedia[i - 1]];
  if (b.dataset.media === "cover") draftCover = draftCover === draftMedia[i].url ? "" : draftMedia[i].url;
  renderMediaBox();
});

/* ============ Testimonios ============ */
const T_TYPES = { text: ["quotes", "Mensaje de texto"], audio: ["microphone", "Audio"], image: ["image", "Captura / prueba"], video: ["video-camera", "Video (enlace)"] };
const starsText = (n) => (Number(n) > 0 ? "★".repeat(Number(n)) + "☆".repeat(5 - Number(n)) : "Sin valoración");

function viewTestimonials() {
  const waiting = pendingList();
  const list = [...S.testimonials].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <section class="panel">
      <h2>Enlace para tus clientes</h2>
      <p class="muted">Compártelo para que cada cliente escriba su testimonio. Llega aquí como «pendiente» y solo se publica cuando tú lo apruebas.</p>
      <div class="add-link"><input type="text" readonly value="${esc(location.origin)}/#testimonio" aria-label="Enlace del formulario" onfocus="this.select()"><button class="btn btn--sm" data-act="copy-link">${icon("copy")} Copiar</button></div>
    </section>
    ${waiting.length ? `<section class="panel"><h2>Pendientes de revisar (${waiting.length})</h2><div class="list">${waiting.map((p) => `
      <article class="item" style="grid-template-columns:minmax(0,1fr) auto"><div style="padding:6px 8px">
        <h3>${esc(p.name)} <span class="muted" style="font-weight:500">${esc(p.role || "")}</span></h3>
        <div class="meta"><span>${esc(starsText(p.rating))}</span><span>${esc(new Date(p.createdAt).toLocaleDateString("es"))}</span></div>
        <p style="margin-top:8px;white-space:pre-line;overflow-wrap:anywhere">${esc(p.message)}</p></div>
        <div class="item__actions" style="flex-direction:column;align-items:stretch"><button class="btn btn--sm btn--accent" data-act="pending-open" data-id="${esc(p.id)}">Revisar y publicar</button><button class="btn btn--sm btn--ghost" data-act="pending-del" data-id="${esc(p.id)}">Descartar</button></div></article>`).join("")}</div></section>` : ""}
    <div class="toolbar"><button class="btn btn--accent" data-act="testi-new">${icon("plus")} Nuevo testimonio</button><span class="help">Sube audios de tus clientes, capturas de sus mensajes, videos o textos.</span></div>
    <div class="list">${list.length ? list.map((t) => {
      const [ico, label] = T_TYPES[t.type] || T_TYPES.text;
      return `<article class="item ${t.visible === false ? "is-hidden" : ""}" style="grid-template-columns:56px minmax(0,1fr) auto">
        <div class="thumb" style="width:56px;height:56px">${t.type === "image" && safeUrl(t.media) ? `<img src="${esc(t.media)}" alt="" loading="lazy">` : icon(ico)}</div>
        <div><h3>${esc(t.name || "Sin nombre")} ${t.demo ? `<span class="tag tag--demo">Ejemplo</span>` : ""}</h3>
          <div class="meta"><span class="tag">${esc(label)}</span><span>${esc(starsText(t.rating))}</span>${t.role ? `<span>${esc(t.role)}</span>` : ""}</div>
          ${t.quote ? `<p class="muted" style="margin-top:6px;font-size:14px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(t.quote)}</p>` : ""}</div>
        <div class="item__actions">
          <button class="icon-btn ${t.featured ? "on" : ""}" data-act="testi-star" data-id="${esc(t.id)}" title="Destacar (tarjeta dorada y primero)" aria-label="Destacar" aria-pressed="${!!t.featured}">${icon(t.featured ? "star-fill" : "star")}</button>
          <button class="icon-btn" data-act="testi-vis" data-id="${esc(t.id)}" title="${t.visible === false ? "Oculto: mostrar" : "Visible: ocultar"}" aria-label="Mostrar u ocultar">${icon(t.visible === false ? "eye-slash" : "eye")}</button>
          <button class="icon-btn" data-act="testi-edit" data-id="${esc(t.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button>
          <button class="icon-btn danger" data-act="testi-del" data-id="${esc(t.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button>
        </div></article>`;
    }).join("") : `<div class="empty"><strong>Aún no hay testimonios</strong><span>Publica el primero: un mensaje, un audio o una captura de tu cliente.</span></div>`}</div>`;
}

let draftT = { media: "", avatar: "" };
function openTestimonialForm(id, fromPending) {
  const existing = S.testimonials.find((t) => t.id === id);
  const t = existing ? structuredClone(existing) : {
    id: uid("t"), type: "text", name: fromPending?.name || "", role: fromPending?.role || "", quote: fromPending?.message || "",
    rating: fromPending ? fromPending.rating : 5, media: "", avatar: "", date: thisMonth(), featured: false, visible: true, pendingId: fromPending?.id,
  };
  draftT = { media: t.media || "", avatar: t.avatar || "" };
  openDialog({
    title: existing ? "Editar testimonio" : fromPending ? "Revisar y publicar" : "Nuevo testimonio",
    body: `
      <div class="field"><span class="label">Tipo</span><div class="seg" role="radiogroup" aria-label="Tipo">${Object.entries(T_TYPES).map(([k, [ico, label]]) => `<label><input type="radio" name="type" value="${k}" ${t.type === k ? "checked" : ""}><span>${icon(ico)} ${esc(label)}</span></label>`).join("")}</div></div>
      <div class="row"><div class="field"><label for="t-name">Nombre</label><input id="t-name" name="name" required maxlength="80" value="${esc(t.name)}"></div>
        <div class="field"><label for="t-role">Cargo o marca</label><input id="t-role" name="role" maxlength="100" value="${esc(t.role)}"></div></div>
      <div class="row"><div class="field"><label for="t-rating">Valoración</label><select id="t-rating" name="rating">${[5, 4, 3, 2, 1, 0].map((n) => `<option value="${n}" ${Number(t.rating) === n ? "selected" : ""}>${n ? "★".repeat(n) + " " + n : "Sin estrellas"}</option>`).join("")}</select></div>
        <div class="field"><label for="t-date">Mes</label><input id="t-date" name="date" type="month" value="${esc(t.date || "")}"></div></div>
      <div class="field"><label for="t-quote" id="t-quote-label">Testimonio</label><textarea id="t-quote" name="quote" rows="4" maxlength="900">${esc(t.quote)}</textarea><span class="help" id="t-quote-help"></span></div>
      <div class="field" id="mediaField"><span class="label" id="mediaLabel">Archivo</span><div id="tMedia"></div></div>
      <div class="field"><span class="label">Foto de la persona (opcional)</span>
        <div class="toolbar"><div class="thumb thumb--round" id="avPrev" style="width:56px;height:56px">${draftT.avatar ? `<img src="${esc(draftT.avatar)}" alt="">` : icon("image")}</div>
          <label class="btn btn--sm btn--ghost" for="avIn">${icon("upload-simple")} Subir foto</label><input id="avIn" type="file" accept="image/*" hidden>
          <button type="button" class="btn btn--sm btn--ghost" id="avClear">Quitar</button></div></div>
      <div class="toolbar"><label class="check"><input type="checkbox" name="featured" ${t.featured ? "checked" : ""}> Destacado (tarjeta dorada)</label><label class="check"><input type="checkbox" name="visible" ${t.visible !== false ? "checked" : ""}> Visible en el sitio</label></div>`,
    onOpen: () => {
      const form = $("#dlgForm");
      const sync = () => { renderTMedia(form.elements.type.value); };
      form.onchange = (e) => { if (e.target.name === "type") sync(); };
      $("#avIn").addEventListener("change", async (e) => {
        try { draftT.avatar = await uploadFile(e.target.files[0]); $("#avPrev").innerHTML = `<img src="${esc(draftT.avatar)}" alt="">`; } catch (err) { toast(err.message, true); }
      });
      $("#avClear").addEventListener("click", () => { draftT.avatar = ""; $("#avPrev").innerHTML = icon("image"); });
      sync();
    },
    onSubmit: (fd) => {
      const type = fd.get("type");
      const next = {
        ...t, type, name: String(fd.get("name")).trim(), role: String(fd.get("role")).trim(), quote: String(fd.get("quote")).trim(),
        rating: Number(fd.get("rating")) || 0, date: fd.get("date") || "", media: type === "text" ? "" : draftT.media, avatar: draftT.avatar,
        featured: fd.get("featured") === "on", visible: fd.get("visible") === "on", demo: false,
      };
      if (type !== "text" && !next.media) { toast("Falta el archivo o enlace del testimonio.", true); return false; }
      const i = S.testimonials.findIndex((x) => x.id === t.id);
      if (i >= 0) S.testimonials[i] = next; else S.testimonials.unshift(next);
      touch(); go("testimonials"); toast("Testimonio guardado. Recuerda publicar los cambios.");
    },
  });
}

function renderTMedia(type) {
  const box = $("#tMedia");
  $("#mediaField").hidden = type === "text";
  $("#t-quote-label").textContent = type === "text" ? "Testimonio" : "Frase o transcripción (opcional)";
  $("#t-quote-help").textContent = type === "audio" ? "Puedes escribir lo que dice el audio, para quien no pueda escucharlo." : type === "image" ? "Un pie corto para la captura." : "";
  if (type === "text") return;
  const accept = type === "audio" ? "audio/*,.opus,.m4a,.mp3,.ogg,.aac,.wav" : type === "image" ? "image/*" : "";
  $("#mediaLabel").textContent = { audio: "Audio del cliente", image: "Captura o prueba", video: "Enlace del video" }[type];
  const cur = draftT.media;
  const parsed = cur ? parseMedia(cur) : null;
  const preview = !cur ? "" : parsed?.type === "audio" ? `<audio controls src="${esc(cur)}" style="width:100%"></audio>` : parsed?.type === "image" ? `<div class="thumb" style="width:120px;height:90px"><img src="${esc(cur)}" alt=""></div>` : `<small class="muted">${esc(cur)}</small>`;
  box.innerHTML = `
    ${type !== "video" ? `<label class="drop" id="tDrop"><input type="file" id="tFile" accept="${accept}" hidden>${icon("upload-simple")}<b>${cur ? "Cambiar archivo" : "Arrastra el archivo o toca para elegirlo"}</b><span class="help">${type === "audio" ? "MP3, M4A, OGG u OPUS hasta 5 MB. Si es una nota de voz de WhatsApp (.opus) y quieres que suene también en iPhone, conviértela a MP3 o M4A." : "Hasta 5 MB. Las imágenes se optimizan solas."}</span></label>` : ""}
    <div class="add-link"><input type="url" id="tLink" placeholder="${type === "video" ? "Enlace de YouTube, Vimeo, Drive o .mp4" : "…o pega un enlace directo"}" value="${cur && /^https?:/.test(cur) ? esc(cur) : ""}" aria-label="Enlace"><button class="btn btn--sm" type="button" id="tLinkSet">Usar enlace</button></div>
    ${preview ? `<div style="margin-top:6px">${preview}</div><button type="button" class="btn btn--sm btn--ghost" id="tClear" style="justify-self:start">Quitar</button>` : ""}`;
  const file = $("#tFile"), drop = $("#tDrop");
  if (file) {
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      drop.querySelector("b").textContent = `Subiendo ${file.files[0].name}…`;
      try { draftT.media = await uploadFile(file.files[0]); } catch (e) { toast(e.message, true); }
      renderTMedia(type);
    });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault(); drop.classList.remove("over");
      if (!e.dataTransfer.files[0]) return;
      try { draftT.media = await uploadFile(e.dataTransfer.files[0]); } catch (err) { toast(err.message, true); }
      renderTMedia(type);
    });
  }
  $("#tLinkSet").addEventListener("click", () => {
    const parsedLink = parseMedia($("#tLink").value);
    if (!parsedLink) return toast("Ese enlace no es válido. Debe empezar con https://", true);
    draftT.media = parsedLink.url; renderTMedia(type);
  });
  $("#tClear")?.addEventListener("click", () => { draftT.media = ""; renderTMedia(type); });
}

/* ============ Bitácora mensual ============ */
function viewMonths() {
  const a = analyze(S);
  const logs = [...S.months].sort((x, y) => y.month.localeCompare(x.month));
  return `
    <div class="toolbar"><button class="btn btn--accent" data-act="month-new">${icon("plus")} Registrar mes</button><span class="help">Anota con quién trabajaste y qué entregaste. El sitio resume y analiza todo solo.</span></div>
    <div class="list">${logs.length ? logs.map((m) => {
      const total = DELIVERABLES.reduce((n, [k]) => n + (Number(m.deliverables?.[k]) || 0), 0);
      return `<article class="item" style="grid-template-columns:minmax(0,1fr) auto">
        <div style="padding-left:8px"><h3>${esc(cap(monthLong(m.month)))} ${m.demo ? `<span class="tag tag--demo">Ejemplo</span>` : ""}</h3>
          <div class="meta"><span>${esc((m.clients || []).join(", ") || "Sin clientes anotados")}</span><span>${total} entregas</span></div></div>
        <div class="item__actions"><button class="icon-btn" data-act="month-edit" data-id="${esc(m.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button><button class="icon-btn danger" data-act="month-del" data-id="${esc(m.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button></div></article>`;
    }).join("") : `<div class="empty"><strong>Tu bitácora está vacía</strong><span>Registra el mes actual para empezar tu historial.</span></div>`}</div>
    ${a.empty ? "" : `<section class="panel"><h2>Así se lee tu trayectoria ahora</h2><div class="read">${a.narrative.map((t) => `<p>${esc(t)}</p>`).join("")}</div></section>`}`;
}

function openMonthForm(id) {
  const existing = S.months.find((m) => m.id === id);
  const m = existing ? structuredClone(existing) : { id: "", month: thisMonth(), clients: [], deliverables: { videos: 0, designs: 0, posts: 0, campaigns: 0 }, wins: "", notes: "", summary: "" };
  const names = DELIVERABLES.map(([k, label]) => [k, cap(label)]);
  openDialog({
    title: existing ? `Editar ${monthLong(m.month)}` : "Registrar mes",
    body: `
      <div class="field"><label for="m-month">Mes</label><input id="m-month" name="month" type="month" required value="${esc(m.month)}" ${existing ? "readonly" : ""}></div>
      <div class="field"><span class="label">Clientes con los que trabajaste</span>${tagInput("clients", m.clients, "client-list")}<datalist id="client-list">${S.clients.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist><span class="help">Escribe el nombre y pulsa Enter. Se suman automáticamente los clientes de tus trabajos de ese mes.</span></div>
      <div class="row">${names.map(([k, label]) => `<div class="field"><label for="m-${k}">${esc(label)}</label><input id="m-${k}" name="${k}" type="number" min="0" step="1" inputmode="numeric" value="${Number(m.deliverables?.[k]) || 0}"></div>`).join("")}</div>
      <div class="field"><label for="m-wins">Logro del mes</label><textarea id="m-wins" name="wins" rows="2" maxlength="400">${esc(m.wins)}</textarea><span class="help">Ej: «Lancé la serie semanal» o «El Reel superó las 50 mil vistas».</span></div>
      <div class="field"><label for="m-notes">Notas privadas</label><textarea id="m-notes" name="notes" rows="2" maxlength="600">${esc(m.notes)}</textarea><span class="help">Solo las ves tú; no se publican.</span></div>
      <div class="field"><label for="m-summary">Resumen para la página</label><textarea id="m-summary" name="summary" rows="3" maxlength="900">${esc(m.summary)}</textarea>
        <div class="toolbar"><button type="button" class="btn btn--sm btn--ghost" id="genSummary">${icon("magic-wand")} Generar resumen</button><span class="help">Si lo dejas vacío, el sitio genera uno solo.</span></div></div>`,
    onOpen: () => $("#genSummary").addEventListener("click", () => {
      const form = $("#dlgForm");
      const fd = new FormData(form);
      const month = fd.get("month");
      const projects = S.projects.filter((p) => p.date === month && p.visible !== false);
      const clients = [...new Set([...readTags(form, "clients"), ...projects.map((p) => p.client).filter(Boolean)])];
      const deliverables = Object.fromEntries(DELIVERABLES.map(([k]) => [k, Number(fd.get(k)) || 0]));
      const text = monthSummary({ clientList: clients, deliverables, projects, wins: String(fd.get("wins")).trim() });
      $("#m-summary").value = text || "Agrega clientes o entregas para generar el resumen.";
    }),
    onSubmit: (fd, form) => {
      const month = fd.get("month");
      const target = existing || S.months.find((x) => x.month === month);
      const next = {
        ...(target || {}), id: month, month,
        clients: readTags(form, "clients"),
        deliverables: Object.fromEntries(DELIVERABLES.map(([k]) => [k, Math.max(0, Number(fd.get(k)) || 0)])),
        wins: String(fd.get("wins")).trim(), notes: String(fd.get("notes")).trim(), summary: String(fd.get("summary")).trim(), demo: false,
      };
      for (const c of next.clients) if (!S.clients.some((x) => x.name.toLowerCase() === c.toLowerCase())) S.clients.push({ id: uid("c"), name: c, logo: "", website: "" });
      const i = S.months.findIndex((x) => x.id === (target?.id ?? month));
      if (i >= 0) S.months[i] = next; else S.months.push(next);
      touch(); go("months"); toast("Mes guardado. Recuerda publicar los cambios.");
    },
  });
}

/* ============ Clientes ============ */
function viewClients() {
  const list = [...S.clients].sort((a, b) => a.name.localeCompare(b.name));
  return `
    <div class="toolbar"><button class="btn btn--accent" data-act="client-new">${icon("plus")} Nuevo cliente</button></div>
    <div class="list">${list.length ? list.map((c) => `
      <article class="item"><div class="thumb">${safeUrl(c.logo) ? `<img src="${esc(safeUrl(c.logo))}" alt="">` : esc(c.name[0]?.toUpperCase() || "?")}</div>
        <div><h3>${esc(c.name)} ${c.demo ? `<span class="tag tag--demo">Ejemplo</span>` : ""}</h3><div class="meta"><span>${S.projects.filter((p) => p.client === c.name).length} trabajos</span>${c.website ? `<span>${esc(c.website)}</span>` : ""}</div></div>
        <div class="item__actions"><button class="icon-btn" data-act="client-edit" data-id="${esc(c.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button><button class="icon-btn danger" data-act="client-del" data-id="${esc(c.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button></div></article>`).join("")
      : `<div class="empty"><strong>Sin clientes todavía</strong><span>Se agregan solos cuando los escribes en un trabajo o en la bitácora.</span></div>`}</div>`;
}

let draftLogo = "";
function openClientForm(id) {
  const existing = S.clients.find((c) => c.id === id);
  const c = existing ? { ...existing } : { id: uid("c"), name: "", logo: "", website: "" };
  draftLogo = c.logo || "";
  openDialog({
    title: existing ? "Editar cliente" : "Nuevo cliente",
    body: `
      <div class="field"><label for="c-name">Nombre</label><input id="c-name" name="name" required maxlength="80" value="${esc(c.name)}"></div>
      <div class="field"><label for="c-web">Sitio web (opcional)</label><input id="c-web" name="website" type="url" placeholder="https://" value="${esc(c.website)}"></div>
      <div class="field"><span class="label">Logo (opcional)</span>
        <div class="toolbar"><div class="thumb" id="logoPrev">${draftLogo ? `<img src="${esc(draftLogo)}" alt="">` : esc((c.name || "?")[0].toUpperCase())}</div>
        <label class="btn btn--sm btn--ghost" for="logoIn">${icon("upload-simple")} Subir logo</label><input id="logoIn" type="file" accept="image/*" hidden>
        <button type="button" class="btn btn--sm btn--ghost" id="logoClear">Quitar</button></div></div>`,
    onOpen: () => {
      $("#logoIn").addEventListener("change", async (e) => {
        try { draftLogo = await uploadFile(e.target.files[0]); $("#logoPrev").innerHTML = `<img src="${esc(draftLogo)}" alt="">`; } catch (err) { toast(err.message, true); }
      });
      $("#logoClear").addEventListener("click", () => { draftLogo = ""; $("#logoPrev").textContent = (c.name || "?")[0].toUpperCase(); });
    },
    onSubmit: (fd) => {
      const name = String(fd.get("name")).trim();
      const next = { ...c, name, website: safeUrl(fd.get("website")), logo: draftLogo, demo: false };
      if (existing && existing.name !== name) {
        S.projects.forEach((p) => { if (p.client === existing.name) p.client = name; });
        S.months.forEach((m) => { m.clients = (m.clients || []).map((x) => (x === existing.name ? name : x)); });
      }
      const i = S.clients.findIndex((x) => x.id === c.id);
      if (i >= 0) S.clients[i] = next; else S.clients.push(next);
      touch(); go("clients");
    },
  });
}

/* ============ Perfil, servicios y categorías (edición directa) ============ */
const bind = (path, value, extra = "") => `data-bind="${path}" ${extra} value="${esc(value)}"`;

function imageField(key, label, help, shape) {
  const url = S.profile[key];
  return `<div class="field"><span class="label">${esc(label)}</span>
    <div class="toolbar"><div class="thumb ${shape}" id="prev-${key}">${url ? `<img src="${esc(url)}" alt="">` : icon("image")}</div>
      <label class="btn btn--sm btn--ghost" for="up-${key}">${icon("upload-simple")} Subir imagen</label><input id="up-${key}" type="file" accept="image/*" data-upload="${key}" hidden>
      <button type="button" class="btn btn--sm btn--ghost" data-act="clear-img" data-key="${key}">Usar la original</button></div>
    <span class="help">${esc(help)}</span></div>`;
}

function viewProfile() {
  const p = S.profile;
  return `
    <section class="panel"><h2>Imágenes</h2>
      ${imageField("photo", "Foto principal (centro de la portada)", "Mejor vertical, con tu cara en el tercio superior. Si no subes ninguna, se usa la foto original.", "thumb--photo")}
      ${imageField("logo", "Logo (esquina superior izquierda)", "Mejor un PNG con fondo transparente y solo tu cara, sin recortes circulares.", "thumb--round")}
    </section>
    <section class="panel"><h2>Quién eres</h2>
      <div class="row"><div class="field"><label for="p-name">Nombre completo</label><input id="p-name" ${bind("profile.name", p.name)}></div>
        <div class="field"><label for="p-alias">Cómo te conocen</label><input id="p-alias" ${bind("profile.alias", p.alias)}></div>
        <div class="field"><label for="p-years">Años de experiencia</label><input id="p-years" type="number" min="0" max="60" inputmode="numeric" data-bind="profile.years" data-num="1" value="${esc(p.years ?? 8)}"><span class="help">Sale como «+${esc(p.years ?? 8)}» en la portada. Pon 0 para ocultarlo.</span></div></div>
      <div class="field"><label for="p-tag">Titular de la portada</label><input id="p-tag" maxlength="80" ${bind("profile.tagline", p.tagline)}><span class="help">Una frase corta. Ideal: dos líneas.</span></div>
      <div class="field"><label for="p-intro">Subtítulo</label><textarea id="p-intro" rows="2" maxlength="160" data-bind="profile.intro">${esc(p.intro)}</textarea><span class="help">Máximo 20 palabras se ven mejor.</span></div>
      <div class="field"><label for="p-bio">Sobre ti</label><textarea id="p-bio" rows="4" data-bind="profile.bio">${esc(p.bio)}</textarea></div>
      <div class="field"><label for="p-roles">Roles (uno por línea)</label><textarea id="p-roles" rows="7" data-bind="profile.roles" data-list="lines">${esc((p.roles || []).join("\n"))}</textarea><span class="help">Salen en la cinta que se desplaza bajo la portada.</span></div>
    </section>
    <section class="panel"><h2>Contacto y redes</h2>
      <div class="row"><div class="field"><label for="p-mail">Correo</label><input id="p-mail" type="email" ${bind("profile.email", p.email)}></div>
        <div class="field"><label for="p-wa">WhatsApp (con código de país)</label><input id="p-wa" inputmode="tel" placeholder="584121234567" ${bind("profile.whatsapp", p.whatsapp)}></div></div>
      <div class="field"><label for="p-av">Mensaje de disponibilidad</label><input id="p-av" ${bind("profile.availability", p.availability || "")}></div>
      <h2 style="margin-top:8px">Redes sociales</h2>
      <p class="help">Escribe tu usuario (@lamont) o pega el enlace completo. Las que llenes aparecen en Contacto y en el pie de página; las vacías no se muestran.</p>
      <div class="row">${SOCIALS.map((n) => `<div class="field"><label for="p-${n.key}">${esc(n.label)}</label><input id="p-${n.key}" placeholder="@usuario o enlace" ${bind(`profile.socials.${n.key}`, p.socials?.[n.key] || "")}></div>`).join("")}</div>
    </section>`;
}

function viewServices() {
  return `
    <div class="toolbar"><button class="btn btn--accent" data-act="service-add">${icon("plus")} Nuevo servicio</button><span class="help">Aparecen como tarjetas en «Lo que hago».</span></div>
    <div class="list">${S.services.map((s, i) => `
      <div class="edit-card">
        <div class="edit-card__top"><div class="field"><label for="s-t${i}">Título</label><input id="s-t${i}" ${bind(`services.${i}.title`, s.title)}></div>
          <button class="icon-btn" data-act="service-up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Subir" title="Subir">${icon("arrow-up")}</button>
          <button class="icon-btn danger" data-act="service-del" data-i="${i}" aria-label="Borrar" title="Borrar">${icon("trash")}</button></div>
        <div class="field"><label for="s-d${i}">Descripción</label><textarea id="s-d${i}" rows="2" maxlength="220" data-bind="services.${i}.desc">${esc(s.desc)}</textarea></div>
        <div class="icon-pick" role="radiogroup" aria-label="Icono">${SERVICE_ICONS.map((n) => `<label><input type="radio" name="ico${i}" data-bind="services.${i}.icon" value="${n}" ${s.icon === n ? "checked" : ""}><span title="${n}">${icon(n)}</span></label>`).join("")}</div>
      </div>`).join("")}</div>`;
}

function viewCategories() {
  return `
    <div class="toolbar"><button class="btn btn--accent" data-act="cat-add">${icon("plus")} Nueva categoría</button><span class="help">Sirven para filtrar tus trabajos en el sitio.</span></div>
    <div class="list">${S.categories.map((c, i) => {
      const n = S.projects.filter((p) => p.category === c.id).length;
      return `<div class="edit-card"><div class="edit-card__top"><div class="field"><label for="k${i}">Nombre <span class="muted">· ${n} trabajos</span></label><input id="k${i}" ${bind(`categories.${i}.name`, c.name)}></div>
        <button class="icon-btn danger" data-act="cat-del" data-i="${i}" aria-label="Borrar" title="Borrar">${icon("trash")}</button></div></div>`;
    }).join("")}</div>`;
}

/* ============ Respaldo ============ */
function viewBackup() {
  return `
    <section class="panel"><h2>Copia de seguridad</h2>
      <p class="muted">Descarga todos tus datos en un archivo. Guárdalo de vez en cuando: es tu respaldo si algo sale mal. Los archivos subidos (imágenes) se guardan aparte en tu sitio.</p>
      <div class="toolbar"><button class="btn" data-act="export">${icon("file-arrow-down")} Descargar respaldo</button>
        <label class="btn btn--ghost" for="importIn">${icon("file-arrow-up")} Importar respaldo</label><input id="importIn" type="file" accept="application/json" hidden></div></section>
    <section class="panel"><h2>Contenido de ejemplo</h2>
      <p class="muted">Quita los trabajos, clientes y meses de ejemplo para dejar solo lo tuyo.</p>
      <div class="toolbar"><button class="btn btn--ghost" data-act="clear-demo">Borrar ejemplos</button><button class="btn btn--ghost" data-act="reload">${icon("arrow-counter-clockwise")} Descartar cambios y recargar lo publicado</button></div></section>
    <section class="panel"><h2>Diagnóstico</h2>
      <p class="muted">Si al publicar aparece un error, esta prueba comprueba si el servidor puede guardar y leer tus datos.</p>
      <div class="toolbar"><button class="btn btn--ghost" data-act="health">${icon("check-circle")} Probar conexión con el servidor</button></div>
      <pre id="healthOut" class="health" hidden></pre></section>
    <section class="panel"><h2>Acceso</h2>
      <p class="muted">La contraseña de este panel es la variable <b>ADMIN_PASSWORD</b> de Netlify (Site configuration → Environment variables). Para cambiarla, edita la variable y vuelve a desplegar.</p></section>`;
}

/* ============ Diálogo genérico ============ */
function openDialog({ title, body, onSubmit, onOpen }) {
  const dlg = $("#dlg"), form = $("#dlgForm");
  form.innerHTML = `<div class="dlg__head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon("x")}</button></div>
    <div class="dlg__body">${body}</div>
    <div class="dlg__foot"><button type="button" class="btn btn--ghost" data-close>Cancelar</button><button class="btn btn--accent" type="submit" value="save">Guardar</button></div>`;
  form.onsubmit = (e) => {
    e.preventDefault();
    if (e.submitter?.value !== "save") return;
    if (onSubmit(new FormData(form), form) === false) return;
    dlg.close();
  };
  form.onclick = (e) => { if (e.target.closest("[data-close]")) dlg.close(); };
  form.onchange = null;
  if (!dlg.open) dlg.showModal();
  initTagInputs(form);
  onOpen?.();
}

/* Entrada de etiquetas */
function tagInput(name, values, list) {
  return `<div class="chips-in" data-tags="${name}">${values.map(tagChip).join("")}<input type="text" aria-label="${name}" ${list ? `list="${list}"` : ""} autocomplete="off"></div>`;
}
const tagChip = (v) => `<span class="chip" data-v="${esc(v)}">${esc(v)}<button type="button" aria-label="Quitar ${esc(v)}">${icon("x")}</button></span>`;
const readTags = (form, name) => [...form.querySelectorAll(`[data-tags="${name}"] .chip`)].map((c) => c.dataset.v);
function initTagInputs(form) {
  form.querySelectorAll(".chips-in").forEach((box) => {
    const input = box.querySelector("input");
    const add = () => {
      const v = input.value.trim().replace(/,$/, "");
      input.value = "";
      if (!v || [...box.querySelectorAll(".chip")].some((c) => c.dataset.v.toLowerCase() === v.toLowerCase())) return;
      input.insertAdjacentHTML("beforebegin", tagChip(v));
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
      if (e.key === "Backspace" && !input.value) box.querySelector(".chip:last-of-type")?.remove();
    });
    input.addEventListener("change", add);
    input.addEventListener("blur", add);
    box.addEventListener("click", (e) => { const b = e.target.closest(".chip button"); if (b) b.parentElement.remove(); else input.focus(); });
  });
}

/* ============ Acciones de la vista ============ */
const confirmDel = (what) => confirm(`¿Borrar ${what}? Esta acción no se puede deshacer (hasta que publiques puedes recargar lo publicado).`);

$("#view").addEventListener("click", (e) => {
  const goBtn = e.target.closest("[data-go]");
  if (goBtn) return go(goBtn.dataset.go);
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id } = b.dataset, i = Number(b.dataset.i);
  const find = (arr) => arr.find((x) => x.id === id);

  switch (act) {
    case "project-new": return openProjectForm();
    case "project-edit": return openProjectForm(id);
    case "project-star": { const p = find(S.projects); p.featured = !p.featured; touch(); return paint(); }
    case "project-vis": { const p = find(S.projects); p.visible = p.visible === false; touch(); return paint(); }
    case "project-del": if (confirmDel("este trabajo")) { S.projects = S.projects.filter((p) => p.id !== id); touch(); go("projects"); } return;
    case "testi-new": return openTestimonialForm();
    case "testi-edit": return openTestimonialForm(id);
    case "testi-star": { const t = find(S.testimonials); t.featured = !t.featured; touch(); return paint(); }
    case "testi-vis": { const t = find(S.testimonials); t.visible = t.visible === false; touch(); return paint(); }
    case "testi-del": if (confirmDel("este testimonio")) { S.testimonials = S.testimonials.filter((t) => t.id !== id); touch(); go("testimonials"); } return;
    case "pending-open": return openTestimonialForm(null, pending.find((p) => p.id === id));
    case "pending-del": if (confirm("¿Descartar este mensaje? No se publicará.")) { api(`/api/pending/${id}`, { method: "DELETE" }).then(() => { pending = pending.filter((p) => p.id !== id); go("testimonials"); }).catch((e) => toast(e.message, true)); } return;
    case "copy-link": return navigator.clipboard?.writeText(`${location.origin}/#testimonio`).then(() => toast("Enlace copiado. Envíaselo a tus clientes."), () => toast("No pude copiar el enlace", true));
    case "month-new": return openMonthForm();
    case "month-edit": return openMonthForm(id);
    case "month-del": if (confirmDel("este mes")) { S.months = S.months.filter((m) => m.id !== id); touch(); go("months"); } return;
    case "client-new": return openClientForm();
    case "client-edit": return openClientForm(id);
    case "client-del": if (confirmDel("este cliente")) { S.clients = S.clients.filter((c) => c.id !== id); touch(); go("clients"); } return;
    case "service-add": S.services.push({ id: uid("s"), icon: "sparkle", title: "Nuevo servicio", desc: "" }); touch(); return paint();
    case "service-del": if (confirmDel("este servicio")) { S.services.splice(i, 1); touch(); paint(); } return;
    case "service-up": [S.services[i - 1], S.services[i]] = [S.services[i], S.services[i - 1]]; touch(); return paint();
    case "cat-add": S.categories.push({ id: uniqueCatId("nueva"), name: "Nueva categoría" }); touch(); go("categories"); return;
    case "cat-del": {
      const c = S.categories[i];
      const used = S.projects.filter((p) => p.category === c.id).length;
      if (used) return toast(`Hay ${used} trabajos en «${c.name}». Cámbialos de categoría antes de borrarla.`, true);
      if (confirmDel("esta categoría")) { S.categories.splice(i, 1); touch(); go("categories"); }
      return;
    }
    case "copy-analysis": return navigator.clipboard?.writeText(analyze(S).narrative.join("\n\n")).then(() => toast("Análisis copiado"), () => toast("No pude copiar", true));
    case "clear-img": S.profile[b.dataset.key] = ""; touch(); applyLogo(); return paint();
    case "health": {
      const out = $("#healthOut"); out.hidden = false; out.textContent = "Probando…";
      return api("/api/health").then((r) => { out.textContent = JSON.stringify(r, null, 2); }, (e) => { out.textContent = `No se pudo probar: ${e.message}`; });
    }
    case "export": return exportData();
    case "reload": if (!dirty || confirm("Se perderán los cambios sin publicar. ¿Continuar?")) { safe(() => localStorage.removeItem(DRAFT_KEY)); dirty = false; loadSite().then((s) => { S = normalize(s); go(view); setStatus(); toast("Recargado desde lo publicado"); }); } return;
    case "clear-demo": {
      if (!confirm("¿Borrar todo el contenido de ejemplo?")) return;
      S.projects = S.projects.filter((x) => !x.demo); S.clients = S.clients.filter((x) => !x.demo); S.months = S.months.filter((x) => !x.demo);
      S.settings.demoContent = false; touch(); go(view); toast("Ejemplos borrados"); return;
    }
  }
});

function uniqueCatId(base) {
  let id = slug(base), n = 1;
  while (S.categories.some((c) => c.id === id)) id = `${slug(base)}-${++n}`;
  return id;
}

// Edición directa de campos (perfil, servicios, categorías) y filtros
$("#view").addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.filter) { filters[t.dataset.filter] = t.value; if (t.dataset.filter === "q") { const pos = t.selectionStart; paint(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); } return; }
  const path = t.dataset.bind;
  if (!path) return;
  let value = t.type === "radio" ? t.value : t.value;
  if (t.dataset.list === "lines") value = value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (t.dataset.num) value = Math.max(0, Number(value) || 0);
  const keys = path.split(".");
  let target = S;
  for (const k of keys.slice(0, -1)) target = target[k];
  target[keys.at(-1)] = value;
  // Si cambia una categoría mantenemos su id estable (los trabajos apuntan al id).
  touch();
});
$("#view").addEventListener("change", (e) => { if (e.target.dataset.filter === "cat") { filters.cat = e.target.value; paint(); } });

$("#view").addEventListener("change", async (e) => {
  const key = e.target.dataset?.upload;
  if (key && e.target.files[0]) {
    try {
      S.profile[key] = await uploadFile(e.target.files[0]);
      $(`#prev-${key}`).innerHTML = `<img src="${esc(S.profile[key])}" alt="">`;
      touch(); applyLogo(); toast("Imagen lista. Publica los cambios para verla en el sitio.");
    } catch (err) { toast(err.message, true); }
    return;
  }
  if (e.target.id !== "importIn" || !e.target.files[0]) return;
  try {
    const doc = JSON.parse(await e.target.files[0].text());
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.projects)) throw new Error();
    if (!confirm("Esto reemplaza tu contenido actual por el del respaldo. ¿Continuar?")) return;
    S = normalize({ ...S, ...doc, _source: S._source });
    touch(); go("home"); toast("Respaldo importado. Publica para aplicarlo en el sitio.");
  } catch { toast("Ese archivo no parece un respaldo válido.", true); }
});

function exportData() {
  const { _source, ...doc } = S;
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `lamont-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
