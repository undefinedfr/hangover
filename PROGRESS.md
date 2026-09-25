# Avancement

## M1 — Socle ✅
- Renderer `WebGPURenderer` (fallback WebGL2 automatique conservé), boucle à pas fixe 60 Hz, ciel dégradé de petit matin, soleil bas avec ombres longues qui suivent le joueur.
- Personnage low poly (capsule + tête + bras/jambes) contrôlé par le `KinematicCharacterController` de Rapier : marche, course (Shift), saut (Espace), collisions.
- Caméra 3e personne à la souris (pointer lock au clic), perche raccourcie par lancer de rayon quand un mur s'interpose.
- Hook `window.__game` (state, mode, seed, inventory, player.position, inVehicle, fps, debug.startGame / teleportTo).
- Tests Playwright : chargement sans erreur, rendu non vide, déplacement, saut.

Limites connues : arène provisoire (remplacée par la ville en M2).
