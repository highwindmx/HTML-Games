// 抬头显示：风向标、关卡信息、旗舰/敌军血条、装填状态、操作提示、结算文字、toast。
class HUD {
  constructor(scene) {
    this.scene = scene;
    const W = C.VIEW_W, H = C.VIEW_H;
    this.windArrow = scene.add.graphics().setScrollFactor(0).setDepth(10000);
    this.windText = scene.add.text(20, 62, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff' }).setScrollFactor(0).setDepth(10000);

    // 关卡信息（顶部中央）
    this.levelText = scene.add.text(W / 2, 10, '', { fontSize: '15px', color: '#cfeede' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10000);

    // 旗舰 HP（左下）
    scene.add.text(20, H - 60, '旗舰 HP', { fontSize: '12px', color: '#ffffff' }).setScrollFactor(0).setDepth(10000);
    this.pHpBg = scene.add.rectangle(20, H - 42, 200, 16, 0x222222).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000);
    this.pHp = scene.add.rectangle(20, H - 42, 200, 16, 0x2ecc71).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);

    // 敌军总 HP（右上）
    scene.add.text(W - 20, 4, '敌军 HP', { fontSize: '12px', color: '#ffffff' }).setOrigin(1, 0).setScrollFactor(0).setDepth(10000);
    this.eHpBg = scene.add.rectangle(W - 20, 22, 200, 16, 0x222222).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10000);
    this.eHp = scene.add.rectangle(W - 20, 22, 200, 16, 0xe24b4a).setOrigin(1, 0.5).setScrollFactor(0).setDepth(10001);

    // 装填状态（底部中央）
    this.reloadText = scene.add.text(W / 2, H - 30, '', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(10000);
    scene.add.text(W / 2, H - 58, 'W/↑ 帆力   A/D 或 ←/→ 转向   U 左舷齐射   O 右舷齐射', { fontSize: '12px', color: '#cfeede' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10000);

    // 结算
    this.result = scene.add.text(W / 2, H / 2, '', { fontSize: '52px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(10001).setVisible(false);

    // 开火失败/状态提示 toast（独立于 Ship 每帧重写，不会被覆盖）
    this.hint = scene.add.text(W / 2, H - 86, '', { fontSize: '18px', color: '#ffd34d', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setVisible(false);
  }

  update(wind, flagship, enemies, levelIndex) {
    const g = this.windArrow; g.clear();
    const cx = 42, cy = 35;
    const rad = wind.dirRad();
    const tx = cx + Math.cos(rad) * 22, ty = cy + Math.sin(rad) * 22;
    const bx = cx - Math.cos(rad) * 22, by = cy - Math.sin(rad) * 22;
    g.lineStyle(3, 0xffffff, 0.9);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.strokePath();
    g.fillStyle(0xffffff, 0.9);
    const ah = Util.degToRad(wind.dir + 180);
    g.fillTriangle(tx, ty, tx + Math.cos(ah + 0.4) * 9, ty + Math.sin(ah + 0.4) * 9, tx + Math.cos(ah - 0.4) * 9, ty + Math.sin(ah - 0.4) * 9);
    this.windText.setText('风 ' + Math.round(wind.dir) + '°   力 ' + wind.force.toFixed(2));

    const lvl = Levels[levelIndex];
    if (lvl) this.levelText.setText('第 ' + (levelIndex + 1) + ' 关 · ' + lvl.name + '   编队 ' + lvl.playerShips + ' vs 敌 ' + lvl.enemies.length + '   约束：' + lvl.constraint);

    // 旗舰 HP（阵亡则 0）
    const pHp = flagship ? flagship.hp : 0;
    const pMax = flagship ? flagship.maxHp : 1;
    this.pHp.setDisplaySize(200 * Util.clamp(pHp / pMax, 0, 1), 16);

    // 敌军总 HP
    let eHp = 0, eMax = 0;
    for (const e of enemies) { eHp += Math.max(0, e.hp); eMax += e.maxHp; }
    this.eHp.setDisplaySize(200 * (eMax > 0 ? Util.clamp(eHp / eMax, 0, 1) : 0), 16);

    // 旗舰装填状态
    if (flagship) {
      const pR = flagship.portReload > 0 ? ('装填 ' + flagship.portReload.toFixed(1) + 's') : '就绪';
      const sR = flagship.starboardReload > 0 ? ('装填 ' + flagship.starboardReload.toFixed(1) + 's') : '就绪';
      this.reloadText.setText('左舷[U]: ' + pR + '        右舷[O]: ' + sR);
    } else {
      this.reloadText.setText('');
    }
  }

  flashHint(text, color = '#ffd34d') {
    this.hint.setText(text).setColor(color).setVisible(true).setAlpha(1);
    if (this._hintTween) this._hintTween.stop();
    this._hintTween = this.scene.tweens.add({
      targets: this.hint, alpha: 0, delay: 700, duration: 400,
      onComplete: () => this.hint.setVisible(false),
    });
  }

  showResult(text) { this.result.setText(text).setVisible(true); }
}
