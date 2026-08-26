// 弓猎 · 纯 HTML5(Three.js) 复刻 —— 全局常量与配色
// 数值尽量对齐 Godot 版（hunt/scripts/Main.gd），便于对照行为。

export const R = 420;                 // 行星半径(放大, 球面感更强)
const SCALE = R / 200;                // 流式/AI 半径随行星同步缩放, 保持视觉密度
export const PLAYER_SPEED = 28;       // 玩家沿球面移动速度 (单位/秒)
export const PLAYER_MAX_HP = 100;

// 弓箭
export const ARROW_BASE_SPEED = 130;  // 轻点(0 蓄力)初速
export const ARROW_MAX_SPEED = 280;   // 满蓄力初速
export const CHARGE_TIME = 0.85;      // 蓄满所需秒数
export const ARROW_LIFE = 2.6;        // 箭存活秒数
export const ARROW_HIT_R = 6;         // 命中判定半径
export const ARROW_START_ARROWS = 20; // 初始/上限箭数

// 炸蛋(炸弹)
export const BOMB_FUSE = 1.05;        // 引信秒数(落地/到期爆炸)
export const BOMB_RADIUS = 30;        // 爆炸伤害半径
export const BOMB_DAMAGE = 4;         // 范围内每敌伤害
export const BOMB_START = 3;          // 初始炸蛋数
export const BOMB_THROW_SPEED = 90;   // 抛出初速

// 敌人(猎物)流式
export const ENEMY_TARGET = 64;       // 围绕玩家常驻数量(地平线更密)
export const ENEMY_NEAR = 22 * SCALE;   // 新生成近界(球面距离)
export const ENEMY_FAR = 155 * SCALE;   // 新生成远界(≈地平线留余量)
export const ENEMY_DESPAWN = 200 * SCALE; // 超距回收(须 > FAR)
export const ENEMY_STREAM_STEP = 24 * SCALE; // 玩家每移动此距补一批
export const ENEMY_HP = [2, 2, 1];    // 熊/鹿/鸟 血量
export const ENEMY_SPEED = [10, 16, 22]; // 熊/鹿/鸟 速度
export const ENEMY_CONTACT_DMG = 8;   // 仅猛兽(熊)接触玩家每秒伤害
export const ENEMY_HIT_R = 7;         // 敌人受击半径
export const ENEMY_KILL_SCORE = [10, 8, 6];

// 敌人 AI 半径(球面距离, 随行星缩放)
export const ENEMY_AGGRO_R = 95 * SCALE;    // 猛兽进入追击玩家的半径
export const ENEMY_FLEE_R = 70 * SCALE;     // 鹿 逃离半径
export const ENEMY_FLEE_R_BIRD = 105 * SCALE; // 鸟 更警觉, 逃离半径更大

// 掉落(击杀后按种类)
//   熊 -> 血; 鹿 -> 箭+5; 鸟 -> 炸蛋
export const DROP_BOMB_RATE = 0.8;    // 鸟掉落炸蛋概率(对齐 Godot baseline)
export const DEER_ARROW_DROP = 5;     // 鹿掉箭数
export const BEAR_HEAL = 25;          // 熊回血

// 树木(障碍)流式
export const TREE_TARGET = 64;
export const TREE_NEAR = 18 * SCALE;
export const TREE_FAR = 160 * SCALE;
export const TREE_DESPAWN = 205 * SCALE;
export const TREE_STREAM_STEP = 22 * SCALE;

// 相机(低俯角跟随, 跟随玩家)
export const CAM_DIST = R * 1.2;
export const CAM_TILT = Math.PI / 8;  // 22.5°(更低, 减少俯视, 球面更显大)

// 徽章(开始菜单可多选, 叠加玩法/难度)
export const BADGES = [
  { id: 'beast', label: '猛兽', desc: '刷新更多熊(高血量高价值)', on: true },
  { id: 'fowl',  label: '飞禽', desc: '刷新更多鸟(灵活掉炸蛋)', on: true },
  { id: 'swift', label: '疾走', desc: '猎物移动更快, 积分加成', on: false },
  { id: 'horde', label: '群猎', desc: '敌人数量 +50%, 难度提升', on: false },
];

// 配色
export const COL = {
  sky: 0x0e1726,
  planet: 0x2e7d32,
  planetEdge: 0x1b5e20,
  player: 0xffd54f,
  arrow: 0xfff3e0,
  bomb: 0xff7043,
  enemyBear: 0x8d6e63,
  enemyDeer: 0xa1887f,
  enemyBird: 0x90caf9,
  tree: 0x33691e,
  treeTrunk: 0x5d4037,
  pickupArrow: 0xfff176,
  pickupHealth: 0xef5350,
  pickupBomb: 0xff7043,
  aim: 0xff5252,
};

export const ENEMY_TYPES = ['bear', 'deer', 'bird'];
