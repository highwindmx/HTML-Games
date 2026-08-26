// ============================================================================
// 2.5D 船只渲染工厂（红警2 式 billboard：船体层旋转呈现舷侧，桅杆/帆层保持竖直
// 给出高度信号）。纯 Phaser Graphics 程序化生成，零依赖、离线可跑。
// 只负责"画面"，不碰任何玩法状态（风/移动/战斗逻辑在 Ship 内部保持不变）。
// ============================================================================
const ShipSprite = {
  // 颜色工具
  _clamp255: (v) => Math.max(0, Math.min(255, Math.round(v))),
  _shade(hex, f) { // f<1 变暗，f>1 变亮（会溢出，故用下方 lighten 做提亮）
    const r = ((hex >> 16) & 255) * f, g = ((hex >> 8) & 255) * f, b = (hex & 255) * f;
    return (this._clamp255(r) << 16) | (this._clamp255(g) << 8) | this._clamp255(b);
  },
  _lighten(hex, f) { // 向白色混合 f（0..1）
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const R = this._clamp255(r + (255 - r) * f), G = this._clamp255(g + (255 - g) * f), B = this._clamp255(b + (255 - b) * f);
    return (R << 16) | (G << 8) | B;
  },

  // 在 ship 上构建全部视觉对象
  build(scene, ship) {
    const nation = ship.color;
    const pal = {
      side: this._shade(nation, 0.5),     // 船体侧面（暗，制造厚度感）
      top: this._lighten(nation, 0.22),   // 甲板顶面（亮）
      wood: 0x9c6b34,                     // 中央木甲板条
      gunwale: this._shade(nation, 0.32), // 舷边线
      sail: 0xf3ead2,                     // 帆
      sailShade: 0xd8cdb0,                // 帆褶阴影
    };
    const L = ship.hullLen;   // 船长（由船型决定，见 Ship 构造）
    const B = ship.hullBeam;  // 船宽
    ship.visScale = Util.clamp(Math.sqrt(ship.maxHp / 100), 0.85, 1.5);

    // 投影（独立对象，不随船旋转；float on water 的 2.5D 线索）
    ship.shadow = scene.add.ellipse(ship.x, ship.y + 6, L * ship.visScale * 1.05, B * ship.visScale * 0.7, 0x000000, 0.22)
      .setDepth(ship.y - 1);

    // 主容器：保持竖直（billboard），不旋转
    ship.container = scene.add.container(ship.x, ship.y, []).setDepth(ship.y);

    // —— 船体层（随 heading 旋转，呈现舷侧）——
    ship.hullLayer = scene.add.container(0, 0);
    const gHull = scene.add.graphics();
    this._drawHull(gHull, pal, L, B, ship.guns);
    ship.hullLayer.add(gHull);
    ship.hullLayer.setScale(ship.visScale);
    ship.container.add(ship.hullLayer);

    // 受击闪红层（覆盖船体，作为 hullLayer 子节点随船旋转）
    ship.flashG = scene.add.graphics();
    ship.hullLayer.add(ship.flashG);

    // —— 桅杆/帆层（保持竖直，每帧按旋转后的龙骨定位根部）——
    ship.mastG = scene.add.graphics();
    ship.mastG.setScale(ship.visScale);
    ship.container.add(ship.mastG);

    this._redrawMasts(ship, 0);
  },

  _path(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  },

  _drawHull(g, pal, L, B, guns) {
    // 船体轮廓（船首 +x，左侧 -y=左舷，右侧 +y=右舷）
    const o = [
      [L * 0.50, 0], [L * 0.32, -B * 0.5], [0, -B * 0.5],
      [-L * 0.42, -B * 0.42], [-L * 0.5, -B * 0.18], [-L * 0.5, B * 0.18],
      [-L * 0.42, B * 0.42], [0, B * 0.5], [L * 0.32, B * 0.5],
    ];
    // 侧面（暗，满轮廓）
    g.fillStyle(pal.side, 1);
    this._path(g, o); g.fillPath();
    // 顶面（亮，上移 TH 露出底部暗边=厚度）
    const TH = 5;
    const inner = o.map(p => [p[0] * 0.82, p[1] * 0.82 - TH]);
    g.fillStyle(pal.top, 1);
    this._path(g, inner); g.fillPath();
    // 中央木甲板条
    g.fillStyle(pal.wood, 0.95);
    g.fillRect(-L * 0.46, -3, L * 0.92, 6);
    // 舷边线
    g.lineStyle(2, pal.gunwale, 1);
    this._path(g, o); g.strokePath();
    // 装饰炮门（沿两舷，数量随船型）
    g.fillStyle(0x1c140d, 0.9);
    const gns = guns || 3;
    for (let k = 0; k < gns; k++) {
      const gx = gns === 1 ? 0 : (-L * 0.4 + (k / (gns - 1)) * L * 0.8);
      g.fillRect(gx - 2, -B * 0.5 - 1, 4, 4);
      g.fillRect(gx - 2, B * 0.5 - 3, 4, 4);
    }
    // 艏斜桅
    g.lineStyle(2, pal.gunwale, 1);
    g.lineBetween(L * 0.5, 0, L * 0.64, 0);
  },

  // 每帧重绘桅杆与帆（mastG 不旋转，但根部按旋转后的龙骨定位；帆顶轻微摆动）
  _redrawMasts(ship, tMs) {
    const g = ship.mastG;
    g.clear();
    const L = ship.hullLen;
    const hr = Util.degToRad(ship.heading);
    const cos = Math.cos(hr), sin = Math.sin(hr);
    let masts;
    const n = ship.mastCount || 3;
    if (n <= 1) masts = [{ x: L * 0.05, h: 28 }];
    else if (n === 2) masts = [{ x: L * 0.3, h: 24 }, { x: -L * 0.34, h: 20 }];
    else masts = [{ x: L * 0.42, h: 24 }, { x: 0, h: 34 }, { x: -L * 0.42, h: 20 }];
    masts.forEach((m, i) => {
      const bx = m.x * cos, by = m.x * sin;        // 旋转后的龙骨根部
      g.lineStyle(3, 0x5a3a1a, 1);
      g.lineBetween(bx, by, bx, by - m.h);          // 桅杆（竖直）
      const sway = Math.sin(tMs * 0.002 + i * 1.7) * 3;
      // 帆（方帆，上缘受风轻摆）
      g.fillStyle(0xf3ead2, 0.96);
      g.beginPath();
      g.moveTo(bx - 9, by - m.h * 0.12);
      g.lineTo(bx + 9, by - m.h * 0.12);
      g.lineTo(bx + 6 + sway, by - m.h * 0.92);
      g.lineTo(bx - 6 + sway, by - m.h * 0.92);
      g.closePath(); g.fillPath();
      // 帆褶阴影
      g.lineStyle(1.5, 0xd8cdb0, 0.9);
      g.lineBetween(bx - 2, by - m.h * 0.12, bx - 2 + sway * 0.5, by - m.h * 0.9);
      // 帆桁
      g.lineStyle(2, 0x5a3a1a, 1);
      g.lineBetween(bx - 9, by - m.h * 0.9, bx + 9 + sway, by - m.h * 0.9);
    });
  },

  // 由 Ship.update 调用
  updateVisual(ship, tMs) {
    this._redrawMasts(ship, tMs);
    // 阴影定位交给 BattleScene（按相对相机的环绕坐标设置），此处不碰，避免接缝处错位
    // 受击闪红：_hitFlash 由 Ship.takeDamage 设置、update 递减；在船体上方覆盖红色半透明
    const f = ship._hitFlash || 0;
    ship.flashG.clear();
    if (f > 0) {
      ship.flashG.fillStyle(0xff3030, Math.min(0.7, (f / 0.18) * 0.7));
      ship.flashG.fillCircle(0, 0, ship.hullLen * 0.5);
    }
  },
};
