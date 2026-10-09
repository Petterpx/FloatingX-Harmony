import { FxContent, FxController, FxConfig, FxScopePlatform, FloatingXHost,
  FxEdgeAdsorb, FxDisplayMode, FxAnimationCurve } from 'floatingx';

class ScopeContentParams {
  onButton: () => void;
  constructor(onButton: () => void) { this.onButton=onButton; }
}
@Builder
function scopeContent(params: ScopeContentParams) {
  Column({space:8}) {
    Text('拖动这里 / 点击 / 长按').height(40)
    Button('浮窗内按钮').onClick(params.onButton)
  }.width(220).height(110).padding(8).backgroundColor('#DDEEFF').borderRadius(12)
}

@Component
export struct ScopeDemo {
  @State private mounted: boolean = true;
  @State private message: string = 'API 12 局部浮窗';
  private platform: FxScopePlatform = new FxScopePlatform({dragArea:{x:0,y:0,width:220,height:48},
    onClick:() => { this.message='拖动区域点击'; },onLongPress:() => { this.message='拖动区域长按'; }});
  private config: FxConfig = new FxConfig({position:{x:20,y:100},animation:{enabled:true,durationMs:300,curve:FxAnimationCurve.EASE}});
  private controller: FxController = new FxController(this.platform,this.config);
  private content: FxContent<ScopeContentParams> = new FxContent<ScopeContentParams>(wrapBuilder(scopeContent),
    new ScopeContentParams(() => { this.message='浮窗内按钮点击'; }),{width:220,height:110});
  aboutToAppear(): void { this.run(this.controller.show()); }
  aboutToDisappear(): void { this.run(this.controller.cancel()); }
  private run(promise: Promise<void>): void { promise.catch((error: Error) => { this.message=error.message; }); }
  @Builder
  hostContent() {
    Column({space:8}) {
      Text(this.message)
      Button('浮窗外按钮').onClick(() => { this.message='浮窗外按钮点击'; })
    }.width('100%').height('100%').justifyContent(FlexAlign.End).padding(16)
  }
  build() {
    Column({space:8}) {
      Row({space:4}) {
        Button('显').onClick(() => this.run(this.controller.show()))
        Button('隐').onClick(() => this.run(this.controller.hide()))
        Button('卸载/重挂').onClick(() => { this.mounted=!this.mounted; })
        Button('取消').onClick(() => this.run(this.controller.cancel()))
      }
      Row({space:4}) {
        Button('左').onClick(() => { this.config.edgeAdsorb=FxEdgeAdsorb.LEFT; this.run(this.controller.updateConfig(this.config)); })
        Button('右').onClick(() => { this.config.edgeAdsorb=FxEdgeAdsorb.RIGHT; this.run(this.controller.updateConfig(this.config)); })
        Button('上').onClick(() => { this.config.edgeAdsorb=FxEdgeAdsorb.TOP; this.run(this.controller.updateConfig(this.config)); })
        Button('下').onClick(() => { this.config.edgeAdsorb=FxEdgeAdsorb.BOTTOM; this.run(this.controller.updateConfig(this.config)); })
      }
      Row({space:4}) {
        Button('半隐藏').onClick(() => { this.config.halfHide=!this.config.halfHide; this.run(this.controller.updateConfig(this.config)); })
        Button('透传').onClick(() => { this.config.displayMode=this.config.displayMode===FxDisplayMode.DisplayOnly ? FxDisplayMode.Normal:FxDisplayMode.DisplayOnly; this.run(this.controller.updateConfig(this.config)); })
        Button('动画移动').onClick(() => this.run(this.controller.move(50,200,true)))
      }
      if(this.mounted) {
        FloatingXHost({controller:this.controller,platform:this.platform,content:this.content,host:this.hostContent})
          .layoutWeight(1)
      } else { Text('宿主已卸载，显隐意图保留').layoutWeight(1) }
    }.width('100%').height('100%')
  }
}
