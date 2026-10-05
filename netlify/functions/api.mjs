// API del portafolio: datos públicos, login del admin, guardado y subida de archivos.
// Se ejecuta como Netlify Function (v2) y guarda todo en Netlify Blobs.
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const config = { path: ["/api/*", "/media/*"] };

const MAX_UPLOAD = 5.5 * 1024 * 1024; // las funciones aceptan ~6 MB por petición
const MAX_DOC = 900 * 1024;
const SESSION_DAYS = 14;
const ALLOWED_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
const DOC_KEYS = ["profile", "services", "categories", "clients", "projects", "months", "settings"];

/* ---------- almacenamiento ---------- */
let storePromise;
function getStorage() {
  storePromise ??= (async () => {
    if (process.env.PORTFOLIO_LOCAL) return fileStore(join(process.cwd(), ".data"));
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "portfolio", consistency: "strong" });
  })();
  return storePromise;
}

// Misma interfaz mínima que Netlify Blobs, sobre disco, para probar en local.
function fileStore(dir) {
  const path = (key) => join(dir, key.replace(/[^a-zA-Z0-9._-]/g, "_"));
  const meta = (key) => path(key) + ".meta.json";
  return {
    async get(key, opts = {}) {
      try {
        const buf = await readFile(path(key));
        return opts.type === "json" ? JSON.parse(buf.toString("utf8")) : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
      } catch { return null; }
    },
    async getWithMetadata(key, opts = {}) {
      const data = await this.get(key, opts);
      if (data === null) return null;
      let metadata = {};
      try { metadata = JSON.parse(await readFile(meta(key), "utf8")); } catch {}
      return { data, metadata };
    },
    async setJSON(key, value) { await mkdir(dir, { recursive: true }); await writeFile(path(key), JSON.stringify(value)); },
    async set(key, data, opts = {}) {
      await mkdir(dir, { recursive: true });
      await writeFile(path(key), Buffer.from(data));
      if (opts.metadata) await writeFile(meta(key), JSON.stringify(opts.metadata));
    },
    async delete(key) { await rm(path(key), { force: true }); await rm(meta(key), { force: true }); },
  };
}

/* ---------- sesión ---------- */
const b64 = (buf) => Buffer.from(buf).toString("base64url");
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

function makeToken() {
  const payload = b64(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 }));
  return `${payload}.${sign(payload)}`;
}
function verifyToken(token) {
  if (!token || !secret()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
function samePassword(input) {
  const real = process.env.ADMIN_PASSWORD || "";
  const h = (s) => createHash("sha256").update(String(s)).digest();
  return real.length > 0 && timingSafeEqual(h(input), h(real));
}
const isAuthed = (req) => verifyToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));

/* ---------- utilidades ---------- */
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (status, message) => json({ error: message }, status);

function cleanDoc(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const doc = {};
  for (const key of DOC_KEYS) if (key in input) doc[key] = input[key];
  for (const key of ["services", "categories", "clients", "projects", "months"]) {
    if (key in doc && !Array.isArray(doc[key])) return null;
  }
  if (doc.profile && (typeof doc.profile !== "object" || Array.isArray(doc.profile))) return null;
  return doc;
}

/* ---------- rutas ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;

  try {
    // Archivos subidos
    if (path.startsWith("/media/") && method === "GET") {
      const id = path.slice(7);
      if (!/^[a-f0-9-]{36}\.[a-z0-9]{3,4}$/.test(id)) return fail(404, "No encontrado");
      const store = await getStorage();
      const found = await store.getWithMetadata(`media-${id}`, { type: "arrayBuffer" });
      if (!found) return fail(404, "No encontrado");
      return new Response(found.data, {
        headers: {
          "content-type": found.metadata?.type || "application/octet-stream",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        },
      });
    }

    if (path === "/api/data" && method === "GET") {
      const store = await getStorage();
      const doc = await store.get("site", { type: "json" });
      return json(doc || { empty: true }, 200, { "cache-control": "public, max-age=0, must-revalidate" });
    }

    if (path === "/api/login" && method === "POST") {
      if (!process.env.ADMIN_PASSWORD) return fail(503, "Falta configurar ADMIN_PASSWORD en Netlify (Site configuration → Environment variables).");
      const body = await req.json().catch(() => ({}));
      if (!samePassword(body.password ?? "")) {
        await new Promise((r) => setTimeout(r, 900));
        return fail(401, "Contraseña incorrecta");
      }
      return json({ token: makeToken() });
    }

    if (path === "/api/session" && method === "GET") {
      return isAuthed(req) ? json({ ok: true }) : fail(401, "Sesión vencida");
    }

    // Todo lo de abajo requiere sesión
    if (!isAuthed(req)) return fail(401, "Necesitas iniciar sesión");

    if (path === "/api/data" && method === "PUT") {
      const raw = await req.text();
      if (raw.length > MAX_DOC) return fail(413, "Los datos son demasiado grandes");
      const doc = cleanDoc(JSON.parse(raw));
      if (!doc) return fail(400, "Formato de datos inválido");
      doc.updatedAt = new Date().toISOString();
      const store = await getStorage();
      await store.setJSON("site", doc);
      return json({ ok: true, updatedAt: doc.updatedAt });
    }

    if (path === "/api/upload" && method === "POST") {
      const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const ext = ALLOWED_TYPES[type];
      if (!ext) return fail(415, "Formato no permitido. Usa JPG, PNG, WebP, GIF, MP4 o WebM.");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return fail(400, "Archivo vacío");
      if (buf.byteLength > MAX_UPLOAD) return fail(413, "El archivo supera 5 MB. Para videos largos usa un enlace de YouTube o Vimeo.");
      const id = `${randomUUID()}.${ext}`;
      const store = await getStorage();
      await store.set(`media-${id}`, buf, { metadata: { type, size: buf.byteLength } });
      return json({ url: `/media/${id}`, type, size: buf.byteLength });
    }

    if (path.startsWith("/api/media/") && method === "DELETE") {
      const id = path.slice(11);
      if (!/^[a-f0-9-]{36}\.[a-z0-9]{3,4}$/.test(id)) return fail(400, "Id inválido");
      const store = await getStorage();
      await store.delete(`media-${id}`);
      return json({ ok: true });
    }

    return fail(404, "Ruta no encontrada");
  } catch (err) {
    console.error(err);
    return fail(500, "Error del servidor");
  }
};
