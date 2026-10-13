const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    await context.addInitScript(()=>{Math.random=()=>.5;});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:4173');
    for(const hero of ['goku','naruto','subzero']){
      await page.locator(`[data-hero="${hero}"]`).click();
      await page.locator('#start').click();await page.locator('#pitch').press('Enter');
      await page.waitForTimeout(hero==='goku'?500:1000);
      assert.equal(await page.locator('#announcement').isVisible(),false,`${hero}: no debe atajar durante el acercamiento`);
      if(hero==='naruto')await page.screenshot({path:path.join(__dirname,'naruto-approaching-goal.png')});
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      assert.equal(await page.locator('#result-title').textContent(),'¡ATAJADA!');
      await page.locator('#leave').click();await page.locator('#confirm-exit').click();
    }
    console.log('OK: Gokú, Naruto y Sub-Zero completan el vuelo; las atajadas se resuelven al llegar al arco.');
    await page.locator('#start').click();await page.locator('#pitch').press('Enter');
    await page.waitForTimeout(600);await page.locator('#ice').click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#announcement').isVisible(),false);
    assert.match(await page.locator('#ice').textContent(),/SOLTAR/);
    await page.locator('#ice').click();
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    console.log('OK: congelar delante del arquero tampoco produce una atajada por superposición.');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
