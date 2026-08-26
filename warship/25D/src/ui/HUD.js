// 抬头显示：风向标、关卡信息、旗舰/敌军血条、装填状态、操作提示、结算文字、toast。
class HUD {
  constructor(scene) {
    this.scene = scene;
    const W = C.VIEW_W, H = C.VIEW_H;

    // —— 左上：敌我血条（我方舰队 / 敌方舰队 总血）——
    scene.add.text(14, 8, '我方舰队', { fontSize: '12px', color: '#bfe3ff' }).setScrollFactor(0).setDepth(10000);
    this.pHpBg = scene.add.rectangle(14, 36, 220, 16, 0x222222).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000);
    this.pHp = scene.add.rectangle(14, 36, 220, 16, 0x2ecc71).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
    scene.add.text(14, 46, '敌方舰队', { fontSize: '12px', color: '#ffc7c6' }).setScrollFactor(0).setDepth(10000);
    this.eHpBg = scene.add.rectangle(14, 78, 220, 16, 0x222222).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10000);
    this.eHp = scene.add.rectangle(14, 78, 220, 16, 0xe24b4a).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);

    // —— 左上：已获奖励卡（当前 build，跨关累积）——
    scene.add.text(14, 90, '已获奖励', { fontSize: '12px', color: '#ffe08a' }).setScrollFactor(0).setDepth(10000);
    this.ownedObjs = [];   // 缓存 chip 对象，仅当已获卡集合变化时重建
    this._ownedSig = '';

    // —— 中上：风向指示 ——
    this.windArrow = scene.add.graphics().setScrollFactor(0).setDepth(10000);
    this.windText = scene.add.text(W / 2, 60, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10000);

    // —— 中下：关卡内容提示 ——
    this.levelText = scene.add.text(W / 2, H - 22, '', { fontSize: '15px', color: '#cfeede' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(10000);

    // 旗舰装填状态（中下，关卡提示上方）
    this.reloadText = scene.add.text(W / 2, H - 50, '', { fontSize: '14px', color: '#ffffff' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(10000);

    // 结算
    this.result = scene.add.text(W / 2, H / 2, '', { fontSize: '52px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(10001).setVisible(false);

    // 开火失败/状态提示 toast（独立于 Ship 每帧重写，不会被覆盖）
    this.hint = scene.add.text(W / 2, H - 86, '', { fontSize: '18px', color: '#ffd34d', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setVisible(false);

    // 小地图（右上角）：敌(红)/友(蓝)/旗舰(亮蓝)/礁石(暗) + 相机视口框
    this.minimap = scene.add.graphics().setScrollFactor(0).setDepth(10000);
    this.minimapTitle = scene.add.text(W - C.MINIMAP_MARGIN - C.MINIMAP_W, C.MINIMAP_Y - 16, '小地图', { fontSize: '12px', color: '#9fd6e0' }).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
  }

  update(wind, flagship, enemies, levelIndex) {
    const g = this.windArrow; g.clear();
    const cx = C.VIEW_W / 2, cy = 34;
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

    // 我方舰队总血（含阵亡船记 0）
    let pHp = 0, pMax = 0;
    for (const s of (this.scene.players || [])) { pHp += Math.max(0, s.hp); pMax += s.maxHp; }
    this.pHp.setDisplaySize(220 * (pMax > 0 ? Util.clamp(pHp / pMax, 0, 1) : 0), 16);

    // 敌方舰队总血
    let eHp = 0, eMax = 0;
    for (const e of enemies) { eHp += Math.max(0, e.hp); eMax += e.maxHp; }
    this.eHp.setDisplaySize(220 * (eMax > 0 ? Util.clamp(eHp / eMax, 0, 1) : 0), 16);

    // 旗舰装填状态
    if (flagship) {
      const pR = flagship.portReload > 0 ? ('装填 ' + flagship.portReload.toFixed(1) + 's') : '就绪';
      const sR = flagship.starboardReload > 0 ? ('装填 ' + flagship.starboardReload.toFixed(1) + 's') : '就绪';
      this.reloadText.setText('左舷[U]: ' + pR + '        右舷[O]: ' + sR);
    } else {
      this.reloadText.setText('');
    }

    this._drawMinimap();
    this._drawOwned();
  }

  // 左上常驻：以类别配色 chip 列出当前已获奖励卡（build）。集合不变则不动，避免每帧重建。
  _drawOwned() {
    const owned = RunState.ownedCards || [];
    const sig = owned.map((c) => c.id).join(',');
    if (sig === this._ownedSig) return;
    this._ownedSig = sig;
    this.ownedObjs.forEach((o) => o.destroy());
    this.ownedObjs = [];

    const colorMap = { 进攻: 0x8e3b3b, 机动: 0x3b6b8e, 生存: 0x3b8e5a, 保障: 0xb08a2e };
    const cols = 2, cw = 106, ch = 18, gx = 4, gy = 3, x0 = 14, y0 = 112;

    if (!owned.length) {
      const t = this.scene.add.text(x0, y0, '（无）', { fontSize: '11px', color: '#8aa' }).setScrollFactor(0).setDepth(10000);
      this.ownedObjs.push(t);
      return;
    }
    owned.forEach((c, i) => {
      const r = Math.floor(i / cols), col = i % cols;
      const x = x0 + col * (cw + gx), y = y0 + r * (ch + gy);
      const rect = this.scene.add.rectangle(x, y, cw, ch, colorMap[c.cat] || 0x444444, 0.85).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
      const txt = this.scene.add.text(x + 6, y + ch / 2, c.name, { fontSize: '11px', color: '#fff' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(10001);
      this.ownedObjs.push(rect, txt);
    });
  }

  // 右上角常驻小地图：整张世界缩略，显示所有存活船、礁石与当前视口框
  _drawMinimap() {
    const W = C.VIEW_W, H = C.VIEW_H;
    const MW = C.MINIMAP_W, MH = C.MINIMAP_H;
    const MX = W - MW - C.MINIMAP_MARGIN, MY = C.MINIMAP_Y;
    const g = this.minimap; g.clear();
    // 面板
    g.fillStyle(0x071a24, 0.8); g.fillRect(MX, MY, MW, MH);
    g.lineStyle(1.5, 0x2f6f86, 0.9); g.strokeRect(MX, MY, MW, MH);
    const sx = MW / C.WORLD_W, sy = MH / C.WORLD_H;
    const toMX = (wx) => MX + wx * sx;
    const toMY = (wy) => MY + wy * sy;
    // 礁石
    for (const r of (this.scene.reefs || [])) {
      g.fillStyle(0x39424a, 1);
      g.fillCircle(toMX(r.x), toMY(r.y), Math.max(1.5, r.r * sx));
    }
    // 装饰（鲸背/海怪，暗灰小点，纯信息）
    for (const o of (this.scene.decors || [])) {
      g.fillStyle(0x707070, 0.7);
      g.fillCircle(toMX(o.x), toMY(o.y), 1.2);
    }
    // 友军（蓝）/ 旗舰（亮蓝）
    for (const s of (this.scene.players || [])) {
      if (s.hp <= 0) continue;
      const isFlag = (s === this.scene.flagship);
      g.fillStyle(isFlag ? 0x7fd4ff : 0x378add, 1);
      g.fillCircle(toMX(s.x), toMY(s.y), isFlag ? 3.5 : 2.5);
    }
    // 敌军（红）
    for (const s of (this.scene.enemies || [])) {
      if (s.hp <= 0) continue;
      g.fillStyle(0xe24b4a, 1);
      g.fillCircle(toMX(s.x), toMY(s.y), 2.5);
    }
    // 相机视口框（当前看到的世界范围）
    const cam = this.scene.cameras.main;
    g.lineStyle(1.5, 0xffffff, 0.85);
    g.strokeRect(toMX(cam.scrollX), toMY(cam.scrollY), cam.width * sx, cam.height * sy);
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
