const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:844,height:390}});
    await context.addInitScript(()=>{Math.random=()=>.5;});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:4173');
    await page.locator('#start').click();
    await page.screenshot({path:path.join(__dirname,'pitch-mobile.png')});
    for(let round=0;round<5;round++){
      await page.locator('#pitch').press('Enter');
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      assert.equal(await page.locator('#result-title').textContent(),'¡ATAJADA!');
      await page.locator('#next').click();
      await page.locator('#pitch').press('ArrowUp');
      await page.locator('#pitch').press('ArrowUp');
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      await page.locator('#next').click();
    }
    assert.equal(await page.locator('#round-label').textContent(),'DESEMPATE 1');
    assert.equal(await page.locator('#finish').isVisible(),false);
    await page.locator('#pitch').press('ArrowLeft');await page.locator('#pitch').press('ArrowLeft');await page.locator('#pitch').press('ArrowLeft');
    await page.locator('#pitch').press('ArrowUp');await page.locator('#pitch').press('ArrowUp');await page.locator('#pitch').press('ArrowUp');
    await page.locator('#pitch').press('Enter');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    assert.equal(await page.locator('#result-title').textContent(),'¡GOOOL!');
    assert.equal(await page.locator('#next').textContent(),'SIGUIENTE TURNO →');
    await page.locator('#next').click();
    await page.locator('#pitch').press('ArrowUp');await page.locator('#pitch').press('ArrowUp');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    await page.locator('#next').click();
    assert.equal(await page.locator('#final-score').textContent(),'1 : 0');
    console.log('OK: empate 0-0, sexta ronda completa y victoria 1-0 en el navegador.');

    const iceContext=await browser.newContext({viewport:{width:844,height:390}});
    await iceContext.addInitScript(()=>{let calls=0;Math.random=()=>calls++===0?2.5/7:.9;});
    const icePage=await iceContext.newPage();icePage.on('pageerror',e=>errors.push(e.message));
    await icePage.goto('http://localhost:4173');
    await icePage.locator('[data-level="medium"]').click();await icePage.locator('#start').click();
    assert.equal(await icePage.locator('#rival-name').textContent(),'SUB-ZERO');
    await icePage.locator('#pitch').press('Enter');
    await icePage.locator('#announcement').waitFor({state:'visible',timeout:8000});await icePage.locator('#next').click();
    await icePage.locator('#status').filter({hasText:'Pelota congelada'}).waitFor({timeout:8000});
    await icePage.screenshot({path:path.join(__dirname,'rival-ice-mobile.png')});
    assert.equal(await icePage.locator('#ice').isVisible(),false);
    // El arquero puede deslizar durante el hielo y volver a corregir.
    const rect=await icePage.locator('#pitch').boundingBox();
    await icePage.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.55);await icePage.mouse.down();
    await icePage.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.45,{steps:8});await icePage.mouse.up();
    await icePage.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.55);await icePage.mouse.down();
    await icePage.mouse.move(rect.x+rect.width*.4,rect.y+rect.height*.5,{steps:8});await icePage.mouse.up();
    await icePage.locator('#announcement').waitFor({state:'visible',timeout:8000});
    console.log('OK: dificultad media, Sub-Zero rival congela y suelta solo, arquero corrige con gestos.');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
