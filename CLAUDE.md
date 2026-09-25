# Gueule de bois — brief projet pour Claude Code

## Mode de travail : AUTONOMIE TOTALE

Tu travailles seul, sans poser de question à l'utilisateur, du premier fichier jusqu'au déploiement.

- Ne demande jamais de validation. Quand un choix n'est pas spécifié ici, prends la décision la plus simple et raisonnable, et note-la dans `DECISIONS.md` (une ligne par décision).
- Avance milestone par milestone, dans l'ordre. Ne passe au suivant que quand le précédent passe la « Definition of done ».
- Après chaque milestone :
  1. `npm run build` sans erreur, `npx tsc --noEmit` sans erreur
  2. `npm run test:e2e` vert
  3. commit git : `feat(M<n>): <résumé>`
  4. mise à jour de `PROGRESS.md` (milestone terminé, ce qui marche, limites connues)
- Si tu es bloqué après 3 tentatives sur un point : simplifie (version dégradée qui marche), note-le dans `PROGRESS.md` et continue. Un jeu jouable imparfait vaut mieux qu'un jeu bloqué.
- Si la session est interrompue, reprends en lisant `PROGRESS.md` et `DECISIONS.md`.
- À la toute fin : déploie (section Déploiement) et affiche l'URL jouable.

## Pitch

Jeu navigateur 3D, vue à la 3e personne. Le joueur se réveille sur un banc public après une soirée trop arrosée. Il doit retrouver ses affaires éparpillées dans la ville, récupérer sa voiture et rentrer chez lui. Ton : humour léger, univers low poly coloré, jamais glauque.

## Stack technique (imposée)

- **three.js** avec `WebGPURenderer` (import depuis `three/webgpu`) et **TSL** (`three/tsl`) pour les shaders et le post-processing. Le renderer bascule automatiquement sur WebGL2 si WebGPU est indisponible : ne pas désactiver ce fallback.
- **TypeScript** strict + **Vite**
- **Rapier** (`@dimforge/rapier3d-compat`) pour la physique, les collisions et le character controller (`KinematicCharacterController`)
- **Playwright** pour les tests de fumée
- Aucune dépendance lourde supplémentaire sans raison (pas de moteur de jeu, pas de framework UI : le HUD et les menus sont en HTML/CSS par-dessus le canvas)

L'API TSL évolue vite. Avant d'écrire du TSL, vérifie l'API réelle de la version installée dans `node_modules/three` (exemples dans `node_modules/three/examples/jsm/tsl/` et `examples/jsm/tsl/display/`) au lieu de te fier à ta mémoire.

## Initialisation

```bash
npm create vite@latest . -- --template vanilla-ts
npm i three @dimforge/rapier3d-compat
npm i -D @types/three @playwright/test
npx playwright install chromium
git init
```

