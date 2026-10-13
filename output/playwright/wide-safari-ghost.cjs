const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.BASE_URL||'http://localhost:4173';
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    await context.addInitScript(()=>{
      let calls=0;Math.random=()=>calls++===0?5.5/7:.5;window.ballTrace=[];window.keeperScale=null;
      const arc=CanvasRenderingContext2D.prototype.arc,scale=CanvasRenderingContext2D.prototype.scale;
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){if(this.canvas.id==='pitch'&&this.fillStyle==='#f8fff0'&&r>=10&&r<=18)window.ballTrace.push({x,y});return arc.call(this,x,y,r,...rest);};
      CanvasRenderingContext2D.prototype.scale=function(x,y){if(this.canvas.id==='pitch'&&y===.76)window.keeperScale={x,y};return scale.call(this,x,y);};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(base);await page.locator('[data-hero="ghost"]').click();await page.locator('#start').click();
    for(const [width,height] of [[844,390],[667,375],[932,430]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const pitch=await page.locator('#pitch').boundingBox(),arena=await page.locator('#arena').boundingBox();
      assert.ok(Math.abs(pitch.width-arena.width)<2,'la cancha llena el ancho disponible');
      assert.ok(Math.abs(pitch.height-arena.height)<2);
      const scale=await page.evaluate(()=>window.keeperScale);
      assert.ok(Math.abs(scale.x*pitch.width/1100-scale.y*pitch.height/620)<.001,'el arquero conserva sus proporciones');
    }
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(100);
    await page.screenshot({path:path.join(__dirname,'wide-pitch-mobile.png')});
    // Gesto táctil usando las dimensiones nuevas.
    const rect=await page.locator('#pitch').boundingBox(),client=await context.newCDPSession(page);
    const from={x:rect.x+rect.width*.5,y:rect.y+rect.height*548/620};
    const to={x:rect.x+rect.width*730/1100,y:rect.y+rect.height*176/620};
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#status').filter({hasText:'VOLVERÁ'}).waitFor();
    const count=await page.evaluate(()=>window.ballTrace.length);await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.ballTrace.length),count);
    await page.locator('#status').filter({hasText:'NUEVA DIRECCIÓN'}).waitFor();
    await page.waitForTimeout(100);
    const first=await page.evaluate(i=>window.ballTrace[i],count);
    assert.ok(first.x>630&&first.x<690,'reaparece donde iba a estar, sin teletransportarse');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    const last=await page.evaluate(()=>window.ballTrace.at(-1));assert.ok(last.x<first.x-100,'ahora viaja hacia el otro destino');
    assert.deepEqual(errors,[]);
    console.log('OK: 3 tamaños horizontales sin márgenes, proporciones y gestos; fantasma invisible, reaparición y cambio de dirección.');
    const fallback=await browser.newContext({viewport:{width:844,height:390}});
    await fallback.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;});
    const p=await fallback.newPage();await p.goto(base);await p.locator('#fullscreen').click();
    assert.equal(await p.locator('#fullscreen-guide').isVisible(),true);
    assert.match(await p.locator('#fullscreen-guide').textContent(),/Agregar a pantalla de inicio/);
    await p.locator('#fullscreen-guide .primary').click();await p.locator('#start').click();
    assert.equal(await p.evaluate(()=>document.body.classList.contains('expanded-view')),true);
    await p.screenshot({path:path.join(__dirname,'safari-expanded-view.png')});
    await p.locator('#fullscreen').click();assert.equal(await p.evaluate(()=>document.body.classList.contains('expanded-view')),false);
    const manifest=await (await p.request.get(`${base}/manifest.webmanifest`)).json();assert.equal(manifest.display,'standalone');
    assert.equal(await p.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'),'yes');
    console.log('OK: sin API nativa ofrece vista ampliada, guía iPhone y configuración standalone.');
  }finally{await browser.close();}
  let safari;
  try{safari=await webkit.launch({headless:true});}catch{console.log('WebKit no está instalado; no se verificó Safari físico.');return;}
  try{
    const p=await safari.newPage({viewport:{width:844,height:390}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base);await p.locator('#start').click();const a=await p.locator('#arena').boundingBox(),c=await p.locator('#pitch').boundingBox();
    assert.ok(Math.abs(c.width-a.width)<2);await p.locator('#pitch').press('Enter');await p.locator('#announcement').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);console.log('OK: motor WebKit, cancha ancha y tiro completo. Esto no sustituye la prueba en un iPhone físico.');
  }finally{await safari.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
