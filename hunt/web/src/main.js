// 弓猎 · 纯 HTML5(Three.js) 复刻 —— 主程序：场景/相机/循环/战斗/敌人流式/状态机
import * as THREE from '../lib/three.module.js';
import {
  R, CAM_DIST, CAM_TILT, COL, ENEMY_TARGET, ENEMY_NEAR, ENEMY_FAR, ENEMY_DESPAWN,
  ENEMY_STREAM_STEP, ENEMY_HP, ENEMY_SPEED, ENEMY_CONTACT_DMG, ENEMY_HIT_R,
  ENEMY_KILL_SCORE, DROP_BOMB_RATE, DEER_ARROW_DROP, BEAR_HEAL, ENEMY_TYPES, BADGES,
} from './config.js';
import { surfPoint, frame, randomNormalAround, surfaceDist, tangetProject } from './sphere.js';
import { Planet, TreeField } from './world.js';
import { Player, Enemy, Arrow, Bomb, Pickup } from './entities.js';
import { Input } from './input.js';
import { TouchUI } from './touchui.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.sky);
    this.scene.fog = new THREE.Fog(COL.sky, R * 1.6, R * 3.2);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1, 3000);
    this.camera.position.set(0, R * 2, R * 2);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(1, 2, 1);
    this.scene.add(sun);
    this._stars();

    new Planet(this.scene);
    this.trees = new TreeField(this.scene);
    this.player = new Player(this.scene);

    this.enemies = [];
    this.arrows = [];
    this.bombs = [];
    this.picks = [];

    this.state = 'menu';       // menu | playing | paused | over
    this.badges = [];
    this.moved = 0;            // 玩家累计位移(触发敌人/树流式)
    this.bowDir = new THREE.Vector3(0, 0, -1);
    this._hurtT = 0;           // 受伤音效节流计时

    this.controls = { moveX: 0, moveY: 0, aimNDC: { x: 0, y: 0 }, touchAim: null, touchMove: false };
    this._initUI();
    this._initInput();

    addEventListener('resize', () => this._onResize());
    this.clock = new THREE.Clock();
    this._loop();
  }

  _stars() {
    const g = new THREE.BufferGeometry();
    const n = 800, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(R * 6 + Math.random() * R * 4);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false })));
  }

  _initUI() {
    this.ui = new UI({
      onStart: (badges) => this.start(badges),
      onResume: () => this.resume(),
      onRestart: () => this.start(this.badges),
      onPause: () => this.togglePause(),
    });
    this.ui.showStart();
  }

  _initInput() {
    const hooks = {
      onBowStart: () => { Sfx.ensure(); if (this.state === 'playing') this.player.beginCharge('bow'); },
      onBowEnd: () => { if (this.state === 'playing') this._fireBow(); },
      onBombStart: () => { Sfx.ensure(); if (this.state === 'playing') this.player.beginCharge('bomb'); },
      onBombEnd: () => { if (this.state === 'playing') this._fireBomb(); },
      onPause: () => this.togglePause(),
      onFullscreen: () => this._toggleFull(),
    };
    this.input = new Input(this.canvas, this.controls, hooks);

    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) {
      const layer = document.getElementById('touch-layer');
      this.touch = new TouchUI(layer, this.controls, hooks);
      layer.style.display = 'block';
      // 触屏时隐藏旋转提示逻辑(这里直接不显示)
    }
  }

  // ---------- 状态切换 ----------
  start(badges) {
    Sfx.ensure(); // 用户手势内恢复音频
    this.badges = badges || [];
    // 重置
    this.enemies.forEach(e => e.remove()); this.enemies = [];
    this.arrows.forEach(a => a.remove()); this.arrows = [];
    this.bombs.forEach(b => b.remove()); this.bombs = [];
    this.picks.forEach(p => p.remove()); this.picks = [];
    this.player.n.set(0, 1, 0);
    this.player.hp = 100; this.player.arrows = 20; this.player.bombs = 3;
    this.player.score = 0; this.player.kills = 0; this.player.time = 0;
    this.player.chargeBow = 0; this.player.chargeBomb = 0;
    this.player.chargingBow = false; this.player.chargingBomb = false;
    this.moved = 0;
    this.player.syncTransform(new THREE.Vector3(0, 0, -1));
    this.trees.seed(this.player.n);
    this._streamEnemies(true);
    const labels = badges.map(id => (BADGES.find(b => b.id === id) || {}).label).filter(Boolean);
    this.ui.setBadges(labels);
    this.ui.hideStart(); this.ui.hidePause(); this.ui.hideOver();
    this.ui.showHUD();
    this.state = 'playing';
    this.ui.toast('开始狩猎！WASD 移动 · 鼠标瞄准 · 蓄力射击', 2200);
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.ui.showPause(); }
    else if (this.state === 'paused') this.resume();
  }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.ui.hidePause(); } }
  gameOver() {
    this.state = 'over';
    this.ui.hideHUD();
    this.ui.showOver(this.player.score, this.player.time);
  }

  _toggleFull() {
    const d = document;
    const el = this.canvas; // 全屏整个文档更稳
    const target = d.documentElement;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const fn = target.requestFullscreen || target.webkitRequestFullscreen;
      if (fn) { try { fn.call(target); } catch (e) {} }
    } else {
      const ex = d.exitFullscreen || d.webkitExitFullscreen;
      if (ex) { try { ex.call(d); } catch (e) {} }
    }
  }

  // ---------- 战斗 ----------
  _fireBow() {
    const c = this.player.releaseCharge('bow');
    if (this.player.arrows <= 0) return;
    this.player.arrows--;
    const m = this.player.muzzle(_v);
    this.arrows.push(new Arrow(this.scene, m, this.bowDir, c));
    Sfx.shoot(c);
  }
  _fireBomb() {
    const c = this.player.releaseCharge('bomb');
    if (this.player.bombs <= 0) return;
    this.player.bombs--;
    const m = this.player.muzzle(_v);
    this.bombs.push(new Bomb(this.scene, m, this.bowDir, c));
  }

  // ---------- 敌人流式 ----------
  _spawnWeights() {
    const w = { bear: 1, deer: 1, bird: 1 };
    if (this.badges.includes('beast')) w.bear *= 2.2;
    if (this.badges.includes('fowl')) w.bird *= 2.2;
    return w;
  }
  _streamEnemies(initial) {
    const target = ENEMY_TARGET * (this.badges.includes('horde') ? 1.5 : 1);
    let guard = 0;
    while (this.enemies.length < target && guard++ < 200) {
      const n = randomNormalAround(this.player.n, ENEMY_NEAR, ENEMY_FAR);
      const w = this._spawnWeights();
      const total = w.bear + w.deer + w.bird;
      let r = Math.random() * total, type = 'deer';
      if ((r -= w.bear) < 0) type = 'bear'; else if ((r -= w.deer) < 0) type = 'deer'; else type = 'bird';
      const ti = ENEMY_TYPES.indexOf(type);
      const spd = ENEMY_SPEED[ti] * (this.badges.includes('swift') ? 1.5 : 1);
      this.enemies.push(new Enemy(this.scene, n, type, ENEMY_HP[ti], spd));
    }
  }

  _killEnemy(e) {
    e.dead = true;
    this.player.kills++;
    let sc = ENEMY_KILL_SCORE[ENEMY_TYPES.indexOf(e.type)];
    if (this.badges.includes('swift')) sc = Math.round(sc * 1.5);
    this.player.score += sc;
    // 掉落
    if (e.type === 'bear') this.picks.push(new Pickup(this.scene, e.n, 'health'));
    else if (e.type === 'deer') this.picks.push(new Pickup(this.scene, e.n, 'arrow'));
    else if (Math.random() < DROP_BOMB_RATE) this.picks.push(new Pickup(this.scene, e.n, 'bomb'));
  }

  // ---------- 主循环 ----------
  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this._update(dt);
    this._followCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const p = this.player;
    p.time += dt;
    if (this._hurtT > 0) this._hurtT -= dt;
    p.tickCharge(dt);

    // 输入 → 世界切向移动方向
    this.input.sampleKeyboard();
    const { east, north } = frame(p.n);
    const dir = _v2.copy(east).multiplyScalar(this.controls.moveX)
      .addScaledVector(north, -this.controls.moveY);
    if (dir.lengthSq() > 1e-4) {
      const moved = p.move(dir, dt, 28);
      this.moved += moved || 0;
    }

    // 瞄准方向
    this._computeAim(east, north);

    // 敌人流式 + AI
    if (this.moved > ENEMY_STREAM_STEP) { this.moved = 0; this._streamEnemies(false); }
    const pPos = p.pos(_v);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) { e.remove(); this.enemies.splice(i, 1); continue; }
      const d = surfaceDist(e.pos(_v2), pPos);
      if (d > ENEMY_DESPAWN) { e.remove(); this.enemies.splice(i, 1); continue; }
      e.update(dt, p.n, pPos);
      // 仅猛兽(熊)接触玩家造成伤害；猎物逃离、不撞人
      if (d < 9 && e.type === 'bear') {
        p.hp -= ENEMY_CONTACT_DMG * dt;
        if (this._hurtT <= 0) { Sfx.hurt(); this._hurtT = 0.4; }
      }
    }

    // 箭
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.update(dt);
      if (a.dead) { a.remove(); this.arrows.splice(i, 1); continue; }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (a.pos.distanceTo(e.pos(_v2)) < ENEMY_HIT_R + 4) {
          e.hp -= a.dmg;
          a.dead = true;
          Sfx.hit();
          if (e.hp <= 0) this._killEnemy(e);
          break;
        }
      }
    }

    // 炸蛋
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.update(dt);
      if (b.exploded) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (b.pos.distanceTo(e.pos(_v2)) < 30) {
            e.hp -= 4;
            if (e.hp <= 0) this._killEnemy(e);
          }
        }
        Sfx.boom();
        this._boom(b.pos);
        b.remove(); this.bombs.splice(i, 1);
      }
    }

    // 掉落拾取
    for (let i = this.picks.length - 1; i >= 0; i--) {
      const pk = this.picks[i];
      pk.update(dt);
      if (surfaceDist(pk.pos(_v2), pPos) < 11) {
        Sfx.pickup();
        if (pk.kind === 'arrow') { p.arrows = Math.min(20, p.arrows + DEER_ARROW_DROP); this.ui.toast('获得箭 +' + DEER_ARROW_DROP); }
        else if (pk.kind === 'health') { p.hp = Math.min(100, p.hp + BEAR_HEAL); this.ui.toast('恢复体力 +' + BEAR_HEAL); }
        else if (pk.kind === 'bomb') { p.bombs++; this.ui.toast('获得炸蛋 +1'); }
        pk.remove(); this.picks.splice(i, 1);
      }
    }

    // 树木流式
    this.trees.update(p.n, pPos);

    // HUD
    this.ui.updateHUD(p);

    if (p.hp <= 0) this.gameOver();
  }

  _computeAim(east, north) {
    if (this.controls.touchAim) {
      const { x, y } = this.controls.touchAim;
      const v = _v2.copy(east).multiplyScalar(x).addScaledVector(north, y);
      if (v.lengthSq() > 1e-6) this.bowDir.copy(v).normalize();
    } else {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(this.controls.aimNDC.x, this.controls.aimNDC.y), this.camera);
      const hit = rc.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(0, 0, 0), R), _v2);
      const aimPt = hit ? _v2.clone() : rc.ray.origin.clone().addScaledVector(rc.ray.direction, 600);
      const dir = aimPt.sub(this.player.muzzle(_v));
      if (dir.lengthSq() > 1e-6) this.bowDir.copy(dir).normalize();
    }
    this.player.aimDir.copy(this.bowDir);
    this.player.syncTransform(this.bowDir);
  }

  _boom(pos) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 12),
      new THREE.MeshBasicMaterial({ color: COL.bomb, transparent: true, opacity: 0.7 })
    );
    m.position.copy(pos);
    this.scene.add(m);
    const t0 = performance.now();
    const anim = () => {
      const k = (performance.now() - t0) / 350;
      m.scale.setScalar(1 + k * 14);
      m.material.opacity = Math.max(0, 0.7 * (1 - k));
      if (k < 1) requestAnimationFrame(anim); else { this.scene.remove(m); m.geometry.dispose(); }
    };
    anim();
  }

  _followCamera(dt) {
    const p = this.player;
    const pPos = p.pos(_v);
    const { east, north } = frame(p.n);
    const h = CAM_DIST * Math.sin(CAM_TILT);
    const back = CAM_DIST * Math.cos(CAM_TILT);
    const want = pPos.clone().addScaledVector(p.n, h).addScaledVector(north, back);
    // 关键：相机 up 跟随玩家所在球面法线，否则球面移动会产生滚转抖动
    if (!this._camUp) this._camUp = p.n.clone();
    this._camUp.lerp(p.n, Math.min(1, dt * 8)).normalize();
    this.camera.up.copy(this._camUp);
    this.camera.position.lerp(want, Math.min(1, dt * 6));
    // 平滑注视点，避免逐帧微抖
    if (!this._camLook) this._camLook = pPos.clone();
    this._camLook.lerp(pPos, Math.min(1, dt * 10));
    this.camera.lookAt(this._camLook);
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

// 启动
const game = new Game();
// PWA
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
