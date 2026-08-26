// 结算：胜利 → 三选一升级 draft（roguelike）→ 下一关；败北 → 重试/回主菜单。
class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  init(data) {
    this.win = !!data.win;
    this.levelIndex = data.levelIndex || 0;
    this.medals = data.medals || [];
    this.rewardPts = data.rewardPts || 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0e2e38');
    if (this.win) this._buildWin();
    else this._buildLose();
  }

  _buildWin() {
    const W = C.VIEW_W, H = C.VIEW_H;
    this.add.text(W / 2, 42, '胜利！', { fontSize: '40px', color: '#2ecc71', fontStyle: 'bold' }).setOrigin(0.5);

    // 合并本关所得徽章到跨关累计收藏（硬核勋章进阶）
    for (const id of this.medals) RunState.medals[id] = true;

    // —— 本关徽章（条件描述自动换行不超框）——
    if (this.medals.length) {
      this.add.text(W / 2, 78, '本关徽章', { fontSize: '16px', color: '#ffd34d' }).setOrigin(0.5);
      const mw = 168, gap = 16, bh = 58;
      const totalW = this.medals.length * mw + (this.medals.length - 1) * gap;
      const sx = W / 2 - totalW / 2 + mw / 2;
      this.medals.forEach((id, i) => {
        const m = MEDALS[id]; if (!m) return;
        const x = sx + i * (mw + gap), y = 134;
        this.add.rectangle(x, y, mw, bh, 0x3a2f12, 0.92).setStrokeStyle(2, 0xffd34d).setDepth(10000);
        this.add.text(x, y - 19, '★ ' + m.name, { fontSize: '15px', color: '#ffe08a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(10001);
        this.add.text(x, y + 6, m.desc, { fontSize: '9px', color: '#e8d6a8', align: 'center', wordWrap: { width: mw - 20 } }).setOrigin(0.5).setDepth(10001);
      });
    }

    // 通关判定（终局不展示奖励卡选择）
    const isLast = this.levelIndex + 1 >= Levels.length;
    if (isLast) {
      this.add.text(W / 2, H / 2, '全部关卡通关！\n按空格回主菜单', { fontSize: '26px', color: '#ffd34d', align: 'center' }).setOrigin(0.5);
      const back = () => { RunState.reset(); this.scene.start('Menu'); };
      this.input.keyboard.once('keydown-SPACE', back);
      this.input.once('pointerdown', back);
      return;
    }

    // —— 奖励卡选择提示（替换原权重计算提示，引导玩家挑卡）——
    this.add.text(W / 2, 192, '从下列奖励卡中选择一张　·　赢得越多越难的徽章，可解锁的奖励越强', { fontSize: '14px', color: '#cfeede' }).setOrigin(0.5);

    // —— 奖励卡（unlocked 恒为每类最优 1 张，共 4 张；container 承载整体缩放，交互挂在 bg 矩形上保证命中准确）——
    const cards = Upgrades.unlocked(this.rewardPts);
    const cw = 224, ch = 168, gx = 24;
    const perRow = Math.min(cards.length, 4);
    const colorMap = { 进攻: 0x8e3b3b, 机动: 0x3b6b8e, 生存: 0x3b8e5a, 保障: 0xb08a2e };
    const startY = 282;
    cards.forEach((cd, i) => {
      const r = Math.floor(i / perRow), c = i % perRow;
      const inRow = Math.min(perRow, cards.length - r * perRow);
      const rowW = inRow * cw + (inRow - 1) * gx;
      const rowStartX = W / 2 - rowW / 2 + cw / 2;
      const x = rowStartX + c * (cw + gx);
      const y = startY + r * ch + ch / 2;   // 单行 4 张，gy=0
      const cont = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, cw, ch, colorMap[cd.cat] || 0x444444, 0.92).setStrokeStyle(2, 0xffd34d);
      const nameT = this.add.text(0, -56, cd.name, { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      const catT = this.add.text(0, -28, '[' + cd.cat + ']', { fontSize: '12px', color: '#ffd34d' }).setOrigin(0.5);
      const descT = this.add.text(0, 12, cd.desc, { fontSize: '13px', color: '#e8f5ef', align: 'center', wordWrap: { width: cw - 28 } }).setOrigin(0.5);
      cont.add([bg, nameT, catT, descT]);
      // 交互挂在背景矩形上（矩形自带正确命中区，受 container 变换影响，hover 位置精准；
      // 整卡缩放 1.04 < 间隙 24 的一半，不会压到邻卡导致误触发）
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => { bg.setStrokeStyle(4, 0xffffff); cont.setScale(1.04); });
      bg.on('pointerout', () => { bg.setStrokeStyle(2, 0xffd34d); cont.setScale(1); });
      bg.on('pointerdown', () => this._choose(cd));
    });

    // —— 当前已获奖励（放在奖励卡下方，避免与上方叠压）——
    const owned = RunState.ownedCards || [];
    if (owned.length) {
      this.add.text(W / 2, startY + ch + 40, '当前已获：' + owned.map((c) => c.name).join('、'), { fontSize: '13px', color: '#ffe08a', align: 'center', wordWrap: { width: W - 160 } }).setOrigin(0.5);
    }
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
