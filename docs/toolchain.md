# FloatingX 构建与工具链

最低兼容和 target 保持 **HarmonyOS 5.0.0(12)**；正式配置为 `runtimeOS: HarmonyOS`、`phone/tablet`。根 profile 不声明 `compileSdkVersion`，由当前 DevEco 配套 SDK 编译。DevEco 26 对显式旧 compile API12 报 `00303313`；移除这一项不提高最低版本。下面固定的是实测编译器版本，不能从较新 SDK 构建推断 API12 设备运行通过。

## 已验证版本（2026-10-10）

| 环境 | 精确版本 | 用途 |
| --- | --- | --- |
| DevEco 配套商业 HarmonyOS SDK | API26，26.0.0.105 Release | 正式 HarmonyOS profile 的 HAR、示例 HAP、Hypium HAP、packaged HAR 消费编译 |
| Hvigor / ohos-plugin | 均为 6.26.8 | 上述商业构建 |
| DevEco 配套 Node / OHPM | v24.14.1 / 26.0.0.630 | 商业构建、官方 OHPM 安装 |
| 主机 Node / TypeScript | v20.20.1 / 5.9.3 | 实际生产核心源码测试，npm lock 锁定 |
| 官方 OpenHarmony 公共 SDK | API12，5.0.0.71 | 最低公开 API 的真实 ArkTS、HAR/HAP/Hypium 编译 |
| 公共 SDK 构建 Hvigor / plugin | 均为 5.2.2 | API12 独立验证 |
| DevEco hdc | 3.2.0f | 现有 API24 phone 模拟器验证 |

商业 SDK 版本从配套 `sdk-pkg.json` / ETS 元数据读取；Hvigor、plugin、Node、OHPM 分别核对实际版本。工程 `modelVersion` 为 5.0.0。完整环境和命令保存在本地 `work/task9-commands.json`，验收结果见 [verification.md](verification.md)。

## 商业 SDK 构建

使用同一 DevEco 安装内配套的 Node、OHPM、Hvigor 和 SDK。路径只在当前 shell 或被忽略的 `local.properties` 中设置；证书、profile/ACL、密码和本机 SDK 绝对路径不进入 Git。

```sh
# DEVECO_HOME 指向你本地的 DevEco app 目录，仅在本地 shell 设置。
export PATH="$DEVECO_HOME/Contents/tools/node/bin:$DEVECO_HOME/Contents/tools/ohpm/bin:$DEVECO_HOME/Contents/tools/hvigor/bin:$PATH"
export DEVECO_SDK_HOME="$DEVECO_HOME/Contents/sdk"
node --version
ohpm --version
hvigorw --version
npm ci --ignore-scripts
npm run test:core
ohpm install --all
npm run build:har
npm run build:hap
hvigorw --mode module -p module=entry@ohosTest -p product=default assembleHap --no-daemon
```

官方 OHPM 安装成功；根 lock 固定 Hypium 1.0.29 的官方 registry URL 与完整性，entry lock 使用相对本地 HAR 模块路径。两份 lock 不含本机绝对路径或签名信息。生产 HAR 不声明系统权限，Hypium 只为开发依赖。

本轮最终产物：

| 产物 | 实际本地产物路径 |
| --- | --- |
| 商业 HAR | `work/task9-review-delivery-commercial/floatingx/build/default/outputs/default/floatingx.har` |
| 商业示例 HAP | `work/task9-review-delivery-commercial/entry/build/default/outputs/default/entry-default-unsigned.hap` |
| 商业 Hypium HAP | `work/task9-review-delivery-commercial/entry/build/default/outputs/ohosTest/entry-ohosTest-unsigned.hap` |
| 无系统权限消费者 HAP | `work/task9-review-delivery-consumer/entry/build/default/outputs/default/entry-default-unsigned.hap` |

产物、完整日志和本机工具留在被忽略的 `work/`，未发布 OHPM、创建云端仓库或上传签名。SHA256、大小记录在 `work/task9-review-delivery-artifacts.json`。正常在根仓库构建时，输出位于对应模块的 `build/default/outputs/`。

真实商业构建有警告：system API 不适用于 phone/tablet、可能抛异常、需要 SYSTEM_FLOAT_WINDOW、HAR 命名 @Entry 的预览限制，以及未配置签名。所有这些构建退出 0，但不是无警告结果；预览警告不能代替命名路由运行验收。

## packaged HAR 消费验证

