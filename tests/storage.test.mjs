import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deferred, FakePlatform } from './support/FxFakes.mjs';
const require = createRequire(import.meta.url);
const { FxPositionSession } = require('../work/core/storage/FxPositionSession.js');
const { FxMemoryStorage } = require('../work/core/storage/FxMemoryStorage.js');
const { FxConfig } = require('../work/core/core/FxConfig.js');
const { FxError } = require('../work/core/core/FxError.js');
const { FxController } = require('../work/core/core/FxController.js');
const record = (x = 40, y = 60) => ({ version: 1, position: { x, y }, viewport: { width: 300, height: 500 }, edge: 'none' });
const geometry = () => ({ viewport: { size: { width: 300, height: 500 }, insets: { left: 0, top: 0, right: 0, bottom: 0 } }, content: { width: 50, height: 50 }, config: new FxConfig() });
const options = (storage, extra = {}) => ({ namespace: 'test', scope: 'scope', key: 'tag', storage, ...extra });

test('memory owns record snapshots across saving and loading', async () => {
  const store = new FxMemoryStorage(); const value = record();
  await store.save('key', value); value.position.x = 99;
  const first = await store.load('key'); assert.equal(first.position.x, 40); first.position.y = 99;
  assert.equal((await store.load('key')).position.y, 60);
  await store.clear('key'); assert.equal(await store.load('key'), undefined);
});

test('session roundtrip restores legal logical coordinates and isolates namespace scope and tag', async () => {
  const store = new FxMemoryStorage();
  const first = new FxPositionSession(options(store), () => {}); await first.save(record());
  assert.deepEqual(await new FxPositionSession(options(store), () => {}).restore(geometry()), { x: 40, y: 60 });
  for (const extra of [{ namespace: 'other' }, { scope: 'app' }, { scope: 'system' }, { key: 'other' }]) {
    assert.equal(await new FxPositionSession(options(store, extra), () => {}).restore(geometry()), undefined);
  }
  const a = new FxPositionSession(options(store, { namespace: 'a:scope', key: 'b' }), () => {});
  const b = new FxPositionSession(options(store, { namespace: 'a', key: 'scope:b' }), () => {});
  await a.save(record(8, 9)); assert.equal(await b.restore(geometry()), undefined);
});

for (const [label, change] of [
  ['version', v => ({ ...v, version: 2 })], ['nonfinite coordinate', v => ({ ...v, position: { x: NaN, y: 1 } })],
  ['coordinate type', v => ({ ...v, position: { x: '40', y: 1 } })], ['empty viewport', v => ({ ...v, viewport: { width: 0, height: 500 } })],
  ['unknown edge', v => ({ ...v, edge: 'diagonal' })], ['null', () => null], ['missing fields', () => ({ version: 1 })]
]) {
  test('malformed stored record does not restore: ' + label, async () => {
    const session = new FxPositionSession(options({ async load() { return change(record()); }, async save() {}, async clear() {} }), () => {});
    assert.equal(await session.restore(geometry()), undefined);
  });
}

test('load and save failures report sanitized STORAGE_FAILED without rejection', async () => {
  const errors = []; const store = { async load() { throw { code: 123, message: 'sensitive' }; }, async save() { throw new FxError('STORAGE_FAILED', 'secret', 456); }, async clear() { throw Error('secret'); } };
  const session = new FxPositionSession(options(store), error => errors.push(error));
  assert.equal(await session.restore(geometry()), undefined); await session.save(record()); await session.clear();
  assert.deepEqual(errors.map(e => e.code), ['STORAGE_FAILED', 'STORAGE_FAILED', 'STORAGE_FAILED']);
  assert.equal(errors[0].platformCode, 123); assert.equal(errors.some(e => e.message.includes('secret') || e.message.includes('sensitive')), false);
});

for (const action of ['markUserMove', 'clear', 'close']) {
  test(action + ' invalidates a deferred restore', async () => {
    const gate = deferred(); const started = deferred();
    const store = { async load() { started.resolve(); return gate.promise; }, async save() {}, async clear() {} };
    const session = new FxPositionSession(options(store), () => {});
    const restoring = session.restore(geometry()); await started.promise; await session[action](); gate.resolve(record());
    assert.equal(await restoring, undefined);
  });
}

