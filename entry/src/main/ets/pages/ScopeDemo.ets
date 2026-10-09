import { FloatingX, FxContent, FxControl, FxConfig, FloatingXHost,
  FxGravity, FxEdgeAdsorb, FxDisplayMode, FxAnimationCurve, FxMemoryStorage } from 'floatingx';
import { DemoPageOwner } from '../entryability/DemoOwner';
class ScopeContentParams {
  label: string; onButton: () => void;
  constructor(label: string,onButton: () => void) { this.label=label;this.onButton=onButton; }
}
@Builder
function scopeContent(params: ScopeContentParams) {
  Column({space:8}) {
    Text(params.label).height(40)
    Button('浮窗内按钮').onClick(params.onButton)
  }.width(220).height(110).padding(8).backgroundColor('#DDEEFF').borderRadius(12)
}
@Component
export struct ScopeDemo {
  @State private mounted: boolean = true;
  @State private message: string = 'API 12 局部浮窗';
  private gravities: FxGravity[] = [FxGravity.TOP_LEFT,FxGravity.TOP_CENTER,FxGravity.TOP_RIGHT,
    FxGravity.CENTER_LEFT,FxGravity.CENTER,FxGravity.CENTER_RIGHT,
    FxGravity.BOTTOM_LEFT,FxGravity.BOTTOM_CENTER,FxGravity.BOTTOM_RIGHT];
  private directions: FxEdgeAdsorb[] = [FxEdgeAdsorb.LEFT,FxEdgeAdsorb.RIGHT,FxEdgeAdsorb.TOP,FxEdgeAdsorb.BOTTOM,FxEdgeAdsorb.LEFT_RIGHT,FxEdgeAdsorb.TOP_BOTTOM];
  private config: FxConfig = new FxConfig({animation:{enabled:true,durationMs:300,curve:FxAnimationCurve.EASE}});
  // README scope snippet: this typed result owns updateContent parameter checking.
  @State private instance: number = 0;
  private pageOwner: DemoPageOwner = new DemoPageOwner();
  private control: FxControl<ScopeContentParams> = this.createControl();
  private createControl(): FxControl<ScopeContentParams> { return FloatingX.createScope({
    content:new FxContent(wrapBuilder(scopeContent),new ScopeContentParams('拖动标题 / 点击 / 长按',() => {this.message='内按钮点击';}),{width:220,height:110}),
    config:this.config,
    storage:{namespace:'demo',key:'scope',storage:new FxMemoryStorage()},
    interactions:{dragArea:{x:0,y:0,width:220,height:48},onClick:() => {this.message='标题点击';},onLongPress:() => {this.message='标题长按';}},
    events:(event) => {if(this.pageOwner.isActive() && event.error!==undefined)this.message=event.error.code+': '+event.error.message;}
  }); }
  private place(gravity: FxGravity): Promise<void> {
    return this.pageOwner.replace([() => {
      this.config.gravity=gravity;this.config.position=undefined;return this.createControl();
    }],(controls: FxControl<ScopeContentParams>[]) => {this.control=controls[0];this.instance++;});
  }
  aboutToAppear(): void {this.pageOwner.activate([this.control]);this.run(this.control.show());}
  aboutToDisappear(): void {this.run(this.pageOwner.close());}
  private run(promise: Promise<void>): void {promise.catch((error: Error) => {if(this.pageOwner.isActive())this.message=error.message;});}
  @Builder
  hostContent() { Column() {Text(this.message);Button('浮窗外按钮').onClick(() => {this.message='外按钮点击';})}.width('100%').height('100%').justifyContent(FlexAlign.End).padding(16) }
  build() {
    Column({space:4}) {
      Row({space:4}) {
        Button('显').onClick(() => this.run(this.control.show()))
        Button('隐').onClick(() => this.run(this.control.hide()))
        Button('卸载/重挂').onClick(() => {this.mounted=!this.mounted;})
        Button('取消').onClick(() => this.run(this.control.cancel()))
      }
      Text('九宫格初始位置（重建本实例）')
      Row() { ForEach(this.gravities,(gravity: FxGravity) => {Button(gravity).fontSize(9).onClick(() => {this.run(this.place(gravity));})},(gravity: FxGravity) => gravity) }
      Row() { ForEach(this.directions,(direction: FxEdgeAdsorb) => {Button(direction).fontSize(10).onClick(() => {this.config.edgeAdsorb=direction;this.run(this.control.updateConfig(this.config));})},(direction: FxEdgeAdsorb) => direction) }
      Row({space:4}) {
        Button('吸附开关').onClick(() => {this.config.adsorb=!this.config.adsorb;this.run(this.control.updateConfig(this.config));})
        Button('回弹开关').onClick(() => {this.config.rebound=!this.config.rebound;this.run(this.control.updateConfig(this.config));})
        Button('半隐藏').onClick(() => {this.config.halfHide=!this.config.halfHide;this.run(this.control.updateConfig(this.config));})
      }
      Slider({value:0.5,min:0,max:0.9,step:0.1}).onChange((value: number) => {this.config.halfHideRatio=value;this.run(this.control.updateConfig(this.config));})
      Row({space:4}) {
        Button('Normal').onClick(() => {this.config.displayMode=FxDisplayMode.Normal;this.run(this.control.updateConfig(this.config));})
        Button('ClickOnly').onClick(() => {this.config.displayMode=FxDisplayMode.ClickOnly;this.run(this.control.updateConfig(this.config));})
        Button('DisplayOnly').onClick(() => {this.config.displayMode=FxDisplayMode.DisplayOnly;this.run(this.control.updateConfig(this.config));})
      }
      Row({space:4}) {
        Button('动画开关').onClick(() => {this.config.animation.enabled=!this.config.animation.enabled;this.run(this.control.updateConfig(this.config));})
        Button('移动').onClick(() => this.run(this.control.move(50,200,true)))
        Button('向量').onClick(() => this.run(this.control.moveByVector(10,10,true)))
      }
      Row({space:4}) {
        Button('更新内容').onClick(() => this.run(this.control.updateContent(new ScopeContentParams('同节点更新内容',() => {this.message='更新后点击';}))))
        Button('清位置').onClick(() => this.run(this.control.clearPosition()))
        Button('读状态').onClick(() => {this.message=this.control.getState()+' '+this.control.getX()+','+this.control.getY()+' shown='+this.control.isShow();})
      }
      if(this.mounted) { ForEach([this.instance],(_instance: number) => {FloatingXHost({control:this.control,host:this.hostContent}).layoutWeight(1)},(instance: number) => instance.toString()) }
      else { Text('宿主已卸载，show 意图保留；cancel 才终止').layoutWeight(1) }
    }.width('100%').height('100%')
  }
}
