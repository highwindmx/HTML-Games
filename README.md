# HTML-Games

个人小游戏合集 —— 零构建、双击即玩的 Web / HTML5 游戏，每款游戏一个独立子目录，后续新增游戏直接加目录即可。

## 游戏一览

| 目录 | 游戏 | 技术栈 | 玩法 | 运行方式 |
|------|------|--------|------|----------|
| `gravity/` | **Gravity · 引力弹道解谜** | 原生 HTML/CSS/JS，单文件 | 弹弓式发射无动力火箭，借行星引力场绕行命中目标；预测线与实飞共用同一积分器，保证"所见即所飞" | 浏览器直接打开 `index.html` |
| `hunt/` | **弓猎** | Godot 4.7 (GDScript)，可导出 HTML5；`web/` 另有 Three.js 纯网页复刻版 | 球形星球表面弓箭狩猎：熊 / 鹿 / 鸟三种猎物，计时狩猎与配额狩猎双模式，厚皮 / 迅捷 / 蛮力等难度徽章；支持触屏虚拟摇杆 + PWA 离线游玩 | 浏览器打开 `web/index.html`（网页版）；或用 Godot 4.7 打开 `hunt/project.godot` 编辑，`docs/` 为 HTML5 导出产物可直接部署 |
| `warship/` | **风帆王者** | Phaser 3 + Three.js（本地 vendored，无需服务器） | 风帆舰队海战：借风向操舵、侧舷齐射、舰队 AI、编队与升级、关卡推进 | 浏览器直接打开 `25D/index.html`（2.5D 俯视版）或 `3D/index.html`（3D 球面版） |

> warship 的 `archive/` 为早期"风帆舰队对轰"原型，`smoke.js` 为无头冒烟测试脚本（Node 驱动 Phaser 桩跑通战斗场景）。

## 目录结构

```
HTMLGames/
├── gravity/          # 引力弹道解谜（单文件 MVP + 设计文档）
│   ├── index.html
│   ├── 设计计划.md
│   └── 关卡设计梳理.md
├── hunt/             # 弓猎（Godot 4.7）
│   ├── hunt/         # Godot 工程源码
│   ├── web/          # Three.js 纯网页复刻版
│   ├── docs/         # Godot HTML5 导出产物（GitHub Pages 部署目录）
│   ├── bow/          # 弓武器原型
│   └── bullet/       # 弹道原型
└── warship/          # 风帆王者（Phaser 3）
    ├── 25D/          # 2.5D 俯视版
    ├── 3D/           # 3D 球面版（Three.js 地球仪）
    ├── archive/      # 早期原型
    └── smoke.js      # 冒烟测试
```

## 约定

- **零构建**：不使用 npm / bundler，第三方库一律本地 vendored（`lib/` 目录），经典 `<script>` 标签按依赖顺序加载，双击 HTML 即可离线游玩。
- **一游戏一目录**：新增游戏时新建独立子目录，自带 README（可选）与 LICENSE 遵循根协议。
- Godot 工程忽略 `.godot/`（编辑器缓存）与 `.venv/`（本地虚拟环境）；大型二进制 `*.wasm` / `*.pck` 仅 `hunt/docs/` 部署目录例外保留。

## License

[MIT](LICENSE) © 2026 highwindmx
