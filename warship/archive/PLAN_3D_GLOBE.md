# 3D 球体（地球）渲染改造计划

> 用户已选方案 A：真 3D 球面（Three.js vendored + Phaser 留 UI 壳）。
> 目标：船在一颗很大的球体（地球仪）表面航行，相机第三人称跟随旗舰；玩法逻辑（战斗/风/AI/编队/单侧装填/升级/关卡）**完全保留**，只换"看世界的方式"。

## 设计核心：平面逻辑 → 球面渲染

- 玩法世界坐标仍是平面 `(x, y)`（`WORLD_W × WORLD_H`，保留 wrap 回卷）。
- 渲染层做**经纬度投影**：
  - `lon = (x / WORLD_W) * 2π`  （经度绕一圈 = 平面 x wrap，天然无缝回原点，彻底消除"穿左出右"跳变）
  - `lat = (y / WORLD_H - 0.5) * π`  （纬度范围 ±90°，对应平面 y）
  - 球面点 `P = R * (cos lat cos lon, sin lat, cos lat sin lon)`
- 船朝向：船首方向 `(cos heading, sin heading)` 投影到球面切平面 → 四元数对齐，船"贴"在球面上航行。
- 相机：第三人称，位于旗舰后方（沿其航向）+ 上方一定距离，持续 `lookAt` 旗舰；旗舰阵亡转交不跳镜头。

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `lib/three.min.js` | **新增**：Three.js UMD 版（本地 vendored，`file://` 经典 `<script>` 可跑，零构建） |
| `index.html` | 在 `phaser.min.js` 之后引入 `three.min.js` |
| `src/render3d/GlobeRenderer.js` | **新增**：Three Scene/Renderer/Camera；球体海洋（Sphere + 半透明蓝 + 经纬网格线）；经纬度映射；相机跟随 API `follow(ship)` / `syncCamera()` |
| `src/render3d/ShipMesh.js` | **新增**：程序化低多边形帆船（Box 船体 + 锥/柱桅 + 帆 Plane），敌我配色、船型缩放；`update(ship, time)` 投影定位 + 切向朝向 |
| `src/render3d/FX.js` | **新增**：炮弹小球、命中火花（Points/小方块）、未中水花、航行尾迹浮沫；`spawnHit(x,y,hit)` / `spawnTrail(x,y,heading)` |
| `src/entities/Ship.js` | 渲染挂钩从 `ShipSprite` 改调 `ShipMesh`（保留玩法逻辑、wrap、尾迹触发点） |
| `src/scenes/BattleScene.js` | create 建 `GlobeRenderer`，注入 ships；update 每帧 `renderer.syncAll(ships)` + `syncCamera()`；`spawnHit`/`尾迹`/`海面波光` 改走 `FX`；`_drawSea` 移除（由球体承担）；编队/胜负/wrap/AI 不动 |
| `src/main.js` | 注册不变（Phaser 仍管场景切换/UI）；Three 仅在 Battle 内实例化 |
| `src/ui/HUD.js` / Menu / Result / KeyBind | **不动**（Phaser UI 层） |

## 不变的东西（重点保护）

- `Combat.js` / `Wind.js` / `FleetAI.js` / `RunState.js` / `Upgrades.js` / `levels.js` / `constants.js`（玩法、数值、关卡全保留）。
- 单侧装填、空射距离衰减、编队单纵列跟随、敌护卫舰纯跟随、R 重开、按键设置——全部不动。
- 平面坐标 + wrap：逻辑层仍用平面 `x/y` 与 `Util.wrap`，只是渲染投影成球面；经度 wrap 在视觉上变成"绕地球一圈回来"，比平面跳变更自然。

## 风险与取舍

1. **WebGL 依赖**：Three 渲染需浏览器 WebGL（现代浏览器默认有）。若用户本机极老显卡可能有兼容问题——备选：检测不到 WebGL 时回退提示。
2. **渲染层重写**：战场视觉（海面/船/特效/尾迹）全部换 Three，需重测。玩法逻辑已用冒烟测试覆盖。
3. **相机观感变化**：从"大世界俯视滚动"变为"贴地第三人称"，这是风格升级，符合 3D 期待。
4. **零构建铁律**：用 UMD 版 `three.min.js`（非 ES module），经典 `<script>` 引入，双击 `index.html` 可跑——严格遵守项目铁律。
5. **性能**：球体 + 16 船 + 炮弹/特效，Three 渲染轻松胜任。

## 验证方式

- 拼接 + Phaser stub 冒烟测试（复用既有模式）：覆盖 GlobeRenderer/ShipMesh/FX 初始化 + 若干帧 sync，验证无运行时错误；清理临时文件。
- **本机必验**：`file://` 双击 `index.html`（硬刷新 Ctrl+Shift+R）；WebGL 是否启用；球面海洋观感；相机第三人称跟随是否顺；经度 wrap 是否无缝绕回；编队单纵列在球面上是否仍成列；命中/尾迹特效。

## 落地顺序

1. vendored Three.js + index.html 引入
2. GlobeRenderer（球体 + 相机 + 投影）
3. ShipMesh（船体 3D + 姿态）
4. FX（炮弹/火花/水花/尾迹）
5. BattleScene 接线
6. 冒烟测试 + 本机清单
