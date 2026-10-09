import { FxWindowHost } from 'floatingx';
@Entry({useSharedStorage:true})
@Component
struct FilteredPage {
  onPageShow(): void { this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost')?.setPage('Blocked'); }
  build() {
    Column({space:16}) {
      Text('router 黑名单页面：浮窗暂隐')
      Button('返回允许页面').onClick(() => this.getUIContext().getRouter().back())
    }.width('100%').height('100%').justifyContent(FlexAlign.Center)
  }
}
