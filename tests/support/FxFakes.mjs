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

export function systemGeometry(){return {viewport:{size:{width:300,height:500},insets:{left:0,top:0,right:0,bottom:0}},content:{width:50,height:50}};}
export class FakeNativeWindow {
 calls=[]; errors=new Map(); moves=[]; sizes=[]; releaseCount=0; touchable=true; correction={x:0,y:0}; sizeCorrection=0;
 viewport={size:{width:300,height:500},insets:{left:0,top:0,right:0,bottom:0},density:1}; rect={x:0,y:0,width:50,height:50};
 async invoke(name){this.calls.push(name);if(this.errors.has(name))throw this.errors.get(name);}
 load(){return this.invoke('load');} show(){return this.invoke('show');} hide(){return this.invoke('hide');} destroy(){return this.invoke('destroy');}
 async resize(size){await this.invoke('resize');this.sizes.push({...size});this.rect.width=size.width+this.sizeCorrection;this.rect.height=size.height+this.sizeCorrection;}
 async movePx(point){await this.invoke('move');this.moves.push({...point});this.rect.x=point.x+this.correction.x;this.rect.y=point.y+this.correction.y;return {...this.rect};}
 async setTouchable(value){await this.invoke('touchable');this.touchable=value;} setBackground(){return this.invoke('background');}
 getViewport(){return this.viewport;} getRect(){return {...this.rect};} subscribe(){return ()=>{this.releaseCount++;};}
}
export class FakeWindowFactory {
 createCount=0;checkCount=0;native=new FakeNativeWindow();
 constructor(access='granted'){this.access=access;}
 async checkAccess(){this.checkCount++;if(this.access!=='granted'){const {createRequire}=await import('node:module');const r=createRequire(import.meta.url);const {FxError}=r('../../work/core/core/FxError.js');throw new FxError(this.access==='denied'?'PERMISSION_DENIED':'CAPABILITY_UNSUPPORTED',this.access);}}
 async create(){this.createCount++;return this.native;}
}
