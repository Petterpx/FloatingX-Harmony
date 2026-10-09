import common from '@ohos.app.ability.common';
import { FloatingX, FxWindowHost, FxContent, FxControl, FxConfig, FxDisplayMode, FxSystemFallback } from 'floatingx';
import { DemoOwner, DemoPageOwner } from '../entryability/DemoOwner';
class SystemContentParams {close: () => void;constructor(close: () => void) {this.close=close;}}
@Builder
function systemContent(params: SystemContentParams) {
  Column() {Text('系统浮窗：拖动标题').height(40);Button('关闭').onClick(params.close)}.width(220).height(90).backgroundColor('#FFEACA').borderRadius(12)
}
@Component
export struct SystemDemo {
  @State private message: string = '商业 HarmonyOS V5 限批准的 2in1 场景；手机/平板系统权限未验收';
  private pageOwner: DemoPageOwner = new DemoPageOwner();
  private control?: FxControl<SystemContentParams>;
  private open(allowFallback: boolean): Promise<void> {
    return this.pageOwner.replace([() => this.createSystemControl(allowFallback)],
      (controls: FxControl<SystemContentParams>[]) => {this.control=controls[0];});
  }
  private createSystemControl(allowFallback: boolean): FxControl<SystemContentParams> {
    let fallback: FxSystemFallback | undefined;
    if(allowFallback) {
      const host=this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost');
      if(host===undefined)throw new Error('显式 app 降级需要已加载的 WindowHost');
      fallback={host:host,pagePolicy:{mode:'blacklist',names:[]}};
    }
    // README system snippet. Context alone suffices when fallback is omitted.
    const control=FloatingX.installSystem({tag:'system-demo',
      context:this.getUIContext().getHostContext() as common.UIAbilityContext,
      content:new FxContent(wrapBuilder(systemContent),new SystemContentParams(() => {if(this.control!==undefined)this.run(this.control.cancel());}),{width:220,height:90}),
      size:{width:220,height:90},config:new FxConfig({position:{x:20,y:100},adsorb:false}),
      fallback:fallback,interactions:{dragArea:{x:0,y:0,width:220,height:40}},
      events:(event) => {if(this.pageOwner.isActive())this.message='actualScope='+event.actualScope+(event.error===undefined?'':'; '+event.error.code+': '+event.error.message);}});
    this.getUIContext().getSharedLocalStorage()?.get<DemoOwner>('fxSystemOwner')?.add(control);
    return control;
  }
  aboutToAppear(): void {this.pageOwner.activate();}
  aboutToDisappear(): void {this.run(this.pageOwner.close());}
  private run(promise: Promise<void>): void {promise.catch((error: Error) => {if(this.pageOwner.isActive())this.message=error.message;});}
  build() {Column({space:12}) {
    Text(this.message)
    Button('显示系统浮窗（不降级）').onClick(() => this.run(this.open(false)))
    Button('权限/能力失败时显式 app 降级').onClick(() => this.run(this.open(true)))
    Button('DisplayOnly：跨应用透传验收').onClick(() => {if(this.control!==undefined)this.run(this.control.updateConfig(new FxConfig({displayMode:FxDisplayMode.DisplayOnly})));})
    Button('隐藏（保留窗口）').onClick(() => {if(this.control!==undefined)this.run(this.control.hide());})
    Button('重新显示').onClick(() => {if(this.control!==undefined)this.run(this.control.show());})
    Button('关闭并销毁').onClick(() => {if(this.control!==undefined)this.run(this.control.cancel());})
  }.width('100%').padding(16)}
}
