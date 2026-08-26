// 升级卡池（roguelike draft）。体系化重构：四类（进攻/机动/生存/保障）各 3 张，按「代价哲学」分档。
// 保障=装填+受击减伤打包成一组，每档同给两增益（10%/15% 步进），low/net 罚航速。
//
// 幅度只有两级（全要素统一：火力(进攻)/航速/HP/转向/装填/减伤(防御) 皆同此）：
//   · 低级 = +10%    · 高级 = +15%
// 代价三档（与幅度组合，构成 3 张/类）：
//   · 全有利（高级·最难解锁 req5）= 单方面 +15% 某要素，无代价   → 干净奖励，越难徽章解锁越好
//   · 利大于弊（中级 req3）      = +15% 某要素，-10% 另一要素
//   · 有利有弊（低级·最易 req0）  = +10% 某要素，-10% 另一要素
// 代价铁律守底线：除 req5「全有利」纯奖励外，其余卡必带 -10% 副作用；纯奖励门槛最高且每关只挑 1 张，
// 杜绝免费堆叠数值通胀。 [PLACEHOLDER：幅度/req 待 playtest]
//
// req = 解锁门槛（徽章加权值）。rewardPts ≥ req 的卡才列出；越难的徽章解锁越高档奖励。
// 解锁节奏（四类同门槛，整齐）：0→轻系 4 张(各有利有弊)，2→重系 4 张(各利大于弊)，5→巨系 4 张(各全有利)；
// 同组多档同屏时仅显最高档，故任意 rewardPts 下 draft 恒为每类最优 1 张、共 4 张。
const Upgrades = {
  POOL: [
    // —— 进攻（核心:火力；tradeoff 罚:转向）——
    { id: 'g_low',  name: '轻炮', cat: '进攻', req: 0, desc: '+10% 火力，-10% 转向',        apply: (b) => { b.damageMul *= 1.10; b.turnMul *= 0.90; } },
    { id: 'g_net',  name: '重炮', cat: '进攻', req: 2, desc: '+15% 火力，-10% 转向',        apply: (b) => { b.damageMul *= 1.15; b.turnMul *= 0.90; } },
    { id: 'g_pure', name: '巨炮', cat: '进攻', req: 5, desc: '+15% 火力',          apply: (b) => { b.damageMul *= 1.15; } },
    // —— 机动（核心:航速；tradeoff 罚:HP）——
    { id: 'm_low',  name: '轻帆', cat: '机动', req: 0, desc: '+10% 航速，-10% HP',          apply: (b) => { b.speedMul *= 1.10; b.hpMul *= 0.90; } },
    { id: 'm_net',  name: '重帆', cat: '机动', req: 2, desc: '+15% 航速，-10% HP',          apply: (b) => { b.speedMul *= 1.15; b.hpMul *= 0.90; } },
    { id: 'm_pure', name: '巨帆', cat: '机动', req: 5, desc: '+15% 航速',          apply: (b) => { b.speedMul *= 1.15; } },
    // —— 生存（核心:HP；tradeoff 罚:火力）——
    { id: 's_low',  name: '轻甲', cat: '生存', req: 0, desc: '+10% HP，-10% 火力',           apply: (b) => { b.hpMul *= 1.10; b.damageMul *= 0.90; } },
    { id: 's_net',  name: '重甲', cat: '生存', req: 2, desc: '+15% HP，-10% 火力',           apply: (b) => { b.hpMul *= 1.15; b.damageMul *= 0.90; } },
    { id: 's_pure', name: '巨甲', cat: '生存', req: 5, desc: '+15% HP',            apply: (b) => { b.hpMul *= 1.15; } },
    // —— 保障（核心:装填+受击减伤打包；tradeoff 罚:航速）——
    { id: 'b_low',  name: '轻备', cat: '保障', req: 0, desc: '+10% 装填，+10% 减伤，-10% 航速',        apply: (b) => { b.reloadMul *= 0.90; b.damageTakenMul *= 0.90; b.speedMul *= 0.90; } },
    { id: 'b_net',  name: '重备', cat: '保障', req: 2, desc: '+15% 装填，+15% 减伤，-10% 航速',        apply: (b) => { b.reloadMul *= 0.85; b.damageTakenMul *= 0.85; b.speedMul *= 0.90; } },
    { id: 'b_pure', name: '巨备', cat: '保障', req: 5, desc: '+15% 装填，+15% 减伤',          apply: (b) => { b.reloadMul *= 0.85; b.damageTakenMul *= 0.85; } },
  ],

  // 全部卡
  all() { return this.POOL.slice(); },

  // 据本关 rewardPts 解锁：同一类只展示当前已解锁的最高档（req 最大的）卡，
  // 形成「每类最优」的 4 张 draft（轻→重→巨 随 rewardPts 升档），避免同组多档同屏堆砌。
  unlocked(rewardPts) {
    const best = {};
    for (const c of this.POOL) {
      if ((c.req || 0) <= rewardPts) {
        const cur = best[c.cat];
        if (!cur || (c.req || 0) > (cur.req || 0)) best[c.cat] = c;
      }
    }
    return Object.values(best).sort((a, b) => a.cat.localeCompare(b.cat));
  },

  // 随机抽取 n 张不重复卡（保留作兜底/调试用）
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
