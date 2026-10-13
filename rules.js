/* Reglas puras: las coordenadas del arco van de -1 a 1 en ambos ejes. */
(function (root) {
  'use strict';
  const heroes = Object.freeze({
    goku: Object.freeze({ name: 'Gokú', power: 'KAMEHAMEHA', color: '#ffac41', aura: '#68e5ff', speed: 2.5 }),
    naruto: Object.freeze({ name: 'Naruto', power: 'CLONES DE SOMBRA', color: '#ffbe43', aura: '#ffd365', speed: 1 }),
    subzero: Object.freeze({ name: 'Sub-Zero', power: 'TIEMPO CONGELADO', color: '#69d9ff', aura: '#a7f1ff', speed: 1 }),
    pikachu: Object.freeze({ name: 'Pikachu', power: 'RAYO ELÉCTRICO', color: '#ffe156', aura: '#fff19a', speed: 1.12 }),
    peppa: Object.freeze({ name: 'Peppa Pig', power: 'LLUVIA DE BARRO', color: '#ff9db5', aura: '#d6ac75', speed: 1 }),
    ghost: Object.freeze({ name: 'Fantasma Real', power: 'TIRO INVISIBLE', color: '#bacfff', aura: '#b8dcff', speed: 1 }),
    spiderman: Object.freeze({ name: 'Spider-Man', power: 'TELARAÑA TRAMPA', color: '#fa6570', aura: '#f1f5ff', speed: 1 })
  });
  const levels = Object.freeze({
    easy: Object.freeze({ name: 'Fácil', flight: 2.15, reaction: .50, accuracy: .58, keeperSpeed: 1.25, rivalMiss: .20 }),
    medium: Object.freeze({ name: 'Medio', flight: 1.75, reaction: .32, accuracy: .31, keeperSpeed: 1.65, rivalMiss: .13 }),
    hard: Object.freeze({ name: 'Difícil', flight: 1.4, reaction: .18, accuracy: .14, keeperSpeed: 2.1, rivalMiss: .08 })
  });
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function newMatch() { return { player: [], rival: [] }; }
  function record(match, side, goal) {
    if (side !== 'player' && side !== 'rival') throw new Error('Equipo desconocido');
    if (winner(match)) throw new Error('El partido ya terminó');
    const expected = match.player.length === match.rival.length ? 'player' : 'rival';
    if (side !== expected) throw new Error('Turno fuera de orden');
    return { ...match, [side]: [...match[side], Boolean(goal)] };
  }
  function score(shots) { return shots.filter(Boolean).length; }
  function winner(match) {
    if (match.player.length < 5 || match.player.length !== match.rival.length) return null;
    const difference = score(match.player) - score(match.rival);
    return difference === 0 ? null : difference > 0 ? 'player' : 'rival';
  }
  function inGoal(target) { return Math.abs(target.x) <= 1 && Math.abs(target.y) <= 1; }
  // El dibujo y las colisiones usan la misma figura, escala y rotación.
  const keeperShape = Object.freeze({
    scale: .76, offsetY: -15,
    head: Object.freeze({x:0,y:-76,rx:18,ry:25}),
    hands: Object.freeze([Object.freeze({x:-78,y:-28,rx:11,ry:13}),Object.freeze({x:78,y:-28,rx:11,ry:13})]),
    torso: Object.freeze({x:0,y:-7,rx:26,ry:38}),
    arms: Object.freeze([
      Object.freeze({a:{x:-22,y:-29},b:{x:-48,y:-10},radius:9}),
      Object.freeze({a:{x:-48,y:-10},b:{x:-78,y:-28},radius:8}),
      Object.freeze({a:{x:22,y:-29},b:{x:48,y:-10},radius:9}),
      Object.freeze({a:{x:48,y:-10},b:{x:78,y:-28},radius:8})
    ])
  });
  function goalPoint(p) { return {x:550+p.x*300,y:275+p.y*110}; }
  function keeperHead(hero) {
    if(hero==='peppa')return {x:6,y:-76,rx:25,ry:25};
    if(hero==='pikachu')return {x:0,y:-76,rx:22,ry:25};
    return keeperShape.head;
  }
  function keeperAngle(x) { return Math.abs(x) > .15 ? Math.sin(x)*.8 : 0; }
  function keeperPoint(keeper, local) {
    const center=goalPoint(keeper), angle=keeperAngle(keeper.x), s=keeperShape.scale;
    return {x:center.x+(local.x*Math.cos(angle)-local.y*Math.sin(angle))*s*(keeper.aspect||1),
      y:center.y+keeperShape.offsetY+(local.x*Math.sin(angle)+local.y*Math.cos(angle))*s};
  }
  function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }
  function touchesKeeper(ball,keeper,ballRadius=10) {
    const center=goalPoint(keeper),angle=keeperAngle(keeper.x),s=keeperShape.scale;
    const dx=(ball.x-center.x)/(keeper.aspect||1),dy=ball.y-center.y-keeperShape.offsetY;
    const p={x:(dx*Math.cos(angle)+dy*Math.sin(angle))/s,y:(-dx*Math.sin(angle)+dy*Math.cos(angle))/s};
    const r=ballRadius/s;
    const ellipses=[keeperHead(keeper.hero),...keeperShape.hands,keeperShape.torso];
    if(ellipses.some(e=>((p.x-e.x)/(e.rx+r))**2+((p.y-e.y)/(e.ry+r))**2<=1))return true;
    if(keeperShape.arms.some(arm=>segmentDistance(p,arm.a,arm.b)<=arm.radius+r))return true;
    return [-1,1].some(sign=>segmentDistance(p,{x:sign*12,y:25},{x:sign*20,y:99})<=12+r);
  }
  function saved(target,keeper) { return inGoal(target)&&touchesKeeper(goalPoint(target),keeper); }
  function goalContact(progress,target,keeper) {
    // La proyección 2D se puede superponer antes; solo hay choque en el plano del arco.
    return progress>=1&&saved(target,keeper)?goalPoint(target):null;
  }
  function flightPoint(progress,target,redirect=null,hero=null) {
    const end=goalPoint(target);
    const t=redirect?clamp((progress-redirect.at)/(1-redirect.at),0,1):progress;
    const start=redirect?redirect.from:{x:550,y:548};
    const zigzag=hero==='pikachu'?Math.asin(Math.sin(progress*Math.PI*6))*2/Math.PI*Math.sin(progress*Math.PI)*70:0;
    return {x:start.x+(end.x-start.x)*t+zigzag,y:start.y+(end.y-start.y)*t-Math.sin(t*Math.PI)*(redirect?22:45)};
  }
  function powerState(hero,progress) {
    return {mud:hero==='peppa'&&progress>=.28&&progress<.68,
      invisible:hero==='ghost'&&progress>=.20&&progress<.65,
      webbed:hero==='spiderman'&&progress<.55};
  }
  function surpriseTarget(target,random=Math.random) {
    // Apuntar afuera sigue siendo un tiro afuera; el poder no corrige ese error.
    if(!inGoal(target))return {...target};
    const choices=[{x:-.85,y:-.75},{x:.85,y:-.75},{x:-.85,y:.75},{x:.85,y:.75},
      {x:-.8,y:0},{x:.8,y:0},{x:0,y:-.85},{x:0,y:.85}]
      .filter(p=>Math.hypot(p.x-target.x,p.y-target.y)>=.8);
    return {...choices[clamp(Math.floor(random()*choices.length),0,choices.length-1)]};
  }
  function advanceIce(ice, delta) {
    if (!ice.frozen) return ice;
    const remaining = Math.max(0, ice.remaining - delta);
    return { ...ice, remaining, frozen: remaining > 0 };
  }
  function toggleIce(ice, progress) {
    if (ice.frozen) return { ...ice, frozen: false, remaining: 0 };
    if (ice.used || progress <= 0 || progress >= .94) return ice;
    return { used: true, frozen: true, remaining: 3 };
  }
  const rules = Object.freeze({ heroes, levels, clamp, newMatch, record, score, winner, inGoal, saved, advanceIce, toggleIce,
    keeperShape, keeperHead, goalPoint, keeperAngle, keeperPoint, touchesKeeper, goalContact, flightPoint, surpriseTarget, powerState });
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
  else root.PenaltyRules = rules;
})(typeof window !== 'undefined' ? window : globalThis);
