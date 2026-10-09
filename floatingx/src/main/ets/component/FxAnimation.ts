/** Native completions may arrive after cancellation; only the latest generation may commit. */
export class FxAnimation {
 private generation: number = 0;
 begin(): number { return ++this.generation; }
 cancel(): void { this.generation++; }
 isCurrent(token: number): boolean { return token === this.generation; }
}
