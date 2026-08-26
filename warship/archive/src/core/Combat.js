// 战斗判定：纯逻辑，不碰渲染。
const Combat = {
  angleToTarget(ship, target) {
    return Util.radToDeg(Math.atan2(target.y - ship.y, target.x - ship.x));
  },
  distance(ship, target) {
    return Math.hypot(target.x - ship.x, target.y - ship.y);
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
  // 开火失败原因：仅 'reload'（装填中）；空射不再阻止，故无 angle/range
  fireFailReason(ship, target, side) {
    if (ship[side + 'Reload'] > 0) return 'reload';
    return null;
  },
  // 掷骰判定命中 + 距离衰减伤害
  resolveVolley(ship, target, side) {
    const q = Combat.broadsideQuality(ship, target, side);
    if (q <= 0) return { hit: false, quality: 0, damage: 0 };
    const chance = Util.lerp(C.HIT_CHANCE_MIN, C.HIT_CHANCE_IDEAL, q);
    // 距离衰减：近距 100%，炮程边缘降到 DAMAGE_RANGE_FALLOFF
    const dist = Combat.distance(ship, target);
    const range = C.CANNON_RANGE * (ship.rangeMul || 1);
    const distFactor = 1 - (dist / range) * (1 - C.DAMAGE_RANGE_FALLOFF);
    const damage = C.CANNON_DAMAGE * distFactor;
    return { hit: Math.random() < chance, quality: q, damage };
  },
};
