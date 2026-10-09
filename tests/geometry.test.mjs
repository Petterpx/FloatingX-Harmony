import test from 'node:test';
import assert from 'node:assert/strict';
import { FxConfig } from '../work/core/core/FxConfig.js';
import { FxError } from '../work/core/core/FxError.js';
import { FxGravity, FxEdgeAdsorb, FxEdge } from '../work/core/core/FxTypes.js';
import { bounds, initial, clamp, settle, restore, project } from '../work/core/geometry/FxGeometry.js';

function input(options = {}, width = 300, height = 500) {
  return { viewport: { size: { width, height }, insets: { left: 0, top: 0, right: 0, bottom: 0 } },
    content: { width: 50, height: 50 }, config: new FxConfig(options) };
}
const invalid = (fn) => assert.throws(fn, e => e instanceof FxError && e.code === 'INVALID_GEOMETRY');

test('bounds account for each safe inset and margin', () => {
  assert.deepEqual(bounds(input()), { minX: 0, maxX: 250, minY: 0, maxY: 450 });
  const i = input({ margin: { left: 5, top: 6, right: 7, bottom: 8 } });
  i.viewport.insets = { left: 10, top: 20, right: 30, bottom: 40 };
  assert.deepEqual(bounds(i), { minX: 15, maxX: 213, minY: 26, maxY: 402 });
});

test('initial gravity positions all nine anchors and applies signed offset before clamping', () => {
  for (const [gravity, x, y] of [
    [FxGravity.TOP_LEFT, 0, 0], [FxGravity.TOP_CENTER, 125, 0], [FxGravity.TOP_RIGHT, 250, 0],
    [FxGravity.CENTER_LEFT, 0, 225], [FxGravity.CENTER, 125, 225], [FxGravity.CENTER_RIGHT, 250, 225],
    [FxGravity.BOTTOM_LEFT, 0, 450], [FxGravity.BOTTOM_CENTER, 125, 450], [FxGravity.BOTTOM_RIGHT, 250, 450]
  ]) assert.deepEqual(initial(input({ gravity })), { x, y });
  assert.deepEqual(initial(input({ gravity: FxGravity.CENTER, offset: { x: 15, y: -20 } })), { x: 140, y: 205 });
  assert.deepEqual(initial(input({ gravity: FxGravity.BOTTOM_RIGHT, offset: { x: 50, y: -20 } })), { x: 250, y: 430 });
});

test('explicit zero initial coordinates take precedence over gravity and receive offset', () => {
  assert.deepEqual(initial(input({ position: { x: 0, y: 0 }, gravity: FxGravity.BOTTOM_RIGHT })), { x: 0, y: 0 });
  assert.deepEqual(initial(input({ position: { x: 0, y: 0 }, offset: { x: 10, y: 20 } })), { x: 10, y: 20 });
});

test('clamp corrects out-of-range positions without mutating them', () => {
  const p = { x: -20, y: 600 };
  assert.deepEqual(clamp(p, { minX: 10, maxX: 10, minY: 0, maxY: 450 }), { x: 10, y: 450 });
  assert.deepEqual(p, { x: -20, y: 600 });
});

test('settle clamps then supports all six adsorption directions and deterministic ties', () => {
  for (const [edgeAdsorb, x, y] of [
    [FxEdgeAdsorb.LEFT, 0, 40], [FxEdgeAdsorb.RIGHT, 250, 40],
    [FxEdgeAdsorb.TOP, 80, 0], [FxEdgeAdsorb.BOTTOM, 80, 450],
    [FxEdgeAdsorb.LEFT_RIGHT, 0, 40], [FxEdgeAdsorb.TOP_BOTTOM, 80, 0]
  ]) assert.deepEqual(settle({ x: 80, y: 40 }, input({ edgeAdsorb })), { x, y });
  assert.deepEqual(settle({ x: 180, y: 300 }, input()), { x: 250, y: 300 });
  assert.deepEqual(settle({ x: 125, y: 225 }, input()), { x: 0, y: 225 });
  assert.deepEqual(settle({ x: 125, y: 225 }, input({ edgeAdsorb: FxEdgeAdsorb.TOP_BOTTOM })), { x: 125, y: 0 });
  assert.deepEqual(settle({ x: -80, y: 900 }, input({ edgeAdsorb: FxEdgeAdsorb.RIGHT })), { x: 250, y: 450 });
  assert.deepEqual(settle({ x: -80, y: 900 }, input({ adsorb: false, rebound: false })), { x: 0, y: 450 });
});

