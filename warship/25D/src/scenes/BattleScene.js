// ============================================================================
// 2.5D 战斗场景（红警2 式 billboard + Y-sort）。船用 ShipSprite 渲染（船体层随 heading
// 旋转呈现舷侧，桅/帆层保持竖直给高度信号）。世界环绕（穿左出右 / 穿上出下），相机跟随旗舰。
// 玩法逻辑（风/移动/战斗/编队/单侧装填/升级）与 3D 版完全一致，仅渲染层换成 2D。
// ============================================================================
class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.levelIndex = (data && typeof data.levelIndex === 'number') ? data.levelIndex : RunState.levelIndex;
  }

  create() {
    this.wind = new Wind();

    const level = Levels[this.levelIndex];
    const b = RunState.build || RunState._default();

    // 2D 海面（大范围，覆盖相机可能看到的区域；背景色由 main.js 的深海蓝兜底）
    this._seaG = this.add.graphics().setDepth(-10000);
    this._drawSea();

    // 玩家编队：第 0 艘为旗舰（受控），其余友军 AI 沿其航向单纵列串联在其后方
    this.players = [];
    const n = level.playerShips;
    for (let i = 0; i < n; i++) {
      const x = C.PLAYER_FLEET_X - i * C.FORMATION_SPACING;
      const y = C.FLEET_Y;
      // 统一船型：所有友军一律 'ship'，体积/性能完全一致；仅领头用更亮色调便于辨认受控舰。
      const ship = new Ship(this, x, y, {
        heading: 0, type: 'ship',
        hp: C.PLAYER_HP * b.hpMul,
        color: i === 0 ? 0x378add : 0x5aa0e0,
        damageMul: b.damageMul, turnMul: b.turnMul, reloadMul: b.reloadMul,
        rangeMul: b.rangeMul, speedMul: b.speedMul, damageTakenMul: b.damageTakenMul,
      });
      ship._rank = i;
      ship.isFlagship = (i === 0);
      ShipSprite.build(this, ship);   // 2.5D 视觉对象（container/hullLayer/mastG/shadow…）
      this.players.push(ship);
    }
    this.flagship = this.players[0];

    // 敌编队（全部 AI）：领队在最西(最靠近玩家)，其余在其后方(东侧)单纵列
    this.enemies = [];
    const ec = level.enemies.length;
    for (let j = 0; j < ec; j++) {
      const x = C.ENEMY_FLEET_X + j * C.FORMATION_SPACING;
      const y = C.FLEET_Y;
      // 统一船型：敌方也一律 'ship'（体积/性能一致），仅 hp 随关卡不同。
      const ship = new Ship(this, x, y, {
        heading: 180, type: 'ship', isEnemy: true, color: 0xd85a30,
        hp: level.enemies[j].hp,
      });
      ship._rank = j;
      ShipSprite.build(this, ship);
      this.enemies.push(ship);
    }
    this.enemyLeader = this.enemies[0];

    // 礁石：随机分布障碍（避开初始编队），碰撞造成伤害+推开
    this.reefs = [];
    this._reefG = this.add.graphics().setDepth(-5000);
    const avoid = [...this.players, ...this.enemies].map(s => ({ x: s.x, y: s.y }));
    let tries = 0;
    while (this.reefs.length < C.REEF_COUNT && tries < C.REEF_COUNT * 50) {
      tries++;
      const x = 160 + Math.random() * (C.WORLD_W - 320);
      const y = 120 + Math.random() * (C.WORLD_H - 240);
      let ok = true;
      for (const a of avoid) if (Math.hypot(x - a.x, y - a.y) < C.REEF_CLEARANCE) { ok = false; break; }
      if (!ok) continue;
      for (const r of this.reefs) if (Math.hypot(x - r.x, y - r.y) < C.REEF_RADIUS * 2 + 24) { ok = false; break; }
      if (!ok) continue;
      const rr = C.REEF_RADIUS * (0.7 + Math.random() * 0.6);
      // 预生成不规则岩体外形（本地偏移），逐帧绕回重绘时保持稳定、不闪烁
      const shape = []; const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rad = rr * (0.72 + Math.random() * 0.45);
        shape.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      this.reefs.push({ x, y, r: rr, shape });
    }

    // 装饰：鲸背 / 海怪（纯视觉，远处随机刷新，无碰撞、不挡炮弹）
    this.decors = [];
    this._decorG = this.add.graphics().setDepth(-8000);  // 在海面之上、礁石之下
    let dtries = 0;
    while (this.decors.length < C.DECOR_COUNT && dtries < C.DECOR_COUNT * 60) {
      dtries++;
      const x = 160 + Math.random() * (C.WORLD_W - 320);
      const y = 120 + Math.random() * (C.WORLD_H - 240);
      let ok = true;
      for (const a of avoid) if (Math.hypot(x - a.x, y - a.y) < C.DECOR_MIN_DIST_SHIP) { ok = false; break; }
      if (!ok) continue;
      for (const r of this.reefs) if (Math.hypot(x - r.x, y - r.y) < r.r + C.DECOR_CLEARANCE) { ok = false; break; }
      if (!ok) continue;
      for (const o of this.decors) if (Math.hypot(x - o.x, y - o.y) < C.DECOR_CLEARANCE) { ok = false; break; }
      if (!ok) continue;
      this.decors.push({ x, y, type: Math.random() < 0.5 ? 'whale' : 'kraken', seed: Math.random() * 1000 });
    }


    this.projectiles = [];
    this.hits = [];     // 2D 命中火花 / 水花 {g,t,max,hit}
    this.trails = [];   // 2D 尾迹泡沫 {g,t,max}
    this.over = false;
    this.win = false;
    // 徽章统计（每关清零；胜利时据其评定本关奖励徽章）
    this.stats = { damageTaken: 0, shots: 0, hits: 0, windwardTime: 0, playerRams: 0, sideHits: { port: 0, starboard: 0 }, sideShots: { port: 0, starboard: 0 }, time: 0 };

    // 2D 炮弹绘制层（每帧清空重画）
    this._projG = this.add.graphics().setDepth(50000);

    // 旗舰"可开火"炮迹弧层（仅旗舰已装填舷 + 射界内射程内有敌时显示，淡弹道虚线）
    this._arcG = this.add.graphics().setDepth(8000);   // 在世界/船之上、HUD(10000+)之下

    // 相机跟随旗舰（大世界 + 跟随；lerp=1 即时跟随，规避 wrap 时镜头长距离扫场）
    this._followTarget = this.flagship;
    this.cameras.main.startFollow(this.flagship.container, true, 1, 1);

    // 按键从 KeyMap 读取（玩家可在开始界面设置），每动作支持多键
    const km = KeyMap.load();
    this.keys = {};
    for (const a of KeyMap.ACTIONS) {
      this.keys[a] = km[a].map((code) => this.input.keyboard.addKey(code));
    }
    this._down = (a) => this.keys[a].some((k) => k.isDown);
    this._justDown = (a) => this.keys[a].some((k) => Phaser.Input.Keyboard.JustDown(k));
    this._touch = { fire: null };                              // 触屏：齐射为一次性触发
    this._touchHeld = { left: false, right: false, thrust: false }; // 触屏：转向/前进为按住状态
    this.input.addPointer(2);                                  // 多点触控：转向 + 前进 + 齐射可同时按
    this._buildTouch(km);
    this.hud = new HUD(this);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this._justDown('restart')) { this.scene.restart(); return; }
    if (this.over) return;
    this.wind.update(dt);
    this.stats.time += dt;   // 战斗计时（速战徽章）
    const prevHp = this.players.reduce((s, p) => s + Math.max(0, p.hp), 0);  // 帧初我方总血（受损徽章）

    // 双方旗舰阵亡 → 把控制权/领航权转给下一艘存活船（护卫小船接续领航，不再呆立原地）
    if (!this.flagship || this.flagship.hp <= 0) {
      this.flagship = this.players.find(p => p.hp > 0) || null;
    }
    if (!this.enemyLeader || this.enemyLeader.hp <= 0) {
      this.enemyLeader = this.enemies.find(e => e.hp > 0) || null;
    }
    if (this.flagship && this.flagship !== this._followTarget) {
      this._followTarget = this.flagship;
      this.cameras.main.startFollow(this.flagship.container, true, 1, 1);
    }

    // 玩家旗舰输入
    if (this.flagship && this.flagship.hp > 0) {
      let turn = 0, thrust = 0;
      if (this._down('left')) turn -= 1;
      if (this._down('right')) turn += 1;
      if (this._down('thrust')) thrust = 1;
      if (this._touchHeld.left) turn -= 1;
      if (this._touchHeld.right) turn += 1;
      if (this._touchHeld.thrust) thrust = 1;
      this.flagship.turnInput = Util.clamp(turn, -1, 1);
      this.flagship.thrustInput = Util.clamp(thrust, 0, 1);
      // 逆风满帆徽章：满帆推进且当前帆效偏低(逆风)时累计逆风航行时间
      if (thrust > 0) {
        const a2w = Util.angleDiff(this.flagship.heading, this.wind.dir);
        if (this.wind.sailEfficiency(a2w) < 0.6) this.stats.windwardTime += dt;
      }

      if (this._justDown('port')) this.fireFormationVolley('port');
      if (this._justDown('starboard')) this.fireFormationVolley('starboard');
      if (this._touch.fire) { this.fireFormationVolley(this._touch.fire); this._touch.fire = null; }
    }

    // 友军 AI（玩家编队中非旗舰）：蛇形跟随各自的前导船（flagship 或前一艘），绝不自主导航
    for (let i = 1; i < this.players.length; i++) {
      const a = this.players[i];
      if (a.hp > 0 && a !== this.flagship) {
        const lead = this._leadFor(a, this.players, this.flagship);
        FleetAI.updateAlly(a, lead, dt, this);
      }
    }
    // 敌 AI：领队缓慢朝玩家推进+舷侧齐射，其余蛇形跟随各自前导船组成单纵列
    for (let j = 0; j < this.enemies.length; j++) {
      const e = this.enemies[j];
      if (e.hp <= 0) continue;
      if (e === this.enemyLeader) FleetAI.updateEnemyLeader(e, dt, this.wind, this.players, this);
      else {
        const lead = this._leadFor(e, this.enemies, this.enemyLeader);
        FleetAI.updateAlly(e, lead, dt, this);
      }
    }

    // 所有存活船推进（含世界环绕 wrap）
    for (const s of this.players) if (s.hp > 0) s.update(dt, this.wind);
    for (const e of this.enemies) if (e.hp > 0) e.update(dt, this.wind);

    // 船间排斥：防止任何两船重叠
    this._separateShips();
    // 礁石碰撞：触碰被推开 + 持续伤害 + 接触水花
    this._collideReefs(dt);

    // 视觉同步：船体层随 heading 旋转 + 容器定位(相对相机环绕) + Y-sort + 尾迹生成
    for (const s of [...this.players, ...this.enemies]) {
      if (s.hp <= 0) {
        if (s.container) s.container.setVisible(false);
        if (s.shadow) s.shadow.setVisible(false);
        continue;
      }
      s.hullLayer.rotation = Util.degToRad(s.heading);   // 船体层旋转呈现舷侧
      const d = this._worldDraw(s.x, s.y);               // 离相机最近的环绕副本
      s.container.setPosition(d.x, d.y);
      s.container.setDepth(d.y);
      if (s.shadow) { s.shadow.setPosition(d.x, d.y + 6); s.shadow.setDepth(d.y - 1); }
      ShipSprite.updateVisual(s, time);
      if (s._trailDue) this._spawnTrail2D(s);
    }

    // 礁石 + 装饰逐帧绕回绘制（放在船之前，使其位于船下方）
    this._drawWorld();

    // 旗舰"可开火"炮迹弧（已装填舷 + 射界内射程内有敌时指向该敌）
    this._drawFireArcs();

    // 炮弹：逻辑推进 + 礁石拦截 + 到达结算 + 2D 绘制（逐帧判定，不再用延时回调）
    for (const p of this.projectiles) {
      p.update(dt);
      if (p.dead) continue;
      // 礁石拦截：飞入礁石半径即拦截（蓝花、取消该发伤害）
      for (const r of this.reefs) {
        const dx = Util.wrapDelta(r.x - p.x, C.WORLD_W);
        const dy = Util.wrapDelta(r.y - p.y, C.WORLD_H);
        if (Math.hypot(dx, dy) < r.r + 3) {
          p.blocked = true;
          this.spawnHit(p.x, p.y, false);
          p.life = 0;   // dead 是只读 getter(读 life)，设 life=0 即标记消亡
          break;
        }
      }
      if (p.dead) continue;
      // 到达飞行时长：命中结算（纯几何，去概率）。落点→目标核心距离 ≤ 命中半径(碰撞半径×HIT_RADIUS_FACTOR) 即命中；
      // 目标躲出该半径则落空（蓝水花落在落点）。目标已沉则哑火。
      if (p.t >= p.travelT) {
        let hit = false;
        if (p.target && p.target.hp > 0 && p.res) {
          // 纯几何命中（去概率）：落点→目标核心距离 ≤ 命中半径(碰撞半径×HIT_RADIUS_FACTOR) 即命中。
          // 目标机动逃出该半径则落空——命中与否完全由"炮弹与碰撞核心的距离"决定。
          const dx = Util.wrapDelta(p.target.x - p.x, C.WORLD_W);
          const dy = Util.wrapDelta(p.target.y - p.y, C.WORLD_H);
          if (Math.hypot(dx, dy) <= p.target.radius * C.HIT_RADIUS_FACTOR) {
            hit = true;
            p.target.takeDamage(p.res.damage * (p.ship.damageMul || 1));
          }
        }
        if (hit) {
          this.spawnHit(p.target.x, p.target.y, true);
          if (!p.ship.isEnemy) { this.stats.hits++; this.stats.sideHits[p.side] = (this.stats.sideHits[p.side] || 0) + 1; }
        } else this.spawnHit(p.x, p.y, false);   // 未中：蓝水花落在炮弹落点
        p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter(p => { if (p.dead) { p.destroy(); return false; } return true; });
    this._drawProjectiles();

    // 2D 命中/尾迹推进
    this._updateHits(dt);
    this._updateTrails(dt);

    // 受损统计：本帧我方总血下降量累加到 damageTaken（无伤徽章）
    this.stats.damageTaken += Math.max(0, prevHp - this.players.reduce((s, p) => s + Math.max(0, p.hp), 0));

    // 胜负判定
    const enemiesAlive = this.enemies.some(e => e.hp > 0);
    const playersAlive = this.players.some(p => p.hp > 0);
    if (!enemiesAlive) this._end(true);
    else if (!playersAlive) this._end(false);

    this.hud.update(this.wind, this.flagship, this.enemies, this.levelIndex);
  }

  // 据本关 stats 评定奖励徽章（仅胜利有效）；返回已得徽章 id 数组。
  // 改为「全部 7 种逐一评定、不设上限」：能拿几枚拿几枚（BadgeWeighter 联动奖励）。
  // windward（逆风满帆）：全关可拿；满帆顶风(windwardTime)时间占本关总时长 ≥ WINDWARD_RATIO 即达成（不再按关限定）。
  evaluateMedals() {
    const s = this.stats, lv = Levels[this.levelIndex];
    s.shipsLost = this.players.filter(p => p.hp <= 0).length;
    const ALL = ['flawless', 'noLoss', 'swift', 'marksman', 'windward', 'noRam', 'oneSide'];
    const earned = [];
    for (const id of ALL) {
      let ok = false;
      if (id === 'flawless') ok = s.damageTaken <= 0;                          // 无伤：我方零受损
      else if (id === 'noLoss') ok = s.shipsLost === 0 && s.damageTaken > 0;  // 全员存活：与 flawless 互补（零受损归 flawless，不双计）
      else if (id === 'swift') ok = s.time <= lv.swiftTime;                    // 速战：限时内通关
      else if (id === 'marksman') ok = s.shots > 0 && s.hits >= s.shots; // 弹无虚发：100% 命中（零脱靶）
      else if (id === 'windward') ok = s.time > 0 && (s.windwardTime / s.time) >= C.WINDWARD_RATIO; // 逆风满帆：全关可拿，满帆顶风时间占本关 ≥ 80%
      else if (id === 'noRam') ok = s.playerRams === 0;                        // 零撞击（含主动撞角）
      else if (id === 'oneSide') ok = (s.sideShots.port > 0) !== (s.sideShots.starboard > 0); // 一舷制胜：全程仅用单舷开火（另一舷从未发射）
      if (ok) earned.push(id);
    }
    return earned;
  }

  _end(win) {
    if (this.over) return;
    this.over = true; this.win = win;
    this.hud.showResult(win ? '胜利！' : '败北');
    const medals = win ? this.evaluateMedals() : [];
    // 徽章按难度加权累加成 rewardPts，决定本关能解锁多高门槛的奖励卡（越难徽章→越好奖励）
    const rewardPts = medals.reduce((sum, id) => sum + (BADGE_WEIGHTS[id] || 0), 0);
    this.time.delayedCall(1300, () => {
      this.scene.start('Result', { win, levelIndex: this.levelIndex, medals, rewardPts });
    });
  }

  // 相对相机的环绕绘制：把世界坐标映射到"离相机中心最近的那个环绕副本"，
  // 使任何靠近接缝(wrap 边界)的物体都在正确一侧出现，根除"未到边缘就凭空消失"。
  _worldDraw(wx, wy) {
    const cam = this.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    return {
      x: wx - Math.round((wx - cx) / C.WORLD_W) * C.WORLD_W,
      y: wy - Math.round((wy - cy) / C.WORLD_H) * C.WORLD_H,
    };
  }

  _drawSea() {
    const g = this._seaG;
    g.clear();
    // 大范围海面底色（深海蓝），背景色由 main.js 兜底，故边界外的区域也是海色
    g.fillStyle(0x0d3346, 1);
    g.fillRect(-C.WORLD_W, -C.WORLD_H, C.WORLD_W * 3, C.WORLD_H * 3);
    // 浅色波纹（稀疏短线），制造海面质感与航行参照
    g.lineStyle(2, 0x1d556e, 0.5);
    for (let i = 0; i < 220; i++) {
      const x = -C.WORLD_W + Math.random() * C.WORLD_W * 3;
      const y = -C.WORLD_H + Math.random() * C.WORLD_H * 3;
      const len = 18 + Math.random() * 26;
      g.lineBetween(x, y, x + len, y + (Math.random() - 0.5) * 6);
    }
  }

  _drawProjectiles() {
    const g = this._projG;
    g.clear();
    for (const p of this.projectiles) {
      const col = p.isEnemy ? 0xff8a5a : 0xaee0ff;
      // 弹道尾迹（上一帧→当前帧的短拖影），用相对相机环绕坐标，接缝处不画跨屏长线
      const d = this._worldDraw(p.x, p.y);
      const dp = this._worldDraw(p.px, p.py);
      g.lineStyle(2, col, 0.5);
      if (Math.hypot(d.x - dp.x, d.y - dp.y) < 200) g.lineBetween(dp.x, dp.y, d.x, d.y);
      g.fillStyle(col, 1);
      g.fillCircle(d.x, d.y, 3.2);
    }
  }

  // 八字炮射弧（取代旧的小圆点/炮门辉光 + 旗舰虚线）：某船某舷"装填完毕"即显示，
  // 不再附加"射界/射程内有敌"的瞄准条件（装弹完=该舷可射击，弧即指示可射击方向）。
  // 己方(青)与敌方(暖红)都绘制，使玩家也能看到敌方哪舷已就绪。
  _drawFireArcs() {
    const g = this._arcG; g.clear();
    const drawSide = (ship, isFlag, colOverride) => {
      for (const side of ['port', 'starboard']) {
        if (ship[side + 'Reload'] > 0) continue;            // 仅已装填舷（可射击）
        const fireDeg = Combat.sideFireAngle(ship, side);   // port=heading-90, star=heading+90
        const a = this._worldDraw(ship.x, ship.y);
        this._drawFireWedge(g, a.x, a.y, fireDeg, isFlag, colOverride);
      }
    };
    for (const ship of this.players) { if (ship.hp > 0) drawSide(ship, ship === this.flagship, null); }
    for (const ship of this.enemies) { if (ship.hp > 0) drawSide(ship, ship === this.enemyLeader, 0xff9d7a); }
  }

  // 单舷炮射弧（八字形的一翼）：以船屏幕坐标为圆心、FIRE_ARC_RADIUS 为半径，
  // 在 fireDeg±BROADSIDE_ARC/2 区间内画弧 + 两条边线（从船心发散到弧两端）。
  _drawFireWedge(g, sx, sy, fireDeg, isFlag, colOverride) {
    const R = C.FIRE_ARC_RADIUS;
    const half = Util.degToRad(C.BROADSIDE_ARC) / 2;
    const c = Util.degToRad(fireDeg);
    const col = colOverride != null ? colOverride : (isFlag ? 0x8fe3ff : 0x5fb8e0);
    const a0 = c - half, a1 = c + half;
    // 弧线
    g.lineStyle(isFlag ? 3 : 2, col, isFlag ? 0.62 : 0.4);
    g.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * i / steps;
      const px = sx + Math.cos(a) * R, py = sy + Math.sin(a) * R;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
    // 两条边线（船心 → 弧两端，形成 八 字发散感）
    g.lineStyle(isFlag ? 2 : 1.5, col, isFlag ? 0.5 : 0.32);
    g.lineBetween(sx, sy, sx + Math.cos(a0) * R, sy + Math.sin(a0) * R);
    g.lineBetween(sx, sy, sx + Math.cos(a1) * R, sy + Math.sin(a1) * R);
  }

  // 开火：仅锁该舷射界内(同侧)的最近敌为靶——保证"按哪舷只打哪侧、炮弹不跨船身"。
  // 命中改为纯几何(去概率)：以目标当前速度做提前量预测落点并瞄准，使炮弹直线收敛到目标核心；
  // 到达时由"落点→目标核心距离"判定命中，伤害按"发射→命中点距离"做炮程衰减(Combat.volleyDamage)。
  fireBroadside(ship, side) {
    const foes = ship.isEnemy ? this.players : this.enemies;
    const target = FleetAI.nearestOnSide(ship, foes, side);   // 仅该舷射界内的敌
    if (ship[side + 'Reload'] > 0) {                          // 装填中：不发射
      if (ship === this.flagship) this.onFireFailed(ship, side, 'reload');
      return;
    }
    const hr = Util.degToRad(ship.heading);
    const sideOffset = (side === 'port' ? -1 : 1) * (ship.hullBeam * 0.5 + 2);  // 炮口在该舷外侧
    const mx = ship.x - Math.sin(hr) * sideOffset;
    const my = ship.y + Math.cos(hr) * sideOffset;
    let res, travel, aimDeg;
    if (target) {
      const dist = Combat.distance(ship, target);
      travel = dist / C.PROJECTILE_SPEED;
      // 提前量：按目标速度预测其 travel 后位置（炮弹直线飞向预测点 → 几何收敛到核心）
      const tr = Util.degToRad(target.heading);
      const px = target.x + Math.cos(tr) * target.speed * travel;
      const py = target.y + Math.sin(tr) * target.speed * travel;
      const pdx = Util.wrapDelta(px - mx, C.WORLD_W);
      const pdy = Util.wrapDelta(py - my, C.WORLD_H);
      aimDeg = Util.radToDeg(Math.atan2(pdy, pdx));
      res = ship.fire(side, target, travel);
      if (!res) return;
    } else {
      // 该舷射界内无敌：仍按"对应方向"(abeam 垂直线)空放一轮（消耗装填、炮弹飞出船舷没入海中）
      ship[side + 'Reload'] = C.RELOAD_TIME * ship.reloadMul;
      res = { side, damage: 0 };
      travel = C.CANNON_RANGE / C.PROJECTILE_SPEED;
      aimDeg = Combat.sideFireAngle(ship, side);
    }
    const rad = Util.degToRad(aimDeg);
    for (let i = 0; i < C.SHOTS_PER_VOLLEY; i++) {
      const spread = (i - (C.SHOTS_PER_VOLLEY - 1) / 2) * 0.025;
      const proj = new Projectile(this, mx, my, rad + spread, C.PROJECTILE_SPEED);
      proj.isEnemy = ship.isEnemy;
      proj.travelT = Math.max(0.2, travel);
      proj.arcMax = Math.min(12 + travel * 26, 60);
      proj.life = proj.travelT + 0.3;
      proj.target = target; proj.ship = ship; proj.res = res; proj.blocked = false; proj.side = side;
      if (!ship.isEnemy) { this.stats.shots++; this.stats.sideShots[side] = (this.stats.sideShots[side] || 0) + 1; }   // 玩家炮弹计数 + 开火舷记录（弹无虚发 / 一舷制胜）
      this.projectiles.push(proj);
    }
  }

  // 整队同步齐射：玩家按下令的舷，旗舰 + 所有存活子舰在该舷已装填完毕时同时开火。
  // （"子舰必须与主力舰齐射"：不再让子舰各打各质量最高的舷，而是整队同舷齐射。）
  fireFormationVolley(side) {
    if (!this.flagship || this.flagship.hp <= 0) return;
    for (const a of this.players) {
      if (a.hp <= 0) continue;
      if (a[side + 'Reload'] > 0) {
        if (a === this.flagship) this.onFireFailed(a, side, 'reload'); // 仅旗舰提示装填中
        continue;
      }
      this.fireBroadside(a, side);
    }
  }

  // 敌整队同步齐射：敌方领队下令打哪舷，领队 + 所有存活子舰在该舷已装填完毕时同时开火。
  // （与玩家镜像：子舰不自主开火，只跟领队齐射。）
  fireEnemyVolley(side) {
    if (!this.enemyLeader || this.enemyLeader.hp <= 0) return;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (e[side + 'Reload'] > 0) continue;   // 该舷装填中则本轮跳过（不空放）
      this.fireBroadside(e, side);
    }
  }

  onFireFailed(ship, side, reason) {
    const name = side === 'port' ? '左舷' : '右舷';
    this.hud.flashHint(name + '装填中…', '#ffd34d');
  }

  // 2D 命中火花（橙）/ 未中水花（蓝）：命中点迸溅 + 扩散环，淡出
  spawnHit(x, y, hit) {
    const g = this.add.graphics().setDepth(50001);
    if (hit) {
      g.fillStyle(0xffd34d, 1);
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const len = 8 + Math.random() * 14;
        g.fillCircle(Math.cos(a) * len, Math.sin(a) * len, 2.4);
      }
      g.lineStyle(2, 0xff7b3a, 0.9); g.strokeCircle(0, 0, 6);
    } else {
      g.fillStyle(0xbfe8ef, 0.9);
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        g.fillCircle(Math.cos(a) * 10, Math.sin(a) * 10, 2);
      }
    }
    g.setPosition(x, y);
    this.hits.push({ g, t: 0, max: hit ? 0.32 : 0.34, hit, wx: x, wy: y });
  }

  _updateHits(dt) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      const k = h.t / h.max;
      if (k >= 1) { h.g.destroy(); this.hits.splice(i, 1); continue; }
      const d = this._worldDraw(h.wx, h.wy);
      h.g.setPosition(d.x, d.y);
      h.g.setScale(1 + 2.2 * k);
      h.g.setAlpha(1 - k);
    }
  }

  // 航行尾迹：船尾正后方贴海面的半透明扁椭圆泡沫，沿船长轴对齐，放大淡出
  _spawnTrail2D(s) {
    const hr = Util.degToRad(s.heading);
    const back = s.hullLen * 0.5 * s.visScale + 4;   // 船尾在船心后方的距离
    const bx = s.x - Math.cos(hr) * back;            // 船尾方向 = -(cos,sin)·back
    const by = s.y - Math.sin(hr) * back;
    const g = this.add.ellipse(bx, by, 14, 9, 0xdffaff, 0.4)
      .setDepth(-5000).setRotation(hr);              // 长轴沿船朝向(前-后)对齐
    this.trails.push({ g, t: 0, max: C.TRAIL_LIFE, wx: bx, wy: by });
  }

  _updateTrails(dt) {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.t += dt;
      const k = tr.t / tr.max;
      if (k >= 1) { tr.g.destroy(); this.trails.splice(i, 1); continue; }
      const d = this._worldDraw(tr.wx, tr.wy);       // 随相机环绕重定位
      tr.g.setPosition(d.x, d.y);
      tr.g.setScale(1 + 2 * k);
      tr.g.setAlpha(0.4 * (1 - k));
    }
  }

  // 船间排斥：相邻存活船若中心距 < 两船半径之和，则沿连线等分开
  _separateShips() {
    const all = [];
    for (const s of this.players) if (s.hp > 0) all.push(s);
    for (const s of this.enemies) if (s.hp > 0) all.push(s);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = Util.wrapDelta(b.x - a.x, C.WORLD_W), dy = Util.wrapDelta(b.y - a.y, C.WORLD_H);
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
          // 船首冲撞：仅敌对两舰，船首朝向对方且有一定航速时，按冷却对对方造成伤害
          if (a.isEnemy !== b.isEnemy) {
            const ar = Util.degToRad(a.heading), br = Util.degToRad(b.heading);
            const afx = Math.cos(ar), afy = Math.sin(ar);   // a 船首前向
            const bfx = Math.cos(br), bfy = Math.sin(br);   // b 船首前向
            if (a.speed > C.RAM_MIN_SPEED && (afx * ux + afy * uy) > C.RAM_FACE_DOT && (a._ramCd || 0) <= 0) {
              b.takeDamage(C.RAM_DAMAGE); a._ramCd = C.RAM_CD; this.spawnHit(b.x, b.y, true);
              if (!a.isEnemy) this.stats.playerRams++;   // 玩家触发冲撞计数（零撞击徽章）
            }
            if (b.speed > C.RAM_MIN_SPEED && (bfx * -ux + bfy * -uy) > C.RAM_FACE_DOT && (b._ramCd || 0) <= 0) {
              a.takeDamage(C.RAM_DAMAGE); b._ramCd = C.RAM_CD; this.spawnHit(a.x, a.y, true);
              if (!b.isEnemy) this.stats.playerRams++;
            }
          }
        }
      }
    }
  }

  // 礁石 + 装饰逐帧绕回绘制（避免接缝处消失）。静态物体每帧重绘成本极低。
  _drawWorld() {
    // —— 礁石 ——
    const rg = this._reefG; rg.clear();
    for (const r of this.reefs) {
      const d = this._worldDraw(r.x, r.y);
      rg.fillStyle(0x2a2f33, 1);
      rg.beginPath();
      rg.moveTo(d.x + r.shape[0][0], d.y + r.shape[0][1]);
      for (let i = 1; i < r.shape.length; i++) rg.lineTo(d.x + r.shape[i][0], d.y + r.shape[i][1]);
      rg.closePath(); rg.fillPath();
      rg.lineStyle(2, 0x4a5560, 1); rg.strokePath();
      rg.fillStyle(0x52606b, 1);
      rg.fillCircle(d.x - r.r * 0.2, d.y - r.r * 0.2, r.r * 0.32);
      rg.lineStyle(2, 0x9fd6e0, 0.5);
      rg.strokeCircle(d.x, d.y, r.r + 4);
    }
    // —— 装饰（鲸背 / 海怪）：船只接近时隐藏（避免穿模 / 出戏）——
    const dg = this._decorG; dg.clear();
    const shipsAlive = [...this.players, ...this.enemies].filter(s => s.hp > 0);
    for (const o of this.decors) {
      let near = false;
      for (const s of shipsAlive) {
        const dx = Util.wrapDelta(s.x - o.x, C.WORLD_W), dy = Util.wrapDelta(s.y - o.y, C.WORLD_H);
        if (Math.hypot(dx, dy) < C.DECOR_HIDE_RADIUS) { near = true; break; }
      }
      if (near) continue;
      const d = this._worldDraw(o.x, o.y);
      if (o.type === 'whale') this._drawWhale(dg, d.x, d.y, o.seed);
      else this._drawKraken(dg, d.x, d.y, o.seed);
    }
  }

  // 鲸背：平滑暗色隆起 + 喷潮 + 水圈（纯装饰）
  _drawWhale(g, x, y, seed) {
    const w = 64 + (seed % 28);
    g.fillStyle(0x35506b, 0.92);
    g.beginPath();
    g.moveTo(x - w * 0.5, y);
    g.lineTo(x - w * 0.32, y - w * 0.26);
    g.lineTo(x + w * 0.32, y - w * 0.26);
    g.lineTo(x + w * 0.5, y);
    g.closePath(); g.fillPath();
    g.fillStyle(0x22384d, 1);
    g.fillCircle(x - w * 0.26, y - w * 0.12, w * 0.06);          // 眼
    g.lineStyle(2, 0xcfeefe, 0.45);
    g.lineBetween(x + w * 0.08, y - w * 0.26, x + w * 0.08, y - w * 0.5);  // 喷潮
  }

  // 海怪：放射触手 + 中央躯体 + 眼（纯装饰）
  _drawKraken(g, x, y, seed) {
    const w = 34 + (seed % 18);
    g.lineStyle(4, 0x4a2d5e, 0.9);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + seed;
      const ex = x + Math.cos(a) * w * 0.85, ey = y + Math.sin(a) * w * 0.85;
      const mx = x + Math.cos(a) * w * 0.4 - Math.sin(a) * w * 0.3;
      const my = y + Math.sin(a) * w * 0.4 + Math.cos(a) * w * 0.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(mx, my); g.lineTo(ex, ey); g.strokePath();
    }
    g.fillStyle(0x6b3f86, 0.95); g.fillCircle(x, y, w * 0.35);
    g.fillStyle(0xffd34d, 1); g.fillCircle(x, y, w * 0.12);       // 眼
  }

  // 礁石碰撞：把船推出岩体并持续掉血；首次接触溅起水花（复用 spawnHit 蓝花）
  _collideReefs(dt) {
    const all = [...this.players, ...this.enemies].filter(s => s.hp > 0);
    for (const s of all) {
      let onReef = false;
      for (const r of this.reefs) {
        const dx = Util.wrapDelta(s.x - r.x, C.WORLD_W), dy = Util.wrapDelta(s.y - r.y, C.WORLD_H);
        const d = Math.hypot(dx, dy);
        const minD = s.radius + r.r;
        if (d < minD && d > 0.001) {
          onReef = true;
          const ux = dx / d, uy = dy / d;
          s.x += ux * (minD - d); s.y += uy * (minD - d);   // 推出岩体
          s.takeDamage(C.REEF_DAMAGE * dt);                 // 持续擦碰伤害
        }
      }
      if (onReef && !s._onReef) { this.spawnHit(s.x, s.y, false); s._onReef = true; }
      else if (!onReef) s._onReef = false;
    }
  }

  // 僚机的前导船：编队中 rank 比自己小且存活、rank 最大的那艘（贪吃蛇式：每艘跟随前一艘）；
  // 找不到则退回当前旗舰/领队（fallback）。ship/flagship 均来自同一编队（players 或 enemies）。
  _leadFor(ship, list, flagship) {
    const myRank = ship._rank;
    let best = null, bestRank = -1;
    for (const o of list) {
      if (o === ship || o.hp <= 0) continue;
      if (o._rank < myRank && o._rank > bestRank) { bestRank = o._rank; best = o; }
    }
    return best || flagship;
  }

  // 触屏控件：左下为「移动簇」（← ↑ → 指示符号 + 实际键值），右下为「齐射簇」（左舷/右舷 + 实际键值）。
  // 键值取自 KeyMap（玩家在菜单改键后，这里实时反映对应键），并以方向符号作指示——解决
  // "方向键设置后左下角显示键值不对应"与"应是指示+键值显示"两个问题。
  // 移动键用按住状态（held）保证持续生效；齐射键用一次性触发（按下即放一轮）。
  _buildTouch(km) {
    const H = C.VIEW_H, W = C.VIEW_W;
    const SZ = 76, GAP = 12, Y = H - 88;
    // 把 KeyMap 的键码转成可读符号（方向键→箭头，其余原样），多键用 / 连接
    const keyDisp = (codes) => (Array.isArray(codes) ? codes : [])
      .map((c) => ({ UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', SPACE: '␣', ESC: 'Esc' }[c] || c))
      .join('/');

    const base = (x) => this.add.rectangle(x, Y, SZ, SZ, 0x06151d, 0.42)
      .setScrollFactor(0).setDepth(10000).setStrokeStyle(2, 0x2f6f86, 0.85).setInteractive();

    // 移动簇：指示符号(上) + 实际键值(下)，按住持续生效
    const moveBtn = (x, glyph, codes, holdKey) => {
      const r = base(x);
      this.add.text(x, Y - 16, glyph, { fontSize: '30px', color: '#dfeefb', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      this.add.text(x, Y + 21, keyDisp(codes), { fontSize: '15px', color: '#9fe0ff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      r.on('pointerdown', () => { this._touchHeld[holdKey] = true; });
      r.on('pointerup', () => { this._touchHeld[holdKey] = false; });
      r.on('pointerout', () => { this._touchHeld[holdKey] = false; });
      r.on('pointerupoutside', () => { this._touchHeld[holdKey] = false; });
    };
    const lx = 60 + SZ / 2;
    const fx = lx + SZ + GAP;
    const rx = fx + SZ + GAP;
    moveBtn(lx, '←', km.left, 'left');
    moveBtn(fx, '↑', km.thrust, 'thrust');   // 前进用向上箭头作指示
    moveBtn(rx, '→', km.right, 'right');

    // 齐射簇：左舷/右舷 文字(上) + 实际键值(下)，按下即放一轮
    const fireBtn = (x, label, codes, side) => {
      const r = base(x);
      this.add.text(x, Y - 16, label, { fontSize: '22px', color: '#ffd9a8', fontStyle: 'bold' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      this.add.text(x, Y + 21, keyDisp(codes), { fontSize: '15px', color: '#9fe0ff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      r.on('pointerdown', () => { this._touch.fire = side; });
    };
    const sx = W - 60 - SZ / 2;
    const px = sx - SZ - GAP;
    fireBtn(px, '左舷', km.port, 'port');
    fireBtn(sx, '右舷', km.starboard, 'starboard');
  }
}
