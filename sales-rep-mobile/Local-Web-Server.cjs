const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const webPort = Number(process.env.WEB_PORT || 8081);
const webBuildFolder = path.join(__dirname, "mobile", "dist");
const contentTypes = {
  ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2",
};

function sendFile(response, filePath) {
  response.writeHead(200, {
    "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=86400",
    "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const safeRequestPath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const requestedFile = path.join(webBuildFolder, safeRequestPath);
  fs.stat(requestedFile, (error, fileDetails) => {
    if (!error && fileDetails.isFile()) return sendFile(response, requestedFile);
    const applicationEntry = path.join(webBuildFolder, "index.html");
    if (fs.existsSync(applicationEntry)) return sendFile(response, applicationEntry);
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("The web build is missing. Run START-LOCAL-APP.cmd to build and start the application.");
  });
});

server.listen(webPort, "127.0.0.1", () => {
  console.log(`SFA website available at http://localhost:${webPort}`);
});
