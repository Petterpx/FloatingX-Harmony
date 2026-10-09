import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deferred, FakePlatform } from './support/FxFakes.mjs';
const require = createRequire(import.meta.url);
const { FxConfig } = require('../work/core/core/FxConfig.js');
const { FxController } = require('../work/core/core/FxController.js');
const { FxError } = require('../work/core/core/FxError.js');

test('late create is destroyed and never shown after cancel', async () => {
  const gate = deferred();
  const platform = new FakePlatform(gate.promise);
  const controller = new FxController(platform, new FxConfig());
  const showing = controller.show();
  const observed = showing.catch(error => error);
  await platform.createStarted.promise;
  const generation = controller.getGeneration();
  const cancelled = controller.cancel();
  assert.equal(controller.getState(), 'destroying');
  assert.equal(controller.getGeneration(), generation + 1);
  gate.resolve();
  const [error] = await Promise.all([observed, cancelled]);
  assert.equal(error.code, 'DESTROYED');
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(platform.calls.includes('show'), false);
  assert.equal(platform.calls.filter(v => v === 'destroy').length, 1);
});

test('cancel before queued create avoids platform access and is terminal', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  const showing = controller.show();
  const observed = showing.catch(error => error);
  const cancelling = controller.cancel();
  const repeat = controller.cancel();
  await Promise.all([cancelling, repeat]);
  assert.equal((await observed).code, 'DESTROYED');
  assert.deepEqual(platform.calls, []);
  await assert.rejects(controller.show(), { code: 'DESTROYED' });
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(controller.getGeneration(), 1);
});

test('show hide show preserve serialized native order and committed visibility', async () => {
  const platform = new FakePlatform();
  const events = [];
  const controller = new FxController(platform, new FxConfig(), event => events.push(event));
  await Promise.all([controller.show(), controller.hide(), controller.show()]);
  assert.deepEqual(platform.calls.filter(v => ['create', 'show', 'hide'].includes(v)), ['create', 'show', 'hide', 'show']);
  assert.equal(controller.isShow(), true);
  assert.equal(controller.getState(), 'visible');
  assert.deepEqual(events.map(v => v.type), ['show', 'hide', 'show']);
});

test('create and show failure recover to idle and hidden without poisoning queue', async () => {
  const platform = new FakePlatform();
  const events = [];
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), event => events.push(event), { error: error => logged.push(error) });
  platform.errors.set('create', new FxError('NO_HOST', 'no host'));
  await assert.rejects(controller.show(), { code: 'NO_HOST' });
  assert.equal(controller.getState(), 'idle');
  platform.errors.delete('create');
  platform.errors.set('show', new FxError('PERMISSION_DENIED', 'denied', 201));
  await assert.rejects(controller.show(), { code: 'PERMISSION_DENIED', platformCode: 201 });
  assert.equal(controller.getState(), 'hidden');
  assert.equal(controller.isShow(), false);
  platform.errors.delete('show');
  await controller.show();
  assert.equal(controller.isShow(), true);
  assert.equal(platform.calls.filter(v => v === 'create').length, 2);
  assert.deepEqual(events.filter(v => v.error).map(v => v.error.code), ['NO_HOST', 'PERMISSION_DENIED']);
  assert.deepEqual(logged.map(error => error.code), ['NO_HOST', 'PERMISSION_DENIED']);
});

test('failed hide retains actual visibility and can be retried', async () => {
  const platform = new FakePlatform();
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), undefined, { error: error => logged.push(error) });
  await controller.show();
  platform.errors.set('hide', new Error('hide failed'));
  await assert.rejects(controller.hide(), { code: 'WINDOW_OPERATION_FAILED' });
  assert.equal(controller.isShow(), true);
  assert.equal(controller.getState(), 'visible');
  platform.errors.delete('hide');
  await controller.hide();
  assert.equal(controller.getState(), 'hidden');
  assert.deepEqual(logged.map(error => error.code), ['WINDOW_OPERATION_FAILED']);
});

