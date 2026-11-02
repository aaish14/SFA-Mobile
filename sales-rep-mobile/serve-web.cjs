const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.WEB_PORT || 8081);
const webRoot = path.join(__dirname, "mobile", "dist");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(response, filePath) {
  response.writeHead(200, {
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=86400",
    "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(webRoot, safePath);

  fs.stat(candidate, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, candidate);
      return;
    }

    const indexFile = path.join(webRoot, "index.html");
    if (fs.existsSync(indexFile)) {
      sendFile(response, indexFile);
      return;
    }

    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("The SFA web build is missing. Run npm run build:web first.");
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SFA web application available at http://localhost:${port}`);
});
