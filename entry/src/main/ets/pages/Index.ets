import { ScopeDemo } from './ScopeDemo';
import { AppDemo } from './AppDemo';
import { FxWindowHost } from 'floatingx';
@Entry({useSharedStorage:true})
@Component
struct Index {
  onPageShow(): void {
    const host=this.getUIContext().getSharedLocalStorage()?.get<FxWindowHost>('fxWindowHost');
    if(host!==undefined) host.setPage('Home');
  }
  build() {
    Tabs() {
      TabContent() { ScopeDemo() }.tabBar('局部')
      TabContent() { AppDemo() }.tabBar('应用')
    }.width('100%').height('100%')
  }
}
