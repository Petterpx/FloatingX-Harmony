import { FxError } from '../core/FxError';
import { FxController } from '../core/FxController';
import { FxContentSource } from '../component/FxContent';
import { FxFloatView } from '../component/FxFloatView';
import { FxScopePlatform } from './FxScopePlatform';

@Component
export struct FloatingXHost {
  controller?: FxController = undefined;
  platform: FxScopePlatform = new FxScopePlatform();
  content?: FxContentSource = undefined;
  @BuilderParam host: () => void;
  @State private revision: number = 0;
  private release?: () => void;
  aboutToAppear(): void {
    if(this.controller===undefined || this.content===undefined) throw new FxError('INVALID_CONFIG','FloatingXHost requires controller and content');
    this.platform.bindController(this.controller);
    this.release=this.platform.subscribe(() => { this.revision++; });
    this.platform.mountHost(this.getUIContext(),this.content);
  }
  aboutToDisappear(): void {
    if(this.release!==undefined) this.release(); this.release=undefined;
    this.platform.unmountHost();
  }
  build() {
    Stack({alignContent:Alignment.TopStart}) {
      this.host()
      FxFloatView({platform:this.platform,revision:this.revision})
    }
    .width('100%')
    .height('100%')
    .clip(true)
    .onAreaChange((_old: Area, area: Area) => {
      this.platform.layoutHost({width:Number(area.width),height:Number(area.height)});
    })
  }
}
