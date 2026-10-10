# Android → HarmonyOS 迁移

完整迁移指南已整理到 [GitHub Wiki：Android 迁移](guide/Android-迁移.md)，包括 API 对应、Promise 控制、宿主生命周期、系统权限、配置与位置存储差异。

FloatingX-Harmony 使用原生 ArkTS / ArkUI，以本地 HAR 接入，最低兼容 HarmonyOS 5.0.0（API 12）。Android View / XML / Compose 内容需要改写为带参数的 ArkUI Builder；应用内模式绑定单个已加载的 WindowStage，系统模式受目标平台授权限制。

首次接入请从 [快速开始](guide/快速开始.md)开始。Android 原仓库：[FloatingX](https://github.com/Petterpx/FloatingX)。
