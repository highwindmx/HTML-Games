// ============================================================================
// 3D 船体网格（程序化低多边形，零美术资源）。
// 约定：本地坐标 船头 = -Z，船底贴地 = 本地 -Y（朝向球法线），右舷 = +X，左舷 = -X。
// GlobeRenderer.syncCamera / SphereMesh 用 lookAt(P+F) 使船头(-Z)指向航行方向。
// ============================================================================
// 船体几何：低多边形"船"——方船尾 + V 形尖船头（本地 -Z 为船首），平底面 + 甲板顶。
// 顶点：X=船宽(beam)，Y=向上(贴球法线)，Z=船长(船头=-Z)。
function _boatHull(L, B, H) {
  const b = B / 2, l = L / 2, h = H / 2;
  const v = new Float32Array([
    -b, -h, l,   // 0 船尾底 左
     b, -h, l,   // 1 船尾底 右
     0, -h, -l,  // 2 船头底 尖
    -b,  h, l,   // 3 船尾顶 左
     b,  h, l,   // 4 船尾顶 右
     0,  h, -l,  // 5 船头顶 尖
  ]);
  const idx = [
    0, 2, 1,            // 船底
    3, 4, 5,            // 甲板（朝天）
    0, 1, 4, 0, 4, 3,   // 船尾横板
    0, 3, 5, 0, 5, 2,   // 左舷侧
    1, 2, 5, 1, 5, 4,   // 右舷侧
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ShipMesh = {
  SCALE: 0.22,   // 平面像素尺寸 → 球面世界尺寸（船缩小到约为原 1/10，在 R=1600 球面上如真实小船）[PLACEHOLDER]

  build(ship) {
    const L = ship.hullLen * this.SCALE;
    const B = ship.hullBeam * this.SCALE;
    const H = L * 0.32;               // 吃水高度（与船长成比例，像一艘船而非平板）
    const color = ship.color;
    const g = new THREE.Group();

    // 船体（深侧，V 形尖头 + 方尾）
    const hullMat = new THREE.MeshPhongMaterial({ color: this._shade(color, 0.6), side: THREE.DoubleSide });
    const hull = new THREE.Mesh(_boatHull(L, B, H), hullMat);
    hull.position.y = H / 2;          // 船底贴海面(本地 y=0)，甲板在 +H
    g.add(hull);
    // 甲板（亮色薄盖，盖在顶部）
    const deckMat = new THREE.MeshPhongMaterial({ color: this._lighten(color, 0.25), side: THREE.DoubleSide });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(B * 0.9, H * 0.18, L * 0.95), deckMat);
    deck.position.y = H * 0.94;
    g.add(deck);

    // 艏斜桅（船头 -Z 伸出）
    const bow = new THREE.Mesh(new THREE.BoxGeometry(B * 0.14, H * 0.16, L * 0.16), hullMat);
    bow.position.set(0, H * 0.45, -L * 0.56);
    g.add(bow);

    // 桅杆 + 帆：沿船长方向（本地 Z，船头=-Z）纵列排布（修复"横列"问题）
    const mastCount = ship.mastCount || 3;
    const mastMat = new THREE.MeshPhongMaterial({ color: 0x5a3a1a });
    const sailMat = new THREE.MeshPhongMaterial({ color: 0xf3ead2, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    // 纵向（Z）位置：船尾为正、船头为负
    const zs = mastCount <= 1 ? [0] : mastCount === 2 ? [L * 0.22, -L * 0.30] : [L * 0.30, 0, -L * 0.32];
    const mhs = mastCount <= 1 ? [L * 0.7] : mastCount === 2 ? [L * 0.62, L * 0.50] : [L * 0.78, L * 0.92, L * 0.50];
    zs.forEach((z, i) => {
      const mh = mhs[i];
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.04, B * 0.06, mh, 6), mastMat);
      mast.position.set(0, H + mh * 0.5, z);
      g.add(mast);
      // 横帆：平面法线沿 Z（朝船头/船尾），宽度沿 X（船宽），像挂在前桅的方帆
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(B * 1.05, mh * 0.82), sailMat);
      sail.position.set(0, H + mh * 0.5, z);
      g.add(sail);
    });

    // 左右舷装填指示灯（绿=就绪，灰=装填中）；-X=左舷(port)，+X=右舷(starboard)
    const lightGeo = new THREE.SphereGeometry(Math.max(B * 0.12, 0.8), 8, 8);
    const portLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
    portLight.position.set(-B * 0.5, H * 0.6, 0);
    g.add(portLight);
    const starLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
    starLight.position.set(B * 0.5, H * 0.6, 0);
    g.add(starLight);

    g.visScale = ship.visScale || 1;
    g.userData.hull = hull;
    g.userData.hullColor = color;       // 原始船色（受击后用于还原）
    g.userData.portLight = portLight;
    g.userData.starLight = starLight;
    g.scale.setScalar(g.visScale);   // SCALE 已并入 L/B，这里只乘船型大小 visScale
    return g;
  },

  update(ship, renderer) {
    const g = ship.mesh3d;
    if (!g) return;
    const P = renderer.spherePos(ship.x, ship.y, new THREE.Vector3());
    const N = P.clone().normalize();
    const F = renderer.forwardDir(ship.x, ship.y, ship.heading, new THREE.Vector3());
    g.position.copy(P);
    g.up.copy(N);
    g.lookAt(P.clone().add(F));        // 本地 -Z（船头）指向航行方向 F
    const pl = g.userData.portLight, sl = g.userData.starLight;
    if (pl) pl.material.color.setHex(ship.portReload > 0 ? 0x888780 : 0x2ecc71);
    if (sl) sl.material.color.setHex(ship.starboardReload > 0 ? 0x888780 : 0x2ecc71);
    // 受击染红闪烁（_hitFlash 由 Ship.takeDamage 设定、update 递减）
    const hull = g.userData.hull;
    if (hull) {
      const base = g.userData.hullColor;
      const flash = ship._hitFlash > 0 ? (ship._hitFlash / 0.18) : 0;
      hull.material.color.setHex(this._mix(base, 0xff3030, flash));
    }
  },

  _mix(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const c = (v) => Math.round(v);
    return (c(ar + (br - ar) * t) << 16) | (c(ag + (bg - ag) * t) << 8) | c(ab + (bb - ab) * t);
  },

  _shade(hex, f) {
    const r = ((hex >> 16) & 255) * f, g = ((hex >> 8) & 255) * f, b = (hex & 255) * f;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return (c(r) << 16) | (c(g) << 8) | c(b);
  },
  _lighten(hex, f) {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + (255 - v) * f)));
    return (c(r) << 16) | (c(g) << 8) | c(b);
  },
};
