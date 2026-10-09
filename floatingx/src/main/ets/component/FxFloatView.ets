import { FxScopeSnapshot, FxInteractions, FxScopePlatform } from '../scope/FxScopePlatform';
import { FxSize, FxDisplayMode } from '../core/FxTypes';

/** Shared view contract for scope/app/system adapters, preserving one gesture/geometry engine. */
export interface FxFloatViewAdapter {
  interactions: FxInteractions;
  getSnapshot(): FxScopeSnapshot;
  layoutContent(size: FxSize): void;
  handleTouch(event: TouchEvent): void;
}
@Component
export struct FxFloatView {
  platform: FxFloatViewAdapter = new FxScopePlatform();
  @Prop revision: number = 0;
  build() {
    if (this.platform.getSnapshot().content !== undefined) {
      Stack({ alignContent: Alignment.TopStart }) {
        Stack({ alignContent: Alignment.TopStart }) {
          ContentSlot(this.platform.getSnapshot().content!)
        }
        .onAreaChange((_old: Area, area: Area) => {
          this.platform.layoutContent({width:Number(area.width),height:Number(area.height)});
        })
        .position(this.platform.getSnapshot().projection.contentOffset)
        // A dedicated drag surface consumes clicks only inside the configured region.
        // Child buttons outside it remain native ArkUI controls.
        Stack() {}
          .width(this.platform.interactions.dragArea === undefined ? this.platform.getSnapshot().size.width : this.platform.interactions.dragArea.width)
          .height(this.platform.interactions.dragArea === undefined ? this.platform.getSnapshot().size.height : this.platform.interactions.dragArea.height)
          .position({x:(this.platform.interactions.dragArea === undefined ? 0:this.platform.interactions.dragArea.x)+this.platform.getSnapshot().projection.contentOffset.x,
            y:(this.platform.interactions.dragArea === undefined ? 0:this.platform.interactions.dragArea.y)+this.platform.getSnapshot().projection.contentOffset.y})
          .hitTestBehavior(HitTestMode.Block)
          .onTouch((event: TouchEvent) => this.platform.handleTouch(event))
      }
      .width(this.platform.getSnapshot().projection.visibleSize.width)
      .height(this.platform.getSnapshot().projection.visibleSize.height)
      .position(this.platform.getSnapshot().projection.position)
      .clip(true)
      .opacity(this.platform.getSnapshot().opacity)
      .visibility(this.platform.getSnapshot().visible ? Visibility.Visible:Visibility.Hidden)
      .hitTestBehavior(this.platform.getSnapshot().config.displayMode === FxDisplayMode.DisplayOnly ? HitTestMode.None:HitTestMode.Transparent)
    }
  }
}
