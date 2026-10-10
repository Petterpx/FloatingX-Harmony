# API 速查

所有消费者 API 从 `floatingx` 导入。公开导出以 [Index.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/floatingx/Index.ets)为准，详细工厂签名见 [FloatingX.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/floatingx/src/main/ets/FloatingX.ets)。

## 创建工厂

| 方法 | 返回 | 必需 options | 可选 options |
| --- | --- | --- | --- |
| `FloatingX.createScope<T>(options)` | `FxControl<T>` | `content`、`config` | `events`、`interactions`、`storage` |
| `FloatingX.installApp<T>(options)` | `FxControl<T>` | `tag`、`host`、`content`、`config` | `pagePolicy`、`events`、`interactions`、`storage` |
| `FloatingX.installSystem<T>(options)` | `FxControl<T>` | `tag`、`context`、`size`、`content`、`config` | `fallback`、`events`、`interactions`、`storage` |

`T extends Object`；`content` 为 `FxContent<T>`，`config` 必须为 `FxConfig` 实例。app Host 必须有效；system `context` 为 `UIAbilityContext`，`size` 为正数 vp 尺寸。系统 fallback 为 `{ host: FxWindowHost, pagePolicy?: FxPagePolicy }`。

工厂同步验证；首次 `show()` 才开始窗口创建和系统权限检查。app / system tag 共用命名空间，重复同步抛 `DUPLICATE_TAG`。scope 无 tag。

完整示例见[快速开始](快速开始.md)、[应用内浮窗](应用内浮窗.md)、[系统浮窗](系统浮窗.md)。

## 控制器

`FxControl<T>` 实现 `FxControlHandle`；操作方法返回 `Promise<void>`，查询方法同步返回。

| 方法 | 说明 |
| --- | --- |
| `show()` | 保存显示意图，条件允许时显示 |
| `hide()` | 主动隐藏，清除显示意图；系统窗口仍保留 |
| `cancel()` | 幂等终止并释放；再次需要时重新创建 |
| `move(x, y, animate = false)` | 移动到绝对 vp 坐标 |
| `moveByVector(x, y, animate = false)` | 相对当前逻辑位置移动 |
| `updateConfig(config: FxConfig)` | 更新完整配置快照 |
| `updateContent(params: T)` | 更新带类型内容参数，仅 `FxControl<T>` 提供 |
| `clearPosition()` | 清除历史位置，当前坐标不变 |
| `getX()` / `getY()` | 已提交逻辑 vp 坐标 |
| `isShow()` | 当前实际可见性 |
| `getState()` | 当前 `FxState` |

保留工厂返回值才能使用带类型的 `updateContent()`；按 tag 查询只得到 `FxControlHandle`，不提供内容参数更新。内容更新成功表示提交完成，布局 / 绘制不是同步完成。

`cancel()` 调用时即开始终止，旧的进行中操作可能 reject `DESTROYED`。取消之后的 show、hide、move、配置 / 内容更新与清位置都拒绝。资源销毁失败也需处理 Promise 错误；本地 tag / 监听仍会释放。

## 注册表

| 方法 | 返回 / 行为 |
| --- | --- |
| `control(tag)` | `FxControlHandle`；不存在同步抛 `NOT_INSTALLED` |
| `controlOrNull(tag)` | `FxControlHandle \| undefined`；方法名虽有 Null，实际无实例返回 undefined |
| `isInstalled(tag)` | `boolean` |
| `getAllTags()` | `string[]` |
| `uninstall(tag)` | `Promise<void>`；不存在时成功空操作 |
| `uninstallAll()` | `Promise<void>`；清理调用时快照中的 app / system 实例 |
| `setLogger(logger: FxLogger \| undefined)` | 为之后创建的实例设置日志实现；undefined 使用默认日志 |

`uninstallAll()` 会等待每项清理；有失败抛 `FxUninstallError`，其 `failures` 数组包含 `{ tag, error: FxError }`，便于逐项报告。scope 由自己的控制器取消，不进入注册表。全量卸载影响所有已注册业务，通常优先取消自己持有的句柄。

## 事件、状态与作用范围

事件回调类型为 `(event: FxEvent) => void | Promise<void>`。

| `FxEvent` 字段 | 类型 / 含义 |
| --- | --- |
| `type` | `FxEventType` |
| `position` | `FxPoint`，逻辑 vp 位置 |
| `actualScope` | `FxScope.SCOPE` / `APP` / `SYSTEM` |
| `error?` | `FxError` |

事件类型：`ATTACH`、`DETACH`、`SHOW`、`HIDE`、`MOVE`、`CONFIG`、`DESTROY`、`ERROR`。挂载和可见是不同事件；卸载局部 Host 不等于销毁控制器。系统降级通过 `actualScope` 表示实际范围。

状态：`IDLE`、`SHOWING`、`VISIBLE`、`HIDDEN`、`DESTROYING`、`DESTROYED`。`show()` Promise 成功可以仍处于等待宿主的 idle / hidden；以 `isShow()` 或 SHOW 事件判断可见。

回调异常记录 `EVENT_CALLBACK_FAILED` 日志，不阻塞浮窗操作、不撤销成功操作，也不会递归发出 ERROR。回调可调用控制器的异步方法，但业务仍要避免自行构成显隐循环。

## 错误

`FxError` 提供 `code: string`、`message: string`、可选 `platformCode: number`。主要错误：

| code | 排查方向 |
| --- | --- |
| `INVALID_CONFIG` | 配置、内容尺寸、tag 或存储参数 |
| `INVALID_GEOMETRY` | 坐标 / 几何值无效 |
| `DUPLICATE_TAG` | app / system 已有同 tag |
| `NOT_INSTALLED` | 查询不存在的 tag |
| `NO_HOST` | Host 未就绪、失效或所需窗口未创建 |
| `PERMISSION_DENIED` | 系统权限未授予 |
| `CAPABILITY_UNSUPPORTED` | 目标平台能力 / 矩形确认不满足要求 |
| `WINDOW_OPERATION_FAILED` | 原生窗口调用失败 |
| `DESTROYED` | 控制器已终止或操作被取消 |
| `STORAGE_FAILED` | 存储读写失败，通过事件 / 日志报告 |
| `EVENT_CALLBACK_FAILED` | 业务事件 / 交互回调异常，仅日志报告 |
| `UNINSTALL_FAILED` | 全量清理存在失败，检查 `failures` |

不要只依赖错误文案做业务判断；用稳定 `code`，按需要记录 `platformCode`。

## 内容、配置与宿主

- `new FxContent<T>(builder: WrappedBuilder<[T]>, params: T, size: FxSize)`；使用 `wrapBuilder` 包装带参数的 Builder，初始宽高必须为正。
- `new FxConfig(options?: FxConfigOptions)`、`config.copy()`；详见[配置与交互](配置与交互.md)。
- `FloatingXHost({ control, host })`：局部控制器的组件宿主，具有明确布局范围。
- `FxWindowHost.create(stage, valid?)`：返回 `Promise<FxWindowHost>`；在 loadContent 完成后创建，guard 默认始终有效。
- `host.isValid()`、`host.isForeground()`、`host.getPage()`、`host.setPage(name)`、`host.dispose()`：应用内 Host 生命周期与页面管理。
- `FxPreferencesStorage(context, name?)`、`FxMemoryStorage`、`FxStorage`：详见[位置存储](位置存储.md)。

库提供的公开几何类型包括 `FxPoint`、`FxSize`、`FxInsets`、`FxPositionRecord`；枚举和默认值见[配置与交互](配置与交互.md)。
