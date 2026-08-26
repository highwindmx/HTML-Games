// 触屏 UI：左摇杆移动 / 右摇杆瞄准+射击 / 炸蛋·暂停·全屏按钮。
// 全部写入 controls 对象并触发 hooks 回调, 与键鼠输入共用一套游戏逻辑。
const MAXR = 60; // 摇杆半径(px)

export class TouchUI {
  constructor(layer, controls, hooks) {
    this.layer = layer;
    this.c = controls;
    this.hooks = hooks;
    this.moveId = -1; this.aimId = -1;
    this.moveOrigin = { x: 0, y: 0 };
    this.aimOrigin = { x: 0, y: 0 };
    this._build();
    layer.style.display = 'block';
  }

  _joy(baseId, knobId, side) {
    const base = document.createElement('div');
    base.className = 'joy-base ' + side;
    const knob = document.createElement('div');
    knob.className = 'joy-knob';
    base.appendChild(knob);
    this.layer.appendChild(base);
    return { base, knob };
  }

  _build() {
    const mv = this._joy('mv', 'mvk', 'left');
    const am = this._joy('am', 'amk', 'right');
    this.mv = mv; this.am = am;

    // 按钮
    this.btnBomb = this._btn('炸蛋', 't-bomb');
    this.btnPause = this._btn('暂停', 't-pause');
    this.btnFull = this._btn('全屏', 't-full');

    // 事件
    this.layer.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
    this.layer.addEventListener('touchmove', (e) => this._onMove(e), { passive: false });
    this.layer.addEventListener('touchend', (e) => this._onEnd(e), { passive: false });
    this.layer.addEventListener('touchcancel', (e) => this._onEnd(e), { passive: false });

    this.btnBomb.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onBombStart(); }, { passive: false });
    this.btnBomb.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onBombEnd(); });
    this.btnPause.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onPause(); }, { passive: false });
    this.btnFull.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.hooks.onFullscreen(); }, { passive: false });
  }

  _btn(label, cls) {
    const b = document.createElement('div');
    b.className = 't-btn ' + cls;
    b.textContent = label;
    this.layer.appendChild(b);
    return b;
  }

  _pick(ids, x, y) {
    // 找到离 (x,y) 最近且未占用的摇杆
    if (this.moveId < 0) {
      const r = this.mv.base.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) < r.width) return 'move';
    }
    if (this.aimId < 0) {
      const r = this.am.base.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) < r.width) return 'aim';
    }
    return null;
  }

  _onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const kind = this._pick([], t.clientX, t.clientY);
      if (kind === 'move' && this.moveId < 0) {
        this.moveId = t.identifier;
        const r = this.mv.base.getBoundingClientRect();
        this.moveOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        this._setKnob(this.mv, 0, 0);
        this.c.touchMove = true;
      } else if (kind === 'aim' && this.aimId < 0) {
        this.aimId = t.identifier;
        const r = this.am.base.getBoundingClientRect();
        this.aimOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        this._setKnob(this.am, 0, 0);
        this.hooks.onBowStart();
      }
    }
  }

  _onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        let dx = t.clientX - this.moveOrigin.x, dy = t.clientY - this.moveOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > MAXR) { dx *= MAXR / d; dy *= MAXR / d; }
        this._setKnob(this.mv, dx, dy);
        this.c.moveX = dx / MAXR;
        this.c.moveY = -dy / MAXR; // 屏幕 y 向下 = 后退
      } else if (t.identifier === this.aimId) {
        let dx = t.clientX - this.aimOrigin.x, dy = t.clientY - this.aimOrigin.y;
        const d = Math.hypot(dx, dy);
        if (d > MAXR) { dx *= MAXR / d; dy *= MAXR / d; }
        this._setKnob(this.am, dx, dy);
        this.c.touchAim = { x: dx / MAXR, y: dy / MAXR };
      }
    }
  }

  _onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = -1; this.c.touchMove = false;
        this.c.moveX = 0; this.c.moveY = 0;
        this._setKnob(this.mv, 0, 0);
      } else if (t.identifier === this.aimId) {
        this.aimId = -1; this.c.touchAim = null;
        this._setKnob(this.am, 0, 0);
        this.hooks.onBowEnd();
      }
    }
  }

  _setKnob(j, dx, dy) { j.knob.style.transform = `translate(${dx}px, ${dy}px)`; }

  // 全屏切换(点击按钮时调用)
  setFullLabel(on) { this.btnFull.textContent = on ? '退出' : '全屏'; }
}
