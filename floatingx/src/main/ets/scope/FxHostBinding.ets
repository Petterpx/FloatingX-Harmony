import { FxController } from '../core/FxController';
import { FxContentSource } from '../component/FxContent';
import { FxScopePlatform } from './FxScopePlatform';
export interface FxHostBinding { controller: FxController; content: FxContentSource; platform: FxScopePlatform; }
// Module-private association; no native/rendering objects on the public handle.
const bindings: Map<Object,FxHostBinding> = new Map();
export function bindScopeHost(control: Object, binding: FxHostBinding): void { bindings.set(control,binding); }
export function scopeHostBinding(control: Object): FxHostBinding | undefined { return bindings.get(control); }
export function releaseScopeHost(control: Object): void { bindings.delete(control); }
