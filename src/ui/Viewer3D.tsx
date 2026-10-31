import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PartResult } from '../core/geometry/evaluate';
import type { AssemblyStep } from '../core/assembly/plan';
import type { Vec3 } from '../core/types';

/* Anteprima 3D: rotazione (un dito / tasto sinistro), zoom (pizzico / rotellina),
   spostamento (due dita / tasto destro). In modalità montaggio anima il pezzo
   del passo corrente che arriva dalla sua direzione di inserimento. */

interface Props {
  parts: PartResult[];
  colors: Record<string, string>;
  bed: Vec3;
  assembly?: { steps: AssemblyStep[]; step: number } | null;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group;
  bed: THREE.Group;
  meshes: Map<string, THREE.Mesh>;
  anim: { partId: string; from: THREE.Vector3; start: number } | null;
  lastFitKey: string;
}

const ANIM_MS = 1100;

export function Viewer3D({ parts, colors, bed, assembly }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);

  // Inizializzazione della scena
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(250, -300, 220);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(200, -150, 400);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-200, 200, 100);
    scene.add(fill);
    const group = new THREE.Group();
    const bedGroup = new THREE.Group();
    scene.add(group, bedGroup);
    const r: SceneRefs = { renderer, scene, camera, controls, group, bed: bedGroup, meshes: new Map(), anim: null, lastFitKey: '' };
    refs.current = r;

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (r.anim) {
        const m = r.meshes.get(r.anim.partId);
        const t = Math.min(1, (now - r.anim.start) / ANIM_MS);
        const e = 1 - Math.pow(1 - t, 3);
        if (m) m.position.copy(r.anim.from).multiplyScalar(1 - e);
        if (t >= 1) r.anim = null;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, []);

  // Piatto di stampa
  useEffect(() => {
    const r = refs.current!;
    r.bed.clear();
    const [bx, by] = bed;
    const grid = new THREE.GridHelper(Math.max(bx, by), Math.round(Math.max(bx, by) / 20), 0xb9b2a3, 0xdcd6c8);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(bx / 2, by / 2, -0.05);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(bx, by), new THREE.MeshBasicMaterial({ color: 0xebe6da, transparent: true, opacity: 0.6 }));
    plate.position.set(bx / 2, by / 2, -0.1);
    r.bed.add(plate, grid);
  }, [bed]);

  // Mesh delle parti
  useEffect(() => {
    const r = refs.current!;
    for (const m of r.meshes.values()) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    r.group.clear();
    r.meshes.clear();
    if (!parts.length) return;

    const box = new THREE.Box3();
    for (const p of parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(p.mesh.indices, 1));
      g.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: colors[p.id] ?? '#c9c4b8', roughness: 0.55, metalness: 0.05, flatShading: true, transparent: true });
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = p.id;
      r.group.add(mesh);
      r.meshes.set(p.id, mesh);
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    // Centra il modello sul piatto (solo visualizzazione).
    const c = box.getCenter(new THREE.Vector3());
    r.group.position.set(bed[0] / 2 - c.x, bed[1] / 2 - c.y, -box.min.z);

    const size = box.getSize(new THREE.Vector3());
    const fitKey = size.toArray().map((v) => Math.round(v / 10)).join(',');
    if (fitKey !== r.lastFitKey) {
      r.lastFitKey = fitKey;
      const radius = Math.max(size.length() / 2, 30);
      const target = new THREE.Vector3(bed[0] / 2, bed[1] / 2, size.z / 2);
      const dist = radius / Math.sin((r.camera.fov * Math.PI) / 360) * 1.1;
      r.controls.target.copy(target);
      r.camera.position.copy(target).add(new THREE.Vector3(0.55, -0.75, 0.55).normalize().multiplyScalar(dist));
      r.camera.far = dist * 10;
      r.camera.updateProjectionMatrix();
    }
  }, [parts, colors, bed]);

  // Montaggio
  useEffect(() => {
    const r = refs.current!;
    if (!assembly || !assembly.steps.length) {
      for (const m of r.meshes.values()) {
        m.visible = true;
        m.position.set(0, 0, 0);
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.opacity = 1;
        mat.emissive.setHex(0x000000);
      }
      r.anim = null;
      return;
    }
    const order = new Map(assembly.steps.map((s, i) => [s.partId, i]));
    for (const [id, m] of r.meshes) {
      const i = order.get(id) ?? -1;
      const mat = m.material as THREE.MeshStandardMaterial;
      m.position.set(0, 0, 0);
      m.visible = i <= assembly.step;
      mat.opacity = 1;
      mat.emissive.setHex(i === assembly.step ? 0x2a2410 : 0x000000);
    }
    const cur = assembly.steps[assembly.step];
    if (cur && cur.distance > 0) {
      const from = new THREE.Vector3(...cur.approach).multiplyScalar(cur.distance);
      r.meshes.get(cur.partId)?.position.copy(from);
      r.anim = { partId: cur.partId, from, start: performance.now() };
    } else r.anim = null;
  }, [assembly, parts]);

  return <div ref={host} className="viewer" aria-label="Anteprima 3D: trascina per ruotare, pizzica o usa la rotellina per lo zoom" />;
}
