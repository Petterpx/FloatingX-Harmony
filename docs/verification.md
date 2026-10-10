# FloatingX 验收记录

验证日期：2026-10-10。对应任务 1–9 的最终生产源码与 Task9 修复；最低兼容/target 为 HarmonyOS 5.0.0(12)。本记录将源码/替身、真实编译、模拟器运行分别列出。**app/scope/system 已有一台 API24 phone 模拟器的部分平台证据；首版全部设备验收仍未完成。**

“实现并通过”只适用于同一行明确写出的验证层；“实现但待平台验收”表示代码存在但缺相应设备证据；“未完成”用于尚未执行的交付验收项，不把构建成功外推为交互通过。

## 构建与测试

| 关口 | 本轮结果 | 证据 |
| --- | --- | --- |
| 工作树实际核心源码编译/测试 | 实现并通过：193/193，fail/skipped/cancelled 均 0 | `work/task9-acceptance-core.log`；`npm run test:core` |
| 官方 API12 严格 ArkTS 核心镜像检查 | 实现并通过：0 diagnostics，16 文件（含声明入口） | `work/task9-acceptance-strict.log` |
| 商业 HarmonyOS SDK26 HAR | 实现并通过：真实 HarCompileArkTS/PackageHar，exit 0 | `work/task9-acceptance-commercial-har.log` |
| 商业 SDK26 全部示例 HAP | 实现并通过：真实 CompileArkTS/PackageHap，exit 0 | `work/task9-acceptance-commercial-hap.log` |
| 商业 SDK26 Hypium HAP | 实现并通过：真实 OhosTestCompileArkTS/PackageHap，exit 0 | `work/task9-acceptance-commercial-hypium.log` |
| 独立消费者安装 packaged 商业 HAR | 实现并通过：仅 entry 源模块、公开 app/scope 入口、source/HAP 无系统权限；OHPM/HAP exit 0 | `work/task9-acceptance-consumer-{ohpm,hap}.log`、`work/task9-acceptance-consumer-proof.json` |
| 公开 OpenHarmony API12 HAR/HAP/Hypium | 实现并通过：三项真实构建 exit 0 | `work/task9-acceptance-public12-{har,hap,hypium}.log` |
| Hypium 真正执行 | 实现并通过：2/2，Failure/Error/Ignore 均 0，TestFinished-ResultCode 0 | `work/task9-hypium-run.log` |
| packaged HAR 消费者 UI smoke | 实现并通过：下列已列出的 phone 模拟器场景，exit 0 | `work/task9-delivery-device-smoke.log`、`work/task9-delivery-device/commands.json` 与逐场景布局 |
| git diff 空白检查 | 提交前通过 | `git diff --check`，完整命令表在 Task9 本地报告 |

编译器固定为商业 SDK **26.0.0.105/API26**，Hvigor/plugin **6.26.8**，OHPM **26.0.0.630**，配套 Node **v24.14.1**；公开 SDK 为 **5.0.0.71/API12**，Hvigor/plugin **5.2.2**。主机测试 Node **v20.20.1**，TypeScript **5.9.3**。版本、设置和重现步骤见 [toolchain.md](toolchain.md)。正式 profile 只移除旧 compileSdkVersion，compatible/target 仍为 12；公开 SDK 的 runtime/device type 映射只发生在 ignored scratch。

商业构建仍含真实警告：phone/tablet 不可用的 system API、异常标注、SYSTEM_FLOAT_WINDOW 权限、命名 @Entry 预览限制和 unsigned。这些警告没有被描述为“干净构建”。无系统权限消费者仍打包同一 HAR 中的 system 实现，但导入/创建 app/scope 不主动访问系统权限或原生浮窗。

## 实际设备

| 设备 | 型号/OS/API | 执行与边界 |
| --- | --- | --- |
| 已有 phone 模拟器 `127.0.0.1:5555` | `param` 报告型号 `emulator`、类型 `phone`、OS `OpenHarmony-6.1.1.125`、API24；1280×2832px | ordinary unsigned sample、test、无权限 consumer 安装与运行；下表 UITest 输入及 Hypium；不等同商业授权设备 |
| API12 phone 真机 | 未提供；OS/API/型号未实测 | 未执行 |
| 其他 phone 真机 | 未提供；OS/API/型号未实测 | 未执行 |
| tablet | 未提供；OS/API/型号未实测 | 未执行；不从 phone 外推 |
| 有批准 SYSTEM_FLOAT_WINDOW 的商业 2in1 | 未提供 | 未执行；不把模拟器 AccessToken 结果当成商业审批 |

