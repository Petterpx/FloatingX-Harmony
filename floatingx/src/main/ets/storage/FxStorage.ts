import { FxError } from '../core/FxError';
import { FxScope } from '../core/FxPlatform';
import { FxEdge, FxPositionRecord } from '../core/FxTypes';
export { FxEdge, FxPositionRecord } from '../core/FxTypes';

export interface FxStorage {
  load(key: string): Promise<FxPositionRecord | undefined>;
  save(key: string, value: FxPositionRecord): Promise<void>;
  clear(key: string): Promise<void>;
}
export interface FxStorageOptions {
  namespace: string;
  key: string;
  storage: FxStorage;
  scope?: FxScope;
}
export type FxStorageErrorCallback = (error: FxError) => void;
interface FxStorageNativeError { code?: number; }

/** No raw exception message or stored value crosses the diagnostics boundary. */
export function storageError(error: Error): FxError {
  const native = error as FxStorageNativeError;
  const code = error instanceof FxError ? error.platformCode :
    (native === null || native === undefined ? undefined : native.code);
  return new FxError('STORAGE_FAILED', 'Position storage operation failed',
    typeof code === 'number' && Number.isFinite(code) ? code : undefined);
}

export function validRecord(record: FxPositionRecord): boolean {
  if (record === null || typeof record !== 'object' || record.version !== 1) return false;
  const point = record.position;
  const size = record.viewport;
  if (point === null || typeof point !== 'object' || size === null || typeof size !== 'object') return false;
  return typeof point.x === 'number' && Number.isFinite(point.x) &&
    typeof point.y === 'number' && Number.isFinite(point.y) &&
    typeof size.width === 'number' && Number.isFinite(size.width) && size.width > 0 &&
    typeof size.height === 'number' && Number.isFinite(size.height) && size.height > 0 &&
    (record.edge === FxEdge.NONE || record.edge === FxEdge.LEFT || record.edge === FxEdge.RIGHT ||
      record.edge === FxEdge.TOP || record.edge === FxEdge.BOTTOM);
}
export function copyRecord(record: FxPositionRecord): FxPositionRecord {
  return { version: record.version, position: { x: record.position.x, y: record.position.y },
    viewport: { width: record.viewport.width, height: record.viewport.height }, edge: record.edge };
}

/** Length-prefixed UTF-16 fields avoid delimiter/tag collisions. Stable for the installed scope. */
export function positionStorageKey(options: FxStorageOptions): string {
  const scope = options.scope === undefined ? FxScope.SCOPE : options.scope;
  if (typeof options.namespace !== 'string' || options.namespace.length === 0 ||
    typeof options.key !== 'string' || options.key.length === 0 ||
    (scope !== FxScope.SCOPE && scope !== FxScope.APP && scope !== FxScope.SYSTEM)) {
    throw new FxError('INVALID_CONFIG', 'Position storage requires namespace, scope and key');
  }
  return 'fx1:' + options.namespace.length + ':' + options.namespace + scope.length + ':' + scope +
    options.key.length + ':' + options.key;
}
