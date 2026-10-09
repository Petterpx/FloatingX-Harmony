import { FxPoint, FxPositionRecord } from '../core/FxTypes';
import { FxGeometryInput, restore } from '../geometry/FxGeometry';
import { FxStorage, FxStorageOptions, FxStorageErrorCallback, copyRecord, validRecord,
  positionStorageKey, storageError } from './FxStorage';

class FxPendingSave {
  value: FxPositionRecord;
  epoch: number;
  completion?: Promise<void>;
  constructor(value: FxPositionRecord, epoch: number) { this.value = value; this.epoch = epoch; }
}

/** Restore revocation and ordered, coalesced writes are owned by one installed controller. */
export class FxPositionSession {
  private storage: FxStorage;
  private key: string;
  private onError: FxStorageErrorCallback;
  private revision: number = 0;
  private writeEpoch: number = 0;
  private closed: boolean = false;
  private moved: boolean = false;
  private tail: Promise<void> = Promise.resolve();
  private pending?: FxPendingSave;

  constructor(options: FxStorageOptions, onError: FxStorageErrorCallback) {
    this.storage = options.storage; this.key = positionStorageKey(options); this.onError = onError;
  }
  async restore(input: FxGeometryInput): Promise<FxPoint | undefined> {
    if (this.closed || this.moved) return undefined;
    const revision = this.revision;
    try {
      const record = await this.storage.load(this.key);
      if (this.closed || revision !== this.revision || record === undefined || !validRecord(record)) return undefined;
      return restore(record, input);
    } catch (error) {
      if (!this.closed) this.report(error as Error);
      return undefined;
    }
  }
  markUserMove(): void { this.revision++; this.moved = true; }
  save(record: FxPositionRecord): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (!validRecord(record)) { this.report(new Error('Invalid position record')); return Promise.resolve(); }
    const value = copyRecord(record);
    if (this.pending !== undefined && this.pending.completion !== undefined) {
      this.pending.value = value;
      return this.pending.completion;
    }
    const request = new FxPendingSave(value, this.writeEpoch);
    this.pending = request;
    request.completion = this.enqueue(async () => {
      if (this.pending === request) this.pending = undefined;
      if (!this.closed && request.epoch === this.writeEpoch) await this.storage.save(this.key, request.value);
    });
    return request.completion;
  }
  clear(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.revision++; this.writeEpoch++; this.pending = undefined;
    return this.enqueue(async () => { await this.storage.clear(this.key); });
  }
  close(): void { this.revision++; this.closed = true; this.pending = undefined; }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.tail.then(operation).catch((error: Error) => { if (!this.closed) this.report(error); });
    this.tail = result;
    return result;
  }
  private report(error: Error): void {
    try { this.onError(storageError(error)); } catch (_) { /* Diagnostics never block visibility or later writes. */ }
  }
}
