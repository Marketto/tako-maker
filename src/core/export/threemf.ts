import { strToU8, zipSync } from 'fflate';
import type { Attribution, Filament, PrinterSpec, PrintStrategy, SlicerProfile, UserSetup, Vec3 } from '../types';
import type { RawMesh } from '../geometry/evaluate';
import { t } from '../../i18n';
import { overlaps, placeAvoiding, type Rect } from '../plate/primeTower';
import { bambuFiles } from './bambu3mf';

/* Esportazione 3MF.
   - Formato "orca": Bambu Studio e derivati (Anycubic Slicer Next, OrcaSlicer, Creality Print,
     ElegooSlicer…): progetto con più piatti, scritto da bambu3mf.ts (vedi docs/3MF.md).
   - Formato "prusa": PrusaSlicer (un oggetto con volumi + Metadata/Slic3r_PE_model.config).
   L'assegnazione dei colori è "best effort": se lo slicer la ignora, il modello
   arriva comunque diviso in parti con nome e colore. */

export type SlicerFlavor = 'orca' | 'prusa';

export interface ExportPart {
  name: string;
  mesh: RawMesh;
  filament?: Filament;
  /** Slot del sistema multicolore (1-based). */
  extruder: number;
  /** Parti con lo stesso gruppo restano montate tra loro anche se si stampa separato (cerniere). */
  group?: string;
  /** Piatto (1 = primo) quando le posizioni sono già decise (keepPositions), es. campioni di prova. */
  plate?: number;
  /** Impostazioni di stampa calcolate dall'analisi (supporti, brim, interfaccia dei supporti). */
  print?: { supports: boolean; brim: number; interfaceExtruder?: number; ears?: boolean };
}

type PrintSettings = NonNullable<ExportPart['print']>;

/** Unione delle impostazioni di più parti stampate come un unico oggetto. */
function mergePrint(list: (PrintSettings | undefined)[]): PrintSettings | undefined {
  const xs = list.filter(Boolean) as PrintSettings[];
  if (!xs.length) return undefined;
  return { supports: xs.some((x) => x.supports), brim: Math.max(...xs.map((x) => x.brim)), interfaceExtruder: xs.find((x) => x.interfaceExtruder)?.interfaceExtruder, ears: xs.some((x) => x.ears) };
}

/** Metadati per oggetto letti dallo slicer (le chiavi sconosciute vengono ignorate). */
function printMeta(flavor: SlicerFlavor, s: PrintSettings | undefined): string {
  if (!s) return '';
  const kv: [string, string][] = [];
  if (flavor === 'orca') {
    if (s.supports) kv.push(['enable_support', '1'], ['support_type', 'tree(auto)']);
    if (s.supports && s.interfaceExtruder) kv.push(['support_interface_filament', String(s.interfaceExtruder)]);
    // "brim_ears" = orecchie agli angoli (Bambu Studio e derivati): si staccano meglio del bordo intero.
    if (s.brim > 0) kv.push(['brim_type', s.ears ? 'brim_ears' : 'outer_only'], ['brim_width', String(s.brim)]);
    return kv.map(([k, v]) => `\n<metadata key="${k}" value="${v}"/>`).join('');
  }
  if (s.supports) kv.push(['support_material', '1'], ['support_material_auto', '1'], ['support_material_style', 'organic']);
  if (s.supports && s.interfaceExtruder) kv.push(['support_material_interface_extruder', String(s.interfaceExtruder)]);
  if (s.brim > 0) kv.push(['brim_width', String(s.brim)]);
  return kv.map(([k, v]) => `\n<metadata type="object" key="${k}" value="${v}"/>`).join('');
}

