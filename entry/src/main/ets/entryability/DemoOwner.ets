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
