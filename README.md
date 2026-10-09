# FloatingX · HarmonyOS

原生 ArkTS / ArkUI 浮窗 HAR，最低兼容 **HarmonyOS 5.0.0(12)**。提供局部 scope、单主窗口 app、受平台权限约束的 system 三种模式；统一 vp 坐标、Promise 控制器、typed Builder 内容。

## 先选模式

| 模式 | 接入 | 生命周期 | 权限 |
| --- | --- | --- | --- |
| scope | `FloatingX.createScope` + `FloatingXHost` | 业务结束 cancel；宿主暂时卸载只 detach | 无系统浮窗权限 |
| app | `FloatingX.installApp` + `FxWindowHost` | 单 WindowStage；Host.dispose 释放拥有的控制器 | 无系统浮窗权限 |
| system | `FloatingX.installSystem` + UIAbilityContext | 拥有者显式 cancel；可独立于 app host | SYSTEM_FLOAT_WINDOW 及目标平台审批 |

system 实现不等于普通手机/平板可用。[华为 V5 受限权限文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/restricted-permissions-V5)将 SYSTEM_FLOAT_WINDOW 规定为 system_grant，限批准的 2in1 多方视频/屏幕共享场景。默认失败明确 reject；如希望降级，显式提供 app fallback。

## 安装 HAR

将构建的 `floatingx.har` 加入消费者模块的 OHPM 本地依赖，使用公开入口 `import { FloatingX, FxContent, FxConfig } from 'floatingx'`。HAR 不声明系统权限；仅使用 app/scope 的宿主不需要声明 SYSTEM_FLOAT_WINDOW。仓库 entry 是单独有权限的系统示例，不能用其运行结果替代无权限消费者验证。本项目未发布 OHPM。

```json
"dependencies": { "floatingx": "file:../floatingx.har" }
```

下面的代码直接摘自已经通过 API12 编译的 Demo；Builder、参数类和组件字段的完整定义位于链接的源文件。

## scope：局部宿主

[ScopeDemo.ets](entry/src/main/ets/pages/ScopeDemo.ets) 在组件里创建 typed 控制器，`aboutToAppear` 调 show，`aboutToDisappear` 调 cancel。Host 的 host Builder 是底层页面内容：

```ts
  private createControl(): FxControl<ScopeContentParams> { return FloatingX.createScope({
    content:new FxContent(wrapBuilder(scopeContent),new ScopeContentParams('拖动标题 / 点击 / 长按',() => {this.message='内按钮点击';}),{width:220,height:110}),
    config:this.config,
    storage:{namespace:'demo',key:'scope',storage:new FxMemoryStorage()},
    interactions:{dragArea:{x:0,y:0,width:220,height:48},onClick:() => {this.message='标题点击';},onLongPress:() => {this.message='标题长按';}},
    events:(event) => {if(event.error!==undefined)this.message=event.error.code+': '+event.error.message;}
  }); }
```

```ts
FloatingXHost({control:this.control,host:this.hostContent}).layoutWeight(1)
```

Host 暂时卸载/重挂保留显示意图；业务结束 cancel 才终止。`show()` 在宿主未挂载时可成功接受意图，实际状态仍 idle/hidden；`isShow()` 或 SHOW 事件才表示已显示。

## app：单主窗口浮层

[EntryAbility.ets](entry/src/main/ets/entryability/EntryAbility.ets) 在 `WindowStage.loadContent` 完成回调后调用 `FxWindowHost.create`，通过 LocalStorage 交给页面；调用时带有效性 guard，避免 Stage 销毁期间迟到创建。`onWindowStageDestroy` 调 Host.dispose。业务创建见 [AppDemo.ets](entry/src/main/ets/pages/AppDemo.ets)：

```ts
    const controller=FloatingX.installApp({tag:'app-demo',host:host,content:content,
      config:new FxConfig({position:{x:20,y:120},adsorb:false}),
      pagePolicy:{mode:'blacklist',names:['Blocked']},
      storage:{namespace:'demo',storage:new FxMemoryStorage()},
      interactions:{dragArea:{x:0,y:0,width:240,height:40}}});
```

router 页面和 Navigation destination 都应向该 Host 调 `setPage(name)`；示例的 Home/Blocked/Allowed 名称与 policy 一致。白名单只允许名单内页面，未知页面隐藏；黑名单允许其他页面。后台/页面过滤保留 show 意图；主动 hide 后不会自动重新展示。浮层未测量时 show 可暂时不可见，测量后自动恢复。

## system：权限与拥有者

[SystemDemo.ets](entry/src/main/ets/pages/SystemDemo.ets) 使用所属 UIAbilityContext，显式初始尺寸，并提供可见关闭按钮：

```ts
    const control=FloatingX.installSystem({tag:'system-demo',
      context:this.getUIContext().getHostContext() as common.UIAbilityContext,
      content:new FxContent(wrapBuilder(systemContent),new SystemContentParams(() => {if(this.control!==undefined)this.run(this.control.cancel());}),{width:220,height:90}),
      size:{width:220,height:90},config:new FxConfig({position:{x:20,y:100},adsorb:false}),
      fallback:fallback,interactions:{dragArea:{x:0,y:0,width:220,height:40}},
      events:(event) => {this.message='actualScope='+event.actualScope+(event.error===undefined?'':'; '+event.error.code+': '+event.error.message);}});
```