export interface ExportOptions {
  title: string;
  flavor: SlicerFlavor;
  strategy: PrintStrategy;
  bed: Vec3;
  attribution?: Attribution;
  /** Le parti sono già posizionate in coordinate del piatto: non spostarle (oggetti separati). */
  keepPositions?: boolean;
  /** Passo tra i piatti nello slicer (Bambu Studio e derivati), se noto per la stampante. */
  plateStride?: [number, number];
  /** Zona del piatto da lasciare libera (torre di spurgo). */
  keepFree?: Rect | null;
  /** File di testo aggiuntivi nel pacchetto (es. istruzioni). */
  extraFiles?: Record<string, string>;
  /** Profili dello slicer (formato "orca"): il 3MF diventa un progetto con le impostazioni minime. */
  slicerProfile?: SlicerProfile;
  /** Filamenti dell'utente: l'estrusore n è filaments[n-1]. */
  filaments?: Filament[];
}

/** Profili dello slicer da scrivere nel progetto: solo con l'ugello di serie, perché i nomi dei profili lo contengono. */
export function slicerProfileFor(setup: UserSetup, printer: PrinterSpec): SlicerProfile | undefined {
  if (setup.nozzle && setup.nozzle !== (printer.nozzle ?? 0.4)) return undefined;
  return printer.slicerProfile;
}

/**
 * Estrusori numerati 1..k sui soli filamenti usati (es. 8 e 9 diventano 1 e 2): il progetto
 * elenca solo quei filamenti, e uno slicer con 4 slot rifiuterebbe l'estrusore 8.
 */
export function compactExtruders(parts: ExportPart[], filaments: Filament[] = []): { parts: ExportPart[]; filaments: (Filament | undefined)[] } {
  const used = [...new Set(parts.flatMap((p) => [p.extruder, p.print?.supports ? (p.print.interfaceExtruder ?? 0) : 0]).filter((e) => e > 0))].sort((a, b) => a - b);
  const idx = new Map(used.map((e, i) => [e, i + 1]));
  const map = (e: number) => idx.get(e) ?? 1;
  return {
    parts: parts.map((p) => ({ ...p, extruder: map(p.extruder), print: p.print && { ...p.print, interfaceExtruder: p.print.interfaceExtruder ? map(p.print.interfaceExtruder) : undefined } })),
    filaments: used.map((e) => filaments[e - 1] ?? parts.find((p) => p.extruder === e)?.filament),
  };
}

