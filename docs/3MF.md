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
  - parti separate: un piatto per colore (i gruppi stampati già montati restano insieme), più piatti se non ci stanno;
  - campioni di prova: un solo 3MF con un piatto per materiale.
- **Impostazioni per oggetto:** `enable_support`, `support_type`, `support_interface_filament`, `brim_type`, `brim_width` (vedi docs/ANALISI.md).
- **Cosa resta fuori:** `project_settings.config` (profilo stampante, processo, filamenti) e le miniature. Lo slicer usa i profili scelti al momento dell'apertura, quindi il file resta valido per qualsiasi stampante della famiglia. Le chiavi del riferimento sono annotate sopra per un'eventuale aggiunta futura, da provare prima nello slicer.

Il test `tests/bambu3mf.test.ts` controlla che con il passo della Kobra X i 4 cubi finiscano negli stessi punti del progetto di riferimento.