`vite.config.ts` : `base: './'` (le build doit fonctionner depuis n'importe quel sous-chemin).

Scripts `package.json` : `dev`, `build`, `preview`, `test:e2e`.

## Architecture

```
src/
  main.ts                 point d'entrée
  core/                   Game, boucle (fixed timestep physique 60 Hz), Input, GameState, RNG seedé
  world/                  CityGenerator, rues, immeubles, props, maison d'arrivée
  player/                 CharacterController, animation procédurale, ThirdPersonCamera
  vehicles/               Vehicle (base), Car, Scooter, Tricycle
  items/                  Item, ItemSpawner, Inventory
  fx/                     DrunkBlur (post-process TSL), titubement
  ui/                     Menu, HUD, écran de fin
  audio/                  sons simples (WebAudio)
  debug/                  hook de test window.__game
tests/                    tests Playwright
```

Tout l'aléatoire passe par un RNG seedé (ex. mulberry32). La seed est lisible dans l'URL (`?seed=1234`) pour reproduire une partie.

## Game design

### Contrôles (desktop)

Utiliser `event.code` (position physique des touches) : ZQSD sur AZERTY et WASD sur QWERTY fonctionnent automatiquement.

| Touche | Action |
|---|---|
| ZQSD / WASD | Déplacement |
| Souris | Caméra (clic = pointer lock, Échap = libérer) |
| Shift | Courir |
| Espace | Sauter |
| E | Ramasser / monter ou descendre d'un véhicule / ouvrir |
| Tab | Afficher l'inventaire |
| Échap | Pause |

### Objets à retrouver

| Objet | Effet quand on le ramasse |
|---|---|
| Lunettes | Supprime le flou |
| Téléphone | Affiche une mini-carte simplifiée dans le HUD |
| Portefeuille | Requis pour gagner (« sans papiers, pas de volant ») |
| Clés de voiture | Permet d'ouvrir et de conduire la voiture |
| Clés de maison | Permet d'ouvrir la porte d'arrivée |
| Voiture | Garée quelque part en ville, verrouillée sans les clés |

Condition de victoire : avoir lunettes, portefeuille, clés de voiture et clés de maison, arriver en voiture devant la maison, puis ouvrir la porte (E).

Chaque objet ramassable : petit modèle procédural reconnaissable, légère rotation et flottement, halo discret selon le mode. Message d'humour court dans le HUD à chaque ramassage (ex. « Tes lunettes étaient dans une poubelle. Classique. »), une réplique différente par objet.

### Mécaniques clés

- **Flou « gueule de bois »** : tant que les lunettes ne sont pas trouvées, tout ce qui est à plus de ~3 m du joueur est flou. Post-process TSL : rendu de la scène, version floutée (gaussian blur), mélange selon la distance au joueur (via la profondeur). Transition douce quand on met les lunettes (~1 s).
- **Voiture verrouillée** : E devant la voiture sans les clés → message « C'est fermé. Évidemment. ». Avec les clés : on monte, conduite arcade simple (accélérer, freiner, tourner, collisions avec les immeubles).
- **Véhicules rapides à pied** : une trottinette et un tricycle sont posés en ville. Montée / descente avec E. Trottinette : 2× la vitesse de marche. Tricycle « façon Shining » : un peu plus lent que la trottinette, pédalage animé, bruit de roulement sur le sol ; sur les sols de type moquette (intérieurs éventuels) le bruit s'arrête. Ambiance clin d'œil uniquement, aucune référence visuelle directe au film.
- **Titubement** : légère dérive latérale aléatoire du déplacement à pied (intensité selon le mode), qui diminue quand on a trouvé le téléphone et le portefeuille (« tu reprends tes esprits »).

### Modes de difficulté

| | Facile (~5 min) | Normal (~15 min) | Hardcore (30 min et +) |
|---|---|---|---|
| Taille de la ville | 4×4 blocs | 7×7 blocs | 11×11 blocs |
| Objets | lunettes, clés de voiture, clés de maison, voiture | tous | tous |
| Halo sur les objets | visible de loin | visible à < 15 m | aucun |
| Flou sans lunettes | léger | normal | fort, rayon net ~1,5 m |
| Titubement | faible | moyen | fort |
| Mini-carte du téléphone | objets restants indiqués | position voiture + maison seulement | pas de mini-carte |
| Objets cachés | au sol, en évidence | derrière des props | dans des recoins, sous des bancs, dans des poubelles |

En facile, le portefeuille n'est pas requis pour gagner.

Chrono affiché en haut. Écran de fin : temps, mode, seed, bouton « Rejouer » (nouvelle seed) et « Même ville » (même seed). Meilleurs temps par mode sauvegardés en `localStorage` (entouré de try/catch).

### Direction artistique

- Low poly procédural, formes simples, couleurs saturées mais douces. Tout est généré par code (aucun asset externe requis).
- Ville : grille de rues avec trottoirs, immeubles de hauteurs et couleurs variées avec fenêtres, lampadaires, bancs, poubelles, arbres, voitures garées (décor), passages piétons.
- Lumière de petit matin (soleil bas, ciel légèrement orangé, ombres longues) : c'est le lendemain.
- Personnage : silhouette simple (capsule + tête + bras/jambes), animation de marche procédurale.
- Performances : cible 60 fps sur un laptop récent. Instancing (`InstancedMesh`) pour les éléments répétés, ombres limitées à une zone autour du joueur.

### Audio (simple)

WebAudio, sons synthétisés ou générés procéduralement : pas, ramassage d'objet (petit jingle), moteur de voiture, roulement du tricycle, ambiance ville lointaine. Bouton mute dans le HUD. L'audio démarre après la première interaction utilisateur.

### UI

- Menu d'accueil : titre « Gueule de bois », choix du mode, rappel des contrôles, bouton Jouer.
- HUD : chrono, icônes des objets (grisées tant que non trouvées), messages contextuels (« E pour ramasser »), mini-carte si téléphone.
- Interface en français.
- Si le navigateur ne supporte ni WebGPU ni WebGL2 : message clair au lieu d'un écran noir.

## Hook de test

En dev et en build, exposer `window.__game` en lecture avec au minimum : `state` (`menu` | `playing` | `won`), `mode`, `seed`, `inventory` (liste des objets), `player.position`, `inVehicle`, `fps`. Exposer aussi `window.__game.debug.teleportTo(itemName)` et `window.__game.debug.startGame(mode, seed)` pour les tests.

## Tests Playwright (fumée)

Chromium headless avec rendu logiciel : `args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']`. Tester sur le build (`vite preview`), pas sur le serveur de dev.

Tests minimum :
1. La page charge sans erreur console, le menu s'affiche.
2. `startGame('facile', 42)` → `state === 'playing'`, le canvas n'est pas vide (capture d'écran enregistrée dans `tests/screenshots/`).
3. Appui prolongé sur la touche avant → la position du joueur change.
4. Téléportation sur chaque objet + E → l'inventaire se remplit.
5. Scénario complet en facile via les hooks debug → `state === 'won'`.

