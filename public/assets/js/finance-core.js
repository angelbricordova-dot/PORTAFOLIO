// Cálculos de finanzas. Funciones puras: no tocan el DOM ni la red.
// Los importes se suman en centavos (enteros) para no arrastrar errores de decimales.

export const CATEGORIES = ["Pago a equipo", "Herramientas y software", "Publicidad", "Impuestos y comisiones", "Otros"];
export const TEAM_CATEGORY = CATEGORIES[0];
export const METHODS = ["Transferencia", "Zelle", "PayPal", "Efectivo", "Cripto", "Otro"];
export const CLIENT_STATES = { prospecto: "Prospecto", activo: "Activo", pausado: "Pausado", terminado: "Terminado" };
export const PAY_TYPES = { mensual: "Mensual", proyecto: "Por proyecto", entrega: "Por entrega" };

export const cents = (v) => Math.round((Number(v) || 0) * 100);
export const fromCents = (c) => c / 100;

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const usd = (c, { round = false } = {}) => (round ? USD0 : USD).format(c / 100);
export const signed = (c) => (c > 0 ? "+" : c < 0 ? "−" : "") + USD.format(Math.abs(c) / 100);
// 1,250 → $1.3K (para los ejes de la gráfica)
export const compact = (c) => {
  const v = Math.abs(c) / 100, s = c < 0 ? "−" : "";
  if (v >= 1e6) return `${s}$${+(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${s}$${+(v / 1e3).toFixed(1)}K`;
  return `${s}$${Math.round(v)}`;
};

