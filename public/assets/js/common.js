// Utilidades compartidas entre el sitio público y el panel de administración.

export const ICONS = "/assets/icons.svg";

/* ---------- texto y seguridad ---------- */
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Solo rutas propias o http(s). Evita javascript: y similares en enlaces guardados.
export function safeUrl(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

export const icon = (name, cls = "") =>
  `<svg class="ico ${cls}" aria-hidden="true"><use href="${ICONS}#${esc(name)}"></use></svg>`;

export const uid = (prefix = "id") => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export const slug = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- fechas ---------- */
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthName = (id) => MONTHS[Number(String(id).slice(5, 7)) - 1] ?? "";
export const monthLong = (id) => (id ? `${monthName(id)} ${String(id).slice(0, 4)}` : "");
export const monthShort = (id) => `${monthName(id).slice(0, 3)} ${String(id).slice(2, 4)}`;
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
export const thisMonth = () => new Date().toISOString().slice(0, 7);

/* ---------- datos ---------- */
export async function loadSite() {
  try {
    const res = await fetch("/api/data", { headers: { accept: "application/json" } });
    if (res.ok) {
      const doc = await res.json();
      // "settings" viene siempre del documento publicado (guarda qué novedades ya se aplicaron)
      if (doc && !doc.empty) return { ...(await seed()), ...doc, settings: doc.settings || {}, _source: "api" };
    }
  } catch {
    /* sin backend: se usa la semilla */
  }
  return { ...(await seed()), _source: "seed" };
}

async function seed() {
  const res = await fetch("/data/seed.json");
  return res.json();
}

export const SOCIALS = [
  { key: "instagram", label: "Instagram", icon: "instagram-logo", url: (h) => `https://instagram.com/${h}` },
  { key: "tiktok", label: "TikTok", icon: "tiktok-logo", url: (h) => `https://tiktok.com/@${h}` },
  { key: "youtube", label: "YouTube", icon: "youtube-logo", url: (h) => `https://youtube.com/@${h}` },
  { key: "linkedin", label: "LinkedIn", icon: "linkedin-logo", url: (h) => `https://linkedin.com/in/${h}` },
  { key: "behance", label: "Behance", icon: "behance-logo", url: (h) => `https://behance.net/${h}` },
  { key: "x", label: "X", icon: "x-logo", url: (h) => `https://x.com/${h}` },
  { key: "threads", label: "Threads", icon: "threads-logo", url: (h) => `https://threads.net/@${h}` },
  { key: "facebook", label: "Facebook", icon: "facebook-logo", url: (h) => `https://facebook.com/${h}` },
  { key: "twitch", label: "Twitch", icon: "twitch-logo", url: (h) => `https://twitch.tv/${h}` },
];

// Acepta @usuario o un enlace completo.
export function socialUrl(social, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return safeUrl(v);
  return social.url(v.replace(/^@/, ""));
}

export function normalize(site) {
  site.profile = { years: 8, photo: "", logo: "", ...(site.profile || {}) };
  site.profile.roles ||= [];
  site.profile.socials ||= {};
  for (const key of ["services", "categories", "clients", "projects", "months", "testimonials"]) site[key] ||= [];
  site.settings ||= {};
  applyMigrations(site);
  return site;
}

// Contenido que se agrega una sola vez a los datos ya publicados. La marca queda
// guardada al publicar, así que si luego lo borras desde el panel no vuelve a aparecer.
const MIGRATIONS = {
  "airbnb-v1": (site) => {
    if (!site.services.some((s) => s.id === "s8")) site.services.push({"id": "s8", "icon": "house", "title": "Estrategia para Airbnb", "desc": "Posiciono tu alojamiento en Airbnb para ganar buenas reseñas y más reservas, y creo su cuenta de Instagram con una estrategia para atraer seguidores y huéspedes."});
    if (!site.projects.some((p) => p.id === "p-airbnb")) site.projects.unshift({"id": "p-airbnb", "title": "De casi sin huéspedes a un Airbnb con reservas", "client": "", "category": "estrategia", "date": "", "description": "Un apartamento en Airbnb que casi no recibía huéspedes. Armé toda la estrategia: creé desde cero su cuenta de Instagram y la hice crecer con contenido pensado para atraer seguidores, y posicioné el anuncio en Airbnb para conseguir buenas reseñas. Resultado: muchos más seguidores, más reservas y hasta 2.000 USD de ganancia en un mes entre varios huéspedes.", "tags": ["Airbnb", "Instagram", "Reseñas", "Estrategia"], "cover": "", "media": [], "link": "", "featured": true, "visible": true, "demo": false});
  },
};

function applyMigrations(site) {
  const done = (site.settings.migrations ||= []);
  for (const [key, run] of Object.entries(MIGRATIONS)) {
    if (done.includes(key)) continue;
    run(site);
    done.push(key);
    site._migrated = true;
  }
}

/* ---------- multimedia ---------- */
// Convierte un enlace pegado por el usuario en algo que se pueda mostrar.
export function parseMedia(url) {
  const src = safeUrl(url);
  if (!src) return null;
  let u;
  try { u = new URL(src, location.origin); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    let id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
    if (m) id = m[2];
    if (id) {
      const vertical = u.pathname.includes("/shorts/");
      return { type: "embed", provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`, thumb: `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`, vertical, url: src };
    }
  }
  if (host.endsWith("vimeo.com")) {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    if (id) return { type: "embed", provider: "vimeo", src: `https://player.vimeo.com/video/${id}`, thumb: "", url: src };
  }
  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/d\/([\w-]+)/)?.[1] || u.searchParams.get("id");
    if (id) return { type: "embed", provider: "drive", src: `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`, thumb: "", url: src };
  }
  if (/\.(mp3|m4a|aac|ogg|opus|wav|weba)(\?|$)/i.test(u.pathname)) return { type: "audio", src, thumb: "", url: src };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) return { type: "video", src, thumb: "", url: src };
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u.pathname) || u.pathname.startsWith("/media/")) {
    return { type: /\.(mp4|webm)$/i.test(u.pathname) ? "video" : "image", src, thumb: src, url: src };
  }
  return { type: "link", src, thumb: "", url: src };
}

