import { FloatingX, FxContent, FxControl, FxConfig, FxWindowHost, FxGravity, FxPreferencesStorage, FxError, FxUninstallError } from 'floatingx';
class MultipleParams {tag: string;close: () => void;constructor(tag: string,close: () => void) {this.tag=tag;this.close=close;}}
@Builder
function multipleContent(params: MultipleParams) {Column() {Text(params.tag).height(40);Button('取消本实例').onClick(params.close)}.width(180).height(90).backgroundColor('#DAF5DD')}
@Component
export struct MultipleDemo {
  @State private message: string = '多 tag、白名单与 Preferences 位置保存';
  private first?: FxControl<MultipleParams>;
  private second?: FxControl<MultipleParams>;
  private create(tag: string,gravity: FxGravity): FxControl<MultipleParams> {
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
  private async open(): Promise<void> {
    if(this.first!==undefined)await this.first.cancel();if(this.second!==undefined)await this.second.cancel();
    this.first=this.create('multiple-first',FxGravity.TOP_LEFT);this.second=this.create('multiple-second',FxGravity.BOTTOM_RIGHT);
    await Promise.all([this.first.show(),this.second.show()]);this.inspect();
  }
  private inspect(): void {
    const optional=FloatingX.controlOrNull('absent');
    this.message=FloatingX.getAllTags().join(',')+'; first='+FloatingX.isInstalled('multiple-first')+'; absent='+(optional===undefined);
  }
  private run(promise: Promise<void>): void {promise.catch((error: Error) => {
    if(error instanceof FxUninstallError)this.message=error.failures.map((failure) => failure.tag+':'+failure.error.code).join(',');
    else this.message=error instanceof FxError?error.code+': '+error.message:error.message;
  });}
  aboutToAppear(): void {FloatingX.setLogger({error:(error: FxError) => {console.error('FloatingX demo '+error.code);}});}
  aboutToDisappear(): void {
    if(this.first!==undefined)this.run(this.first.cancel());if(this.second!==undefined)this.run(this.second.cancel());
    FloatingX.setLogger(undefined);
  }
  build() {Column({space:12}) {
    Text(this.message)
    Button('创建两个 tag').onClick(() => this.run(this.open()))
    Button('重复 tag 错误').onClick(() => {try {this.create('multiple-first',FxGravity.CENTER);}catch(error) {this.message=(error as FxError).code;}})
    Button('显示 first（tag 查找）').onClick(() => {try {this.run(FloatingX.control('multiple-first').show());}catch(error) {this.message=(error as FxError).code;}})
    Button('读取注册列表').onClick(() => this.inspect())
    Button('卸载 first').onClick(() => this.run(FloatingX.uninstall('multiple-first')))
    Button('卸载所有 app/system tag').onClick(() => this.run(FloatingX.uninstallAll()))
  }.width('100%').padding(16)}
}
