// 按键配置：默认键位 + localStorage 持久化。
// BattleScene 启动时读取并注册；MenuScene / KeyBindScene 负责展示与修改。
const KeyMap = {
  // 可绑定动作（顺序即设置界面展示顺序）
  ACTIONS: ['thrust', 'left', 'right', 'port', 'starboard', 'restart'],
  LABELS: {
    thrust: '帆力（前进）',
    left: '左转',
    right: '右转',
    port: '左舷齐射',
    starboard: '右舷齐射',
    restart: '重新开始',
  },
  DEFAULTS: {
    thrust: ['W'],
    left: ['A'],
    right: ['D'],
    port: ['U'],
    starboard: ['O'],
    restart: ['R'],
  },
  STORAGE_KEY: 'warship.keymap.v1',

  // 读取（损坏或缺失则返回默认值）
  load() {
    try {
      const raw = localStorage.getItem(KeyMap.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const out = {};
        for (const a of KeyMap.ACTIONS) {
          out[a] = (Array.isArray(parsed[a]) && parsed[a].length) ? parsed[a].slice() : KeyMap.DEFAULTS[a].slice();
        }
        return out;
      }
    } catch (e) { /* 损坏则用默认 */ }
    return KeyMap._clone(KeyMap.DEFAULTS);
  },

  save(map) {
    try { localStorage.setItem(KeyMap.STORAGE_KEY, JSON.stringify(map)); } catch (e) {}
  },

  // 恢复默认并清除存储
  reset() {
    try { localStorage.removeItem(KeyMap.STORAGE_KEY); } catch (e) {}
    return KeyMap._clone(KeyMap.DEFAULTS);
  },

  _clone(m) {
    const o = {};
    for (const a of KeyMap.ACTIONS) o[a] = m[a].slice();
    return o;
  },

  // 把原生键盘事件转成 Phaser 可识别的键名（KeyCodes 字符串，如 'A' 'UP' 'SPACE' 'ESC'）
  // 返回 null 表示该键不支持绑定
  nameFromEvent(e) {
    const code = e.code, key = e.key;
    if (!key) return null;
    if (code === 'Space') return 'SPACE';
    if (key === 'ArrowUp') return 'UP';
    if (key === 'ArrowDown') return 'DOWN';
    if (key === 'ArrowLeft') return 'LEFT';
    if (key === 'ArrowRight') return 'RIGHT';
    if (key === 'Escape') return 'ESC';
    if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase();
    if (/^[0-9]$/.test(key)) return key;
    const special = { 'Shift': 'SHIFT', 'Control': 'CTRL', 'Alt': 'ALT', 'Enter': 'ENTER', 'Tab': 'TAB' };
    if (special[key]) return special[key];
    return null;
  },
};
