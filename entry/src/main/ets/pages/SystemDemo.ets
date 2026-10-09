import { FxGeometryInput } from 'floatingx/src/main/ets/geometry/FxGeometry';
import common from '@ohos.app.ability.common';
import { FxNativeWindowFactory, FxSystemPlatform, FxAppPlatform, FxWindowHost, FxContent, FxController, FxConfig, FxDisplayMode, FxInteractions } from 'floatingx';
class SystemContentParams {close: () => void;constructor(close: () => void) {this.close=close;}}
@Builder
function systemContent(params: SystemContentParams) {
  Column() {Text('系统浮窗：拖动标题').height(40);Button('关闭').onClick(params.close)}.width(220).height(90).backgroundColor('#FFEACA').borderRadius(12)
}
@Component
export struct SystemDemo {
  @State private message: string = 'SYSTEM_FLOAT_WINDOW 在商业 HarmonyOS V5 限批准的 2in1 场景；手机/平板授权未验收';
  private controller?: FxController;
  private platform?: FxSystemPlatform;
  private async open(fallback: boolean): Promise<void> {
    if(this.controller!==undefined)await this.controller.cancel();
    const content=new FxContent<SystemContentParams>(wrapBuilder(systemContent),new SystemContentParams(() => {this.controller?.cancel().catch((error: Error) => {this.message=error.message;});}),{width:220,height:90});
    const interactions: FxInteractions={dragArea:{x:0,y:0,width:220,height:40}};
    const factory=new FxNativeWindowFactory(this.getUIContext().getHostContext() as common.UIAbilityContext,content,interactions);
    const input: FxGeometryInput={viewport:{size:{width:300,height:500},insets:{left:0,top:0,right:0,bottom:0}},content:content.size,config:new FxConfig()};
    const platform=new FxSystemPlatform(factory,input,fallback ? () => {
      const host=this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost');
      if(host===undefined)throw new Error('App fallback requires a loaded WindowHost');return new FxAppPlatform(host,content,{mode:'blacklist',names:[]},interactions);
    }:undefined,(event) => {this.message='actualScope='+event.actualScope+'; '+event.error?.message;});
    const controller=new FxController(platform,new FxConfig({position:{x:20,y:100},adsorb:false}),(event) => {if(event.error!==undefined)this.message=event.error.code+': '+event.error.message;});
    platform.bindController(controller);
    // Bind owner teardown only; system visibility is independent of app foreground/page.
    this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost')?.bind(controller);
    this.platform=platform;this.controller=controller;
    await controller.show();this.message='actualScope='+platform.actualScope;
  }
  private run(promise: Promise<void>): void {promise.catch((error: Error) => {this.message=error.message;});}
  build() {Column({space:12}) {
    Text(this.message)
    Button('显示系统浮窗（不降级）').onClick(() => this.run(this.open(false)))
    Button('显示；权限/能力失败时允许 app 降级').onClick(() => this.run(this.open(true)))
    Button('DisplayOnly：跨应用透传验收').onClick(() => {if(this.controller!==undefined)this.run(this.controller.updateConfig(new FxConfig({displayMode:FxDisplayMode.DisplayOnly})));})
    Button('关闭').onClick(() => {if(this.controller!==undefined)this.run(this.controller.cancel());})
  }.width('100%').padding(16)}
}
