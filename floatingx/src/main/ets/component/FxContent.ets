import { UIContext } from '@ohos.arkui.UIContext';
import { ComponentContent } from '@ohos.arkui.node';
import { Content } from '@ohos.arkui.node';
import { FxError } from '../core/FxError';
import { FxSize } from '../core/FxTypes';

export interface FxContentMount { content: Content; dispose(): void; }
export interface FxContentSource { size: FxSize; create(context: UIContext): FxContentMount; }
class FxTypedMount<T extends Object> implements FxContentMount {
  content: ComponentContent<T>;
  private release: () => void;
  constructor(content: ComponentContent<T>, release: () => void) { this.content = content; this.release = release; }
  dispose(): void { this.release(); this.content.dispose(); }
}
/** Builder parameters remain typed; renderer receives the native non-generic Content base. */
export class FxContent<T extends Object> implements FxContentSource {
  private nodes: ComponentContent<T>[] = [];
  readonly builder: WrappedBuilder<[T]>;
  private params: T;
  size: FxSize;
  constructor(builder: WrappedBuilder<[T]>, params: T, size: FxSize) {
    if(builder===undefined || builder===null || typeof builder.builder!=='function' || params===undefined || params===null || typeof params!=='object' || size===undefined || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width<=0 || size.height<=0) {
      throw new FxError('INVALID_CONFIG','Content requires a wrapped builder, object parameters and positive vp size');
    }
    this.builder=builder;this.params=params;this.size={width:size.width,height:size.height};
  }
  create(context: UIContext): FxContentMount {
    const node = new ComponentContent<T>(context, this.builder, this.params);
    this.nodes.push(node);
    return new FxTypedMount<T>(node, () => {
      const index = this.nodes.indexOf(node);
      if (index >= 0) this.nodes.splice(index, 1);
    });
  }
  async update(params: T, valid: () => boolean = () => true): Promise<void> {
    // A microtask boundary gives synchronous cancel priority before any native update.
    await Promise.resolve();
    if (!valid()) throw new FxError('DESTROYED', 'Content update was canceled');
    this.params = params;
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].update(params);
  }
}
