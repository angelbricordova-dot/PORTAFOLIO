// Efectos de movimiento del sitio: puntero con peso, imanes, pegatinas con física,
// inclinación del retrato y cinta de roles arrastrable.
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- Puntero ---------- */
let cursorOn = false;
export function setCursorEnabled(on) { root.classList.toggle("cur-hidden", !on); root.classList.toggle("has-cursor", on && cursorOn); }

export function initCursor() {
  if (!fine.matches || reduced.matches) return;
  const mk = (cls, html = "") => Object.assign(document.createElement("div"), { className: cls, innerHTML: html });
  const dot = mk("cur-dot"), ringEl = mk("cur-ring", `<i></i><svg viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" id="curArc"></circle></svg>`), label = mk("cur-label");
  const dotWrap = mk("cur"), ringWrap = mk("cur"), labelWrap = mk("cur");
  dotWrap.append(dot); ringWrap.append(ringEl); labelWrap.append(label);
  document.body.append(ringWrap, dotWrap, labelWrap);
  const arc = ringEl.querySelector("#curArc");
  const C = 2 * Math.PI * 21;
  arc.style.strokeDasharray = C;
  const m = { x: -100, y: -100, px: -100, py: -100 };
  const ring = { x: -100, y: -100, vx: 0, vy: 0, s: 1 };
  const lab = { x: -100, y: -100, vx: 0, vy: 0 };
  let seen = false, link = false, text = "", down = false, scrollY0 = scrollY, progress = 0;
  // un solo aro que se expande al hacer clic
  const ripple = (x, y) => {
    const el = Object.assign(document.createElement("div"), { className: "cur-ripple" });
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.addEventListener("animationend", () => el.remove());
    document.body.append(el);
  };

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    if (!seen) { seen = true; cursorOn = true; ring.x = lab.x = m.px = m.x = e.clientX; ring.y = lab.y = m.py = m.y = e.clientY; root.classList.add("has-cursor"); }
    m.x = e.clientX; m.y = e.clientY;
    const t = e.target.closest?.("a, button, summary, [data-cursor], .pill, .card, .client, .cell, label, [role=button]");
    link = !!t && !t.matches?.("[data-cursor-off]");
    text = t?.dataset?.cursor || (t?.matches?.(".card") ? "Ver" : "");
    const inField = e.target.closest?.("input, textarea, select");
    ringWrap.classList.toggle("is-link", link && !text);
    const showLabel = !!text && !inField;
    labelWrap.classList.toggle("is-label", showLabel); ringWrap.classList.toggle("is-label", showLabel);
    if (text) label.textContent = text;
    dotWrap.style.opacity = ringWrap.style.opacity = inField ? 0 : "";
  }, { passive: true });
  document.addEventListener("pointerleave", () => { dotWrap.style.opacity = ringWrap.style.opacity = labelWrap.style.opacity = 0; });
  document.addEventListener("pointerenter", () => { dotWrap.style.opacity = ringWrap.style.opacity = labelWrap.style.opacity = ""; });
  addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; down = true; labelWrap.classList.add("is-down"); ripple(e.clientX, e.clientY); });
  addEventListener("pointerup", () => { down = false; labelWrap.classList.remove("is-down"); });
  // El anillo tiene masa: al hacer scroll se arrastra en sentido contrario.
  addEventListener("scroll", () => {
    const dy = scrollY - scrollY0; scrollY0 = scrollY;
    ring.vy -= clamp(dy * 0.18, -22, 22);
    const max = document.documentElement.scrollHeight - innerHeight;
    progress = max > 0 ? scrollY / max : 0;
  }, { passive: true });

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(2, (now - last) / 16.67); last = now;
    // punto: casi inmediato; anillo: muelle con rebote; etiqueta: más pesada
    dotWrap.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`;

    ring.vx = (ring.vx + (m.x - ring.x) * 0.16 * dt) * Math.pow(0.7, dt); ring.vy = (ring.vy + (m.y - ring.y) * 0.16 * dt) * Math.pow(0.7, dt);
    ring.x += ring.vx * dt; ring.y += ring.vy * dt;
    const rs = Math.hypot(ring.vx, ring.vy), ang = Math.atan2(ring.vy, ring.vx) * 180 / Math.PI;
    const stretch = 1 + clamp(rs / 38, 0, 0.7);
    const target = text ? 0.6 : link ? 1.7 : down ? 0.75 : 1;
    ring.s += (target - ring.s) * 0.2 * dt;
    ringWrap.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) rotate(${ang}deg) scale(${ring.s * stretch}, ${ring.s / Math.sqrt(stretch)}) rotate(${-ang}deg)`;
    arc.style.strokeDashoffset = C * (1 - progress);

    lab.vx = (lab.vx + (m.x - lab.x) * 0.1 * dt) * Math.pow(0.75, dt); lab.vy = (lab.vy + (m.y - lab.y) * 0.1 * dt) * Math.pow(0.75, dt);
    lab.x += lab.vx * dt; lab.y += lab.vy * dt;
    labelWrap.style.transform = `translate3d(${lab.x}px, ${lab.y}px, 0)`;

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- Botones que se acercan al cursor ---------- */
export function initMagnets(selector = ".btn, .nav__links a, .socials a, .pill, .foot__admin") {
  if (!fine.matches || reduced.matches) return;
  const mark = () => document.querySelectorAll(selector).forEach((el) => el.setAttribute("data-magnet", ""));
  mark();
  let cur = null;
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.("[data-magnet]");
    if (cur && cur !== el) { cur.style.translate = ""; }
    cur = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.translate = `${((e.clientX - r.left) / r.width - 0.5) * 12}px ${((e.clientY - r.top) / r.height - 0.5) * 10}px`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (cur) cur.style.translate = ""; });
  return mark;
}

