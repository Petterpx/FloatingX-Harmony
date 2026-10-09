import { UIContext } from '@ohos.arkui.UIContext';
import { ComponentContent } from '@ohos.arkui.node';
import { Content } from '@ohos.arkui.node';
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
  builder: WrappedBuilder<[T]>;
  private params: T;
  size: FxSize;
  constructor(builder: WrappedBuilder<[T]>, params: T, size: FxSize) { this.builder=builder; this.params=params; this.size=size; }
  create(context: UIContext): FxContentMount {
    const node = new ComponentContent<T>(context, this.builder, this.params);
    this.nodes.push(node);
    return new FxTypedMount<T>(node, () => {
      const index = this.nodes.indexOf(node);
      if (index >= 0) this.nodes.splice(index, 1);
    });
  }
  async update(params: T): Promise<void> {
    this.params = params;
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].update(params);
  }
}
