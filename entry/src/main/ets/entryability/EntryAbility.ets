/*
 * Copyright (c) 2023 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Adapted from the official Stage sample; only the page-loading lifecycle is retained.
import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';
import hilog from '@ohos.hilog';

import { FxWindowHost } from 'floatingx';

export default class EntryAbility extends UIAbility {
  private host?: FxWindowHost;
  private stageEpoch: number = 0;
  onWindowStageCreate(windowStage: window.WindowStage): void {
    const epoch=++this.stageEpoch;
    const storage=new LocalStorage(); storage.setOrCreate('fxHostReady',false);
    windowStage.loadContent('pages/Index',storage,(err) => {
      if(err.code) { hilog.error(0xFF00,'EntryAbility','Failed to load page: %{public}s',err.message); return; }
      if(epoch!==this.stageEpoch) return;
      FxWindowHost.create(windowStage,() => epoch===this.stageEpoch).then((host: FxWindowHost) => {
        if(epoch!==this.stageEpoch) { host.dispose().catch(() => {}); return; }
        this.host=host; storage.setOrCreate('fxWindowHost',host); storage.setOrCreate('fxHostReady',true);
      }).catch((error: Error) => { hilog.error(0xFF00,'EntryAbility','Host creation: %{public}s',error.message); });
    });
  }
  onWindowStageDestroy(): void {
    this.stageEpoch++; const host=this.host; this.host=undefined;
    if(host!==undefined) host.dispose().catch((error: Error) => { hilog.error(0xFF00,'EntryAbility','Host cleanup: %{public}s',error.message); });
  }
}
