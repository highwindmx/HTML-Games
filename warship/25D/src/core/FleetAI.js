// 舰队 AI：敌舰行为树（接近→抢风→齐射→拉扯）+ 友军自动跟随/集火。
// 纯决策，调用 Ship 的输入接口与 scene.fireBroadside 开火，不碰渲染。
const FleetAI = {
  // 最近存活目标
  nearest(ship, list) {
    let best = null, bd = Infinity;
    for (const o of list) {
      if (o.hp <= 0) continue;
      const d = Combat.distance(ship, o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  },

  // 仅在该舷射界(BROADSIDE_ARC)内的最近存活目标：用于 fireBroadside —— 保证"按哪舷只打哪侧"，
  // 杜绝"按左舷却朝右舷目标瞄准、炮弹横穿船身"的跨身射击。射界外（含另一侧）的敌不计入。
  nearestOnSide(ship, list, side) {
    let best = null, bd = Infinity;
    for (const f of list) {
      if (f.hp <= 0) continue;
      if (Combat.broadsideQuality(ship, f, side) <= 0) continue;  // 不在该舷射界内
      const d = Combat.distance(ship, f);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  },

  // 质量最高的舷（用于转向：把最佳舷亮给敌人），忽略装填状态
  bestSide(ship, target) {
    let best = null, bq = -1;
    for (const side of ['port', 'starboard']) {
      const q = Combat.broadsideQuality(ship, target, side);
      if (q > bq) { bq = q; best = side; }
    }
    return best;
  },

  // 选一个"质量够高且已装填完毕"的舷开火；优先质量更高的那一侧。
  // 从机制上杜绝"锁定最高质量却在装填中的舷"造成的观感问题，也避免浪费就绪舷。
  readyFireSide(ship, target, minQ) {
    let best = null, bq = minQ;
    for (const side of ['port', 'starboard']) {
      if (ship[side + 'Reload'] > 0) continue;          // 装填中，绝不开火
      const q = Combat.broadsideQuality(ship, target, side);
      if (q > bq) { bq = q; best = side; }
    }
    return best;
  },

  // 最短转向方向 -1/0/1
  turnTowards(cur, desired) {
    let d = Util.normalizeDeg(desired - cur);
    if (d > 180) d -= 360;
    if (Math.abs(d) < 5) return 0;
    return d > 0 ? 1 : -1;
  },

  // 礁石避障：前瞻探测前方/侧前方礁石，返回"远离礁石"的期望航向与是否临礁急刹。
  // 不碰渲染，只输出决策（turn/thrust 由调用方覆盖）。环绕世界用 wrapDelta 取最短差。
  avoidReefs(ship, scene) {
    const reefs = scene.reefs;
    if (!reefs || !reefs.length) return null;
    const hr = Util.degToRad(ship.heading);
    const fx = Math.cos(hr), fy = Math.sin(hr);   // 船头前向单位向量
    const look = 100;                              // 前瞻距离(px)
    let best = null, nd = Infinity, bx = 0, by = 0;
    for (const r of reefs) {
      const dx = Util.wrapDelta(r.x - ship.x, C.WORLD_W);
      const dy = Util.wrapDelta(r.y - ship.y, C.WORLD_H);
      const d = Math.hypot(dx, dy);
      const clearance = r.r + 46;                  // 预留安全半径
      // 仅在船头前方/侧前方（dot>-14）且进入预警圈的礁石算威胁
      if (d < clearance + look && (dx * fx + dy * fy) > -14) {
        if (d < nd) { nd = d; best = r; bx = dx; by = dy; }
      }
    }
    if (!best) return null;
    const away = Util.radToDeg(Math.atan2(-by, -bx)); // 朝远离礁石方向
    return { away, brake: nd < best.r + 28 };          // 太近则急刹
  },

  // 敌舰：接近到理想距离 → 抢风位使某舷对准 → 就绪且质量够就开火
  updateEnemy(enemy, dt, wind, foes, scene) {
    const target = FleetAI.nearest(enemy, foes);
    if (!target) { enemy.turnInput = 0; enemy.thrustInput = 0.2; return; }
    const dist = Combat.distance(enemy, target);
    const range = C.CANNON_RANGE * (enemy.rangeMul || 1);
    const ideal = range * 0.7;
    enemy.thrustInput = dist > ideal ? 1 : 0.4;
    const best = FleetAI.bestSide(enemy, target);
    if (best) {
      const desired = Combat.angleToTarget(enemy, target) - (best === 'port' ? -90 : 90);
      enemy.turnInput = FleetAI.turnTowards(enemy.heading, desired);
      const fireSide = FleetAI.readyFireSide(enemy, target, 0.35);
      if (fireSide) scene.fireBroadside(enemy, fireSide);
    }
  },

  // 僚机（护卫舰）：蛇形跟随（贪吃蛇式）前导船航迹，绝不自主导航、绝不自主接敌。
  // 设计约束（用户要求）：子舰不自己移动，只能尾随主舰，且必须与主舰同步齐射。
  // 实现：沿"前导船"的航迹面包屑，取落后 FORMATION_SPACING 路径距离的点作为目标——
  // 前导船转向时，拐点会像蛇一样沿队列向后传递，而非刚性地随主舰瞬间摆动（更自然、更科学）。
  // 自身 turnInput/thrustInput/speed 全置 0，不跑自己的物理；被船间排斥/礁石推开后，
  // 下一帧归位到航迹目标点。前导船阵亡由 BattleScene._leadFor 改派，自然接续领航。
  updateAlly(ally, leaderAhead, dt, scene) {
    if (!ally || ally.hp <= 0 || !leaderAhead || leaderAhead.hp <= 0) {
      ally.turnInput = 0; ally.thrustInput = 0; ally.speed = 0;
      return;
    }
    const t = FleetAI.followPoint(leaderAhead, C.FORMATION_SPACING);
    ally.heading = t.heading;                 // 航迹切线方向（沿路径前进），非硬锁前导船航向
    ally.x = Util.wrap(t.x, C.WORLD_W);
    ally.y = Util.wrap(t.y, C.WORLD_H);
    ally.turnInput = 0; ally.thrustInput = 0; ally.speed = leaderAhead.speed;
  },

  // 沿 ship 的航迹面包屑，取落后 dist 路径距离的点；返回 {x,y,heading(切线方向)}。
  // 用 wrapDelta 取最短差，兼容环绕世界；轨迹不足（开局/刚起步）则沿当前航向回退 dist，
  // 保持初始编队间距、避免瞬间塌缩到主舰；轨迹累计不足 dist 时回落到最旧点（等待主舰先开出距离）。
  followPoint(ship, dist) {
    const tr = ship.trail;
    if (!tr || tr.length < 2) {
      const r = Util.degToRad(ship.heading);
      return { x: ship.x - Math.cos(r) * dist, y: ship.y - Math.sin(r) * dist, heading: ship.heading };
    }
    let acc = 0;
    for (let i = tr.length - 1; i > 0; i--) {
      const a = tr[i], b = tr[i - 1];
      const dx = Util.wrapDelta(b.x - a.x, C.WORLD_W);
      const dy = Util.wrapDelta(b.y - a.y, C.WORLD_H);
      const d = Math.hypot(dx, dy);
      if (acc + d >= dist) {
        const f = d > 1e-4 ? (dist - acc) / d : 0;
        const x = Util.wrap(a.x + dx * f, C.WORLD_W);
        const y = Util.wrap(a.y + dy * f, C.WORLD_H);
        const heading = Util.radToDeg(Math.atan2(-dy, -dx));   // 切线 = 旧→新 行进方向（朝前，非朝后）
        return { x, y, heading };
      }
      acc += d;
    }
    const o = tr[0];
    return { x: o.x, y: o.y, heading: ship.heading };
  },

  // 敌人领队：像玩家旗舰一样"带队列、保持阵线"，不自由乱冲。
  // 与最近玩家保持站位距离（略大于炮程）并亮舷齐射；太近则倒车拉开，永不贴脸/重合。
  // 其余敌人用 updateAlly 跟随领队，形成与玩家镜像的单纵列对峙。
  // 开火侧由 readyFireSide 决定：只打已装填且质量够的舷，绝不在装填中开火。
  updateEnemyLeader(leader, dt, wind, foes, scene) {
    const target = FleetAI.nearest(leader, foes);
    if (!target) { leader.turnInput = 0; leader.thrustInput = 0.15; return; }
    const dist = Combat.distance(leader, target);
    const standoff = C.CANNON_RANGE * 1.05;   // 站位距离：略大于炮程，不贴脸
    // 转向：把最佳舷对准目标，使舷侧（而非船首）朝向敌人
    const best = FleetAI.bestSide(leader, target);
    if (best) {
      const desired = Combat.angleToTarget(leader, target) - (best === 'port' ? -90 : 90);
      leader.turnInput = FleetAI.turnTowards(leader.heading, desired);
      const fireSide = FleetAI.readyFireSide(leader, target, 0.3);
      if (fireSide) scene.fireEnemyVolley(fireSide);
    }
    // 推进：维持站位距离，不莽撞冲撞
    if (dist > standoff) leader.thrustInput = 0.6;
    else if (dist < standoff * 0.82) leader.thrustInput = -0.4; // 太近倒车拉开
    else leader.thrustInput = 0.12;
    // 礁石避障：优先级高于交战，避免敌领队持续撞礁快速掉血
    const av = FleetAI.avoidReefs(leader, scene);
    if (av) {
      leader.turnInput = FleetAI.turnTowards(leader.heading, av.away);
      if (av.brake) leader.thrustInput = 0;
    }
  },
};
