import { FLOATINGX_VERSION } from 'floatingx';

@Entry
@Component
struct Index {
  build() {
    Column({ space: 12 }) {
      Text('FloatingX')
        .fontSize(32)
        .fontWeight(FontWeight.Bold)
      Text(`版本 ${FLOATINGX_VERSION}`)
        .fontSize(20)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
