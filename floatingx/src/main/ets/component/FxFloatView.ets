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
  // Snapshot is adapter-owned, so every ArkUI expression must observe its revision.
  private currentSnapshot(_revision: number): FxScopeSnapshot { return this.platform.getSnapshot(); }
  build() {
    if (this.currentSnapshot(this.revision).content !== undefined) {
      Stack({ alignContent: Alignment.TopStart }) {
        Stack({ alignContent: Alignment.TopStart }) {
          ContentSlot(this.currentSnapshot(this.revision).content!)
        }
        .onAreaChange((_old: Area, area: Area) => {
          this.platform.layoutContent({width:Number(area.width),height:Number(area.height)});
        })
        .position(this.currentSnapshot(this.revision).projection.contentOffset)
        // A dedicated drag surface consumes clicks only inside the configured region.
        // Child buttons outside it remain native ArkUI controls.
        Stack() {}
          .width(this.platform.interactions.dragArea === undefined ? this.currentSnapshot(this.revision).size.width : this.platform.interactions.dragArea.width)
          .height(this.platform.interactions.dragArea === undefined ? this.currentSnapshot(this.revision).size.height : this.platform.interactions.dragArea.height)
          .position({x:(this.platform.interactions.dragArea === undefined ? 0:this.platform.interactions.dragArea.x)+this.currentSnapshot(this.revision).projection.contentOffset.x,
            y:(this.platform.interactions.dragArea === undefined ? 0:this.platform.interactions.dragArea.y)+this.currentSnapshot(this.revision).projection.contentOffset.y})
          .hitTestBehavior(HitTestMode.Block)
          .onTouch((event: TouchEvent) => this.platform.handleTouch(event))
      }
      .width(this.currentSnapshot(this.revision).projection.visibleSize.width)
      .height(this.currentSnapshot(this.revision).projection.visibleSize.height)
      .position(this.currentSnapshot(this.revision).projection.position)
      .clip(true)
      // None skips this node only; disabled state also suppresses native child buttons.
      .enabled(this.currentSnapshot(this.revision).config.displayMode !== FxDisplayMode.DisplayOnly)
      .opacity(this.currentSnapshot(this.revision).opacity)
      .visibility(this.currentSnapshot(this.revision).visible ? Visibility.Visible:Visibility.Hidden)
      .hitTestBehavior(this.currentSnapshot(this.revision).config.displayMode === FxDisplayMode.DisplayOnly ? HitTestMode.None:HitTestMode.Transparent)
    }
  }
}
