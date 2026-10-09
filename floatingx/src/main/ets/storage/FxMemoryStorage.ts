import { FxPositionRecord } from '../core/FxTypes';
import { FxStorage, copyRecord } from './FxStorage';

/** Instance-local storage, with no shared mutable record references. */
export class FxMemoryStorage implements FxStorage {
  private records: Map<string, FxPositionRecord> = new Map();
  async load(key: string): Promise<FxPositionRecord | undefined> {
    const value = this.records.get(key);
    return value === undefined ? undefined : copyRecord(value);
  }
  async save(key: string, value: FxPositionRecord): Promise<void> { this.records.set(key, copyRecord(value)); }
  async clear(key: string): Promise<void> { this.records.delete(key); }
}
