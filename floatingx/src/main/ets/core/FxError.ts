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
