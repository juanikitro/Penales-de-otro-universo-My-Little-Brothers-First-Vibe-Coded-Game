// Verificación de navegador. Usa Playwright disponible en el entorno de pruebas.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1080,height:720},deviceScaleFactor:1,hasTouch:true});
    // Rival Naruto y tiros rivales al centro, para verificar atajadas reproducibles.
    await context.addInitScript(() => { let calls=0;Math.random = () => calls++===0?1.5/7:.5; });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
    await page.goto(process.env.BASE_URL||'http://localhost:4173');
    await page.screenshot({path:path.join(__dirname,'selection-desktop.png'),fullPage:true});
    assert.equal(await page.locator('.hero-card').count(),7);
    await page.locator('#start').click();
    await page.locator('#match').waitFor({state:'visible'});
    await page.screenshot({path:path.join(__dirname,'pitch-desktop.png')});

    // Cinco goles apuntando a una esquina y cinco atajadas contra Naruto.
    for(let round=0;round<5;round++){
      const rect = await page.locator('#pitch').boundingBox();
      const px = value => rect.x + value/1100*rect.width;
      const py = value => rect.y + value/620*rect.height;
      await page.mouse.move(px(550),py(548));
      await page.mouse.down();
      await page.mouse.move(px(285),py(187),{steps:12});
      await page.mouse.up();
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      assert.equal(await page.locator('#result-title').textContent(),'¡GOOOL!');
      await page.locator('#next').click();
      await page.locator('#pitch').press('ArrowUp');
      await page.locator('#pitch').press('ArrowUp');
      await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
      assert.equal(await page.locator('#result-title').textContent(),'¡ATAJADA!');
      await page.locator('#next').click();
    }
    assert.equal(await page.locator('#finish-title').textContent(),'¡SOS EL CAMPEÓN!');
    assert.equal(await page.locator('#final-score').textContent(),'5 : 0');
    await page.screenshot({path:path.join(__dirname,'celebration-desktop.png')});
    console.log('OK: partido completo 5-0, deslizamientos, Gokú, clones rivales de Naruto, atajadas y celebración.');

    await page.locator('#change').click();
    await page.locator('[data-hero="subzero"]').click();
    await page.locator('#start').click();
    await page.locator('#pitch').press('Enter');
    await page.waitForTimeout(380);
    await page.locator('#ice').click();
    assert.match(await page.locator('#ice').textContent(),/SOLTAR/);
    await page.screenshot({path:path.join(__dirname,'ice-desktop.png')});
    await page.locator('#help').click();
    const text = await page.locator('#ice').textContent();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#ice').textContent(),text,'la ayuda debe pausar el hielo');
    await page.locator('#help-dialog .primary').click();
    await page.locator('#ice').click();
    assert.equal(await page.locator('#ice').isDisabled(),true);
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    console.log('OK: congelación manual, pausa de ayuda, descongelación y poder de un solo uso.');

    await page.locator('#leave').click();
    await page.locator('#confirm-exit').click();
    await page.locator('#start').click();
    await page.locator('#pitch').press('Enter');
    await page.waitForTimeout(380);
    await page.locator('#ice').click();
    await page.waitForTimeout(3300);
    assert.equal(await page.locator('#ice').isDisabled(),true);
    assert.match(await page.locator('#ice').textContent(),/USADO/);
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    console.log('OK: descongelación automática después de tres segundos.');

    await page.locator('#leave').click();
    await page.locator('#confirm-exit').click();
    await page.locator('[data-hero="naruto"]').click();
    await page.locator('[data-level="hard"]').click();
    await page.locator('#start').click();
    await page.locator('#pitch').press('Enter');
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(__dirname,'naruto-clones.png')});
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    await page.locator('#next').click();
    await page.locator('#pitch').press('ArrowRight');
    await page.locator('#pitch').press('ArrowLeft');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    await page.locator('#next').click();
    for(let i=0;i<5;i++)await page.locator('#pitch').press('ArrowRight');
    await page.locator('#pitch').press('Enter');
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    assert.equal(await page.locator('#result-title').textContent(),'¡AFUERA!');
    console.log('OK: Naruto jugador, dificultad difícil, correcciones del arquero y tiro afuera.');

    await page.locator('#leave').click();
    await page.locator('#confirm-exit').click();
    await page.setViewportSize({width:844,height:390});
    await page.screenshot({path:path.join(__dirname,'selection-mobile.png'),fullPage:true});
    await page.locator('#start').click();
    await page.screenshot({path:path.join(__dirname,'pitch-mobile.png')});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false);
    // Gesto táctil real, en vez de eventos de mouse.
    const rect = await page.locator('#pitch').boundingBox();
    const client = await context.newCDPSession(page);
    const from={x:rect.x+rect.width*.5,y:rect.y+rect.height*548/620};
    const to={x:rect.x+rect.width*285/1100,y:rect.y+rect.height*187/620};
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#announcement').waitFor({state:'visible',timeout:8000});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#rotate').isVisible(),true);
    await page.locator('#portrait-play').click();
    assert.equal(await page.locator('#rotate').isVisible(),false);
    console.log('OK: pantalla horizontal 844x390, gesto táctil y aviso para girar el celular.');
    assert.deepEqual(errors,[]);
    console.log('OK: sin errores JavaScript ni recursos HTTP fallidos.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
