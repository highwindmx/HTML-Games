// 实体：玩家 / 敌人(猎物) / 箭 / 炸蛋 / 掉落物
// 实体只管自身网格与运动; 碰撞与生成由 main.js 编排。
import * as THREE from '../lib/three.module.js';
import {
  R, COL, PLAYER_MAX_HP, ARROW_START_ARROWS, BOMB_START,
  ARROW_BASE_SPEED, ARROW_MAX_SPEED, ARROW_LIFE, BOMB_FUSE, BOMB_THROW_SPEED,
  ENEMY_AGGRO_R, ENEMY_FLEE_R, ENEMY_FLEE_R_BIRD,
} from './config.js';
import { surfPoint, frame, orientToSurface, moveNormal, tangetProject, surfaceDist } from './sphere.js';

const _tmp = new THREE.Vector3();

// ---------------- 玩家 ----------------
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.n = new THREE.Vector3(0, 1, 0); // 初始在北极
    this.hp = PLAYER_MAX_HP;
    this.arrows = ARROW_START_ARROWS;
    this.bombs = BOMB_START;
    this.score = 0;
    this.kills = 0;
    this.time = 0;
    this.chargeBow = 0;     // 0..1
    this.chargeBomb = 0;
    this.chargingBow = false;
    this.chargingBomb = false;
    this.aimDir = new THREE.Vector3(0, 0, -1); // 世界方向(切向)

    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(2.4, 5, 4, 8),
      new THREE.MeshStandardMaterial({ color: COL.player, roughness: 0.6, emissive: 0x332200 })
    );
    body.position.y = 4;
    // 前向指示(弓朝向)
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 5, 5);
    g.add(body); g.add(nose);
    this.mesh = g;
    g.scale.setScalar(1.6); // 大行星上更显眼
    scene.add(g);
    this.syncTransform(new THREE.Vector3(0, 0, -1));
  }

  pos(out) { return surfPoint(this.n, out); }

  syncTransform(desiredFwd) {
    const p = surfPoint(this.n, _tmp);
    this.mesh.position.copy(p);
    orientToSurface(this.mesh, this.n, desiredFwd);
  }

  // moveDir: 世界切向向量(已投影); dt 秒
  move(moveDir, dt, speed) {
    if (moveDir.lengthSq() < 1e-6) return;
    const before = this.n.clone();
    this.n = moveNormal(this.n, moveDir, speed * dt);
    this.syncTransform(moveDir);
    return surfaceMoved(before, this.n);
  }

  muzzle(out) {
    out = out || new THREE.Vector3();
    return surfPoint(this.n, out).addScaledVector(this.n, 8).addScaledVector(this.aimDir, 4);
  }

  beginCharge(kind) {
    if (kind === 'bow') { if (this.arrows > 0) this.chargingBow = true; }
    else { if (this.bombs > 0) this.chargingBomb = true; }
  }
  releaseCharge(kind) {
    if (kind === 'bow') { const c = this.chargeBow; this.chargingBow = false; this.chargeBow = 0; return c; }
    else { const c = this.chargeBomb; this.chargingBomb = false; this.chargeBomb = 0; return c; }
  }
  tickCharge(dt) {
    if (this.chargingBow) this.chargeBow = Math.min(1, this.chargeBow + dt / 0.85);
    if (this.chargingBomb) this.chargeBomb = Math.min(1, this.chargeBomb + dt / 0.85);
  }
}

function surfaceMoved(a, b) { return a.angleTo(b) * R; }

