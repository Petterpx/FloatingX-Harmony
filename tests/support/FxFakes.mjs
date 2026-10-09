export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Test double at the native window boundary; controller and queue remain real. */
export class FakePlatform {
  calls = [];
  position = { x: 0, y: 0 };
  actualScope = 'scope';
  createStarted = deferred();
  destroyStarted = deferred();
  moveStarted = deferred();
  gates = new Map();
  errors = new Map();
  configs = [];
  moves = [];
  moveResult;

  constructor(createGate) { if (createGate) this.gates.set('create', createGate); }
  async invoke(method) {
    this.calls.push(method);
    if (method === 'create') this.createStarted.resolve();
    if (method === 'destroy') this.destroyStarted.resolve();
    if (method === 'move') this.moveStarted.resolve();
    if (this.gates.has(method)) await this.gates.get(method);
    if (this.errors.has(method)) throw this.errors.get(method);
  }
  create() { return this.invoke('create'); }
  show() { return this.invoke('show'); }
  hide() { return this.invoke('hide'); }
  async move(point, animate) {
    this.moves.push({ point: { ...point }, animate });
    await this.invoke('move');
    this.position = this.moveResult ? { ...this.moveResult } : { ...point };
    return { ...this.position };
  }
  async applyConfig(config) {
    this.configs.push(config);
    await this.invoke('applyConfig');
    if (config.position) this.position = { ...config.position };
  }
  destroy() { return this.invoke('destroy'); }
  getPosition() { return { ...this.position }; }
}
