/** Stable library error codes; platform details may be attached without business data. */
export class FxError extends Error {
  readonly code: string;
  readonly message: string;
  readonly platformCode?: number;

  constructor(code: string, message: string, platformCode?: number) {
    super(message);
    this.name = 'FxError';
    this.message = message;
    this.code = code;
    this.platformCode = platformCode;
  }
}

export interface FxUninstallFailure { tag: string; error: FxError; }
/** Cleanup has settled for every snapshot entry; failures retain tag and native code. */
export class FxUninstallError extends FxError {
  readonly failures: FxUninstallFailure[];
  constructor(failures: FxUninstallFailure[]) {
    super('UNINSTALL_FAILED', 'One or more floats could not be released', failures[0].error.platformCode);
    this.failures = failures.slice();
  }
}