test('clear after an in-flight save wins and pending writes merge with owned latest snapshot', async () => {
  const backing = new FxMemoryStorage(); const started = deferred(); const gate = deferred(); let saves = 0; let key;
  const store = { load: k => backing.load(k), async save(k, value) { key = k; saves++; started.resolve(); if (saves === 1) await gate.promise; await backing.save(k, value); }, clear: k => backing.clear(k) };
  const session = new FxPositionSession(options(store), () => {});
  const saving = session.save(record()); await started.promise;
  const old = session.save(record(20, 30)); const latest = record(50, 70); const merged = session.save(latest); latest.position.x = 99;
  gate.resolve(); await Promise.all([saving, old, merged]); assert.deepEqual((await backing.load(key)).position, { x: 50, y: 70 }); assert.equal(saves, 2);
  const secondGate = deferred(); const secondStarted = deferred();
  store.save = async (k, value) => { secondStarted.resolve(); await secondGate.promise; await backing.save(k, value); };
  const late = session.save(record()); await secondStarted.promise;
  const clearing = session.clear(); secondGate.resolve(); await Promise.all([late, clearing]);
  assert.equal(await backing.load(key), undefined);
});

function controllerWithStore(store, events = [], logged = []) {
  const platform = new FakePlatform();
  const controller = new FxController(platform, new FxConfig({ position: { x: 1, y: 2 } }), e => events.push(e), { error: e => logged.push(e) });
  controller.bindPositionStorage(options(store), geometry);
  return { platform, controller };
}

test('controller waits for restore before visible show and load failure permits defaults', async () => {
  const gate = deferred(); const started = deferred();
  const store = { async load() { started.resolve(); return gate.promise; }, async save() {}, async clear() {} };
  const { platform, controller } = controllerWithStore(store);
  const showing = controller.show(); await started.promise;
  assert.equal(platform.calls.includes('show'), false); gate.resolve(record()); await showing;
  assert.deepEqual(platform.moves[0].point, { x: 40, y: 60 }); assert.equal(controller.getX(), 40);
  await controller.hide(); await controller.show(); assert.equal(platform.moves.length, 1);
  const errors = [], events = []; const failed = controllerWithStore({ ...store, async load() { throw Error('private'); } }, events, errors);
  await failed.controller.show(); assert.equal(failed.controller.isShow(), true); assert.equal(failed.controller.getX(), 1);
  assert.equal(errors[0].code, 'STORAGE_FAILED'); assert.equal(events[0].error.code, 'STORAGE_FAILED');
});

test('move invalidates restoration at invocation while show is awaiting load', async () => {
  const gate = deferred(); const started = deferred(); const backing = new FxMemoryStorage(); let key;
  const store = { async load() { started.resolve(); return gate.promise; }, async save(k, v) { key = k; await backing.save(k, v); }, clear: k => backing.clear(k) };
  const { controller, platform } = controllerWithStore(store);
  const showing = controller.show(); await started.promise; const moving = controller.move(15, 25); gate.resolve(record());
  await Promise.all([showing, moving]); assert.deepEqual(platform.moves.map(v => v.point), [{ x: 15, y: 25 }]);
  assert.deepEqual((await backing.load(key)).position, { x: 15, y: 25 });
});

test('cancel during load blocks late UI changes and save after close', async () => {
  const gate = deferred(); const started = deferred(); let saves = 0;
  const { controller, platform } = controllerWithStore({ async load() { started.resolve(); return gate.promise; }, async save() { saves++; }, async clear() {} });
  const showing = controller.show().catch(e => e); await started.promise; const cancelling = controller.cancel(); gate.resolve(record());
  assert.equal((await showing).code, 'DESTROYED'); await cancelling;
  assert.equal(platform.calls.includes('show'), false); assert.equal(platform.moves.length, 0);
  await controller.savePosition(); assert.equal(saves, 0);
});

