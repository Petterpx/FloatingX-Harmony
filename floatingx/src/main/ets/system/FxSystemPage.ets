import { FxFloatView } from '../component/FxFloatView';
import { FxSystemPageRegistry, FxSystemPageView } from './FxWindowAdapter';
@Entry({routeName:'FloatingXSystemPage',useSharedStorage:true})
@Component
export struct FloatingXSystemPage {
  @LocalStorageProp('fxSystemInstanceId') private instanceId: string = '';
  @State private revision: number = 0;
  private view?: FxSystemPageView;
  private release?: () => void;
  aboutToAppear(): void {
    const entry=FxSystemPageRegistry.find(this.instanceId);if(entry===undefined)return;
    const view=new FxSystemPageView(entry.owner,this.getUIContext(),entry.source,entry.interactions);this.view=view;
    this.release=view.subscribe(() => {this.revision++;});
    view.create().catch((error: Error) => entry.owner.reportError(error));
  }
  aboutToDisappear(): void {const view=this.view;this.view=undefined;try{if(this.release!==undefined)this.release();}finally{this.release=undefined;if(view!==undefined)view.destroy().catch((error: Error) => {const entry=FxSystemPageRegistry.find(this.instanceId);entry?.owner.reportError(error);});}}
  build() {Stack({alignContent:Alignment.TopStart}) {if(this.view!==undefined){FxFloatView({platform:this.view,revision:this.revision})}}.width('100%').height('100%').backgroundColor(Color.Transparent).hitTestBehavior(HitTestMode.Transparent)}
}
