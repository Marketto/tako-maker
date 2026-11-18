/* Piattaforme dei produttori di stampanti per pubblicare i modelli (verificate il 18/11/2026).
   Nessuna ha un'API pubblica per caricare: l'app prepara il pacchetto e apre il sito.
   Le pagine di caricamento sono dietro l'accesso e cambiano spesso: si apre la home, dove c'è
   sempre il pulsante «Upload». Chi ha una stampante di un marchio senza piattaforma
   (QIDI, Sovol, Artillery, personalizzata) sceglie tra queste; Printables è aperta a tutti. */

export interface Marketplace {
  id: string;
  name: string;
  url: string;
  /** Marchi in `printers.json` per cui è la piattaforma ufficiale. */
  brands: string[];
}

export const MARKETPLACES: Marketplace[] = [
  { id: 'makerworld', name: 'MakerWorld', url: 'https://makerworld.com/', brands: ['Bambu Lab'] },
  { id: 'printables', name: 'Printables', url: 'https://www.printables.com/', brands: ['Prusa Research'] },
  { id: 'makeronline', name: 'Makeronline', url: 'https://www.makeronline.com/', brands: ['Anycubic'] },
  { id: 'creality-cloud', name: 'Creality Cloud', url: 'https://www.crealitycloud.com/', brands: ['Creality'] },
  { id: 'nexprint', name: 'Nexprint', url: 'https://www.nexprint.com/', brands: ['Elegoo'] },
  { id: 'snapmaker-space', name: 'Snapmaker Space', url: 'https://space.snapmaker.com/', brands: ['Snapmaker'] },
  { id: 'voxelshare', name: 'VoxelShare', url: 'https://www.voxelshare.com/', brands: ['Flashforge'] },
];

/** Piattaforma proposta per i marchi senza una propria. */
export const DEFAULT_MARKETPLACE = 'printables';

export const marketplaceById = (id: string) => MARKETPLACES.find((m) => m.id === id) ?? MARKETPLACES.find((m) => m.id === DEFAULT_MARKETPLACE)!;

/** Piattaforma ufficiale del marchio della stampante, se esiste. */
export const officialMarketplace = (brand: string) => MARKETPLACES.find((m) => m.brands.includes(brand));

/** Piattaforma da proporre per la stampante usata nel progetto. */
export const marketplaceFor = (brand: string) => officialMarketplace(brand) ?? marketplaceById(DEFAULT_MARKETPLACE);
