import { strToU8 } from 'fflate';
import type { Filament, SlicerProfile, Vec3 } from '../types';
import type { RawMesh } from '../geometry/evaluate';

/* 3MF nel formato dei progetti di Bambu Studio e dei suoi derivati (OrcaSlicer, Anycubic
   Slicer Next, Creality Print, ElegooSlicer, QIDI Studio, Flash Studio, Snapmaker Orca).
   Struttura ricavata da un progetto reale di Anycubic Slicer Next 2.0.0.3 per Kobra X
   (4 piatti, un cubo per piatto): vedi docs/3MF.md.

   - 3D/3dmodel.model: un oggetto "contenitore" per oggetto, con componenti che puntano ai
     file delle mesh (estensione Production, p:path); nel <build> una voce per oggetto con
     la traslazione in coordinate del "mondo" (piatto 1 nell'origine, gli altri accanto).
   - 3D/Objects/*.model: una mesh per parte.
   - Metadata/model_settings.config: nome ed estrusore di oggetti e parti, impostazioni per
     oggetto, elenco dei piatti con gli oggetti assegnati, posizioni di montaggio.
   - Metadata/project_settings.config e slice_info.config, solo se si conoscono i profili della
     stampante: senza, Anycubic Slicer Next apre il file come semplice geometria, ignora i
     piatti e mette tutto al centro del piatto 1. */

export interface PlatedPart {
  name: string;
  mesh: RawMesh;
  extruder: number;
  /** Parti con la stessa chiave formano un unico oggetto (es. modello montato, cerniera). */
  objectKey: string;
  /** Piatto (1 = primo). */
  plate: number;
  /** Traslazione dell'oggetto dentro il suo piatto. */
  offset: Vec3;
  /** Metadati di stampa per l'oggetto (supporti, brim…), già in XML. */
  objectMeta?: string;
}

export interface BambuOptions {
  title: string;
  bed: Vec3;
  /** Passo tra i piatti nel "mondo" dello slicer (mm); se assente si usa piatto × 1,2. */
  plateStride?: [number, number];
  /** Righe <metadata> del modello (titolo, autore, licenza…). */
  meta: string[];
  /** Impostazioni minime del progetto (vedi projectSettings). */
  settings?: { profile: SlicerProfile; filaments: (Filament | undefined)[] };
}

/** Applicazione dichiarata: gli slicer della famiglia Bambu leggono piatti e impostazioni solo dai progetti "BambuStudio". */
export const BAMBU_APPLICATION = 'BambuStudio-2.0.0.3';

/** Colonne della griglia dei piatti, come fa Bambu Studio (radice quadrata arrotondata per eccesso). */
export function plateColumns(count: number): number {
  const v = Math.sqrt(count);
  const r = Math.round(v);
  return v > r ? r + 1 : r;
}

/** Origine del piatto `index` (0 = primo): i piatti vanno a destra, poi in righe verso -Y. */
export function plateOrigin(index: number, count: number, bed: Vec3, stride?: [number, number]): [number, number] {
  const cols = plateColumns(count);
  const [sx, sy] = stride ?? [bed[0] * 1.2, bed[1] * 1.2];
  return [(index % cols) * sx, -Math.floor(index / cols) * sy];
}

/**
 * Impostazioni minime del progetto: nomi dei profili di sistema, piatto e filamenti usati
 * (estrusore n = filaments[n-1]). Lo slicer completa il resto dai suoi profili. Provato con
 * Anycubic Slicer Next 2.0.0.3 sulla Kobra X: così il file si apre con i suoi piatti.
 */
