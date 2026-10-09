export const FLOATINGX_VERSION: string = '0.1.0';
// Task 5 scope contracts; final facade will consolidate exports in Task 8.
export { FxConfig } from './src/main/ets/core/FxConfig';
export { FxController } from './src/main/ets/core/FxController';
export { FxDisplayMode, FxEdgeAdsorb, FxAnimationCurve } from './src/main/ets/core/FxTypes';
export { FxContent, FxContentSource } from './src/main/ets/component/FxContent';
export { FloatingXHost } from './src/main/ets/scope/FloatingXHost';
export { FxScopeSnapshot, FxInteractions, FxDragArea, FxScopePlatform } from './src/main/ets/scope/FxScopePlatform';
export { FxFloatView, FxFloatViewAdapter } from './src/main/ets/component/FxFloatView';
export { FxPagePolicy, allowsPage, copyPagePolicy } from './src/main/ets/app/FxPageFilter';
export { FxWindowHost } from './src/main/ets/app/FxWindowHost';
export { FxAppPlatform } from './src/main/ets/app/FxAppPlatform';
