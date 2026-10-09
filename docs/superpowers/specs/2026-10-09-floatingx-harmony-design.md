# FloatingX 鸿蒙原生版设计规格

日期：2026-10-09
状态：用户于 2026-10-09 确认本文，实施计划已确认并开始实现；用户最新确认最低兼容版本为 API 12。

## 1. 目标与依据

为 FloatingX 提供 HarmonyOS NEXT 原生 ArkTS / ArkUI 版本，交付可复用 HAR 库、示例 App 和中文接入文档。用户已确认首版覆盖局部、应用内、系统三种浮窗，并明确要求建立独立鸿蒙仓库。新仓库位于 `/Users/petterp/Documents/HarmonyOS/FloatingX`，Android 原仓库仅作为只读参考。

Android 基线为当前源码：`floatingx-core`、`floatingx-app`、`floatingx-scope`、`floatingx-system`、`floatingx-compose`。现有 README 仍含旧入口，移植以源码行为及本文明确的鸿蒙语义为准。不在 Android 仓库新增或修改任何文件。

首版面向手机、平板的 Stage 模型，最低目标 API 12。实际编译使用支持该兼容级别的 HarmonyOS SDK，基线为 HarmonyOS 5.0.0(12)，可使用更高版本 SDK 编译但保留最低兼容 API 12。不承诺旧鸿蒙 Java UI、Android APK、跨进程共享控制器或所有设备形态行为一致。

## 2. 工程与职责

```text
FloatingX/                  独立鸿蒙仓库根目录
  floatingx/                 HAR 模块，单包交付
    Index.ets               公共 API
    src/main/ets/
      core/                 控制器、注册表、状态与错误
      geometry/             坐标、边界、定位与吸附算法
      component/            ArkUI 内容容器与手势
      scope/                局部宿主
      app/                  应用窗口浮层适配
      system/               系统窗口适配
      storage/              位置存储接口及 Preferences 适配
  entry/                    示例 App
  README.md                 接入、权限、限制与验收方法
```

首版采用一个 HAR，内部按职责隔离，降低接入和版本管理成本。包内包含 system 实现不等于宿主必须声明系统浮窗权限；只有使用系统浮窗的宿主需要配置相应权限。ArkUI 是统一内容层，不额外设置 Compose 对应模块。

## 3. 公共接口契约

保留熟悉的入口名称，不模拟 Android View、Context、Activity 或 Kotlin DSL。

| API | 契约 |
| --- | --- |
| `FloatingX.installApp(options)` | 创建并注册应用内控制器；传入所属 WindowStage / UIContext 的宿主适配对象 |
| `FloatingX.installSystem(options)` | 创建并注册系统控制器；传入 UIAbilityContext、内容及窗口尺寸配置 |
| `FloatingX.createScope(options)` | 创建局部控制器，交给 `FloatingXHost` 挂载；不进入全局 tag 注册表 |
| `control(tag)` / `controlOrNull(tag)` | 查询已注册的 app / system 实例；前者未找到时抛出明确错误 |
| `isInstalled` / `getAllTags` | 查询注册状态；tags 返回副本 |
| `uninstall` / `uninstallAll` | 异步销毁目标并释放注册记录，返回 Promise |
| `show` / `hide` / `cancel` | 三种控制器统一返回 Promise；完成后状态与实际挂载结果一致 |
| `move` / `moveByVector` | 按 vp 输入坐标，可指定动画；返回 Promise |
| `getX` / `getY` / `isShow` | 同步读取已提交位置与实际可见状态 |
| `updateConfig` / `updateContent` | 运行时变更可更新项，返回 Promise；不允许原地改变 scope 类型或所属宿主 |
| `setPage` | app 宿主报告当前页面标识，供页面过滤使用 |

app / system 共用 tag 命名空间。重复 tag 默认报 `DUPLICATE_TAG`，防止静默销毁现有窗口；替换通过显式 await uninstall 后再 install 完成。这是相对 Android 当前自动替换行为的有意差异，迁移文档必须说明。

内容以 Builder + 参数提供；参数更新经内容适配器触发 UI 更新，不向调用方暴露内部节点。系统浮窗通过独立 UIContext 挂载同样的内容组件，不把主窗口中的 ComponentContent 实例跨窗口复用。确切 ArkTS 泛型签名在实施阶段通过真实 SDK 编译确定。

## 4. 三种宿主行为

### 局部浮窗

`FloatingXHost` 作为局部 Stack 宿主，持有布局尺寸和浮窗层。移动范围以宿主内容区域为准，超出部分按容器裁剪；空白浮层不拦截底层点击。宿主消失时取消手势并脱离内容，控制器保留显隐意图和位置；再次挂载恢复。宿主业务结束由拥有者调用 cancel，示例明确演示释放位置。