消费者只保留 entry workspace module，删除 floatingx 源码模块；OHPM 依赖改为 `file:../floatingx.har`，安装上表实际商业 HAR，页面只使用公开 app/scope 接口。消费者源码与 packaged HAP `module.json` 都不含 SYSTEM_FLOAT_WINDOW；HAR SHA 和权限断言保存在 `work/task9-review-delivery-consumer-proof.json`。因此这项验证使用实际打包产物，并非源模块软链接。

## 公开 API12 验证

官方 SDK 来自 [OpenHarmony 5.0.0 Release](https://github.com/openharmony/docs/blob/master/zh-cn/release-notes/OpenHarmony-v5.0.0-release.md) 的 ARM Mac 公共包；下载 SHA256 与官方 sidecar 一致。官方 Hvigor/plugin 5.2.2 来自 HarmonyOS npm registry。工具均只放本地 `work/toolchains/`。

在独立 scratch 中将 profile 的 compile/compatible/target 映射为数字 `12`，`runtimeOS` 映射为 OpenHarmony，商业 `phone` 映射为公开 SDK 的 `default`，保留 tablet。正式商业源配置未被这些映射改写。

```sh
# SDK 和工具绝对路径仅由本地环境变量提供。
NODE_PATH="$PUBLIC_HVIGOR/node_modules" OHOS_SDK_HOME="$PUBLIC_SDK" \
node "$PUBLIC_HVIGOR/node_modules/@ohos/hvigor/bin/hvigor.js" \
  --mode module -p module=floatingx@default -p product=default assembleHar --no-daemon
# 示例 / Hypium：模块换为 entry@default / entry@ohosTest，任务换为 assembleHap。
```

最终 API12 三项构建均退出 0；产物在 `work/task9-review-delivery-public12/` 对应模块输出目录。另用该 SDK 的真实 ArkTS linter 对实际 `.ts` 核心源码建立 `.ets` 镜像：16 个文件（含声明入口），0 diagnostics。它只证明该核心子集，完整 native `.ets` 由上述真实 HAR/HAP 编译证明。

`npm run test:core` 先从工作树实际 `.ts` 编译到 `work/core/`，再运行 Node 测试；native 类的行为测试转译实际 `.ets` 并替换 SDK 边界，不复制生产算法。它们不模拟 ArkUI 渲染，也不能证明设备触摸或系统窗口授权。

## 设备执行

已有目标报告 `emulator` / `phone` / `OpenHarmony-6.1.1.125` / API24。普通 unsigned 安装成功；这只反映该模拟器环境，不表示商业真机同样允许 unsigned 包。先确认我们的 bundle 未安装，后续只更新自己的测试包；没有读取签名材料或修改平台安全、权限及 ACL。

```sh
hdc list targets
hdc -t "$TARGET" shell 'param get const.product.model'
hdc -t "$TARGET" shell 'param get const.ohos.apiversion'
hdc -t "$TARGET" shell 'param get const.ohos.fullname'
hdc -t "$TARGET" shell 'bm dump -n com.petterp.floatingx.consumer'
hdc -t "$TARGET" install "$CONSUMER_HAP"
python3 tests/device-smoke.py --hdc "$HDC" --target "$TARGET" \
  --bundle com.petterp.floatingx.consumer --output work/device-smoke
```

smoke 脚本仅操作自己的 sample/consumer bundle；不安装、签名、授权、切换系统配置或启动服务。它记录每条 hdc 命令、返回值和实际布局快照。设备场景结果及未执行项目逐项见 [verification.md](verification.md)。

## 工程来源与历史证据

Stage/HAR 骨架依据固定 [OpenHarmony 官方样例](https://github.com/openharmony/applications_app_samples/tree/3aea9325cd71b5e8769ae4436fb90e417f1af24b)，不是声称由当前 DevEco 向导生成。参考 StageModelAbilityDevelop 与 FileManager/Library；未复制样例旧 API11/Hvigor 版本。保留适用 Huawei Apache-2.0 头部，库使用 MIT，见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

2026-10-09 初查仅有 API9 SDK、OHPM1.2.0、缺配套 Hvigor，Task1 构建退出127；随后取得 API12 公共 SDK。中途 API21 要求已被用户恢复 API12 的决定取代。2026-10-10 新 DevEco 商业 SDK26 可用后才取得商业构建和本轮设备证据。早期失败与任务记录保存在本地 SDD 报告及 work 日志，不能当作当前环境结论。

系统许可仍遵循 [HarmonyOS V5 受限权限政策](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-v5/restricted-permissions-V5)：SYSTEM_FLOAT_WINDOW 是 system_grant，限批准的 2in1 多方视频/屏幕共享场景。声明权限、构建成功、模拟器安装均不扩展该政策。签名 [ACL 支持说明](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/ide-signing-auto) 也不是手机/平板系统浮窗许可。