未启用 fallback 时不需要 app WindowHost。例子先验证 `fallback.host`，再创建 system 控制器；降级只处理权限/能力失败，先清理原系统资源，并以事件的 `actualScope` 和 error 告知原因。系统实例的 UIAbility 拥有者单独保存并取消自己的句柄，见 [DemoOwner](entry/src/main/ets/entryability/DemoOwner.ets)。

只有系统消费者在 `src/main/module.json5` 声明：

```json
"requestPermissions": [{"name":"ohos.permission.SYSTEM_FLOAT_WINDOW"}]
```

声明不是授权；宿主还须符合目标发行政策及签名/受限权限要求，库不弹权限请求或自动打开设置。

API12 无公开原生窗口 hide：system hide 隐藏内容、保持透明窗口、关闭 touch/focus；show 恢复交互，cancel 才销毁。阴影、焦点/触摸残留及跨应用透传仍须设备验收。

## 控制、内容与错误

- 工厂同步验证 options 并返回 `FxControl<T>`；窗口创建和系统权限检查推迟到首次 show。app/system tag 共用命名空间，重复同步抛 `DUPLICATE_TAG`；scope 不注册。
- show/hide/cancel/move/moveByVector/updateConfig/updateContent/clearPosition 返回 Promise，使用 catch 或 try/await。cancel 幂等、同步作废世代；取消后所有修改 reject DESTROYED。
- 保留工厂 typed 返回值以调用 updateContent；tag 查询 `control/controlOrNull` 只返回 `FxControlHandle`，不会把内容参数转换成任意类型。updateContent 更新原实例节点，成功意味着参数已提交，屏幕布局/绘制由 ArkUI 后续回测完成。
- `getX/getY/isShow/getState` 读取已提交状态。实际 ATTACH/DETACH 与 SHOW/HIDE 分开；scope 卸载/重挂不会产生 DESTROY。
- events 可返回 Promise；异步 rejection 和同步异常只进入已消毒的 EVENT_CALLBACK_FAILED 日志，不阻塞原生队列、不回滚成功操作、不递归发 ERROR。`setLogger` 为之后创建的控制器注入日志实现。
- uninstallAll 等待快照中每项清理，失败抛 FxUninstallError；failures 含 tag/FxError/platformCode。即使原生销毁失败，本地 tag/监听仍释放。新安装实例受身份保护。

## 配置与示例

[ScopeDemo](entry/src/main/ets/pages/ScopeDemo.ets) 包含九宫格重建定位、六种吸附方向/开关、回弹、半隐藏比例 0..0.9、三显示模式、显隐动画/移动、向量移动、同节点内容更新、点击/长按、状态读取、存储清除、宿主重挂和终止。

[AppDemo](entry/src/main/ets/pages/AppDemo.ets) 包含 router / Navigation 页面黑名单、原生 Dialog 层级及底层按钮。[MultipleDemo](entry/src/main/ets/pages/MultipleDemo.ets) 包含多个 tag、白名单、Preferences 保存、重复 tag、查找、逐项/全部卸载及日志注入。[SystemDemo](entry/src/main/ets/pages/SystemDemo.ets) 包含默认拒绝、显式降级、DisplayOnly、hide/show 与关闭入口。每个创建入口都有 cancel 及拥有者退出清理。

`Normal` 可移动和点击；`ClickOnly` 禁止移动；`DisplayOnly` 禁止内容交互并透传。通过 `interactions.dragArea` 划定标题拖动区，给子按钮留下原生交互区域。空白浮层透传、手势不误触及 Dialog 层级须设备验证。

存储默认关闭。支持 `FxMemoryStorage`、`FxPreferencesStorage` 或实现异步 load/save/clear 的 `FxStorage`；app/system storage 只指定 namespace 与 storage，键由安装 scope + tag 固定生成；scope 另外传业务 key。恢复在首次实际显示前进行，拖动结束或程序移动完成才保存；失败上报但不阻断可用性。system 降级保持安装时存储 scope。

## 验证边界

已完成公共契约/核心源码测试、官方 OpenHarmony 5.0.0 API12 严格 ArkTS 检查、HAR、全部示例 HAP、Hypium 测试 HAP 编译，并用独立无 SYSTEM_FLOAT_WINDOW 的项目安装实际 packaged HAR 后编译 app/scope 消费代码。上述构建不等于商业 HarmonyOS SDK 或设备验收。

当前商业 SDK 构建、有权限系统设备与 app/scope 设备运行仍由最终验收覆盖；本任务未签名、安装或操作设备，不声称三模式设备通过。详细工具链及检查矩阵见 [docs/toolchain.md](docs/toolchain.md)，迁移差异见 [docs/migration.md](docs/migration.md)。

```sh
npm install
npm run test:core
# 已配置目标 HarmonyOS SDK 的环境中：
npm run build:har
npm run build:hap
# Hypium 编译目标：
hvigorw --mode module -p module=entry@ohosTest -p product=default assembleHap --no-daemon
```

## 来源与许可

接口和行为参考 Petterp 的 Android FloatingX，本仓库为独立鸿蒙实现。MIT 许可证及原作者信息见 [LICENSE](LICENSE)，与原仓库文件逐字核对。Stage 示例中保留了适用的 Huawei Apache-2.0 头部；其余代码没有引入第三方库源码。Hypium 仅作为开发依赖。
