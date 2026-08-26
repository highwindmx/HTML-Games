// 程序化音效：纯 WebAudio 振荡器/噪声合成，无外部音频文件
// （离线 PWA 友好，不增加任何网络请求与体积）。
// 浏览器自动播放策略：AudioContext 必须在用户手势内创建/恢复，
// 这里在「开始游戏」点击与「蓄力」按下时调用 ensure()。

let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      // 预生成 1s 白噪声，供爆炸/受击使用
      const len = Math.floor(ctx.sampleRate * 1);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) {
    return null;
  }
}

// 单个振荡器音：可频率滑音，指数包络
function tone(freq, dur, type, gain, slideTo) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 噪声爆发（爆炸/受击质感）
function noise(dur, gain, cutoff) {
  const c = ensure();
  if (!c || !noiseBuf) return;
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff || 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

export const Sfx = {
  ensure,
  // 弓箭：蓄力越满音调越高、越亮
  shoot(charge = 0.5) {
    tone(520 + charge * 200, 0.14, 'triangle', 0.26, 180);
  },
  // 命中猎物：短促清脆
  hit() {
    tone(900, 0.06, 'square', 0.16, 600);
  },
  // 炸蛋爆炸：低频砰 + 噪声
  boom() {
    noise(0.45, 0.5, 900);
    tone(90, 0.4, 'sine', 0.42, 40);
  },
  // 拾取：上行双音
  pickup() {
    tone(520, 0.08, 'sine', 0.24, 720);
    setTimeout(() => tone(780, 0.1, 'sine', 0.24, 1040), 70);
  },
  // 受伤：低沉方波
  hurt() {
    tone(140, 0.18, 'square', 0.3, 80);
  },
};
