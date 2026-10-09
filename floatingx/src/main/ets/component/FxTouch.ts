import { FxPoint } from '../core/FxTypes';
export interface FxPointer { id: number; x: number; y: number; timeMs: number; }
export type FxTouchKind = 'none' | 'drag' | 'click' | 'longPress' | 'end';
export interface FxTouchResult { kind: FxTouchKind; position: FxPoint; }
/** Coordinates are absolute vp: moving the rendered content cannot feed back into drag deltas. */
export class FxTouch {
 private primary?: FxPointer;
 private origin: FxPoint = {x:0,y:0};
 private position: FxPoint = {x:0,y:0};
 private displaced: boolean = false;
 private longPressed: boolean = false;
 private lastClick: number = -Infinity;
 private mode: string;
 private thresholdVp: number;
 private clickIntervalMs: number;
 private longPressMs: number;
 constructor(mode: string, thresholdVp: number, clickIntervalMs: number, longPressMs: number) {
   this.mode=mode; this.thresholdVp=thresholdVp; this.clickIntervalMs=clickIntervalMs; this.longPressMs=longPressMs;
 }
 down(pointer: FxPointer, position: FxPoint = {x:0,y:0}): FxTouchResult {
   if (this.mode === 'DisplayOnly' || this.mode === 'display-only' || this.primary !== undefined) return this.result('none');
   this.primary = {id:pointer.id,x:pointer.x,y:pointer.y,timeMs:pointer.timeMs};
   this.origin = {x:position.x,y:position.y}; this.position = {x:position.x,y:position.y};
   this.displaced = false; this.longPressed = false; return this.result('none');
 }
 move(pointer: FxPointer): FxTouchResult {
   const primary = this.primary;
   if (primary === undefined || pointer.id !== primary.id || this.longPressed) return this.result('none');
   const dx = pointer.x-primary.x; const dy = pointer.y-primary.y;
   if (Math.sqrt(dx*dx+dy*dy)>this.thresholdVp) this.displaced = true;
   if (this.displaced) {
     if (this.mode === 'ClickOnly' || this.mode === 'click-only') return this.result('none');
     this.position = {x:this.origin.x+dx,y:this.origin.y+dy}; return this.result('drag');
   }
   if (pointer.timeMs-primary.timeMs >= this.longPressMs) {
     this.longPressed = true; return this.result('longPress');
   }
   return this.result('none');
 }
 up(pointer: FxPointer): FxTouchResult {
   if (this.primary === undefined || pointer.id !== this.primary.id) return this.result('none');
   const update = this.move(pointer);
   const kind = update.kind === 'longPress' ? 'longPress' :
     (!this.displaced && !this.longPressed && pointer.timeMs-this.lastClick>=this.clickIntervalMs ? 'click' : 'end');
   if (kind === 'click') this.lastClick = pointer.timeMs;
   this.primary = undefined; return this.result(kind);
 }
 cancel(): FxTouchResult {
   const active = this.primary !== undefined; this.primary = undefined; return this.result(active ? 'end':'none');
 }
 private result(kind: FxTouchKind): FxTouchResult {
   return {kind:kind,position:{x:this.position.x,y:this.position.y}};
 }
}
