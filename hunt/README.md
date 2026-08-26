# 弓猎 / WSADgame

基于 **Godot 4.7**（GDScript）的 3D 小游戏实验集合。

## 包含项目

-   `hunt/` —— **弓猎**：球面星球上的弓箭狩猎游戏。玩家在球形星球表面用弓箭狩猎三种猎物（熊 / 鹿 / 鸟），按积分评优；支持**计时狩猎**与**配额狩猎**两种模式，以及厚皮 / 迅捷 / 蛮力 / 密集 / 贫瘠 / 群鸟 / 惊弓之声 等难度徽章。可导出为 HTML5，在手机浏览器**离线游玩**。
-   `bow/` —— 弓武器原型。
-   `bullet/` —— 弹道原型。

## 玩法与技术

-   球面坐标运动、状态机 AI、节点组信号驱动。
-   操作：移动 `WASD` / 触屏左半屏虚拟摇杆；瞄准与射击 鼠标 / 触屏右半屏拖动蓄力、松手发射；炸蛋 `E` / 触屏按钮。
-   猎物掉落按种类映射：熊→血包、鹿→箭袋（配额模式核心补箭）、鸟→炸蛋。

## 构建与导出

1.  用 Godot 4.7 打开子项目（如 `hunt/project.godot`）。
2.  `Editor → Manage Export Templates` 下载 4.7 导出模板。
3.  `Project → Export → Web` 导出到 `web/`。
4.  将 `docs/` 整包部署到**支持 HTTPS 的静态托管**（GitHub Pages / Netlify）即可游玩；手机首次联网加载后会缓存游戏主体，之后可离线运行（已内置 Service Worker 离线方案）。

> 仓库中已忽略 `.godot/`（编辑器缓存）、`.workbuddy/`（工具数据）以及 `*.wasm` / `*.pck`（HTML5 导出大型二进制，由 Godot 重新导出生成）。

## License

[MIT](LICENSE) © 2026 highwindmx

Powered by WorkBuddy/Godot