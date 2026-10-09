# FloatingX 鸿蒙原生版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立仓库交付支持局部、应用内、系统浮窗的原生 ArkTS HAR 库、示例和中文文档。

**Architecture:** 共用几何、状态机、手势判定及存储逻辑，三种宿主通过平台接口适配。ArkUI 负责内容，WindowStage / UIAbility 的拥有者负责生命周期接线；系统操作串行化并处理取消竞态。

**Tech Stack:** ArkTS、ArkUI、Stage、Hvigor、OHPM、Preferences；无平台依赖的逻辑使用 ArkTS 兼容 TypeScript 子集，Node 内置 test runner 运行主机测试，Hypium / 真机完成平台验证。

**Spec:** `docs/superpowers/specs/2026-10-09-floatingx-harmony-design.md`，2026-10-09 用户已确认。

## Global Constraints

用户实施中变更：最低兼容 API 21（HarmonyOS 6.0.1(21)），取代此前 API 12 的目标；此前 API 12 构建记录保留为历史证据，不计入新目标验收。

- 工作目录仅为 `/Users/petterp/Documents/HarmonyOS/FloatingX` 或它的隔离工作树。
- 不在 Android 仓库新增或修改任何文件。
- 首版面向手机、平板的 Stage 模型，最低目标 API 21。
- 首版采用一个 HAR，内部按职责隔离，降低接入和版本管理成本。
- 对外统一 vp。
- app / system 共用 tag 命名空间。重复 tag 默认报 `DUPLICATE_TAG`。
- 存储接口支持异步 load / save / clear；默认关闭持久化。
- 不发布 OHPM，不自动创建远端仓库；签名、SDK 路径和凭证仅保存在本地。
- 源码测试、真实 SDK 编译、设备验收分开报告；未执行的验证不能记为通过。
- 统筹保持 Astra；编码委派使用 `gpt-6.1-sol`。按任务依赖顺序交接，不让多个实现者同时改公共接口。

## Review Focus

1. 位置恢复尚未完成，用户已经 move：不得用迟到的持久化结果覆盖用户操作；任务 4 覆盖。
2. 回调内部调用 hide / cancel 或抛出异常：不能死锁队列、阻断资源释放或留下未处理 rejection；任务 3 覆盖。
3. 窗口密度与主窗口不同，或显示屏切换：不得复用错误密度；任务 7 覆盖坐标转换与重算。
4. 只使用 scope / app 的宿主未申请系统权限：导入公共包不得主动检查权限、创建窗口或持有 Context；任务 8 覆盖。
5. 旧控制器清理晚于同 tag 新实例注册：旧回调不能注销新实例；任务 3 覆盖身份核验。

## 执行顺序与交付关口

按任务 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 执行。每项包含可独立验证的产物与提交。不要为提前并行修改未稳定接口。任务 7 的系统能力验证独立记录，即便授权或设备不可用，也继续完成可以验证的其他内容，最终明确剩余验收项。

工具链基线目标为 HarmonyOS 6.0.1 / API 21；不要拿本机现有 OpenHarmony API 9 代替。任务 1 从实际使用的官方 DevEco 工具链生成工程，并记录 SDK、Hvigor 插件、OHPM、Node 精确版本和锁文件。若官方可用版本较新，保持 compatibleSdkVersion 对应 API 21，在基线记录中固定实际 compileSdkVersion（不低于 21）；不猜造 wrapper 或插件版本。

## 文件职责

所有下列路径均相对于新仓库根目录。平台无关 `.ts` 文件必须同时被 ArkTS 编译器接收，禁止 `any`、动态对象形状、Node API 或只为主机测试复制第二份算法。