test('controller stores logical edge and actual move result only on move completion or drag end', async () => {
  const backing = new FxMemoryStorage(); const saved = [];
  const { controller, platform } = controllerWithStore({ load: k => backing.load(k), async save(k, v) { saved.push(v); await backing.save(k, v); }, clear: k => backing.clear(k) });
  await controller.show(); await controller.hide(); await controller.show(); assert.equal(saved.length, 0);
  platform.moveResult = { x: 250, y: 100 }; await controller.move(280, 200);
  assert.deepEqual(saved[0], { version: 1, position: { x: 250, y: 100 }, viewport: { width: 300, height: 500 }, edge: 'right' });
  platform.position = { x: 0, y: 80 }; await controller.savePosition(); assert.equal(saved[1].edge, 'left');
});

test('save selects configured vertical edge at corner rather than incidental horizontal edge', async () => {
  const saved = []; const { controller, platform } = controllerWithStore({ async load() {}, async save(k, v) { saved.push(v); }, async clear() {} });
  await controller.updateConfig(new FxConfig({ edgeAdsorb: 'top-bottom' }));
  await controller.show(); platform.position = { x: 250, y: 0 }; await controller.savePosition();
  assert.equal(saved[0].edge, 'top');
});

test('binding after queued show rejects and write failure does not block successful move', async () => {
  const platform = new FakePlatform(); const controller = new FxController(platform, new FxConfig());
  const showing = controller.show();
  assert.throws(() => controller.bindPositionStorage(options(new FxMemoryStorage()), geometry), { code: 'INVALID_CONFIG' });
  await showing;
  const errors = []; const failed = controllerWithStore({ async load() {}, async save() { throw Error('write'); }, async clear() {} }, [], errors);
  await failed.controller.show(); await failed.controller.move(7, 8);
  assert.equal(failed.controller.getX(), 7); assert.equal(errors[0].code, 'STORAGE_FAILED');
});