使用已有 DevEco hdc 3.2.0f 与已有 daemon，未启动/重启服务。先查自己的 bundle 未安装，再普通安装；后续只替换自己本轮创建的测试包。未读取账号/签名凭证、上传证书、配置 ACL、授予受限权限或修改系统安全设置。

## 对照规格

| 规格/场景 | 源码或替身证据 | API24 phone 模拟器结果与状态 |
| --- | --- | --- |
| §1–2 独立 HAR、Stage、公开 API12 下限 | 商业与公开 SDK 全部构建；单 HAR 与 MIT | 实现并通过（工程/编译）；API12 真机待验收 |
| §3 typed Builder/updateContent、tag 查询、共享命名空间 | api-contract、registry、content-mount；实际 HAR 消费；旧 tag 身份保护 | app/scope 内容实际可见、更新；实现并通过这些场景，所有 tag 场景仅核心通过 |
| §3 Promise 与实际状态、终止取消 | controller、api-contract、Hypium 的未挂载 scope/cancel/DESTROYED；show 意图与实际状态分离 | scope hide/show、cancel 后 show 不复活；实现并通过 |
| §4 scope 内容区、挂载/重挂、业务结束 | scope 真实类替身测试 | 实际重挂恢复、终止取消；实现并通过 |
| §4 app 空白层透传/内按钮 | 原生 UI 层单独编译；不拿替身当命中证明 | 实际底层按钮与内按钮均响应；实现并通过 |
| §4 app router/Navigation 黑名单 | page-filter、app-platform | 两种实际页面拒绝与返回恢复均通过；实现并通过 |
| §4 app 白名单、未知页、多窗口 | 精确名单、独立 Host 与销毁测试 | 未运行相应 native 多实例/多窗口；实现但待平台验收 |
| §4 app 后台与显式 hide 意图 | app-platform/controller | Home→重新打开恢复；先 hide 后 Home→打开仍 hidden；实现并通过这些场景 |
| §4 Dialog 层级 | OverlayManager 接入与原生 Dialog 示例已编译 | 尚未实际重叠验证；实现但待平台验收 |
| §4 system 首次权限/能力检查、默认拒绝、显式 fallback | system/api-contract 替身覆盖拒绝/清理/实际 scope；商业 compiler 标注 phone/tablet 不可用 | 同 packaged HAR 的 strict 实际显示，未声明权限的消费者返回 PERMISSION_DENIED；显式 fallback 回调 actualScope=app 并关闭通过；实现并通过这些模拟器场景 |
| §4 system 跨应用显示、所属 UIAbility 生命周期 | 独立 owner、取消与原生错误释放测试 | 模拟器 TYPE_FLOAT 显示、getX/Y 与物理坐标一致、拖动最终坐标、DisplayOnly 重叠透传、hide/show、所属句柄关闭通过；真正跨应用/Ability 销毁及商业授权仍待验收 |
| §5 九宫格、六吸附、零坐标、margin、越界、超大内容、无效配置 | config/geometry 原生产算法全部通过 | 四边拖动及投影实测；九宫格全部入口/所有数值边界未逐一 native 操作；对应核心通过、完整设备待验收 |
| §5 Normal 拖动不误点、ClickOnly | touch/scope/system 核心与真实类替身 | UITest swipe 改变位置且没有 click；ClickOnly 不移动且内按钮恢复可点；实现并通过 |
| §5 主触点、双指、取消不是点击、长按间隔 | touch/scope/system 测试 | 双指与完整长按/取消手势组合未执行；实现但待平台验收；UITest `drag` 自带长按不作为 swipe 的拖动证据 |
| §5 DisplayOnly 内容不可交互且透传 | hit-test 文档与原生回归，已修复子节点仍参与命中 | 让内按钮与外按钮重叠后实际点到外按钮；恢复 Normal/ClickOnly 后内按钮响应；实现并通过（scope） |
| §5 显隐/移动动画、过期回调 | animation/controller/scope/system | 真实 show/hide/program move 已刷新；抢占/迟到动画仍主要为替身证据；实现但待完整平台验收 |
| §5–6 半隐藏四边、完整尺寸、命中区与展开 | geometry、system、content-mount、scope | scope 四边稳定半尺寸、完整内容始终 220×110vp，关闭半隐藏后展开；实现并通过；system 四边未执行，仍待平台验收 |
| §6 同节点内容尺寸变化与 px/vp | 当前 UIContext 转换、私有完整测量、native 树尺寸通知、迟到观察者测试 | 同商业 packaged HAR 的无权限 resize fixture，在半隐藏时 220→260→180vp，投影为 110→130→90vp；同 native Column id；实现并通过此尺寸路径 |
| §6 旋转、分屏、缩放、安全区、键盘 | geometry restore、目标显示屏/密度替身测试与宿主适配代码 | 实际旋转/分屏/键盘/多密度显示屏切换未执行；实现但待平台验收；当前普通主窗口不能代表这些场景 |
| §6 Preferences 重启恢复、异步 load/save/clear | storage（含真实 Preferences 类边界）、恢复前首次显示、move 作废迟到 load | 真正跨进程 Preferences 重启未执行；实现但待平台验收 |
| §7 队列、move 合并、重入回调、错误可见且不泄露业务内容 | controller/api-contract/storage；测试含 secret business payload 消毒断言 | 核心通过；设备故障注入/全量 native 资源统计未执行 |
| §7 资源释放、旧实例/旧回调不复活 | 下表；content/scope/system 受影响回归及193全量通过 | scope cancel 后内容移除且 show 不复活；其他 native 资源必须保留对应边界，不声称全模式释放实测通过 |
| §8 示例/中文文档与交付 | 四入口、配置、迁移与当前工具链文档 | 示例编译与上述 UI 通过；完整人工设备矩阵未完成；不发布/推送/上传签名 |

