// 关卡定义：编队随关卡 1→8 增长，每关引入一个新约束（Pillar 5：每关一张战术试卷）。
// 数值均为 [PLACEHOLDER]，待 playtest 平衡。
//
// 奖励徽章（Pillar 4：街机节奏，硬核勋章）：胜利时据本场战斗统计(stats)对「全部 7 种徽章」
// 逐一评定（不再限定每关固定 3 枚，能拿几枚拿几枚，不设上限）。徽章按难度加权累加成
// rewardPts，每关把 req(门槛) ≤ rewardPts 的升级卡列出供玩家挑选其一——越难的徽章解锁越好的奖励。
// MEDALS 为徽章定义表；BADGE_WEIGHTS 为各徽章难度权重（越难越值钱）；swiftTime 为速战阈值。
// 逆风满帆(windward) 为「全关可拿、按本关时长占比判定」，阈值见 constants.WINDWARD_RATIO。
const MEDALS = {
  flawless: { name: '无伤',   desc: '本关我方零受损' },
  noLoss:   { name: '全员存活', desc: '没有一艘船被击沉' },
  swift:    { name: '速战',   desc: '在限定时间内通关' },
  marksman: { name: '弹无虚发', desc: '炮弹 100% 命中（零脱靶）' },
  windward: { name: '逆风满帆', desc: '本关 80% 以上时间保持满帆顶风航行（船头朝来风仍全速推进）' },
  noRam:    { name: '零撞击',  desc: '本场未触发任何船首冲撞（含主动撞角）' },
  oneSide:  { name: '一舷制胜', desc: '全程仅用单舷开火（另一舷从未发射）' },
};

// 徽章难度权重：越难越值钱，直接决定能解锁多高门槛的奖励卡。
const BADGE_WEIGHTS = {
  flawless: 3,                                   // 最难（无伤）
  windward: 2, noRam: 2, noLoss: 2, marksman: 3, oneSide: 2, // 中等（marksman 提至 3：100% 命中在大编队极难）
  swift: 1,                                      // 最易
};

const Levels = [
  { name: '初航',     playerShips: 1, enemies: [{ hp: 60 }],                                       constraint: '无',    note: '熟悉抢风位与舷侧齐射', swiftTime: 35 },
  { name: '双艇拦截', playerShips: 2, enemies: [{ hp: 60 }, { hp: 60 }],                           constraint: '无',    note: '友军自动跟随与集火', swiftTime: 40 },
  { name: '礁石区',   playerShips: 3, enemies: [{ hp: 70 }, { hp: 70 }],                           constraint: '礁石',  note: '中央礁石阻挡航线，注意走位', swiftTime: 50 },
  { name: '三对三',   playerShips: 3, enemies: [{ hp: 70 }, { hp: 70 }, { hp: 70 }],                constraint: '无',    note: '编队集火一个目标', swiftTime: 55 },
  { name: '逆风行',   playerShips: 4, enemies: [{ hp: 80 }, { hp: 80 }],                           constraint: '强逆风', note: '风力偏弱，抢风位是关键', swiftTime: 55 },
  { name: '援军将至', playerShips: 5, enemies: [{ hp: 80 }, { hp: 80 }, { hp: 80 }],                constraint: '计时',  note: '限时击沉，否则敌援军入场', swiftTime: 45 },
  { name: '舰队对冲', playerShips: 6, enemies: [{ hp: 90 }, { hp: 90 }, { hp: 90 }, { hp: 90 }],    constraint: '无',    note: '大编队混战', swiftTime: 70 },
  { name: '决战',     playerShips: 8, enemies: [{ hp: 100 }, { hp: 100 }, { hp: 100 }, { hp: 100 }, { hp: 100 }], constraint: '无', note: '最终满编对决', swiftTime: 90 },
];
