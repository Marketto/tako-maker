import { strToU8, zipSync } from 'fflate';
import type { Attribution, Filament, PrintStrategy, Vec3 } from '../types';
import type { RawMesh } from '../geometry/evaluate';

/* Esportazione 3MF.
   - Formato "orca": Bambu Studio, OrcaSlicer, Creality Print, ElegooSlicer, Anycubic Slicer Next
     (oggetto con componenti + Metadata/model_settings.config con l'estrusore per parte).
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
}

export interface ExportOptions {
  title: string;
  flavor: SlicerFlavor;
  strategy: PrintStrategy;
  bed: Vec3;
  attribution?: Attribution;
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
  const t: string[] = [];
  const ix = m.indices;
  for (let i = 0; i < ix.length; i += 3) t.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh>`;
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
export function layoutOnBed(meshes: RawMesh[], bed: Vec3, gap = 6): Vec3[] {
  const offsets: Vec3[] = [];
  let x = gap, y = gap, rowH = 0;
  for (const m of meshes) {
    const b = bounds([m]);
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    if (x + w > bed[0] - gap && x > gap) {
      x = gap;
      y += rowH + gap;
      rowH = 0;
    }
    offsets.push([x - b.min[0], y - b.min[1], -b.min[2]]);
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return offsets;
}

/** Layout separato, ma le parti dello stesso gruppo mantengono la posizione relativa. */
function groupedLayout(parts: ExportPart[], bed: Vec3): Vec3[] {
  const keys = parts.map((p, i) => p.group ?? `#${i}`);
  const uniq = [...new Set(keys)];
  const groupMeshes = uniq.map((k) => {
    const members = parts.filter((_, i) => keys[i] === k).map((p) => p.mesh);
    const b = bounds(members);
    // Mesh fittizia con solo i due estremi: basta per il layout.
    return { positions: new Float32Array([...b.min, ...b.max]), indices: new Uint32Array() };
  });
  const offs = layoutOnBed(groupMeshes, bed);
  return keys.map((k) => offs[uniq.indexOf(k)]);
}

export function build3MF(parts: ExportPart[], opt: ExportOptions): Uint8Array {
  if (!parts.length) throw new Error('Nessuna parte da esportare');
  const separate = opt.strategy === 'separate';
  const all = bounds(parts.map((p) => p.mesh));
  const centerOffset: Vec3 = [
    opt.bed[0] / 2 - (all.min[0] + all.max[0]) / 2,
    opt.bed[1] / 2 - (all.min[1] + all.max[1]) / 2,
    -all.min[2],
  ];
  const offsets = separate ? groupedLayout(parts, opt.bed) : parts.map(() => centerOffset);

  const colors = parts.map((p) => p.filament?.hex ?? '#cccccc');
  const baseMaterials = `<basematerials id="1">${parts
    .map((p, i) => `<base name="${esc(p.filament ? `${p.filament.material} ${p.filament.colorName}` : p.name)}" displaycolor="${colors[i].toUpperCase()}FF"/>`)
    .join('')}</basematerials>`;

  const meta: string[] = [
    `<metadata name="Title">${esc(opt.title)}</metadata>`,
    `<metadata name="Application">Tako Maker</metadata>`,
    `<metadata name="CreationDate">${new Date().toISOString().slice(0, 10)}</metadata>`,
  ];
  if (opt.attribution) {
    const a = opt.attribution;
    meta.push(`<metadata name="Designer">${esc(a.author ?? '')}</metadata>`);
    meta.push(`<metadata name="LicenseTerms">${esc(a.license)}</metadata>`);
    meta.push(`<metadata name="Description">${esc(`Remix di "${a.title}" (${a.url})${a.author ? ` di ${a.author}` : ''}, licenza ${a.license}.`)}</metadata>`);
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
    config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n<object id="2" instances_count="1">\n<metadata type="object" key="name" value="${esc(opt.title)}"/>\n${parts
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
        return `<object id="${i + 2}" instances_count="1">\n<metadata type="object" key="name" value="${esc(p.name)}"/>\n<metadata type="object" key="extruder" value="${p.extruder}"/>\n<volume firstid="0" lastid="${tris - 1}">\n<metadata type="volume" key="extruder" value="${p.extruder}"/>\n</volume>\n</object>`;
      })
      .join('\n')}\n</config>\n`;
    files['Metadata/Slic3r_PE_model.config'] = strToU8(config);
  } else {
    // Orca/Bambu: mesh per parte; se montato, un oggetto padre con componenti.
    parts.forEach((p, i) => {
      resources += `<object id="${i + 2}" name="${esc(p.name)}" type="model" pid="1" pindex="${i}">${meshXml(p.mesh, separate ? offsets[i] : [0, 0, 0])}</object>`;
    });
    if (separate) {
      parts.forEach((_, i) => (buildItems += `<item objectid="${i + 2}"/>`));
      config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${parts
        .map((p, i) => `<object id="${i + 2}">\n<metadata key="name" value="${esc(p.name)}"/>\n<metadata key="extruder" value="${p.extruder}"/>\n</object>`)
        .join('\n')}\n</config>\n`;
    } else {
      const parentId = parts.length + 2;
      const t = centerOffset;
      resources += `<object id="${parentId}" name="${esc(opt.title)}" type="model"><components>${parts
        .map((_, i) => `<component objectid="${i + 2}"/>`)
        .join('')}</components></object>`;
      buildItems = `<item objectid="${parentId}" transform="1 0 0 0 1 0 0 0 1 ${t[0].toFixed(3)} ${t[1].toFixed(3)} ${t[2].toFixed(3)}"/>`;
      config = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n<object id="${parentId}">\n<metadata key="name" value="${esc(opt.title)}"/>\n<metadata key="extruder" value="${parts[0].extruder}"/>\n${parts
        .map((p, i) => `<part id="${i + 2}" subtype="normal_part">\n<metadata key="name" value="${esc(p.name)}"/>\n<metadata key="extruder" value="${p.extruder}"/>\n</part>`)
        .join('\n')}\n</object>\n</config>\n`;
    }
    files['Metadata/model_settings.config'] = strToU8(config);
  }

  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="it-IT" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
${meta.join('\n')}
<resources>${resources}</resources>
<build>${buildItems}</build>
</model>`;

  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="txt" ContentType="text/plain"/></Types>`,
  );
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
  );
  files['3D/3dmodel.model'] = strToU8(model);
  if (opt.attribution) files['Metadata/ATTRIBUZIONE.txt'] = strToU8(attributionText(opt.attribution));
  return zipSync(files, { level: 6 });
}

export function attributionText(a: Attribution): string {
  return `Questo modello è un remix di:\n  "${a.title}"${a.author ? ` di ${a.author}` : ''}\n  ${a.url}\n  Licenza: ${a.license}\n\nRispetta i termini della licenza originale (attribuzione, uso non commerciale, condivisione allo stesso modo, se previsti).\n`;
}