export const mediaKind = (m) => parseMedia(m.url)?.type ?? "link";

// Portada de un proyecto: imagen propia, o miniatura del primer medio.
export function coverOf(project) {
  if (safeUrl(project.cover)) return { kind: "image", src: safeUrl(project.cover) };
  for (const m of project.media || []) {
    const p = parseMedia(m.url);
    if (!p) continue;
    if (p.type === "image") return { kind: "image", src: p.src };
    if (p.thumb) return { kind: "image", src: p.thumb };
    if (p.type === "video") return { kind: "video", src: p.src };
  }
  return null;
}

/* ---------- análisis de la trayectoria ---------- */
const sum = (a) => a.reduce((x, y) => x + y, 0);
const DELIVERABLES = [
  ["videos", "videos editados"],
  ["designs", "piezas de diseño"],
  ["posts", "publicaciones"],
  ["campaigns", "campañas"],
];
export { DELIVERABLES };

export function monthsBetween(a, b) {
  const out = [];
  let [y, m] = a.split("-").map(Number);
  const [ey, em] = b.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const fmt = (n) => new Intl.NumberFormat("es").format(n);
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const join = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`);

/** Cruza proyectos y bitácora mensual y devuelve cifras + lectura en texto. */
export function analyze(site) {
  const projects = (site.projects || []).filter((p) => p.visible !== false);
  const byMonth = new Map();
  const get = (id) => {
    if (!byMonth.has(id)) byMonth.set(id, { id, clients: new Set(), projects: [], deliverables: { videos: 0, designs: 0, posts: 0, campaigns: 0 }, wins: "", notes: "", summary: "", logged: false });
    return byMonth.get(id);
  };
  for (const log of site.months || []) {
    if (!/^\d{4}-\d{2}$/.test(log.month || "")) continue;
    const m = get(log.month);
    m.logged = true;
    (log.clients || []).forEach((c) => c && m.clients.add(c));
    for (const [k] of DELIVERABLES) m.deliverables[k] += Number(log.deliverables?.[k]) || 0;
    m.wins = log.wins || "";
    m.notes = log.notes || "";
    m.summary = log.summary || "";
  }
  for (const p of projects) {
    if (!/^\d{4}-\d{2}$/.test(p.date || "")) continue;
    const m = get(p.date);
    m.projects.push(p);
    if (p.client) m.clients.add(p.client);
  }

  const months = [...byMonth.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const m of months) {
    m.clientList = [...m.clients];
    m.deliverableTotal = sum(Object.values(m.deliverables));
    m.activity = m.projects.length + m.deliverableTotal;
  }

  const result = { months, empty: months.length === 0, projects: projects.length, narrative: [], highlights: [] };
  const clientMonths = new Map();
  for (const m of months) for (const c of m.clientList) clientMonths.set(c, (clientMonths.get(c) || 0) + 1);
  const clientProjects = new Map();
  for (const p of projects) if (p.client) clientProjects.set(p.client, (clientProjects.get(p.client) || 0) + 1);

  const allClients = new Set([...clientMonths.keys(), ...(site.clients || []).map((c) => c.name)]);
  const totals = Object.fromEntries(DELIVERABLES.map(([k]) => [k, sum(months.map((m) => m.deliverables[k]))]));
  const catCount = new Map();
  for (const p of projects) catCount.set(p.category, (catCount.get(p.category) || 0) + 1);
  const catName = (id) => (site.categories || []).find((c) => c.id === id)?.name || id;

  Object.assign(result, {
    clients: allClients.size,
    activeMonths: months.length,
    totals,
    deliveredTotal: sum(Object.values(totals)),
    first: months[0]?.id,
    last: months.at(-1)?.id,
    categories: [...catCount].map(([id, n]) => ({ id, name: catName(id), n })).sort((a, b) => b.n - a.n),
    topClients: [...allClients]
      .map((name) => ({ name, months: clientMonths.get(name) || 0, projects: clientProjects.get(name) || 0 }))
      .sort((a, b) => b.months + b.projects - (a.months + a.projects) || a.name.localeCompare(b.name)),
  });
  if (result.empty) return result;

  const busiest = [...months].sort((a, b) => b.activity - a.activity)[0];
  const repeat = [...clientMonths].filter(([, n]) => n >= 2).length;
  const span = monthsBetween(result.first, result.last).length;
  result.span = span;
  result.busiest = busiest;
  result.repeatClients = repeat;
  result.retention = clientMonths.size ? Math.round((repeat / clientMonths.size) * 100) : 0;

  // racha más larga de meses consecutivos con actividad
  let best = 1, run = 1;
  for (let i = 1; i < months.length; i++) {
    const gap = monthsBetween(months[i - 1].id, months[i].id).length;
    run = gap === 2 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  result.streak = best;

  // tendencia: últimos 3 meses del registro vs. los 3 anteriores
  const tail = months.slice(-3), before = months.slice(-6, -3);
  if (before.length) {
    const a = sum(tail.map((m) => m.activity)) / tail.length;
    const b = sum(before.map((m) => m.activity)) / before.length;
    result.trend = b > 0 ? Math.round(((a - b) / b) * 100) : null;
  }

  /* lectura en texto (primera persona, sin inventar datos) */
  const n = result.narrative;
  const years = Number(site.profile?.years) || 0;
  if (years > 0) n.push(`Llevo más de ${years} años creando contenido para marcas y creadores como editor, diseñador y estratega.`);
  n.push(
    `Entre ${monthLong(result.first)} y ${monthLong(result.last)} he trabajado con ${plural(result.clients, "cliente", "clientes")} a lo largo de ${plural(result.activeMonths, "mes activo", "meses activos")}` +
      (result.projects ? `, con ${plural(result.projects, "proyecto publicado", "proyectos publicados")} en este portafolio.` : ".")
  );
  const parts = DELIVERABLES.filter(([k]) => totals[k] > 0).map(([k, label]) => `${fmt(totals[k])} ${label}`);
  if (parts.length) n.push(`En ese tiempo entregué ${join(parts)}.`);
  if (busiest.activity > 0) n.push(`El mes más intenso fue ${monthLong(busiest.id)}${busiest.clientList.length ? `, con ${plural(busiest.clientList.length, "cliente", "clientes")} a la vez` : ""}.`);
  if (clientMonths.size > 1) {
    n.push(repeat
      ? `${plural(repeat, "cliente volvió", "clientes volvieron")} a trabajar conmigo en más de un mes (${result.retention}% de repetición).`
      : "Todos los clientes registrados hasta ahora fueron de un solo mes; la relación a largo plazo es la meta siguiente.");
  }
  if (result.categories[0]) n.push(`Mi trabajo se concentra sobre todo en ${result.categories[0].name.toLowerCase()}${result.categories[1] ? `, seguido de ${result.categories[1].name.toLowerCase()}` : ""}.`);
  if (typeof result.trend === "number" && Math.abs(result.trend) >= 5) {
    n.push(result.trend > 0 ? `Los últimos 3 meses tuvieron ${result.trend}% más actividad que los 3 anteriores.` : `Los últimos 3 meses tuvieron ${Math.abs(result.trend)}% menos actividad que los 3 anteriores.`);
  }

  result.highlights = [
    result.topClients[0] && result.topClients[0].months + result.topClients[0].projects > 0 && { label: "Cliente más constante", value: result.topClients[0].name },
    { label: "Mes más activo", value: cap(monthLong(busiest.id)) },
    { label: "Racha más larga", value: plural(best, "mes seguido", "meses seguidos") },
    result.categories[0] && { label: "Especialidad principal", value: result.categories[0].name },
  ].filter(Boolean);
  return result;
}

// Resumen de un solo mes, listo para pegar en la página.
export function monthSummary(m) {
  const bits = [];
  if (m.clientList?.length) bits.push(`Trabajé con ${join(m.clientList)}`);
  const parts = DELIVERABLES.filter(([k]) => m.deliverables[k] > 0).map(([k, label]) => `${fmt(m.deliverables[k])} ${label}`);
  if (parts.length) bits.push(`entregué ${join(parts)}`);
  let text = bits.length ? `${cap(bits.join(" y "))}.` : "";
  if (m.projects?.length) text += ` Proyectos del mes: ${join(m.projects.map((p) => p.title))}.`;
  if (m.wins) text += ` Logro: ${m.wins.replace(/\.?$/, ".")}`;
  return text.trim();
}