test('oversized content collapses intervals instead of reversing them', () => {
  const i = input({ margin: { left: 10, top: 20, right: 0, bottom: 0 } });
  i.content = { width: 400, height: 600 };
  assert.deepEqual(bounds(i), { minX: 10, maxX: 10, minY: 20, maxY: 20 });
  assert.deepEqual(initial(i), { x: 10, y: 20 });
  assert.deepEqual(settle({ x: 600, y: -60 }, i), { x: 10, y: 20 });
});

test('geometry rejects invalid dimensions, insets, coordinates and reversed intervals', () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    for (const dimension of ['width', 'height']) {
      const a = input(); a.content[dimension] = value; invalid(() => bounds(a));
      const b = input(); b.viewport.size[dimension] = value; invalid(() => bounds(b));
    }
  }
  for (const value of [-1, NaN, Infinity]) {
    for (const side of ['left', 'top', 'right', 'bottom']) {
      const i = input(); i.viewport.insets[side] = value; invalid(() => bounds(i));
    }
  }
  for (const value of [NaN, Infinity, -Infinity]) {
    invalid(() => clamp({ x: value, y: 0 }, { minX: 0, maxX: 250, minY: 0, maxY: 450 }));
    invalid(() => settle({ x: 0, y: value }, input()));
    invalid(() => project({ x: value, y: 40 }, input()));
  }
  invalid(() => clamp({ x: 0, y: 0 }, { minX: 50, maxX: 10, minY: 0, maxY: 20 }));
});

test('half-hide projects four edges to positive windows with matching content offsets', () => {
  for (const [edgeAdsorb, point, expected] of [
    [FxEdgeAdsorb.LEFT, { x: 0, y: 40 }, { position: { x: 0, y: 40 }, visibleSize: { width: 25, height: 50 }, contentOffset: { x: -25, y: 0 } }],
    [FxEdgeAdsorb.RIGHT, { x: 250, y: 40 }, { position: { x: 275, y: 40 }, visibleSize: { width: 25, height: 50 }, contentOffset: { x: 0, y: 0 } }],
    [FxEdgeAdsorb.TOP, { x: 80, y: 0 }, { position: { x: 80, y: 0 }, visibleSize: { width: 50, height: 25 }, contentOffset: { x: 0, y: -25 } }],
    [FxEdgeAdsorb.BOTTOM, { x: 80, y: 450 }, { position: { x: 80, y: 475 }, visibleSize: { width: 50, height: 25 }, contentOffset: { x: 0, y: 0 } }]
  ]) assert.deepEqual(project(point, input({ halfHide: true, edgeAdsorb })), expected);
});

