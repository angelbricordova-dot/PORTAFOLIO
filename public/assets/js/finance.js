// Panel de finanzas (privado): clientes, equipo, ingresos y gastos, y la ganancia real por cliente.
// Los datos viven en /api/finance (solo con sesión) y se guardan solos cada vez que cambias algo.
import { esc, icon, uid } from "./common.js";
import * as C from "./finance-core.js";

const { cents, usd, signed, compact } = C;
const COLOR_IN = "#2b5fd9", COLOR_OUT = "#b8860b"; // validados: distintos para daltonismo y con contraste suficiente

let ctx, F = null, rev = 0, loadError = "";
let loading = false, saveState = "ok", saveTimer = 0, saving = false, again = false;
let tab = "resumen", showTable = false;
let period = { mode: "month", month: C.thisMonth(), year: String(new Date().getFullYear()) };
let mv = { kind: "all", client: "all", status: "all", q: "" };

const $ = (sel, root = document) => root.querySelector(sel);
const clientName = (id) => F.clients.find((c) => c.id === id)?.name || "Cliente eliminado";
const workerName = (id) => F.team.find((w) => w.id === id)?.name || "";
const monthLabel = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString("es", { month: "short", year: "numeric" }).replace(".", "");
const monthLong = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString("es", { month: "long", year: "numeric" });
const dateLabel = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, "") : "Sin fecha");
const pct = (m) => (m === null ? "—" : `${Math.round(m * 100)}%`);

/* ============ Carga y guardado ============ */
async function load() {
  if (loading) return;
  loading = true; loadError = "";
  try {
    const out = await ctx.api("/api/finance");
    F = out.doc || { clients: [], team: [], entries: [] };
    F.clients ||= []; F.team ||= []; F.entries ||= [];
    rev = out.rev || 0;
  } catch (e) {
    if (e.message !== "sesión") loadError = e.message || "No se pudieron cargar los datos";
  } finally { loading = false; ctx.repaint(); }
}

function queueSave() {
  saveState = "saving";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 600);
  paintStatus();
}

async function flush() {
  if (saving) { again = true; return; }
  saving = true;
  try {
    const out = await ctx.api("/api/finance", { method: "PUT", body: { doc: F, baseRev: rev } });
    rev = out.rev;
    saveState = "ok";
  } catch (e) {
    saveState = e.status === 409 ? "conflict" : "error";
    if (e.message !== "sesión") ctx.toast(e.message || "No se pudo guardar", true);
  } finally {
    saving = false;
    if (again && saveState !== "conflict") { again = false; queueSave(); }
    paintStatus();
  }
}

function paintStatus() {
  const el = $("#finStatus");
  if (!el) return;
  el.className = `fstatus fstatus--${saveState}`;
  el.textContent = { ok: "Guardado", saving: "Guardando…", error: "No se pudo guardar. Se reintenta al siguiente cambio.", conflict: "Hay cambios más recientes en otro dispositivo" }[saveState];
}

/* ============ Estructura ============ */
export function initFinance(c) {
  ctx = c;
  const view = $("#view");
  view.addEventListener("click", onClick);
  view.addEventListener("input", onFilter);
  view.addEventListener("change", onFilter);
  view.addEventListener("pointerover", onTip);
  view.addEventListener("pointermove", onTip);
  view.addEventListener("pointerout", hideTip);
  view.addEventListener("focusin", onTip);
  view.addEventListener("focusout", hideTip);
  const dlg = $("#dlgForm");
  dlg.addEventListener("click", onDialogClick);
  dlg.addEventListener("input", onDialogInput);
  dlg.addEventListener("change", onDialogInput);
  addEventListener("beforeunload", (e) => { if (saveState === "saving" || saving) { e.preventDefault(); e.returnValue = ""; } });
}

export function financeHTML() {
  if (loadError) return `<div class="empty"><strong>No se pudieron cargar las finanzas</strong><span>${esc(loadError)}</span><button class="btn btn--accent" data-fa="retry">Reintentar</button></div>`;
  if (!F) { load(); return `<div class="empty"><strong>Cargando finanzas…</strong></div>`; }
  const tabs = [["resumen", "Resumen", "chart-bar"], ["movimientos", "Movimientos", "list"], ["clientes", "Clientes", "users"], ["equipo", "Equipo", "users-three"]];
  return `
    <div class="fhead">
      <div class="seg" role="tablist" aria-label="Finanzas">${tabs.map(([id, label, ico]) => `<label><input type="radio" name="ftab" value="${id}" ${tab === id ? "checked" : ""} data-ff="tab"><span>${icon(ico)} ${label}</span></label>`).join("")}</div>
      <span class="fstatus fstatus--${saveState}" id="finStatus" role="status">${{ ok: "Guardado", saving: "Guardando…", error: "No se pudo guardar. Se reintenta al siguiente cambio.", conflict: "Hay cambios más recientes en otro dispositivo" }[saveState]}</span>
    </div>
    ${saveState === "conflict" ? `<div class="banner"><p><b>Otro dispositivo guardó cambios más nuevos.</b> Recarga los datos para no pisarlos. Lo que acabas de cambiar aquí no se guardó.</p><button class="btn btn--sm" data-fa="reload">Recargar</button></div>` : ""}
    ${({ resumen, movimientos, clientes, equipo })[tab]()}`;
}