// Acepta "1,250.50", "1250,5" o "1.250,50"
export function parseMoney(text) {
  let t = String(text ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) t = lastDot > lastComma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  else if (lastComma >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export const monthOf = (d) => String(d || "").slice(0, 7);
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const thisMonth = () => todayStr().slice(0, 7);
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** { mode: 'month'|'3m'|'year'|'all', month, year } → { from, to } con meses 'YYYY-MM' (null = sin límite) */
export function periodRange(p, now = thisMonth()) {
  if (p.mode === "all") return { from: null, to: null };
  if (p.mode === "year") return { from: `${p.year || now.slice(0, 4)}-01`, to: `${p.year || now.slice(0, 4)}-12` };
  if (p.mode === "3m") return { from: addMonths(now, -2), to: now };
  const m = p.month || now;
  return { from: m, to: m };
}
export const inRange = (date, r) => {
  const m = monthOf(date);
  return !!m && (!r.from || m >= r.from) && (!r.to || m <= r.to);
};

/** Lo que cada gasto cuesta a cada cliente; lo no asignado es gasto general. */
export function allocOf(e) {
  const total = cents(e.amount);
  const rows = (e.alloc || []).map((a) => ({ clientId: a.clientId, c: cents(a.amount) })).filter((a) => a.clientId && a.c > 0);
  let used = 0;
  const out = [];
  for (const a of rows) {
    const c = Math.min(a.c, total - used);
    if (c > 0) { out.push({ clientId: a.clientId, c }); used += c; }
  }
  return { rows: out, general: total - used };
}

const blank = () => ({ income: 0, incomePending: 0, cost: 0, costPending: 0 });

/** Resumen del periodo: base de caja (ingresos cobrados − gastos pagados). Lo pendiente va aparte. */
export function summarize(F, range) {
  const t = { income: 0, incomePending: 0, expense: 0, expensePending: 0, general: 0, generalPending: 0 };
  const byClient = new Map(), byWorker = new Map();
  const get = (map, id) => { if (!map.has(id)) map.set(id, blank()); return map.get(id); };
  for (const e of F.entries) {
    if (!inRange(e.date, range)) continue;
    const c = cents(e.amount);
    const paid = e.status === (e.kind === "income" ? "cobrado" : "pagado");
    if (e.kind === "income") {
      if (paid) t.income += c; else t.incomePending += c;
      if (e.clientId) { const r = get(byClient, e.clientId); if (paid) r.income += c; else r.incomePending += c; }
    } else {
      if (paid) t.expense += c; else t.expensePending += c;
      const { rows, general } = allocOf(e);
      for (const a of rows) { const r = get(byClient, a.clientId); if (paid) r.cost += a.c; else r.costPending += a.c; }
      if (paid) t.general += general; else t.generalPending += general;
      if (e.workerId) { const w = get(byWorker, e.workerId); if (paid) w.cost += c; else w.costPending += c; }
    }
  }
  t.net = t.income - t.expense;
  t.margin = t.income > 0 ? t.net / t.income : null;
  const clients = [...byClient].map(([id, r]) => ({ id, ...r, profit: r.income - r.cost, margin: r.income > 0 ? (r.income - r.cost) / r.income : null }));
  return { ...t, clients, workers: [...byWorker].map(([id, r]) => ({ id, paid: r.cost, pending: r.costPending })) };
}

/** Ingresos y gastos de cada mes, de más antiguo a más reciente. */
export function monthlySeries(F, endMonth = thisMonth(), n = 12) {
  const months = Array.from({ length: n }, (_, i) => addMonths(endMonth, i - n + 1));
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = months.map((month) => ({ month, income: 0, expense: 0 }));
  for (const e of F.entries) {
    const i = idx.get(monthOf(e.date));
    if (i === undefined) continue;
    const c = cents(e.amount);
    if (e.kind === "income" && e.status === "cobrado") rows[i].income += c;
    if (e.kind === "expense" && e.status === "pagado") rows[i].expense += c;
  }
  return rows.map((r) => ({ ...r, net: r.income - r.expense }));
}

/** Lo que entra y lo que cuesta cada mes si todo sigue igual (clientes y equipo activos con tarifa mensual). */
export function recurring(F) {
  let mrr = 0, payroll = 0;
  for (const c of F.clients) if (c.status === "activo" && c.deal?.type === "mensual") mrr += cents(c.deal.amount);
  for (const w of F.team) if (w.status === "activo" && w.pay?.type === "mensual") payroll += cents(w.pay.amount);
  return { mrr, payroll, net: mrr - payroll };
}

/** Reparte un importe según porcentajes (el último absorbe el redondeo). */
export function splitByPercent(amount, alloc) {
  const total = cents(amount);
  const rows = (alloc || []).filter((a) => a.clientId && a.percent > 0);
  let used = 0;
  return rows.map((a, i) => {
    const c = i === rows.length - 1 && rows.reduce((s, r) => s + r.percent, 0) >= 99.99 ? total - used : Math.round((total * a.percent) / 100);
    used += c;
    return { clientId: a.clientId, amount: fromCents(c) };
  });
}

/** Totales históricos de un cliente (todas las fechas). */
export function clientLifetime(F, clientId) {
  const r = summarize({ entries: F.entries }, { from: null, to: null }).clients.find((c) => c.id === clientId);
  return r || { id: clientId, ...blank(), profit: 0, margin: null };
}

const csvCell = (v, sep) => { const s = String(v ?? ""); return new RegExp(`[${sep}"\\n\\r]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV de movimientos. es = true → separador «;» y coma decimal (Excel en español). */
export function toCSV(F, entries, { es = true } = {}) {
  const sep = es ? ";" : ",";
  const name = (id, list) => list.find((x) => x.id === id)?.name || "";
  const num = (v) => (es ? String(v.toFixed(2)).replace(".", ",") : v.toFixed(2));
  const head = ["Fecha", "Tipo", "Cliente", "Concepto", "Categoría", "Trabajador", "Monto (USD)", "Estado", "Método"];
  const lines = [head.map((h) => csvCell(h, sep)).join(sep)];
  for (const e of [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const clientLabel = e.kind === "income" ? name(e.clientId, F.clients) : (e.alloc || []).map((a) => name(a.clientId, F.clients)).filter(Boolean).join(" + ");
    lines.push([e.date, e.kind === "income" ? "Ingreso" : "Gasto", clientLabel, e.desc, e.category, name(e.workerId, F.team), num(Number(e.amount) || 0), e.status, e.method].map((v) => csvCell(v, sep)).join(sep));
  }
  return "﻿" + lines.join("\r\n");
}