test('projection respects disabled hiding, ratio endpoints, interior positions and safe edges', () => {
  assert.deepEqual(project({ x: 250, y: 40 }, input()), { position: { x: 250, y: 40 }, visibleSize: { width: 50, height: 50 }, contentOffset: { x: 0, y: 0 } });
  assert.deepEqual(project({ x: 0, y: 40 }, input({ halfHide: true, halfHideRatio: 0 })), { position: { x: 0, y: 40 }, visibleSize: { width: 50, height: 50 }, contentOffset: { x: 0, y: 0 } });
  assert.deepEqual(project({ x: 250, y: 40 }, input({ halfHide: true, halfHideRatio: 0.9 })), { position: { x: 295, y: 40 }, visibleSize: { width: 5, height: 50 }, contentOffset: { x: 0, y: 0 } });
  assert.deepEqual(project({ x: 80, y: 40 }, input({ halfHide: true })), { position: { x: 80, y: 40 }, visibleSize: { width: 50, height: 50 }, contentOffset: { x: 0, y: 0 } });
  const i = input({ halfHide: true, edgeAdsorb: FxEdgeAdsorb.RIGHT }); i.viewport.insets.right = 30;
  assert.deepEqual(project({ x: 220, y: 40 }, i), { position: { x: 245, y: 40 }, visibleSize: { width: 25, height: 50 }, contentOffset: { x: 0, y: 0 } });
  assert.deepEqual(project({ x: 0, y: 0 }, input({ halfHide: true, edgeAdsorb: FxEdgeAdsorb.TOP })).contentOffset, { x: 0, y: -25 });
});

function record(edge = FxEdge.NONE, x = 100, y = 225) {
  return { version: 1, position: { x, y }, viewport: { width: 300, height: 500 }, edge };
}

test('restore scales legal-range relative position after rotation and preserves stored edge', () => {
  const i = input({}, 500, 300);
  assert.deepEqual(restore(record(), i), { x: 180, y: 125 });
  assert.deepEqual(restore(record(FxEdge.LEFT, 0, 225), i), { x: 0, y: 125 });
  assert.deepEqual(restore(record(FxEdge.RIGHT, 250, 225), i), { x: 450, y: 125 });
  assert.deepEqual(restore(record(FxEdge.TOP, 100, 0), i), { x: 180, y: 0 });
  assert.deepEqual(restore(record(FxEdge.BOTTOM, 100, 450), i), { x: 180, y: 250 });
});

test('restore corrects changed safe insets and content size, including collapsed ranges', () => {
  const i = input(); i.viewport.insets = { left: 20, top: 30, right: 40, bottom: 50 };
  assert.deepEqual(restore(record(FxEdge.RIGHT, 250, 225), i), { x: 210, y: 225 });
  i.content = { width: 100, height: 100 };
  assert.deepEqual(restore(record(FxEdge.RIGHT, 250, 225), i), { x: 160, y: 225 });
  i.content = { width: 600, height: 600 };
  assert.deepEqual(restore(record(FxEdge.RIGHT, 250, 225), i), { x: 20, y: 30 });
});

test('restore rejects unsupported records and nonfinite persisted data', () => {
  for (const r of [ { ...record(), version: 2 }, { ...record(), edge: 'bad' },
    { ...record(), position: { x: NaN, y: 10 } }, { ...record(), viewport: { width: 0, height: 500 } } ]) {
    assert.throws(() => restore(r, input()), e => e instanceof FxError && e.code === 'INVALID_POSITION_RECORD');
  }
});

test('mutated configuration is revalidated before geometry can produce unsafe output', () => {
  const i = input(); i.config.margin.left = -10;
  assert.throws(() => bounds(i), e => e instanceof FxError && e.code === 'INVALID_CONFIG');
  const j = input(); j.config.halfHideRatio = 1;
  assert.throws(() => project({ x: 0, y: 0 }, j), e => e instanceof FxError && e.code === 'INVALID_CONFIG');
});

test('projection and restoration do not mutate positions, record, or geometry input', () => {
  const i = input({ halfHide: true, edgeAdsorb: FxEdgeAdsorb.RIGHT });
  const p = { x: 250, y: 40 }; const r = record(FxEdge.RIGHT, 250, 225);
  const savedInput = structuredClone(i); const savedRecord = structuredClone(r);
  project(p, i); restore(r, i);
  assert.deepEqual(p, { x: 250, y: 40 });
  assert.deepEqual(r, savedRecord);
  assert.deepEqual(structuredClone(i), savedInput);
});