| 文件 / 目录 | 职责 |
| --- | --- |
| `floatingx/src/main/ets/core/FxTypes.ts` | 公共基础值类型、枚举、配置、事件 |
| `core/FxError.ts`、`core/FxConfig.ts` | 稳定错误码、配置校验与默认值 |
| `geometry/FxGeometry.ts` | 定位、边界、吸附、比例恢复、裁剪 |
| `core/FxPlatform.ts`、`core/FxController.ts` | 平台接口、串行状态机与取消 |
| `core/FxRegistry.ts` | tag 注册与身份安全注销 |
| `storage/FxStorage.ts`、`storage/FxMemoryStorage.ts`、`storage/FxPositionSession.ts` | 异步存储与恢复竞态 |
| `storage/FxPreferencesStorage.ets` | 鸿蒙 Preferences 适配 |
| `component/FxTouch.ts`、`component/FxAnimation.ts` | 可测试的手势与动画取消逻辑 |
| `component/FxContent.ets`、`component/FxFloatView.ets` | Builder 内容协议与渲染 |
| `scope/FxScopePlatform.ets`、`scope/FloatingXHost.ets` | 局部容器与布局 |
| `app/FxPageFilter.ts`、`app/FxAppPlatform.ets`、`app/FxWindowHost.ets` | 页面过滤、浮层、窗口事件 |
| `system/FxNativeWindow.ts`、`system/FxSystemPlatform.ts` | 可替身测试的原生窗口协议及系统策略 |
| `system/FxWindowAdapter.ets`、`system/FxSystemPage.ets` | 真实 Window API 与独立窗口内容 |
| `FloatingX.ets`、`floatingx/Index.ets` | 公共入口及受控导出；前者位于 `src/main/ets/` |
| `tests/*.test.mjs`、`tests/support/FxFakes.mjs` | 同一份核心源码的主机测试 |
| `entry/src/ohosTest/ets/test/` | 设备测试 |
| `docs/verification.md`、`docs/toolchain.md` | 验收证据、工具链版本与命令 |

上表缩写的 `core/`、`geometry/` 等目录均位于 `floatingx/src/main/ets/`。

## Task 1：建立可构建 HAR 与示例闭环

**Files:** 新增根目录 `build-profile.json5`、`oh-package.json5`、`hvigorfile.ts`、`hvigor/hvigor-config.json5`、`.gitignore`、`package.json`、`tsconfig.core.json`；新增 `AppScope/app.json5` 及模板资源；新增 `floatingx/{Index.ets,hvigorfile.ts,oh-package.json5,build-profile.json5,src/main/module.json5}`；新增 `entry/` 官方 Stage 模板；新增 `docs/toolchain.md`。

**Interfaces:** 产出 `npm run test:core`、`npm run build:core` 和官方 Hvigor HAR/HAP 命令。示例以本地 `file:../floatingx` 依赖 HAR。

- [ ] 只读定位官方 DevEco / SDK / OHPM / Hvigor / hdc。执行 `command -v node ohpm hvigorw hdc` 并核对 SDK 的 `sdk-pkg.json`；未找到时检查已知 Huawei SDK 和 Applications 目录。安装官方工具须遵循机器许可与登录要求，不接触用户签名材料。
- [ ] 使用选定官方版本的 Stage 示例 + HAR 模板，记录精确版本；模板中签名、绝对 SDK 路径改为本地配置并忽略。所有生成物、`oh_modules/`、`node_modules/`、`build/`、`.hvigor/`、签名文件和本地配置加入 `.gitignore`。
- [ ] 在空 HAR 导出 `export const FLOATINGX_VERSION: string = '0.1.0';`；示例 Index 页面 import 并显示该值。只引入真实使用的库及测试依赖。该值后续作为正式包版本，不构建一次性产品原型。
- [ ] 建立主机测试命令：`build:core` 编译 `floatingx/src/main/ets/**/*.ts` 至 `work/core`；`test:core` 执行编译后 `node --test tests/*.test.mjs`。根 package 保持 CommonJS，测试入口用 `.mjs`，避免生产源码为 Node 强行使用 `.js` 导入扩展名。安装并锁定 TypeScript 开发依赖，不把全局 tsc 版本作为可复现依据。任务 2 添加首批核心源码和测试后开始执行主机测试，本任务的独立验证是 HAR/HAP 编译。

