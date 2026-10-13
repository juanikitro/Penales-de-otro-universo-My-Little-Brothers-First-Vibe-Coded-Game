const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(['index.html','styles.css','rules.js','game.js','manifest.webmanifest','icon.svg']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
http.createServer((request, response) => {
  let name;
  try { name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { response.writeHead(400); response.end('Solicitud inválida'); return; }
  if (!files.has(name)) { response.writeHead(404); response.end('No encontrado'); return; }
  fs.readFile(path.join(__dirname, name), (error, content) => {
    if (error) { response.writeHead(500); response.end('No se pudo leer el archivo'); return; }
    response.writeHead(200, {'Content-Type':types[path.extname(name)], 'Cache-Control':'no-store'});
    response.end(content);
  });
}).listen(4173, '127.0.0.1', () => console.log('Penales de otro universo: http://localhost:4173'));
