# FloatingX 工具链与验证关口

## 工程基线

这是面向手机、平板的 HarmonyOS Stage 工程：`floatingx` 为唯一 HAR，`entry` 为示例 HAP。正式包版本与 `FLOATINGX_VERSION` 均为 `0.1.0`。示例通过 `file:../floatingx` 引入模块，并从 `floatingx` 包入口导入、显示版本值。

`compileSdkVersion`、`compatibleSdkVersion`、`targetSdkVersion` 固定为 `5.0.0(12)`，`runtimeOS` 为 `HarmonyOS`。开发态 `modelVersion` 固定为 `5.0.0`。这是工程配置基线，不代表本机已安装或验证该 SDK。

[HarmonyOS 5.0.0 官方版本映射](https://developer.huawei.com/consumer/en/doc/harmonyos-releases-V5/overview-V5)列出 DevEco Studio 5.0.0 Release（5.0.3.906），其 SDK 基于 OpenHarmony 5.0.0.71 / API 12 Release。新工具包可运行较早开发态工程，但需要检查实际配套版本。[官方 Hvigor 配置说明](https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-hmos-hvigor-set-options)允许 `modelVersion` 从 `5.0.0` 到当前工具包支持的版本；项目未声明第三方构建插件。`@ohos/hvigor-ohos-plugin` 来自官方工具包配套依赖，不能用旧 API 9 插件替换。

## 官方样例来源与适配

固定参考 [OpenHarmony 官方样例仓库](https://github.com/openharmony/applications_app_samples/tree/3aea9325cd71b5e8769ae4436fb90e417f1af24b)，对应 `OpenHarmony-v5.0.0-Release`：

- `code/DocsSample/ApplicationModels/StageModelAbilityDevelop/`：Stage `AppScope`、module/entry 配置、UIAbility 的 `loadContent('pages/Index')` 生命周期。
- `code/BasicFeature/FileManagement/FileManager/Library/`：HAR 类型、包入口、`harTasks` 和 Stage 构建配置。

这里是依据官方样例整理的最小工程，**没有声称由本机 DevEco 向导生成**。该固定样例仍使用 API 11、Hvigor 4.0.2/3.0.2；这些旧工具版本没有复制进本工程。配置改为 HarmonyOS API 12、`phone/tablet`、统一 `modelVersion: 5.0.0` 与 `export default { system, plugins: [] }` 形式，保留一个 UIAbility，去除样例业务、权限与测试依赖。HAR 任务形态参照[官方 HSP 转 HAR 指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/hsp-to-har)。代码版权说明见 [第三方声明](../THIRD_PARTY_NOTICES.md)。图标是自建 SVG。

## 本机实际环境（2026-10-09 Task 1）

| 组件 | 实测 |
| --- | --- |
| Node.js | `/opt/homebrew/bin/node`，`v20.20.1` |
| TypeScript | 项目依赖 `5.9.3`，`package-lock.json` 锁定版本与完整性 |
| OHPM | `/Users/petterp/Library/Huawei/ohpm/bin/ohpm`，`1.2.0`，不在 PATH |
| Hvigor / hvigorw | PATH、Applications 中未找到配套工具；未安装版本 |
| DevEco Studio | `/Applications`、`~/Applications` 未找到 |
| SDK | `~/Library/Huawei/Sdk/openharmony/9`，API 9 / `3.2.12.5`；hmscore 工具为 API 9 / `3.2.3.6` |
| hdc | API 9 SDK 的 `toolchains/hdc`，`Ver: 1.2.0a`，不在 PATH |

SDK 未发现 `sdk-pkg.json`；实际元数据文件是 `oh-uni-package.json` / `uni-package.json`，已读取其中 `apiVersion` 与 `version`。**API 9 不满足 API 12，不能用它得出构建通过结论。**

[官方 Command Line Tools 获取指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hmos-commandline-get)说明工具包含 Hvigor、OHPM、SDK 等。[下载中心](https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos)在本次匿名 HTTP 读取中只返回动态页面，没有可直接验证的工具包下载链接；这不等于确认下载必须登录。本任务未安装 IDE、未修改全局 PATH/配置、未读取签名材料。后续安装时须记录工具包版本与完整性校验，再复跑下面的关口。

## 安装与编译命令

将官方命令行工具包解压在本地、被忽略的目录。只在当前 shell 配置 `PATH` 和 `DEVECO_SDK_HOME`，按工具包[官方说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hmos-commandline-get)设置；不要在仓库写入绝对 SDK 路径。若所用工具版本需要 `local.properties`，该文件已被忽略。项目不配置签名，下面 HAP 为 unsigned 构建。

```sh
npm ci --ignore-scripts
ohpm install --all
hvigorw --mode module -p module=floatingx@default -p product=default assembleHar --no-daemon
hvigorw --mode module -p module=entry@default -p product=default assembleHap --no-daemon
```

本机 OHPM 1.2.0 不支持 `--all`，实际分别在项目根目录与 `entry/` 执行 `ohpm install`，均退出 0；`entry/oh_modules/floatingx` 的链接指向 `../../floatingx`。新的工具包应使用它自身的 OHPM 与 Hvigor。[官方 Hvigor 命令说明](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-hvigor-commandline)定义 `assembleHar` 与 `assembleHap`；根 npm 提供等价 `build:har`、`build:hap`。它们直接调用真实 `hvigorw`，工具缺失时退出失败，没有成功占位脚本。

预期产物位置为 `floatingx/build/default/outputs/default/floatingx.har` 与 `entry/build/default/outputs/default/entry-default-unsigned.hap`（以实际 Hvigor 输出为准）；本次两者均未生成。复跑成功后，应检查归档内容及 HAP 对 HAR 包的实际编译引用；静态依赖链接不能代替这一步。

## 主机测试命令与当前结果

```sh
npm run build:core
npm run test:core
```

`build:core` 使用项目锁定的 TypeScript，仅编译 `floatingx/src/main/ets/**/*.ts` 至 `work/core`，排除 `.ets` 和 OHPM 依赖。生产源码不添加 Node 专用 `.js` 导入扩展名；测试在 `tests/*.test.mjs`，根 package 保持 CommonJS。

Task 1 尚未引入核心 `.ts` 源码与测试，这两个命令当前都因 `TS18003: No inputs were found` 退出 2。Task 2 添加真实源码与测试后才开始主机测试；这里未加入占位文件或伪测试。

| 关口 | Task 1 结果 |
| --- | --- |
| npm 锁定依赖安装 | 通过；TypeScript 5.9.3 |
| OHPM 安装及本地模块链接 | 通过；OHPM 1.2.0；未生成现代 OHPM lockfile |
| 配置解析、资源引用和版本/包依赖一致性 | 静态核对通过；不代表 SDK 编译 |
| 主机 core 编译/测试 | 未启用；空源码导致 TS18003 |
| HarmonyOS HAR / unsigned HAP 编译 | **未通过**；`hvigorw: command not found`，退出 127 |
| 真机/模拟器验收 | 未执行 |

后续即使主机测试通过，也不改变真实 SDK 编译和设备关口未通过的结论。统筹会话正在另行获取官方 OpenHarmony API 12 SDK；它不等于本任务已经完成 HarmonyOS 商业 SDK 编译。
