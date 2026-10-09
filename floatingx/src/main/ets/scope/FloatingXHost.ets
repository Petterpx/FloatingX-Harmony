import { FxError } from '../core/FxError';
import { FxControlHandle } from '../FloatingX';
import { scopeHostBinding } from './FxHostBinding';
import { FxContentSource } from '../component/FxContent';
import { FxFloatView } from '../component/FxFloatView';
import { FxScopePlatform } from './FxScopePlatform';

@Component
export struct FloatingXHost {
  control?: FxControlHandle = undefined;
  private platform: FxScopePlatform = new FxScopePlatform();
  @BuilderParam host: () => void;
  @State private revision: number = 0;
  private release?: () => void;
  aboutToAppear(): void {
    const binding=this.control===undefined?undefined:scopeHostBinding(this.control);
    if(binding===undefined) throw new FxError('INVALID_CONFIG','FloatingXHost requires a live scope control');
    this.platform=binding.platform;
    this.platform.bindController(binding.controller);
    this.release=this.platform.subscribe(() => { this.revision++; });
    this.platform.mountHost(this.getUIContext(),binding.content);
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
