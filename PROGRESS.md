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
