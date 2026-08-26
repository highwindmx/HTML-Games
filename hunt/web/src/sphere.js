// 球面数学：在半径 R 的球体上把实体"贴地"移动、定向、取局部坐标系。
// 行星中心在原点, 表面点 = 单位法线 n * R。
import * as THREE from '../lib/three.module.js';
import { R } from './config.js';

const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

// 表面点(给定单位法线)
export function surfPoint(n, out) {
  out = out || new THREE.Vector3();
  return out.copy(n).multiplyScalar(R);
}

// 给定法线 n, 求局部切向基: east(经度方向) / north(纬度前向)
export function frame(n) {
  const up = new THREE.Vector3(0, 1, 0);
  let east = new THREE.Vector3().crossVectors(up, n);
  if (east.lengthSq() < 1e-6) east.set(1, 0, 0); // 极点退化
  east.normalize();
  const north = new THREE.Vector3().crossVectors(n, east).normalize();
  return { east, north };
}

// 沿切向 dir(已是切向向量, 不必归一) 在球面移动 dist 距离, 返回新法线(单位)
export function moveNormal(n, dir, dist) {
  // 旋转轴 = n × dir, 角度 = dist / R
  _axis.crossVectors(n, dir);
  const len = _axis.length();
  if (len < 1e-6) return n.clone();
  _axis.multiplyScalar(1 / len);
  const ang = dist / R;
  _q.setFromAxisAngle(_axis, ang);
  return n.clone().applyQuaternion(_q).normalize();
}

// 把世界方向向量投影到 n 处的切平面(去掉法向分量)
export function tangetProject(v, n) {
  const d = v.dot(n);
  return v.clone().addScaledVector(n, -d);
}

// 在法线 n 处、绕 east/north 偏移 (du 沿 east, dv 沿 north) 得到新法线(单位)
export function offsetNormal(n, east, north, du, dv) {
  const p = n.clone()
    .addScaledVector(east, du)
    .addScaledVector(north, dv);
  return p.normalize();
}

// 表面两点间的大圆(球面)距离
export function surfaceDist(a, b) {
  // a,b 为位置向量(均长 R)
  const c = a.dot(b) / (R * R);
  return Math.acos(Math.min(1, Math.max(-1, c))) * R;
}

// 随机一个与给定法线夹角约 [minA,maxA] 范围内的表面法线(用于生成环绕实体)
export function randomNormalAround(n, minA, maxA) {
  const { east, north } = frame(n);
  const az = Math.random() * Math.PI * 2;
  const polar = minA + Math.random() * (maxA - minA);
  const dir = east.clone().multiplyScalar(Math.cos(az))
    .addScaledVector(north, Math.sin(az));
  // 从 n 绕 dir 旋转 polar
  _q.setFromAxisAngle(dir, polar);
  return n.clone().applyQuaternion(_q).normalize();
}

// 让 object 的 +Y 对齐法线 n, 并尽量让 +Z(前向)靠近 desiredForward(切向)
export function orientToSurface(obj, n, desiredForward) {
  const m = new THREE.Matrix4();
  const up = n.clone();
  let fwd = tangetProject(desiredForward || new THREE.Vector3(0, 0, -1), n);
  if (fwd.lengthSq() < 1e-6) fwd = frame(n).north;
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const realFwd = new THREE.Vector3().crossVectors(right, up).normalize();
  m.makeBasis(right, up, realFwd);
  obj.quaternion.setFromRotationMatrix(m);
}