```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "CommonJS", "strict": true,
    "rootDir": "floatingx/src/main/ets", "outDir": "work/core",
    "noEmitOnError": true
  },
  "include": ["floatingx/src/main/ets/**/*.ts"],
  "exclude": ["**/*.ets", "**/oh_modules/**"]
}
```
- [ ] 执行官方 OHPM 安装并构建 HAR 和 unsigned HAP。按模板工具位置运行 `hvigorw --mode module -p module=floatingx@default -p product=default assembleHar --no-daemon` 和 `hvigorw --mode module -p module=entry@default -p product=default assembleHap --no-daemon`；若官方模板使用 Node 入口，则记录等效完整命令。不能创建只返回成功的脚本代替它。
- [ ] 验证 HAR 存在、示例真正引用 HAR、SDK 输出无编译错误。在 `docs/toolchain.md` 记录命令、版本、产物路径；缺少环境则明确编译关口未通过，后续主机测试不改变该结论。
- [ ] 提交工程闭环：`build: bootstrap HarmonyOS library and sample`。

## Task 2：坐标、配置与吸附算法

**Files:** 新增 `core/FxTypes.ts`、`core/FxError.ts`、`core/FxConfig.ts`、`geometry/FxGeometry.ts`、`tests/geometry.test.mjs`、`tests/config.test.mjs`。

**Interfaces:** 以下导出均为正式契约，后续任务使用同名类型。`FxConfig` 是带默认值的类，字段为 `position?: FxPoint`、`gravity`、`offset`、`margin`、`displayMode`、`adsorb`、`edgeAdsorb`、`rebound`、`halfHide`、`halfHideRatio`、`animation`、`clickIntervalMs`。enum 覆盖设计中的九宫格、六方向和三模式；动画配置定义 durationMs 与平台无关的曲线枚举。

```ts
export interface FxPoint { x: number; y: number; }
export interface FxSize { width: number; height: number; }
export interface FxInsets { left: number; top: number; right: number; bottom: number; }
export interface FxBounds { minX: number; maxX: number; minY: number; maxY: number; }
export interface FxViewport { size: FxSize; insets: FxInsets; }
export interface FxGeometryInput {
  viewport: FxViewport; content: FxSize; config: FxConfig;
}
export interface FxProjection {
  position: FxPoint; visibleSize: FxSize; contentOffset: FxPoint;
}
// FxGeometry 导出：bounds(input), initial(input), clamp(point, bounds),
// settle(point, input), restore(record, input), project(point, input)。
// bounds 返回 FxBounds；initial/clamp/settle/restore 返回 FxPoint；project 返回 FxProjection。
```

