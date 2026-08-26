// ============================================================================
// 3D 战场特效层（炮弹 / 命中火花 / 未中水花 / 航行尾迹），全部为 Three 对象，
// 挂在 GlobeRenderer 的场景里。每帧由 BattleScene 驱动 update(dt)。
// 炮弹逻辑仍由 Projectile.js（平面 x,y）推进，本层只做球面渲染 + 命中/尾迹。
// ============================================================================
const FX = {
  init(renderer) {
    this.r = renderer;
    this.items = [];          // 临时特效（火花/水花/尾迹）
    this._v = new THREE.Vector3();
  },

  // 命中火花（橙）/ 未中水花（蓝）：命中点 (x,y) 投影到球面，迸溅/扩散
  spawnHit(x, y, hit) {
    if (!this.r) return;
    const P = this.r.spherePos(x, y, new THREE.Vector3());
    const N = P.clone().normalize();
    const grp = new THREE.Group();
    grp.position.copy(P);
    if (hit) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 1 });
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const len = (8 + Math.random() * 14);
        // 在切平面内随机方向迸溅（用 N 构造正交基）
        const e1 = new THREE.Vector3(1, 0, 0).cross(N).normalize();
        const e2 = N.clone().cross(e1).normalize();
        const dir = e1.multiplyScalar(Math.cos(a)).add(e2.multiplyScalar(Math.sin(a)));
        const dot = new THREE.Mesh(new THREE.SphereGeometry(2.4, 6, 6), mat);
        dot.position.copy(dir.multiplyScalar(len));
        grp.add(dot);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 1.4, 6, 16),
        new THREE.MeshBasicMaterial({ color: 0xff7b3a, transparent: true, opacity: 0.9 }));
      ring.lookAt(P.clone().add(N));   // 环面贴地
      grp.add(ring);
    } else {
      const mat = new THREE.MeshBasicMaterial({ color: 0xbfe8ef, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(2, 6, 6), mat);
        const e1 = new THREE.Vector3(1, 0, 0).cross(N).normalize();
        const e2 = N.clone().cross(e1).normalize();
        const dir = e1.multiplyScalar(Math.cos(a)).add(e2.multiplyScalar(Math.sin(a)));
        dot.position.copy(dir.multiplyScalar(10));
        grp.add(dot);
      }
    }
    this.r.scene.add(grp);
    this.items.push({ grp, t: 0, max: hit ? 0.3 : 0.34, hit, baseScale: hit ? 3.2 : 2.6 });
  },

  // 航行尾迹：船尾贴海面的扁圆盘（泡沫），放大淡出，加法混合更显眼
  spawnTrail(x, y, heading) {
    if (!this.r) return;
    const P = this.r.spherePos(x, y, new THREE.Vector3());
    const N = P.clone().normalize();
    const F = this.r.forwardDir(x, y, heading, new THREE.Vector3());
    const pos = P.clone().add(N.clone().multiplyScalar(0.6)).add(F.clone().multiplyScalar(-6));
    const m = new THREE.Mesh(new THREE.CircleGeometry(7, 16),
      new THREE.MeshBasicMaterial({
        color: 0xdffaff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), N); // 圆盘平铺海面（法线=球法线）
    this.r.scene.add(m);
    this.items.push({ grp: m, t: 0, max: 0.8, hit: false, trail: true, baseScale: 3.0, startOpacity: 0.5 });
  },

  // 炮弹：由 Projectile 逻辑驱动 (x,y)，本层 lazy 建 3D 小球并逐帧更新位置（球面 + 抛物线抬升）
  ensureProjectile(p) {
    if (!this.r || p._mesh) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8),
      new THREE.MeshBasicMaterial({ color: p.isEnemy ? 0xff8a5a : 0xaee0ff }));
    this.r.scene.add(m);
    p._mesh = m;
  },
  syncProjectile(p) {
    if (!p._mesh) this.ensureProjectile(p);
    const P = this.r.spherePos(p.x, p.y, this._v);
    const N = P.clone().normalize();
    // 抛物线：进度 prog∈[0,1] 时沿法线抬升 arcMax·4·prog·(1-prog)，中点最高
    const prog = Util.clamp((p.t || 0) / (p.travelT || 1.5), 0, 1);
    const lift = (p.arcMax || 16) * 4 * prog * (1 - prog);
    p._mesh.position.copy(P.clone().add(N.multiplyScalar(lift + 2)));
  },
  destroyProjectile(p) {
    if (p._mesh) { this.r.scene.remove(p._mesh); p._mesh = null; }
  },

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = it.t / it.max;
      if (k >= 1) {
        this.r.scene.remove(it.grp);
        this.items.splice(i, 1);
        continue;
      }
      if (it.trail) {
        const s = 1 + (it.baseScale - 1) * k;
        it.grp.scale.setScalar(s);
        it.grp.material.opacity = (it.startOpacity || 0.5) * (1 - k);
      } else {
        it.grp.scale.setScalar(1 + (it.baseScale - 1) * k);
        it.grp.children.forEach((c) => { if (c.material) c.material.opacity = (it.hit ? 1 : 0.9) * (1 - k); });
      }
    }
  },

  clear() {
    if (!this.r) return;
    for (const it of this.items) this.r.scene.remove(it.grp);
    this.items.length = 0;
  },
};
