// ============================================================================
// 风帆王者 · 原型调参表
// 所有数值集中在此，便于快速调参。标注 [PLACEHOLDER] 的为待 playtest 验证的假设值。
// 铁律：任何数值改动都能在 constants.js 一处找到，禁止散落 magic number。
// ============================================================================
const C = {
  // ---- 世界 / 视口 ----
  // 视口 = 画布渲染分辨率（相机窗口）；世界 = 可航行区域，远大于视口，靠相机跟随旗舰。
  VIEW_W: 1280,
  VIEW_H: 720,
  WORLD_W: 3200,   // 可航行世界宽（远大于视口，制造开阔海域 + 相机跟随）[PLACEHOLDER]
  WORLD_H: 1800,   // 可航行世界高 [PLACEHOLDER]

  // ---- 船只移动（街机基底）----
  SHIP_TURN_RATE: 1.8,    // rad/s，满速时 180°约需 1.7s [PLACEHOLDER]
  TURN_SPEED_FLOOR: 0.35, // 转向随航速正比的下限：静止仍保留 35% 转向（街机兜底，科学+不卡死）[PLACEHOLDER]
  SHIP_BASE_SPEED: 130,   // px/s，满帆效率 100% 时 [PLACEHOLDER]
  SHIP_ACCEL: 110,        // px/s^2，油门响应 [PLACEHOLDER]

  // ---- 船体 ----
  PLAYER_HP: 100,         // [PLACEHOLDER]
  ENEMY_HP: 100,          // [PLACEHOLDER]

  // ---- 风系统 ----
  WIND_ROTATE_PERIOD: 50, // s，风向扫完一整圈 [PLACEHOLDER]
  WIND_INIT_DIR: 0,       // deg，0=吹向 +x（东）
  WIND_FORCE_MIN: 0.7,    // 低速时航速倍率 [PLACEHOLDER]
  WIND_FORCE_MAX: 1.15,   // 高速时航速倍率 [PLACEHOLDER]
  WIND_FORCE_PERIOD: 26,  // s，风力正弦周期 [PLACEHOLDER]

  // 帆效曲线：与风的夹角 (deg) 0=顺风,90=横风,180=逆风
  SAIL_EFF_DOWNWIND: 1.0,
  SAIL_EFF_BEAM: 1.12,    // 最佳帆角 [PLACEHOLDER]
  SAIL_EFF_UPWIND: 0.22,  // [PLACEHOLDER]

  // ---- 战斗 ----
  BROADSIDE_ARC: 50,      // deg，垂直于船身多少度内可有效开火 [PLACEHOLDER]
  RELOAD_TIME: 4.0,       // s，单侧装填 [PLACEHOLDER]
  CANNON_RANGE: 360,      // px，有效射程 [PLACEHOLDER]
  CANNON_DAMAGE: 14,      // 每轮齐射命中伤害（近距基准）[PLACEHOLDER]
  DAMAGE_RANGE_FALLOFF: 0.4, // 炮程边缘伤害保留比例 0..1：近=100%，边缘=40% [PLACEHOLDER]
  SHOTS_PER_VOLLEY: 3,    // 每侧每次视觉炮弹数 [PLACEHOLDER]
  PROJECTILE_SPEED: 430,  // px/s [PLACEHOLDER]

  // ---- 船型（视觉剪影 + 基础性能，与升级 build 倍率相乘；血量由创建层决定）----
  SHIP_TYPES: {
    frigate: { name: '护卫舰', hullLen: 38, hullBeam: 18, mastCount: 2, guns: 3, hpMul: 0.8,  speedMul: 1.15, turnMul: 1.2 },
    ship:    { name: '战列舰', hullLen: 50, hullBeam: 24, mastCount: 3, guns: 5, hpMul: 1.7,  speedMul: 0.82, turnMul: 0.7 },
  },

  // ---- 尾迹 ----
  TRAIL_INTERVAL: 0.09,   // s，尾迹泡沫生成间隔 [PLACEHOLDER]
  TRAIL_SPEED_MIN: 25,    // px/s，低于此航速不生成尾迹（停船无尾迹）[PLACEHOLDER]
  TRAIL_LIFE: 0.7,        // s，尾迹泡沫寿命 [PLACEHOLDER]
  FORMATION_SPACING: 56,  // px，友舰在旗舰后方单纵列间距（>船长避免重叠）[PLACEHOLDER]
  SHIP_RADIUS_FACTOR: 0.46, // 碰撞半径 = 船长 × 此系数（船间排斥用，防重叠）[PLACEHOLDER]
  PLAYER_FLEET_X: 440,    // 玩家旗舰初始 x（编队向其西方一字排开）[PLACEHOLDER]
  ENEMY_FLEET_X: 840,     // 敌领队初始 x（编队向其东方一字排开，与玩家镜像对峙）[PLACEHOLDER]
  FLEET_Y: 360,           // 编队初始 y 中线 [PLACEHOLDER]
  CAMERA_LERP: 0.08,      // 相机跟随旗舰的平滑系数（0=瞬移,1=死跟）[PLACEHOLDER]
  HIT_CHANCE_IDEAL: 0.9,  // 完美角度+近距命中率 [PLACEHOLDER]
  HIT_CHANCE_MIN: 0.15,   // 最差情况命中率下限 [PLACEHOLDER]
};

// 小工具，集中放这避免各文件重复
const Util = {
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  lerp: (a, b, t) => a + (b - a) * Util.clamp(t, 0, 1),
  degToRad: (d) => d * Math.PI / 180,
  radToDeg: (r) => r * 180 / Math.PI,
  normalizeDeg: (d) => { d %= 360; if (d < 0) d += 360; return d; },
  // 世界环绕：值超出 [0,size) 则从对侧回卷（穿左出右 / 穿上出下）
  wrap: (v, size) => { v %= size; if (v < 0) v += size; return v; },
  // 两角度最小差，返回 0..180
  angleDiff: (a, b) => {
    let d = Math.abs(Util.normalizeDeg(a) - Util.normalizeDeg(b)) % 360;
    if (d > 180) d = 360 - d;
    return d;
  },
};
