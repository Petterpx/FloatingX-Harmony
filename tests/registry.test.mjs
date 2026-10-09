import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deferred, FakePlatform } from './support/FxFakes.mjs';
const require = createRequire(import.meta.url);
const { FxConfig } = require('../work/core/core/FxConfig.js');
const { FxController } = require('../work/core/core/FxController.js');
const { FxRegistry } = require('../work/core/core/FxRegistry.js');
const { FxError } = require('../work/core/core/FxError.js');

function controller(platform = new FakePlatform(), logged = []) {
  return new FxController(platform, new FxConfig(), undefined, { error: error => logged.push(error) });
}

test('shared namespace rejects duplicate tags and missing lookup reports stable error', () => {
  const registry = new FxRegistry();
  const app = new FakePlatform(); app.actualScope = 'app';
  const system = new FakePlatform(); system.actualScope = 'system';
  const first = controller(app);
  registry.register('floating', first);
  assert.throws(() => registry.register('floating', controller(system)), { code: 'DUPLICATE_TAG' });
  assert.equal(registry.control('floating'), first);
  assert.equal(registry.controlOrNull('absent'), undefined);
  assert.throws(() => registry.control('absent'), { code: 'NOT_INSTALLED' });
  const tags = registry.getAllTags(); tags.push('forged');
  assert.deepEqual(registry.getAllTags(), ['floating']);
});

test('old instance unregister cannot remove replacement', () => {
  const registry = new FxRegistry();
  const old = controller();
  const fresh = controller();
  registry.register('floating', old);
  registry.unregister('floating', fresh);
  assert.equal(registry.control('floating'), old);
  registry.unregister('floating', old);
  registry.register('floating', fresh);
  registry.unregister('floating', old);
  assert.equal(registry.control('floating'), fresh);
});

test('uninstall removes registration even when native destroy rejects', async () => {
  const registry = new FxRegistry();
  const platform = new FakePlatform();
  const logged = [];
  const item = controller(platform, logged);
  registry.register('floating', item);
  await item.show();
  platform.errors.set('destroy', new FxError('WINDOW_OPERATION_FAILED', 'destroy failure', 201));
  await assert.rejects(registry.uninstall('floating'), { code: 'WINDOW_OPERATION_FAILED', platformCode: 201 });
  assert.equal(registry.controlOrNull('floating'), undefined);
  assert.equal(item.getState(), 'destroyed');
  await registry.uninstall('floating');
  assert.deepEqual(logged.map(error => error.platformCode), [201]);
});

test('late uninstall completion preserves replacement identity', async () => {
  const registry = new FxRegistry();
  const platform = new FakePlatform();
  const gate = deferred(); platform.gates.set('destroy', gate.promise);
  const old = controller(platform);
  registry.register('floating', old);
  await old.show();
  const removing = registry.uninstall('floating');
  await platform.destroyStarted.promise;
  registry.unregister('floating', old);
  const fresh = controller();
  registry.register('floating', fresh);
  gate.resolve();
  await removing;
  assert.equal(registry.control('floating'), fresh);
  assert.equal(fresh.getState(), 'idle');
});

test('uninstallAll starts every cleanup despite failure and waits for delayed releases', async () => {
  const registry = new FxRegistry();
  const bad = new FakePlatform();
  const slow = new FakePlatform();
  const good = new FakePlatform();
  const gate = deferred(); slow.gates.set('destroy', gate.promise);
  const logged = [];
  const items = [controller(bad, logged), controller(slow), controller(good)];
  registry.register('bad', items[0]); registry.register('slow', items[1]); registry.register('good', items[2]);
  await Promise.all(items.map(v => v.show()));
  bad.errors.set('destroy', new FxError('WINDOW_OPERATION_FAILED', 'cannot destroy', 51));
  const removing = registry.uninstallAll();
  const observed = removing.catch(error => error);
  await Promise.all([slow.destroyStarted.promise, good.destroyStarted.promise]);
  assert.equal(items[0].getGeneration(), 1);
  assert.equal(items[1].getGeneration(), 1);
  assert.equal(items[2].getGeneration(), 1);
  gate.resolve();
  assert.equal((await observed).platformCode, 51);
  assert.deepEqual(registry.getAllTags(), []);
  assert.deepEqual(items.map(v => v.getState()), ['destroyed', 'destroyed', 'destroyed']);
  assert.deepEqual(logged.map(error => error.platformCode), [51]);
});

test('uninstallAll snapshots registrations and preserves newly registered instances', async () => {
  const registry = new FxRegistry();
  const gate = deferred();
  const platform = new FakePlatform(); platform.gates.set('destroy', gate.promise);
  const old = controller(platform);
  registry.register('old', old);
  await old.show();
  const removing = registry.uninstallAll();
  await platform.destroyStarted.promise;
  const fresh = controller(); registry.register('fresh', fresh);
  gate.resolve();
  await removing;
  assert.deepEqual(registry.getAllTags(), ['fresh']);
  assert.equal(fresh.getState(), 'idle');
});
