// 战斗判定：纯逻辑，不碰渲染。
const Combat = {
  angleToTarget(ship, target) {
    const dx = Util.wrapDelta(target.x - ship.x, C.WORLD_W);
    const dy = Util.wrapDelta(target.y - ship.y, C.WORLD_H);
    return Util.radToDeg(Math.atan2(dy, dx));
  },
  distance(ship, target) {
    const dx = Util.wrapDelta(target.x - ship.x, C.WORLD_W);
    const dy = Util.wrapDelta(target.y - ship.y, C.WORLD_H);
    return Math.hypot(dx, dy);
  },
  // 某舷火炮指向（船首 ±90°）
  sideFireAngle(ship, side) {
    const perp = side === 'port' ? -90 : 90;
    return Util.normalizeDeg(ship.heading + perp);
  },
  // 开火质量 0..1：0=不能/不该打
  broadsideQuality(ship, target, side) {
    const range = C.CANNON_RANGE * (ship.rangeMul || 1);
    const dist = Combat.distance(ship, target);
    if (dist > range) return 0;
    const toTarget = Combat.angleToTarget(ship, target);
    const fireAngle = Combat.sideFireAngle(ship, side);
    const off = Util.angleDiff(toTarget, fireAngle); // 0=完美舷侧
    if (off > C.BROADSIDE_ARC) return 0;
    const angleQ = 1 - off / C.BROADSIDE_ARC;
    const distQ = 1 - dist / range;
    return Util.clamp(angleQ * 0.6 + distQ * 0.4, 0, 1);
  },
  // 仅锁装填中：允许空射（角度/超程不再阻止开火，只影响命中与伤害）
  canFire(ship, target, side) {
    return ship[side + 'Reload'] === 0;
  },
  // 确定性伤害（无概率）：命中与否由炮弹到达时"落点→目标核心距离"几何判定，
  // 这里只按发射→目标距离做炮程衰减（近距 100%，炮程边缘降到 DAMAGE_RANGE_FALLOFF）。
  volleyDamage(ship, target) {
    const dist = Combat.distance(ship, target);
    const range = C.CANNON_RANGE * (ship.rangeMul || 1);
    const distFactor = 1 - Util.clamp(dist / range, 0, 1) * (1 - C.DAMAGE_RANGE_FALLOFF);
    return C.CANNON_DAMAGE * distFactor;
  },
};