test('host visibility retains show intent and never overrides explicit hide', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await controller.setHostVisible(false);
  await controller.show();
  assert.equal(controller.isShow(), false);
  await controller.setHostVisible(true);
  assert.equal(controller.isShow(), true);
  await controller.setHostVisible(false);
  await controller.hide();
  await controller.setHostVisible(true);
  assert.equal(controller.isShow(), false);
  assert.equal(platform.calls.filter(v => v === 'show').length, 1);
});

test('hidden moves use native readback and vectors use committed position', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await controller.show();
  await controller.hide();
  platform.moveResult = { x: 8, y: 9 };
  await controller.move(100, 200, true);
  assert.equal(controller.getX(), 8);
  assert.equal(controller.getY(), 9);
  assert.equal(controller.isShow(), false);
  platform.moveResult = undefined;
  await controller.moveByVector(2, -3);
  assert.deepEqual(platform.moves, [{ point: { x: 100, y: 200 }, animate: true }, { point: { x: 10, y: 6 }, animate: false }]);
  assert.equal(controller.getX(), 10);
});

test('queued moves coalesce but visibility barriers retain order', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await controller.show();
  const gate = deferred();
  platform.gates.set('move', gate.promise);
  const first = controller.move(1, 2);
  await platform.moveStarted.promise;
  const second = controller.move(10, 20);
  const third = controller.moveByVector(3, 4, true);
  const hiding = controller.hide();
  const fourth = controller.move(50, 60);
  gate.resolve();
  await Promise.all([first, second, third, hiding, fourth]);
  assert.deepEqual(platform.moves, [
    { point: { x: 1, y: 2 }, animate: false },
    { point: { x: 13, y: 24 }, animate: true },
    { point: { x: 50, y: 60 }, animate: false }
  ]);
  assert.deepEqual(platform.calls.slice(-4), ['move', 'move', 'hide', 'move']);
});

test('all coalesced callers reject on native failure and later moves still run', async () => {
  const platform = new FakePlatform();
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), undefined, { error: error => logged.push(error) });
  await controller.show();
  platform.errors.set('move', new Error('bad move'));
  const results = await Promise.allSettled([controller.move(4, 5), controller.move(6, 7)]);
  assert.deepEqual(results.map(v => v.status), ['rejected', 'rejected']);
  assert.equal(results[0].reason.code, 'WINDOW_OPERATION_FAILED');
  platform.errors.delete('move');
  await controller.move(8, 9);
  assert.equal(controller.getX(), 8);
  assert.deepEqual(logged.map(error => error.code), ['WINDOW_OPERATION_FAILED']);
});

test('cancel prevents late move writeback and destroys once', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await controller.show();
  const gate = deferred();
  platform.gates.set('move', gate.promise);
  const moving = controller.move(90, 91).catch(error => error);
  await platform.moveStarted.promise;
  const cancelled = controller.cancel();
  gate.resolve();
  assert.equal((await moving).code, 'DESTROYED');
  await cancelled;
  assert.equal(controller.getX(), 0);
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(platform.calls.filter(v => v === 'destroy').length, 1);
});

test('native destroy failure still clears local state, emits error and rejects repeated cancel consistently', async () => {
  const platform = new FakePlatform();
  const events = [];
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), event => events.push(event), { error: error => logged.push(error) });
  await controller.show();
  platform.errors.set('destroy', new FxError('WINDOW_OPERATION_FAILED', 'destroy failed', 44));
  await assert.rejects(controller.cancel(), { code: 'WINDOW_OPERATION_FAILED', platformCode: 44 });
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(controller.isShow(), false);
  await assert.rejects(controller.cancel(), { code: 'WINDOW_OPERATION_FAILED' });
  assert.equal(platform.calls.filter(v => v === 'destroy').length, 1);
  assert.equal(events.at(-1).error.platformCode, 44);
  assert.deepEqual(logged.map(error => error.platformCode), [44]);
});