## 资源释放核对

| 资源 | 实现/回归检查 | 平台证据限制 |
| --- | --- | --- |
| 原生窗口 | system 取消/部分创建失败先销毁；销毁错误拒绝；清理失败不 fallback | 实际系统 owner close 已移除内容；真正跨应用和窗口泄漏统计未执行 |
| 原生/本地监听 | FxWindowHost 每个 off 独立尝试；app host/view 解除；system display 解除；content own size observer 清除 | Node 测试验证 off 失败也继续释放；没有宣称真实窗口全部监听计数为零 |
| 内容节点/私有 frame/slot | removeFrameNode、FrameNode.dispose、ComponentContent.dispose 全部尝试；部分桥接失败全释放；不递归双 dispose | 实际 scope cancel 内容消失、同节点更新与重挂；完整 native heap 泄漏检查未执行 |
| 计时器/动画 | scope 长按 clearTimeout、动画世代作废；system frame clock cancel、矩形事件等待的1秒失败上限与销毁取消/off | fake clock/迟到回调测试；无 native 长时压力结论 |
| registry/身份 | cancel 无论 native 成败释放本地 tag；uninstallAll 等待所有项并保留每 tag 错误 | 主机与 Hypium 防御副本通过；系统真实多实例压力待验收 |
| 迟到恢复/布局/内容/创建结果 | 世代、已释放 mount 身份、disposed observer、页面 owner 队列 | 生产代码回归通过；设备 scope 终止不复活，其他竞态为替身证据 |
| 错误回调 | 同步/异步异常只写消毒日志、不递归 ERROR、不阻塞重入队列 | 193 项中的相关生产行为断言；本轮设备只打印示例测试内容和数值 code |

## 本轮实际失败与修复

