import test from 'node:test';
import assert from 'node:assert/strict';
import { FxConfig } from '../work/core/core/FxConfig.js';
import { FxError } from '../work/core/core/FxError.js';
import { FxGravity, FxEdgeAdsorb, FxDisplayMode, FxAnimationCurve } from '../work/core/core/FxTypes.js';

const invalid = (fn) => assert.throws(fn, e => e instanceof FxError && e.code === 'INVALID_CONFIG');

test('default config supplies finite geometry, nearest horizontal adsorption and disabled effects', () => {
  const c = new FxConfig();
  assert.equal(c.position, undefined);
  assert.equal(c.gravity, FxGravity.TOP_LEFT);
  assert.deepEqual(c.offset, { x: 0, y: 0 });
  assert.deepEqual(c.margin, { left: 0, top: 0, right: 0, bottom: 0 });
  assert.equal(c.displayMode, FxDisplayMode.Normal);
  assert.equal(c.adsorb, true);
  assert.equal(c.edgeAdsorb, FxEdgeAdsorb.LEFT_RIGHT);
  assert.equal(c.rebound, true);
  assert.equal(c.halfHide, false);
  assert.equal(c.halfHideRatio, 0.5);
  assert.deepEqual(c.animation, { enabled: false, durationMs: 300, curve: FxAnimationCurve.EASE });
  assert.equal(c.clickIntervalMs, 300);
});

test('constructor and copy isolate all caller-owned nested config values', () => {
  const options = { position: { x: 0, y: 0 }, offset: { x: 1, y: -2 },
    margin: { left: 3, top: 4, right: 5, bottom: 6 },
    animation: { enabled: true, durationMs: 240, curve: FxAnimationCurve.LINEAR } };
  const c = new FxConfig(options);
  const copy = c.copy();
  options.position.x = 400; options.offset.y = 800; options.margin.top = 900; options.animation.durationMs = 900;
  assert.deepEqual(c.position, { x: 0, y: 0 });
  assert.deepEqual(c.offset, { x: 1, y: -2 });
  assert.deepEqual(c.margin, { left: 3, top: 4, right: 5, bottom: 6 });
  assert.equal(c.animation.durationMs, 240);
  c.position.x = 12; c.offset.x = 13; c.margin.left = 14; c.animation.durationMs = 15;
  assert.deepEqual(copy.position, { x: 0, y: 0 });
  assert.deepEqual(copy.offset, { x: 1, y: -2 });
  assert.equal(copy.margin.left, 3);
  assert.equal(copy.animation.durationMs, 240);
});

test('config rejects nonfinite values, negative margins and invalid ranges', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    invalid(() => new FxConfig({ position: { x: value, y: 0 } }));
    invalid(() => new FxConfig({ offset: { x: 0, y: value } }));
    invalid(() => new FxConfig({ halfHideRatio: value }));
    invalid(() => new FxConfig({ clickIntervalMs: value }));
    invalid(() => new FxConfig({ animation: { enabled: true, durationMs: value, curve: FxAnimationCurve.EASE } }));
  }
  for (const field of ['left', 'top', 'right', 'bottom']) {
    invalid(() => new FxConfig({ margin: { left: 0, top: 0, right: 0, bottom: 0, [field]: -1 } }));
  }
  for (const ratio of [-0.01, 0.91]) invalid(() => new FxConfig({ halfHideRatio: ratio }));
  invalid(() => new FxConfig({ clickIntervalMs: -1 }));
  invalid(() => new FxConfig({ animation: { enabled: false, durationMs: -1, curve: FxAnimationCurve.EASE } }));
  for (const options of [{ gravity: 'bad' }, { edgeAdsorb: 'bad' }, { displayMode: 'bad' },
    { adsorb: 1 }, { rebound: 'true' }, { halfHide: null },
    { animation: { enabled: true, durationMs: 0, curve: 'bad' } }]) invalid(() => new FxConfig(options));
});

test('zero-valued settings and disabled booleans survive normalization', () => {
  const c = new FxConfig({ position: { x: 0, y: 0 }, adsorb: false, rebound: false,
    halfHide: true, halfHideRatio: 0, clickIntervalMs: 0,
    animation: { enabled: true, durationMs: 0, curve: FxAnimationCurve.LINEAR } });
  assert.deepEqual(c.position, { x: 0, y: 0 });
  assert.equal(c.adsorb, false); assert.equal(c.rebound, false);
  assert.equal(c.halfHideRatio, 0); assert.equal(c.clickIntervalMs, 0);
  assert.equal(c.animation.durationMs, 0);
  assert.equal(new FxConfig({ halfHideRatio: 0.9 }).halfHideRatio, 0.9);
});
