import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

/**
 * Serve the built client.
 *
 * Written out rather than taken from a package because it is forty lines and
 * a dependency here would be a supply-chain risk on the one process facing
 * the internet, to save forty lines.
 *
 * Three things it has to get right:
 *
 * **Path traversal.** The path comes from a request, so it is attacker
 * controlled and it is used to open a file. Every resolved path is checked to
 * be inside the build directory, which is the check rather than the
 * intention: sanitising the string and hoping is how directory traversal
 * survives code review.
 *
 * **The single-page fallback.** A world is one HTML page and a client-side
 * router, so an unknown path is a route rather than a missing file — but only
 * for documents. Falling back to HTML for a missing asset turns a broken
 * script tag into a page that loads and then does nothing, which is far
 * harder to diagnose than a 404.
 *
 * **Caching.** Assets carry a content hash in their names, so they can be
 * cached forever and a deploy invalidates them by changing the name. The HTML
 * cannot: it is what points at the hashed names, and caching it is how a
 * browser ends up asking for assets that no longer exist.
 */

const ROOT = resolve(process.env.SERVE_ROOT ?? "dist");
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
  [".glb", "model/gltf-binary"],
  [".ktx2", "image/ktx2"],
  [".woff2", "font/woff2"],
  [".ico", "image/x-icon"],
]);

/** The file a request names, or null if it names nothing inside the build. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const candidate = resolve(join(ROOT, normalize(decoded)));
  // Checked, not assumed: the string may normalise into somewhere else.
  if (candidate !== ROOT && !candidate.startsWith(ROOT + "/")) return null;
  if (!existsSync(candidate)) return null;
  const stats = statSync(candidate);
  if (stats.isDirectory()) {
    const indexFile = join(candidate, "index.html");
    return existsSync(indexFile) ? indexFile : null;
  }
  return candidate;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const url = request.url ?? "/";
  if (url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }

  let file = resolveFile(url);

  // A document falls back to the app; an asset does not. See the note above.
  const looksLikeAsset = extname(url.split("?")[0] ?? "") !== "";
  if (!file && !looksLikeAsset) file = join(ROOT, "index.html");

  if (!file || !existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }

  const ext = extname(file);
  const isHtml = ext === ".html";
  response.writeHead(200, {
    "content-type": TYPES.get(ext) ?? "application/octet-stream",
    "cache-control": isHtml
      ? "no-cache"
      : "public, max-age=31536000, immutable",
    // The client is same-origin with nothing; the relay lives elsewhere and
    // is reached over a socket, so nothing here needs to be embeddable.
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT} on ${PORT}`);
});
