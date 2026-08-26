// ============================================================================
// 3D 球体（地球）渲染层 —— 用 Three.js（全局 THREE，UMD vendored）。
// 玩法世界仍是平面 (x,y)，本层做"经纬度 → 球面"投影，让船在地球仪表面航行。
// 经度绕一圈 = 平面 x wrap，视觉上无缝回原点（根除穿屏跳变）。
// 仅负责战场 3D 渲染；Phaser 仍管场景切换 / 输入 / HUD / 升级（UI 层不动）。
// ============================================================================
const GlobeRenderer = {
  R: 1600,           // 球体半径（视觉单位）：放大地球，让船像在真实星球海面航行 [PLACEHOLDER]
  CAM_HEIGHT: 45,    // 相机在船法线上方高度：船缩小后相机更贴海面，地球更显大 [PLACEHOLDER]
  CAM_BACK: 85,      // 相机在船首反方向后退距离 [PLACEHOLDER]

  // 平面 (x,y) → 球面点（Y 轴为极轴）
  spherePos(x, y, out) {
    const lon = (x / C.WORLD_W) * Math.PI * 2;
    const lat = (y / C.WORLD_H - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const v = out || new THREE.Vector3();
    v.set(this.R * cl * Math.cos(lon), this.R * sl, this.R * cl * Math.sin(lon));
    return v;
  },

  // 船首朝向（平面 heading：0=东/+x，90=北/+y）投影到球面切平面单位向量
  forwardDir(x, y, heading, out) {
    const lon = (x / C.WORLD_W) * Math.PI * 2;
    const lat = (y / C.WORLD_H - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    // 经向切向（东）E = (-sinLon, 0, cosLon)
    const ex = -Math.sin(lon), ez = Math.cos(lon);
    // 纬向切向（北）Nth = (-sinLat*cosLon, cosLat, -sinLat*sinLon)
    const nx = -Math.sin(lat) * Math.cos(lon), ny = Math.cos(lat), nz = -Math.sin(lat) * Math.sin(lon);
    const h = heading * Math.PI / 180;
    const v = out || new THREE.Vector3();
    v.set(ex * Math.cos(h) + nx * Math.sin(h), ny * Math.sin(h), ez * Math.cos(h) + nz * Math.sin(h));
    return v.normalize();
  },

  create(parentEl) {
    this.parent = parentEl;
    // 初始尺寸跟随窗口（与 Phaser Scale.FIT 对齐，避免固定 1280x720 在缩放/大屏下错位或留黑边）
    const w = (window && window.innerWidth) ? window.innerWidth : C.VIEW_W;
    const h = (window && window.innerHeight) ? window.innerHeight : C.VIEW_H;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    const cv = this.renderer.domElement;
    cv.style.position = 'absolute';
    cv.style.left = '0'; cv.style.top = '0';
    cv.style.width = '100%';          // 铺满父容器（与 Phaser canvas 重叠区域一致）
    cv.style.height = '100%';
    cv.style.zIndex = '0';          // 置于 Phaser canvas（UI）之下
    parentEl.appendChild(cv);
    this.canvas = cv;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a2230, 0.0007);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 1, 8000);
    this.camera.position.set(0, this.R + 250, 250);
    this.camera.lookAt(0, 0, 0);

    // 光照
    const hemi = new THREE.HemisphereLight(0xbfe8ef, 0x0a2230, 0.9);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(400, 800, 300);
    this.scene.add(dir);

    // 球体海洋（不透明深蓝，作为"地球"本体）
    const globeGeo = new THREE.SphereGeometry(this.R, 64, 48);
    const globeMat = new THREE.MeshPhongMaterial({ color: 0x12506a, shininess: 18, specular: 0x2f7480 });
    this.globe = new THREE.Mesh(globeGeo, globeMat);
    this.scene.add(this.globe);

    // 经纬网格（淡青线框，给出"球体"体积感与航行参照）
    const gridGeo = new THREE.SphereGeometry(this.R + 1.5, 36, 18);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x2f7480, wireframe: true, transparent: true, opacity: 0.18 });
    this.grid = new THREE.Mesh(gridGeo, gridMat);
    this.scene.add(this.grid);

    this.shipMeshes = new Map();   // ship -> THREE.Object3D
    this._camTmp = new THREE.Vector3();
    this._fwdTmp = new THREE.Vector3();
    this._nTmp = new THREE.Vector3();

    window.addEventListener('resize', () => this._onResize());
    return this;
  },

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  addShip(ship) {
    const mesh = ShipMesh.build(ship);
    this.scene.add(mesh);
    this.shipMeshes.set(ship, mesh);
    ship.mesh3d = mesh;
  },

  removeShip(ship) {
    const mesh = this.shipMeshes.get(ship);
    if (mesh) { this.scene.remove(mesh); this.shipMeshes.delete(ship); }
  },

  // 每帧同步所有存活船网格的姿态（贴球面 + 切向朝向）
  syncShips(ships) {
    for (const s of ships) {
      if (s.hp <= 0) { this.removeShip(s); continue; }
      if (!this.shipMeshes.has(s)) this.addShip(s);
      ShipMesh.update(s, this);
    }
  },

  // 第三人称相机：位于旗舰法线上方 + 船首反方向后退，lookAt 旗舰
  syncCamera(flagship) {
    if (!flagship) return;
    const P = this.spherePos(flagship.x, flagship.y, this._camTmp);
    const N = P.clone().normalize();
    const F = this.forwardDir(flagship.x, flagship.y, flagship.heading, this._fwdTmp);
    const camPos = P.clone()
      .add(N.clone().multiplyScalar(this.CAM_HEIGHT))
      .add(F.clone().multiplyScalar(-this.CAM_BACK));
    this.camera.position.copy(camPos);
    this.camera.up.copy(N);
    this.camera.lookAt(P);
  },

  render() { this.renderer.render(this.scene, this.camera); },

  destroy() {
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this.renderer) this.renderer.dispose();
  },
};
