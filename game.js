/* Todo el juego corre en el navegador; no necesita cuentas ni servicios externos. */
(() => {
  'use strict';
  const R = window.PenaltyRules;
  const $ = id => document.getElementById(id);
  const canvas = $('pitch');
  const ctx = canvas.getContext('2d');
  const GOAL = { x: 250, y: 165, width: 600, height: 220 };
  const ORIGIN = { x: 550, y: 548 };
  const heroIds = Object.keys(R.heroes);
  let chosen = 'goku', difficulty = 'easy', opponent = 'naruto';
  let match = R.newMatch(), screen = 'selection', phase = 'ready', side = 'player';
  let shot = null, drag = null, warmup = 0, turnClock = 0, elapsed = 0, lastTime = 0;
  let keeper = { x: 0, y: .70 }, keeperAim = { x: 0, y: .70 }, keyboardAim = { x: 0, y: 0 };
  let muted = false, audioContext = null, audioAvailable = true;
  let viewportRatio = 1;
  function fitPitch() {
    const rect=canvas.getBoundingClientRect();
    if(rect.width&&rect.height)viewportRatio=(rect.height/620)/(rect.width/1100);
    keeper.aspect=viewportRatio;
  }
  new ResizeObserver(fitPitch).observe(canvas);
  const rand = (a, b) => a + Math.random() * (b - a);
  const goalPoint = R.goalPoint;
  const goalCoords = p => ({ x: (p.x - GOAL.x) / GOAL.width * 2 - 1, y: (p.y - GOAL.y) / GOAL.height * 2 - 1 });
  const heroForSide = who => who === 'player' ? chosen : opponent;
  const pointOnCanvas = e => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * canvas.width / rect.width, y: (e.clientY - rect.top) * canvas.height / rect.height };
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
      aiOffset: { x: rand(-1, 1), y: rand(-1, 1) }, aiDecoy: Math.floor(Math.random() * 2) };
    phase = 'flight'; turnClock = 0;
    if (side === 'player') drag = null;
    $('instruction').textContent = side === 'rival' ? '¡Atajá! Deslizá para seguir la pelota' : hero === 'subzero' ? 'Congelá: al soltar cambia de dirección' : '¡Tu poder está en camino!';
    $('ice').hidden = side !== 'player' || hero !== 'subzero';
    $('ice').textContent = '❄ CONGELAR';
    sound('kick'); sound(hero);
  }
  function keeperLocked() {
    if(phase==='result')return false;
    const hero=shot?shot.hero:heroForSide(side);
    return R.powerState(hero,shot?shot.progress:0).webbed;
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
      const before = shot.ice.frozen;
      if (side === 'rival' && shot.hero === 'subzero') {
        if (!shot.ice.used && shot.progress >= shot.aiFreezeAt) { shot.ice = R.toggleIce(shot.ice, shot.progress); sound('ice'); }
        if (shot.ice.frozen) { shot.frozenElapsed += delta; if (shot.frozenElapsed >= shot.aiReleaseAfter) shot.ice = R.toggleIce(shot.ice, shot.progress); }
      }
      shot.ice = R.advanceIce(shot.ice, delta);
      if (before && !shot.ice.frozen) redirectShot('ice');
      if (!shot.ice.frozen) shot.progress = Math.min(1, shot.progress + delta / shot.duration);
      if(shot.hero==='ghost'&&previousProgress<.65&&shot.progress>=.65)redirectShot('ghost',.65);
      if (shot.redirect && !shot.ice.frozen) shot.redirectAge += delta;
      if (side === 'player') {
        const level = R.levels[difficulty];
        const vision=R.powerState(shot.hero,shot.progress);
        if (shot.progress >= level.reaction && !vision.mud && !vision.invisible) {
          const target = shot.hero === 'naruto' && shot.progress < .72 ? shot.decoys[shot.aiDecoy]
            : shot.redirect && shot.redirectAge < (difficulty === 'hard' ? .14 : .26) ? shot.beforeRedirect : shot.target;
          keeperAim = { x: R.clamp(target.x + shot.aiOffset.x * level.accuracy, -1.05, 1.05), y: R.clamp(target.y + shot.aiOffset.y * level.accuracy, -.98, .92) };
        }
      }
      if (shot.hero === 'subzero') {
        updateIceButton();
      }
      updatePowerUI(R.powerState(shot.hero,shot.progress));
    }
    if (phase !== 'result' && !keeperLocked()) {
      const speed = side === 'rival' ? 3.2 : shot?.hero==='spiderman'?Math.max(1.8,R.levels[difficulty].keeperSpeed):R.levels[difficulty].keeperSpeed;
      const dx = keeperAim.x - keeper.x, dy = keeperAim.y - keeper.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) { const step = Math.min(1, speed * delta / distance); keeper.x += dx * step; keeper.y += dy * step; }
    }
    if (phase === 'flight' && shot.progress >= 1) {
      finishShot(R.goalContact(shot.progress,shot.target,{...keeper,hero:heroForSide(side==='player'?'rival':'player')}));
    }
  }

  // Ilustraciones originales con formas vectoriales: se dibujan a cualquier tamaño.
  function path(points, fill, stroke = '#0c1525', width = 3) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function drawHero(context, id, x, y, scale, pose = 'stand', time = 0) {
    if(['pikachu','peppa','ghost','spiderman'].includes(id)){drawGuest(context,id,x,y,scale,pose,time);return;}
    const c=context,skin='#f3c49b',shadow='#c8896f',ink='#101b2a';
    const outfit=id==='goku'?'#fb8d32':id==='naruto'?'#f6a03a':'#237ebd';
    const isKeeper=pose==='keeper'||pose==='dive',back=pose==='back';
    c.save();c.translate(x,y);c.scale(scale*(c===ctx?viewportRatio:1),scale);
    if(isKeeper)c.rotate(R.keeperAngle(time));
    if(pose==='win')c.rotate(Math.sin(time*3)*.06);
    const poly=(points,fill,line=ink,width=2)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();if(line){c.strokeStyle=line;c.lineWidth=width;c.stroke();}};
    const oval=(px,py,rx,ry,fill,line=null)=>{c.beginPath();c.ellipse(px,py,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(line){c.strokeStyle=line;c.lineWidth=2;c.stroke();}};
    const line=(points,color,width)=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();};
    oval(0,112,38,5,'#07172550');
    // Piernas largas, pliegues y botas con dos niveles de sombra.
    for(const sign of [-1,1]){
      poly([[sign*4,20],[sign*25,21],[sign*31,58],[sign*25,89],[sign*10,91],[sign*7,57]],id==='subzero'?'#172b40':outfit);
      poly([[sign*18,27],[sign*25,26],[sign*31,58],[sign*25,89],[sign*18,82],[sign*20,58]],id==='subzero'?'#0c1c2c':'#c8662c',null);
      line([[sign*12,45],[sign*24,53],[sign*13,62]],id==='subzero'?'#3d5c72':'#ffbc61',1.5);
      poly([[sign*9,82],[sign*25,82],[sign*25,101],[sign*33,109],[sign*8,109]],id==='naruto'?'#193b57':'#214b85');
      poly([[sign*10,85],[sign*23,85],[sign*23,89],[sign*10,89]],'#77b3c7',null);
      line([[sign*10,104],[sign*24,104]],'#5e89a6',2);
    }
    // Brazos articulados. Los guantes usan exactamente la geometría de colisión.
    const arms=isKeeper?R.keeperShape.arms:pose==='win'?[
      {a:{x:-22,y:-29},b:{x:-48,y:-60},radius:9},{a:{x:-48,y:-60},b:{x:-65,y:-95},radius:8},
      {a:{x:22,y:-29},b:{x:48,y:-60},radius:9},{a:{x:48,y:-60},b:{x:65,y:-95},radius:8}]:[
      {a:{x:-22,y:-29},b:{x:-37,y:3},radius:9},{a:{x:-37,y:3},b:{x:-34,y:38},radius:8},
      {a:{x:22,y:-29},b:{x:37,y:3},radius:9},{a:{x:37,y:3},b:{x:34,y:38},radius:8}];
    for(const arm of arms){const points=[[arm.a.x,arm.a.y],[arm.b.x,arm.b.y]];line(points,ink,arm.radius*2+3);line(points,id==='subzero'?'#1f394d':skin,arm.radius*2);line([[arm.a.x-2,arm.a.y],[arm.b.x-2,arm.b.y]],id==='subzero'?'#45627b':'#fbd6b1',3);}
    const hands=isKeeper?R.keeperShape.hands:pose==='win'?[{x:-65,y:-95,rx:8,ry:10},{x:65,y:-95,rx:8,ry:10}]:[{x:-34,y:38,rx:8,ry:10},{x:34,y:38,rx:8,ry:10}];
    for(const hand of hands){oval(hand.x,hand.y,hand.rx,hand.ry,isKeeper?'#effaff':skin,ink);if(isKeeper){line([[hand.x-6,hand.y+5],[hand.x+6,hand.y+5]],'#1f7da2',3);for(let i=-4;i<=4;i+=4)line([[hand.x+i,hand.y-8],[hand.x+i,hand.y]],'#8baebc',1);}}
    // Cuello y ropa con contornos y sombreado de anime.
    poly([[-8,-58],[8,-58],[10,-37],[-10,-37]],skin);poly([[0,-58],[8,-58],[10,-37],[0,-39]],shadow,null);
    poly([[-10,-43],[-23,-37],[-28,-17],[-23,14],[-26,30],[26,30],[23,14],[28,-17],[23,-37],[10,-43]],outfit);
    poly([[-23,-35],[-15,-32],[-16,7],[-23,24],[-28,-17]],id==='subzero'?'#124764':'#c7682f',null);
    poly([[11,-38],[23,-35],[28,-17],[23,14],[26,30],[15,30],[18,-10]],id==='subzero'?'#164966':'#db7230',null);
    if(id==='goku'){
      if(!back){poly([[-11,-43],[0,-17],[11,-43],[6,-44],[-6,-44]],'#164d90');poly([[-23,-36],[-10,-42],[-5,-18],[-17,-24]],'#ffb65a',null);}
      poly([[-26,22],[26,22],[26,31],[-26,31]],'#1b508e');line([[-22,25],[21,25]],'#5489bc',2);
      line([[-16,4],[-3,-7]],'#b75b27',1.5);line([[16,7],[4,-4]],'#b75b27',1.5);
      oval(back?0:15,back?-5:-19,back?15:9,back?15:9,'#fff6d7',ink);c.textAlign='center';c.font=`bold ${back?20:11}px serif`;c.fillStyle=ink;c.fillText('悟',back?0:15,back?2:-15);
    }else if(id==='naruto'){
      poly([[-23,-37],[-10,-43],[-6,-9],[-26,-12]],'#213245');poly([[23,-37],[10,-43],[6,-9],[26,-12]],'#213245');
      line([[-8,-41],[-6,-14]],'#b4bac3',2);line([[8,-41],[6,-14]],'#b4bac3',2);
      if(back){c.strokeStyle='#a9452f';c.lineWidth=3;c.beginPath();c.arc(0,4,12,0,Math.PI*1.8);c.lineTo(13,14);c.stroke();}
      else{line([[0,-39],[0,25]],'#edf0dd',2);poly([[3,4],[14,4],[14,8],[3,8]],'#d4732e',null);}
      poly([[-24,24],[24,24],[26,31],[-26,31]],'#25374a');
    }else{
      poly([[-10,-42],[-23,-37],[-28,-17],[-19,20],[-13,24],[-14,-10]],'#55b4e0');
      poly([[10,-42],[23,-37],[28,-17],[19,20],[13,24],[14,-10]],'#55b4e0');
      line([[-20,-30],[-22,-14],[-16,12]],'#b0edff',2);line([[20,-30],[22,-14],[16,12]],'#b0edff',2);
      poly([[-10,-40],[10,-40],[13,26],[-13,26]],'#132a3d');poly([[-25,23],[25,23],[25,32],[-25,32]],'#123245');
      poly([[-6,23],[6,23],[6,32],[-6,32]],'#8fcee3');
    }
    // Rostro más estrecho, ojos almendrados, sombras y mechones separados.
    const head=R.keeperShape.head;
    oval(head.x,head.y,head.rx,head.ry,skin,ink);
    if(!back){poly([[9,-98],[18,-87],[17,-65],[4,-52],[7,-76]],shadow,null);oval(-19,-75,4,7,skin,ink);oval(19,-75,4,7,skin,ink);}
    if(id==='subzero'){
      poly([[-19,-67],[-24,-89],[-13,-106],[13,-106],[24,-89],[19,-67],[15,-65],[15,-87],[-15,-87],[-15,-65]],'#152b3e');
      line([[-15,-99],[-20,-85],[-18,-72]],'#3b5f76',2);
      if(back)oval(0,-76,18,25,'#19354c');
      else{poly([[-18,-76],[0,-72],[18,-76],[15,-56],[0,-50],[-15,-56]],'#278bbd');poly([[0,-72],[18,-76],[15,-56],[0,-50]],'#145374',null);for(let i=-8;i<=8;i+=4)line([[i,-66],[i,-57]],'#97dfff',1);}
    }else{
      const hair=id==='goku'?'#101d2c':'#ffe166',hairShade=id==='goku'?'#294052':'#d9a42f';
      if(back)oval(0,-76,18,25,hair);
      poly([[-19,-70],[-27,-84],[-22,-87],[-38,-106],[-17,-101],[-25,-124],[-5,-106],[1,-136],[12,-108],[30,-127],[24,-104],[39,-109],[25,-91],[24,-80],[17,-69],[12,-93],[3,-87],[-5,-96],[-12,-86]],hair);
      poly([[-24,-104],[-17,-101],[-25,-124],[-10,-108],[-9,-96]],hairShade,null);
      poly([[2,-129],[12,-108],[9,-99],[3,-108]],hairShade,null);
      poly([[27,-117],[24,-104],[39,-109],[25,-91],[20,-85],[24,-104]],hairShade,null);
      if(id==='naruto'){
        poly([[-19,-91],[19,-91],[20,-79],[-20,-79]],'#25405d');
        if(!back){poly([[-14,-90],[14,-90],[14,-80],[-14,-80]],'#c4d4db');c.strokeStyle='#486174';c.lineWidth=1.4;c.beginPath();c.arc(0,-85,3.5,0,Math.PI*1.8);c.lineTo(6,-81);c.stroke();}
        else{line([[17,-85],[33,-72],[42,-75]],'#253e5b',5);}
      }
    }
    if(!back){
      poly([[-14,-77],[-5,-74],[-6,-69],[-13,-71]],'#fff9e9',null);poly([[14,-77],[5,-74],[6,-69],[13,-71]],'#fff9e9',null);
      oval(-8,-73,2,3,id==='naruto'?'#437aac':id==='subzero'?'#a1edff':'#172537');oval(8,-73,2,3,id==='naruto'?'#437aac':id==='subzero'?'#a1edff':'#172537');
      line([[-15,-80],[-5,-76]],ink,2);line([[15,-80],[5,-76]],ink,2);
      if(id!=='subzero'){line([[0,-72],[-2,-65],[1,-65]],'#b57459',1);line([[-4,-59],[4,-60]],'#623c36',1.5);line([[-5,-57],[1,-55]],'#ffd6ac',1);}
      if(id==='naruto')for(let i=0;i<3;i++){line([[-16,-68+i*3],[-10,-67+i*3]],'#77584b',.8);line([[16,-68+i*3],[10,-67+i*3]],'#77584b',.8);}
    }
    c.restore();
  }
  function drawGuest(c,id,x,y,scale,pose,time) {
    const ink='#142031',back=pose==='back',isKeeper=pose==='keeper'||pose==='dive';
    const color={pikachu:'#ffdc48',peppa:'#f39cae',ghost:'#ccdded',spiderman:'#e64557'}[id];
    c.save();c.translate(x,y);c.scale(scale*(c===ctx?viewportRatio:1),scale);
    if(isKeeper)c.rotate(R.keeperAngle(time));if(pose==='win')c.rotate(Math.sin(time*3)*.06);
    const poly=(p,fill)=>{c.beginPath();p.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=ink;c.lineWidth=2;c.stroke();};
    const oval=(x,y,rx,ry,fill)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle=ink;c.lineWidth=1.5;c.stroke();};
    const line=(p,fill,width=2)=>{c.beginPath();p.forEach((v,i)=>i?c.lineTo(...v):c.moveTo(...v));c.strokeStyle=fill;c.lineWidth=width;c.lineCap='round';c.stroke();};
    if(id==='pikachu')poly([[21,55],[52,35],[39,15],[69,-5],[63,-29],[29,-8],[42,11],[19,33]],'#ffdf5e');
    if(id==='ghost')poly([[-23,-38],[-40,75],[-28,89],[-15,79],[0,98],[15,79],[29,89],[40,75],[23,-38]],'#a9c9e5');
    for(const sign of [-1,1]){
      poly([[sign*4,23],[sign*25,23],[sign*28,65],[sign*24,99],[sign*9,99],[sign*7,59]],id==='spiderman'?'#215b9b':color);
      poly([[sign*9,85],[sign*24,85],[sign*29,110],[sign*7,110]],id==='spiderman'?'#d33b4c':id==='peppa'?'#252d42':color);
    }
    const elbows=isKeeper?[-48,-10,48,-10]:pose==='win'?[-48,-60,48,-60]:[-37,3,37,3];
    const hands=isKeeper?R.keeperShape.hands:pose==='win'?[{x:-65,y:-95,rx:8,ry:10},{x:65,y:-95,rx:8,ry:10}]:[{x:-34,y:38,rx:8,ry:10},{x:34,y:38,rx:8,ry:10}];
    hands.forEach((h,i)=>{const sign=i===0?-1:1;const elbow=[elbows[i*2],elbows[i*2+1]];line([[sign*22,-29],elbow,[h.x,h.y]],ink,19);line([[sign*22,-29],elbow,[h.x,h.y]],color,15);oval(h.x,h.y,h.rx,h.ry,isKeeper?'#eefbff':color);if(isKeeper)line([[h.x-5,h.y+4],[h.x+5,h.y+4]],'#327f9d',3);});
    poly([[-9,-44],[-24,-35],[-27,-13],[-23,14],[-26,31],[26,31],[23,14],[27,-13],[24,-35],[9,-44]],id==='peppa'?'#e73e55':color);
    if(id==='spiderman'){
      poly([[-24,-34],[-14,-28],[-16,19],[-26,29],[-23,14],[-27,-13]],'#235c9b');poly([[24,-34],[14,-28],[16,19],[26,29],[23,14],[27,-13]],'#235c9b');
      for(let i=-16;i<=20;i+=9)line([[-14,i],[0,i+3],[14,i]],'#832c44',1);
      line([[0,-39],[0,28]],'#832c44',1);oval(0,-7,4,8,ink);for(const sign of [-1,1])for(let i=0;i<4;i++)line([[sign*3,-10+i*3],[sign*(12+i),-17+i*9]],ink,1.5);
    }
    if(id==='ghost'){poly([[-21,-39],[-12,-28],[-16,22],[-26,31]],'#4b85b2');poly([[21,-39],[12,-28],[16,22],[26,31]],'#4b85b2');oval(0,-20,5,5,'#ffe092');}
    const head=R.keeperHead(id);oval(head.x,head.y,head.rx,head.ry,color);
    if(id==='pikachu'){
      poly([[-15,-96],[-36,-139],[-22,-145],[-7,-101]],color);poly([[15,-96],[36,-139],[22,-145],[7,-101]],color);
      poly([[-36,-139],[-22,-145],[-18,-128],[-29,-125]],ink);poly([[36,-139],[22,-145],[18,-128],[29,-125]],ink);
      if(!back){oval(-17,-69,6,6,'#f05749');oval(17,-69,6,6,'#f05749');oval(-8,-80,4,5,ink);oval(8,-80,4,5,ink);oval(-7,-82,1.4,1.5,'white');oval(9,-82,1.4,1.5,'white');line([[-5,-60],[0,-57],[5,-60]],ink,1.5);}
      else{line([[-14,-6],[14,-6]],'#94642b',5);line([[-13,7],[13,7]],'#94642b',5);}
    }else if(id==='peppa'){
      oval(-6,-100,5,10,color);oval(15,-100,5,10,color);
      if(!back){oval(24,-80,11,9,'#f5b1bb');oval(20,-80,1.8,2,'#b85e78');oval(27,-80,1.8,2,'#b85e78');oval(-3,-83,4,5,'white');oval(9,-87,4,5,'white');oval(-2,-83,1.7,2,ink);oval(10,-87,1.7,2,ink);oval(-9,-70,6,6,'#df738e');line([[2,-59],[10,-58],[15,-62]],'#a74c68',2);}
    }else if(id==='ghost'){
      poly([[-18,-92],[-24,-123],[-9,-115],[0,-131],[9,-115],[24,-123],[18,-92]],'#e7bb55');line([[-16,-100],[16,-100]],'#fff1a9',3);
      if(!back){poly([[-17,-70],[-19,-52],[-12,-34],[0,-25],[12,-34],[19,-52],[17,-70],[0,-60]],'#eef7ff');oval(-7,-78,3,4,'#468bbb');oval(7,-78,3,4,'#468bbb');line([[-13,-62],[0,-67],[13,-62]],'#6b88a0',2);}
    }else if(!back){
      for(let i=-96;i<=-57;i+=9)line([[-15,i],[0,i+4],[15,i]],'#892a3d',1);line([[0,-99],[0,-52]],'#892a3d',1);
      poly([[-15,-84],[-4,-77],[-8,-70],[-15,-73]],'#f5ffff');poly([[15,-84],[4,-77],[8,-70],[15,-73]],'#f5ffff');
    }
    c.restore();
  }
  function drawPortrait(id, element) {
    const c = element.getContext('2d'), w = element.width, h = element.height, hero = R.heroes[id];
    c.clearRect(0,0,w,h);
    const aura = c.createRadialGradient(w/2,h*.62,10,w/2,h*.62,190);aura.addColorStop(0,hero.aura+'88');aura.addColorStop(1,hero.aura+'00');c.fillStyle=aura;c.fillRect(0,0,w,h);
    c.strokeStyle=hero.aura+'30';c.lineWidth=2;
    for(let i=0;i<15;i++){const a=i/15*Math.PI*2;c.beginPath();c.moveTo(w/2+Math.cos(a)*110,h*.6+Math.sin(a)*110);c.lineTo(w/2+Math.cos(a)*270,h*.6+Math.sin(a)*270);c.stroke();}
    c.save();c.translate(w/2,h*.8);c.rotate(-.05);drawHero(c,id,0,0,1.68);c.restore();
    c.font='bold 120px Impact';c.fillStyle=hero.aura+'0c';c.fillText({goku:'力',naruto:'忍',subzero:'氷',pikachu:'ϟ',peppa:'●',ghost:'♛',spiderman:'蛛'}[id],8,190);
  }
  function drawStadium() {
    const sky=ctx.createLinearGradient(0,0,0,620);sky.addColorStop(0,'#15283f');sky.addColorStop(.38,'#214557');sky.addColorStop(1,'#104c41');ctx.fillStyle=sky;ctx.fillRect(0,0,1100,620);
    // Torres de luces y rayos del estadio.
    for(const x of [80,1020]){ctx.fillStyle='#6b9daf';ctx.fillRect(x-3,42,6,160);ctx.fillStyle='#d3f4ec';ctx.fillRect(x-35,39,70,12);const beam=ctx.createLinearGradient(x,50,550,430);beam.addColorStop(0,'#d7fcf21b');beam.addColorStop(1,'#d7fcf200');path([[x-35,50],[x+35,50],[850,460],[250,460]],beam,null);}
    // Tribunas, banderas y espectadores.
    for(let row=0;row<4;row++){ctx.fillStyle=row%2?'#1a344a':'#182e45';ctx.fillRect(0,85+row*22,1100,22);for(let i=0;i<62;i++){const x=i*18+((row%2)*9),y=95+row*22;ctx.fillStyle=['#4a6f76','#79a58a','#dbc687','#456577','#88b7b1'][(i*7+row*3)%5];ctx.beginPath();ctx.arc(x,y,2.7,0,Math.PI*2);ctx.fill();ctx.fillRect(x-3,y+3,6,5);}}
    ctx.fillStyle='#122c39';ctx.fillRect(0,174,1100,39);ctx.fillStyle='#aac4bb';ctx.font='bold 13px Trebuchet MS';ctx.textAlign='center';for(const x of [110,550,990])ctx.fillText('RAFA  ★  UNIVERSO CUP',x,199);
    // Franjas de césped en perspectiva.
    for(let i=0;i<9;i++){const y=213+(i/9)**1.3*407, next=213+((i+1)/9)**1.3*407;ctx.fillStyle=i%2?'#206853':'#1a5e4d';ctx.fillRect(0,y,1100,next-y+1);}
    ctx.strokeStyle='#b5dec677';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(80,620);ctx.lineTo(248,380);ctx.lineTo(852,380);ctx.lineTo(1020,620);ctx.stroke();
    ctx.beginPath();ctx.moveTo(307,620);ctx.lineTo(359,446);ctx.lineTo(741,446);ctx.lineTo(793,620);ctx.stroke();ctx.beginPath();ctx.ellipse(550,548,95,24,0,Math.PI,Math.PI*2);ctx.stroke();
    // Arco y red. La zona blanca delantera coincide con el área de gol real.
    path([[250,165],[850,165],[875,140],[225,140]],'#cde8eb18','#b5d8dd55',2);
    path([[250,165],[250,385],[225,345],[225,140]],'#cde8eb12','#b5d8dd55',2);
    path([[850,165],[850,385],[875,345],[875,140]],'#cde8eb12','#b5d8dd55',2);
    ctx.fillStyle='#0e253947';ctx.fillRect(250,165,600,220);ctx.strokeStyle='#b3dade40';ctx.lineWidth=1;
    for(let x=250;x<=850;x+=25){ctx.beginPath();ctx.moveTo(x,165);ctx.lineTo(x,385);ctx.stroke();}for(let y=165;y<=385;y+=22){ctx.beginPath();ctx.moveTo(250,y);ctx.lineTo(850,y);ctx.stroke();}
    ctx.strokeStyle='#e8f6ed';ctx.lineWidth=8;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(250,385);ctx.lineTo(250,165);ctx.lineTo(850,165);ctx.lineTo(850,385);ctx.stroke();ctx.strokeStyle='#759fa4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(255,383);ctx.lineTo(255,170);ctx.lineTo(845,170);ctx.stroke();
  }
  const ballPosition = (progress,target,redirect=null) => R.flightPoint(progress,target,redirect,shot?.hero);
  function drawBall(x,y,r,hero,progress=0,ghost=false) {
    ctx.save();ctx.transform(viewportRatio,0,0,1,x*(1-viewportRatio),0);if(ghost)ctx.globalAlpha=.83;
    if(hero){const h=R.heroes[hero];ctx.shadowColor=h.aura;ctx.shadowBlur=shot?.ice.frozen?35:hero==='goku'?25:16;ctx.fillStyle=h.aura+'45';ctx.beginPath();ctx.arc(x,y,r+6+Math.sin(elapsed*14)*2,0,Math.PI*2);ctx.fill();
      if(hero==='goku'){
        const direction=shot?goalPoint(shot.target):{x,y:y-50};const angle=Math.atan2(direction.y-ORIGIN.y,(direction.x-ORIGIN.x)/viewportRatio);
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);
        const trail=ctx.createLinearGradient(-230,0,0,0);trail.addColorStop(0,'#68e5ff00');trail.addColorStop(.65,'#37cfff88');trail.addColorStop(1,'#d9ffffee');
        path([[-230,-2],[-30,-22],[8,0],[-30,22],[-230,2]],trail,null);
        path([[-170,-2],[-18,-9],[7,0],[-18,9],[-170,2]],'#ecffffbb',null);
        ctx.strokeStyle='#9ff9ff';ctx.lineWidth=2;
        for(let i=0;i<3;i++){const offset=-45-i*44;ctx.beginPath();ctx.moveTo(offset,-24);ctx.lineTo(offset+12,-9);ctx.lineTo(offset-4,3);ctx.lineTo(offset+14,24);ctx.stroke();}
        ctx.restore();
      }
      if(hero==='pikachu'&&shot){
        ctx.strokeStyle='#fff5a0';ctx.lineWidth=6;ctx.beginPath();
        for(let i=0;i<=12;i++){const p=Math.max(0,progress-i*.012);const pos=R.flightPoint(p,shot.target,null,'pikachu');const px=x+(pos.x-x)/viewportRatio;i?ctx.lineTo(px,pos.y):ctx.moveTo(px,pos.y);}ctx.stroke();
        ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke();
      }}
    ctx.fillStyle=hero==='subzero'?'#c8f5ff':'#f8fff0';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.save();ctx.translate(x,y);ctx.rotate(progress*8);path([[0,-r*.48],[r*.46,-r*.15],[r*.28,r*.40],[-r*.28,r*.40],[-r*.46,-r*.15]],hero==='subzero'?'#54aac7':'#263943',null);ctx.strokeStyle=hero==='subzero'?'#7ec9e0':'#69817d';ctx.lineWidth=1;for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.45,Math.sin(a)*r*.45);ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);ctx.stroke();}ctx.restore();ctx.restore();
  }
  function drawPitch() {
    ctx.clearRect(0,0,1100,620);drawStadium();
    const keeperHero=heroForSide(side==='player'?'rival':'player');
    const kp=goalPoint(keeper);
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
      if(shot.ice.frozen){ctx.strokeStyle='#c2f7ff';ctx.lineWidth=2;ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(elapsed*.1);for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-35);ctx.moveTo(0,-22);ctx.lineTo(-9,-29);ctx.moveTo(0,-22);ctx.lineTo(9,-29);ctx.stroke();}ctx.restore();ctx.fillStyle='#e2fbff';ctx.textAlign='center';ctx.font='bold 18px Trebuchet MS';ctx.fillText(shot.ice.remaining.toFixed(1)+' s',pos.x,pos.y-48);}
    }
    if(phase==='flight'&&side==='rival'&&R.powerState(shot.hero,shot.progress).mud)drawMud();
    if(side==='rival'&&phase!=='result'){const aim=goalPoint(keeperAim);ctx.strokeStyle='#d5fc5960';ctx.lineWidth=2;ctx.beginPath();ctx.arc(aim.x,aim.y,18,0,Math.PI*2);ctx.stroke();}
  }
  function drawWebs(k) {
    ctx.save();ctx.strokeStyle='#edf8ffcc';ctx.lineWidth=2;
    for(const sign of [-1,1]){
      const foot=R.keeperPoint(k,{x:sign*20,y:99});
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
    const c=$('celebration').getContext('2d');c.clearRect(0,0,600,380);
    const who=R.winner(match)==='player'?chosen:opponent;
    const gradient=c.createRadialGradient(300,200,0,300,200,190);gradient.addColorStop(0,R.heroes[who].aura+'55');gradient.addColorStop(1,R.heroes[who].aura+'00');c.fillStyle=gradient;c.fillRect(0,0,600,380);
    drawHero(c,who,300,220,1.4,'win',window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:elapsed);
    for(let i=0;i<45;i++){const x=(i*139)%600,y=((i*71+elapsed*(28+i%7))%380);c.save();c.translate(x,y);c.rotate(i+elapsed);c.fillStyle=['#d5fc59','#6bd6ff','#ffac41','#f8f8e8'][i%4];c.fillRect(-3,-5,6,10);c.restore();}
    c.fillStyle='#d5fc59';c.font='45px serif';c.textAlign='center';c.fillText('★',300,68);
  }
  function frame(timestamp) {
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
    else if(side==='rival'&&!keeperLocked())keeperAim={x:R.clamp(drag.keeperStart.x+dx/220,-1.08,1.08),y:R.clamp(drag.keeperStart.y+dy/155,-1.08,.95)};
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
    if(e.key===' '){iceToggle();return;}
    if(e.key==='Enter'&&side==='player'&&phase==='ready'){launch({...keyboardAim});return;}
    const dx=e.key==='ArrowLeft'?-.3:e.key==='ArrowRight'?.3:0,dy=e.key==='ArrowUp'?-.3:e.key==='ArrowDown'?.3:0;
    if(side==='player'&&phase==='ready')keyboardAim={x:R.clamp(keyboardAim.x+dx,-1.3,1.3),y:R.clamp(keyboardAim.y+dy,-1.3,1.3)};
    else if(side==='rival')keeperAim={x:R.clamp(keeperAim.x+dx,-1.08,1.08),y:R.clamp(keeperAim.y+dy,-1.08,.95)};
  });
  document.addEventListener('visibilitychange',()=>{lastTime=0;drag=null;});
  document.querySelectorAll('[data-portrait]').forEach(c=>drawPortrait(c.dataset.portrait,c));
  requestAnimationFrame(frame);
})();
