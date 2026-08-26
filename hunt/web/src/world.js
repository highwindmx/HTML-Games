// 世界：行星 + 环绕玩家的流式树木(对象池, 不进/出回收)
import * as THREE from '../lib/three.module.js';
import { R, COL, TREE_TARGET, TREE_NEAR, TREE_FAR, TREE_DESPAWN, TREE_STREAM_STEP } from './config.js';
import { surfPoint, frame, randomNormalAround, orientToSurface, surfaceDist } from './sphere.js';

export class Planet {
  constructor(scene) {
    const geo = new THREE.SphereGeometry(R, 64, 48);
    const mat = new THREE.MeshStandardMaterial({ color: COL.planet, roughness: 1, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    scene.add(this.mesh);
    // 赤道一圈淡色描边, 增强"球面感"
    const ringGeo = new THREE.TorusGeometry(R * 1.001, 0.6, 8, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: COL.planetEdge });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  }
}

export class TreeField {
  constructor(scene) {
    this.scene = scene;
    this.trees = [];      // { mesh, n }
    this.lastStream = 0;  // 上次补树时玩家累计位移
    this._tmp = new THREE.Vector3();
  }

  _makeTree() {
    const g = new THREE.Group();
    const trunkH = 10;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, trunkH, 6),
      new THREE.MeshStandardMaterial({ color: COL.treeTrunk, roughness: 1 })
    );
    trunk.position.y = trunkH / 2;
    const foli = new THREE.Mesh(
      new THREE.ConeGeometry(5, 16, 7),
      new THREE.MeshStandardMaterial({ color: COL.tree, roughness: 1 })
    );
    foli.position.y = trunkH + 7;
    g.add(trunk); g.add(foli);
    return g;
  }

  _place(tree, n) {
    const p = surfPoint(n, this._tmp);
    tree.mesh.position.copy(p);
    orientToSurface(tree.mesh, n, frame(n).north);
    tree.n.copy(n);
  }

  _spawn(n) {
    const mesh = this._makeTree();
    const tree = { mesh, n: n.clone() };
    this._place(tree, n);
    this.scene.add(mesh);
    this.trees.push(tree);
  }

  _despawn(tree) {
    this.scene.remove(tree.mesh);
    tree.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }

  // 初始化: 在玩家周围铺满树
  seed(playerN) {
    while (this.trees.length < TREE_TARGET) {
      const n = randomNormalAround(playerN, TREE_NEAR, TREE_FAR);
      this._spawn(n);
    }
  }

  // 每帧: 玩家移动超过 STEP 则补树; 超距回收
  update(playerN, playerPos) {
    // 回收
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const t = this.trees[i];
      const d = surfaceDist(surfPoint(t.n, this._tmp), playerPos);
      if (d > TREE_DESPAWN) { this._despawn(t); this.trees.splice(i, 1); }
    }
    // 补树
    while (this.trees.length < TREE_TARGET) {
      const n = randomNormalAround(playerN, TREE_NEAR, TREE_FAR);
      this._spawn(n);
    }
  }
}