test('event callback can cancel reentrantly and callback throws are sent only to logger', async () => {
  const platform = new FakePlatform();
  const logged = [];
  let cancelled;
  const controller = new FxController(platform, new FxConfig(), event => {
    if (event.type === 'show') {
      cancelled = controller.cancel();
      throw new Error('callback failed');
    }
  }, { error: error => logged.push(error) });
  await controller.show();
  await cancelled;
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].code, 'EVENT_CALLBACK_FAILED');
});

test('throwing logger cannot interrupt queue or cleanup', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig(), () => { throw new Error('callback'); },
    { error: () => { throw new Error('logger'); } });
  await controller.show();
  await controller.cancel();
  assert.equal(controller.getState(), 'destroyed');
});

test('config updates own copies, defer native calls until creation and commit after success', async () => {
  const platform = new FakePlatform();
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), undefined, { error: error => logged.push(error) });
  const update = new FxConfig({ position: { x: 11, y: 12 } });
  const updating = controller.updateConfig(update);
  update.position.x = 99;
  await updating;
  assert.deepEqual(platform.calls, []);
  await controller.show();
  assert.equal(controller.getX(), 11);
  assert.equal(platform.configs[0].position.x, 11);
  platform.errors.set('applyConfig', new Error('config failure'));
  await assert.rejects(controller.updateConfig(new FxConfig({ position: { x: 21, y: 22 } })), { code: 'WINDOW_OPERATION_FAILED' });
  assert.equal(controller.getX(), 11);
  platform.errors.delete('applyConfig');
  await controller.moveByVector(1, 1);
  assert.equal(controller.getX(), 12);
  assert.deepEqual(logged.map(error => error.code), ['WINDOW_OPERATION_FAILED']);
});

test('initial and host layout positions are read from platform snapshots', async () => {
  const platform = new FakePlatform();
  platform.position = { x: 30, y: 40 };
  const events = [];
  const controller = new FxController(platform, new FxConfig(), event => events.push(event));
  await controller.show();
  assert.equal(controller.getX(), 30);
  assert.deepEqual(events[0].position, { x: 30, y: 40 });
  events[0].position.x = -1;
  platform.position = { x: 50, y: 60 };
  assert.equal(controller.getX(), 50);
  assert.equal(controller.getY(), 60);
});

test('idle moves stay lazy and queued vectors use previous committed positions', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await controller.move(10, 20);
  await Promise.all([controller.moveByVector(2, 3), controller.moveByVector(4, 5)]);
  assert.deepEqual(platform.calls, []);
  await controller.show();
  assert.equal(controller.getX(), 16);
  assert.equal(controller.getY(), 28);
});

test('invalid move inputs reject before accessing native resources', async () => {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig());
  await assert.rejects(controller.move(NaN, 1), { code: 'INVALID_GEOMETRY' });
  await assert.rejects(controller.moveByVector(1, Infinity), { code: 'INVALID_GEOMETRY' });
  assert.deepEqual(platform.calls, []);
});

test('initial config failure is retried before showing the created resource', async () => {
  const platform = new FakePlatform();
  const logged = [];
  const controller = new FxController(platform, new FxConfig({ position: { x: 12, y: 13 } }), undefined,
    { error: error => logged.push(error) });
  platform.errors.set('applyConfig', new Error('initial layout failed'));
  await assert.rejects(controller.show(), { code: 'WINDOW_OPERATION_FAILED' });
  assert.equal(controller.getState(), 'hidden');
  platform.errors.delete('applyConfig');
  await controller.show();
  assert.equal(controller.getX(), 12);
  assert.equal(controller.getY(), 13);
  assert.deepEqual(platform.calls, ['create', 'applyConfig', 'applyConfig', 'show']);
  assert.deepEqual(logged.map(error => error.code), ['WINDOW_OPERATION_FAILED']);
});

