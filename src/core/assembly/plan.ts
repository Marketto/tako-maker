import type { Connection, Design, Vec3 } from '../types';
import { findContacts, type Contact } from '../geometry/evaluate';
import { msg, t } from '../../i18n';
import { hardwareLabel, toBuy } from '../hardware';

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
  0: [msg('da destra'), msg('da sinistra')],
  1: [msg('da dietro'), msg('davanti')],
  2: [msg('dall’alto'), msg('dal basso')],
};

function volumeOf(b: Box) {
  return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
}

export function planAssembly(
  design: Design,
  boxes: { id: string; box: Box }[],
  connection: Connection = design.printPlan.connection,
  connectors: { a: string; b: string; pegs: number }[] = [],
): AssemblyPlan {
  const pegsBetween = (x: string, y: string) => connectors.find((c) => (c.a === x && c.b === y) || (c.a === y && c.b === x))?.pegs ?? 0;
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
  // Anche i pulsanti escono già montati nel loro guscio.
  const buttonOf = new Map(design.parts.filter((p) => p.button && ids.has(p.id) && ids.has(p.button.housing)).map((p) => [p.id, p.button!.housing]));
  for (const [b, h] of buttonOf) {
    if (contacts.some((c) => [c.a, c.b].sort().join('|') === [b, h].sort().join('|'))) continue;
    contacts.push({ a: h, b, axis: 2, center: [0, 0, 0], span: 0, dir: 1, depthA: 0, depthB: 0 });
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
    text: t('Appoggia "{name}" sul tavolo: è la base.', { name: name(byVol[0].id) }),
    tips: [
      t('Rimuovi eventuali supporti e sbavature prima di iniziare.'),
      ...(toBuy(design).length ? [t('Tieni a portata di mano: {items}.', { items: toBuy(design).map(hardwareLabel).join(', ') })] : []),
    ],
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
    const from = t(sign > 0 ? words[0] : words[1]);
    const attachTo = best.links.map((l) => (l.a === best!.id ? l.b : l.a)).filter((v, i, a) => a.indexOf(v) === i).map((id) => ({ id, name: name(id) }));
    const joint = attachTo.map((a) => jointPairs.get([a.id, best!.id].sort().join('|'))).find(Boolean);
    const quoted = attachTo.map((a) => `"${a.name}"`);
    const target = quoted.length > 1 ? t('{a} e {b}', { a: quoted.slice(0, -1).join(', '), b: quoted[quoted.length - 1] }) : quoted.join('');

    let text: string;
    const tips: string[] = [];
    if (buttonOf.has(best.id)) {
      text = t('"{name}" esce dalla stampa già montato in {target}: premilo qualche volta per staccarlo e farlo scorrere bene.', { name: name(best.id), target });
    } else if (joint) {
      text =
        joint.type === 'hinge'
          ? t('"{name}" esce dalla stampa già unita a {target} con la cerniera: muovila con delicatezza per staccarla dal piatto e liberarla.', { name: name(best.id), target })
          : t('"{name}" esce dalla stampa già unita a {target} con l\'articolazione: muovila con delicatezza per staccarla dal piatto e liberarla.', { name: name(best.id), target });
      if (joint.detent?.enabled) tips.push(t('Muovila un paio di volte con decisione per “rodare” gli scatti.'));
    } else if (connection === 'snap') {
      const n = attachTo.reduce((sum, a) => sum + pegsBetween(a.id, best!.id), 0);
      const v = { n, name: name(best.id), target, from };
      text =
        n > 1
          ? t('Allinea i {n} perni di "{name}" ai fori di {target} e premi {from} fino in fondo.', v)
          : n === 1
            ? t('Allinea il perno di "{name}" ai fori di {target} e premi {from} fino in fondo.', v)
            : t('Allinea i perni di "{name}" ai fori di {target} e premi {from} fino in fondo.', v);
      tips.push(t('Se entra troppo duro, passa una punta da trapano nel foro o carta vetrata sul perno.'));
      tips.push(t('Premi in modo uniforme, senza fare leva su un lato.'));
    } else if (connection === 'glue') {
      text = t('Metti la colla sulla faccia di contatto, poi accosta "{name}" a {target} {from} usando i perni di centraggio.', { name: name(best.id), target, from });
      tips.push(t('Colla cianoacrilica per PLA/PETG: poche gocce, tieni premuto 30 secondi.'));
      tips.push(t('Prova prima a secco che i pezzi combacino.'));
    } else {
      text = t('Accosta "{name}" a {target} {from}.', { name: name(best.id), target, from });
    }

    // Le parti incernierate escono già montate: nessuna animazione d'arrivo.
    steps.push({ index: steps.length, partId: best.id, partName: name(best.id), attachTo, approach, distance: joint || buttonOf.has(best.id) ? 0 : Math.max(20, size * 0.6), text, tips });
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
      text: t('Posiziona "{name}" come mostrato nell’anteprima (non tocca altre parti).', { name: name(id) }),
      tips: [],
    });
  }
  return { steps, loose };
}
