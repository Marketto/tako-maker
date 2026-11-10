# File 3MF per gli slicer

Printopus esporta il 3MF in due formati (`src/core/export/`):

| Formato | Slicer | Codice |
|---|---|---|
| `orca` | Bambu Studio e derivati: Anycubic Slicer Next, OrcaSlicer, Creality Print, ElegooSlicer, QIDI Studio, Flash Studio, Snapmaker Orca | `bambu3mf.ts` |
| `prusa` | PrusaSlicer | `threemf.ts` |

## Riferimento: progetto di Anycubic Slicer Next per Kobra X

La struttura `orca` riproduce un progetto reale salvato con Anycubic Slicer Next 2.0.0.3: Kobra X, 4 piatti, un cubo di 26 mm al centro di ogni piatto.

**Cosa si è visto nel file**

- **Anycubic Slicer Next è un derivato di Bambu Studio.**
  - Nel modello: `<metadata name="Application">BambuStudio-2.0.0.3</metadata>` e `BambuStudio:3mfVersion = 1`.
  - Namespace `xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"`.
  - Estensione Production (`xmlns:p=…/production/2015/06`, `requiredextensions="p"`).
  - In `Metadata/slice_info.config`: `X-ACNext-Client-Version = 2.0.0.3`.
- **`3D/3dmodel.model`.** Contiene un oggetto "contenitore" per ogni oggetto dello slicer, con `<components>`. Ogni componente punta con `p:path` a un file in `3D/Objects/<nome>_<n>.model`, che contiene la sola mesh. Le relazioni sono in `3D/_rels/3dmodel.model.rels`.
- **`<build>`.** Una voce per oggetto, con `transform` = traslazione in coordinate del "mondo" dello slicer. Il piatto 1 ha l'origine in (0, 0); gli altri stanno accanto.
- **Griglia dei piatti.**
  - Colonne = radice quadrata del numero di piatti, arrotondata per eccesso. Con 4 piatti la griglia è 2 × 2.
  - Le colonne vanno verso +X, le righe verso −Y.
  - Per la Kobra X (piatto 260 × 260 mm) il passo misurato è **314,4 mm in X e 328,8 mm in Y**.
  - I centri dei cubi erano (130, 130), (444,4, 130), (130, −198,8) e (444,4, −198,8).
  - Il passo è salvato in `printers.json` → `plateStride`. Per le altre stampanti si usa piatto × 1,2 finché non si misura un file reale.
- **`Metadata/model_settings.config`.** Contiene tre sezioni:
  - `<object id>`: `name`, `extruder` e le impostazioni per oggetto. Per ogni `<part id subtype="normal_part">` ci sono `name` e `matrix`.
  - `<plate>`: `plater_id`, `plater_name`, `locked`, `filament_map_mode`, `filament_maps`, le miniature e un `<model_instance>` (`object_id`, `instance_id`, `identify_id`) per ogni oggetto del piatto.
  - `<assemble>`: un `assemble_item` per oggetto, con lo stesso `transform` del build.
- **`Metadata/project_settings.config`.** È un JSON con circa 600 chiavi: stampante, profilo, filamenti e torre di spurgo. Alcuni valori del file:
  - `printer_model = "Anycubic Kobra X"`, `printer_settings_id = "Anycubic Kobra X 0.4 nozzle"`.
  - `print_settings_id = "0.28mm Standard @Anycubic Kobra X 0.4 nozzle"`.
  - Filamenti `"Anycubic PLA @Anycubic Kobra X 0.4 nozzle"` e `"Anycubic PETG @Anycubic Kobra X 0.4 nozzle"`.
  - `printable_area = 0x0, 260x0, 260x260, 0x260`, `printable_height = 260`, `nozzle_diameter = 0.4`, `curr_bed_type = "Textured PEI Plate"`.
  - `single_extruder_multi_material = 1` (ACE Gen2 su un solo ugello), `gcode_flavor = klipper`.
  - Torre di spurgo: `enable_prime_tower = 1`, `wipe_tower_x/y = 20/240` (uno per piatto), `prime_tower_width = 30`, `prime_tower_brim_width = 5`, `prime_volume = 30`.
  - Supporti e brim: `support_type = "tree(auto)"`, `brim_type = "auto_brim"`, `brim_width = 5`.
- **Miniature.** `Metadata/plate_<n>.png`, `plate_<n>_small.png`, `plate_no_light_<n>.png`, `top_<n>.png`, `pick_<n>.png`.

**Cosa genera Printopus**

- **Stessa struttura del riferimento:** Production, oggetti in `3D/Objects/`, `model_settings.config` con oggetti, parti, piatti e montaggio, `Application = BambuStudio-2.0.0.3`. Gli slicer della famiglia Bambu leggono piatti e impostazioni per oggetto solo dai progetti che si dichiarano "BambuStudio".
- **Piatti:**
  - modello montato (stampa unica o multicolore): un oggetto con una parte per colore, sul piatto 1;
  - parti separate: un piatto per colore (i gruppi stampati già montati restano insieme), più piatti se non ci stanno, pezzi al centro di ogni piatto;
  - campioni di prova: un solo 3MF con un piatto per materiale.
