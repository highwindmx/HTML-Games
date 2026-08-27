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
  WINDWARD_RATIO: 0.6,    // 逆风满帆占比阈值：满帆顶风(windwardTime) / 本关总时长 ≥ 此值 [PLACEHOLDER]

  // 帆效曲线：与风的夹角 (deg) 0=顺风,90=横风,180=逆风
  SAIL_EFF_DOWNWIND: 1.0,
  SAIL_EFF_BEAM: 1.12,    // 最佳帆角 [PLACEHOLDER]
  SAIL_EFF_UPWIND: 0.22,  // [PLACEHOLDER]

  // ---- 战斗 ----
  BROADSIDE_ARC: 50,      // deg，垂直于船身多少度内可有效开火 [PLACEHOLDER]
  FIRE_ARC_RADIUS: 90,    // px，八字炮射弧半径（距离船舷一定距离处的"可射击"指示弧）[PLACEHOLDER]
  RELOAD_TIME: 4.0,       // s，单侧装填 [PLACEHOLDER]
  BURST_DAMAGE: 8,        // 炸膛自伤（约占满血 8%）：未装填强行下令开火惩罚
  BURST_CD: 1.2,          // s，炸膛后冷却，防止连点瞬秒
  CANNON_RANGE: 320,      // px，有效射程（被炮击/开火的判定范围；略缩避免从过远被糊）[PLACEHOLDER]
  CANNON_DAMAGE: 14,      // 每轮齐射命中伤害（近距基准）[PLACEHOLDER]
  DAMAGE_RANGE_FALLOFF: 0.4, // 炮程边缘伤害保留比例 0..1：近=100%，边缘=40% [PLACEHOLDER]
  SHOTS_PER_VOLLEY: 3,    // 每侧每次视觉炮弹数 [PLACEHOLDER]
  PROJECTILE_SPEED: 430,  // px/s [PLACEHOLDER]

  // ---- 船首冲撞（敌对两舰重叠且船首朝向对方、有航速时造成伤害）----
  RAM_DAMAGE: 10,         // 每次冲撞伤害 [PLACEHOLDER]
  RAM_CD: 0.5,            // 对同一目标冲撞冷却(s)，避免逐帧狂掉血 [PLACEHOLDER]
  RAM_MIN_SPEED: 25,      // 低于此航速不视为"冲撞"（仅轻轻触碰不造成伤害）[PLACEHOLDER]
  RAM_FACE_DOT: 0.3,      // 船首前向·指向对方单位向量 > 此阈值才算"船首冲撞" [PLACEHOLDER]

  // ---- 船型（统一：不再区分旗舰/护卫舰，体积与性能完全一致）----
  // 用户要求"体积一样、性能一样"：所有船共用同一型，hpMul/speedMul/turnMul 均为 1，
  // 仅受 RunState.build 升级倍率影响。hullLen/hullBeam 取"原旗舰(战列舰)尺寸 × 2/3"，
  // 即"船体整体再减小到原来的 2/3"。visScale 在 Ship 中固定为 1（体积一致）。
  SHIP_TYPES: {
    ship: { name: '战舰', hullLen: 33, hullBeam: 13, mastCount: 3, guns: 4, hpMul: 1, speedMul: 1, turnMul: 1 },
  },

  // ---- 尾迹 ----
  TRAIL_INTERVAL: 0.09,   // s，尾迹泡沫生成间隔 [PLACEHOLDER]
  TRAIL_SPEED_MIN: 25,    // px/s，低于此航速不生成尾迹（停船无尾迹）[PLACEHOLDER]
  TRAIL_LIFE: 0.7,        // s，尾迹泡沫寿命 [PLACEHOLDER]

  // ---- 礁石（障碍：碰撞造成伤害并被推开，逼迫绕行）----
  REEF_COUNT: 14,        // 每关随机礁石数 [PLACEHOLDER]
  REEF_RADIUS: 26,       // 礁石碰撞/视觉半径(px) [PLACEHOLDER]
  REEF_DAMAGE: 14,       // 接触每秒伤害 [PLACEHOLDER]
  REEF_CLEARANCE: 260,   // 礁石与初始编队最小间距（避免出生即撞）[PLACEHOLDER]

  // ---- 装饰（鲸背 / 海怪，纯视觉：无碰撞、不挡炮弹，仅在远处随机刷新）----
  DECOR_COUNT: 10,         // 随机装饰数 [PLACEHOLDER]
  DECOR_MIN_DIST_SHIP: 420,// 装饰与初始编队最小距离（保证在远处才出现）[PLACEHOLDER]
  DECOR_CLEARANCE: 200,    // 装饰彼此 / 与礁石最小间距 [PLACEHOLDER]
  DECOR_HIDE_RADIUS: 95,   // px，船只进入此距离内则隐藏该装饰（避免穿模 / 出戏）[PLACEHOLDER]

  // ---- 小地图（右上角常驻：敌/友/礁石 + 视口框）----
  MINIMAP_W: 190,        // px [PLACEHOLDER]
  MINIMAP_H: 107,        // px（保持 3200:1800 世界纵横比）[PLACEHOLDER]
  MINIMAP_MARGIN: 12,    // 距右/上的边距 [PLACEHOLDER]
  MINIMAP_Y: 40,         // 顶部 y（敌HP下方）[PLACEHOLDER]

  FORMATION_SPACING: 112, // px，友舰在前导船后方单纵列间距（用户要求"再扩大一倍"=56→112；>船长避免重叠）[PLACEHOLDER]
  SHIP_RADIUS_FACTOR: 0.46, // 碰撞半径 = 船长 × 此系数（船间排斥用，防重叠）[PLACEHOLDER]
  HIT_RADIUS_FACTOR: 0.9,   // 炮弹命中半径 = 船碰撞半径 × 此系数（比船身稍小一丢丢：贴边擦弹算未中）[PLACEHOLDER]
  PLAYER_FLEET_X: 1000,   // 玩家领头初始 x（编队向其西方一字排开；留足 7×112 间距不绕回世界）[PLACEHOLDER]
  ENEMY_FLEET_X: 2200,    // 敌领队初始 x（编队向其东方一字排开，与玩家镜像对峙：2200=3200-1000）[PLACEHOLDER]
  FLEET_Y: 360,           // 编队初始 y 中线 [PLACEHOLDER]
  CAMERA_LERP: 0.08,      // 相机跟随旗舰的平滑系数（0=瞬移,1=死跟）[PLACEHOLDER]
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
  // 两坐标差取"环绕最短"分量（d 与 d±size 中最接近 0 的那个），用于接缝处正确感知距离/方向
  wrapDelta: (d, size) => d - Math.round(d / size) * size,
  // 两角度最小差，返回 0..180
  angleDiff: (a, b) => {
    let d = Math.abs(Util.normalizeDeg(a) - Util.normalizeDeg(b)) % 360;
    if (d > 180) d = 360 - d;
    return d;
  },
};
