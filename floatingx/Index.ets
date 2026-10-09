// API12 named HAR route registration must remain reachable from the public import.
import './src/main/ets/system/FxSystemPage';
export const FLOATINGX_VERSION: string = '0.1.0';
export { FloatingX, FxControl, FxControlHandle, FxScopeOptions, FxAppOptions, FxSystemOptions, FxSystemFallback, FxInstallStorageOptions, FxScopeStorageOptions } from './src/main/ets/FloatingX';
export { FxConfig, FxConfigOptions } from './src/main/ets/core/FxConfig';
export { FxError, FxUninstallError, FxUninstallFailure } from './src/main/ets/core/FxError';
export { FxScope, FxState, FxEventType, FxEvent, FxEventCallback, FxLogger } from './src/main/ets/core/FxPlatform';
export { FxPoint, FxSize, FxInsets, FxGravity, FxDisplayMode, FxEdgeAdsorb, FxAnimationCurve, FxAnimationConfig, FxEdge, FxPositionRecord } from './src/main/ets/core/FxTypes';
export { FxContent } from './src/main/ets/component/FxContent';
export { FloatingXHost } from './src/main/ets/scope/FloatingXHost';
export { FxInteractions, FxDragArea } from './src/main/ets/scope/FxScopePlatform';
export { FxWindowHost } from './src/main/ets/app/FxWindowHost';
export { FxPagePolicy } from './src/main/ets/app/FxPageFilter';
export { FxStorage } from './src/main/ets/storage/FxStorage';
export { FxMemoryStorage } from './src/main/ets/storage/FxMemoryStorage';
export { FxPreferencesStorage } from './src/main/ets/storage/FxPreferencesStorage';
