import { ScopeDemo } from './ScopeDemo';
@Entry
@Component
struct Index {
  build() { Column() { ScopeDemo() }.width('100%').height('100%') }
}