### 应用内浮窗

使用 OverlayManager + ComponentContent，绑定一个 WindowStage 对应的 UIContext，可跨该窗口内页面显示。首版不自动追踪所有 UIAbility：多窗口各自安装独立 tag；跨 Ability 的业务可在宿主层明确移交状态。

宿主报告窗口前后台、销毁及页面切换。库提供集中接入的生命周期适配器，router / Navigation 示例分别演示 setPage。窗口后台、页面不允许展示时暂时隐藏，但保留用户 show 意图；用户主动 hide 后，页面或窗口变化不得重新显示。WindowStage 销毁时取消控制器并清理资源。

页面过滤采用互斥模式：黑名单模式允许其他页面；白名单模式只允许名单内页面。未知页面在白名单模式下隐藏，在黑名单模式下允许。应用内浮层位于页面之上、Dialog 等弹层之下，不承诺覆盖系统弹框。

### 系统浮窗

API 12 的商业 HarmonyOS 支持受发行权限政策约束：[华为 V5 受限开放权限文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/restricted-permissions-V5)将 `SYSTEM_FLOAT_WINDOW` 标为系统授权，并限定特定 2in1 场景申请。因此首版实现系统适配器和明确失败/显式降级语义，不把手机、平板上的系统浮窗声明为已支持。公开 OpenHarmony SDK 编译不能替代该授权与设备验证；系统示例提供明确关闭入口。

通过 window.createWindow 创建 TYPE_FLOAT 窗口，设置大小、位置、背景和触摸属性，加载 ArkUI 内容。初始尺寸显式提供，内容尺寸更新经窗口适配器同步；避免用全屏透明窗口截获其他应用触摸。

首次 show 检查权限及设备支持情况。权限配置、授权或受限权限申请由宿主按目标 HarmonyOS SDK 和发布要求完成；库提供检查结果及宿主处理回调，不擅自拉起设置页。失败默认 reject。仅当显式启用 app fallback 且提供有效 app 宿主时才降级，回调报告实际 scope 与失败原因，原系统窗口必须先清理。

系统浮窗可以随所属应用退至后台继续显示，但不提供进程保活保证。其生命周期由安装时指定的 UIAbility 拥有者管理，销毁时显式释放。窗口系统可能调整位置或限制屏幕外移动，控制器以回读结果校正状态。

系统模式的半隐藏采用窗口边缘裁剪内容、同步可见尺寸和命中区域的方式设计，不依赖系统允许负坐标。四个边缘的展开与收起必须设备验收；若目标设备无法提供该能力，应返回明确能力错误，不静默声称已经半隐藏。

## 5. 通用交互与配置

- 支持初始定位、九宫格 gravity、偏移、四边 margin、六种吸附方向、越界回弹、半隐藏、显示模式、动画、点击与长按、拖动事件、日志、位置存储。
- 使用显式可选坐标区分“未设置”与 `(0, 0)`，不复制 Android 用零值判断未设置的歧义。
- `Normal` 允许移动和点击；`ClickOnly` 禁止移动；`DisplayOnly` 禁止内容交互并透传触摸。子组件交互、拖动阈值和点击取消必须联调验证。
- 同一时刻只跟踪一个主触点；新增手指不跳变位置，主触点离开或触摸取消时结束拖动，不把取消事件作为点击。提供拖动区域配置，便于按钮等子组件保留交互。
- 拖动释放后先恢复合法边界，再按配置吸附及半隐藏。吸附默认启用，方向为左右就近；半隐藏默认关闭，比例范围为 0 至 0.9。无效数值、NaN 和负尺寸在配置入口拒绝。
- show / hide / move 支持默认动画及自定义动画配置；新操作、拖动、cancel 必须中断旧动画，并防止过期完成回调写回状态。
- 视图与窗口生命周期事件包括 attach、visible、hidden、detach、destroy；失败走 error 回调及 Promise rejection。每次实际转换只发一次对应事件。

## 6. 坐标、边界与存储

对外统一 vp。scope 坐标原点是局部宿主内容区；app 是所属主窗口浮层坐标系；system 是所属显示屏坐标系。系统窗口 API 使用 px 时只在适配器边界转换；按对应 UIContext 的密度换算，避免误用其他窗口的全局密度。

可移动范围由宿主尺寸、安全区域、margin、内容尺寸计算。内容大于宿主时采用确定的边界位置，禁止出现反向区间或 NaN。旋转、分屏、窗口缩放、避让区域变化时重算范围，保留贴边方向与另一轴的相对位置，再夹取合法坐标。

