# Avancement

## M1 — Socle ✅
- Renderer `WebGPURenderer` (fallback WebGL2 automatique conservé), boucle à pas fixe 60 Hz, ciel dégradé de petit matin, soleil bas avec ombres longues qui suivent le joueur.
- Personnage low poly (capsule + tête + bras/jambes) contrôlé par le `KinematicCharacterController` de Rapier : marche, course (Shift), saut (Espace), collisions.
- Caméra 3e personne à la souris (pointer lock au clic), perche raccourcie par lancer de rayon quand un mur s'interpose.
- Hook `window.__game` (state, mode, seed, inventory, player.position, inVehicle, fps, debug.startGame / teleportTo).
- Tests Playwright : chargement sans erreur, rendu non vide, déplacement, saut.



## M2 — Ville ✅
- Générateur seedé (`?seed=`) : rues avec marquages et passages piétons, trottoirs, immeubles colorés à fenêtres procédurales, parcs, parkings, pavillons, cinéma, maison d'arrivée, voitures garées, lampadaires, bancs, poubelles, arbres, bouches d'incendie.
- Colliders Rapier pour tous les bâtiments et le mobilier ; murs invisibles en bordure.
- Instancing systématique ; ombres limitées à 90 m autour du joueur.
- Tests : pas de traversée des façades, génération normale (7×7) et hardcore (11×11).

Limites connues : le 60 fps ne peut pas être mesuré dans l'environnement de dev (pas de GPU, rendu logiciel ~10 fps) ; la conception (instancing, ombres locales) vise un laptop récent.

## M3 — Objets et inventaire ✅
- Modèles procéduraux : lunettes, téléphone, portefeuille, clés de voiture (télécommande), clés de maison (porte-clés maison). Flottement, rotation, halo selon le mode.
- Placement seedé selon le mode (évidence / derrière des props / recoins).
- Ramassage avec E (invite « E Ramasser : … »), message d'humour par objet, icônes grisées puis colorées, panneau d'inventaire (Tab), chrono.
- Test 4 vert (facile et normal).

## M4 — Flou et titubement ✅
- Post-process TSL : net dans un rayon autour du joueur (4 m / 3 m / 1,5 m selon le mode), flou au-delà ; transition d'environ 1 s quand on ramasse les lunettes.
- Titubement (dérive latérale + roulis), qui diminue quand on reprend ses esprits.
- Test : captures avant/après lunettes (`tests/screenshots/blur-*.png`) avec mesure de netteté (≈ ×2,5).

## M5 — Véhicules ✅
- Voiture verrouillée (« C'est fermé. Évidemment. »), puis conduite arcade avec les clés (accélérer, freiner, marche arrière, frein à main Espace, collisions avec les immeubles et les voitures garées).
- Trottinette (2× la marche) et tricycle (pédalage animé, détection du sol moquette pour le son en M7).
- Montée / descente avec E, sans rester coincé (tests).

## M6 — Boucle de jeu complète ✅
- Menu d'accueil (titre, 3 modes avec records, rappel des contrôles, bouton Jouer) sur fond de ville animée.
- Chrono, pause (Échap / bouton), condition de victoire (objets + arrivée en voiture + porte), écran de fin (temps, mode, seed, record, Rejouer / Même ville / Menu), meilleurs temps en localStorage.
- Mini-carte du téléphone selon le mode.
- Test 5 vert (scénario complet facile), tests pause et mini-carte.

## M7 — Polish ✅
- Audio synthétisé (pas, ramassage, moteur, roulement du tricycle, ambiance), bouton muet + touche M.
- Animations : « pop » au ramassage, respiration au repos, tête qui dodeline, lunettes sur le nez.
- Écran navigateur non supporté, écran de chargement, favicon SVG, titre, meta description / Open Graph / Twitter, image de partage générée par capture.
- README avec captures.
- 19 tests verts, aucune erreur console.

## M8 (bonus) — Mobile ✅
- Joystick virtuel, zone caméra, boutons d'action ; HUD adapté (mini-carte à gauche, invites sans touche E, aide tactile dans le menu).
- Test Playwright en émulation Pixel 7.

## Déploiement
- Workflow `.github/workflows/deploy.yml` poussé. Le build passe sur GitHub Actions, mais le premier run a échoué à l'étape `configure-pages` : **GitHub Pages n'est pas encore activé sur le dépôt**.
- Pour publier : dépôt `undefinedfr/hangover` → Settings → Pages → Source : **GitHub Actions**, puis Actions → « Déploiement GitHub Pages » → Run workflow. URL attendue : https://undefinedfr.github.io/hangover/
- `gh` n'est pas disponible dans l'environnement de dev ; avec `gh auth login`, l'équivalent est : `gh api -X POST repos/undefinedfr/hangover/pages -f build_type=workflow` puis `gh workflow run deploy.yml`.
- En local : `npm run build && npx vite preview --host --port 4173`.

## Limites connues
- 60 fps non mesurable ici (pas de GPU, rendu logiciel ~10 fps) : la conception vise un laptop récent (instancing, ombres locales, flou désactivé une fois les lunettes trouvées).
- Pas de circulation ni de piétons ; les houppiers des arbres n'ont pas de collision (la caméra peut les traverser).
- Durée « ~5 min » du mode facile estimée à partir des distances (≈ 400 m à pied + 150 m en voiture sur 5 seeds), pas chronométrée en jeu réel.
- La mini-carte est orientée nord (elle ne tourne pas avec la caméra).

## Retours de test (itération 2)
- ✅ Mini-carte : plus aucun objet affiché (voiture + maison seulement).
- ✅ Lunettes à moins de ~38 m du banc de départ.
- ✅ Flou sans lunettes beaucoup plus fort (deux passes gaussiennes, zone nette réduite, couleurs délavées au loin).
- ✅ Refonte artistique « Paris au petit matin » : façades haussmanniennes et faubourgs procédurales, toits mansardés, balcons, stores, mobilier parisien, platanes, voitures arrondies, sols texturés, nuages, personnage détaillé, maison bleue, AO + étalonnage.
- ✅ Réglage « Graphismes : détaillés / légers » dans le menu (AO, résolution, distance de vue, bruits procéduraux).
- ✅ Chargement : pré-compilation des shaders et premier rendu derrière l'écran « Réveil en cours… » (plus d'à-coups au premier regard).
- Performance : ~0,3 M triangles dessinés par image en facile, ~0,5 M en normal, ~0,85 M en hardcore (ombres comprises), 240 à 520 appels de dessin grâce au découpage en tuiles.

Limites connues (mises à jour) :
- Les tests tournent en rendu logiciel (SwiftShader, qualité « légers », 960×540) : chaque démarrage de partie y coûte 10 à 30 s de compilation côté processus GPU, la suite complète prend ~30 min. Sur un vrai GPU le chargement est de l'ordre de la seconde.
