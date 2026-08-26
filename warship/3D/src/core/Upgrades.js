// 升级卡池（roguelike draft，三选一）。铁律：纯加攻不加代价的卡不进池，
// 每张必有副作用或互斥，逼出不同 build（玻璃大炮 / 乌龟 / 风师）。[PLACEHOLDER]
const Upgrades = {
  POOL: [
    // —— 进攻 ——
    { id: 'dmg',    name: '重弹',     cat: '进攻', desc: '+25% 舷侧伤害',                 apply: (b) => { b.damageMul *= 1.25; } },
    { id: 'reload', name: '熟练炮组', cat: '进攻', desc: '-20% 装填时间',                apply: (b) => { b.reloadMul *= 0.8; } },
    { id: 'double', name: '双舷齐射', cat: '进攻', desc: '+15% 伤害，转向 -15%',          apply: (b) => { b.damageMul *= 1.15; b.turnMul *= 0.85; } },
    // —— 机动 ——
    { id: 'turn',   name: '灵舵',     cat: '机动', desc: '+20% 转向速率',                apply: (b) => { b.turnMul *= 1.2; } },
    { id: 'speed',  name: '快帆',     cat: '机动', desc: '+15% 航速，-10% HP',           apply: (b) => { b.speedMul *= 1.15; b.hpMul *= 0.9; } },
    { id: 'upwind', name: '逆风帆',   cat: '机动', desc: '+12% 航速（逆风更明显）',      apply: (b) => { b.speedMul *= 1.12; } },
    // —— 生存 ——
    { id: 'hp',     name: '加固船体', cat: '生存', desc: '+30% HP',                      apply: (b) => { b.hpMul *= 1.3; } },
    { id: 'armor',  name: '跳弹装甲', cat: '生存', desc: '-15% 受击伤害',                apply: (b) => { b.damageTakenMul *= 0.85; } },
    { id: 'turtle', name: '重甲',     cat: '生存', desc: '+25% HP，-12% 航速',           apply: (b) => { b.hpMul *= 1.25; b.speedMul *= 0.88; } },
  ],

  // 随机抽取 n 张不重复卡
  draw(n = 3) {
    const pool = this.POOL.slice();
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  },
};