// Executes the actual .ets implementation with only the unavailable native Preferences boundary replaced.
async function preferencesFixture() {
  const { readFile } = await import('node:fs/promises'); const vm = await import('node:vm'); const ts = require('typescript');
  const source = await readFile(new URL('../floatingx/src/main/ets/storage/FxPreferencesStorage.ets', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const values = new Map(), calls = []; const gate = deferred(); let failOpen = false, failFlush = false, holdPut = false;
  const native = { async get(k, fallback) { return values.has(k) ? values.get(k) : fallback; }, async put(k, v) { calls.push('put'); if (holdPut) await gate.promise; values.set(k, v); }, async delete(k) { calls.push('delete'); values.delete(k); }, async flush() { calls.push('flush'); if (failFlush) throw { code: 42, message: 'private JSON' }; } };
  const app = {}; const context = { getApplicationContext() { return app; } }; let opens = 0;
  const module = { exports: {} }; const customRequire = id => {
    if (id === '@ohos.data.preferences') return { default: { async getPreferences(ctx, name) { assert.equal(ctx, app); assert.equal(name, 'floatingx_positions_v1'); opens++; if (failOpen) throw { code: 41, message: 'private context' }; return native; } } };
    return require('../work/core/' + (id.startsWith('./') ? 'storage/' + id.slice(2) : id.slice(3)) + '.js');
  };
  vm.runInNewContext(js, { exports: module.exports, module, require: customRequire });
  return { storage: new module.exports.FxPreferencesStorage(context), values, calls, gate, opens: () => opens,
    setFailOpen(v) { failOpen = v; }, setFailFlush(v) { failFlush = v; }, setHoldPut(v) { holdPut = v; } };
}

test('Preferences parses every field, isolates app store, flushes and retries opening failures', async () => {
  const f = await preferencesFixture(); f.setFailOpen(true);
  await assert.rejects(f.storage.load('key'), { code: 'STORAGE_FAILED', platformCode: 41 }); f.setFailOpen(false);
  await f.storage.save('key', record()); assert.equal(f.opens(), 2); assert.deepEqual(f.calls, ['put', 'flush']);
  assert.equal((await f.storage.load('key')).position.x, 40);
  for (const invalid of ['bad JSON', '{"version":2}', JSON.stringify({ ...record(), position: { x: '40', y: 60 } }), JSON.stringify({ ...record(), edge: 'alien' }), JSON.stringify({ ...record(), viewport: { width: 300, height: 0 } })]) {
    f.values.set('key', invalid); assert.equal(await f.storage.load('key'), undefined);
  }
  f.values.set('key', 123); assert.equal(await f.storage.load('key'), undefined);
  await f.storage.clear('key'); assert.equal(f.values.has('key'), false); assert.deepEqual(f.calls.slice(-2), ['delete', 'flush']);
  f.setFailFlush(true); await assert.rejects(f.storage.save('key', record()), { code: 'STORAGE_FAILED', platformCode: 42 });
  f.setFailFlush(false); await f.storage.clear('key'); assert.equal(f.values.has('key'), false);
});

test('Preferences clear follows direct in-flight writes through flush', async () => {
  const f = await preferencesFixture(); f.setHoldPut(true); const saving = f.storage.save('key', record());
  while (!f.calls.includes('put')) await new Promise(resolve => setImmediate(resolve));
  const clearing = f.storage.clear('key'); f.gate.resolve(); await Promise.all([saving, clearing]);
  assert.equal(f.values.has('key'), false); assert.deepEqual(f.calls, ['put', 'flush', 'delete', 'flush']);
});

test('failed application of historical position reports storage error and still shows defaults', async () => {
  const errors = [];
  const { controller, platform } = controllerWithStore({ async load() { return record(); }, async save() {}, async clear() {} }, [], errors);
  platform.errors.set('move', { code: 44, message: 'private native restore' });
  await controller.show(); assert.equal(controller.isShow(), true); assert.equal(controller.getX(), 1);
  assert.equal(errors[0].code, 'STORAGE_FAILED'); assert.equal(errors[0].platformCode, 44);
});

test('moves before the first restore starts take precedence and cancel during save suppresses stale MOVE event', async () => {
  let loads = 0; const saved = [];
  const first = controllerWithStore({ async load() { loads++; return record(); }, async save(k, v) { saved.push(v); }, async clear() {} });
  const moving = first.controller.move(9, 10); const showing = first.controller.show(); await Promise.all([moving, showing]);
  assert.equal(loads, 0); assert.equal(first.controller.getX(), 9);
  const started = deferred(), gate = deferred(), events = [];
  const second = controllerWithStore({ async load() {}, async save() { started.resolve(); await gate.promise; }, async clear() {} }, events);
  await second.controller.show(); events.length = 0;
  const movingLate = second.controller.move(20, 30).catch(e => e); await started.promise;
  const cancelling = second.controller.cancel(); gate.resolve(); assert.equal((await movingLate).code, 'DESTROYED'); await cancelling;
  assert.equal(events.some(e => e.type === 'move'), false);
});

test('cancel from restore failure callback prevents late native show', async () => {
  const platform = new FakePlatform();
  const events = [], errors = [];
  let cancelled;
  const controller = new FxController(platform, new FxConfig({ position: { x: 1, y: 2 } }), event => {
    events.push(event);
    if (event.error?.code === 'STORAGE_FAILED') cancelled = controller.cancel();
  }, { error: error => errors.push(error) });
  controller.bindPositionStorage(options({ async load() { return record(); }, async save() {}, async clear() {} }), geometry);
  platform.errors.set('move', { code: 44, message: 'private native restore' });
  await assert.rejects(controller.show(), { code: 'DESTROYED' });
  await cancelled;
  assert.deepEqual(platform.calls, ['create', 'applyConfig', 'move', 'destroy']);
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(controller.isShow(), false);
  assert.equal(events.some(event => event.type === 'show'), false);
  assert.deepEqual(events.filter(event => event.error).map(event => event.error.code), ['STORAGE_FAILED', 'DESTROYED']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].platformCode, 44);
});
