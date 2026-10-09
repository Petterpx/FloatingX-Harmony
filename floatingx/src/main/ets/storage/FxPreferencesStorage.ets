import preferences from '@ohos.data.preferences';
import common from '@ohos.app.ability.common';
import { FxPositionRecord } from '../core/FxTypes';
import { FxError } from '../core/FxError';
import { FxStorage, copyRecord, validRecord, storageError } from './FxStorage';

/** Opens an independent application-owned store. Every mutation awaits durable flush. */
export class FxPreferencesStorage implements FxStorage {
  private context: common.Context;
  private name: string;
  private opening?: Promise<preferences.Preferences>;
  private tail: Promise<void> = Promise.resolve();

  constructor(context: common.Context, name: string = 'floatingx_positions_v1') {
    this.context = context.getApplicationContext();
    this.name = name;
  }
  async load(key: string): Promise<FxPositionRecord | undefined> {
    try {
      const store = await this.open();
      const value = await store.get(key, '');
      if (typeof value !== 'string' || value.length === 0) return undefined;
      let record: FxPositionRecord;
      try { record = JSON.parse(value) as FxPositionRecord; } catch (_) { return undefined; }
      return validRecord(record) ? copyRecord(record) : undefined;
    } catch (error) { throw storageError(error as Error); }
  }
  save(key: string, value: FxPositionRecord): Promise<void> {
    if (!validRecord(value)) return Promise.reject(new FxError('STORAGE_FAILED', 'Invalid position record'));
    const encoded = JSON.stringify(copyRecord(value));
    return this.enqueue(async () => {
      const store = await this.open();
      await store.put(key, encoded);
      await store.flush();
    });
  }
  clear(key: string): Promise<void> {
    return this.enqueue(async () => {
      const store = await this.open();
      await store.delete(key);
      await store.flush();
    });
  }
  private async open(): Promise<preferences.Preferences> {
    if (this.opening === undefined) this.opening = preferences.getPreferences(this.context, this.name);
    try { return await this.opening; }
    catch (error) { this.opening = undefined; throw storageError(error as Error); }
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation).catch((error: Error) => { throw storageError(error); });
    this.tail = result.then(() => {}, () => {});
    return result;
  }
}
