import { describe, it, expect } from '@ohos/hypium';
import { FloatingX, FxContent, FxConfig, FxError } from 'floatingx';
class TestParams {label: string = 'device contract';}
@Builder
function testContent(params: TestParams) {Text(params.label).width(50).height(50)}
export default function floatingXTest(): void {
  describe('FloatingXPublicAPI',() => {
    it('scopeIsUnregisteredAndCancelIsTerminal',0,async () => {
      const before=FloatingX.getAllTags();
      const control=FloatingX.createScope({content:new FxContent(wrapBuilder(testContent),new TestParams(),{width:50,height:50}),config:new FxConfig()});
      expect(FloatingX.getAllTags().length).assertEqual(before.length);
      await control.show();expect(control.isShow()).assertFalse();
      await control.cancel();await control.cancel();
      let code='';try {await control.updateContent(new TestParams());}catch(error) {code=(error as FxError).code;}
      expect(code).assertEqual('DESTROYED');
    });
    it('tagListIsDefensive',0,() => {
      const before=FloatingX.getAllTags().length;const tags=FloatingX.getAllTags();tags.push('forged');
      expect(FloatingX.getAllTags().length).assertEqual(before);
    });
  });
}
