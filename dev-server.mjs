// Servidor local para probar el sitio completo sin Netlify:  npm run dev
// Guarda los datos en ./.data y usa la contraseña "lamont" si no defines ADMIN_PASSWORD.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

process.env.PORTFOLIO_LOCAL = "1";
process.env.ADMIN_PASSWORD ||= "lamont";
const { default: api } = await import("./netlify/functions/api.mjs");

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const root = join(process.cwd(), "public");
const port = Number(process.env.PORT) || 8888;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const response = await api(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    if (["/admin", "/panel", "/panel/"].includes(url.pathname)) file = join(root, "admin/index.html");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    try {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" }).end(await readFile(join(root, "404.html")));
    } catch { res.writeHead(404).end("No encontrado"); }
  }
}).listen(port, () => console.log(`Portafolio en http://localhost:${port}  ·  panel: /panel  (clave local: ${process.env.ADMIN_PASSWORD})`));
