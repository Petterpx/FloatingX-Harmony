import { FxController } from './FxController';
import { FxError, FxUninstallFailure, FxUninstallError } from './FxError';

class FxRegistration {
  tag: string;
  controller: FxController;
  constructor(tag: string, controller: FxController) { this.tag = tag; this.controller = controller; }
}

/** App and system floats share one namespace; delayed cleanup is identity guarded. */
export class FxRegistry {
  private entries: Map<string, FxController> = new Map<string, FxController>();

  register(tag: string, controller: FxController): void {
    if (this.entries.has(tag)) throw new FxError('DUPLICATE_TAG', 'Float tag is already installed');
    this.entries.set(tag, controller);
  }

  control(tag: string): FxController {
    const controller = this.entries.get(tag);
    if (controller === undefined) throw new FxError('NOT_INSTALLED', 'Float tag is not installed');
    return controller;
  }

  controlOrNull(tag: string): FxController | undefined { return this.entries.get(tag); }

  getAllTags(): string[] {
    const tags: string[] = [];
    this.entries.forEach((_controller: FxController, tag: string) => { tags.push(tag); });
    return tags;
  }

  unregister(tag: string, expectedController: FxController): void {
    if (this.entries.get(tag) === expectedController) this.entries.delete(tag);
  }

  async uninstall(tag: string): Promise<void> {
    const controller = this.entries.get(tag);
    if (controller !== undefined) await this.release(new FxRegistration(tag, controller));
  }

  async uninstallAll(): Promise<void> {
    const snapshot: FxRegistration[] = [];
    this.entries.forEach((controller: FxController, tag: string) => { snapshot.push(new FxRegistration(tag, controller)); });
    const failures: FxUninstallFailure[] = [];
    const releases: Promise<void>[] = snapshot.map((registration: FxRegistration) =>
      this.release(registration).catch((error: Error) => { failures.push({tag: registration.tag, error: error instanceof FxError ? error : new FxError('WINDOW_OPERATION_FAILED', 'Float release failed')}); }));
    await Promise.all(releases);
    // Every controller reports its own error; the batch rejects after all releases settle.
    if (failures.length > 0) throw new FxUninstallError(failures);
  }

  private async release(registration: FxRegistration): Promise<void> {
    try { await registration.controller.cancel(); }
    finally { this.unregister(registration.tag, registration.controller); }
  }
}