- **Impostazioni per oggetto:** `enable_support`, `support_type`, `support_interface_filament`, `brim_type`, `brim_width` (vedi docs/ANALISI.md).
- **Impostazioni di progetto minime** (solo per le stampanti con `slicerProfile` in `printers.json`, oggi la Kobra X, e con l'ugello di serie): `Metadata/project_settings.config` e `Metadata/slice_info.config`. Vedi la sezione qui sotto.
- **Cosa resta fuori:** il profilo completo (circa 600 chiavi) e le miniature. Lo slicer completa le impostazioni dai suoi profili di sistema.

Il test `tests/bambu3mf.test.ts` controlla che con il passo della Kobra X i 4 cubi finiscano negli stessi punti del progetto di riferimento.

## Correzione: oggetti fuori dai piatti in Anycubic Slicer Next

**Il problema.** Un 3MF con supporto (piatto 1) e ganci (piatto 2) si apriva in Anycubic Slicer Next per Kobra X con tutti gli oggetti spostati di circa (−53, +100) mm, fuori dai piatti. Le posizioni nel file erano giuste.

**La causa.** Senza `Metadata/project_settings.config` lo slicer non tratta il file come un progetto: lo carica come semplice geometria, ignora i piatti di `model_settings.config` e centra il gruppo di oggetti sul piatto 1.

**La prova.** Confronto con un progetto vero salvato da Anycubic Slicer Next (un portatile giocattolo, 7 piatti), su due varianti dello stesso file:

- A: impostazioni minime (14 chiavi più i filamenti) e `slice_info.config`;
- B: il profilo completo del progetto vero, ridotto a 2 filamenti.

Con entrambe ogni oggetto finisce sul suo piatto. Printopus usa la variante A: contiene solo i nomi dei profili di sistema, senza copiare il profilo completo (G-code e parametri di Anycubic).

**Cosa scrive Printopus** (`projectSettings` in `bambu3mf.ts`):

- `from = "project"`, `version`, `name`;
- profili: `printer_model`, `printer_settings_id`, `print_settings_id`, `printer_variant`, `print_compatible_printers`;
- piatto e ugello: `printable_area`, `printable_height`, `nozzle_diameter`, `curr_bed_type`;
- multicolore: `single_extruder_multi_material = 1`, `enable_prime_tower`;
- filamenti usati: `filament_settings_id`, `filament_type`, `filament_colour`.

`slice_info.config` contiene solo l'intestazione del client (`X-ACNext-Client-Type = slicer` e la versione).

**Estrusori compatti.** Prima l'estrusore era la posizione del filamento nell'elenco dell'utente, per esempio 8 e 9. Ora, in ogni 3MF (anche per PrusaSlicer), gli estrusori diventano 1..k sui soli filamenti usati, nello stesso ordine (`compactExtruders` in `threemf.ts`). L'interfaccia dei supporti segue la stessa numerazione. Il progetto elenca così solo quei filamenti, e la Kobra X (4 slot ACE) non riceve un estrusore 8.

**Pezzo quasi lungo quanto il piatto.** Un supporto di 256 mm su un piatto di 260 veniva messo a 6 mm dal bordo e usciva di 2 mm ("Un oggetto è posizionato oltre il limite del piatto"). Ora la disposizione riduce il margine e lo centra (2 mm per lato), sia con più piatti (`platedLayout`) sia nel piatto unico di PrusaSlicer (`layoutOnBed`).

**Pezzi al centro del piatto.** Come nei progetti salvati dallo slicer, la disposizione (per tutti e due i formati) prima dispone i pezzi di ogni piatto in righe, poi sposta il gruppo intero al centro del piatto. Sui piatti con più colori lo mette accanto alla zona della torre di spurgo (`placeAvoiding`). Se non c'è posto, i pezzi restano dove sono.

**Pezzi staccati della stessa parte.** I ganci per gli occhiali erano una sola parte con due pezzi disegnati a quote diverse (z 20 e z 26). Stampando la parte da sola, il gancio più alto restava a 6 mm dal piatto: lo slicer lo segnalava come "regioni fluttuanti" e lo reggeva con i supporti per tutta l'altezza. Ora, con le parti separate, ogni pezzo staccato scende sul piatto, a meno che sotto, in pianta, ci sia un altro pezzo (`settleIslands` in `core/geometry/islands.ts`). L'analisi dei supporti misura la parte già sistemata così.

**Per un'altra stampante** si salva un progetto dallo slicer e si copiano in `slicerProfile` i nomi di `printer_model`, `printer_settings_id`, `print_settings_id`, il modello di `filament_settings_id` e `curr_bed_type`. Poi si prova un file esportato nello slicer.

## A chi valgono le correzioni

| Correzione | Ambito | Dove |
|---|---|---|
| Pezzi staccati di una parte sul piatto | tutti gli slicer e le stampanti (anche STL) | `core/geometry/islands.ts`, `app/session.ts` |
| Margine ridotto per i pezzi lunghi quasi quanto il piatto | tutti gli slicer | `nearlyFull` in `threemf.ts` |
| Pezzi al centro del piatto, accanto alla torre di spurgo | tutti gli slicer | `centerShift` in `threemf.ts` |
| Estrusori 1..k sui filamenti usati | tutti gli slicer | `compactExtruders` in `threemf.ts` |
| Struttura del progetto (piatti, oggetti, `model_settings.config`) | famiglia Bambu Studio | `bambu3mf.ts` |
| `project_settings.config` e `slice_info.config` | meccanismo della famiglia Bambu Studio; i nomi dei profili sono della singola stampante | `projectSettings` in `bambu3mf.ts`, `slicerProfile` in `printers.json` |
| Passo tra i piatti | singola stampante (misurato su un file reale) | `plateStride` in `printers.json` |

Oggi solo la Kobra X ha `slicerProfile` e `plateStride` misurati. Per le altre stampanti della famiglia il 3MF resta senza impostazioni di progetto. Se uno slicer sposta gli oggetti fuori dai piatti, si salva un progetto da quello slicer e si aggiungono i due valori come descritto sopra. Senza una prova nello slicer non si inventano i nomi dei profili: un nome sbagliato farebbe comparire avvisi di profilo mancante.

