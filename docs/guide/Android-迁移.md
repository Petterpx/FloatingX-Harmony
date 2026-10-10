# Android 迁移

FloatingX-Harmony 是原生 ArkTS / ArkUI 实现，以一个 HAR 接入，最低兼容 HarmonyOS 5.0.0（API 12）。[Android 版](https://github.com/Petterpx/FloatingX)独立维护；迁移时保留业务浮窗思路，按 HarmonyOS API 重新接入。

## 接入对应

| Android 习惯 | HarmonyOS 对应 |
| --- | --- |
| View / XML / Compose 内容 | `FxContent<T>(wrapBuilder(builder), params, size)`；定义 ArkUI Builder 和参数类 |
| ViewGroup / Fragment / Activity 局部宿主 | `createScope` + `FloatingXHost`，范围为组件布局 |
| Application / Activity 跟随浮窗 | `installApp` + 一个已加载的 `FxWindowHost` |
| WindowManager 系统窗口 | `installSystem` + 所属 `UIAbilityContext` + 初始 `size` |
| Kotlin DSL / Java Builder | `FxConfig` 和明确的 options 对象 |
| tag 查询 / 管理 | `control`、`controlOrNull`、`uninstall` 等；app / system 共用命名空间 |
| `moveTo` 等 Android 移动调用 | `move` / `moveByVector`，坐标与尺寸使用 vp |
| 内容 / 位置更新流 | Promise 操作、同步 getter 和 `events` 回调 |
| 页面 Class 黑白名单 | 业务主动 `host.setPage(name)`，policy 匹配页面名字字符串 |
| SharedPreferences 保存位置 | `FxPreferencesStorage`，需要宿主 Context |

## 行为差异

工厂同步返回控制器、校验配置，首次 `show()` 才创建窗口和检查系统权限。工厂错误用 `try/catch`；显隐、移动、更新、取消和卸载用 `await` / `.catch()`。

`show()` 成功不必然已经可见：局部宿主未挂载、应用浮层未完成布局、页面被过滤或应用后台时，库保留显示意图。实际可见以 `isShow()` / SHOW 事件判断。ATTACH / DETACH 与 SHOW / HIDE 分别表示挂载和显示。

同名 app / system tag 不自动替换，立即抛 `DUPLICATE_TAG`；先等待自己的旧实例卸载再安装。scope 不注册 tag。

`position: { x: 0, y: 0 }` 是有效位置，只有 `position: undefined` 才使用 gravity。gravity / offset 定义初始定位，运行中的位置用 `move` 调整。

`control(tag)` 返回没有内容参数类型的 `FxControlHandle`。保留工厂结果 `FxControl<T>` 才能调用带类型的 `updateContent`。更新成功表示参数提交，ArkUI 后续完成布局 / 绘制。

## 生命周期

- scope 的宿主临时卸载会 detach 并隐藏，保留显示意图；重挂后恢复。业务结束由拥有者 `cancel()`。
- app 在 WindowStage.loadContent 完成后创建 Host；Stage 销毁时调用 `dispose()`。多 WindowStage 各自创建 Host，业务管理状态移交。
- system 不依赖 app Host，所属业务在 UIAbility / Stage 结束时显式取消自己的句柄。只有显式降级需要 app Host。

`cancel()` 是终止操作，幂等且会使尚未完成的旧操作拒绝；终止后所有修改 reject `DESTROYED`。原生销毁失败仍需处理 rejection，本地注册和监听会释放。`uninstallAll()` 等待调用时快照的全部实例，失败通过 `FxUninstallError.failures` 返回。

## 系统权限差异

Android 的授权申请 / 设置跳转流程不能直接迁移。HarmonyOS `SYSTEM_FLOAT_WINDOW` 是受限 `system_grant`，按目标平台的发行政策、设备和审批条件办理。库不自动请求权限、不自动打开设置。

默认权限 / 能力失败拒绝；只有显式 `fallback: { host }` 才尝试应用内降级，事件提供 `actualScope` 和失败原因。模拟器通过不代表普通商业手机 / 平板可以获授系统权限。

API 12 没有公开原生 hide 接口，system `hide()` 保留透明窗口并关闭触摸 / 焦点，`cancel()` 才销毁。跨应用透传与残留效果需目标设备确认。完整要求见[系统浮窗](系统浮窗.md)。

## 配置与存储差异

HarmonyOS 当前提供九宫格初始定位、六种吸附方向、半隐藏、三种显示模式、动画和拖动区域。Android 的 Compose、Modal、权限自动申请、长按启动拖动、自定义 Feature / LayoutParams 等 API 没有对应的 HarmonyOS 公开 API，不要按名称推测可用。

位置持久化默认关闭。scope 提供 namespace / 业务 key；app / system 提供 namespace 和 storage，键按安装 scope + tag 生成。系统降级仍使用 system 存储键。记录使用逻辑完整内容 vp 坐标，不是半隐藏后的可见窗口位置。

## 迁移路径

先使用[快速开始](快速开始.md)接入最小局部页面，再按需要选择[应用内浮窗](应用内浮窗.md)或[系统浮窗](系统浮窗.md)。默认值和方法名以[配置与交互](配置与交互.md)与[API 速查](API-速查.md)为准。

完整示例：[ScopeDemo](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/ScopeDemo.ets)、[AppDemo](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/AppDemo.ets)、[SystemDemo](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/SystemDemo.ets)、[DemoOwner](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/entryability/DemoOwner.ets)。