test('cancel during in-flight show rejects stale completion and suppresses show event', async () => {
  const platform = new FakePlatform();
  const events = [];
  const showStarted = deferred();
  const gate = deferred();
  const nativeShow = platform.show.bind(platform);
  platform.show = () => { showStarted.resolve(); return nativeShow(); };
  platform.gates.set('show', gate.promise);
  const controller = new FxController(platform, new FxConfig(), event => events.push(event));
  const showing = controller.show().catch(error => error);
  await showStarted.promise;
  const cancelled = controller.cancel();
  gate.resolve();
  assert.equal((await showing).code, 'DESTROYED');
  await cancelled;
  assert.equal(controller.isShow(), false);
  assert.equal(events.some(v => v.type === 'show'), false);
  assert.equal(platform.calls.at(-1), 'destroy');
});

test('native business errors preserve numeric code and actual scope in error events', async () => {
  const platform = new FakePlatform(); platform.actualScope = 'system';
  const events = [];
  const controller = new FxController(platform, new FxConfig(), event => events.push(event), { error() {} });
  platform.errors.set('create', { code: 1300002, message: 'native denied' });
  await assert.rejects(controller.show(), { code: 'WINDOW_OPERATION_FAILED', platformCode: 1300002 });
  assert.equal(events[0].actualScope, 'system');
  assert.equal(events[0].error.platformCode, 1300002);
  await controller.cancel();
  assert.equal(platform.calls.filter(v => v === 'destroy').length, 0);
});

test('position getter failure retains last snapshot and destroyed controller stops reading platform', async () => {
  const platform = new FakePlatform(); platform.position = { x: 3, y: 4 };
  const logged = [];
  const controller = new FxController(platform, new FxConfig(), undefined, { error: error => logged.push(error) });
  await controller.show();
  let reads = 0;
  platform.getPosition = () => { reads++; throw new Error('unavailable layout'); };
  assert.equal(controller.getX(), 3);
  assert.equal(logged[0].code, 'WINDOW_OPERATION_FAILED');
  await controller.cancel();
  assert.equal(controller.getY(), 4);
  assert.equal(reads, 1);
});

const lateFailureScenarios = [
  { stage: 'create', method: 'create', operation: 'show', ready: false, destroys: 0 },
  { stage: 'initial config', method: 'applyConfig', operation: 'show', ready: false, destroys: 1 },
  { stage: 'config update', method: 'applyConfig', operation: 'updateConfig', ready: true, destroys: 1 },
  { stage: 'show', method: 'show', operation: 'show', ready: false, destroys: 1 },
  { stage: 'move', method: 'move', operation: 'move', ready: true, destroys: 1 }
];
for (const scenario of lateFailureScenarios) {
  test(`cancel wins over late native ${scenario.stage} rejection`, async () => {
    const platform = new FakePlatform();
    const logged = [];
    const events = [];
    const controller = new FxController(platform, new FxConfig(), event => events.push(event),
      { error: error => logged.push(error) });
    if (scenario.ready) await controller.show();
    events.length = 0;
    const gate = deferred();
    const started = deferred();
    const nativeMethod = platform[scenario.method].bind(platform);
    platform[scenario.method] = (...args) => { started.resolve(); return nativeMethod(...args); };
    platform.gates.set(scenario.method, gate.promise);
    const nativeError = new FxError('PERMISSION_DENIED', 'late native rejection', 201);
    const operation = scenario.operation === 'move' ? controller.move(50, 60) :
      scenario.operation === 'updateConfig' ? controller.updateConfig(new FxConfig({ position: { x: 10, y: 20 } })) :
        controller.show();
    const observed = operation.catch(error => error);
    await started.promise;
    const cancelled = controller.cancel();
    gate.reject(nativeError);
    const error = await observed;
    await cancelled;
    assert.equal(error.code, 'DESTROYED');
    assert.equal(controller.getState(), 'destroyed');
    assert.equal(controller.isShow(), false);
    assert.equal(platform.calls.filter(v => v === 'destroy').length, scenario.destroys);
    assert.deepEqual(logged, [nativeError]);
    assert.deepEqual(events.filter(v => v.error).map(v => v.error.code), ['DESTROYED']);
  });
}