- [ ] 先写明确输入输出测试；例如 300×500 宿主、50×50 内容、零 inset/margin，`bounds` 为 `{minX:0,maxX:250,minY:0,maxY:450}`，右吸附 `{x:80,y:40}` 得到 `{x:250,y:40}`；显式初始 `(0,0)` 不被默认 gravity 覆盖。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp } from '../work/core/geometry/FxGeometry.js';
test('oversized content uses a non-reversed legal interval', () => {
  assert.deepEqual(clamp({x: -20, y: 600},
    {minX: 10, maxX: 10, minY: 0, maxY: 450}), {x: 10, y: 450});
});
```

- [ ] 运行 `npm run test:core`，确认因缺失函数或断言失败；再实现有限数值校验、配置副本与默认值。尺寸必须大于零；半隐藏比例在 0..0.9；margin/inset 不接受负数。吸附默认左右就近、动画和半隐藏默认关闭、持久化由独立 storage 选项启用。
- [ ] 实现合法区间 `maxX = Math.max(minX, width - insetRight - marginRight - contentWidth)`，Y 同理；先 clamp，再按方向 settle。四边 halfHide 只改变 projection 的可见尺寸和内容偏移，不依赖原生窗口接受负坐标。
- [ ] 增加左/右/上/下/左右/上下吸附、九宫格定位、偏移、0 与 0.9 隐藏比、超大内容、非有限输入、旋转恢复与 inset 变化断言。逐组运行对应测试至通过，SDK 可用时同步编译 HAR，禁止仅为通过 Node 使用 ArkTS 不支持语法。
- [ ] 提交：`feat: add float geometry and validated configuration`。

## Task 3：控制器、取消竞态与注册表

**Files:** 新增 `core/FxPlatform.ts`、`core/FxController.ts`、`core/FxRegistry.ts`、`tests/support/FxFakes.mjs`、`tests/controller.test.mjs`、`tests/registry.test.mjs`。

**Interfaces:** `FxState` 使用设计的六状态；`FxError` 构造为 `(code: string, message: string, platformCode?: number)`，含对应只读字段。`FxEvent` 含 type、position、actualScope 及可选 error；回调是 `(event: FxEvent) => void`。

```ts
export interface FxPlatform {
  create(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  move(point: FxPoint, animate: boolean): Promise<FxPoint>;
  applyConfig(config: FxConfig): Promise<void>;
  destroy(): Promise<void>;
}
// FxController(platform: FxPlatform, config: FxConfig, onEvent?: (event: FxEvent) => void)
// show/hide/cancel(): Promise<void>; move(x,y,animate=false): Promise<void>;
// moveByVector(x,y,animate=false): Promise<void>; updateConfig(config: FxConfig): Promise<void>;
// getX/getY(): number; isShow(): boolean; getState(): FxState;
// getGeneration(): number，取消时同步递增，供内容更新和动画校验。
// setHostVisible(visible: boolean): Promise<void>。其设置不改变用户显隐意图。
// FxRegistry: register(tag, controller): void; control(tag): FxController;
// controlOrNull(tag): FxController | undefined; getAllTags(): string[];
// unregister(tag, expectedController): void; uninstall(tag)/uninstallAll(): Promise<void>。
```

- [ ] 新建 FakePlatform，公开 `calls: string[]`、`position`、可配置创建/销毁延迟与错误；每个方法只记录调用并返回 Promise。辅助 `deferred()` 返回 `{promise, resolve, reject}`，只在 JS 测试内实现，生产代码不依赖测试类型。
- [ ] 先写并运行创建中 cancel 的测试：

```js
test('late create is destroyed and never shown after cancel', async () => {
  const gate = deferred();
  const platform = new FakePlatform(gate.promise);
  const controller = new FxController(platform, new FxConfig());
  const showing = controller.show();
  const observed = showing.catch(error => error);
  const cancelled = controller.cancel();
  gate.resolve();
  await Promise.all([observed, cancelled]);
  assert.equal(controller.getState(), 'destroyed');
  assert.equal(platform.calls.includes('show'), false);
  assert.equal(platform.calls.filter(v => v === 'destroy').length, 1);
});
```

- [ ] 实现串行队列与世代号。`cancel` 同步标记 destroying 并撤销意图，然后排队清理；队列尾部用恢复后的 Promise 链接，单次失败不能使后续永远不执行。尚未提交的 move 合并，所有调用者 Promise 都有明确完成或失败结果。
- [ ] 在锁外发事件，不 await 用户事件回调；捕获回调异常并送日志接口，不能递归调用同一失败回调。已取消的 show 返回稳定 `DESTROYED` 错误；最后状态以实际平台结果为准。
- [ ] 测试 show/hide/show 顺序、失败后重试、重复 cancel、隐藏期间移位、程序 move 后回读、批量卸载中一个失败不阻断其他释放、原生 destroy 失败仍本地清理并报告错误。补充回调中 cancel、回调抛错、旧实例 unregister 不删除新实例测试。
- [ ] 运行 `npm run test:core`，确认通过后提交：`feat: add lifecycle-safe float controllers`。

## Task 4：异步位置保存与恢复

**Files:** 新增 `storage/FxStorage.ts`、`storage/FxMemoryStorage.ts`、`storage/FxPositionSession.ts`、`storage/FxPreferencesStorage.ets`、`tests/storage.test.mjs`；修改控制器接入存储会话。

**Interfaces:**

```ts
export interface FxPositionRecord {
  version: number; position: FxPoint; viewport: FxSize; edge: FxEdge;
}
// FxEdge: NONE、LEFT、RIGHT、TOP、BOTTOM。
export interface FxStorage {
  load(key: string): Promise<FxPositionRecord | undefined>;
  save(key: string, value: FxPositionRecord): Promise<void>;
  clear(key: string): Promise<void>;
}
// FxStorageOptions: namespace: string; key: string; storage: FxStorage。
// FxPositionSession(options, onError): restore(input): Promise<FxPoint | undefined>;
// markUserMove(): void; save(record): Promise<void>; clear(): Promise<void>; close(): void。
```

- [ ] 写故障存储替身与测试：load 失败仍可 show；save 失败上报 STORAGE_FAILED；损坏、非有限坐标、未知 version 不恢复；各 namespace/scope/tag 相互隔离。
- [ ] 写迟到恢复的测试：先启动 deferred load，再调用 markUserMove，随后 resolve 历史位置，预期 restore 返回 undefined。clear 后迟到 save 不得重新写入旧位置；close 后不再更新 UI。
- [ ] 执行失败测试，然后实现会话世代号、写入顺序和合并。只在拖动结束或程序移动完成保存；第一次显示等待恢复完成，恢复失败使用默认位置。

恢复的关键顺序如下；`revision` 是会话内数字字段，markUserMove/clear/close 都使它递增，`closed` 在 close 后为 true：

```ts
const revision = this.revision;
const record = await this.options.storage.load(this.options.key);
if (this.closed || revision !== this.revision || record === undefined) {
  return undefined;
}
return restore(record, input);
```
- [ ] Preferences 实现将 record 编码为带版本 JSON，解析后显式检查每个字段，使用所属应用 Context 打开独立 store 并 flush。平台错误转换 FxError，不打印原始业务数据。
- [ ] 运行 `npm run test:core`；真实设备执行保存→cancel→重建及重启 App 后恢复，记录结果。提交：`feat: persist and restore float positions safely`。

## Task 5：手势、动画与局部浮窗

**Files:** 新增 `component/FxTouch.ts`、`component/FxAnimation.ts`、`component/FxContent.ets`、`component/FxFloatView.ets`、`scope/FxScopePlatform.ets`、`scope/FloatingXHost.ets`、`tests/touch.test.mjs`、`tests/animation.test.mjs`、`entry/src/main/ets/pages/ScopeDemo.ets`。

**Interfaces:** `FxPointer` 为 `{id:number,x:number,y:number,timeMs:number}`；`FxTouch` 暴露 down/move/up/cancel，各次返回 `FxTouchResult`（kind 为 none/drag/click/longPress/end，含 position）。构造注入 mode、thresholdVp、clickIntervalMs、longPressMs，测试使用可控时间，不真实 sleep。`FxAnimation` 暴露 begin/cancel/isCurrent，使用单调 generation。

`FxContent<T>` 由 `WrappedBuilder<[T]>`、参数 T、`update(params:T):Promise<void>` 方法组成；渲染时针对所属 UIContext 创建内容，不跨窗口共享节点。`FloatingXHost` 接收 scope controller、content 和宿主 Builder。`FxScopePlatform` 实现任务 3 接口，并提供布局/可见状态订阅；订阅返回释放函数。SDK 不接受泛型组件时仅组件内部用明确的内容包装类，公共 Builder 入口保留类型安全。

- [ ] 先写主触点测试，覆盖第二手指 down 不接管、非主触点 up 不结束、主触点 up 结束、cancel 不 click、阈值以内 click、长按互斥、防连点、ClickOnly/DisplayOnly。运行至确认失败后实现状态机。

```js
test('cancel never becomes a click', () => {
  const touch = new FxTouch('Normal', 8, 300, 500);
  touch.down({id: 1, x: 0, y: 0, timeMs: 0});
  assert.equal(touch.cancel().kind, 'end');
  assert.equal(touch.up({id: 1, x: 0, y: 0, timeMs: 20}).kind, 'none');
});
```

- [ ] 实现动画 generation：旧结束回调仅当 isCurrent(token) 才提交；hide、cancel、手动拖动调用 cancel。测试连续 move、动画未完宿主消失与迟到回调。
- [ ] 构建 Stack 宿主与 FxFloatView；宿主布局变化驱动 geometry，空白层透明命中，内容的 DisplayOnly 禁止命中。使用平台 TouchEvent 的主指绝对位置做差，避免内容移动后局部坐标形成反馈抖动；自定义拖动区域外保留子控件事件。
- [ ] 把 Builder、内容更新、显隐/移动动画接入局部适配器。aboutToDisappear 清理订阅与触点，保留控制器意图；业务销毁显式 cancel。示例放置浮窗内按钮和浮窗外按钮，能直接验证两类事件互不干扰。
- [ ] 运行主机测试、HAR/HAP 编译及局部设备测试：四边吸附/半隐藏、尺寸变化、子按钮点击、拖动不误点、宿主卸载重挂、动画中取消。提交：`feat: add ArkUI scope floats and interactions`。

## Task 6：应用内浮层、页面过滤与生命周期

**Files:** 新增 `app/FxPageFilter.ts`、`app/FxWindowHost.ets`、`app/FxAppPlatform.ets`、`tests/page-filter.test.mjs`、`entry/src/main/ets/pages/AppDemo.ets`、`entry/src/main/ets/pages/FilteredPage.ets`；修改 `entry/src/main/ets/entryability/EntryAbility.ets`。

**Interfaces:** `FxPagePolicy` 为 mode（blacklist/whitelist）和 names:string[]；`allowsPage(policy,page?:string):boolean`。`FxWindowHost` 通过 WindowStage 异步工厂创建，提供 UIContext、viewport、subscribe、setPage(name)、dispose；dispose 异步取消所有绑定控制器。`FxAppPlatform` 实现 FxPlatform；实际资格变化调用 controller.setHostVisible。

- [ ] 先写 allow 测试：未知页面 whitelist=false、blacklist=true；精确字符串匹配；名单输入复制，不受调用方修改数组影响。运行失败再实现。
- [ ] OverlayManager 只管理当前实例的 ComponentContent：使用 add/show/hide/removeComponentContent，禁止使用 showAll/hideAll 影响宿主业务其他浮层。remove 后 dispose 节点，重新挂载重建内容。
- [ ] 主窗口 loadContent 完成后取得 UIContext，创建 host；监听窗口 SHOWN/HIDDEN 和尺寸/避让变化。WindowStage 销毁先使 host 失效再清理订阅，迟到 UI 回调不能重新添加节点。
- [ ] 示例分别接入 router onPageShow 与 Navigation destination 的显示回调，统一调用 setPage。测试手动 hide→切页→仍隐藏、show→黑名单→暂隐→允许页面→恢复，以及两个 WindowStage 各自不影响。
- [ ] 用以下断言复用任务 3 核心测试，再运行真实 OverlayManager 验证；平台测试不得仅用 fake 标记通过。

```js
test('host visibility does not override an explicit hide', async () => {
  const controller = new FxController(new FakePlatform(), new FxConfig());
  await controller.show();
  await controller.hide();
  await controller.setHostVisible(false);
  await controller.setHostVisible(true);
  assert.equal(controller.isShow(), false);
});
```

- [ ] 验证底层按钮可点、Dialog 在上层、旋转/安全区不跳位、页面退出释放与前后台显隐。提交：`feat: add window-scoped app floats`。

## Task 7：系统窗口、权限失败与显式降级

**Files:** 新增 `system/FxNativeWindow.ts`、`system/FxSystemPlatform.ts`、`system/FxWindowAdapter.ets`、`system/FxSystemPage.ets`、`tests/system.test.mjs`、`entry/src/main/ets/pages/SystemDemo.ets`；修改示例 module 权限和本地签名说明。

**Interfaces:** `FxNativeWindow` 提供 load/show/hide/destroy/resize/setTouchable/setBackground（异步）、movePx（异步返回实际像素坐标）、getViewport（含 density）及事件订阅/解除；`FxWindowFactory` 提供 checkAccess 与 create。协议实现全在 FxWindowAdapter，测试使用替身。`FxSystemPlatform` 实现 FxPlatform，构造接收 factory、geometry input、可选 fallback factory、onEvent。fallback 只在权限/能力失败且显式启用时触发；窗口一般操作错误不掩盖为降级。

- [ ] 编写权限拒绝、能力缺失、成功、部分创建失败、move 失败、destroy 失败测试。权限检查不在模块顶层执行；缺少权限 reject PERMISSION_DENIED，且没有 fallback 时不创建 app 宿主。

```js
test('permission rejection does not silently downgrade', async () => {
  const factory = new FakeWindowFactory('denied');
  const platform = new FxSystemPlatform(factory, systemGeometry(), undefined);
  await assert.rejects(platform.create(), {code: 'PERMISSION_DENIED'});
  assert.equal(factory.createCount, 0);
});
```

`FakeWindowFactory` 在 tests/support/FxFakes.mjs 实现任务接口并记录次数；`systemGeometry()` 返回固定 300×500 viewport、50×50 content、零 inset 与默认 FxConfig，不读取真实屏幕。

- [ ] 对照目标 SDK 的 Window API 实现 TYPE_FLOAT。窗口创建→内容加载→背景/触摸/尺寸/位置→show，所有失败清理已经创建的资源。内容采用 HAR 内命名路由 `FloatingXSystemPage`，通过 loadContentByName + LocalStorage 传递实例标识，从实例表获取内容工厂，在新 UIContext 创建视图；Index.ets 显式保留该页面导入以防裁剪。新鲜宿主工程必须验证命名路由随 HAR 正确打包。
- [ ] 适配器权限检查使用目标 SDK 的 AccessToken 接口，保留实际平台错误码。核对官方发行版权限声明/授权方式，不把 OpenHarmony 的 ACL 政策直接套到 HarmonyOS；没有授权设备时记录系统正向场景未验收。
- [ ] 测试密度 2 与 3 下 10vp 转换为 20px 与 30px；window 回读修正 state；密度切换重新投影。移动不使用当前内容局部坐标累计，位置转换始终使用目标窗口/显示屏密度。
- [ ] 实现半隐藏投影：内容完整尺寸仍是 50vp，隐藏一半时可见窗口宽或高为 25vp，内容偏移按边缘裁剪；展开先更新窗口尺寸再恢复内容偏移，更新顺序失败回滚或报告能力错误。写四边 projection 单元测试，设备验证内容与命中区域吻合。
- [ ] 测试显式 fallback：先清理系统残留窗口，再创建 app；报告 actualScope=app 及原错误。若清理失败，报告失败并拒绝降级，防止双浮窗。测试取消中创建、主 UIAbility 销毁、系统后台显示与 DisplayOnly 跨应用透传。
- [ ] 运行主机测试及 SDK 构建，记录有/无权限的设备结果；提交：`feat: add system floats with explicit fallback`。

## Task 8：公共入口、完整示例与使用文档

**Files:** 新增 `floatingx/src/main/ets/FloatingX.ets`、`tests/api-contract.test.mjs`、`README.md`、`docs/migration.md`；修改 `floatingx/Index.ets`、`entry/src/main/ets/pages/Index.ets`；新增 `entry/src/main/ets/pages/MultipleDemo.ets`、`entry/src/ohosTest/ets/test/FloatingX.test.ets`、`entry/src/ohosTest/ets/test/List.test.ets`。

**Interfaces:** `FxAppOptions<T>` 包含 tag、host、content、config、可选 storage/events/pagePolicy；`FxSystemOptions<T>` 包含 tag、context、content、size、config、可选 storage/events/fallback；`FxScopeOptions<T>` 包含 content/config/可选 storage/events。工厂返回可立即持有的控制器，直到 show 才访问平台；公开控制器追加 `updateContent(params:T):Promise<void>`，由同实例内容包装更新而不重装窗口。

- [ ] 写公共注册契约测试：无效选项立即失败；同 tag 冲突；scope 不注册；getAllTags 副本不可修改内部；卸载全部保留逐项错误信息；cancel 后所有修改入口 reject DESTROYED。
- [ ] 接入公开工厂，补充 `isInstalled`、uninstall/uninstallAll 和日志注入。输出事件携带实际 scope。API 仅导出供业务使用的类型、Host、控制器与 storage，不导出内部窗口实例表。

内容更新使用 facade 中持有的 `FxContent<T>` 和核心控制器，保持参数类型不丢失；平台 applyConfig 内若需内容尺寸更新，触发重新测量后再完成 Promise：

```ts
async updateContent(params: T): Promise<void> {
  if (this.controller.getState() === 'destroyed' ||
      this.controller.getState() === 'destroying') {
    throw new FxError('DESTROYED', 'FloatingX control has been destroyed');
  }
  await this.content.update(params);
}
```

`FxContent.update(params:T):Promise<void>` 必须与 cancel 共用控制器世代检查，更新过程中取消时不提交迟到内容；为此给 FxController 增加 `getGeneration():number`，cancel 时同步递增，内容更新提交前核验并返回 DESTROYED。新增“内容更新未完成即 cancel”的回归用例。
- [ ] 完成示例：三模式入口、九宫格位置、吸附方向/开关、半隐藏比例、显隐和移动动画、DisplayOnly/ClickOnly、位置保存、页面过滤、多个 tag、错误展示。每个创建入口对应明确 cancel 入口，退出演示页按 scope 的拥有者契约释放。
- [ ] 接入文档中的示例代码直接取自可编译的 Demo 文件，不另写未经编译的 API 用法。README 给出最短 scope / app / system 接入、生命周期回调位置和系统权限路径；migration 明确 Promise、tag 冲突、Builder 替代 View、单窗口范围等差异。
- [ ] 新建不声明 SYSTEM_FLOAT_WINDOW 的 consumer 验证：仅依赖 HAR、导入 FloatingX、运行 app / scope。断言导入不调用 WindowFactory 或 access 检查；设备验证确实能显示。单独构建有权限 system 示例，不能通过同一授权示例推断无权限消费者可用。
- [ ] 比对 Android LICENSE 并保留适用许可证与作者信息，新增鸿蒙实现说明；不引入第三方库源码。构建公开 HAR 与全部示例，提交：`feat: expose FloatingX API and document HarmonyOS usage`。

## Task 9：整体验证与交付

**Files:** 新增/更新 `docs/verification.md`；按实际失败修改对应实现及回归测试，不在该任务追加无关功能。

- [ ] 运行 `npm run test:core`、`git diff --check`、官方 OHPM 安装校验、HAR 构建和 HAP 构建；保存命令、退出码、版本与产物路径。所有 Node 核心测试引用工作树中的实际源码构建结果。
- [ ] 执行并记录设备矩阵：手机、平板中实际可用的设备分别填 OS/API/型号；未测设备写“未执行”，不得从手机结果外推平板。用 Hypium 测试与人工手势检查覆盖规格第 8 节全部场景。
- [ ] 检查每类资源释放：窗口关闭、监听解除、节点 dispose、计时器取消、registry 无残留、迟到回调不复活；检查错误回调不泄露业务内容。
- [ ] 对照规格逐条标明“实现并通过 / 实现但待平台验收 / 未完成”，记录系统授权、签名或设备阻塞及复现步骤。不得以构建成功代替交互验收，也不得以无权限时正确报错代替系统浮窗正向验收。
- [ ] 完成独立代码审查，重点看任务头部五项 Review Focus、半隐藏四边投影、事件透传和取消竞态；审查问题修复后只重跑受影响测试与必要构建。
- [ ] 提交已验证修改，输出仓库路径、commit、接入文档、HAR/HAP 实际产物以及尚未通过的验收项。发布包、创建远端仓库、推送或签名上传不在本计划范围。

## 自审覆盖映射

| 规格要求 | 任务 |
| --- | --- |
| 独立工程、HAR、最低 API 与可复现构建 | 1、9 |
| 公共 API / tag / 异步语义 / 错误 | 2、3、8 |
| 三种宿主与生命周期 | 5、6、7 |
| 几何、六方向吸附、半隐藏、尺寸变化 | 2、5、7 |
| 主触点、点击/长按、DisplayOnly、动画 | 5、7 |
| 位置存储与恢复竞态 | 4 |
| 页面过滤、前后台、显式系统降级 | 6、7 |
| 资源释放、队列、迟到回调、错误可见 | 3、7、9 |
| 示例、中文文档、迁移与权限边界 | 8、9 |

## 审阅与执行方式

本文已由用户确认执行；实施中用户明确将最低兼容级别改为 API 21。由主会话统筹、Sol 按上述顺序实现，每项完成后独立审查，再进行整体平台验收。理由：三种宿主共用状态机与几何接口，按任务串行交接更容易维持语义一致，独立审查集中发现资源和异步生命周期问题。

若用户选主会话直接实现，则执行顺序与验收标准不变，结束前仍做一次独立整体审查。

## 接口核对来源

- [官方 Window SDK 定义](https://github.com/openharmony/interface_sdk-js/blob/master/api/@ohos.window.d.ts)：loadContentByName、getUIContext、窗口内容与生命周期接口；实现仍以实际目标 HarmonyOS SDK 为准。
- [官方 OverlayManager 文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/reference/apis-arkui/arkts-apis-uicontext-overlaymanager.md)：API 12 基础方法及层级限制。
