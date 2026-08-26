// 结算：胜利 → 三选一升级 draft（roguelike）→ 下一关；败北 → 重试/回主菜单。
class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  init(data) {
    this.win = !!data.win;
    this.levelIndex = data.levelIndex || 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0e2e38');
    if (this.win) this._buildWin();
    else this._buildLose();
  }

  _buildWin() {
    const W = C.VIEW_W, H = C.VIEW_H;
    this.add.text(W / 2, 56, '胜利！', { fontSize: '44px', color: '#2ecc71', fontStyle: 'bold' }).setOrigin(0.5);

    const isLast = this.levelIndex + 1 >= Levels.length;
    if (isLast) {
      this.add.text(W / 2, H / 2, '全部关卡通关！\n按空格回主菜单', { fontSize: '26px', color: '#ffd34d', align: 'center' }).setOrigin(0.5);
      const back = () => { RunState.reset(); this.scene.start('Menu'); };
      this.input.keyboard.once('keydown-SPACE', back);
      this.input.once('pointerdown', back);
      return;
    }

    this.add.text(W / 2, 104, '选择一项舰队强化（三选一）', { fontSize: '18px', color: '#cfeede' }).setOrigin(0.5);

    const cards = Upgrades.draw(3);
    const cw = 240, ch = 160, gap = 30;
    const totalW = cards.length * cw + (cards.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const colorMap = { 进攻: 0x8e3b3b, 机动: 0x3b6b8e, 生存: 0x3b8e5a };

    cards.forEach((card, i) => {
      const x = startX + i * (cw + gap) + cw / 2;
      const y = H / 2 + 10;
      const rect = this.add.rectangle(x, y, cw, ch, colorMap[card.cat] || 0x444444, 0.92).setDepth(10000).setInteractive();
      rect.setStrokeStyle(2, 0xffd34d);
      this.add.text(x, y - 50, card.name, { fontSize: '22px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10001);
      this.add.text(x, y - 18, '[' + card.cat + ']', { fontSize: '13px', color: '#ffd34d' }).setOrigin(0.5).setDepth(10001);
      this.add.text(x, y + 20, card.desc, { fontSize: '14px', color: '#e8f5ef', align: 'center', wordWrap: { width: cw - 24 } }).setOrigin(0.5).setDepth(10001);
      rect.on('pointerdown', () => this._choose(card));
    });
  }

  _choose(card) {
    RunState.applyCard(card);
    RunState.levelIndex = this.levelIndex + 1;
    this.scene.start('Battle', { levelIndex: RunState.levelIndex });
  }

  _buildLose() {
    const W = C.VIEW_W, H = C.VIEW_H;
    this.add.text(W / 2, H / 2 - 60, '败北', { fontSize: '44px', color: '#e24b4a', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 - 14, '舰队被击沉', { fontSize: '18px', color: '#cfeede' }).setOrigin(0.5);

    const retry = this.add.rectangle(W / 2 - 110, H / 2 + 70, 180, 50, 0x2e6b8e, 0.92).setDepth(10000).setInteractive();
    this.add.text(W / 2 - 110, H / 2 + 70, '重试本关', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setDepth(10001);
    retry.on('pointerdown', () => this.scene.start('Battle', { levelIndex: this.levelIndex }));

    const menu = this.add.rectangle(W / 2 + 110, H / 2 + 70, 180, 50, 0x555555, 0.92).setDepth(10000).setInteractive();
    this.add.text(W / 2 + 110, H / 2 + 70, '回主菜单', { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setDepth(10001);
    menu.on('pointerdown', () => { RunState.reset(); this.scene.start('Menu'); });
  }
}
