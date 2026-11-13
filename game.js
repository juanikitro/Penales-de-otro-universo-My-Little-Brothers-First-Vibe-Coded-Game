/* Todo el juego corre en el navegador; no necesita cuentas ni servicios externos. */
(() => {
  'use strict';
  const R = window.PenaltyRules;
  const $ = id => document.getElementById(id);
  const canvas = $('pitch');
  const ctx = canvas.getContext('2d');
  const WORLD_WIDTH = 1100, WORLD_HEIGHT = 620;
  const GOAL = { x: 250, y: 165, width: 600, height: 220 };
  const ORIGIN = { x: 550, y: 548 };
  const heroIds = Object.keys(R.heroes);
  let chosen = 'goku', difficulty = 'easy', opponent = 'naruto';
  let match = R.newMatch(), screen = 'selection', phase = 'ready', side = 'player';
  let shot = null, drag = null, warmup = 0, turnClock = 0, elapsed = 0, lastTime = 0;
  let keeper = { x: 0, y: .70 }, keeperAim = { x: 0, y: .70 }, keyboardAim = { x: 0, y: 0 };
  let muted = false, audioContext = null, audioAvailable = true;
  let viewportRatio = 1;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const characterArt = {}, sceneArt = {};
  async function loadArtwork() {
    const start=$('start'),label=start.innerHTML;
    start.disabled=true;start.textContent='CARGANDO DIBUJOS…';
    const sources=new Map();
    const load=src=>{
      if(!sources.has(src))sources.set(src,new Promise((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);
        image.onerror=()=>reject(new Error(src));image.src=src;
      }));
      return sources.get(src);
    };
    try {
      await Promise.all(heroIds.map(async id=>{
        const config=window.CharacterArt.heroes[id],frames={};
        await Promise.all(['front','back','keeper'].map(async pose=>{
          const spec=config[pose],image=await load(spec.src),crop=spec.crop;
          const maxWidth=pose==='keeper'?165:id==='spiderman'?190:120;
          const height=Math.min(248,maxWidth*crop[3]/crop[2]),width=crop[2]/crop[3]*height;
          frames[pose]={image,crop,bounds:{x:-width/2,y:110-height,width,height}};
        }));
        // Una máscara por arquero, calculada al cargar; no se leen píxeles en cada frame.
        const frame=frames.keeper,maskCanvas=document.createElement('canvas');
        maskCanvas.height=128;maskCanvas.width=Math.max(1,Math.round(frame.bounds.width/frame.bounds.height*128));
        const maskContext=maskCanvas.getContext('2d',{willReadFrequently:true});
        maskContext.drawImage(frame.image,...frame.crop,0,0,maskCanvas.width,maskCanvas.height);
        const pixels=maskContext.getImageData(0,0,maskCanvas.width,maskCanvas.height).data;
        const alpha=new Uint8Array(maskCanvas.width*maskCanvas.height);
        for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3]>=180?1:0;
        frames.silhouette={width:maskCanvas.width,height:maskCanvas.height,alpha,bounds:frame.bounds};
        frames.feet=[-1,1].map(sign=>{
          let sumX=0,sumY=0,count=0;
          for(let y=Math.floor(maskCanvas.height*.88);y<maskCanvas.height;y++)for(let x=0;x<maskCanvas.width;x++){
            if(!alpha[y*maskCanvas.width+x] || (x<maskCanvas.width/2)!==(sign<0))continue;
            sumX+=x+.5;sumY+=y+.5;count++;
          }
          return {x:count?frame.bounds.x+sumX/count/maskCanvas.width*frame.bounds.width:sign*20,
            y:count?frame.bounds.y+sumY/count/maskCanvas.height*frame.bounds.height:99};
        });
        characterArt[id]=frames;
        document.querySelectorAll(`[data-portrait="${id}"]`).forEach(c=>drawPortrait(id,c));
      }));
      await Promise.all(Object.entries(window.CharacterArt.scene).map(async([id,src])=>{sceneArt[id]=await load(src);}));
      start.innerHTML=label;start.disabled=false;$('art-status').hidden=true;
    }catch(error){
      start.textContent='DIBUJOS NO DISPONIBLES';
      $('art-status').hidden=false;
      $('art-status').textContent='No se pudo cargar una ilustración. Revisá la conexión y recargá la página para reintentar.';
    }
  }
  let impactShot = null, impactStarted = 0;
  let renderedPixelRatio = window.devicePixelRatio || 1;
  function fitResolution(element) {
    const rect=element.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    // Hasta 2x y 8 millones de píxeles: nitidez sin asignaciones excesivas en móvil.
    const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(8000000/(rect.width*rect.height)));
    const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    if(element.width===width&&element.height===height)return;
    element.width=width;element.height=height;
    const context=element.getContext('2d');
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  }
  function fitPitch() {
    const rect=canvas.getBoundingClientRect();
    if(rect.width&&rect.height)viewportRatio=(rect.height/WORLD_HEIGHT)/(rect.width/WORLD_WIDTH);
    fitResolution(canvas);
    renderedPixelRatio=window.devicePixelRatio||1;
    keeper.aspect=viewportRatio;
  }
  new ResizeObserver(fitPitch).observe(canvas);
  const rand = (a, b) => a + Math.random() * (b - a);
  const goalPoint = R.goalPoint;
  const goalCoords = p => ({ x: (p.x - GOAL.x) / GOAL.width * 2 - 1, y: (p.y - GOAL.y) / GOAL.height * 2 - 1 });
  const heroForSide = who => who === 'player' ? chosen : opponent;
  const keeperHeroId = () => heroForSide(side === 'player' ? 'rival' : 'player');
  const keeperHints = {
    goku: 'Movete más rápido por un instante.',
    naruto: 'Dejá un clon y movete para cubrir otro lugar.',
    subzero: 'Elegí una dirección y deslizate sin poder corregir.',
    peppa: 'Si el lodo alcanza la pelota, la frena un poco.',
    pikachu: 'Atraé la pelota cuando pase cerca de tus guantes.',
    ghost: 'Apuntá con el deslizamiento o las flechas y saltá a ese lugar.',
    spiderman: 'Apuntá y dejá una pequeña red en ese lugar.'
  };
  const pointOnCanvas = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * WORLD_WIDTH / rect.width, y: (e.clientY - rect.top) * WORLD_HEIGHT / rect.height };
  };

  function initAudio() {
    if (muted || !audioAvailable) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Sin AudioContext');
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => { audioAvailable = false; $('sound').title = 'El navegador no pudo activar el sonido'; });
    } catch {
      audioAvailable = false;
      $('sound').title = 'Sonido no disponible en este navegador';
    }
  }
  function tone(frequency, duration, type = 'sine', delay = 0, volume = .08) {
    if (muted || !audioContext || audioContext.state !== 'running') return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + duration);
  }
  function sound(kind) {
    if (kind === 'kick') { tone(140, .18, 'triangle'); tone(75, .14); }
    if (kind === 'goku') { tone(240, .3, 'sawtooth', 0, .035); tone(490, .3, 'triangle', .08); }
    if (kind === 'naruto') { tone(540, .12); tone(740, .12, 'sine', .10); tone(940, .18, 'sine', .20); }
    if (kind === 'ice') { tone(1400, .2); tone(1900, .25, 'sine', .08); }
    if (kind === 'pikachu') { tone(1800,.14,'sawtooth',0,.03); tone(900,.22,'square',.1,.025); }
    if (kind === 'peppa') { tone(75,.3,'triangle'); tone(110,.2,'sine',.1); }
    if (kind === 'ghost') { tone(440,.5,'sine',0,.05); tone(660,.5,'sine',.1,.035); }
    if (kind === 'spiderman') { tone(1500,.12,'triangle'); tone(350,.2,'triangle',.08); }
    if (kind === 'save') { tone(85, .25, 'triangle'); tone(200, .12, 'triangle'); }
    if (kind === 'miss') tone(130, .4, 'triangle');
    if (kind === 'goal' || kind === 'win') [523, 659, 784, 1047].forEach((n, i) => tone(n, .28, 'triangle', i * .12));
  }

  function showScreen(next) {
    screen = next;
    ['selection', 'match', 'finish'].forEach(id => { $(id).hidden = next !== id; });
    document.body.classList.toggle('in-match', next === 'match');
    if(next==='match')fitPitch();
  }
  function startMatch() {
    initAudio();
    opponent = heroIds[Math.floor(Math.random() * heroIds.length)];
    match = R.newMatch();
    $('your-name').textContent = R.heroes[chosen].name.toUpperCase();
    $('rival-name').textContent = R.heroes[opponent].name.toUpperCase();
    $('match-level').textContent = 'DESAFÍO · ' + R.levels[difficulty].name.toUpperCase();
    showScreen('match');
    prepareTurn();
    canvas.focus({ preventScroll: true });
  }
  function updateScore() {
    $('your-score').textContent = R.score(match.player);
    $('rival-score').textContent = R.score(match.rival);
    const round = Math.min(match.player.length, match.rival.length) + 1;
    $('round-label').textContent = round <= 5 ? `RONDA ${round} / 5` : `DESEMPATE ${round - 5}`;
    for (const who of ['player', 'rival']) {
      const container = $(who === 'player' ? 'your-dots' : 'rival-dots');
      const recent = match[who].slice(-5);
      container.replaceChildren();
      for (let i = 0; i < 5; i++) {
        const dot = document.createElement('span');
        dot.className = 'shot-dot' + (i < recent.length ? recent[i] ? ' goal' : ' miss' : (who === side && i === recent.length ? ' current' : ''));
        dot.title = i < recent.length ? recent[i] ? 'Gol' : 'Sin gol' : 'Pendiente';
        container.append(dot);
      }
      container.setAttribute('aria-label', `${who === 'player' ? 'Vos' : 'Rival'}: ${R.score(match[who])} goles en ${match[who].length} tiros`);
    }
  }
  function prepareTurn() {
    side = match.player.length === match.rival.length ? 'player' : 'rival';
    phase = 'ready'; shot = null; drag = null; warmup = .95; turnClock = 0;
    keeper = { x: 0, y: .70, aspect:viewportRatio }; keeperAim = { ...keeper }; keyboardAim = { x: 0, y: 0 };
    $('announcement').hidden = true;
    $('ice').hidden = true;
    $('ice').disabled = false;
    $('keeper-power').hidden = side !== 'rival';
    $('keeper-hint').hidden = side !== 'rival';
    $('keeper-hint').textContent = keeperHints[chosen] + ' Un uso por tiro · Espacio o botón';
    updateKeeperPowerButton();
    const shooter = R.heroes[heroForSide(side)];
    $('turn-badge').textContent = side === 'player' ? 'TU TURNO DE PATEAR' : 'TU TURNO DE ATAJAR';
    $('power-tag').textContent = shooter.power;
    $('power-tag').style.color = shooter.aura;
    $('instruction').textContent = side === 'player' ? 'Deslizá desde la pelota hacia el arco' : 'Deslizá para atajar. Podés corregir la dirección';
    $('status').textContent = side === 'player' ? `Patea ${shooter.name} · También podés apuntar con las flechas y usar Enter` : `Atajás vos · Patea ${shooter.name}`;
    updateScore();
  }
  function launch(target) {
    if (phase !== 'ready') return;
    const hero = heroForSide(side);
    const decoys = [
      { x: R.clamp(target.x + (target.x > 0 ? -.85 : .85), -.96, .96), y: R.clamp(target.y - .5, -.92, .9) },
      { x: R.clamp(-target.x - .35, -.96, .96), y: R.clamp(target.y + .6, -.92, .9) }
    ];
    // La dificultad acelera al rival; el poder del jugador conserva su velocidad.
    const baseFlight = side === 'player' ? R.levels.easy.flight : R.levels[difficulty].flight;
    shot = { hero, target, decoys, progress: 0, duration: baseFlight / R.heroes[hero].speed,
      ice: { used: false, frozen: false, remaining: 0 }, aiFreezeAt: rand(.30, .58), aiReleaseAfter: rand(.6, 2.25),
      frozenElapsed: 0, redirect: null, redirectAge: 0, beforeRedirect: null, powerStage: '',
      defense: {used:false,remaining:0}, lastVisibleBall: {...ORIGIN},
      aiDefenseAt: (keeperHeroId()==='peppa'?.30:.65)+rand(-.04,.04),
      aiOffset: { x: rand(-1, 1), y: rand(-1, 1) }, aiDecoy: Math.floor(Math.random() * 2) };
    phase = 'flight'; turnClock = 0;
    if (side === 'player') drag = null;
    $('instruction').textContent = side === 'rival' ? '¡Atajá! Deslizá para seguir la pelota' : hero === 'subzero' ? 'Congelá: al soltar cambia de dirección' : '¡Tu poder está en camino!';
    $('ice').hidden = side !== 'player' || hero !== 'subzero';
    $('ice').textContent = '❄ CONGELAR';
    updateKeeperPowerButton();
    sound('kick'); sound(hero);
  }
  function keeperLocked() {
    if(phase==='result')return false;
    const hero=shot?shot.hero:heroForSide(side);
    return R.powerState(hero,shot?shot.progress:0).webbed;
  }
  function sliding() {
    return shot?.defense.hero === 'subzero' && shot.defense.remaining > 0;
  }
  function updateKeeperPowerButton() {
    const button=$('keeper-power'),power=R.keeperPowers[chosen],state=shot?.defense;
    button.disabled=phase!=='flight'||side!=='rival'||Boolean(state?.used)||keeperLocked();
    button.textContent=state?.used?`${power.icon} PODER USADO`:`${power.icon} ${power.name}`;
  }
  function useKeeperPower(automated=false) {
    if(phase!=='flight'||paused()||shot.defense.used||keeperLocked()||(!automated&&side!=='rival'))return;
    const hero=keeperHeroId();
    shot.defense=R.activateKeeperPower(hero,shot.defense,keeper,keeperAim);
    const power=shot.defense;
    if(hero==='ghost'){
      keeper.x=power.aim.x;keeper.y=power.aim.y;
    }
    if(hero==='peppa'){
      power.projectile=R.keeperPoint(keeper,{x:35,y:-28});
      power.mudAim={...shot.lastVisibleBall};
    }
    $('status').textContent=`${side==='rival'?'TU PODER':'PODER DEL RIVAL'} · ${R.keeperPowers[hero].name}`;
    sound(hero==='subzero'?'ice':hero);
    updateKeeperPowerButton();
    if(!automated)canvas.focus({preventScroll:true});
  }
  function updateKeeperProjectile(delta,ballBefore,visible) {
    const power=shot.defense;
    if(power.hero!=='peppa'||power.remaining<=0||power.mudHit||power.age>.5)return;
    const ball=ballPosition(shot.progress,shot.target,shot.redirect);
    if(visible)power.mudAim={...ball};
    const previous={...power.projectile},dx=(power.mudAim.x-previous.x)/viewportRatio,dy=power.mudAim.y-previous.y;
    const distance=Math.hypot(dx,dy),step=distance?Math.min(1,900*delta/distance):0;
    power.projectile={x:previous.x+dx*step*viewportRatio,y:previous.y+dy*step};
    if(R.mudContact(previous,power.projectile,ballBefore,ball,viewportRatio)){
      power.mudHit=true;
      $('status').textContent='¡LODO EN LA PELOTA! · Va más despacio';
    }
  }
  function updatePowerUI(state) {
    const stage=state.webbed?'web':state.mud?'mud':state.invisible?'ghost':'clear';
    if(stage===shot.powerStage)return;
    const old=shot.powerStage;shot.powerStage=stage;
    if(stage==='web'){
      $('instruction').textContent=side==='rival'?'¡Telarañas! Esperá a que se rompan':'¡El arquero está atrapado!';
      $('status').textContent='ARQUERO ANCLADO · Pronto se libera';
    }else if(stage==='mud'){
      $('instruction').textContent=side==='rival'?'¡Barro! La pelota vuelve a verse en un instante':'¡Peppa le tapó la visión al rival!';
      $('status').textContent='VISIÓN TAPADA POR BARRO';
    }else if(stage==='ghost'){
      $('instruction').textContent='¡Pelota invisible! Prepará la atajada';
      $('status').textContent='VOLVERÁ A APARECER ANTES DEL ARCO';
    }else if(old==='web'||old==='mud'||old==='ghost'){
      $('instruction').textContent=old==='ghost'?'¡Reapareció y cambió de dirección!':side==='rival'?(old==='web'?'¡Libre! Deslizá para atajar':'¡Volvió la pelota! Deslizá para atajar'):'¡El arquero puede reaccionar!';
      $('status').textContent=old==='web'?'TELARAÑAS ROTAS':old==='ghost'?'VISIÓN RECUPERADA · NUEVA DIRECCIÓN':'VISIÓN RECUPERADA';
    }
  }
  function iceToggle() {
    if (phase !== 'flight' || side !== 'player' || shot.hero !== 'subzero') return;
    const was = shot.ice.frozen;
    shot.ice = R.toggleIce(shot.ice, shot.progress);
    if (shot.ice.frozen && !was) sound('ice');
    if (was && !shot.ice.frozen) redirectShot('ice');
    updateIceButton();
  }
  function updateIceButton() {
    if (!shot || shot.hero !== 'subzero') return;
    $('ice').textContent = shot.ice.frozen ? `▶ SOLTAR · ${shot.ice.remaining.toFixed(1)} s` : shot.ice.used ? '❄ PODER USADO' : '❄ CONGELAR';
    $('ice').disabled = shot.ice.used && !shot.ice.frozen;
    if (shot.ice.frozen) $('status').textContent = `Pelota congelada · ${shot.ice.remaining.toFixed(1)} segundos`;
    else if (shot.ice.used) $('status').textContent = '¡Cambio de dirección sorpresa!';
  }
  function redirectShot(kind,at=shot.progress) {
    if (shot.redirect) return;
    shot.beforeRedirect = {...shot.target};
    shot.redirect = {at,from:R.flightPoint(at,shot.target)};
    shot.target = R.surpriseTarget(shot.target);
    shot.redirectAge = 0;
    sound(kind==='ice'?'ice':'ghost');
    $('instruction').textContent = kind==='ghost'?'¡El fantasma reapareció con otro destino!':side === 'player' ? '¡El hielo cambió el destino del tiro!' : '¡Cambió de dirección! Corregí la atajada';
  }
  function aiTarget() {
    const outside = Math.random() < R.levels[difficulty].rivalMiss;
    return { x: outside ? (Math.random() > .5 ? 1.15 : -1.15) : rand(-.92, .92), y: rand(-.85, .85) };
  }
  function finishShot(contact = null) {
    const outside = !R.inGoal(shot.target);
    const caught = !outside && Boolean(contact);
    const goal = !outside && !caught;
    shot.outcome = outside ? 'miss' : caught ? 'save' : 'goal';
    if (caught) shot.catchPoint = contact || goalPoint(shot.target);
    match = R.record(match, side, goal);
    phase = 'result';
    $('ice').hidden = true;
    $('keeper-power').hidden = true;
    $('keeper-hint').hidden = true;
    $('instruction').textContent = '';
    $('instruction').hidden = true;
    const title = goal ? '¡GOOOL!' : caught ? '¡ATAJADA!' : '¡AFUERA!';
    $('result-title').textContent = title;
    $('result-title').style.color = goal ? R.heroes[shot.hero].aura : caught ? '#d5fc59' : '#ffa6a6';
    $('result-detail').textContent = goal ? side === 'player' ? '¡Tu superpoder llegó al arco!' : 'Gol del rival. ¡El próximo lo atajás!' : caught ? side === 'player' ? 'El rival alcanzó la pelota. ¡Vamos con el próximo!' : '¡Le frenaste el superpoder!' : 'La pelota salió del arco. No suma gol.';
    const champion = R.winner(match);
    $('next').textContent = champion ? 'VER RESULTADO →' : 'SIGUIENTE TURNO →';
    $('announcement').hidden = false;
    $('status').textContent = `${title} · Vos ${R.score(match.player)} — Rival ${R.score(match.rival)}`;
    updateScore();
    sound(goal ? 'goal' : caught ? 'save' : 'miss');
    $('next').focus({ preventScroll: true });
  }
  function nextTurn() {
    if (phase !== 'result') return;
    const champion = R.winner(match);
    $('instruction').hidden = false;
    if (champion) {
      showScreen('finish');
      $('finish-title').textContent = champion === 'player' ? '¡SOS EL CAMPEÓN!' : '¡BUEN PARTIDO!';
      $('finish-detail').textContent = `${R.heroes[champion === 'player' ? chosen : opponent].name} gana el duelo de poderes.`;
      $('final-score').textContent = `${R.score(match.player)} : ${R.score(match.rival)}`;
      sound('win');
      $('replay').focus({ preventScroll: true });
    } else { prepareTurn(); canvas.focus({ preventScroll: true }); }
  }
  function paused() {
    return document.hidden || $('help-dialog').open || $('exit-dialog').open || $('fullscreen-guide').open || (document.body.classList.contains('in-match') && !document.body.classList.contains('portrait-allowed') && window.matchMedia('(max-width: 520px) and (orientation: portrait)').matches);
  }
  function update(delta) {
    if (screen !== 'match' || paused()) return;
    turnClock += delta;
    if (phase === 'ready' && side === 'rival') {
      warmup -= delta;
      if (warmup <= 0) launch(aiTarget());
    }
    if (phase === 'flight') {
      const previousProgress=shot.progress;
      const ballBefore=ballPosition(shot.progress,shot.target,shot.redirect);
      shot.defense=R.advanceKeeperPower(shot.defense,delta);
      const before = shot.ice.frozen;
      if (side === 'rival' && shot.hero === 'subzero') {
        if (!shot.ice.used && shot.progress >= shot.aiFreezeAt) { shot.ice = R.toggleIce(shot.ice, shot.progress); sound('ice'); }
        if (shot.ice.frozen) { shot.frozenElapsed += delta; if (shot.frozenElapsed >= shot.aiReleaseAfter) shot.ice = R.toggleIce(shot.ice, shot.progress); }
      }
      shot.ice = R.advanceIce(shot.ice, delta);
      if (before && !shot.ice.frozen) redirectShot('ice');
      const slowed=shot.defense.hero==='peppa'&&shot.defense.mudHit&&shot.defense.remaining>0;
      if (!shot.ice.frozen) shot.progress = Math.min(1, shot.progress + delta / shot.duration*(slowed?.65:1));
      if(shot.hero==='ghost'&&previousProgress<.65&&shot.progress>=.65)redirectShot('ghost',.65);
      if (shot.redirect && !shot.ice.frozen) shot.redirectAge += delta;
      const vision=R.powerState(shot.hero,shot.progress);
      if(!vision.mud&&!vision.invisible)shot.lastVisibleBall=ballPosition(shot.progress,shot.target,shot.redirect);
      if (side === 'player') {
        const level = R.levels[difficulty];
        if (shot.progress >= level.reaction && !vision.mud && !vision.invisible) {
          const target = shot.hero === 'naruto' && shot.progress < .72 ? shot.decoys[shot.aiDecoy]
            : shot.redirect && shot.redirectAge < (difficulty === 'hard' ? .14 : .26) ? shot.beforeRedirect : shot.target;
          keeperAim = { x: R.clamp(target.x + shot.aiOffset.x * level.accuracy, -1.05, 1.05), y: R.clamp(target.y + shot.aiOffset.y * level.accuracy, -.98, .92) };
        }
        if(shot.progress>=shot.aiDefenseAt&&!vision.mud&&!vision.invisible&&!shot.ice.frozen)useKeeperPower(true);
      }
      if (shot.hero === 'subzero') {
        updateIceButton();
      }
      updatePowerUI(R.powerState(shot.hero,shot.progress));
      updateKeeperProjectile(delta,ballBefore,!vision.mud&&!vision.invisible);
      if(side==='rival')updateKeeperPowerButton();
    }
    if (phase !== 'result' && !keeperLocked()) {
      let speed = side === 'rival' ? 3.2 : shot?.hero==='spiderman'?Math.max(1.8,R.levels[difficulty].keeperSpeed):R.levels[difficulty].keeperSpeed;
      if(shot?.defense.remaining>0&&shot.defense.hero==='goku')speed*=2.2;
      if(sliding())speed=5.2;
      const aim=sliding()?shot.defense.aim:keeperAim;
      const dx = aim.x - keeper.x, dy = aim.y - keeper.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) { const step = Math.min(1, speed * delta / distance); keeper.x += dx * step; keeper.y += dy * step; }
    }
    if(phase==='flight'&&shot.defense.hero==='pikachu'&&shot.defense.remaining>0&&shot.progress>=.78&&!shot.ice.frozen){
      const pull=R.magnetPull(shot.target,ballPosition(shot.progress,shot.target,shot.redirect),keeper,delta,32-shot.defense.pulled);
      shot.target=pull.target;shot.defense.pulled+=pull.pulled;
    }
    if (phase === 'flight' && shot.progress >= 1) {
      finishShot(R.keeperPowerContact(shot.progress,shot.target,{...keeper,hero:keeperHeroId(),silhouette:characterArt[keeperHeroId()].silhouette},shot.defense));
    }
  }

  // Formas para efectos y ayudas visuales; los personajes usan imágenes completas.
  function path(points, fill, stroke = '#0c1525', width = 3) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function drawHero(c,id,x,y,scale,pose='stand',time=0) {
    const frame=characterArt[id]?.[pose==='back'?'back':pose==='keeper'||pose==='dive'?'keeper':'front'];
    if(!frame)return;
    c.save();c.translate(x,y);c.scale(scale*(c===ctx?viewportRatio:1),scale);
    if(pose==='keeper'||pose==='dive')c.rotate(R.keeperAngle(time));
    if(pose==='win'&&!reducedMotion.matches)c.rotate(Math.sin(time*3)*.06);
    const b=frame.bounds;
    c.drawImage(frame.image,...frame.crop,b.x,b.y,b.width,b.height);
    c.restore();
  }
  function drawPortrait(id,element) {
    fitResolution(element);
    const c=element.getContext('2d'),w=element.width,h=element.height,hero=R.heroes[id];
    c.clearRect(0,0,w,h);
    const background=c.createLinearGradient(0,0,w,h);
    background.addColorStop(0,'#0b1729');background.addColorStop(1,'#244052');
    c.fillStyle=background;c.fillRect(0,0,w,h);
    const aura=c.createRadialGradient(w/2,h*.6,0,w/2,h*.6,w*.6);
    aura.addColorStop(0,hero.aura+'55');aura.addColorStop(1,hero.aura+'00');
    c.fillStyle=aura;c.fillRect(0,0,w,h);
    const frame=characterArt[id]?.front;
    if(!frame)return;
    const [sx,sy,sw,sh]=frame.crop;
    if(id==='pikachu'||id==='peppa'){
      const scale=Math.min(w*.94/sw,h*.95/sh);
      c.drawImage(frame.image,sx,sy,sw,sh,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale);
    }else{
      const source=id==='spiderman'?[360,155,220,290]:[sx,sy,sw,Math.min(sh,sh*.36)];
      const scale=Math.min(w/source[2],h/source[3]);
      c.drawImage(frame.image,...source,(w-source[2]*scale)/2,0,source[2]*scale,source[3]*scale);
    }
  }
  function drawStadium() {
    if(sceneArt.stadium)ctx.drawImage(sceneArt.stadium,0,0,1100,620);
    // Red tenue: deja visibles el arquero y la pelota sobre el fondo ilustrado.
    ctx.strokeStyle='#dcefff30';ctx.lineWidth=1;
    for(let x=GOAL.x;x<=GOAL.x+GOAL.width;x+=30){ctx.beginPath();ctx.moveTo(x,GOAL.y);ctx.lineTo(x,GOAL.y+GOAL.height);ctx.stroke();}
    for(let y=GOAL.y;y<=GOAL.y+GOAL.height;y+=24){ctx.beginPath();ctx.moveTo(GOAL.x,y);ctx.lineTo(GOAL.x+GOAL.width,y);ctx.stroke();}
    if(sceneArt.goal){
      const opening=window.CharacterArt.goalOpening;
      const width=GOAL.width/(opening.right-opening.left),height=GOAL.height/(opening.bottom-opening.top);
      ctx.drawImage(sceneArt.goal,GOAL.x-opening.left*width,GOAL.y-opening.top*height,width,height);
    }
  }
  const ballPosition = (progress,target,redirect=null) => R.flightPoint(progress,target,redirect,shot?.hero);
  // Efectos decorativos: detrás de los jugadores, sin cambiar el vuelo ni el contacto.
  function drawGokuPower() {
    const shooter=heroForSide(side);
    if(shooter!=='goku')return;
    const time=reducedMotion.matches?0:elapsed;
    ctx.save();
    if(phase==='ready'){
      ctx.translate(550,480);ctx.scale(viewportRatio,1);
      const aura=ctx.createRadialGradient(0,0,12,0,0,105);
      aura.addColorStop(0,'#8cefff30');aura.addColorStop(1,'#28c9ff00');
      ctx.fillStyle=aura;ctx.fillRect(-105,-105,210,180);
      ctx.strokeStyle='#69e6ff80';ctx.lineWidth=2;
      for(let i=0;i<7;i++){
        const x=(i-3)*19,y=38-((time*35+i*17)%95);
        ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x+4,y);ctx.stroke();
      }
    }else if(shot && phase==='flight'){
      const p=shot.progress,pos=ballPosition(p,shot.target,shot.redirect);
      ctx.translate(pos.x,pos.y);ctx.scale(viewportRatio,1);
      const before=ballPosition(Math.max(0,p-.035),shot.target,shot.redirect);
      ctx.rotate(Math.atan2(pos.y-before.y,(pos.x-before.x)/viewportRatio));
      // La estela nunca se adelanta a la pelota; crece desde el punto de lanzamiento.
      const length=Math.min(reducedMotion.matches?90:190,Math.hypot((pos.x-ORIGIN.x)/viewportRatio,pos.y-ORIGIN.y));
      const trail=ctx.createLinearGradient(-Math.max(1,length),0,0,0);
      trail.addColorStop(0,'#28baff00');trail.addColorStop(.55,'#32ccff60');trail.addColorStop(1,'#aeffffbb');
      path([[-length,0],[-length*.35,-15],[-12,-10],[-4,0],[-12,10],[-length*.35,15]],trail,null);
      path([[-length*.8,0],[-18,-4],[-5,0],[-18,4]],'#e5ffffb0',null);
      if(!reducedMotion.matches){
        ctx.strokeStyle='#8feeffaa';ctx.lineWidth=1.5;
        for(let i=0;i<6;i++){
          const x=-12-((time*120+i*27)%Math.max(1,length-12)),y=(i%2?1:-1)*(16+i%3*4);
          ctx.beginPath();ctx.moveTo(x-8,y);ctx.lineTo(x,y);ctx.stroke();
        }
      }
    }else if(shot && phase==='result' && shot.outcome!=='miss'){
      if(impactShot!==shot){impactShot=shot;impactStarted=elapsed;}
      const age=elapsed-impactStarted;
      if(age<.32 && !reducedMotion.matches){
        const pos=shot.catchPoint||ballPosition(1,shot.target,shot.redirect);
        ctx.translate(pos.x,pos.y);ctx.scale(viewportRatio,1);
        ctx.globalAlpha=(1-age/.32)*.65;ctx.strokeStyle='#9fefff';ctx.lineWidth=3;
        ctx.beginPath();ctx.arc(0,0,15+age*95,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawPikachuPower() {
    if(phase!=='flight'||shot?.hero!=='pikachu')return;
    const p=shot.progress,pos=ballPosition(p,shot.target,shot.redirect);
    const quiet=reducedMotion.matches,points=[];
    ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(viewportRatio,1);
    // Sigue únicamente posiciones ya recorridas: no revela el destino ni cambia el zigzag.
    for(let i=0;i<=24;i++){
      const previous=ballPosition(Math.max(0,p-i*(quiet?.003:.007)),shot.target,shot.redirect);
      points.push({x:(previous.x-pos.x)/viewportRatio,y:previous.y-pos.y});
    }
    ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();points.forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
    ctx.shadowColor='#ffb900';ctx.shadowBlur=quiet?0:14;
    ctx.strokeStyle='#ff9d0040';ctx.lineWidth=quiet?7:12;ctx.stroke();
    ctx.shadowBlur=0;ctx.strokeStyle='#ffd52be0';ctx.lineWidth=quiet?4:5;ctx.stroke();
    ctx.strokeStyle='#fffde9';ctx.lineWidth=1.8;ctx.stroke();
    if(!quiet){
      // Ramificaciones cortas y chispas detrás de la pelota, sin flashes de pantalla.
      ctx.strokeStyle='#ffe980bb';ctx.lineWidth=1.5;
      for(let i=5;i<points.length;i+=4){
        const point=points[i],sign=i%8===5?1:-1;
        const reach=8+Math.sin(elapsed*9+i)*3;
        ctx.beginPath();ctx.moveTo(point.x,point.y);
        ctx.lineTo(point.x+sign*7,point.y-reach*.4);
        ctx.lineTo(point.x+sign*3,point.y-reach);
        ctx.lineTo(point.x+sign*11,point.y-reach-4);ctx.stroke();
        ctx.fillStyle='#fff7b4';ctx.fillRect(point.x-sign*10,point.y+reach,2,2);
      }
    }
    ctx.restore();
  }
  function drawBall(x,y,r,hero,progress=0,ghost=false) {
    ctx.save();ctx.transform(viewportRatio,0,0,1,x*(1-viewportRatio),0);if(ghost)ctx.globalAlpha=.83;
    if(hero){const h=R.heroes[hero];ctx.shadowColor=h.aura;ctx.shadowBlur=shot?.ice.frozen?35:hero==='goku'?25:16;ctx.fillStyle=h.aura+'45';ctx.beginPath();ctx.arc(x,y,r+6+Math.sin(reducedMotion.matches?0:elapsed*14)*2,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=hero==='subzero'?'#c8f5ff':'#f8fff0';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    if(hero==='goku'||hero==='pikachu'){ctx.strokeStyle='#10263d';ctx.lineWidth=2.5;ctx.stroke();}
    ctx.save();ctx.translate(x,y);ctx.rotate(reducedMotion.matches?0:progress*8);
    if(hero==='subzero')ctx.globalAlpha*=.85;
    if(sceneArt.ball)ctx.drawImage(sceneArt.ball,...window.CharacterArt.ballCrop,-r,-r,r*2,r*2);
    ctx.restore();ctx.restore();
  }
  function drawKeeperPower() {
    const power=shot?.defense;
    if(phase!=='flight'||!power?.used||power.remaining<=0)return;
    const origin=goalPoint(power.origin),aim=goalPoint(power.aim),pos=goalPoint(keeper);
    ctx.save();
    if(power.hero==='naruto'){
      ctx.globalAlpha=.65;
      drawHero(ctx,'naruto',origin.x,origin.y+R.keeperShape.offsetY,R.keeperShape.scale,'keeper',power.origin.x);
      ctx.globalAlpha=1;ctx.fillStyle='#ffd365';ctx.textAlign='center';ctx.font='bold 12px Trebuchet MS';
      ctx.fillText('CLON',origin.x,origin.y-120);
    }else if(power.hero==='subzero'){
      ctx.strokeStyle='#a7f1ff99';ctx.lineWidth=14;
      ctx.beginPath();ctx.moveTo(origin.x,origin.y+60);ctx.lineTo(aim.x,aim.y+60);ctx.stroke();
      ctx.strokeStyle='#efffff';ctx.lineWidth=2;ctx.stroke();
    }else if(power.hero==='spiderman'){
      ctx.translate(aim.x,aim.y);ctx.scale(viewportRatio,1);
      ctx.fillStyle='#dcefff18';ctx.strokeStyle='#effaff';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,46,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(const radius of [14,29]){ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke();}
      for(let i=0;i<8;i++){const angle=i*Math.PI/4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(angle)*46,Math.sin(angle)*46);ctx.stroke();}
    }else if(power.hero==='peppa'&&!power.mudHit&&power.age<=.5){
      ctx.translate(power.projectile.x,power.projectile.y);ctx.scale(viewportRatio,1);
      ctx.fillStyle='#86502e';ctx.strokeStyle='#d8ac78';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.stroke();
    }else if(power.hero==='pikachu'){
      ctx.strokeStyle='#ffe156aa';ctx.lineWidth=2;
      for(const hand of R.keeperShape.hands){
        const point=R.keeperPoint(keeper,hand);
        ctx.save();ctx.translate(point.x,point.y);ctx.scale(viewportRatio,1);
        ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
    }else if(power.hero==='goku'||power.hero==='ghost'){
      ctx.translate(pos.x,pos.y-35);ctx.scale(viewportRatio,1);
      ctx.strokeStyle=power.hero==='goku'?'#b8fcffbb':'#bacfffaa';ctx.lineWidth=4;
      ctx.beginPath();ctx.ellipse(0,0,70,100,0,0,Math.PI*2);ctx.stroke();
      if(power.hero==='ghost'){
        ctx.translate((origin.x-pos.x)/viewportRatio,origin.y-pos.y);
        ctx.globalAlpha=.4;ctx.beginPath();ctx.ellipse(0,0,50,80,0,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawPitch() {
    ctx.setTransform(canvas.width/WORLD_WIDTH,0,0,canvas.height/WORLD_HEIGHT,0,0);
    ctx.clearRect(0,0,1100,620);drawStadium();drawGokuPower();drawPikachuPower();
    const keeperHero=heroForSide(side==='player'?'rival':'player');
    const kp=goalPoint(keeper);
    drawKeeperPower();
    drawHero(ctx,keeperHero,kp.x,kp.y+R.keeperShape.offsetY,R.keeperShape.scale,Math.abs(keeper.x)>.15?'dive':'keeper',keeper.x);
    // Delante del arquero, pero detrás del pateador y la pelota: respeta la profundidad.
    if(phase!=='result'&&keeperLocked())drawWebs(keeper);
    const shooter=heroForSide(side);
    if(phase==='ready'){drawHero(ctx,shooter,550,460,1.1,'back');drawBall(550,548,18,null);
      ctx.strokeStyle=R.heroes[shooter].aura+'66';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(550,548,32+Math.sin(elapsed*3)*3,11,0,0,Math.PI*2);ctx.stroke();
      if(side==='player'){const target=drag?drag.target:keyboardAim;const end=goalPoint(target);ctx.setLineDash([7,8]);ctx.strokeStyle='#e4fc9c99';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(550,528);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(end.x,end.y,12,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#efffcaaa';ctx.font='12px Trebuchet MS';ctx.textAlign='center';ctx.fillText('APUNTÁ ACÁ',end.x,end.y-22);}
    }else if(shot){
      drawHero(ctx,shooter,570,467,1.02,'back');
      const p=shot.progress;
      if(shot.hero==='naruto'&&p<.72){for(const target of shot.decoys){const pos=ballPosition(p,target);drawBall(pos.x,pos.y,18-p*8,shot.hero,p,true);}}
      const pos=ballPosition(p,shot.target,shot.redirect);
      const state=R.powerState(shot.hero,p);
      if(phase==='result'&&shot.outcome==='save'){const point=shot.catchPoint;drawBall(point.x,point.y,10,null,p);}
      else if(!state.invisible&&!(state.mud&&side==='rival'))drawBall(pos.x,pos.y,18-p*8,shot.hero,p);
      if(phase==='flight'&&shot.defense.mudHit&&shot.defense.remaining>0&&!state.invisible&&!(state.mud&&side==='rival')){
        ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(viewportRatio,1);ctx.strokeStyle='#86502e';ctx.lineWidth=6;
        ctx.beginPath();ctx.arc(0,0,20-p*8,0,Math.PI*2);ctx.stroke();ctx.restore();
      }
      if(shot.ice.frozen){ctx.strokeStyle='#c2f7ff';ctx.lineWidth=2;ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(elapsed*.1);for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-35);ctx.moveTo(0,-22);ctx.lineTo(-9,-29);ctx.moveTo(0,-22);ctx.lineTo(9,-29);ctx.stroke();}ctx.restore();ctx.fillStyle='#e2fbff';ctx.textAlign='center';ctx.font='bold 18px Trebuchet MS';ctx.fillText(shot.ice.remaining.toFixed(1)+' s',pos.x,pos.y-48);}
    }
    if(phase==='flight'&&side==='rival'&&R.powerState(shot.hero,shot.progress).mud)drawMud();
    if(side==='rival'&&phase!=='result'){const aim=goalPoint(keeperAim);ctx.strokeStyle='#d5fc5960';ctx.lineWidth=2;ctx.beginPath();ctx.arc(aim.x,aim.y,18,0,Math.PI*2);ctx.stroke();}
  }
  function drawWebs(k) {
    ctx.save();ctx.strokeStyle='#edf8ffcc';ctx.lineWidth=2;
    const feet=characterArt[heroForSide(side==='player'?'rival':'player')].feet;
    for(const [i,local] of feet.entries()){
      const sign=i===0?-1:1,foot=R.keeperPoint(k,local);
      for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(foot.x,foot.y-25);ctx.lineTo(foot.x+sign*(12+i*4),foot.y+4);ctx.lineTo(foot.x-sign*10,foot.y-6+i*2);ctx.stroke();}
      ctx.beginPath();ctx.ellipse(foot.x,foot.y-8,18,10,0,0,Math.PI*2);ctx.stroke();
    }ctx.restore();
  }
  function drawMud() {
    ctx.save();ctx.fillStyle='#61442c';ctx.strokeStyle='#89633e';ctx.lineWidth=14;
    // Manchas fijas: no siguen la pelota ni revelan dónde está escondida.
    for(const [x,y,rx,ry] of [[310,255,180,115],[540,240,195,135],[775,255,170,120],[430,380,190,100],[710,370,195,100]]){
      ctx.beginPath();ctx.ellipse(x,y,rx,ry,.15,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.fillStyle='#b78a5b';for(let i=0;i<16;i++){ctx.beginPath();ctx.arc(210+i*46,180+(i*73)%265,4+i%5,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  function drawCelebration() {
    const celebration=$('celebration'),c=celebration.getContext('2d');
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,celebration.width,celebration.height);
    const scale=Math.min(celebration.width/600,celebration.height/380);
    c.setTransform(scale,0,0,scale,(celebration.width-600*scale)/2,(celebration.height-380*scale)/2);
    const who=R.winner(match)==='player'?chosen:opponent;
    const gradient=c.createRadialGradient(300,200,0,300,200,190);gradient.addColorStop(0,R.heroes[who].aura+'55');gradient.addColorStop(1,R.heroes[who].aura+'00');c.fillStyle=gradient;c.fillRect(0,0,600,380);
    drawHero(c,who,300,220,1.4,'win',window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:elapsed);
    for(let i=0;i<45;i++){const x=(i*139)%600,y=((i*71+elapsed*(28+i%7))%380);c.save();c.translate(x,y);c.rotate(i+elapsed);c.fillStyle=['#d5fc59','#6bd6ff','#ffac41','#f8f8e8'][i%4];c.fillRect(-3,-5,6,10);c.restore();}
    c.fillStyle='#d5fc59';c.font='45px serif';c.textAlign='center';c.fillText('★',300,68);
  }
  function frame(timestamp) {
    if(renderedPixelRatio!==(window.devicePixelRatio||1)){
      fitPitch();fitResolution($('celebration'));
      document.querySelectorAll('[data-portrait]').forEach(c=>drawPortrait(c.dataset.portrait,c));
    }
    const delta=lastTime?Math.min((timestamp-lastTime)/1000,.05):0;lastTime=timestamp;
    if(!paused())elapsed+=delta;
    update(delta);
    if(screen==='match')drawPitch();else if(screen==='finish')drawCelebration();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('[data-hero]').forEach(button=>button.addEventListener('click',()=>{
    chosen=button.dataset.hero;
    document.querySelectorAll('[data-hero]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  }));
  document.querySelectorAll('[data-level]').forEach(button=>button.addEventListener('click',()=>{
    difficulty=button.dataset.level;
    document.querySelectorAll('[data-level]').forEach(b=>{const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  }));
  $('start').addEventListener('click',startMatch);
  $('next').addEventListener('click',nextTurn);
  $('replay').addEventListener('click',startMatch);
  $('change').addEventListener('click',()=>showScreen('selection'));
  $('sound').addEventListener('click',()=>{muted=!muted;$('sound').textContent=muted?'♫̸':'♪';$('sound').setAttribute('aria-label',muted?'Activar sonidos':'Silenciar sonidos');$('sound').setAttribute('aria-pressed',String(muted));if(!muted)initAudio();});
  function syncFullscreen() {
    const native=Boolean(document.fullscreenElement||document.webkitFullscreenElement);
    const expanded=document.body.classList.contains('expanded-view');
    const active=native||expanded;
    $('fullscreen').setAttribute('aria-pressed',String(active));
    $('fullscreen').setAttribute('aria-label',native?'Salir de pantalla completa':expanded?'Salir de vista ampliada':'Pantalla completa');
    $('fullscreen').title=native?'Salir de pantalla completa':expanded?'Salir de vista ampliada':'Pantalla completa';
    $('fullscreen').textContent=active?'⊡':'⛶';
  }
  $('fullscreen').addEventListener('click',async()=>{
    $('display-status').hidden=true;
    if(document.body.classList.contains('expanded-view')){document.body.classList.remove('expanded-view');syncFullscreen();return;}
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){
        const exit=document.exitFullscreen||document.webkitExitFullscreen;
        if(!exit)throw new Error('No disponible');
        await exit.call(document);
      }else{
        const root=document.documentElement;
        const enter=root.requestFullscreen||root.webkitRequestFullscreen;
        if(!enter)throw new Error('No disponible');
        await enter.call(root);
      }
      syncFullscreen();
    }catch{
      document.body.classList.add('expanded-view');syncFullscreen();drag=null;
      $('fullscreen-guide').showModal();
    }
  });
  document.addEventListener('fullscreenchange',syncFullscreen);
  document.addEventListener('webkitfullscreenchange',syncFullscreen);
  $('help').addEventListener('click',()=>{$('help-dialog').showModal();drag=null;});
  $('leave').addEventListener('click',()=>{$('exit-dialog').showModal();drag=null;});
  $('confirm-exit').addEventListener('click',()=>{$('exit-dialog').close();phase='ready';shot=null;$('instruction').hidden=false;showScreen('selection');$('start').focus();});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  $('portrait-play').addEventListener('click',()=>document.body.classList.add('portrait-allowed'));
  $('ice').addEventListener('click',iceToggle);
  $('keeper-power').addEventListener('click',()=>useKeeperPower());
  canvas.addEventListener('pointerdown',e=>{
    if(screen!=='match'||paused()||phase==='result'||drag)return;
    if(e.pointerType==='mouse'&&e.button!==0)return;
    if(side==='rival'&&keeperLocked()){ $('status').textContent='Esperá a que se rompan las telarañas'; return; }
    initAudio();canvas.focus({preventScroll:true});
    if(phase==='flight'&&side==='player'){iceToggle();return;}
    const start=pointOnCanvas(e);
    drag={id:e.pointerId,start,last:start,target:{...keyboardAim},keeperStart:{...keeperAim}};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId||paused())return;
    const p=pointOnCanvas(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;drag.last=p;
    if(side==='player'&&phase==='ready')drag.target=goalCoords({x:ORIGIN.x+dx,y:ORIGIN.y+dy});
    else if(side==='rival'&&!keeperLocked()&&!sliding())keeperAim={x:R.clamp(drag.keeperStart.x+dx/220,-1.08,1.08),y:R.clamp(drag.keeperStart.y+dy/155,-1.08,.95)};
  });
  canvas.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const gesture=drag;drag=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(paused())return;
    if(side==='player'&&phase==='ready'){
      const p=pointOnCanvas(e),dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;
      if(Math.hypot(dx,dy)<25){$('status').textContent='Arrastrá el dedo desde la pelota hacia el arco y soltá';return;}
      launch(goalCoords({x:ORIGIN.x+dx,y:ORIGIN.y+dy}));
    }
  });
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{
    if(screen!=='match'||paused()||phase==='result')return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;
    e.preventDefault();initAudio();
    if(side==='rival'&&keeperLocked()){ $('status').textContent='Esperá a que se rompan las telarañas'; return; }
    if(e.key===' '){if(side==='rival')useKeeperPower();else iceToggle();return;}
    if(e.key==='Enter'&&side==='player'&&phase==='ready'){launch({...keyboardAim});return;}
    const dx=e.key==='ArrowLeft'?-.3:e.key==='ArrowRight'?.3:0,dy=e.key==='ArrowUp'?-.3:e.key==='ArrowDown'?.3:0;
    if(side==='player'&&phase==='ready')keyboardAim={x:R.clamp(keyboardAim.x+dx,-1.3,1.3),y:R.clamp(keyboardAim.y+dy,-1.3,1.3)};
    else if(side==='rival'&&!sliding())keeperAim={x:R.clamp(keeperAim.x+dx,-1.08,1.08),y:R.clamp(keeperAim.y+dy,-1.08,.95)};
  });
  document.addEventListener('visibilitychange',()=>{lastTime=0;drag=null;});
  document.querySelectorAll('[data-portrait]').forEach(c=>drawPortrait(c.dataset.portrait,c));
  const portraitObserver=new ResizeObserver(entries=>entries.forEach(({target})=>drawPortrait(target.dataset.portrait,target)));
  document.querySelectorAll('[data-portrait]').forEach(c=>portraitObserver.observe(c));
  new ResizeObserver(()=>fitResolution($('celebration'))).observe($('celebration'));
  loadArtwork();
  requestAnimationFrame(frame);
})();
