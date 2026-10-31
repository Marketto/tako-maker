import { BufferGeometry, Mesh, Matrix4, type Object3D } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import type { RawMesh } from './evaluate';

/* Importa STL o 3MF scaricati dall'utente (es. da Printables) come RawMesh. */

function fromGeometry(g: BufferGeometry, m?: Matrix4): RawMesh {
  const geo = m ? g.clone().applyMatrix4(m) : g;
  const pos = geo.getAttribute('position');
  const positions = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
  }
  const index = geo.getIndex();
  const indices = index ? new Uint32Array(index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  return { positions, indices };
}

function merge(list: RawMesh[]): RawMesh {
  const positions = new Float32Array(list.reduce((s, m) => s + m.positions.length, 0));
  const indices = new Uint32Array(list.reduce((s, m) => s + m.indices.length, 0));
  let vo = 0, io = 0;
  for (const m of list) {
    positions.set(m.positions, vo);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo / 3;
    vo += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

/** Porta la mesh con il minimo in (0,0,0). */
function normalize(m: RawMesh): RawMesh {
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < m.positions.length; i++) min[i % 3] = Math.min(min[i % 3], m.positions[i]);
  for (let i = 0; i < m.positions.length; i++) m.positions[i] -= min[i % 3];
  return m;
}

export async function importModelFile(file: File): Promise<RawMesh> {
  const buf = await file.arrayBuffer();
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'stl') return normalize(fromGeometry(new STLLoader().parse(buf)));
  if (ext === '3mf') {
    const group = new ThreeMFLoader().parse(buf) as Object3D;
    group.updateMatrixWorld(true);
    const meshes: RawMesh[] = [];
    group.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(fromGeometry((o as Mesh).geometry as BufferGeometry, o.matrixWorld));
    });
    if (!meshes.length) throw new Error('Il file 3MF non contiene mesh');
    return normalize(merge(meshes));
  }
  throw new Error('Formato non supportato: usa STL o 3MF');
}
