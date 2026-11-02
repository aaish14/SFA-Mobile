// Local-only fixture for the existing SFA health contract and an expired proxy.
const http = require('node:http');
http.createServer((req, res) => {
  if (req.url === '/html/api/health') {
    res.writeHead(530, { 'content-type': 'text/html' });
    res.end('<html>Cloudflare tunnel unavailable</html>');
    return;
  }
  if (req.url === '/api/health' || req.url === '/demo/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { mockMode: req.url.startsWith('/demo/') }, message: 'SFA API is ready' }));
    return;
  }
  res.writeHead(501, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'This connection test does not model that endpoint' }));
}).listen(process.env.PORT);
