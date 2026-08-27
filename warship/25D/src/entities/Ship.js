// 船只：状态 + 图形容器。2.5D billboard 渲染由 ShipSprite 工厂负责（船体层旋转
// 呈现舷侧，桅杆/帆层保持竖直给出高度信号，Y 深度排序实现前后遮挡）。
class Ship {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.heading = opts.heading ?? 0;     // deg，0=船首指向 +x（东）
    this.speed = 0;
    this.maxHp = opts.hp ?? C.PLAYER_HP;
    this.hp = this.maxHp;
    this.isEnemy = !!opts.isEnemy;
    this.portReload = 0;
    this.starboardReload = 0;
    this.turnInput = 0;   // -1..1
    this.thrustInput = 0; // 0..1
    // 升级 build 倍率（默认 1，RunState.build 注入）
    this.damageMul = opts.damageMul ?? 1;
    this.turnMul = opts.turnMul ?? 1;
    this.reloadMul = opts.reloadMul ?? 1;
    this.rangeMul = opts.rangeMul ?? 1;
    this.speedMul = opts.speedMul ?? 1;
    this.hpMul = opts.hpMul ?? 1;
    this.damageTakenMul = opts.damageTakenMul ?? 1;
    this.color = opts.color ?? (this.isEnemy ? 0xd85a30 : 0x378add);
    // 船型：决定视觉剪影与基础机动性（倍率与升级 build 相乘）；血量由创建层决定
    this.type = opts.type || 'frigate';
    const td = C.SHIP_TYPES[this.type] || C.SHIP_TYPES.frigate;
    this.hullLen = td.hullLen; this.hullBeam = td.hullBeam;
    this.mastCount = td.mastCount; this.guns = td.guns;
    this.radius = td.hullLen * C.SHIP_RADIUS_FACTOR; // 碰撞半径（船间排斥用）
    this.speedMul = (opts.speedMul ?? 1) * td.speedMul;
    this.turnMul = (opts.turnMul ?? 1) * td.turnMul;
    // 体积一致：所有船 visScale 统一为 1（不再按血量区分大/小船）；hullLen/hullBeam 已含 2/3 缩小
    this.visScale = 1;
    this.mesh3d = null;   // 预留视觉容器（2.5D 由 ShipSprite 注入 ship.container；本版未使用）
    this.trail = [];      // 航迹面包屑：供僚机贪吃蛇式跟随（Ship.update 记录）
    this._burstCd = 0;    // 炸膛冷却计时（未装填强行开火惩罚用）
  }

  update(dt, wind) {
    // 转向：速率随航速正比（真实舵效），但有地板值兜底（静止仍保留部分转向，防卡死）
    const speedRatio = Util.clamp(this.speed / (C.SHIP_BASE_SPEED * this.speedMul), 0, 1);
    const turnRate = C.SHIP_TURN_RATE * this.turnMul * (C.TURN_SPEED_FLOOR + (1 - C.TURN_SPEED_FLOOR) * speedRatio);
    this.heading = Util.normalizeDeg(this.heading + this.turnInput * Util.radToDeg(turnRate) * dt);
    // 航速（受风影响）
    const angleToWind = Util.angleDiff(this.heading, wind.dir);
    const eff = wind.sailEfficiency(angleToWind);
    const target = this.thrustInput > 0 ? C.SHIP_BASE_SPEED * this.speedMul * eff * wind.force : 0;
    const rate = C.SHIP_ACCEL * dt;
    if (this.speed < target) this.speed = Math.min(target, this.speed + rate);
    else this.speed = Math.max(target, this.speed - rate * 1.2);
    if (this.speed < 0) this.speed = 0;
    // 位移（世界环绕：穿左出右、穿上出下，无边界墙）
    const r = Util.degToRad(this.heading);
    this.x += Math.cos(r) * this.speed * dt;
    this.y += Math.sin(r) * this.speed * dt;
    this.x = Util.wrap(this.x, C.WORLD_W);
    this.y = Util.wrap(this.y, C.WORLD_H);
    // 航迹面包屑（供僚机蛇形跟随）：仅位移超阈值(2px)时记录，使轨迹按"路径长度"而非帧数存储，
    // 上限 1400 点足够覆盖整队落后距离；轨迹不足时 followPoint 用航向回退兜底（不塌缩）。
    const trl = this.trail;
    const last = trl[trl.length - 1];
    if (!last || Math.hypot(Util.wrapDelta(this.x - last.x, C.WORLD_W), Util.wrapDelta(this.y - last.y, C.WORLD_H)) >= 2) {
      trl.push({ x: this.x, y: this.y, h: this.heading });
      if (trl.length > 1400) trl.shift();
    }
    // 装填
    if (this.portReload > 0) this.portReload = Math.max(0, this.portReload - dt);
    if (this.starboardReload > 0) this.starboardReload = Math.max(0, this.starboardReload - dt);
    // 2D 渲染（船体随 heading 旋转 + 容器定位 + Y-sort + 受击闪红）由 BattleScene 每帧驱动 ShipSprite 完成，
    // 不在此处操作图形。尾迹节流标记 (_trailDue) 由 BattleScene 读取触发 2D 尾迹。

    // 尾迹节流计时（供 BattleScene 读取决定是否生成 2D 尾迹）
    this._trailT = (this._trailT ?? 0) - dt;
    if (this._trailT <= 0) { this._trailT = C.TRAIL_INTERVAL; this._trailDue = this.speed > C.TRAIL_SPEED_MIN; }
    else this._trailDue = false;
    // 受击染红闪烁计时
    if (this._hitFlash > 0) this._hitFlash = Math.max(0, this._hitFlash - dt);
    // 船首冲撞冷却计时
    if (this._ramCd > 0) this._ramCd = Math.max(0, this._ramCd - dt);
    // 炸膛冷却计时
    if (this._burstCd > 0) this._burstCd = Math.max(0, this._burstCd - dt);
  }

  // 开火：成功返回 {side, damage(确定性,无概率), travelTime}，失败返回 null。
  // 命中与否由炮弹到达时"落点→目标核心距离"几何判定(BattleScene 负责)，此处只给确定性伤害。
  fire(side, target, travel) {
    if (!Combat.canFire(this, target, side)) return null;
    this[side + 'Reload'] = C.RELOAD_TIME * this.reloadMul;
    return { side, damage: Combat.volleyDamage(this, target), travelTime: travel };
  }

  takeDamage(d) {
    this.hp = Math.max(0, this.hp - d * this.damageTakenMul);
    this._hitFlash = 0.18; // 受击闪红：ShipSprite 读取做 2D 染红
  }
}
