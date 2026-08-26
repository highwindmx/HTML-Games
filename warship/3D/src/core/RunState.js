// 跨场景运行状态：当前关卡、升级 build 累积。经典 script 全局对象。
const RunState = {
  levelIndex: 0,
  build: null,

  _default() {
    return {
      damageMul: 1,      // 舷侧伤害倍率
      turnMul: 1,        // 转向速率倍率
      reloadMul: 1,      // 装填时间倍率（<1 更快）
      rangeMul: 1,       // 炮程倍率
      speedMul: 1,       // 航速倍率
      hpMul: 1,          // 船体 HP 倍率
      damageTakenMul: 1, // 受击伤害倍率（<1 更抗打）
    };
  },

  reset() {
    this.levelIndex = 0;
    this.build = this._default();
  },

  applyCard(card) {
    if (!this.build) this.build = this._default();
    card.apply(this.build);
  },
};
