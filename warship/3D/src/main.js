// 游戏入口：Phaser 配置 + 场景注册（Menu → Battle → Result）。
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: C.VIEW_W,
  height: C.VIEW_H,
  transparent: true,        // 关键：Phaser canvas 整体透明，只画 UI/HUD，露出底层 Three 球体
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, KeyBindScene, BattleScene, ResultScene],
};
const game = new Phaser.Game(config);