Regarde les captures d'écran générées pour vérifier visuellement le rendu (flou présent sans lunettes, absent après).

## Milestones

**M1 — Socle.** Init, renderer WebGPU avec fallback, boucle de jeu, sol, ciel, lumière du matin, perso contrôlable avec Rapier, caméra 3e personne avec collisions caméra/murs, hook `window.__game`, premier test Playwright.
Done : on marche, on court, on saute, on ne traverse pas les obstacles.

**M2 — Ville.** Générateur de ville seedé selon la taille du mode, rues, immeubles avec colliders, props, instancing, maison d'arrivée.
Done : ville complète, 60 fps en facile et normal sur la machine de dev, pas de trou dans les collisions.

**M3 — Objets et inventaire.** Placement seedé des objets selon le mode, ramassage, HUD inventaire, messages d'humour, halo selon le mode.
Done : test 4 vert.

**M4 — Flou et titubement.** Post-process TSL de flou selon la distance, transition au ramassage des lunettes, titubement.
Done : captures avant/après lunettes visiblement différentes.

**M5 — Véhicules.** Voiture verrouillée / clés / conduite, trottinette, tricycle.
Done : on peut monter, conduire et descendre de chaque véhicule sans rester coincé.

**M6 — Boucle de jeu complète.** Menu, 3 modes, chrono, condition de victoire, écran de fin, meilleurs temps, mini-carte du téléphone, pause.
Done : test 5 vert, une partie facile se termine en environ 5 minutes.

**M7 — Polish.** Audio, animations, équilibrage des modes, écran d'erreur navigateur, favicon, titre de page, balises meta (titre, description, image de partage générée par capture).
Done : tous les tests verts, aucune erreur console.

**M8 (bonus, seulement si tout le reste est fini) — Mobile.** Joystick virtuel à gauche, zone de caméra à droite, bouton d'action. Détecter le tactile et adapter le HUD.

## Déploiement

Objectif : une URL publique jouable, déployée automatiquement.

1. Vérifier `gh auth status`.
2. Si `gh` est authentifié :
   - `gh repo create gueule-de-bois --public --source=. --push`
   - créer `.github/workflows/deploy.yml` : sur push `main` → `npm ci`, `npm run build`, déploiement de `dist/` avec `actions/upload-pages-artifact` et `actions/deploy-pages`
   - activer Pages en mode workflow : `gh api -X POST repos/{owner}/gueule-de-bois/pages -f build_type=workflow` (ignorer l'erreur si déjà activé)
   - pousser, attendre la fin du workflow (`gh run watch`), puis vérifier que l'URL répond (HTTP 200)
   - afficher l'URL finale : `https://<owner>.github.io/gueule-de-bois/`
3. Si `gh` n'est pas authentifié : ne pas bloquer. Lancer `npm run build && npx vite preview --host --port 4173`, afficher l'URL locale, et écrire dans `PROGRESS.md` les deux commandes à lancer pour publier plus tard (`gh auth login` puis relancer la section Déploiement).

## Livrables finaux

- Jeu jouable à l'URL publique (ou en local à défaut)
- `README.md` : pitch, contrôles, modes, commandes, lien de démo, capture d'écran
- `PROGRESS.md` et `DECISIONS.md` à jour
- Message final dans le terminal : URL, résumé de ce qui est fait, limites connues
