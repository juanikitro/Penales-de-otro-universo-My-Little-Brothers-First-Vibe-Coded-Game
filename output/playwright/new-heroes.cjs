const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const base=process.env.BASE_URL||'http://localhost:4173';
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    await context.addInitScript(()=>{
      window.ballFrames=0;window.keeperFrames=[];
      const arc=CanvasRenderingContext2D.prototype.arc,scale=CanvasRenderingContext2D.prototype.scale;
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){if(this.canvas.id==='pitch'&&r>=10&&r<=18&&this.fillStyle==='#f8fff0')window.ballFrames++;return arc.call(this,x,y,r,...rest);};
      CanvasRenderingContext2D.prototype.scale=function(x,y){if(this.canvas.id==='pitch'&&y===.76){const m=this.getTransform();window.keeperFrames.push({x:m.e,y:m.f});}return scale.call(this,x,y);};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto(base);
    assert.equal(await page.locator('.hero-card').count(),7);
    await page.screenshot({path:path.join(__dirname,'seven-heroes.png'),fullPage:true});
    async function start(hero){
      await page.evaluate(index=>{let calls=0;Math.random=()=>calls++===0?(index+.5)/7:.5;},['goku','naruto','subzero','pikachu','peppa','ghost','spiderman'].indexOf(hero));
      await page.locator(`[data-hero="${hero}"]`).click();await page.locator('#start').click();
    }
    async function reset(){await page.locator('#leave').click();await page.locator('#confirm-exit').click();}
    for(const hero of ['pikachu','peppa','ghost','spiderman']){
      await start(hero);await page.locator('#pitch').press('Enter');
      if(hero==='ghost'){
        await page.locator('#status').filter({hasText:'VOLVERÁ'}).waitFor();
        const before=await page.evaluate(()=>window.ballFrames);await page.waitForTimeout(200);
        assert.equal(await page.evaluate(()=>window.ballFrames),before,'el fantasma no debe dibujar la pelota ni su aura');
        await page.screenshot({path:path.join(__dirname,'ghost-invisible.png')});
        await page.locator('#status').filter({hasText:'VISIÓN RECUPERADA'}).waitFor();
      }
      if(hero==='pikachu'){await page.waitForTimeout(450);await page.screenshot({path:path.join(__dirname,'pikachu-ray.png')});}
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});await page.locator('#next').click();
      if(hero==='peppa'){
        await page.locator('#status').filter({hasText:'VISIÓN TAPADA'}).waitFor();
        const before=await page.evaluate(()=>window.ballFrames);await page.waitForTimeout(200);
        assert.equal(await page.evaluate(()=>window.ballFrames),before,'el barro oculta la pelota');
        await page.screenshot({path:path.join(__dirname,'peppa-mud.png')});
        await page.locator('#status').filter({hasText:'VISIÓN RECUPERADA'}).waitFor();
      }
      if(hero==='spiderman'){
        await page.waitForTimeout(1100);
        const initial=await page.evaluate(()=>window.keeperFrames.at(-1));
        await page.locator('#pitch').press('ArrowLeft');await page.waitForTimeout(150);
        assert.deepEqual(await page.evaluate(()=>window.keeperFrames.at(-1)),initial,'el arquero está anclado');
        await page.screenshot({path:path.join(__dirname,'spiderman-webs.png')});
        await page.locator('#status').filter({hasText:'TELARAÑAS ROTAS'}).waitFor();
        await page.locator('#pitch').press('ArrowLeft');await page.waitForTimeout(150);
        assert.ok((await page.evaluate(()=>window.keeperFrames.at(-1))).x<initial.x-10,'el arquero puede moverse después');
      }
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      console.log(`OK: ${hero}, como atacante y rival, poder temporal y partido continúan.`);
      await reset();
    }
    assert.deepEqual(errors,[]);console.log('OK: sin errores de JavaScript ni recursos fallidos.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
