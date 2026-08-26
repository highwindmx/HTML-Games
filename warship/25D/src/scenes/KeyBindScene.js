// 按键设置场景：列出可绑定动作，点击后捕获下一个按键作为新绑定，保存到 localStorage。
// 从 Menu 进入，返回 Menu。BattleScene 启动时通过 KeyMap.load() 读取这里的配置。
class KeyBindScene extends Phaser.Scene {
  constructor() { super('KeyBind'); }

  create() {
    const W = C.VIEW_W, H = C.VIEW_H;
    this.cameras.main.setBackgroundColor('#0e2e38');

    this.add.text(W / 2, 50, '按键设置', { fontSize: '36px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(W / 2, 92, '点击右侧按键，再按下你想绑定的新键（ESC 取消）', { fontSize: '14px', color: '#9fd9c8' }).setOrigin(0.5);

    this.km = KeyMap.load();
    this.capturing = null;
    this.rows = {};

    let y = 150;
    for (const act of KeyMap.ACTIONS) {
      this.add.text(W / 2 - 170, y, KeyMap.LABELS[act], { fontSize: '18px', color: '#ffffff' }).setOrigin(0, 0.5);
      const btn = this.add.rectangle(W / 2 + 120, y, 130, 38, 0x1b5566).setStrokeStyle(2, 0x6fd3c0).setInteractive({ useHandCursor: true });
      const txt = this.add.text(W / 2 + 120, y, this._keyLabel(act), { fontSize: '16px', color: '#ffd34d' }).setOrigin(0.5);
      btn.on('pointerdown', () => this._beginCapture(act));
      this.rows[act] = { btn, txt };
      y += 56;
    }

    // 恢复默认 / 返回菜单
    this._menuButton(W / 2 - 130, y + 20, '恢复默认', () => {
      this.km = KeyMap.reset();
      this._refresh();
    });
    this._menuButton(W / 2 + 130, y + 20, '返回菜单', () => {
      this.scene.start('Menu');
    });

    // 捕获键盘（方向键/空格不加捕获也不会滚动页面，但稳妥起见锁定）
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    this.input.keyboard.on('keydown', (e) => this._onKey(e));
  }

  _keyLabel(act) {
    return this.km[act].join(' / ');
  }

  _refresh() {
    for (const act in this.rows) this.rows[act].txt.setText(this._keyLabel(act));
  }

  _beginCapture(act) {
    this.capturing = act;
    if (this._captureText) this._captureText.destroy();
    this._captureText = this.add.text(W / 2, 120, '请按下「' + KeyMap.LABELS[act] + '」的新按键（ESC 取消）', { fontSize: '16px', color: '#ffd34d' }).setOrigin(0.5);
  }

  _onKey(e) {
    if (!this.capturing) return;
    const name = KeyMap.nameFromEvent(e);
    const act = this.capturing;
    this.capturing = null;
    if (this._captureText) { this._captureText.destroy(); this._captureText = null; }
    if (name === 'ESC') return;   // 取消绑定
    if (!name) return;            // 不支持的键，忽略
    this.km[act] = [name];
    KeyMap.save(this.km);
    this._refresh();
  }

  _menuButton(x, y, label, cb) {
    const w = 200, h = 46;
    const r = this.add.rectangle(x, y, w, h, 0x1b5566, 1).setStrokeStyle(2, 0x6fd3c0).setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    r.on('pointerover', () => r.setFillStyle(0x2a7286));
    r.on('pointerout', () => r.setFillStyle(0x1b5566));
    r.on('pointerdown', cb);
    return r;
  }
}
