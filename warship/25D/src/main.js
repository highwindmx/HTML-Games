// 全局文本修复：未指定 fontFamily 时，Phaser 默认按 Arial 度量中文纹理高度，
// 浏览器渲染回退到 CJK 字体（ascent 更大）→ 文本顶部被裁掉一截。
// 这里统一注入中文字体 + 内边距，所有 scene 的 add.text 自动生效，根治"顶部被削"。
(function () {
  const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Heiti SC", "WenQuanYi Micro Hei", sans-serif';
  const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    style = style || {};
    if (style.fontFamily === undefined) style.fontFamily = FONT_FAMILY;
    if (style.padding === undefined) style.padding = { top: 6, bottom: 4, left: 3, right: 3 };
    return origText.call(this, x, y, text, style);
  };
})();

// 游戏入口：Phaser 配置 + 场景注册（Menu → Battle → Result）。
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: C.VIEW_W,
  height: C.VIEW_H,
  backgroundColor: '#0b2a36',    // 深海蓝：2.5D 下由 Phaser 直接画海面背景（不透明，非透明 UI 层）
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MenuScene, KeyBindScene, BattleScene, ResultScene],
};
const game = new Phaser.Game(config);