class LifecyclePlatform extends FakePlatform {
 host = false; listener; interruptions=0;
 isHostVisible() { return this.host; }
 subscribeLifecycle(listener) { this.listener=listener; return ()=>{this.listener=undefined;}; }
 cancelAnimations() { this.interruptions++; }
 attach() { this.host=true; this.listener?.('attach'); }
 detach() { this.host=false; this.listener?.('detach'); }
 async create() { await super.create(); this.attach(); }
 async destroy() { this.detach(); await super.destroy(); }
}
test('unmounted show keeps intent; actual attach/detach deduplicate and remount restores',async()=>{
 const p=new LifecyclePlatform(); const events=[]; const c=new FxController(p,new FxConfig(),e=>events.push(e.type));
 await c.show(); assert.equal(c.isShow(),false); assert.deepEqual(p.calls,[]);
 p.host=true; await c.setHostVisible(true); assert.deepEqual(events,['attach','show']);
 p.detach(); p.detach(); assert.equal(c.isShow(),false);
 assert.deepEqual(events,['attach','show','hide','detach']);
 p.attach(); p.attach(); await c.setHostVisible(true);
 assert.equal(c.isShow(),true); assert.deepEqual(events,['attach','show','hide','detach','attach','show']);
 await c.cancel(); p.attach(); assert.equal(c.isShow(),false);
 assert.deepEqual(events.slice(-3),['hide','detach','destroy']);
});
test('host disappears while native show is pending: no late visible event',async()=>{
 const p=new LifecyclePlatform(); p.host=true; const gate=deferred(); p.gates.set('show',gate.promise);
 const events=[]; const c=new FxController(p,new FxConfig(),e=>events.push(e.type));
 const showing=c.show(); await p.createStarted.promise; await Promise.resolve(); await Promise.resolve();
 p.detach(); gate.resolve(); await showing;
 assert.equal(c.isShow(),false); assert.equal(events.includes('show'),false);
});
test('hide and cancel interrupt animations at invocation before queued work',async()=>{
 const p=new LifecyclePlatform(); const c=new FxController(p,new FxConfig());
 const hiding=c.hide(); assert.equal(p.interruptions,1); await hiding;
 const cancel=c.cancel(); assert.equal(p.interruptions,2); await cancel;
});

test('failed destroy preserves error rejection and terminal cleanup events once',async()=>{
 const p=new LifecyclePlatform(); p.host=true; const events=[];
 const c=new FxController(p,new FxConfig(),e=>events.push(e.type),{error(){}});
 await c.show(); p.errors.set('destroy',new FxError('WINDOW_OPERATION_FAILED','native disposal failed'));
 await assert.rejects(c.cancel(),{code:'WINDOW_OPERATION_FAILED'});
 assert.deepEqual(events,['attach','show','hide','detach','destroy','error']);
 assert.equal(c.getState(),'destroyed'); assert.equal(p.listener,undefined);
 p.attach(); assert.equal(c.isShow(),false); assert.equal(events.filter(e=>e==='destroy').length,1);
});

test('host visibility interruption without lifecycle subscription hides a late native show',async()=>{
 const p=new FakePlatform(); const gate=deferred(); p.gates.set('show',gate.promise); const events=[];
 const c=new FxController(p,new FxConfig(),e=>events.push(e.type)); const showing=c.show();
 await p.createStarted.promise; for(let i=0;i<8;i++) await Promise.resolve();
 const invisible=c.setHostVisible(false); gate.resolve(); await Promise.all([showing,invisible]);
 assert.equal(c.isShow(),false); assert.equal(events.includes('show'),false);
 assert.deepEqual(p.calls.filter(v=>['show','hide'].includes(v)),['show','hide']); await c.cancel();
});
