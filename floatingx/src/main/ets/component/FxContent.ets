import { UIContext } from '@ohos.arkui.UIContext';
import { ComponentContent } from '@ohos.arkui.node';
import { Content, NodeContent, FrameNode, LayoutConstraint } from '@ohos.arkui.node';
import { FxError } from '../core/FxError';
import { FxSize } from '../core/FxTypes';

export interface FxContentMount { content: Content; dispose(): void; measure?(): FxSize | undefined; observeSize?(listener: (size: FxSize) => void): void; }
export interface FxContentSource { size: FxSize; create(context: UIContext): FxContentMount; }
/** Own measurement tree keeps full content constraints independent of the clipped viewport. */
class FxContentFrame extends FrameNode {
  private reference: FxSize;
  constructor(context: UIContext, size: FxSize) {
    super(context);this.reference={width:context.vp2px(size.width),height:context.vp2px(size.height)};
  }
  onMeasure(constraint: LayoutConstraint): void {
    const full: LayoutConstraint={minSize:{width:0,height:0},
      maxSize:{width:Math.max(constraint.maxSize.width,this.reference.width),height:Math.max(constraint.maxSize.height,this.reference.height)},
      percentReference:this.reference};
    const size: FxSize={width:0,height:0};
    for(let i=0;i<this.getChildrenCount();i++) {
      const child=this.getChild(i);
      if(child!==null) {child.measure(full);const measured=child.getMeasuredSize();size.width=Math.max(size.width,measured.width);size.height=Math.max(size.height,measured.height);}
    }
    this.setMeasuredSize(size);
  }
}
class FxTypedMount<T extends Object> implements FxContentMount {
  content: NodeContent;
  private node: ComponentContent<T>;
  private frame: FrameNode;
  private disposed: boolean = false;
  private context: UIContext;
  private listener?: (size: FxSize) => void;
  private release: () => void;
  constructor(context: UIContext, node: ComponentContent<T>, size: FxSize, release: () => void) {
    this.node=node;this.release=release;this.context=context;
    this.content=new NodeContent();this.frame=new FxContentFrame(context,size);
    // ContentSlot mounts NodeContent; ComponentContent stays private and typed.
    try {this.frame.addComponentContent(node);this.content.addFrameNode(this.frame);
      this.frame.commonEvent.setOnSizeChange(() => {if(this.disposed)return;const size=this.measure();if(size!==undefined && this.listener!==undefined)this.listener(size);});
    }
    catch(error) {
      try {this.frame.commonEvent.setOnSizeChange(undefined);}
      finally {try {this.content.removeFrameNode(this.frame);} finally {this.frame.dispose();}}
      throw error as Error;
    }
  }
  measure(): FxSize | undefined {
    if(this.disposed)return undefined;
    const size=this.frame.getMeasuredSize();
    if(!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width<=0 || size.height<=0)return undefined;
    return {width:this.context.px2vp(size.width),height:this.context.px2vp(size.height)};
  }
  observeSize(listener: (size: FxSize) => void): void {if(!this.disposed)this.listener=listener;}
  dispose(): void {
    if(this.disposed) return;this.disposed=true;this.listener=undefined;
    let failure: Error | undefined;
    try {this.frame.commonEvent.setOnSizeChange(undefined);} catch(error) {failure=error as Error;}
    try {this.release();} catch(error) {if(failure===undefined)failure=error as Error;}
    try {this.content.removeFrameNode(this.frame);} catch(error) {if(failure===undefined)failure=error as Error;}
    // dispose(), unlike disposeTree(), does not recursively dispose our builder node.
    try {this.frame.dispose();} catch(error) {if(failure===undefined)failure=error as Error;}
    try {this.node.dispose();} catch(error) {if(failure===undefined)failure=error as Error;}
    if(failure!==undefined) throw failure;
  }
}
/** Builder parameters remain typed; renderer receives the native non-generic Content base. */
class FxTypedSource<T extends Object> implements FxContentSource {
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
    try {
      const mount=new FxTypedMount<T>(context,node,this.size,() => {
        const index=this.nodes.indexOf(node);if(index>=0)this.nodes.splice(index,1);
      });
      this.nodes.push(node);return mount;
    } catch(error) {node.dispose();throw error as Error;}
  }
  async update(params: T, valid: () => boolean = () => true): Promise<void> {
    // A microtask boundary gives synchronous cancel priority before any native update.
    await Promise.resolve();
    if (!valid()) throw new FxError('DESTROYED', 'Content update was canceled');
    this.params = params;
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].update(params);
  }
}

// Weak association keeps the native allocation protocol outside the consumer-visible class.
const sources: WeakMap<Object,FxContentSource> = new WeakMap();
export function contentSource<T extends Object>(content: FxContent<T>): FxContentSource {
  const source=sources.get(content);
  if(source===undefined)throw new FxError('INVALID_CONFIG','Content source is unavailable');
  source.size=content.size;return source;
}
/** Public typed builder/value surface; installed adapters exclusively own native mounts. */
export class FxContent<T extends Object> {
  readonly builder: WrappedBuilder<[T]>;
  size: FxSize;
  private source: FxTypedSource<T>;
  constructor(builder: WrappedBuilder<[T]>, params: T, size: FxSize) {
    this.source=new FxTypedSource<T>(builder,params,size);this.builder=builder;this.size=this.source.size;
    sources.set(this,this.source);
  }
  update(params: T, valid: () => boolean = () => true): Promise<void> {return this.source.update(params,valid);}
}