1. 首次 renderer 没有消费 revision，初始 content 条件不刷新：现在每个 ArkUI 快照表达式显式依赖 revision。
2. 直接 ComponentContent 传给 ContentSlot 没有挂载 builder 子树：采用私有 NodeContent/FrameNode 桥，typed 节点的更新/释放仍私有。同 API12 [官方示例](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-5.0.0-Release/zh-cn/application-dev/reference/apis-arkui/js-apis-arkui-ComponentContent.md) 的挂载路径。
3. 原裁剪 Stack 报可见面积为完整尺寸，半隐藏递归收缩：独立完整测量树，以当前 UIContext 转换 px/vp，通过自己 frame 的 size observer 处理同节点动态变化；不覆盖业务根节点回调。参见 [FrameNode 测量 API](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-5.0.0-Release/zh-cn/application-dev/reference/apis-arkui/js-apis-arkui-frameNode.md)。
4. DisplayOnly 的 None 仍让原生子按钮命中：整棵内容额外 enabled(false)，恢复其他模式后 enabled(true)。[官方 HitTestMode 说明](https://raw.githubusercontent.com/openharmony/docs/OpenHarmony-5.0.0-Release/zh-cn/application-dev/reference/apis-arkui/arkui-ts/ts-universal-attributes-hit-test-behavior.md) 明确 None 不阻塞子节点。
5. 示例 BuilderParam 的 this 指向子 Host，父 message 空白：使用闭包保持父页面状态与按钮拥有者。
6. 系统原生 resize/move 在首次 show 前已成功，属性矩形仍为 0×0；对无效矩形 rollback 又报401，掩盖初错。以透明、内容 Hidden、touch/focus false 的预就绪 show 提交初始矩形；无效旧矩形不 rollback，正式 show 才恢复交互。
7. 单个 idle 帧仍返回拖动的旧尾点。改为 API12 windowRectChange 实际矩形事件确认、提交前监听、串行投影、无变化直接返回，支持合法夹取的 actual 坐标。预就绪也消耗首次延迟事件，正式 show 不覆盖确认值；timeout/destroy 解除精确监听，缺少该能力时明确拒绝。

RED 证据为修复前真实布局 `work/task9-consumer-layout.json`、DisplayOnly 失败日志 `work/task9-final-device-smoke.log`、content bridge/裁剪测量失败测试、系统原生 projection/rollback 阶段日志及 `work/task9-system-events-device.log` 的旧位置断言失败。GREEN 为 `work/task9-delivery-device-smoke.log`、`work/task9-resize-device.log`、`work/task9-events-preparation-device.log` 及最终 193/193 核心测试。旧失败 smoke 不记为通过。

## 模拟器 system 与产物证据边界

普通安装的系统测试消费者只声明原有 SYSTEM_FLOAT_WINDOW；模拟器 checkAccessToken 返回已授予，未更改安全设置/ACL/授权。首次 strict getter20,100vp 对应物理70,350px；拖动100px后 getter48.5714,128.5714vp 对应物理170,450px。DisplayOnly 系统内容仍可见，UITest 不提供该不可交互窗口的树，因此另用截图与实际重叠点击底层 app 关闭按钮验收；坐标和 visible 状态稳定。恢复 Normal、hide/show、owner close 均通过。无权限独立包实际 strict PERMISSION_DENIED、显式 fallback 回调 actualScope=app、关闭通过。日志 `work/task9-events-preparation-device.log`，早一轮相同可见内容/交互配置截图 `work/task9-system-displayonly.png`；最终 fixture HAR/源码相等证明与 SHA 在 `work/task9-final-device-proof.json`。

app/scope 的完整 smoke 和动态尺寸实测使用先前商业 HAR `ef366cf7af4d28ff5bc76a2d94f1c9e763b01d13550b49b3c0c311c2fac8eb0f`，对应 `task9-delivery-*`；其后仅修改 system 原生边界，最终 HAR 的 app/scope/content 源文件逐字一致证明保存在上述 proof。没有声称把22项旧 smoke 重新完整运行在新哈希包；新 system 消费者使用实际 packaged HAR，其完整库源码与最终 HAR 逐字一致（包字节哈希不同，分别记录），实际执行上述受影响回归。Hypium2/2亦保留执行时产物哈希，刷新后的测试HAP只做最终构建，不冒充重新运行。

[HarmonyOS V5 政策](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/restricted-permissions-V5)将 SYSTEM_FLOAT_WINDOW 限定为批准的 2in1 场景。模拟器正向 TYPE_FLOAT 不能证明商业授权。system hide 保留 native 窗口，隐藏内容并禁 touch/focus，cancel 才销毁；透明阴影、焦点、真正跨应用及 system 半隐藏四边仍需合规设备验收。

## 继续验收

未完成的交付项：API12 phone 真机、tablet；实际旋转/分屏/键盘/安全区变化；双指完整组合；Dialog 真正重叠层级；原生 Preferences 重启；所有 gravity/多实例/native 故障压力；有批准商业系统设备上的跨应用显示、尺寸/四边、hide 阴影/焦点/触摸及 Ability owner 销毁。按 §8 逐项补型号、OS/API、动作、结果和证据，失败后只重跑受影响测试/构建。

最终七个 HAR/HAP 的路径、大小和 SHA256 在 `work/task9-acceptance-artifacts.json`；可复现命令与完整原始退出码在 `work/task9-commands.json`，设备 smoke 逐条命令在 `work/task9-delivery-device/commands.json`。本地 SDD Task9 报告记录自审与提交，独立 Task9/整分支审查由统筹在提交后执行，不能把本次自审称为独立审查已完成。
