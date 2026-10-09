import { FloatingX, FxWindowHost, FxContent, FxControl, FxConfig, FxMemoryStorage } from 'floatingx';
import { DemoPageOwner } from '../entryability/DemoOwner';
class AppContentParams {
  close: () => void;
  button: () => void;
  constructor(close: () => void, button: () => void) { this.close=close; this.button=button; }
}
@Builder
function appContent(params: AppContentParams) {
  Column({space:4}) {
    Text('应用浮窗：拖动标题').height(40)
    Row({space:4}) { Button('内按钮').onClick(params.button); Button('关闭').onClick(params.close) }
  }.width(240).height(100).backgroundColor('#E4F2FF').borderRadius(12)
}
@Component
export struct AppDemo {
  @LocalStorageLink('fxHostReady') @Watch('hostReady') private ready: boolean = false;
  @State private message: string = '等待主窗口加载';
  private host?: FxWindowHost;
  private pageOwner: DemoPageOwner = new DemoPageOwner();
  private controller?: FxControl<AppContentParams>;
  private paths: NavPathStack = new NavPathStack();
  aboutToAppear(): void {this.pageOwner.activate();this.hostReady();}
  private hostReady(): void {
    if(!this.pageOwner.isActive() || this.controller!==undefined || !this.ready) return;
    const host=this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost');
    if(host===undefined || !host.isValid()) return;
    this.host=host; host.setPage('Home');
    const content=new FxContent<AppContentParams>(wrapBuilder(appContent),new AppContentParams(
      () => { if(this.controller!==undefined) this.run(this.controller.cancel()); },() => { this.message='内按钮已点击'; }),{width:240,height:100});
    // README app snippet. WindowHost is created after WindowStage.loadContent.
    const controller=FloatingX.installApp({tag:'app-demo',host:host,content:content,
      config:new FxConfig({position:{x:20,y:120},adsorb:false}),
      pagePolicy:{mode:'blacklist',names:['Blocked']},
      storage:{namespace:'demo',storage:new FxMemoryStorage()},
      interactions:{dragArea:{x:0,y:0,width:240,height:40}}});
    if(!this.pageOwner.hold(controller))return;
    this.controller=controller;
    this.message='API 12 应用内浮窗'; this.run(controller.show());
  }
  aboutToDisappear(): void {this.run(this.pageOwner.close());}
  private run(promise: Promise<void>): void { promise.catch((error: Error) => {if(this.pageOwner.isActive())this.message=error.message;}); }
  @Builder
  destination(name: string) {
    NavDestination() {
      Column({space:12}) {
        Text(name==='Blocked' ? '黑名单 destination：暂时隐藏':'允许 destination：恢复显示')
        Button('返回').onClick(() => this.paths.pop())
      }
    }.title(name).onShown(() => { this.host?.setPage(name); })
  }
  build() {
    Navigation(this.paths) {
      Column({space:12}) {
        Text(this.message)
        Row({space:8}) {
          Button('显示').onClick(() => { if(this.controller!==undefined) this.run(this.controller.show()); })
          Button('隐藏').onClick(() => { if(this.controller!==undefined) this.run(this.controller.hide()); })
        }
        Button('取消').onClick(() => {if(this.controller!==undefined)this.run(this.controller.cancel());})
        Button('底层按钮').onClick(() => { this.message='底层按钮已点击'; })
        Button('原生 Dialog').onClick(() => this.getUIContext().showAlertDialog({title:'Dialog 应在浮窗上方',message:'验证遮挡与关闭后的按钮点击',confirm:{value:'关闭',action:() => {}}}))
        Button('router 黑名单页面').onClick(() => this.getUIContext().getRouter().pushUrl({url:'pages/FilteredPage'}))
        Button('Navigation 黑名单').onClick(() => this.paths.pushPath({name:'Blocked'}))
        Button('Navigation 允许页').onClick(() => this.paths.pushPath({name:'Allowed'}))
      }.width('100%').padding(16)
    }.navDestination(this.destination).title('应用浮窗').onAppear(() => this.host?.setPage('Home'))
      .onNavBarStateChange((shown: boolean) => { if(shown) this.host?.setPage('Home'); })
  }
}
