const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');

function playPairs(pairs) {
  let match = R.newMatch();
  for (const [player, rival] of pairs) {
    match = R.record(match, 'player', player);
    match = R.record(match, 'rival', rival);
  }
  return match;
}

test('ambos jugadores tienen cinco tiros aunque la diferencia sea grande', () => {
  const m = playPairs([[true,false],[true,false],[true,false],[true,false]]);
  assert.equal(R.winner(m), null);
  const pending = R.record(m, 'player', true);
  assert.equal(R.winner(pending), null);
  assert.equal(R.winner(R.record(pending, 'rival', false)), 'player');
});
test('desempate: siempre se completa el par y se repite si empatan', () => {
  let m = playPairs(Array.from({length:5}, () => [true,true]));
  assert.equal(R.winner(m), null);
  m = R.record(m, 'player', true);
  assert.equal(R.winner(m), null);
  m = R.record(m, 'rival', true);
  assert.equal(R.winner(m), null);
  m = R.record(m, 'player', false);
  assert.equal(R.winner(m), null);
  m = R.record(m, 'rival', true);
  assert.equal(R.winner(m), 'rival');
});
test('un turno no se puede contabilizar dos veces ni después del final', () => {
  const m = R.record(R.newMatch(), 'player', true);
  assert.throws(() => R.record(m, 'player', true));
  const ended = playPairs(Array.from({length:5}, () => [true,false]));
  assert.throws(() => R.record(ended, 'rival', true));
});
test('afuera nunca es gol ni atajada; una atajada exige alcanzar la pelota', () => {
  assert.equal(R.inGoal({x:1.01,y:0}),false);
  assert.equal(R.inGoal({x:0,y:-1.01}),false);
  assert.equal(R.inGoal({x:-1,y:1}),true);
  assert.equal(R.saved({x:.8,y:-.7},{x:.8,y:-.7}),true);
  assert.equal(R.saved({x:.8,y:-.7},{x:0,y:.7}),false);
  assert.equal(R.saved({x:1.01,y:0},{x:1.01,y:0}),false);
});
test('Sub-Zero: una congelación, suelta manualmente y no vuelve a congelar', () => {
  const fresh = {used:false,frozen:false,remaining:0};
  const ice = R.toggleIce(fresh,.4);
  assert.equal(ice.frozen,true);
  assert.equal(ice.remaining,3);
  const released = R.toggleIce(ice,.4);
  assert.equal(released.frozen,false);
  assert.deepEqual(R.toggleIce(released,.5),released);
});
test('Sub-Zero: se descongela automáticamente a los tres segundos', () => {
  const ice = R.toggleIce({used:false,frozen:false,remaining:0},.4);
  const waiting = R.advanceIce(ice,2.9);
  assert.equal(waiting.frozen,true);
  const released = R.advanceIce(waiting,.2);
  assert.equal(released.frozen,false);
  assert.equal(released.remaining,0);
  assert.equal(released.used,true);
});
test('no se congela una pelota que no salió ni una que ya llegó al arco', () => {
  const fresh = {used:false,frozen:false,remaining:0};
  assert.deepEqual(R.toggleIce(fresh,0),fresh);
  assert.deepEqual(R.toggleIce(fresh,1),fresh);
});
test('dificultades y Gokú cambian velocidad y reflejos en el orden acordado', () => {
  assert.ok(R.levels.easy.flight > R.levels.medium.flight);
  assert.ok(R.levels.medium.flight > R.levels.hard.flight);
  assert.ok(R.levels.easy.reaction > R.levels.hard.reaction);
  assert.ok(R.levels.easy.accuracy > R.levels.hard.accuracy);
  assert.ok(R.levels.easy.keeperSpeed < R.levels.hard.keeperSpeed);
  assert.ok(R.heroes.goku.speed > R.heroes.naruto.speed);
  assert.ok(R.heroes.goku.speed > R.heroes.subzero.speed);
});

test('contacto con la cabeza y ambos guantes cuenta, incluso al inclinarse',()=>{
  for(const x of [0,-.7,.7]){
    const keeper={x,y:.4};
    for(const part of [R.keeperShape.head,...R.keeperShape.hands]){
      const point=R.keeperPoint(keeper,part);
      assert.equal(R.touchesKeeper(point,keeper),true);
      const target={x:(point.x-550)/300,y:(point.y-275)/110};
      assert.equal(R.saved(target,keeper),true);
    }
  }
});
test('una pelota que pasa por espacio vacío no se ataja por proximidad al centro',()=>{
  assert.equal(R.saved({x:.27,y:.7},{x:0,y:.7}),false);
  assert.equal(R.touchesKeeper({x:940,y:120},{x:0,y:.7}),false);
});
test('superponerse con los pies al 40% del vuelo no cuenta como atajada',()=>{
  const keeper={x:0,y:.7},target={x:0,y:0};
  const projected=R.flightPoint(.4,target);
  assert.equal(R.touchesKeeper(projected,keeper,15),true);
  assert.equal(R.goalContact(.4,target,keeper),null);
  assert.equal(R.goalContact(.99,target,keeper),null);
});
test('al llegar al arco se detectan la cabeza y ambos guantes, aun con un tiro rápido',()=>{
  for(const x of [0,-.7,.7]){
    const keeper={x,y:.4};
    for(const part of [R.keeperShape.head,...R.keeperShape.hands]){
      const point=R.keeperPoint(keeper,part),target={x:(point.x-550)/300,y:(point.y-275)/110};
      assert.equal(R.goalContact(.9,target,keeper),null);
      assert.deepEqual(R.goalContact(1,target,keeper),R.goalPoint(target));
      assert.deepEqual(R.goalContact(1.08,target,keeper),R.goalPoint(target));
    }
  }
  assert.equal(R.goalContact(1,{x:1.2,y:0},{x:0,y:.7}),null);
  assert.equal(R.goalContact(1,{x:.9,y:-.9},{x:-.8,y:.7}),null);
});
test('Sub-Zero elige otro destino dentro del arco, con cambio apreciable',()=>{
  for(const target of [{x:0,y:0},{x:-.85,y:-.75},{x:.85,y:.75}]){
    for(const random of [0,.25,.5,.75,.999]){
      const result=R.surpriseTarget(target,()=>random);
      assert.equal(R.inGoal(result),true);
      assert.ok(Math.hypot(result.x-target.x,result.y-target.y)>=.8);
    }
  }
  assert.deepEqual(R.surpriseTarget({x:1.2,y:0},()=>.5),{x:1.2,y:0});
});
test('el cambio de trayectoria no teletransporta la pelota y llega al nuevo destino',()=>{
  const original={x:.6,y:-.5},at=.53;
  const frozen=R.flightPoint(at,original);
  const redirect={at,from:frozen},target=R.surpriseTarget(original,()=>.3);
  assert.deepEqual(R.flightPoint(at,target,redirect),frozen);
  const end=R.flightPoint(1,target,redirect),expected=R.goalPoint(target);
  assert.ok(Math.hypot(end.x-expected.x,end.y-expected.y)<1e-8);
  const next=R.flightPoint(at+.0001,target,redirect);
  assert.ok(Math.hypot(next.x-frozen.x,next.y-frozen.y)<1);
});

