// 跨场景运行状态：当前关卡、升级 build 累积。经典 script 全局对象。
const RunState = {
  levelIndex: 0,
  build: null,
  medals: {},   // 累计已得徽章（id → true），跨关收藏，体现"硬核勋章"进阶
  ownedCards: [], // 已获奖励卡（{id,name,cat}），用于界面展示当前 build；reset 清空、跨关累积

  _default() {
    return {
      damageMul: 1,      // 火力倍率（舷侧输出，进攻）
      turnMul: 1,        // 转向速率倍率
      reloadMul: 1,      // 装填时间倍率（<1 更快）
      rangeMul: 1,       // 炮程倍率
      speedMul: 1,       // 航速倍率
      hpMul: 1,          // 船体 HP 倍率
      damageTakenMul: 1, // 减伤倍率（<1 更抗打，防御）
    };
  },

  reset() {
    this.levelIndex = 0;
    this.build = this._default();
    this.medals = {};
    this.ownedCards = [];
  },

  applyCard(card) {
    if (!this.build) this.build = this._default();
    card.apply(this.build);
    this.ownedCards.push({ id: card.id, name: card.name, cat: card.cat });
  },
};
