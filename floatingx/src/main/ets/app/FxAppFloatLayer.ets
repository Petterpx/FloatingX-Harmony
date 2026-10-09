import { UIContext } from '@ohos.arkui.UIContext';
import { ComponentContent } from '@ohos.arkui.node';
import { FxFloatView } from '../component/FxFloatView';
import { FxAppPlatform } from './FxAppPlatform';
export class FxAppLayerParams {
  platform: FxAppPlatform;
  revision: number;
  constructor(platform: FxAppPlatform, revision: number = 0) { this.platform=platform; this.revision=revision; }
}
@Builder
function appLayer(params: FxAppLayerParams) {
  Stack({alignContent:Alignment.TopStart}) {
    FxFloatView({platform:params.platform,revision:params.revision})
  }
  .width('100%').height('100%').align(Alignment.TopStart)
  .hitTestBehavior(HitTestMode.Transparent)
  .onAreaChange((_old: Area, area: Area) => params.platform.layoutHost({width:Number(area.width),height:Number(area.height)}))
}
export function createAppLayer(context: UIContext, platform: FxAppPlatform): ComponentContent<FxAppLayerParams> {
  return new ComponentContent<FxAppLayerParams>(context,wrapBuilder(appLayer),new FxAppLayerParams(platform));
}
