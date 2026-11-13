const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Set(["assets/ball.webp","assets/ghost.webp","assets/goal.webp","assets/goku-back.webp","assets/goku-front.webp","assets/goku-keeper.webp","assets/naruto.webp","assets/peppa.webp","assets/pikachu-back.webp","assets/pikachu.webp","assets/spiderverse-peter-back.webp","assets/spiderverse-peter.webp","assets/stadium-hd.webp","assets/subzero.webp","character-art.js","game.js","icon.svg","index.html","manifest.webmanifest","rules.js","styles.css"]);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.webp':'image/webp'};
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  let name;
  try { name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html'; }
  catch {res.writeHead(400);res.end();return;}
  if(!files.has(name)){res.writeHead(404);res.end();return;}
  fs.readFile(path.join(__dirname,name),(error,body)=>{
    if(error){res.writeHead(500);res.end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(name)],'Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  });
}).listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1');
