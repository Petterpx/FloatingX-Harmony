import { FxControlHandle } from 'floatingx';
/** UIAbility owns system controls independently of its app WindowHost. */
export class DemoOwner {
  private controls: FxControlHandle[] = [];
  add(control: FxControlHandle): void { this.controls.push(control); }
  async cancel(): Promise<void> {
    const controls=this.controls;this.controls=[];
    let failure: Error | undefined;
    for(let i=0;i<controls.length;i++) {try {await controls[i].cancel();}catch(error) {if(failure===undefined)failure=error as Error;}}
    if(failure!==undefined)throw failure;
  }
}

/** Page replacement queue: cancel immediately, allocate only for the current active epoch. */
export class DemoPageOwner {
  private active: boolean = false;
  private epoch: number = 0;
  private controls: FxControlHandle[] = [];
  private tail: Promise<void> = Promise.resolve();
  activate(controls: FxControlHandle[] = []): void {
    this.active=true;this.epoch++;
    for(let i=0;i<controls.length;i++)this.hold(controls[i]);
  }
  isActive(): boolean { return this.active; }
  hold(control: FxControlHandle): boolean {
    if(!this.active) {control.cancel().catch(() => {});return false;}
    if(!this.controls.includes(control))this.controls.push(control);
    return true;
  }
  close(): Promise<void> {
    this.active=false;this.epoch++;
    const controls=this.controls;this.controls=[];
    return this.cancelControls(controls);
  }
  replace<T extends FxControlHandle>(factories: (() => T)[], publish: (controls: T[]) => void): Promise<void> {
    if(!this.active)return Promise.resolve();
    const epoch=++this.epoch;
    const previous=this.controls;this.controls=[];
    // Cancellation starts synchronously, including interruption of an earlier pending show.
    // Observe cleanup now so an error cannot become unhandled while its queue turn waits.
    const cleanup=this.cancelControls(previous).then(() => undefined,(error: Error) => error);
    const result=this.tail.then(async () => {
      const failure=await cleanup;
      if(!this.current(epoch))return;
      if(failure!==undefined)throw failure;
      const controls: T[] = [];
      try {
        for(let i=0;i<factories.length;i++) {
          if(!this.current(epoch))break;
          const control=factories[i]();controls.push(control);
          // Own each allocation before the next factory or publishing user code can fail.
          if(this.current(epoch))this.hold(control);
        }
        if(!this.current(epoch)) {await this.cancelControls(controls);return;}
        publish(controls);
        if(!this.current(epoch)) {await this.cancelControls(controls);return;}
        const showing: Promise<void>[] = [];
        for(let i=0;i<controls.length && this.current(epoch);i++)showing.push(controls[i].show());
        await Promise.all(showing);
        if(!this.current(epoch))await this.cancelControls(controls);
      } catch(error) {
        this.controls=this.controls.filter((control: FxControlHandle) => !controls.some((owned: T) => owned===control));
        await this.cancelControls(controls).catch(() => {});
        if(this.current(epoch))throw error as Error;
      }
    });
    this.tail=result.then(() => {},() => {});
    return result;
  }
  private current(epoch: number): boolean {return this.active && this.epoch===epoch;}
  private async cancelControls(controls: FxControlHandle[]): Promise<void> {
    let failure: Error | undefined;
    const pending=controls.map((control: FxControlHandle) => control.cancel().catch((error: Error) => {if(failure===undefined)failure=error;}));
    await Promise.all(pending);
    if(failure!==undefined)throw failure;
  }
}
