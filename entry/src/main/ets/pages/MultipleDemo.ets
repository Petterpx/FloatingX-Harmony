import { FloatingX, FxContent, FxControl, FxConfig, FxWindowHost, FxGravity, FxPreferencesStorage, FxError, FxUninstallError } from 'floatingx';
import { DemoPageOwner } from '../entryability/DemoOwner';
class MultipleParams {tag: string;close: () => void;constructor(tag: string,close: () => void) {this.tag=tag;this.close=close;}}
@Builder
function multipleContent(params: MultipleParams) {Column() {Text(params.tag).height(40);Button('取消本实例').onClick(params.close)}.width(180).height(90).backgroundColor('#DAF5DD')}
@Component
export struct MultipleDemo {
  @State private message: string = '多 tag、白名单与 Preferences 位置保存';
  private pageOwner: DemoPageOwner = new DemoPageOwner();
  private first?: FxControl<MultipleParams>;
  private second?: FxControl<MultipleParams>;
  private createFloats(tag: string,gravity: FxGravity): FxControl<MultipleParams> {
    const host=this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost');
    if(host===undefined)throw new FxError('NO_HOST','等待 WindowStage.loadContent 完成');
    host.setPage('Home');
    const context=this.getUIContext().getHostContext();
    if(context===undefined)throw new FxError('NO_HOST','UIAbility context unavailable');
    return FloatingX.installApp({tag:tag,host:host,
      content:new FxContent(wrapBuilder(multipleContent),new MultipleParams(tag,() => this.run(FloatingX.uninstall(tag))),{width:180,height:90}),
      config:new FxConfig({gravity:gravity}),pagePolicy:{mode:'whitelist',names:['Home']},
      storage:{namespace:'multiple-demo',storage:new FxPreferencesStorage(context)},
      interactions:{dragArea:{x:0,y:0,width:180,height:40}}});
  }
  private open(): Promise<void> {
    return this.pageOwner.replace([() => this.createFloats('multiple-first',FxGravity.TOP_LEFT),
      () => this.createFloats('multiple-second',FxGravity.BOTTOM_RIGHT)],(controls: FxControl<MultipleParams>[]) => {
      this.first=controls[0];this.second=controls[1];
    }).then(() => {if(this.pageOwner.isActive())this.inspect();});
  }
  private demonstrateDuplicate(): void {
    if(!this.pageOwner.isActive())return;
    if(this.first===undefined || FloatingX.controlOrNull('multiple-first')!==this.first) {
      this.message='请先创建两个 tag，再演示重复 tag';return;
    }
    try {
      const unexpected=this.createFloats('multiple-first',FxGravity.CENTER);
      if(this.pageOwner.hold(unexpected))this.first=unexpected;
    } catch(error) {this.message=(error as FxError).code;}
  }
  private inspect(): void {
    const optional=FloatingX.controlOrNull('absent');
    this.message=FloatingX.getAllTags().join(',')+'; first='+FloatingX.isInstalled('multiple-first')+'; absent='+(optional===undefined);
  }
  private run(promise: Promise<void>): void {promise.catch((error: Error) => {
    if(!this.pageOwner.isActive())return;
    if(error instanceof FxUninstallError)this.message=error.failures.map((failure) => failure.tag+':'+failure.error.code).join(',');
    else this.message=error instanceof FxError?error.code+': '+error.message:error.message;
  });}
  aboutToAppear(): void {this.pageOwner.activate();FloatingX.setLogger({error:(error: FxError) => {console.error('FloatingX demo '+error.code);}});}
  aboutToDisappear(): void {
    this.run(this.pageOwner.close());
    FloatingX.setLogger(undefined);
  }
  build() {Column({space:12}) {
    Text(this.message)
    Button('创建两个 tag').onClick(() => this.run(this.open()))
    Button('重复 tag 错误').onClick(() => this.demonstrateDuplicate())
    Button('显示 first（tag 查找）').onClick(() => {try {this.run(FloatingX.control('multiple-first').show());}catch(error) {this.message=(error as FxError).code;}})
    Button('读取注册列表').onClick(() => this.inspect())
    Button('卸载 first').onClick(() => this.run(FloatingX.uninstall('multiple-first')))
    Button('卸载所有 app/system tag').onClick(() => this.run(FloatingX.uninstallAll()))
  }.width('100%').padding(16)}
}
