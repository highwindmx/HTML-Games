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

  // 僚机（护卫舰）：纯跟随旗舰的僚舰，只保持单纵列阵型，绝不自主开火。
  // 开火由旗舰指令统一调度（玩家按 U/O 触发整队齐射；敌方由领队 AI 调度）。
  // 旗舰阵亡则退化为缓行待命（不各自为战，避免护卫舰凭空获得战斗 AI）。
  updateAlly(ally, dt, wind, foes, flagship, scene) {
    if (!flagship || flagship.hp <= 0) {
      ally.turnInput = 0;
      ally.thrustInput = 0.3;
      return;
    }
    // 编队槽位：相对当前旗舰的排名（旗舰阵亡后自动重排，队伍保持连续）
    const slot = (ally._rank ?? 1) - (flagship._rank ?? 0);
    const hr = Util.degToRad(flagship.heading);
    const fx = flagship.x - Math.cos(hr) * C.FORMATION_SPACING * slot;
    const fy = flagship.y - Math.sin(hr) * C.FORMATION_SPACING * slot;
    // 转向队形点（朝向≈旗舰航向，使整条线保持同向、舷侧朝侧翼）
    const toAng = Util.radToDeg(Math.atan2(fy - ally.y, fx - ally.x));
    ally.turnInput = FleetAI.turnTowards(ally.heading, toAng);
    const gap = Math.hypot(fx - ally.x, fy - ally.y);
    ally.thrustInput = gap > 8 ? 1 : 0.4; // 到位后保持较高推力，贴住旗舰防漂移拉开
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
      if (fireSide) scene.fireBroadside(leader, fireSide);
    }
    // 推进：维持站位距离，不莽撞冲撞
    if (dist > standoff) leader.thrustInput = 0.6;
    else if (dist < standoff * 0.82) leader.thrustInput = -0.4; // 太近倒车拉开
    else leader.thrustInput = 0.12;
  },
};
