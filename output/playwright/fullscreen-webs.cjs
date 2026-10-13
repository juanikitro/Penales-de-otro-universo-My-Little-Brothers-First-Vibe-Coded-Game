const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390}});
    await context.addInitScript(()=>{
      let calls=0;Math.random=()=>calls++===0?6.5/7:.5;
      window.layerOrder=[];
      const clear=CanvasRenderingContext2D.prototype.clearRect,scale=CanvasRenderingContext2D.prototype.scale,ellipse=CanvasRenderingContext2D.prototype.ellipse;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.id==='pitch')window.layerOrder=[];return clear.apply(this,args);};
      CanvasRenderingContext2D.prototype.scale=function(x,y){if(this.canvas.id==='pitch'){if(y===.76)window.layerOrder.push('keeper');if(y===1.1||y===1.02)window.layerOrder.push('shooter');}return scale.call(this,x,y);};
      CanvasRenderingContext2D.prototype.ellipse=function(x,y,rx,ry,...rest){if(this.canvas.id==='pitch'&&rx===18&&ry===10)window.layerOrder.push('web');return ellipse.call(this,x,y,rx,ry,...rest);};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.BASE_URL||'http://localhost:4173');
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'true');
    await page.locator('[data-hero="spiderman"]').click();await page.locator('#start').click();
    await page.waitForTimeout(120);
    const order=await page.evaluate(()=>window.layerOrder);
    assert.ok(order.indexOf('keeper')<order.indexOf('web'));
    assert.ok(order.lastIndexOf('web')<order.indexOf('shooter'),'las telas quedan detrás del pateador');
    await page.screenshot({path:path.join(__dirname,'fullscreen-webs.png')});
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
    assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'false');
    await page.locator('#pitch').press('Enter');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});await page.locator('#next').click();
    // El bloqueo sigue activo al 50%, antes ya se habría liberado.
    await page.waitForTimeout(2000);
    assert.match(await page.locator('#status').textContent(),/ANCLADO|telarañas/);
    await page.locator('#status').filter({hasText:'TELARAÑAS ROTAS'}).waitFor({timeout:3000});
    await page.locator('#pitch').press('ArrowLeft');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    assert.deepEqual(errors,[]);
    console.log('OK: pantalla completa entra/sale sin reiniciar; capas arquero → telas → pateador; bloqueo más largo y liberación.');
    const unsupported=await browser.newContext();
    await unsupported.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;Element.prototype.webkitRequestFullscreen=undefined;});
    const fallback=await unsupported.newPage();await fallback.goto(process.env.BASE_URL||'http://localhost:4173');
    await fallback.locator('#fullscreen').click();assert.equal(await fallback.locator('#fullscreen-guide').isVisible(),true);
    assert.equal(await fallback.locator('#fullscreen').getAttribute('aria-pressed'),'true');
    await fallback.locator('#fullscreen-guide .primary').click();
    await fallback.locator('#start').click();assert.equal(await fallback.locator('#match').isVisible(),true);
    console.log('OK: navegador sin API muestra un aviso y permite seguir jugando.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
