# Android → HarmonyOS 迁移

本仓库是 FloatingX 的原生 ArkTS / ArkUI 实现，采用一个 HAR，最低兼容 HarmonyOS 5.0.0(12)。Android 原仓库保持独立；这里不复用 Android View、XML、Compose 或厂商修复代码。

| Android 接入习惯 | HarmonyOS 接入 |
| --- | --- |
| View / Compose 内容 | `FxContent<T>(wrapBuilder(builder), params, size)`；Builder 参数保留类型，系统窗口创建自己的内容节点 |
| Activity / Application 窗口上下文 | app 使用已加载的 `FxWindowHost`；system 使用所属 `UIAbilityContext`；scope 使用 `FloatingXHost` |
| Kotlin DSL | `FxConfig`、明确的工厂 options 对象 |
| 创建后立即展示 | 工厂同步返回控制器、同步验证配置；首次 `show()` 才开始访问窗口 / 系统权限 |
| 同名 tag 替换旧实例 | app/system 共用命名空间；重复立即抛 `DUPLICATE_TAG`。显式 `await uninstall(tag)` 后再安装 |
| 同步显隐/移动 | `show/hide/cancel/move/moveByVector/updateConfig/updateContent` 返回 Promise；捕获 rejection |
| 零值可能代表未设置 | `(0,0)` 是有效位置；只有 `position: undefined` 表示使用 gravity |
| 全局窗口管理 | app 实例绑定单个 WindowStage；多窗口各自建 host / tag，业务自行移交状态 |
| 从 tag 找到任意内容再更新 | `control(tag)` 返回 `FxControlHandle`，只提供生命周期/配置操作；保留工厂的 `FxControl<T>` 才能类型安全地更新内容 |
| 系统悬浮窗权限弹窗 | `SYSTEM_FLOAT_WINDOW` 是受限 system_grant；库检查结果并 reject，宿主按发行政策办理权限，不自动打开设置 |

## 拥有者与 Promise

scope 宿主暂时卸载会 detach 并隐藏，保留 show 意图；重新挂载恢复。结束业务时拥有者调用 `cancel()`。app 的 WindowStage 加载完成后创建 Host，销毁时 `dispose()`。system 拥有者在 UIAbility / WindowStage 结束时显式取消自己安装的控制器，不要求预先创建 app host；只有显式降级才要求 app host。例子见 [EntryAbility](../entry/src/main/ets/entryability/EntryAbility.ets) 与 [DemoOwner](../entry/src/main/ets/entryability/DemoOwner.ets)。

未挂载的 scope、尚未测量的 app、被页面/后台过滤的 app，`show()` 可成功接受意图但仍不可见；`isShow()` 与 SHOW 事件表达实际可见。`updateContent()` 成功表示同内容适配器已提交参数更新，不是屏幕绘制完成信号。尺寸随后沿共同的布局回测与窗口适配路径更新；设备实测确认最终布局。

`cancel()` 幂等且终止实例；调用时同步作废旧世代，进行中的内容更新若尚未提交则 reject `DESTROYED`。此后所有业务修改入口 reject `DESTROYED`，需要重新调用工厂创建。原生销毁失败仍 reject，但本地监听/注册记录会释放。`uninstallAll()` 等待快照内所有实例，抛出的 `FxUninstallError.failures` 保留每个 tag 的错误与平台 code；后注册的新实例不会被旧清理删除。

事件回调可返回 Promise；库捕获同步异常和异步 rejection，通过已消毒的 `EVENT_CALLBACK_FAILED` 日志报告。回调不会在原生操作队列里被 await，因此可返回 reentrant `hide()` / `cancel()`；回调失败不会撤销已经成功的窗口操作，也不会递归产生 ERROR 事件。

## 系统能力边界

[华为 V5 受限权限说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/restricted-permissions-V5)限定 SYSTEM_FLOAT_WINDOW 的批准 2in1 场景（多方视频/屏幕共享）。不据 OpenHarmony API12 编译结果承诺普通手机/平板系统浮窗支持。未授权默认 reject `PERMISSION_DENIED`；能力不支持 reject `CAPABILITY_UNSUPPORTED`；只有显式 fallback 才可能转为 app，事件提供 `actualScope` 与失败原因。

API12 没有公开原生 hide 窗口接口。system `hide()` 隐藏内容、保留透明窗口，并禁用 touch/focus；`cancel()` 才销毁窗口。无阴影残留、焦点、触摸透传、四边半隐藏与跨应用显示须由有权限设备验证。

坐标、尺寸和拖动事件统一 vp；原生 window API 的 px 转换只发生在系统边界。切换显示屏/密度使用目标窗口的显示屏信息，不使用无关主窗口的密度。位置持久化默认关闭；app/system storage 只传 namespace 与 storage，内部以安装 scope + tag 生成键；scope 另传业务 key。降级保留安装时的 system scope 存储键，不能与 app 键混用。

真实 OpenHarmony API12 编译、商业 HarmonyOS SDK 编译和设备验收是独立结果；见 [README](../README.md) 与 [工具链记录](toolchain.md)。