export function projectSettings(profile: SlicerProfile, bed: Vec3, filaments: (Filament | undefined)[]): Record<string, unknown> {
  const fil = filaments.length ? filaments : [undefined];
  const nozzle = profile.printer.match(/(\d+(?:\.\d+)?) nozzle/)?.[1] ?? '0.4';
  return {
    from: 'project',
    version: BAMBU_APPLICATION.split('-')[1],
    name: 'project_settings',
    printer_model: profile.printerModel,
    printer_settings_id: profile.printer,
    print_settings_id: profile.print,
    printer_variant: nozzle,
    print_compatible_printers: [profile.printer],
    printable_area: ['0x0', `${f(bed[0])}x0`, `${f(bed[0])}x${f(bed[1])}`, `0x${f(bed[1])}`],
    printable_height: f(bed[2]),
    nozzle_diameter: [nozzle],
    ...(profile.bedType ? { curr_bed_type: profile.bedType } : {}),
    single_extruder_multi_material: '1',
    enable_prime_tower: fil.length > 1 ? '1' : '0',
    filament_settings_id: fil.map((x) => profile.filament.replace('{material}', x?.material ?? 'PLA')),
    filament_type: fil.map((x) => x?.material ?? 'PLA'),
    filament_colour: fil.map((x) => (x?.hex ?? '#FFFFFF').toUpperCase()),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
const uuid = (a: number, b: number) => `${a.toString(16).padStart(8, '0')}-${b.toString(16).padStart(4, '0')}-4000-8000-${(a * 7919 + b).toString(16).padStart(12, '0')}`;

/** Centro del riquadro che contiene le mesh. */
function centerOf(meshes: RawMesh[]): Vec3 {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes)
    for (let i = 0; i < m.positions.length; i++) {
      const k = i % 3;
      lo[k] = Math.min(lo[k], m.positions[i]);
      hi[k] = Math.max(hi[k], m.positions[i]);
    }
  return [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as Vec3;
}

function meshXml(m: RawMesh, c: Vec3 = [0, 0, 0]): string {
  const v: string[] = [];
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) v.push(`<vertex x="${f(p[i] - c[0])}" y="${f(p[i + 1] - c[1])}" z="${f(p[i + 2] - c[2])}"/>`);
  const t: string[] = [];
  const ix = m.indices;
  for (let i = 0; i < ix.length; i += 3) t.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  return `<mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh>`;
}

const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';

/** File del pacchetto (senza [Content_Types].xml e _rels/.rels, che aggiunge build3MF). */
export function bambuFiles(parts: PlatedPart[], opt: BambuOptions): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const plates = Math.max(1, ...parts.map((p) => p.plate));
  const keys = [...new Set(parts.map((p) => p.objectKey))];
  let nextId = 1;
  let identify = 100;
  const objects: string[] = [];
  const build: string[] = [];
  const rels: string[] = [];
  const settings: string[] = [];
  const assemble: string[] = [];
  const plateObjects = new Map<number, number[]>();

  keys.forEach((key, oi) => {
    const members = parts.filter((p) => p.objectKey === key);
    // Come fanno gli slicer: mesh centrate sull'origine dell'oggetto, posizione nel transform del build.
    const c = centerOf(members.map((p) => p.mesh));
    const comps: string[] = [];
    const partSettings: string[] = [];
    for (const [pi, p] of members.entries()) {
      const innerId = nextId++;
      const path = `/3D/Objects/oggetto_${oi + 1}_${pi + 1}.model`;
      files[path.slice(1)] = strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n  <object id="${innerId}" p:UUID="${uuid(innerId, 1)}" type="model">${meshXml(p.mesh, c)}</object>\n </resources>\n <build/>\n</model>\n`,
      );
      rels.push(`<Relationship Target="${path}" Id="rel-${rels.length + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`);
      comps.push(`<component p:path="${path}" objectid="${innerId}" p:UUID="${uuid(innerId, 2)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`);
      partSettings.push(
        `    <part id="${innerId}" subtype="normal_part">\n      <metadata key="name" value="${esc(p.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="${p.extruder}"/>\n    </part>`,
      );
    }
    const id = nextId++;
    const first = members[0];
    const [ox, oy] = plateOrigin(first.plate - 1, plates, opt.bed, opt.plateStride);
    const tr = `1 0 0 0 1 0 0 0 1 ${f(ox + first.offset[0] + c[0])} ${f(oy + first.offset[1] + c[1])} ${f(first.offset[2] + c[2])}`;
    const name = members.length > 1 ? opt.title : first.name;
    objects.push(`  <object id="${id}" p:UUID="${uuid(id, 3)}" type="model">\n   <components>\n    ${comps.join('\n    ')}\n   </components>\n  </object>`);
    build.push(`  <item objectid="${id}" p:UUID="${uuid(id, 4)}" transform="${tr}" printable="1"/>`);
    settings.push(
      `  <object id="${id}">\n    <metadata key="name" value="${esc(name)}"/>\n    <metadata key="extruder" value="${first.extruder}"/>${(first.objectMeta ?? '').replace(/\n/g, '\n    ')}\n${partSettings.join('\n')}\n  </object>`,
    );
    assemble.push(`   <assemble_item object_id="${id}" instance_id="0" transform="${tr}" offset="0 0 0" />`);
    plateObjects.set(first.plate, [...(plateObjects.get(first.plate) ?? []), id]);
  });

  const plateXml: string[] = [];
  for (let k = 1; k <= plates; k++) {
    const inst = (plateObjects.get(k) ?? [])
      .map((id) => `    <model_instance>\n      <metadata key="object_id" value="${id}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${identify++}"/>\n    </model_instance>`)
      .join('\n');
    plateXml.push(`  <plate>\n    <metadata key="plater_id" value="${k}"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n${inst}\n  </plate>`);
  }

  files['3D/3dmodel.model'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" ${NS}>\n <metadata name="Application">${BAMBU_APPLICATION}</metadata>\n <metadata name="BambuStudio:3mfVersion">1</metadata>\n ${opt.meta.join('\n ')}\n <resources>\n${objects.join('\n')}\n </resources>\n <build>\n${build.join('\n')}\n </build>\n</model>\n`,
  );
  files['3D/_rels/3dmodel.model.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n ${rels.join('\n ')}\n</Relationships>\n`);
  files['Metadata/model_settings.config'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${settings.join('\n')}\n${plateXml.join('\n')}\n  <assemble>\n${assemble.join('\n')}\n  </assemble>\n</config>\n`,
  );
  if (opt.settings) {
    const { profile, filaments } = opt.settings;
    files['Metadata/project_settings.config'] = strToU8(JSON.stringify(projectSettings(profile, opt.bed, filaments), null, 4) + '\n');
    const version = `${BAMBU_APPLICATION.split('-')[1]}`;
    files['Metadata/slice_info.config'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n    <header_item key="${esc(profile.client)}-Client-Type" value="slicer"/>\n    <header_item key="${esc(profile.client)}-Client-Version" value="${version}"/>\n  </header>\n</config>\n`,
    );
  }
  return files;
}