const periodBar = () => {
  const r = C.periodRange(period);
  const label = period.mode === "all" ? "Todo el historial" : r.from === r.to ? cap(monthLong(r.from)) : `${cap(monthLong(r.from))} – ${monthLong(r.to)}`;
  return `<div class="toolbar fperiod">
    <div class="field" style="flex:0 1 190px"><label class="sr-only" for="fp-mode">Periodo</label><select id="fp-mode" data-ff="pmode">${[["month", "Un mes"], ["3m", "Últimos 3 meses"], ["year", "Un año"], ["all", "Todo"]].map(([v, l]) => `<option value="${v}" ${period.mode === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${period.mode === "month" ? `<div class="field" style="flex:0 1 190px"><label class="sr-only" for="fp-month">Mes</label><input id="fp-month" type="month" value="${esc(period.month)}" data-ff="pmonth"></div>` : ""}
    ${period.mode === "year" ? `<div class="field" style="flex:0 1 120px"><label class="sr-only" for="fp-year">Año</label><input id="fp-year" type="number" min="2000" max="2100" value="${esc(period.year)}" data-ff="pyear"></div>` : ""}
    <span class="help">${esc(label)}</span></div>`;
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ============ Resumen ============ */
function resumen() {
  const range = C.periodRange(period);
  const s = C.summarize(F, range);
  const rec = C.recurring(F);
  const teamUnassigned = unassignedTeamCost(range);
  const hasData = F.entries.length > 0;
  const kpi = (label, value, extra = "", cls = "") => `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${extra ? `<small>${extra}</small>` : ""}</div>`;
  return `
    ${periodBar()}
    ${!hasData ? `<div class="banner"><p><b>Empieza por tres pasos:</b> 1) agrega tus <b>clientes</b>, 2) agrega a tu <b>equipo</b>, 3) registra tus <b>ingresos y gastos</b> en Movimientos. El resumen se arma solo.</p><button class="btn btn--sm btn--accent" data-fa="goto-clientes">Agregar clientes</button></div>` : ""}
    <div class="kpis fkpis">
      ${kpi("Ganancia neta", `<span class="${s.net < 0 ? "neg" : ""}">${signed(s.net).replace(/^\+/, "")}</span>`, s.margin === null ? "Sin ingresos cobrados" : `Margen ${pct(s.margin)}`, "kpi--hero")}
      ${kpi("Ingresos cobrados", usd(s.income), s.incomePending ? `${usd(s.incomePending)} por cobrar` : "")}
      ${kpi("Gastos pagados", usd(s.expense), s.expensePending ? `${usd(s.expensePending)} por pagar` : "")}
    </div>
    ${rec.mrr || rec.payroll ? `<p class="fnote">${icon("info")} <span>Si todo sigue igual, cada mes <b>entran ${usd(rec.mrr)}</b> de clientes con tarifa mensual y el equipo con sueldo mensual cuesta <b>${usd(rec.payroll)}</b>: quedan <b>${usd(rec.net)}</b> antes de otros gastos.</span></p>` : ""}
    ${teamUnassigned > 0 ? `<div class="banner"><p><b>${usd(teamUnassigned)} en pagos al equipo no están asignados a ningún cliente.</b> Asígnalos al editar cada pago para ver la ganancia real por cliente.</p><button class="btn btn--sm" data-fa="goto-movs-team">Ver esos pagos</button></div>` : ""}
    ${chartPanel(range)}
    ${clientsTable(s, range)}
    ${teamTable(s)}
    <section class="panel"><h2>Respaldo financiero</h2>
      <p class="muted">Descarga todo tu control financiero en un archivo. Guárdalo de vez en cuando: solo tú tienes estos datos.</p>
      <div class="toolbar"><button class="btn btn--ghost" data-fa="backup-export">${icon("file-arrow-down")} Descargar respaldo</button>
        <label class="btn btn--ghost" for="finImport">${icon("file-arrow-up")} Importar respaldo</label><input id="finImport" type="file" accept="application/json" hidden data-ff="import"></div></section>`;
}

function unassignedTeamCost(range) {
  let t = 0;
  for (const e of F.entries) if (e.kind === "expense" && e.category === C.TEAM_CATEGORY && e.status === "pagado" && C.inRange(e.date, range)) t += C.allocOf(e).general;
  return t;
}

function niceTop(maxC) {
  const v = Math.max(maxC, 1) / 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 8, 10]) if (m * pow >= v) return Math.round(m * pow * 100);
  return Math.round(10 * pow * 100);
}

function chartPanel(range) {
  const end = range.to || C.thisMonth();
  const series = C.monthlySeries(F, end, 12);
  const top = niceTop(Math.max(...series.flatMap((r) => [r.income, r.expense])));
  const peak = series.reduce((b, r, i) => (r.income > series[b].income ? i : b), 0);
  const total = series.reduce((a, r) => ({ i: a.i + r.income, e: a.e + r.expense }), { i: 0, e: 0 });
  const legend = `<div class="flegend"><span><i class="sw" style="background:${COLOR_IN}"></i>Ingresos cobrados</span><span><i class="sw" style="background:${COLOR_OUT}"></i>Gastos pagados</span>
    <button class="linkbtn" data-fa="chart-table">${showTable ? "Ver gráfica" : "Ver tabla"}</button></div>`;
  const body = showTable
    ? `<div class="ftable-wrap"><table class="ftab"><thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Ganancia</th></tr></thead><tbody>${series.map((r) => `<tr><td>${esc(cap(monthLabel(r.month)))}</td><td>${usd(r.income)}</td><td>${usd(r.expense)}</td><td class="${r.net < 0 ? "neg" : ""}">${signed(r.net)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="fplot" role="img" aria-label="Ingresos y gastos de los últimos 12 meses. Ingresos totales ${usd(total.i)}, gastos totales ${usd(total.e)}.">
        ${[0, 25, 50, 75, 100].map((p) => `<div class="fgrid" style="--p:${p / 100}"><span>${compact((top * p) / 100)}</span></div>`).join("")}
        <div class="fcols">${series.map((r, i) => {
          const h = (c) => (c > 0 ? Math.max(1.5, (c / top) * 100) : 0);
          return `<div class="fcol" tabindex="0" data-m="${esc(cap(monthLabel(r.month)))}" data-inc="${r.income}" data-exp="${r.expense}" aria-label="${esc(cap(monthLabel(r.month)))}: ingresos ${usd(r.income)}, gastos ${usd(r.expense)}">
            <div class="fbars"><i class="fbar" style="height:${h(r.income)}%;background:${COLOR_IN}"></i><i class="fbar" style="height:${h(r.expense)}%;background:${COLOR_OUT}"></i>
              ${i === peak && r.income > 0 ? `<b class="fval" style="bottom:calc(${h(r.income)}% + 4px)">${compact(r.income)}</b>` : ""}</div>
            <em>${esc(monthLabel(r.month).split(" ")[0])}</em></div>`;
        }).join("")}</div></div>`;
  return `<section class="panel"><div class="panel__head"><h2>Ingresos y gastos, 12 meses hasta ${esc(monthLabel(end))}</h2></div>${legend}${body}</section>`;
}

function clientsTable(s, range) {
  const active = F.clients.filter((c) => c.status === "activo").map((c) => c.id);
  const ids = new Set([...s.clients.map((c) => c.id), ...active]);
  const rows = [...ids].map((id) => s.clients.find((c) => c.id === id) || { id, income: 0, incomePending: 0, cost: 0, costPending: 0, profit: 0, margin: null })
    .sort((a, b) => b.profit - a.profit || clientName(a.id).localeCompare(clientName(b.id)));
  const totalProfit = rows.reduce((t, r) => t + r.profit, 0);
  if (!rows.length && !s.general) return `<section class="panel"><h2>Ganancia por cliente</h2><div class="empty"><strong>Todavía no hay movimientos en este periodo</strong><span>Registra ingresos y gastos ligados a tus clientes para ver cuánto te deja cada uno.</span></div></section>`;
  return `<section class="panel"><div class="panel__head"><h2>Ganancia por cliente</h2></div>
    <p class="muted">Ganancia = lo cobrado al cliente − lo que pagaste para atenderlo (equipo y otros gastos asignados a él).</p>
    <div class="ft" role="table" aria-label="Ganancia por cliente">
      <div class="ft__row ft__head" role="row"><span role="columnheader">Cliente</span><span role="columnheader">Cobrado</span><span role="columnheader">Costos</span><span role="columnheader">Ganancia</span><span role="columnheader">Margen</span></div>
      ${rows.map((r) => `<div class="ft__row" role="row">
        <span class="ft__name" role="cell"><b>${esc(clientName(r.id))}</b>${r.incomePending ? `<small>${usd(r.incomePending)} por cobrar</small>` : ""}</span>
        <span data-l="Cobrado" role="cell">${usd(r.income)}</span><span data-l="Costos" role="cell">${usd(r.cost)}</span>
        <span data-l="Ganancia" role="cell" class="ft__profit ${r.profit < 0 ? "neg" : ""}">${signed(r.profit).replace(/^\+/, "")}</span>
        <span data-l="Margen" role="cell" class="ft__margin">${marginBar(r.margin)}<em>${pct(r.margin)}</em></span></div>`).join("")}
      ${s.general ? `<div class="ft__row ft__general" role="row"><span class="ft__name" role="cell"><b>Gastos generales</b><small>Sin cliente: herramientas, impuestos, etc.</small></span><span role="cell"></span><span data-l="Costos" role="cell">${usd(s.general)}</span><span data-l="Ganancia" role="cell" class="neg">−${usd(s.general)}</span><span role="cell"></span></div>` : ""}
      <div class="ft__row ft__total" role="row"><span role="cell"><b>Total del periodo</b></span><span data-l="Cobrado" role="cell">${usd(s.income)}</span><span data-l="Costos" role="cell">${usd(s.expense)}</span><span data-l="Ganancia" role="cell" class="${s.net < 0 ? "neg" : ""}">${signed(s.net).replace(/^\+/, "")}</span><span data-l="Margen" role="cell">${pct(s.margin)}</span></div>
    </div></section>`;
}

const marginBar = (m) => {
  if (m === null) return `<i class="mbar"></i>`;
  const w = Math.min(100, Math.abs(m) * 100);
  return `<i class="mbar" aria-hidden="true"><u style="width:${w}%" class="${m < 0 ? "neg" : ""}"></u></i>`;
};

function teamTable(s) {
  const rows = F.team.filter((w) => w.status === "activo" || s.workers.some((x) => x.id === w.id))
    .map((w) => ({ w, ...(s.workers.find((x) => x.id === w.id) || { paid: 0, pending: 0 }) }));
  if (!rows.length) return "";
  return `<section class="panel"><h2>Pagos al equipo en este periodo</h2><div class="ft ft--team" role="table">
    <div class="ft__row ft__head" role="row"><span role="columnheader">Trabajador</span><span role="columnheader">Pagado</span><span role="columnheader">Pendiente</span><span role="columnheader">Tarifa</span></div>
    ${rows.map((r) => `<div class="ft__row" role="row"><span class="ft__name" role="cell"><b>${esc(r.w.name)}</b><small>${esc(r.w.role || "")}</small></span><span data-l="Pagado" role="cell">${usd(r.paid)}</span><span data-l="Pendiente" role="cell">${r.pending ? usd(r.pending) : "—"}</span><span data-l="Tarifa" role="cell">${rateLabel(r.w.pay)}</span></div>`).join("")}</div></section>`;
}
const rateLabel = (d) => (d?.amount ? `${usd(cents(d.amount))} ${{ mensual: "/ mes", proyecto: "/ proyecto", entrega: "/ entrega" }[d.type] || ""}` : "—");

/* ============ Movimientos ============ */
function visibleEntries() {
  const range = C.periodRange(period);
  const q = mv.q.trim().toLowerCase();
  return F.entries.filter((e) => C.inRange(e.date, range)
    && (mv.kind === "all" || e.kind === mv.kind)
    && (mv.status === "all" || (mv.status === "pendiente" ? e.status === "pendiente" : e.status !== "pendiente"))
    && (mv.client === "all" || (e.kind === "income" ? e.clientId === mv.client : (e.alloc || []).some((a) => a.clientId === mv.client)))
    && (!q || `${e.desc} ${e.category} ${workerName(e.workerId)} ${e.kind === "income" ? clientName(e.clientId) : ""}`.toLowerCase().includes(q)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function movimientos() {
  const list = visibleEntries();
  const inc = list.filter((e) => e.kind === "income" && e.status === "cobrado").reduce((t, e) => t + cents(e.amount), 0);
  const out = list.filter((e) => e.kind === "expense" && e.status === "pagado").reduce((t, e) => t + cents(e.amount), 0);
  return `
    ${periodBar()}
    <div class="toolbar">
      <button class="btn btn--accent" data-fa="income-new">${icon("plus")} Ingreso</button>
      <button class="btn" data-fa="expense-new">${icon("plus")} Gasto</button>
      <button class="btn btn--ghost btn--sm" data-fa="gen-cobros" title="Crea los cobros pendientes de los clientes con tarifa mensual">Generar cobros del mes</button>
      <button class="btn btn--ghost btn--sm" data-fa="gen-sueldos" title="Crea los sueldos pendientes del equipo con sueldo mensual">Generar sueldos del mes</button>
    </div>
    <div class="toolbar">
      <div class="field" style="flex:1 1 200px"><label class="sr-only" for="fm-q">Buscar</label><input id="fm-q" type="search" placeholder="Buscar por concepto, cliente o trabajador" value="${esc(mv.q)}" data-ff="mvq"></div>
      <div class="field" style="flex:0 1 150px"><label class="sr-only" for="fm-kind">Tipo</label><select id="fm-kind" data-ff="mvkind">${[["all", "Todo"], ["income", "Ingresos"], ["expense", "Gastos"]].map(([v, l]) => `<option value="${v}" ${mv.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field" style="flex:0 1 180px"><label class="sr-only" for="fm-client">Cliente</label><select id="fm-client" data-ff="mvclient"><option value="all">Todos los clientes</option>${F.clients.map((c) => `<option value="${esc(c.id)}" ${mv.client === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="field" style="flex:0 1 160px"><label class="sr-only" for="fm-status">Estado</label><select id="fm-status" data-ff="mvstatus">${[["all", "Todos"], ["pendiente", "Pendientes"], ["hecho", "Cobrados / pagados"]].map(([v, l]) => `<option value="${v}" ${mv.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <div class="list">${list.length ? list.map(entryRow).join("") : `<div class="empty"><strong>No hay movimientos con estos filtros</strong><span>Registra un ingreso cuando cobres a un cliente y un gasto cuando pagues a alguien.</span></div>`}</div>
    ${list.length ? `<div class="toolbar fsum"><span class="help">${list.length} movimientos · cobrado ${usd(inc)} · pagado ${usd(out)}</span>
      <button class="btn btn--ghost btn--sm" data-fa="csv-es">${icon("download-simple")} CSV para Excel</button><button class="btn btn--ghost btn--sm" data-fa="csv-std" title="Separado por comas, con punto decimal">CSV estándar</button></div>` : ""}`;
}

const badge = (e) => {
  const done = e.status !== "pendiente";
  const label = e.kind === "income" ? (done ? "Cobrado" : "Por cobrar") : done ? "Pagado" : "Por pagar";
  return `<button class="fbadge ${done ? "ok" : "wait"}" data-fa="entry-toggle" data-id="${esc(e.id)}" title="Cambiar estado" aria-label="${label}. Pulsa para cambiar">${icon(done ? "check-circle" : "clock-counter-clockwise")} ${label}</button>`;
};

function entryRow(e) {
  const isIn = e.kind === "income";
  const who = isIn ? clientName(e.clientId) : [e.workerId && workerName(e.workerId), ...(e.alloc || []).map((a) => clientName(a.clientId))].filter(Boolean).join(" → ");
  const alloc = !isIn ? C.allocOf(e) : null;
  return `<article class="item fentry" style="grid-template-columns:minmax(0,1fr) auto auto">
    <div style="padding:6px 8px"><h3>${esc(e.desc || (isIn ? "Ingreso" : e.category))}</h3>
      <div class="meta"><span>${esc(dateLabel(e.date))}</span><span class="tag">${esc(isIn ? "Ingreso" : e.category)}</span>${who ? `<span>${esc(who)}</span>` : ""}${!isIn && alloc.general > 0 && (e.alloc || []).length ? `<span>${usd(alloc.general)} general</span>` : ""}${!isIn && !(e.alloc || []).length ? `<span class="muted">Sin cliente asignado</span>` : ""}${e.method ? `<span>${esc(e.method)}</span>` : ""}</div></div>
    <div class="fentry__amt"><b class="${isIn ? "pos" : ""}">${isIn ? "+" : "−"}${usd(cents(e.amount))}</b>${badge(e)}</div>
    <div class="item__actions"><button class="icon-btn" data-fa="entry-edit" data-id="${esc(e.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button><button class="icon-btn danger" data-fa="entry-del" data-id="${esc(e.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button></div></article>`;
}

/* ============ Clientes y equipo ============ */
function clientes() {
  const list = [...F.clients].sort((a, b) => Object.keys(C.CLIENT_STATES).indexOf(a.status) - Object.keys(C.CLIENT_STATES).indexOf(b.status) || a.name.localeCompare(b.name));
  const siteNames = ctx.siteClientNames().filter((n) => !F.clients.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  return `
    <div class="toolbar"><button class="btn btn--accent" data-fa="client-new">${icon("plus")} Nuevo cliente</button>
      ${siteNames.length ? `<button class="btn btn--ghost" data-fa="client-import">Traer ${siteNames.length} del portafolio</button>` : ""}
      <span class="help">Clientes y prospectos con quienes trabajas. Esta lista es privada.</span></div>
    <div class="list">${list.length ? list.map((c) => {
      const life = C.clientLifetime(F, c.id);
      return `<article class="item" style="grid-template-columns:minmax(0,1fr) auto"><div style="padding:6px 8px">
        <h3>${esc(c.name)} <span class="tag fstate fstate--${esc(c.status)}">${esc(C.CLIENT_STATES[c.status])}</span></h3>
        <div class="meta"><span>${esc(c.service || "Sin servicio indicado")}</span><span>${rateLabel(c.deal)}</span>${c.since ? `<span>Desde ${esc(dateLabel(c.since))}</span>` : ""}${c.contact ? `<span>${esc(c.contact)}</span>` : ""}</div>
        <div class="meta"><span>Cobrado en total: <b>${usd(life.income)}</b></span><span>Ganancia total: <b class="${life.profit < 0 ? "neg" : ""}">${signed(life.profit).replace(/^\+/, "")}</b></span>${life.incomePending ? `<span>Por cobrar: <b>${usd(life.incomePending)}</b></span>` : ""}</div>
        ${c.notes ? `<p class="muted fnotes">${esc(c.notes)}</p>` : ""}</div>
        <div class="item__actions"><button class="icon-btn" data-fa="client-moves" data-id="${esc(c.id)}" title="Ver movimientos" aria-label="Ver movimientos">${icon("list")}</button><button class="icon-btn" data-fa="client-edit" data-id="${esc(c.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button><button class="icon-btn danger" data-fa="client-del" data-id="${esc(c.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button></div></article>`;
    }).join("") : `<div class="empty"><strong>Aún no hay clientes</strong><span>Agrega tus clientes actuales y los prospectos. Puedes traer los que ya tienes en el portafolio.</span></div>`}</div>`;
}

function equipo() {
  const list = [...F.team].sort((a, b) => (a.status === "activo" ? 0 : 1) - (b.status === "activo" ? 0 : 1) || a.name.localeCompare(b.name));
  const rec = C.recurring(F);
  return `
    <div class="toolbar"><button class="btn btn--accent" data-fa="worker-new">${icon("plus")} Nuevo trabajador</button>
      <span class="help">Cada trabajador puede cobrar distinto: mensual, por proyecto o por entrega. ${rec.payroll ? `Sueldos mensuales activos: <b>${usd(rec.payroll)}</b>.` : ""}</span></div>
    <div class="list">${list.length ? list.map((w) => {
      const paid = F.entries.filter((e) => e.workerId === w.id && e.status === "pagado").reduce((t, e) => t + cents(e.amount), 0);
      const split = (w.alloc || []).filter((a) => a.percent > 0).map((a) => `${esc(clientName(a.clientId))} ${a.percent}%`).join(" · ");
      return `<article class="item ${w.status === "inactivo" ? "is-hidden" : ""}" style="grid-template-columns:minmax(0,1fr) auto"><div style="padding:6px 8px">
        <h3>${esc(w.name)} ${w.status === "inactivo" ? `<span class="tag">Inactivo</span>` : ""}</h3>
        <div class="meta"><span>${esc(w.role || "Sin rol")}</span><span>${rateLabel(w.pay)}</span>${w.contact ? `<span>${esc(w.contact)}</span>` : ""}</div>
        <div class="meta"><span>Pagado en total: <b>${usd(paid)}</b></span>${split ? `<span>Reparto habitual: ${split}</span>` : ""}</div>
        ${w.notes ? `<p class="muted fnotes">${esc(w.notes)}</p>` : ""}</div>
        <div class="item__actions"><button class="btn btn--sm btn--ghost" data-fa="worker-pay" data-id="${esc(w.id)}">Registrar pago</button><button class="icon-btn" data-fa="worker-edit" data-id="${esc(w.id)}" title="Editar" aria-label="Editar">${icon("pencil-simple")}</button><button class="icon-btn danger" data-fa="worker-del" data-id="${esc(w.id)}" title="Borrar" aria-label="Borrar">${icon("trash")}</button></div></article>`;
    }).join("") : `<div class="empty"><strong>Aún no hay trabajadores</strong><span>Agrega a quienes te ayudan para registrar lo que les pagas y asignarlo a cada cliente.</span></div>`}</div>`;
}

/* ============ Acciones ============ */
function onClick(ev) {
  const b = ev.target.closest("[data-fa]");
  if (!b || !F && b.dataset.fa !== "retry") return;
  const id = b.dataset.id;
  const entry = () => F.entries.find((e) => e.id === id);
  switch (b.dataset.fa) {
    case "retry": loadError = ""; return ctx.repaint();
    case "reload": F = null; saveState = "ok"; return ctx.repaint();
    case "goto-clientes": tab = "clientes"; return ctx.repaint();
    case "goto-movs-team": tab = "movimientos"; mv = { kind: "expense", client: "all", status: "all", q: C.TEAM_CATEGORY }; return ctx.repaint();
    case "chart-table": showTable = !showTable; return ctx.repaint();
    case "income-new": return openIncome();
    case "expense-new": return openExpense();
    case "entry-edit": return entry().kind === "income" ? openIncome(id) : openExpense(id);
    case "entry-toggle": { const e = entry(); e.status = e.status === "pendiente" ? (e.kind === "income" ? "cobrado" : "pagado") : "pendiente"; changed(); return; }
    case "entry-del": if (confirm("¿Borrar este movimiento?")) { F.entries = F.entries.filter((e) => e.id !== id); changed(); } return;
    case "client-new": return openClient();
    case "client-edit": return openClient(id);
    case "client-moves": tab = "movimientos"; mv = { kind: "all", client: id, status: "all", q: "" }; period = { ...period, mode: "all" }; return ctx.repaint();
    case "client-del": return removeClient(id);
    case "client-import": return importSiteClients();
    case "worker-new": return openWorker();
    case "worker-edit": return openWorker(id);
    case "worker-pay": return openExpense(null, { category: C.TEAM_CATEGORY, workerId: id });
    case "worker-del": return removeWorker(id);
    case "gen-cobros": return openGenerate("cobros");
    case "gen-sueldos": return openGenerate("sueldos");
    case "csv-es": return download(C.toCSV(F, visibleEntries(), { es: true }), "text/csv;charset=utf-8", "movimientos.csv");
    case "csv-std": return download(C.toCSV(F, visibleEntries(), { es: false }), "text/csv;charset=utf-8", "movimientos.csv");
    case "backup-export": return download(JSON.stringify({ clients: F.clients, team: F.team, entries: F.entries }, null, 2), "application/json", "finanzas-respaldo.json");
  }
}

function onFilter(ev) {
  const t = ev.target, k = t.dataset?.ff;
  if (!k || !F) return;
  if (k === "tab") { if (ev.type !== "change") return; tab = t.value; return ctx.repaint(); }
  if (k === "import") return importBackup(t);
  if (ev.type === "input" && k !== "mvq") return;
  if (k === "pmode") period.mode = t.value;
  else if (k === "pmonth") { if (!t.value) return; period.month = t.value; }
  else if (k === "pyear") { if (!/^\d{4}$/.test(t.value)) return; period.year = t.value; }
  else if (k === "mvkind") mv.kind = t.value;
  else if (k === "mvclient") mv.client = t.value;
  else if (k === "mvstatus") mv.status = t.value;
  else if (k === "mvq") mv.q = t.value;
  const pos = k === "mvq" ? t.selectionStart : 0;
  ctx.repaint();
  if (k === "mvq") { const q = $('[data-ff="mvq"]'); q?.focus(); q?.setSelectionRange(pos, pos); }
}

function changed() { queueSave(); ctx.repaint(); }

function download(text, type, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name.replace(/(\.\w+)$/, `-${C.todayStr()}$1`) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(input) {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (![d.clients, d.team, d.entries].every(Array.isArray)) throw new Error();
    if (!confirm("Esto reemplaza todos tus datos financieros por los del respaldo. ¿Continuar?")) return;
    F = { clients: d.clients, team: d.team, entries: d.entries };
    changed(); ctx.toast("Respaldo importado.");
  } catch { ctx.toast("Ese archivo no parece un respaldo financiero válido.", true); }
}

function removeClient(id) {
  if (F.entries.some((e) => e.clientId === id || (e.alloc || []).some((a) => a.clientId === id))) return ctx.toast("Este cliente tiene movimientos. Márcalo como «Terminado» en vez de borrarlo, así no pierdes tu historial.", true);
  if (confirm("¿Borrar este cliente?")) { F.clients = F.clients.filter((c) => c.id !== id); F.team.forEach((w) => { w.alloc = (w.alloc || []).filter((a) => a.clientId !== id); }); changed(); }
}
function removeWorker(id) {
  if (F.entries.some((e) => e.workerId === id)) return ctx.toast("Este trabajador tiene pagos registrados. Márcalo como «Inactivo» en vez de borrarlo.", true);
  if (confirm("¿Borrar a este trabajador?")) { F.team = F.team.filter((w) => w.id !== id); changed(); }
}
function importSiteClients() {
  const names = ctx.siteClientNames().filter((n) => !F.clients.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  if (!names.length || !confirm(`Se agregarán como clientes activos: ${names.join(", ")}.`)) return;
  for (const name of names) F.clients.push({ id: uid("c"), name, status: "activo", service: "", contact: "", since: "", deal: { type: "proyecto", amount: 0 }, notes: "" });
  changed();
}

/* ============ Formularios ============ */
const clientOptions = (sel = "", blankLabel = "Elegir cliente…") => `<option value="">${blankLabel}</option>${F.clients.filter((c) => c.status !== "terminado" || c.id === sel).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("")}`;
const opts = (list, sel) => list.map((v) => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const typeOpts = (sel) => Object.entries(C.PAY_TYPES).map(([k, l]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${l}</option>`).join("");

function openIncome(id) {
  const e = id ? F.entries.find((x) => x.id === id) : { id: uid("e"), kind: "income", date: C.todayStr(), amount: "", status: "cobrado", clientId: "", desc: "", method: "" };
  ctx.openDialog({
    title: id ? "Editar ingreso" : "Nuevo ingreso",
    body: `<div class="row"><div class="field"><label for="i-date">Fecha</label><input id="i-date" name="date" type="date" required value="${esc(e.date)}"></div>
      <div class="field"><label for="i-client">Cliente</label><select id="i-client" name="clientId" required>${clientOptions(e.clientId)}</select></div>
      <div class="field"><label for="i-amount">Monto (USD)</label><input id="i-amount" name="amount" inputmode="decimal" required placeholder="0.00" value="${e.amount === "" ? "" : esc(e.amount)}"></div></div>
      <div class="row"><div class="field"><label for="i-status">Estado</label><select id="i-status" name="status"><option value="cobrado" ${e.status === "cobrado" ? "selected" : ""}>Cobrado</option><option value="pendiente" ${e.status === "pendiente" ? "selected" : ""}>Por cobrar</option></select></div>
        <div class="field"><label for="i-method">Método de pago</label><input id="i-method" name="method" list="f-methods" value="${esc(e.method)}" autocomplete="off"><datalist id="f-methods">${C.METHODS.map((m) => `<option value="${m}">`).join("")}</datalist></div></div>
      <div class="field"><label for="i-desc">Concepto</label><input id="i-desc" name="desc" maxlength="200" placeholder="Mensualidad, proyecto, entrega…" value="${esc(e.desc)}"></div>
      ${F.clients.length ? "" : `<p class="help">Primero agrega un cliente en la pestaña Clientes.</p>`}`,
    onSubmit: (fd) => {
      const amount = C.parseMoney(fd.get("amount"));
      if (!fd.get("clientId")) { ctx.toast("Elige el cliente al que le cobraste.", true); return false; }
      if (!(amount > 0)) { ctx.toast("Escribe un monto mayor que cero.", true); return false; }
      save({ ...e, date: fd.get("date"), clientId: fd.get("clientId"), amount, status: fd.get("status"), method: String(fd.get("method")).trim(), desc: String(fd.get("desc")).trim() }, id);
    },
  });
}

function allocRow(clientId = "", amount = "") {
  return `<div class="alloc-row"><select name="allocClient" aria-label="Cliente">${clientOptions(clientId)}</select><input name="allocAmount" inputmode="decimal" placeholder="0.00" aria-label="Monto asignado a este cliente" value="${esc(amount)}"><button type="button" class="icon-btn" data-fd="alloc-del" aria-label="Quitar cliente">${icon("x")}</button></div>`;
}

function openExpense(id, preset = {}) {
  const e = id ? F.entries.find((x) => x.id === id) : { id: uid("e"), kind: "expense", date: C.todayStr(), amount: "", status: "pagado", category: preset.category || C.CATEGORIES[1], workerId: preset.workerId || "", desc: "", method: "", alloc: [] };
  ctx.openDialog({
    title: id ? "Editar gasto" : preset.workerId ? `Pago a ${workerName(preset.workerId)}` : "Nuevo gasto",
    body: `<div class="row"><div class="field"><label for="x-date">Fecha</label><input id="x-date" name="date" type="date" required value="${esc(e.date)}"></div>
      <div class="field"><label for="x-cat">Categoría</label><select id="x-cat" name="category" data-fd-change="cat">${opts(C.CATEGORIES, e.category)}</select></div>
      <div class="field" id="xWorkerField"><label for="x-worker">Trabajador</label><select id="x-worker" name="workerId" data-fd-change="worker"><option value="">Elegir…</option>${F.team.map((w) => `<option value="${esc(w.id)}" ${w.id === e.workerId ? "selected" : ""}>${esc(w.name)}${w.status === "inactivo" ? " (inactivo)" : ""}</option>`).join("")}</select></div></div>
      <div class="row"><div class="field"><label for="x-amount">Monto total (USD)</label><input id="x-amount" name="amount" inputmode="decimal" required placeholder="0.00" value="${e.amount === "" ? "" : esc(e.amount)}"></div>
        <div class="field"><label for="x-status">Estado</label><select id="x-status" name="status"><option value="pagado" ${e.status === "pagado" ? "selected" : ""}>Pagado</option><option value="pendiente" ${e.status === "pendiente" ? "selected" : ""}>Por pagar</option></select></div></div>
      <div class="field"><label for="x-desc">Concepto</label><input id="x-desc" name="desc" maxlength="200" placeholder="Sueldo, edición del video, suscripción…" value="${esc(e.desc)}"></div>
      <div class="field"><span class="label">¿Para qué cliente fue?</span>
        <div id="allocRows">${(e.alloc || []).map((a) => allocRow(a.clientId, a.amount)).join("")}</div>
        <div class="toolbar"><button type="button" class="btn btn--sm btn--ghost" data-fd="alloc-add">${icon("plus")} Asignar a un cliente</button><span class="help" id="allocHelp"></span></div>
        <span class="help">Si fue para varios clientes, agrega una fila por cada uno. Lo que no asignes cuenta como gasto general.</span></div>`,
    onOpen: syncExpense,
    onSubmit: (fd) => {
      const amount = C.parseMoney(fd.get("amount"));
      const category = fd.get("category"), workerId = category === C.TEAM_CATEGORY ? fd.get("workerId") : "";
      if (!(amount > 0)) { ctx.toast("Escribe un monto mayor que cero.", true); return false; }
      if (category === C.TEAM_CATEGORY && !workerId) { ctx.toast("Elige a qué trabajador le pagaste.", true); return false; }
      const alloc = readAlloc(fd);
      if (alloc.some((a) => !a.clientId)) { ctx.toast("Elige el cliente en cada fila asignada, o quita la fila.", true); return false; }
      if (alloc.reduce((t, a) => t + cents(a.amount), 0) > cents(amount)) { ctx.toast("Lo asignado a clientes supera el monto del gasto.", true); return false; }
      save({ ...e, date: fd.get("date"), category, workerId, amount, status: fd.get("status"), desc: String(fd.get("desc")).trim(), alloc: alloc.filter((a) => a.clientId && a.amount > 0) }, id);
    },
  });
}

function readAlloc(fd) {
  const cl = fd.getAll("allocClient"), am = fd.getAll("allocAmount");
  return cl.map((clientId, i) => ({ clientId, amount: C.parseMoney(am[i]) })).filter((a) => a.clientId || a.amount);
}

function syncExpense() {
  const form = $("#dlgForm");
  if (!form.elements.category) return;
  $("#xWorkerField").hidden = form.elements.category.value !== C.TEAM_CATEGORY;
  const total = C.parseMoney(form.elements.amount.value);
  const used = [...form.querySelectorAll('[name="allocAmount"]')].reduce((t, i) => t + cents(C.parseMoney(i.value)), 0);
  const help = $("#allocHelp");
  if (!help) return;
  help.className = `help ${used > cents(total) && total ? "neg" : ""}`;
  help.textContent = form.querySelectorAll(".alloc-row").length ? (total ? `Asignado ${usd(used)} de ${usd(cents(total))}${used < cents(total) ? ` · ${usd(cents(total) - used)} queda como general` : ""}` : "") : "";
}

function onDialogClick(ev) {
  const b = ev.target.closest("[data-fd]");
  if (!b) return;
  if (b.dataset.fd === "alloc-del") { b.closest(".alloc-row").remove(); syncExpense(); }
  if (b.dataset.fd === "alloc-add") {
    const form = $("#dlgForm");
    const total = cents(C.parseMoney(form.elements.amount.value));
    const used = [...form.querySelectorAll('[name="allocAmount"]')].reduce((t, i) => t + cents(C.parseMoney(i.value)), 0);
    const left = Math.max(0, total - used);
    $("#allocRows").insertAdjacentHTML("beforeend", allocRow("", left ? (left / 100).toFixed(2) : ""));
    syncExpense();
  }
}

function onDialogInput(ev) {
  const form = $("#dlgForm");
  if (!form.elements.category) return;
  const t = ev.target;
  if (ev.type === "change" && t.dataset.fdChange === "worker" && t.value) {
    // prellena el monto y el reparto habitual del trabajador
    const w = F.team.find((x) => x.id === t.value);
    if (w && !form.elements.amount.value && w.pay?.type === "mensual" && w.pay.amount) form.elements.amount.value = w.pay.amount;
    const amount = C.parseMoney(form.elements.amount.value);
    if (w && amount && !form.querySelector(".alloc-row")) $("#allocRows").innerHTML = C.splitByPercent(amount, w.alloc).map((a) => allocRow(a.clientId, a.amount)).join("");
  }
  syncExpense();
}

function save(entry, existingId) {
  const i = F.entries.findIndex((x) => x.id === entry.id);
  if (existingId && i >= 0) F.entries[i] = entry; else F.entries.push(entry);
  changed();
  ctx.toast("Guardado.");
}

function openClient(id) {
  const c = id ? F.clients.find((x) => x.id === id) : { id: uid("c"), name: "", status: "activo", service: "", contact: "", since: "", deal: { type: "mensual", amount: "" }, notes: "" };
  ctx.openDialog({
    title: id ? "Editar cliente" : "Nuevo cliente",
    body: `<div class="row"><div class="field"><label for="c-name">Nombre</label><input id="c-name" name="name" required maxlength="80" value="${esc(c.name)}"></div>
      <div class="field"><label for="c-status">Estado</label><select id="c-status" name="status">${Object.entries(C.CLIENT_STATES).map(([k, l]) => `<option value="${k}" ${k === c.status ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="field"><label for="c-service">Qué le haces</label><input id="c-service" name="service" maxlength="100" placeholder="Edición de reels, manejo de redes…" value="${esc(c.service)}"></div>
      <div class="row"><div class="field"><label for="c-type">Cómo te paga</label><select id="c-type" name="dealType">${typeOpts(c.deal?.type)}</select></div>
        <div class="field"><label for="c-amount">Monto acordado (USD)</label><input id="c-amount" name="dealAmount" inputmode="decimal" placeholder="0.00" value="${c.deal?.amount ? esc(c.deal.amount) : ""}"></div>
        <div class="field"><label for="c-since">Cliente desde</label><input id="c-since" name="since" type="date" value="${esc(c.since)}"></div></div>
      <div class="field"><label for="c-contact">Contacto</label><input id="c-contact" name="contact" maxlength="120" placeholder="Correo o WhatsApp" value="${esc(c.contact)}"></div>
      <div class="field"><label for="c-notes">Notas privadas</label><textarea id="c-notes" name="notes" rows="3" maxlength="600">${esc(c.notes)}</textarea></div>`,
    onSubmit: (fd) => {
      const next = { ...c, name: String(fd.get("name")).trim(), status: fd.get("status"), service: String(fd.get("service")).trim(), contact: String(fd.get("contact")).trim(), since: fd.get("since") || "", notes: String(fd.get("notes")).trim(), deal: { type: fd.get("dealType"), amount: C.parseMoney(fd.get("dealAmount")) } };
      const i = F.clients.findIndex((x) => x.id === c.id);
      if (i >= 0) F.clients[i] = next; else F.clients.push(next);
      changed(); ctx.toast("Cliente guardado.");
    },
  });
}

function workerAllocRow(clientId = "", percent = "") {
  return `<div class="alloc-row"><select name="wClient" aria-label="Cliente">${clientOptions(clientId)}</select><input name="wPercent" inputmode="decimal" placeholder="%" aria-label="Porcentaje" value="${esc(percent)}"><button type="button" class="icon-btn" data-fd="alloc-del" aria-label="Quitar">${icon("x")}</button></div>`;
}

function openWorker(id) {
  const w = id ? F.team.find((x) => x.id === id) : { id: uid("w"), name: "", role: "", status: "activo", pay: { type: "mensual", amount: "" }, contact: "", notes: "", alloc: [] };
  ctx.openDialog({
    title: id ? "Editar trabajador" : "Nuevo trabajador",
    body: `<div class="row"><div class="field"><label for="w-name">Nombre</label><input id="w-name" name="name" required maxlength="80" value="${esc(w.name)}"></div>
      <div class="field"><label for="w-role">Rol</label><input id="w-role" name="role" maxlength="80" placeholder="Editor, diseñador…" value="${esc(w.role)}"></div></div>
      <div class="row"><div class="field"><label for="w-type">Cómo le pagas</label><select id="w-type" name="payType">${typeOpts(w.pay?.type)}</select></div>
        <div class="field"><label for="w-amount">Tarifa habitual (USD)</label><input id="w-amount" name="payAmount" inputmode="decimal" placeholder="0.00" value="${w.pay?.amount ? esc(w.pay.amount) : ""}"></div>
        <div class="field"><label for="w-status">Estado</label><select id="w-status" name="status"><option value="activo" ${w.status === "activo" ? "selected" : ""}>Activo</option><option value="inactivo" ${w.status === "inactivo" ? "selected" : ""}>Inactivo</option></select></div></div>
      <div class="field"><label for="w-contact">Contacto</label><input id="w-contact" name="contact" maxlength="120" value="${esc(w.contact)}"></div>
      <div class="field"><span class="label">Reparto habitual entre clientes (opcional)</span>
        <div id="allocRows">${(w.alloc || []).map((a) => workerAllocRow(a.clientId, a.percent)).join("")}</div>
        <div class="toolbar"><button type="button" class="btn btn--sm btn--ghost" id="wAllocAdd" data-fd="walloc-add">${icon("plus")} Agregar cliente</button></div>
        <span class="help">Si este trabajador atiende a varios clientes, indica qué porcentaje de su pago corresponde a cada uno. Se usa al generar sueldos y al registrar pagos.</span></div>
      <div class="field"><label for="w-notes">Notas privadas</label><textarea id="w-notes" name="notes" rows="3" maxlength="600">${esc(w.notes)}</textarea></div>`,
    onSubmit: (fd) => {
      const cl = fd.getAll("wClient"), pc = fd.getAll("wPercent");
      const alloc = cl.map((clientId, i) => ({ clientId, percent: Math.min(100, C.parseMoney(pc[i])) })).filter((a) => a.clientId && a.percent > 0);
      if (alloc.reduce((t, a) => t + a.percent, 0) > 100.01) { ctx.toast("Los porcentajes de reparto suman más de 100%.", true); return false; }
      const next = { ...w, name: String(fd.get("name")).trim(), role: String(fd.get("role")).trim(), status: fd.get("status"), contact: String(fd.get("contact")).trim(), notes: String(fd.get("notes")).trim(), pay: { type: fd.get("payType"), amount: C.parseMoney(fd.get("payAmount")) }, alloc };
      const i = F.team.findIndex((x) => x.id === w.id);
      if (i >= 0) F.team[i] = next; else F.team.push(next);
      changed(); ctx.toast("Trabajador guardado.");
    },
  });
}

// "Agregar cliente" del reparto del trabajador (usa su propio botón porque las filas llevan %)
document.addEventListener("click", (ev) => {
  const b = ev.target.closest('[data-fd="walloc-add"]');
  if (b && F) $("#allocRows").insertAdjacentHTML("beforeend", workerAllocRow());
});

/* ---------- Generar cobros y sueldos mensuales ---------- */
function genPlan(kind, month) {
  const label = kind === "cobros" ? "Mensualidad" : "Sueldo";
  const make = [], skip = [];
  const exists = (e, key, id) => e[key] === id && C.monthOf(e.date) === month && String(e.desc).startsWith(label);
  if (kind === "cobros") {
    for (const c of F.clients.filter((x) => x.status === "activo" && x.deal?.type === "mensual" && x.deal.amount > 0)) {
      if (F.entries.some((e) => e.kind === "income" && exists(e, "clientId", c.id))) { skip.push(c.name); continue; }
      make.push({ id: uid("e"), kind: "income", date: `${month}-01`, amount: c.deal.amount, status: "pendiente", clientId: c.id, workerId: "", category: "", desc: `${label} ${monthLabel(month)}`, method: "", alloc: [], _n: c.name });
    }
  } else {
    for (const w of F.team.filter((x) => x.status === "activo" && x.pay?.type === "mensual" && x.pay.amount > 0)) {
      if (F.entries.some((e) => e.kind === "expense" && exists(e, "workerId", w.id))) { skip.push(w.name); continue; }
      make.push({ id: uid("e"), kind: "expense", date: `${month}-01`, amount: w.pay.amount, status: "pendiente", clientId: "", workerId: w.id, category: C.TEAM_CATEGORY, desc: `${label} ${monthLabel(month)}`, method: "", alloc: C.splitByPercent(w.pay.amount, w.alloc), _n: w.name });
    }
  }
  return { make, skip };
}

let genKind = "cobros";
function genPreviewHTML(month) {
  const { make, skip } = genPlan(genKind, month);
  const who = genKind === "cobros" ? "clientes activos con tarifa mensual" : "trabajadores activos con sueldo mensual";
  if (!make.length && !skip.length) return `<p class="muted">No hay ${who}. Configura la tarifa en la pestaña ${genKind === "cobros" ? "Clientes" : "Equipo"}.</p>`;
  return `${make.length ? `<p>Se ${make.length === 1 ? "creará <b>1</b> movimiento pendiente" : `crearán <b>${make.length}</b> movimientos pendientes`}:</p><ul class="steps">${make.map((e) => `<li>${icon("check-circle")}<span>${esc(e._n)}</span><b>${usd(cents(e.amount))}</b></li>`).join("")}</ul>` : "<p class=\"muted\">No hay nada nuevo que crear.</p>"}
    ${skip.length ? `<p class="help">Ya existían este mes (no se repiten): ${esc(skip.join(", "))}.</p>` : ""}`;
}

function openGenerate(kind) {
  genKind = kind;
  ctx.openDialog({
    title: kind === "cobros" ? "Generar cobros del mes" : "Generar sueldos del mes",
    body: `<div class="field"><label for="g-month">Mes</label><input id="g-month" name="month" type="month" required value="${esc(C.thisMonth())}" data-fd-gen></div>
      <div id="genPreview">${genPreviewHTML(C.thisMonth())}</div>
      <p class="help">Quedan como pendientes: los marcas como cobrados o pagados cuando ocurra.</p>`,
    onSubmit: (fd) => {
      const { make } = genPlan(genKind, fd.get("month"));
      if (!make.length) { ctx.toast("No hay nada nuevo que crear para ese mes.", true); return false; }
      for (const e of make) { delete e._n; F.entries.push(e); }
      period = { ...period, mode: "month", month: fd.get("month") };
      tab = "movimientos";
      changed(); ctx.toast(make.length === 1 ? "1 movimiento creado." : `${make.length} movimientos creados.`);
    },
  });
}
document.addEventListener("change", (ev) => {
  if (ev.target.matches?.("[data-fd-gen]") && ev.target.value && $("#genPreview")) $("#genPreview").innerHTML = genPreviewHTML(ev.target.value);
});

/* ============ Tooltip de la gráfica ============ */
let tip;
function onTip(ev) {
  const col = ev.target.closest?.(".fcol");
  if (!col) return;
  if (!tip) { tip = document.createElement("div"); tip.className = "ftip"; tip.setAttribute("role", "tooltip"); document.body.append(tip); }
  const inc = Number(col.dataset.inc), exp = Number(col.dataset.exp);
  tip.replaceChildren();
  const add = (cls, text, color) => {
    const row = document.createElement("div"); row.className = cls;
    if (color) { const k = document.createElement("i"); k.style.background = color; row.append(k); }
    const v = document.createElement("b"); v.textContent = text[0];
    const l = document.createElement("span"); l.textContent = text[1];
    row.append(v, l); tip.append(row);
  };
  const h = document.createElement("div"); h.className = "ftip__h"; h.textContent = col.dataset.m; tip.append(h);
  add("ftip__r", [usd(inc), "Ingresos cobrados"], COLOR_IN);
  add("ftip__r", [usd(exp), "Gastos pagados"], COLOR_OUT);
  add("ftip__r ftip__net", [signed(inc - exp), "Ganancia"]);
  tip.style.display = "block";
  const r = col.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
}
function hideTip(ev) { if (tip && ev.target.closest?.(".fcol")) tip.style.display = "none"; }
