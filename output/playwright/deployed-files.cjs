const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  for(const file of ['index.html','styles.css','rules.js','game.js','manifest.webmanifest','icon.svg']){
    const response=await fetch(`https://penales-de-otro-universo.vercel.app/${file}`);
    assert.equal(response.status,200);
    const deployed=Buffer.from(await response.arrayBuffer());
    const local=fs.readFileSync(path.resolve(__dirname,'../..',file));
    const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
    assert.equal(hash(deployed),hash(local));
    console.log(`OK: ${file}, HTTP 200, contenido publicado idéntico al archivo validado (${deployed.length} bytes).`);
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
