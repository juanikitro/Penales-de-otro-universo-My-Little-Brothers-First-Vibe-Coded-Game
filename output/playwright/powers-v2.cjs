const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    await context.addInitScript(()=>{
      Math.random=()=>.5;
      window.iceTrace=[];
      const original=CanvasRenderingContext2D.prototype.arc;
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,...args){
        if(this.canvas.id==='pitch'&&this.fillStyle==='#c8f5ff'&&r>=10&&r<19)window.iceTrace.push({x,y});
        return original.call(this,x,y,r,...args);
      };
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:4173');
    async function reset(){await page.locator('#leave').click();await page.locator('#confirm-exit').click();}
    async function cornerShot(hero){
      await page.locator(`[data-hero="${hero}"]`).click();await page.locator('#start').click();
      for(let i=0;i<3;i++){await page.locator('#pitch').press('ArrowLeft');await page.locator('#pitch').press('ArrowUp');}
      const start=Date.now();await page.locator('#pitch').press('Enter');
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      return Date.now()-start;
    }
    const goku=await cornerShot('goku');await reset();
    const naruto=await cornerShot('naruto');await reset();
    assert.ok(goku<naruto*.65,`Gokú ${goku}ms / Naruto ${naruto}ms`);
    console.log(`OK: tiempos reales de tiro: Gokú ${goku}ms, Naruto ${naruto}ms.`);
    await page.locator('[data-hero="subzero"]').click();await page.locator('#start').click();
    for(let i=0;i<2;i++)await page.locator('#pitch').press('ArrowRight');
    for(let i=0;i<3;i++)await page.locator('#pitch').press('ArrowUp');
    await page.locator('#pitch').press('Enter');await page.waitForTimeout(650);await page.locator('#ice').click();
    const frozen=await page.evaluate(()=>window.iceTrace.at(-1));
    await page.waitForTimeout(400);
    const still=await page.evaluate(()=>window.iceTrace.at(-1));
    assert.ok(Math.hypot(still.x-frozen.x,still.y-frozen.y)<.01,'la pelota debe quedarse congelada');
    await page.screenshot({path:path.join(__dirname,'subzero-v2-frozen-mobile.png')});
    await page.locator('#ice').click();
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(__dirname,'subzero-v2-redirect-mobile.png')});
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    const redirected=await page.evaluate(()=>window.iceTrace.at(-1));
    // Puede atajarse en el camino: verificamos el cambio de dirección, no que atraviese al arquero.
    assert.ok(redirected.x<frozen.x-5,'el tiro apuntado a la derecha debe desviarse hacia el nuevo destino');
    assert.equal(await page.locator('#ice').isVisible(),false);
    console.log(`OK: desvío real en cancha: congelada x=${frozen.x.toFixed(0)}, termina hacia x=${redirected.x.toFixed(0)}.`);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
