// 风：方向缓慢扫动，风力正弦波动。两者共同决定帆效（航速倍率）。
class Wind {
  constructor() {
    this.dir = C.WIND_INIT_DIR; // deg，风"吹向"的方向
    this.force = 1.0;
    this._t = 0;
  }
  update(dt) {
    this._t += dt;
    this.dir = (this.dir + (360 / C.WIND_ROTATE_PERIOD) * dt) % 360;
    const phase = (this._t / C.WIND_FORCE_PERIOD) * Math.PI * 2;
    const norm = (Math.sin(phase) + 1) / 2; // 0..1
    this.force = C.WIND_FORCE_MIN + (C.WIND_FORCE_MAX - C.WIND_FORCE_MIN) * norm;
  }
  // 给定船首与风的夹角(deg,0..180)返回帆效倍率
  sailEfficiency(angleToWind) {
    const a = Util.clamp(angleToWind, 0, 180);
    if (a <= 90) return Util.lerp(C.SAIL_EFF_DOWNWIND, C.SAIL_EFF_BEAM, a / 90);
    return Util.lerp(C.SAIL_EFF_BEAM, C.SAIL_EFF_UPWIND, (a - 90) / 90);
  }
  dirRad() { return Util.degToRad(this.dir); }
}
