// 关卡定义：编队随关卡 1→8 增长，每关引入一个新约束（Pillar 5：每关一张战术试卷）。
// 数值均为 [PLACEHOLDER]，待 playtest 平衡。
const Levels = [
  { name: '初航',       playerShips: 1, enemies: [{ hp: 60 }],                      constraint: '无',    note: '熟悉抢风位与舷侧齐射' },
  { name: '双艇拦截',   playerShips: 2, enemies: [{ hp: 60 }, { hp: 60 }],          constraint: '无',    note: '友军自动跟随与集火' },
  { name: '礁石区',     playerShips: 3, enemies: [{ hp: 70 }, { hp: 70 }],          constraint: '礁石',  note: '中央礁石阻挡航线，注意走位' },
  { name: '三对三',     playerShips: 3, enemies: [{ hp: 70 }, { hp: 70 }, { hp: 70 }], constraint: '无',  note: '编队集火一个目标' },
  { name: '逆风行',     playerShips: 4, enemies: [{ hp: 80 }, { hp: 80 }],          constraint: '强逆风', note: '风力偏弱，抢风位是关键' },
  { name: '援军将至',   playerShips: 5, enemies: [{ hp: 80 }, { hp: 80 }, { hp: 80 }], constraint: '计时', note: '限时击沉，否则敌援军入场' },
  { name: '舰队对冲',   playerShips: 6, enemies: [{ hp: 90 }, { hp: 90 }, { hp: 90 }, { hp: 90 }], constraint: '无', note: '大编队混战' },
  { name: '决战',       playerShips: 8, enemies: [{ hp: 100 }, { hp: 100 }, { hp: 100 }, { hp: 100 }, { hp: 100 }], constraint: '无', note: '最终满编对决' },
];