// ---------------- 敌人 ----------------
// 设计：熊=猛兽(捕食者)，玩家进入 AGGRO_R 才追击；鹿/鸟=猎物，玩家进入
// FLEE_R 才逃离，否则在球面游荡。猎物不主动撞人、不造成接触伤害（撞人掉血
// 只在 main.js 对熊生效）。这样形成"追猎物、躲猛兽"的狩猎手感，而非全员自杀式冲锋。
export class Enemy {
  constructor(scene, n, type, hp, speed) {
    this.scene = scene;
    this.n = n.clone();
    this.type = type;
    this.hp = hp;
    this.speed = speed;
    this.dead = false;
    this.isPredator = (type === 'bear');
    const color = type === 'bear' ? COL.enemyBear : type === 'deer' ? COL.enemyDeer : COL.enemyBird;
    const geo = type === 'bird'
      ? new THREE.SphereGeometry(3, 10, 8)
      : new THREE.CapsuleGeometry(2.2, 4, 4, 8);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    this.mesh.scale.setScalar(1.4); // 大行星上更显眼
    scene.add(this.mesh);
    // 游荡状态
    const { east, north } = frame(this.n);
    const a = Math.random() * Math.PI * 2;
    this.wander = east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
    this.wanderT = 1 + Math.random() * 2;
    this.sync(this.wander);
  }
  pos(out) { return surfPoint(this.n, out); }
  sync(forward) {
    const p = surfPoint(this.n, _tmp);
    this.mesh.position.copy(p);
    orientToSurface(this.mesh, this.n, forward || frame(this.n).north);
  }
  // dt 秒; playerN/playerPos 为玩家球面法线与世界坐标
  update(dt, playerN, playerPos) {
    const ePos = this.pos(_tmp);
    const d = surfaceDist(ePos, playerPos);
    let dir;
    if (this.isPredator) {
      if (d < ENEMY_AGGRO_R) dir = tangetProject(playerN.clone().sub(this.n), this.n); // 追玩家
      else dir = this._wander(dt);
    } else {
      const fleeR = this.type === 'bird' ? ENEMY_FLEE_R_BIRD : ENEMY_FLEE_R;
      if (d < fleeR) dir = tangetProject(this.n.clone().sub(playerN), this.n); // 逃离玩家
      else dir = this._wander(dt);
    }
    if (dir.lengthSq() > 1e-6) {
      this.n = moveNormal(this.n, dir, this.speed * dt);
      this.sync(dir);
    } else this.sync(this.wander);
  }
  _wander(dt) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 1.5 + Math.random() * 2;
      const { east, north } = frame(this.n);
      const a = Math.random() * Math.PI * 2;
      this.wander.copy(east).multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
    }
    return this.wander;
  }
  remove() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// ---------------- 箭 ----------------
export class Arrow {
  constructor(scene, pos, dir, charge) {
    this.scene = scene;
    this.pos = pos.clone();
    const spd = ARROW_BASE_SPEED + (ARROW_MAX_SPEED - ARROW_BASE_SPEED) * charge;
    this.vel = dir.clone().normalize().multiplyScalar(spd);
    this.life = ARROW_LIFE;
    this.dmg = 1 + Math.floor(charge * 2); // 蓄力越高伤害越大(1..3)
    this.dead = false;
    this.mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 6, 6),
      new THREE.MeshStandardMaterial({ color: COL.arrow, emissive: 0x554433 })
    );
    scene.add(this.mesh);
    this.mesh.position.copy(this.pos);
  }
  update(dt) {
    // 轻微向行星中心弯曲, 形成弧线
    const g = this.pos.clone().normalize().multiplyScalar(-40 * dt);
    this.vel.add(g);
    this.pos.addScaledVector(this.vel, dt);
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    // 撞地消失
    if (this.pos.length() < R + 1) this.dead = true;
    this.mesh.position.copy(this.pos);
    if (this.vel.lengthSq() > 1e-3) {
      this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.vel.clone().normalize());
    }
  }
  remove() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// ---------------- 炸蛋 ----------------
export class Bomb {
  constructor(scene, pos, dir, charge) {
    this.scene = scene;
    this.pos = pos.clone();
    const spd = BOMB_THROW_SPEED * (0.6 + 0.4 * charge);
    this.vel = dir.clone().normalize().multiplyScalar(spd).addScaledVector(pos.clone().normalize(), 30);
    this.fuse = BOMB_FUSE + 0.4 * charge;
    this.dead = false;
    this.exploded = false;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: COL.bomb, emissive: 0x551100 })
    );
    scene.add(this.mesh);
    this.mesh.position.copy(this.pos);
  }
  update(dt) {
    const g = this.pos.clone().normalize().multiplyScalar(-55 * dt);
    this.vel.add(g);
    this.pos.addScaledVector(this.vel, dt);
    this.fuse -= dt;
    if (this.fuse <= 0 || this.pos.length() < R + 2) this.exploded = true;
    this.mesh.position.copy(this.pos);
  }
  remove() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// ---------------- 掉落物 ----------------
export class Pickup {
  constructor(scene, n, kind) {
    this.scene = scene;
    this.n = n.clone();
    this.kind = kind; // 'arrow' | 'health' | 'bomb'
    const color = kind === 'arrow' ? COL.pickupArrow : kind === 'health' ? COL.pickupHealth : COL.pickupBomb;
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.6, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
    );
    scene.add(this.mesh);
    this.sync();
    this.t = 0;
  }
  pos(out) { return surfPoint(this.n, out); }
  sync() { this.mesh.position.copy(surfPoint(this.n, _tmp)).addScaledVector(this.n, 4); }
  update(dt) { this.t += dt; this.mesh.rotation.y += dt * 2; this.mesh.position.addScaledVector(this.n, Math.sin(this.t * 3) * 0.05); }
  remove() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