/* ---------- Portada: inclinación y pegatinas con física ---------- */
export function initHero() {
  const portrait = document.getElementById("portrait");
  if (!portrait) return;
  const frame = portrait.querySelector(".portrait__frame");
  const stickers = [...portrait.querySelectorAll("[data-sticker]")].map((el, i) => ({ el, x: 0, y: 0, vx: 0, vy: 0, phase: i * 2.1 }));
  const m = { x: -9999, y: -9999 };
  addEventListener("pointermove", (e) => {
    m.x = e.clientX; m.y = e.clientY;
    if (reduced.matches || !fine.matches) return;
    const r = portrait.getBoundingClientRect();
    const nx = clamp((e.clientX - (r.left + r.width / 2)) / innerWidth, -0.5, 0.5);
    const ny = clamp((e.clientY - (r.top + r.height / 2)) / innerHeight, -0.5, 0.5);
    frame.style.setProperty("--ry", `${nx * 16}deg`);
    frame.style.setProperty("--rx", `${-ny * 12}deg`);
  }, { passive: true });
  if (reduced.matches) return;
  let t0 = performance.now();
  const loop = (now) => {
    const dt = Math.min(2, (now - t0) / 16.67); t0 = now;
    if (!document.hidden) {
      for (const s of stickers) {
        const r = s.el.getBoundingClientRect();
        // r incluye el desplazamiento actual: se resta para hallar el punto de reposo
        const cx = r.left + r.width / 2 - s.x, cy = r.top + r.height / 2 - s.y;
        const dx = cx - m.x, dy = cy - m.y, d = Math.hypot(dx, dy) || 1;
        let fx = -s.x * 0.06, fy = -s.y * 0.06 + Math.sin(now / 900 + s.phase) * 0.05;
        if (fine.matches && d < 170) { const f = (1 - d / 170) * 3.2; fx += (dx / d) * f; fy += (dy / d) * f; }
        s.vx = (s.vx + fx * dt) * Math.pow(0.86, dt); s.vy = (s.vy + fy * dt) * Math.pow(0.86, dt);
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.el.style.setProperty("--sx", `${s.x.toFixed(1)}px`); s.el.style.setProperty("--sy", `${s.y.toFixed(1)}px`);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ---------- Cinta de roles: arrastrable, y más lenta (no se detiene) al pasar el cursor ---------- */
export function initTicker(host, track, items) {
  if (!host || !items.length) return;
  const unit = items.map((r) => `<span class="roles__item"><span>${r}</span></span>`).join("");
  track.innerHTML = unit;
  const one = track.scrollWidth;
  const copies = Math.max(2, Math.ceil((innerWidth * 2) / Math.max(one, 1)) + 1);
  track.innerHTML = unit.repeat(copies);

  const BASE = reduced.matches ? 0 : 70, SLOW = 16; // px por segundo
  let x = 0, v = BASE, vel = 0, hover = false, drag = false, lastX = 0, lastT = 0, moved = 0;
  const wrap = () => { const w = one; x = ((x % w) + w) % w - w; };
  host.addEventListener("pointerenter", () => { hover = true; });
  host.addEventListener("pointerleave", () => { hover = false; });
  host.addEventListener("pointerdown", (e) => {
    drag = true; moved = 0; lastX = e.clientX; lastT = performance.now(); vel = 0;
    host.setPointerCapture(e.pointerId); host.classList.add("is-drag");
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - lastX, now = performance.now();
    x += dx; moved += Math.abs(dx);
    vel = dx / Math.max(1, now - lastT) * 1000; // px/s
    lastX = e.clientX; lastT = now;
  });
  const end = () => { drag = false; host.classList.remove("is-drag"); };
  host.addEventListener("pointerup", end); host.addEventListener("pointercancel", end);
  // Rueda horizontal / trackpad también mueve la cinta
  host.addEventListener("wheel", (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); x -= e.deltaX; } }, { passive: false });

  let t0 = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!drag) {
      const target = hover ? SLOW : BASE;
      // la inercia del arrastre se amortigua hacia la velocidad de crucero (siempre hacia la izquierda)
      vel += (-target - vel) * Math.min(1, dt * 3);
      x += vel * dt;
    }
    wrap();
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
