// 炮弹：平面 (x,y) 直线飞行，超时自毁。命中判定由场景按 travelTime 延时结算。
// 3D 渲染（球面小球 + 拖尾）由 FX 层（render3d/FX.js）接管，本类只做逻辑载体。
class Projectile {
  constructor(scene, x, y, angleRad, speed) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.vx = Math.cos(angleRad) * speed;
    this.vy = Math.sin(angleRad) * speed;
    this.life = 1.5;
    this.isEnemy = !!scene.__isEnemyShot;   // 由 fireBroadside 注入
    this.t = 0;                 // 已飞行时间（用于抛物线进度）
    this.travelT = 1.5;         // 到达目标的飞行时长（由 fireBroadside 注入）
    this.arcMax = 16;           // 抛物线最高抬升（表面法线方向），由 fireBroadside 注入
    this._mesh = null;
  }
  update(dt) {
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.t += dt;
    this.life -= dt;
  }
  get dead() { return this.life <= 0; }
  destroy() { this._mesh = null; }   // 实际 3D mesh 清理在 BattleScene/FX 内
}
