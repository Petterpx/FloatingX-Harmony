# FloatingX-Harmony Wiki

原生 ArkTS / ArkUI 悬浮窗库，最低兼容 HarmonyOS 5.0.0（API 12），通过一个本地 HAR 接入。

[仓库首页](https://github.com/Petterpx/FloatingX-Harmony) · [Android 版文档](https://github.com/Petterpx/FloatingX/wiki)

## 先选择作用范围

| 模式 | 使用场景 | 接入入口 | 释放方式 |
| --- | --- | --- | --- |
| 局部 scope | 页面或组件范围内的悬浮工具 | `createScope` + `FloatingXHost` | 业务结束 `cancel()` |
| 应用内 app | 同一主窗口内跨页面浮层 | `installApp` + `FxWindowHost` | 业务结束 `cancel()`；Stage 结束 `host.dispose()` |
| 系统 system | 需要独立原生窗口的场景 | `installSystem` + `UIAbilityContext` | 拥有者显式 `cancel()` |

局部和应用内模式无需系统浮窗权限。系统模式依赖受限权限与目标设备能力，声明权限并不代表获得授权。普通商业手机 / 平板系统权限尚未验收。

## 文档导航

- [快速开始](快速开始.md) — HAR 安装与完整最小示例
- [局部浮窗](局部浮窗.md) — 组件宿主与重挂
- [应用内浮窗](应用内浮窗.md) — WindowStage、页面黑白名单
- [系统浮窗](系统浮窗.md) — 权限、显式降级与释放
- [配置与交互](配置与交互.md) — 定位、吸附、半隐藏、动画与手势
- [位置存储](位置存储.md) — 内存、Preferences 与恢复
- [API 速查](API-速查.md) — 控制器、事件与错误
- [常见问题](常见问题.md) · [Android 迁移](Android-迁移.md)

## 完整示例

- [ScopeDemo.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/ScopeDemo.ets)
- [AppDemo.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/AppDemo.ets)
- [MultipleDemo.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/MultipleDemo.ets)
- [SystemDemo.ets](https://github.com/Petterpx/FloatingX-Harmony/blob/main/entry/src/main/ets/pages/SystemDemo.ets)

在 DevEco Studio 打开仓库，选择 `entry` 模块运行；系统页应在具备对应权限和能力的环境使用。首页的 GIF 录自 API 24 模拟器，仅展示对应操作的效果。