存储接口支持异步 load / save / clear；提供内存实现及 Preferences 实现。默认关闭持久化。键由业务命名空间、scope 和 tag 组成，局部实例由业务提供存储键。保存位置、宿主尺寸、贴边方向和结构版本；恢复时根据新范围修正。首次恢复结束前不闪现旧位置；拖动结束、程序移动完成时合并保存，不按每帧写盘。存储失败上报但不阻断浮窗可用性。

## 7. 状态与资源管理

控制器区分用户显隐意图与实际状态：`idle / showing / visible / hidden / destroying / destroyed`。窗口前后台与页面过滤仅影响实际显示。异步失败恢复到可重试的稳定状态，不把尚未成功的窗口标成 visible。

每个控制器使用操作队列串行处理窗口调用，并使用世代号使过期异步结果失效。高频 move 合并为最新目标，hide / cancel 不被大量拖动任务长期阻塞。cancel 立即撤销显示意图，任何迟到的 create 结果都必须销毁。

show / hide 可重复调用，cancel 幂等；cancel 后 show / move 返回 `DESTROYED`。取消过程无论成功或失败都清理本地注册、监听、计时器、节点引用；原生窗口销毁失败单独上报，不能吞掉错误或报告原生释放成功。

错误至少区分：非法配置、重复 tag、无有效宿主、控制器已销毁、权限拒绝、能力不支持、窗口操作失败、存储失败。平台错误保留原始 code，日志不包含凭证或业务内容。

## 8. 验收与交付标准

| 验证层 | 必须覆盖 |
| --- | --- |
| 核心自动测试 | 边界、六种吸附、零坐标、半隐藏比例、超大内容、恢复位置、旋转缩放 |
| 生命周期测试 | show/hide 交错、创建中 cancel、重复 cancel、重复 tag、页面过滤、宿主销毁、原生错误回收 |
| 工具链编译 | 真实 HarmonyOS SDK 的 ArkTS 检查、HAR 构建、示例 HAP 构建 |
| 应用内与局部实测 | 拖动不误触、双指取消、子按钮、空白区透传、跨页面、前后台、旋转、键盘、安全区、多实例 |
| 系统实测 | 未授权错误、授权后跨应用显示、移动与尺寸、四边半隐藏、DisplayOnly 透传、销毁、显式降级 |

示例 App 提供三种浮窗入口、位置/吸附/半隐藏开关、页面过滤演示及多实例管理。中文文档给出最短接入、生命周期接线、权限配置、API 对照和已验证设备/SDK 清单。

初始检查时本机只有 Huawei OpenHarmony API 9 SDK，未发现 DevEco Studio。实施中已取得官方 OpenHarmony API 12 SDK 并完成早期骨架编译；用户最新确认最低兼容 API 12。该工具链可验证公开 API 12 的 ArkTS/HAR/HAP 编译，商业 HarmonyOS SDK 与设备验证仍分别报告。实施时补齐或定位适用工具链；没有对应环境时，分别报告源码、核心测试、真实编译和设备验收状态，不用 TypeScript 或模拟测试替代 ArkTS/HAR 编译结论。

完成开发的标准是实现与测试满足本文契约；完成平台交付还须真实 SDK 构建与对应设备验收。受设备或权限条件阻塞的项目保持未验收，不标记为功能已通过。

## 9. 首版范围边界

本次包含全部三种浮窗实现、示例和文档，不发布 OHPM、不更改 Android 实现、不复制 Android XML/View/Compose 接入、不移植特定 Android 厂商修复。键盘支持使用鸿蒙宿主避让能力，系统输入法深度适配和任意输入控件焦点策略不在首版承诺内。

## 10. 参考资料

- Android 参考仓库 `/Users/petterp/Documents/Android/kotlin/model/FloatingX`：FloatingX.kt、IFxControl.kt、FxBasisConfig.kt、FxViewLocationHelper.kt、FxViewTouchHelper.kt，以及 app / scope / system 各自的配置和入口。
- [OpenHarmony 官方 OverlayManager API](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkui/arkts-apis-uicontext-overlaymanager.md)：API 12 基础接口、浮层层级、安全区行为。
- [OpenHarmony 官方 Stage 窗口开发](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/windowmanager/application-window-stage.md)：TYPE_FLOAT、生命周期及平台权限约束。
- OpenHarmony 文档作为公开接口依据；HarmonyOS NEXT 的发行版权限要求与工具链兼容性，实施时还须用目标 SDK 及华为对应文档核对，不能直接等同两者的权限政策。
