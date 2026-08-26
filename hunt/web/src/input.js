// 输入：键盘 + 鼠标。触屏在 touchui.js。
// 两者都写入同一个 controls 对象, 并通过 hooks 回调触发蓄力开始/结束。
import * as THREE from '../lib/three.module.js';

export class Input {
  constructor(domEl, controls, hooks) {
    this.dom = domEl;
    this.c = controls;        // { moveX, moveY, aimNDC:{x,y}, touchAim:null|{x,y} }
    this.hooks = hooks;        // { onBowStart, onBowEnd, onBombStart, onBombEnd, onPause }
    this.keys = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'escape') this.hooks.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    domEl.addEventListener('contextmenu', (e) => e.preventDefault());
    domEl.addEventListener('mousemove', (e) => this._aim(e));
    domEl.addEventListener('mousedown', (e) => {
      this._aim(e);
      if (e.button === 0) this.hooks.onBowStart();
      else if (e.button === 2) this.hooks.onBombStart();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.hooks.onBowEnd();
      else if (e.button === 2) this.hooks.onBombEnd();
    });
  }

  _aim(e) {
    const r = this.dom.getBoundingClientRect();
    this.c.aimNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.c.aimNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  // 每帧从键盘刷新移动轴(触屏会在 touchui 里覆盖)
  sampleKeyboard() {
    // 仅在没有触屏摇杆输入时由键盘驱动
    if (this.c.touchMove) return;
    let y = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
    let x = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    this.c.moveX = x; this.c.moveY = y;
  }
}
