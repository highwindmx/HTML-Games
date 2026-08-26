class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) {
    this.levelIndex = (data && typeof data.levelIndex === 'number') ? data.levelIndex : RunState.levelIndex;
  }

  create() {
    this.wind = new Wind();

    // R 重开本关会再次进入 create：先清理上一局的 Three canvas，避免叠加
    if (this.globe) { this.globe.destroy(); this.globe = null; }
    if (FX) FX.clear();

    // 3D 球体渲染层（战场），Phaser canvas 置于其上并透明（仅画 HUD/UI）
    const parent = document.getElementById('game') || document.body;
    this.globe = GlobeRenderer.create(parent);
    FX.init(this.globe);
    if (this.game && this.game.canvas) {
      this.game.canvas.style.position = 'absolute';
      this.game.canvas.style.left = '0';
      this.game.canvas.style.top = '0';
      this.game.canvas.style.zIndex = '2';
    }
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // 离开战斗（胜/负切到结算，或 R 重开）时清理 Three canvas 与特效，避免 3D 层在 UI 场景残留
    this.events.once('shutdown', () => {
      if (this.globe) { this.globe.destroy(); this.globe = null; }
      if (FX) FX.clear();
    });

    const level = Levels[this.levelIndex];
    const b = RunState.build || RunState._default();

    // 玩家编队：第 0 艘为旗舰（受控），其余友军 AI 沿其航向单纵列串联在其后方
    this.players = [];
    const n = level.playerShips;
    for (let i = 0; i < n; i++) {
      // 旗舰在 PLAYER_FLEET_X 朝东(0°)；后方=西向，沿航向一字排开
      const x = C.PLAYER_FLEET_X - i * C.FORMATION_SPACING;
      const y = C.FLEET_Y;
      const type = i === 0 ? 'ship' : 'frigate';   // 旗舰=战列舰，友舰=护卫舰
      const td = C.SHIP_TYPES[type];
      const ship = new Ship(this, x, y, {
        heading: 0, type,
        hp: C.PLAYER_HP * b.hpMul * td.hpMul,
        color: i === 0 ? 0x378add : 0x5aa0e0,
        damageMul: b.damageMul, turnMul: b.turnMul * td.turnMul, reloadMul: b.reloadMul,
        rangeMul: b.rangeMul, speedMul: b.speedMul * td.speedMul, damageTakenMul: b.damageTakenMul,
      });
      ship._rank = i;            // 编队排名：0=旗舰，友舰依此在后方串联
      ship.isFlagship = (i === 0);
      this.players.push(ship);
    }
    this.flagship = this.players[0];

    // 敌编队（全部 AI）：领队在最西(最靠近玩家)，其余在其后方(东侧)单纵列，朝西(180°)对峙
    this.enemies = [];
    const ec = level.enemies.length;
    for (let j = 0; j < ec; j++) {
      const type = j === 0 ? 'ship' : 'frigate';   // 敌领队=战列舰，其余护卫舰
      const td = C.SHIP_TYPES[type];
      const x = C.ENEMY_FLEET_X + j * C.FORMATION_SPACING;
      const y = C.FLEET_Y;
      const ship = new Ship(this, x, y, {
        heading: 180, type, isEnemy: true, color: 0xd85a30,
        hp: level.enemies[j].hp * td.hpMul, speedMul: td.speedMul, turnMul: td.turnMul,
      });
      ship._rank = j;
      this.enemies.push(ship);
    }
    this.enemyLeader = this.enemies[0];

    this.projectiles = [];
    this.over = false;
    this.win = false;

    // 3D 球体渲染层管理相机（第三人称跟随旗舰），Phaser 相机不跟随，仅作透明 UI 层

    // 按键从 KeyMap 读取（玩家可在开始界面设置），每动作支持多键
    const km = KeyMap.load();
    this.keys = {};
    for (const a of KeyMap.ACTIONS) {
      this.keys[a] = km[a].map((code) => this.input.keyboard.addKey(code));
    }
    this._down = (a) => this.keys[a].some((k) => k.isDown);
    this._justDown = (a) => this.keys[a].some((k) => Phaser.Input.Keyboard.JustDown(k));
    this._touch = { turn: 0, thrust: 0, fire: null };
    this._buildTouch();
    this.hud = new HUD(this);
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this._justDown('restart')) { this.scene.restart(); return; }
    if (this.over) return;
    this.wind.update(dt);

    // 旗舰阵亡则把控制转给下一艘存活船
    if (!this.flagship || this.flagship.hp <= 0) {
      this.flagship = this.players.find(p => p.hp > 0) || null;
    }

    // 玩家旗舰输入
    if (this.flagship && this.flagship.hp > 0) {
      let turn = 0, thrust = 0;
      if (this._down('left')) turn -= 1;
      if (this._down('right')) turn += 1;
      if (this._down('thrust')) thrust = 1;
      turn += this._touch.turn;
      thrust = Math.max(thrust, this._touch.thrust);
      this.flagship.turnInput = Util.clamp(turn, -1, 1);
      this.flagship.thrustInput = thrust;

      if (this._justDown('port')) this.fireFormationVolley('port');
      if (this._justDown('starboard')) this.fireFormationVolley('starboard');
      if (this._touch.fire) { this.fireFormationVolley(this._touch.fire); this._touch.fire = null; }
    }
    this._touch.turn = 0; this._touch.thrust = 0;

    // 友军 AI（玩家编队中非旗舰；旗舰阵亡转移后也不应被 AI 接管）
    for (let i = 1; i < this.players.length; i++) {
      const a = this.players[i];
      if (a.hp > 0 && a !== this.flagship) FleetAI.updateAlly(a, dt, this.wind, this.enemies, this.flagship, this);
    }
    // 敌 AI：领队缓慢朝玩家推进+舷侧齐射，其余跟随领队组成单纵列（与玩家镜像对峙）
    for (let j = 0; j < this.enemies.length; j++) {
      const e = this.enemies[j];
      if (e.hp <= 0) continue;
      if (e === this.enemyLeader) FleetAI.updateEnemyLeader(e, dt, this.wind, this.players, this);
      else FleetAI.updateAlly(e, dt, this.wind, this.players, this.enemyLeader, this);
    }

    // 所有存活船推进
    for (const s of this.players) if (s.hp > 0) s.update(dt, this.wind);
    for (const e of this.enemies) if (e.hp > 0) e.update(dt, this.wind);

    // 船间排斥：防止任何两船重叠（敌我皆然），直接根治"敌舰与我舰重合"
    this._separateShips();

    // 航行尾迹（3D）：达到节流且航速足够时，在船尾生成贴球面浮沫
    for (const s of [...this.players, ...this.enemies]) {
      if (s.hp > 0 && s._trailDue) FX.spawnTrail(s.x, s.y, s.heading);
    }

    // 炮弹：逻辑推进 + 3D 球面同步
    for (const p of this.projectiles) p.update(dt);
    for (const p of this.projectiles) FX.syncProjectile(p);
    this.projectiles = this.projectiles.filter(p => { if (p.dead) { FX.destroyProjectile(p); p.destroy(); return false; } return true; });

    // 3D 同步：所有船网格贴球面 + 相机第三人称跟随旗舰
    this.globe.syncShips([...this.players, ...this.enemies]);
    this.globe.syncCamera(this.flagship);
    FX.update(dt);
    this.globe.render();

    // 胜负判定
    const enemiesAlive = this.enemies.some(e => e.hp > 0);
    const playersAlive = this.players.some(p => p.hp > 0);
    if (!enemiesAlive) this._end(true);
    else if (!playersAlive) this._end(false);

    this.hud.update(this.wind, this.flagship, this.enemies, this.levelIndex);
  }

  _end(win) {
    if (this.over) return;
    this.over = true; this.win = win;
    this.hud.showResult(win ? '胜利！' : '败北');
    this.time.delayedCall(1300, () => {
      this.scene.start('Result', { win, levelIndex: this.levelIndex });
    });
  }

  // 自动选最近存活敌（玩家船）或最近存活玩家（敌船）为靶
  fireBroadside(ship, side) {
    const foes = ship.isEnemy ? this.players : this.enemies;
    const target = FleetAI.nearest(ship, foes);
    if (!target) return;
    // 仅锁装填中；空射允许（角度/超程只影响命中与伤害）
    if (!Combat.canFire(ship, target, side)) {
      if (ship === this.flagship) this.onFireFailed(ship, side, 'reload');
      return;
    }
    const res = ship.fire(side, target);
    if (!res) return;
    const rad = Util.degToRad(Combat.sideFireAngle(ship, side));
    const sideOffset = side === 'port' ? -13 : 13;
    const hr = Util.degToRad(ship.heading);
    const mx = ship.x - Math.sin(hr) * sideOffset;
    const my = ship.y + Math.cos(hr) * sideOffset;
    for (let i = 0; i < C.SHOTS_PER_VOLLEY; i++) {
      const spread = (i - (C.SHOTS_PER_VOLLEY - 1) / 2) * 0.05;
      const proj = new Projectile(this, mx, my, rad + spread, C.PROJECTILE_SPEED);
      proj.__isEnemyShot = ship.isEnemy;   // 供 Projectile 设 isEnemy（3D 颜色区分）
      proj.travelT = Math.max(0.2, res.travelTime);
      proj.arcMax = Math.min(12 + res.travelTime * 26, 60);  // 飞行越久抬得越高，呈抛物线
      proj.life = proj.travelT + 0.3;      // 命中后短暂存在再消失
      this.projectiles.push(proj);
    }
    this.time.delayedCall(res.travelTime * 1000, () => {
      if (res.hit) {
        target.takeDamage(res.damage * (ship.damageMul || 1));
        this.spawnHit(target.x, target.y, true);
      } else {
        this.spawnHit(target.x + Phaser.Math.Between(-25, 25), target.y + Phaser.Math.Between(-25, 25), false);
      }
    });
  }

  // 旗舰下令齐射：旗舰先按指定舷开火，整条编队同步——各友舰用各自最佳舷对最近敌齐射（仅当该舷真能命中，避免无意义空射浪费装填）
  fireFormationVolley(side) {
    if (!this.flagship || this.flagship.hp <= 0) return;
    this.fireBroadside(this.flagship, side);
    for (const a of this.players) {
      if (a === this.flagship || a.hp <= 0) continue;
      const target = FleetAI.nearest(a, this.enemies);
      if (!target) continue;
      const best = FleetAI.bestSide(a, target);
      if (best && Combat.broadsideQuality(a, target, best) > 0.15) this.fireBroadside(a, best);
    }
  }

  onFireFailed(ship, side, reason) {
    const name = side === 'port' ? '左舷' : '右舷';
    this.hud.flashHint(name + '装填中…', '#ffd34d');
  }

  spawnHit(x, y, hit) {
    // 3D 特效由 FX 层接管（炮弹命中火花 / 未中水花，球面投影）
    if (FX && this.globe) FX.spawnHit(x, y, hit);
  }

  // 船间排斥：相邻存活船若中心距 < 两船半径之和，则沿连线等分开，杜绝任何重叠（敌我皆然）
  _separateShips() {
    const all = [];
    for (const s of this.players) if (s.hp > 0) all.push(s);
    for (const s of this.enemies) if (s.hp > 0) all.push(s);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius;
        if (d > 0.001 && d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
          // 3D 网格位置由 GlobeRenderer.syncShips 每帧按 (x,y) 重投影，无需在此设 2D 位置
        }
      }
    }
  }

  _drawSea() { /* 3D 球体海洋由 GlobeRenderer 承担，不再需要 2D 海面 */ }

  _buildTouch() {
    const H = C.VIEW_H, W = C.VIEW_W;
    const turnBtn = (x, sign, label) => {
      const r = this.add.rectangle(x, H - 90, 60, 60, 0x000000, 0.35).setScrollFactor(0).setDepth(10000).setInteractive();
      this.add.text(x, H - 90, label, { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      r.on('pointerdown', () => { this._touch.turn = sign; });
      r.on('pointerup', () => { if (this._touch.turn === sign) this._touch.turn = 0; });
      r.on('pointerout', () => { if (this._touch.turn === sign) this._touch.turn = 0; });
    };
    turnBtn(60, -1, '←'); turnBtn(130, 1, '→');

    const thrustBtn = () => {
      const r = this.add.rectangle(W - 80, H - 90, 60, 60, 0x000000, 0.35).setScrollFactor(0).setDepth(10000).setInteractive();
      this.add.text(W - 80, H - 90, '帆', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      r.on('pointerdown', () => { this._touch.thrust = 1; });
      r.on('pointerup', () => { this._touch.thrust = 0; });
      r.on('pointerout', () => { this._touch.thrust = 0; });
    };
    thrustBtn();

    const fireBtn = (x, side, label) => {
      const r = this.add.rectangle(x, H - 90, 52, 60, 0x000000, 0.35).setScrollFactor(0).setDepth(10000).setInteractive();
      this.add.text(x, H - 90, label, { fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      r.on('pointerdown', () => { this._touch.fire = side; });
    };
    fireBtn(W - 150, 'port', 'U'); fireBtn(W - 210, 'starboard', 'O');
  }
}