export function flavorForSlicer(slicer: string): SlicerFlavor {
  return /prusa/i.test(slicer) ? 'prusa' : 'orca';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function bounds(meshes: RawMesh[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
  return { min, max };
}

function meshXml(m: RawMesh, offset: Vec3 = [0, 0, 0]): string {
  const v: string[] = [];
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    v.push(`<vertex x="${(p[i] + offset[0]).toFixed(4)}" y="${(p[i + 1] + offset[1]).toFixed(4)}" z="${(p[i + 2] + offset[2]).toFixed(4)}"/>`);
  }
  const tris: string[] = [];
  const ix = m.indices;
  for (let i = 0; i < ix.length; i += 3) tris.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`;
}

function mergeMeshes(meshes: RawMesh[], offsets: Vec3[]): { mesh: RawMesh; triRanges: [number, number][] } {
  const nv = meshes.reduce((s, m) => s + m.positions.length, 0);
  const nt = meshes.reduce((s, m) => s + m.indices.length, 0);
  const positions = new Float32Array(nv);
  const indices = new Uint32Array(nt);
  const triRanges: [number, number][] = [];
  let vo = 0, to = 0;
  meshes.forEach((m, mi) => {
    const off = offsets[mi];
    for (let i = 0; i < m.positions.length; i++) positions[vo + i] = m.positions[i] + off[i % 3];
    const base = vo / 3;
    for (let i = 0; i < m.indices.length; i++) indices[to + i] = m.indices[i] + base;
    triRanges.push([to / 3, (to + m.indices.length) / 3 - 1]);
    vo += m.positions.length;
    to += m.indices.length;
  });
  return { mesh: { positions, indices }, triRanges };
}

/** Dispone le parti sul piatto in righe, ognuna appoggiata a z=0. */
export function layoutOnBed(meshes: RawMesh[], bed: Vec3, gap = 6, keepFree: Rect | null = null): Vec3[] {
  const offsets: Vec3[] = [];
  let x = gap, y = gap, rowH = 0;
  for (const m of meshes) {
    const b = bounds([m]);
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    for (let guard = 0; guard < 200; guard++) {
      if (x + w > bed[0] - gap && x > gap) {
        x = gap;
        y += rowH + gap;
        rowH = 0;
      }
      // Salta la zona della torre di spurgo
      if (keepFree && overlaps({ x, y, w, d: h }, keepFree)) {
        x = keepFree.x + keepFree.w + gap;
        continue;
      }
      break;
    }
    offsets.push([x - b.min[0], y - b.min[1], -b.min[2]]);
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return offsets;
}

/** Layout separato, ma le parti dello stesso gruppo mantengono la posizione relativa. */
function groupedLayout(parts: ExportPart[], bed: Vec3, keepFree: Rect | null = null): Vec3[] {
  const keys = parts.map((p, i) => p.group ?? `#${i}`);
  const uniq = [...new Set(keys)];
  const groupMeshes = uniq.map((k) => {
    const members = parts.filter((_, i) => keys[i] === k).map((p) => p.mesh);
    const b = bounds(members);
    // Mesh fittizia con solo i due estremi: basta per il layout.
    return { positions: new Float32Array([...b.min, ...b.max]), indices: new Uint32Array() };
  });
  const offs = layoutOnBed(groupMeshes, bed, 6, keepFree);
  return keys.map((k) => offs[uniq.indexOf(k)]);
}

/**
 * Parti separate su più piatti: un piatto per colore (i gruppi stampati già montati restano
 * insieme), e un piatto in più quando non ci stanno. La torre di spurgo si evita solo nei
 * piatti con più colori.
 */
export function platedLayout(parts: ExportPart[], bed: Vec3, keepFree: Rect | null = null, gap = 6): { plate: number; offset: Vec3 }[] {
  const keys = parts.map((p, i) => p.group ?? `#${i}`);
  const groups = [...new Set(keys)].map((k) => {
    const members = parts.filter((_, i) => keys[i] === k);
    return { key: k, box: bounds(members.map((p) => p.mesh)), colors: [...new Set(members.map((p) => p.extruder))].sort().join(',') };
  });
  const out = new Map<string, { plate: number; offset: Vec3 }>();
  const placed: { key: string; plate: number; zone: Rect | null; x: number; y: number; w: number; h: number }[] = [];
  let plate = 0;
  for (const colors of [...new Set(groups.map((g) => g.colors))]) {
    const zone = colors.includes(',') ? keepFree : null;
    plate++;
    let x = gap, y = gap, rowH = 0;
    for (const g of groups.filter((x) => x.colors === colors)) {
      const w = g.box.max[0] - g.box.min[0];
      const h = g.box.max[1] - g.box.min[1];
      for (let guard = 0; guard < 400; guard++) {
        if (x + w > bed[0] - gap && x > gap) {
          x = gap;
          y += rowH + gap;
          rowH = 0;
        }
        if (y + h > bed[1] - gap && (x > gap || y > gap)) {
          plate++;
          x = gap;
          y = gap;
          rowH = 0;
          continue;
        }
        if (zone && overlaps({ x, y, w, d: h }, zone)) {
          x = zone.x + zone.w + gap;
          continue;
        }
        break;
      }
      // Pezzo quasi lungo quanto il piatto: il margine si riduce, così resta dentro (es. 256 mm su 260).
      const px = x === gap && w + 2 * gap > bed[0] ? Math.max(0, (bed[0] - w) / 2) : x;
      const py = y === gap && h + 2 * gap > bed[1] ? Math.max(0, (bed[1] - h) / 2) : y;
      out.set(g.key, { plate, offset: [px - g.box.min[0], py - g.box.min[1], -g.box.min[2]] });
      placed.push({ key: g.key, plate, zone, x: px, y: py, w, h });
      x += w + gap;
      rowH = Math.max(rowH, h);
    }
  }
  // Come nei progetti salvati dallo slicer: i pezzi di ogni piatto, tutti insieme, al centro del
  // piatto (o accanto alla torre di spurgo). Se non c'è posto restano dove sono.
  for (const n of new Set(placed.map((q) => q.plate))) {
    const items = placed.filter((q) => q.plate === n);
    const x0 = Math.min(...items.map((q) => q.x)), y0 = Math.min(...items.map((q) => q.y));
    const x1 = Math.max(...items.map((q) => q.x + q.w)), y1 = Math.max(...items.map((q) => q.y + q.h));
    const spot = placeAvoiding(x1 - x0, y1 - y0, bed, items[0].zone);
    if (!spot) continue;
    for (const q of items) {
      const o = out.get(q.key)!;
      out.set(q.key, { plate: n, offset: [o.offset[0] + spot.x - x0, o.offset[1] + spot.y - y0, o.offset[2]] });
    }
  }
  return keys.map((k) => out.get(k)!);
}

export function build3MF(parts: ExportPart[], opt: ExportOptions): Uint8Array {
  if (!parts.length) throw new Error(t('Nessuna parte da esportare'));
  const separate = opt.strategy === 'separate' || !!opt.keepPositions;
  const all = bounds(parts.map((p) => p.mesh));
  // Modello unico: al centro del piatto, oppure accanto alla zona della torre di spurgo.
  const spot = placeAvoiding(all.max[0] - all.min[0], all.max[1] - all.min[1], opt.bed, opt.keepFree ?? null);
  const centerOffset: Vec3 = spot
    ? [spot.x - all.min[0], spot.y - all.min[1], -all.min[2]]
    : [opt.bed[0] / 2 - (all.min[0] + all.max[0]) / 2, opt.bed[1] / 2 - (all.min[1] + all.max[1]) / 2, -all.min[2]];
  const offsets: Vec3[] = opt.keepPositions ? parts.map(() => [0, 0, 0]) : separate ? groupedLayout(parts, opt.bed, opt.keepFree ?? null) : parts.map(() => centerOffset);

  const colors = parts.map((p) => p.filament?.hex ?? '#cccccc');
  const baseMaterials = `<basematerials id="1">${parts
    .map((p, i) => `<base name="${esc(p.filament ? `${p.filament.material} ${p.filament.colorName}` : p.name)}" displaycolor="${colors[i].toUpperCase()}FF"/>`)
    .join('')}</basematerials>`;

  const meta: string[] = [
    `<metadata name="Title">${esc(opt.title)}</metadata>`,
    `<metadata name="Application">Printopus</metadata>`,
    `<metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`,
  ];
  if (opt.attribution) {
    const a = opt.attribution;
    meta.push(`<metadata name="Designer">${esc(a.author ?? '')}</metadata>`);
    meta.push(`<metadata name="LicenseTerms">${esc(a.license)}</metadata>`);
    meta.push(
      `<metadata name="Description">${esc(a.author ? t('Remix di "{title}" ({url}) di {author}, licenza {license}.', { title: a.title, url: a.url, author: a.author, license: a.license }) : t('Remix di "{title}" ({url}), licenza {license}.', { title: a.title, url: a.url, license: a.license }))}</metadata>`,
    );
  }

  let resources = baseMaterials;
  let buildItems = '';
  let config = '';
  const files: Record<string, Uint8Array> = {};

  if (opt.flavor === 'prusa' && !separate) {
    // Un solo oggetto, un volume per parte (intervalli di triangoli).
    const { mesh, triRanges } = mergeMeshes(parts.map((p) => p.mesh), offsets);
    resources += `<object id="2" name="${esc(opt.title)}" type="model">${meshXml(mesh)}</object>`;
    buildItems = `<item objectid="2"/>`;
    config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n<object id="2" instances_count="1">\n<metadata type="object" key="name" value="${esc(opt.title)}"/>${printMeta('prusa', mergePrint(parts.map((p) => p.print)))}\n${parts
      .map(
        (p, i) =>
          `<volume firstid="${triRanges[i][0]}" lastid="${triRanges[i][1]}">\n<metadata type="volume" key="name" value="${esc(p.name)}"/>\n<metadata type="volume" key="extruder" value="${p.extruder}"/>\n</volume>`,
      )
      .join('\n')}\n</object>\n</config>\n`;
    files['Metadata/Slic3r_PE_model.config'] = strToU8(config);
  } else if (opt.flavor === 'prusa') {
    parts.forEach((p, i) => {
      resources += `<object id="${i + 2}" name="${esc(p.name)}" type="model" pid="1" pindex="${i}">${meshXml(p.mesh, offsets[i])}</object>`;
      buildItems += `<item objectid="${i + 2}"/>`;
    });
    config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${parts
      .map((p, i) => {
        const tris = p.mesh.indices.length / 3;
        return `<object id="${i + 2}" instances_count="1">\n<metadata type="object" key="name" value="${esc(p.name)}"/>\n<metadata type="object" key="extruder" value="${p.extruder}"/>${printMeta('prusa', p.print)}\n<volume firstid="0" lastid="${tris - 1}">\n<metadata type="volume" key="extruder" value="${p.extruder}"/>\n</volume>\n</object>`;
      })
      .join('\n')}\n</config>\n`;
    files['Metadata/Slic3r_PE_model.config'] = strToU8(config);
  } else {
    // Bambu Studio e derivati: oggetti con componenti, mesh in file separati, più piatti.
    let settings: { profile: SlicerProfile; filaments: (Filament | undefined)[] } | undefined;
    if (opt.slicerProfile) {
      const c = compactExtruders(parts, opt.filaments);
      parts = c.parts;
      settings = { profile: opt.slicerProfile, filaments: c.filaments };
    }
    const keyOf = (p: ExportPart, i: number) => (separate ? (p.group ?? `#${i}`) : 'modello');
    let placed: { plate: number; offset: Vec3 }[];
    if (opt.keepPositions) placed = parts.map((p) => ({ plate: p.plate ?? 1, offset: [0, 0, 0] }));
    else if (separate) placed = platedLayout(parts, opt.bed, opt.keepFree ?? null);
    else placed = parts.map(() => ({ plate: 1, offset: centerOffset }));
    const metaByKey = new Map<string, string>();
    parts.forEach((p, i) => {
      const k = keyOf(p, i);
      if (!metaByKey.has(k)) metaByKey.set(k, printMeta('orca', mergePrint(parts.filter((q, j) => keyOf(q, j) === k).map((q) => q.print))));
    });
    Object.assign(
      files,
      bambuFiles(
        parts.map((p, i) => ({ name: p.name, mesh: p.mesh, extruder: p.extruder, objectKey: keyOf(p, i), plate: placed[i].plate, offset: placed[i].offset, objectMeta: metaByKey.get(keyOf(p, i)) })),
        { title: opt.title, bed: opt.bed, plateStride: opt.plateStride, meta: meta.filter((m) => !m.includes('name="Application"')), settings },
      ),
    );
    return finish(files, opt);
  }

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="it-IT" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
${meta.join('\n')}
<resources>${resources}</resources>
<build>${buildItems}</build>
</model>`;

  files['3D/3dmodel.model'] = strToU8(model);
  return finish(files, opt);
}

/** Parti comuni del pacchetto: tipi di contenuto, relazioni, attribuzione e file extra. */
function finish(files: Record<string, Uint8Array>, opt: ExportOptions): Uint8Array {
  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/></Types>`,
  );
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
  );
  if (opt.attribution) files['Metadata/ATTRIBUZIONE.txt'] = strToU8(attributionText(opt.attribution));
  for (const [name, text] of Object.entries(opt.extraFiles ?? {})) files[name] = strToU8(text);
  return zipSync(files, { level: 6 });
}

export function attributionText(a: Attribution): string {
  return [
    t('Questo modello è un remix di:'),
    `  "${a.title}"${a.author ? ' ' + t('di {author}', { author: a.author }) : ''}`,
    `  ${a.url}`,
    '  ' + t('Licenza: {license}', { license: a.license }),
    '',
    t('Rispetta i termini della licenza originale (attribuzione, uso non commerciale, condivisione allo stesso modo, se previsti).'),
    '',
  ].join('\n');
}
