/* Tiny static server for the PRODUCTION build (no packages), so the PWA tests can
 * exercise the real service worker — it never runs under ng serve. Serves
 * e2e/.data/dist on http://localhost:4400 with the SPA fallback GitHub Pages
 * gives (unknown paths → index.html). localhost counts as a secure context,
 * so service workers are allowed. */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../.data/dist");
const PORT = Number(process.env.PWA_PORT || 4400);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".wasm": "application/wasm", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain"
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(urlPath)) { res.writeHead(404); return res.end("Not found"); }
    file = path.join(ROOT, "index.html");                // SPA route
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
