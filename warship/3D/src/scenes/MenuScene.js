// 主菜单：开始新游戏（重置 run 状态），进入第一关；并可进入按键设置。
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const W = C.VIEW_W, H = C.VIEW_H;
    this.cameras.main.setBackgroundColor('#0e2e38');

    this.add.text(W / 2, 120, '风帆王者', { fontSize: '48px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(W / 2, 175, '抢风位 · 摆舷侧 · 齐射灌伤', { fontSize: '18px', color: '#cfeede' }).setOrigin(0.5);

    // 开始按钮（点击触发，避免与设置按钮的 pointerdown 冲突）
    this._menuButton(W / 2, 280, '开始游戏（空格）', () => {
      RunState.reset();
      this.scene.start('Battle', { levelIndex: 0 });
    });

    // 按键设置入口
    this._menuButton(W / 2, 350, '按键设置', () => {
      this.scene.start('KeyBind');
    });

    // 显示当前键位（从 KeyMap 读取，反映玩家自定义）
    const km = KeyMap.load();
    const line = '帆力 ' + km.thrust[0] + '    左转 ' + km.left[0] + ' / 右转 ' + km.right[0] +
                 '    左舷 ' + km.port[0] + ' / 右舷 ' + km.starboard[0];
    this.add.text(W / 2, 440, line, { fontSize: '15px', color: '#9fd9c8' }).setOrigin(0.5);

    // 空格全局开始（保留快捷方式）
    this.input.keyboard.once('keydown-SPACE', () => {
      RunState.reset();
      this.scene.start('Battle', { levelIndex: 0 });
    });
  }

  _menuButton(x, y, label, cb) {
    const w = 260, h = 54;
    const r = this.add.rectangle(x, y, w, h, 0x1b5566, 1).setStrokeStyle(2, 0x6fd3c0).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    r.on('pointerover', () => r.setFillStyle(0x2a7286));
    r.on('pointerout', () => r.setFillStyle(0x1b5566));
    r.on('pointerdown', cb);
    return r;
  }
}
