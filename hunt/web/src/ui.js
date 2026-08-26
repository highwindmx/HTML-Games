// UI：开始菜单(徽章多选) / HUD / 暂停菜单 / 提示 toast。
// 直接操作 index.html 中的 DOM 覆盖层。
import { BADGES } from './config.js';

export class UI {
  constructor(hooks) {
    this.hooks = hooks; // { onStart(badges), onResume(), onRestart(), onPause() }
    this.sel = BADGES.map(b => b.on);
    this._buildBadges();
    this._wire();
  }

  el(id) { return document.getElementById(id); }

  _buildBadges() {
    const wrap = this.el('badges');
    wrap.innerHTML = '';
    BADGES.forEach((b, i) => {
      const d = document.createElement('div');
      d.className = 'badge' + (this.sel[i] ? ' on' : '');
      d.innerHTML = `<div class="b-label">${b.label}</div><div class="b-desc">${b.desc}</div>`;
      d.addEventListener('click', () => {
        this.sel[i] = !this.sel[i];
        d.classList.toggle('on', this.sel[i]);
      });
      wrap.appendChild(d);
    });
  }

  _wire() {
    this.el('start-btn').addEventListener('click', () => {
      const chosen = BADGES.filter((_, i) => this.sel[i]).map(b => b.id);
      this.hooks.onStart(chosen);
    });
    this.el('pause-resume').addEventListener('click', () => this.hooks.onResume());
    this.el('pause-restart').addEventListener('click', () => this.hooks.onRestart());
    this.el('over-restart').addEventListener('click', () => this.hooks.onRestart());
  }

  showStart() { this.el('start-menu').style.display = 'flex'; }
  hideStart() { this.el('start-menu').style.display = 'none'; }
  showHUD() { this.el('hud').style.display = 'flex'; }
  hideHUD() { this.el('hud').style.display = 'none'; }
  // 开始游戏时把激活的徽章展示到 HUD，让难度选择可见
  setBadges(labels) {
    const t = (labels && labels.length) ? '徽章：' + labels.join(' · ') : '徽章：无';
    this.el('hud-badges').textContent = t;
  }
  showPause() { this.el('pause-menu').style.display = 'flex'; }
  hidePause() { this.el('pause-menu').style.display = 'none'; }
  showOver(score, time) {
    this.el('over-menu').style.display = 'flex';
    this.el('over-score').textContent = `积分 ${score} · 存活 ${time.toFixed(0)}s`;
  }
  hideOver() { this.el('over-menu').style.display = 'none'; }

  updateHUD(p) {
    this.el('hud-arrows').textContent = `箭 ${p.arrows}/${20}`;
    this.el('hud-score').textContent = `积分 ${p.score}`;
    this.el('hud-bomb').textContent = `炸蛋 ${p.bombs}`;
    this.el('hud-time').textContent = `时间 ${p.time.toFixed(0)}s`;
    const eff = p.time > 0 ? (p.score / p.time).toFixed(1) : '0.0';
    this.el('hud-eff').textContent = `效率 ${eff}`;
    this.el('hud-hp').style.width = Math.max(0, p.hp) + '%';
  }

  toast(msg, ms = 1500) {
    const t = this.el('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.style.opacity = '0'; }, ms);
  }
}