test('Gokú gana un 14% adicional de velocidad respecto de la versión anterior',()=>{
  assert.ok(R.heroes.goku.speed/2.2>1.13);
  assert.ok(2.15/R.heroes.goku.speed<1);
});

test('hay siete personajes con poderes y velocidad válidos',()=>{
  assert.equal(Object.keys(R.heroes).length,7);
  for(const h of Object.values(R.heroes)){assert.ok(h.name&&h.power);assert.ok(h.speed>0);}
});
test('Pikachu zigzaguea y llega exactamente al destino apuntado',()=>{
  const target={x:.5,y:-.5};
  const offsets=[.08,.25,.42].map(p=>R.flightPoint(p,target,null,'pikachu').x-R.flightPoint(p,target).x);
  assert.ok(offsets.some(v=>v>10));assert.ok(offsets.some(v=>v< -10));
  const end=R.flightPoint(1,target,null,'pikachu');
  assert.ok(Math.hypot(end.x-R.goalPoint(target).x,end.y-R.goalPoint(target).y)<1e-8);
});
test('el barro tapa temporalmente la visión y deja el 32% final visible',()=>{
  assert.equal(R.powerState('peppa',.2).mud,false);
  assert.equal(R.powerState('peppa',.5).mud,true);
  assert.equal(R.powerState('peppa',.68).mud,false);
  assert.equal(R.powerState('peppa',1).mud,false);
});
test('Fantasma Real oculta la pelota y la revela antes del arco',()=>{
  assert.equal(R.powerState('ghost',.1).invisible,false);
  assert.equal(R.powerState('ghost',.4).invisible,true);
  assert.equal(R.powerState('ghost',.65).invisible,false);
  for(const level of Object.values(R.levels))assert.ok(level.flight*.35>.45);
});
test('Spider-Man libera al arquero con tiempo para llegar a una esquina',()=>{
  assert.equal(R.powerState('spiderman',0).webbed,true);
  assert.equal(R.powerState('spiderman',.54).webbed,true);
  assert.equal(R.powerState('spiderman',.55).webbed,false);
  const maxTravel=Math.hypot(.9,1.55)/3.2;
  for(const level of Object.values(R.levels))assert.ok(level.flight*.45>maxTravel);
});
test('los poderes temporales se apagan al terminar el tiro',()=>{
  for(const id of Object.keys(R.heroes))assert.deepEqual(R.powerState(id,1),{mud:false,invisible:false,webbed:false});
});
test('cabezas de Peppa y Pikachu cuentan como contacto con sus proporciones',()=>{
  for(const hero of ['peppa','pikachu']){
    const keeper={x:.3,y:.4,hero},head=R.keeperHead(hero),point=R.keeperPoint(keeper,head);
    assert.equal(R.touchesKeeper(point,keeper),true);
  }
});

test('el contacto conserva manos y cabeza al adaptar la cancha al ancho',()=>{
  for(const aspect of [.5,.8,1.4]){
    const keeper={x:.3,y:.4,aspect};
    for(const part of [R.keeperShape.head,...R.keeperShape.hands]){
      const point=R.keeperPoint(keeper,part),target={x:(point.x-550)/300,y:(point.y-275)/110};
      assert.ok(R.goalContact(1,target,keeper));
    }
  }
});
test('la cancha ancha no deja una zona invisible de atajada al costado del guante',()=>{
  const keeper={x:0,y:.4,aspect:.5};
  const oldHand=R.keeperPoint({...keeper,aspect:1},R.keeperShape.hands[1]);
  assert.equal(R.touchesKeeper(oldHand,keeper),false);
});
test('el fantasma reaparece en la posición esperada y continúa hacia otro destino',()=>{
  const target={x:.6,y:-.5},at=.65,from=R.flightPoint(at,target);
  const newTarget=R.surpriseTarget(target,()=>.5),redirect={at,from};
  assert.deepEqual(R.flightPoint(at,newTarget,redirect),from);
  assert.notDeepEqual(newTarget,target);
  assert.deepEqual(R.flightPoint(1,newTarget,redirect),R.goalPoint(newTarget));
});
