// 拼接 + Phaser 桩冒烟测试：驱动 25D BattleScene 跑通 炮门辉光 + 炮迹弧
const fs = require('fs');
const vm = require('vm');

// —— 通用 proxy（任意属性/方法都返回自身，可被调用/赋值）——
function makeProxy() {
  const target = function () {};
  const p = new Proxy(target, {
    get(t, k) {
      if (k === 'then') return undefined;       // 避免被当作 thenable
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'displayWidth' || k === 'displayHeight') return 0;
      if (k === 'x' || k === 'y' || k === 'width' || k === 'height' || k === 'scrollX' || k === 'scrollY') return 0;
      if (k === 'visible') return true;
      return makeProxy();
    },
    set() { return true; },
    apply() { return makeProxy(); },
  });
  return p;
}

// —— graphics 桩（需支持具体数值运算的方法）——
function makeGraphics() {
  const obj = {
    _ops: 0,
    clear() { return obj; },
    fillStyle() { return obj; }, lineStyle() { return obj; },
    fillRect() { obj._ops++; return obj; }, strokeRect() { return obj; },
    fillCircle(x, y, r) { obj._ops++; return obj; }, strokeCircle() { return obj; },
    fillTriangle() { return obj; }, fillPath() { return obj; }, strokePath() { return obj; },
    beginPath() { return obj; }, moveTo() { return obj; }, lineTo() { return obj; },
    closePath() { return obj; }, arc() { return obj; },
    lineBetween(x1, y1, x2, y2) { obj._ops++; return obj; },
    setDepth() { return obj; }, setPosition() { return obj; }, setScale() { return obj; },
    setRotation() { return obj; }, setVisible() { return obj; }, setAlpha() { return obj; },
    setOrigin() { return obj; }, setStrokeStyle() { return obj; }, setScrollFactor() { return obj; },
    setInteractive() { return obj; }, setText() { return obj; }, setColor() { return obj; },
    setDisplaySize() { return obj; }, on() { return obj; }, destroy() { return obj; },
    add() { return obj; },
  };
  return obj;
}

function makeContainer() {
  const c = {
    x: 0, y: 0, rotation: 0, visible: true,
    setDepth() { return c; }, setPosition(x, y) { c.x = x; c.y = y; return c; },
    setScale() { return c; }, setRotation(r) { c.rotation = r; return c; },
    setVisible(v) { c.visible = v; return c; }, add() { return c; },
  };
  return c;
}

function makeSceneStub() {
  const cam = { scrollX: 0, scrollY: 0, width: 960, height: 600, startFollow() {} };
  const stub = {
    add: {
      graphics: () => makeGraphics(),
      container: () => makeContainer(),
      ellipse: () => makeContainer(),
      rectangle: () => makeContainer(),
      text: () => makeContainer(),
    },
    cameras: { main: cam },
    input: { keyboard: { addKey: () => ({ isDown: false }) } },
    time: { delayedCall: () => {} },
    tweens: { add: () => {} },
    children: { list: [] },
    scene: { restart() {}, start() {} },
  };
  return stub;
}

// —— Phaser 全局桩 ——
const Phaser = {
  Scene: class { constructor(k) { this.key = k; } },
  Math: { Between: (a, b) => a },
  Input: { Keyboard: { JustDown: () => false } },
};

// —— 收集 25D 源文件（排除 main.js 与各 Scene 入口，只取被 BattleScene 依赖的模块）——
const order = [
  'config/constants.js', 'config/levels.js',
  'core/Util.js', 'core/Combat.js', 'core/FleetAI.js', 'core/KeyMap.js',
  'core/RunState.js', 'core/Upgrades.js', 'core/Wind.js',
  'entities/Projectile.js', 'entities/Ship.js',
  'render/ShipSprite.js', 'ui/HUD.js',
  'scenes/BattleScene.js',
];
let src = '';
for (const f of order) {
  const p = '25D/src/' + f;
  if (fs.existsSync(p)) src += '\n;//== ' + f + '\n' + fs.readFileSync(p, 'utf8');
}

const ctx = {
  Phaser, Util: null, C: null, Wind: null, Levels: null, RunState: null,
  Ship: null, ShipSprite: null, FleetAI: null, Combat: null, KeyMap: null,
  HUD: null, Projectile: null, console, Math, Symbol,
};
ctx.global = ctx;
vm.createContext(ctx);

// 提供 makeSceneStub 供 BattleScene 内部 this.add 使用
src += '\n;globalThis.__makeSceneStub = ' + makeSceneStub.toString() + ';';
vm.runInContext(src, ctx);
const mod = ctx;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }

// 实例化 + 注入桩
const C = mod.C;
const scene = mod.__makeSceneStub();
const bs = new mod.BattleScene();
bs.init({ levelIndex: 6 });
bs.create();
ok('create 无异常 + 旗舰存在', !!bs.flagship && bs.flagship.hp > 0);
ok('炮门辉光层已建', !!bs.flagship.gunGlowG);
ok('炮迹弧层已建', !!bs._arcG);

// 跑若干帧（update 内含 _drawGunPorts 与 _drawFireArcs）
for (let i = 0; i < 30; i++) bs.update(2000 + i * 16, 16);
ok('30 帧 update 无异常', true);

// 强制旗舰左舷已装填 + 把一艘敌舰放到左舷射界内射程内 → 应画出炮迹弧（_arcG 有 ops）
bs.flagship.portReload = 0;
bs.flagship.starboardReload = 3.5;
// 旗舰在 x=PLAYER_FLEET_X, heading=0，port=heading-90 -> 指向 -y 方向
const fs = bs.flagship;
const range = C.CANNON_RANGE * (fs.rangeMul || 1);
const e = bs.enemies[0];
e.x = fs.x; e.y = fs.y - range * 0.6;   // 正下方（-y）= port 射界
e.hp = 100;
bs._arcG._ops = 0;
bs._drawFireArcs();
ok('旗舰左舷已装填+敌在port射界内 → 炮迹弧被绘制', bs._arcG._ops > 0);

// 敌移出射界（放到 +y，即 starboard 方向）→ port 侧不应有弧
e.y = fs.y + range * 0.6;
bs._arcG._ops = 0;
bs._drawFireArcs();
ok('敌在starboard侧、port无弧', bs._arcG._ops === 0);

// 旗舰两舷都装填中 → 不应有弧
fs.portReload = 2; fs.starboardReload = 2;
bs._arcG._ops = 0;
bs._drawFireArcs();
ok('两舷装填中 → 无炮迹弧', bs._arcG._ops === 0);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
