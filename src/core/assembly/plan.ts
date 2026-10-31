import type { Connection, Design, Vec3 } from '../types';
import { findContacts, type Contact } from '../geometry/evaluate';

/* Guida di montaggio calcolata localmente (zero token):
   1. si parte dalla parte più grande (la "base");
   2. si aggiungono, in ampiezza, le parti che toccano quelle già montate;
   3. ogni passo ha una direzione di inserimento (asse del contatto) usata
      dal visualizzatore per animare il pezzo che "scende" in posizione. */

export interface AssemblyStep {
  index: number;
  partId: string;
  partName: string;
  /** Parti a cui si collega in questo passo. */
  attachTo: { id: string; name: string }[];
  /** Direzione da cui arriva il pezzo (vettore unitario, verso l'esterno). */
  approach: Vec3;
  /** Distanza di partenza dell'animazione (mm). */
  distance: number;
  text: string;
  tips: string[];
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  /** Parti che non toccano nessun'altra (vanno posizionate a mano). */
  loose: string[];
}

interface Box {
  min: Vec3;
  max: Vec3;
}

const AXIS_WORD: Record<number, [string, string]> = {
  0: ['da destra', 'da sinistra'],
  1: ['da dietro', 'davanti'],
  2: ['dall’alto', 'dal basso'],
};

function volumeOf(b: Box) {
  return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
}

export function planAssembly(design: Design, boxes: { id: string; box: Box }[], connection: Connection = design.printPlan.connection): AssemblyPlan {
  if (boxes.length < 2) return { steps: [], loose: [] };
  const name = (id: string) => design.parts.find((p) => p.id === id)?.name ?? id;
  const contacts = findContacts(boxes);
  // Le articolazioni stampate già montate contano come collegamento anche se i box non si toccano.
  const ids = new Set(boxes.map((b) => b.id));
  for (const j of design.joints) {
    if (!ids.has(j.partA) || !ids.has(j.partB)) continue;
    if (contacts.some((c) => [c.a, c.b].sort().join('|') === [j.partA, j.partB].sort().join('|'))) continue;
    contacts.push({ a: j.partA, b: j.partB, axis: 2, center: j.origin, span: 0, dir: 1, depthA: 0, depthB: 0 });
  }
  const jointPairs = new Map(design.joints.map((j) => [[j.partA, j.partB].sort().join('|'), j]));

  const byVol = [...boxes].sort((a, b) => volumeOf(b.box) - volumeOf(a.box));
  const placed = new Set<string>([byVol[0].id]);
  const steps: AssemblyStep[] = [];
  const baseBox = byVol[0].box;
  const size = Math.max(...[0, 1, 2].map((k) => baseBox.max[k] - baseBox.min[k]));

  steps.push({
    index: 0,
    partId: byVol[0].id,
    partName: name(byVol[0].id),
    attachTo: [],
    approach: [0, 0, 1],
    distance: 0,
    text: `Appoggia "${name(byVol[0].id)}" sul tavolo: è la base.`,
    tips: ['Rimuovi eventuali supporti e sbavature prima di iniziare.'],
  });

  let progress = true;
  while (progress && placed.size < boxes.length) {
    progress = false;
    // Tra i candidati scegli quello con più contatti verso le parti già montate.
    let best: { id: string; links: Contact[] } | null = null;
    for (const b of boxes) {
      if (placed.has(b.id)) continue;
      const links = contacts.filter((c) => (c.a === b.id && placed.has(c.b)) || (c.b === b.id && placed.has(c.a)));
      if (links.length && (!best || links.length > best.links.length)) best = { id: b.id, links };
    }
    if (!best) break;
    progress = true;
    const c = best.links[0];
    // Direzione dal pezzo montato verso il nuovo pezzo.
    const newIsB = c.b === best.id;
    const sign = (newIsB ? c.dir : -c.dir) as 1 | -1;
    const approach: Vec3 = [0, 0, 0];
    approach[c.axis] = sign;
    const words = AXIS_WORD[c.axis];
    const from = sign > 0 ? words[0] : words[1];
    const attachTo = best.links.map((l) => (l.a === best!.id ? l.b : l.a)).filter((v, i, a) => a.indexOf(v) === i).map((id) => ({ id, name: name(id) }));
    const joint = attachTo.map((t) => jointPairs.get([t.id, best!.id].sort().join('|'))).find(Boolean);
    const target = attachTo.map((t) => `"${t.name}"`).join(' e ');

    let text: string;
    const tips: string[] = [];
    if (joint) {
      text = `"${name(best.id)}" esce dalla stampa già unita a ${target} con la ${joint.type === 'hinge' ? 'cerniera' : 'articolazione'}: muovila con delicatezza per staccarla dal piatto e liberarla.`;
      if (joint.detent?.enabled) tips.push('Muovila un paio di volte con decisione per “rodare” gli scatti.');
    } else if (connection === 'snap') {
      text = `Allinea i perni di "${name(best.id)}" ai fori di ${target} e premi ${from} fino in fondo.`;
      tips.push('Se entra troppo duro, passa una punta da trapano nel foro o carta vetrata sul perno.');
      tips.push('Premi in modo uniforme, senza fare leva su un lato.');
    } else if (connection === 'glue') {
      text = `Metti la colla sulla faccia di contatto, poi accosta "${name(best.id)}" a ${target} ${from} usando i perni di centraggio.`;
      tips.push('Colla cianoacrilica per PLA/PETG: poche gocce, tieni premuto 30 secondi.');
      tips.push('Prova prima a secco che i pezzi combacino.');
    } else {
      text = `Accosta "${name(best.id)}" a ${target} ${from}.`;
    }

    // Le parti incernierate escono già montate: nessuna animazione d'arrivo.
    steps.push({ index: steps.length, partId: best.id, partName: name(best.id), attachTo, approach, distance: joint ? 0 : Math.max(20, size * 0.6), text, tips });
    placed.add(best.id);
  }

  const loose = boxes.filter((b) => !placed.has(b.id)).map((b) => b.id);
  for (const id of loose) {
    steps.push({
      index: steps.length,
      partId: id,
      partName: name(id),
      attachTo: [],
      approach: [0, 0, 1],
      distance: Math.max(20, size * 0.6),
      text: `Posiziona "${name(id)}" come mostrato nell’anteprima (non tocca altre parti).`,
      tips: [],
    });
  }
  return { steps, loose };
}
