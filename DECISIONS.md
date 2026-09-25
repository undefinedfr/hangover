# Décisions

- Dépôt : le brief prévoyait `gueule-de-bois`, le projet vit dans `undefinedfr/hangover` (choix de l'utilisateur ; `gh` absent et création de dépôt refusée).
- `erasableSyntaxOnly` retiré du tsconfig généré par Vite pour autoriser les propriétés de paramètres TypeScript ; `strict` activé.
- Rapier : `KinematicCharacterController` sur une capsule cinématique (demi-hauteur 0,5 m, rayon 0,35 m), autostep 0,35 m pour monter les trottoirs, gravité 20 m/s².
- Vitesses : marche 4 m/s, course 6,5 m/s, saut 7,2 m/s.
- Pas fixe physique 60 Hz, au plus 5 pas par image (au-delà le temps de jeu ralentit plutôt que de spiraler).
- `RenderPipeline` (nouveau nom de `PostProcessing` depuis r183) utilisé pour le post-process.
- Tests Playwright : `@playwright/test` 1.56 (Chromium 1194 préinstallé). La variété de couleurs du canvas est mesurée sur la capture d'écran (le canvas WebGL n'a pas de `preserveDrawingBuffer`).
- Le personnage porte une cravate nouée autour de la tête (souvenir de la soirée, ton léger).
- Ville : grille de blocs de 36 m (dalle de trottoir de 0,15 m, lots constructibles de 30 m) séparés par des rues de 10 m ; pas de 46 m. 4×4 / 7×7 / 11×11 blocs selon le mode.
- Types de blocs : immeubles (découpage récursif avec ruelles de 2,6 m), parc (fontaine, bancs, arbres), parking, pavillons, cinéma (hall ouvert à moquette), bloc de départ (parc) et bloc de la maison (pavillon bleu à toit rouge et porte jaune, en bordure de ville, loin du départ).
- Fenêtres des immeubles générées par un shader TSL (motif selon la position monde + hash par fenêtre : reflets du soleil, quelques fenêtres encore allumées). Aucune texture externe.
- Tout le mobilier est en `InstancedMesh` (un appel de dessin par type) avec couleurs de sommet fusionnées.
- Les houppiers des arbres n'ont pas de collision (seul le tronc en a) : la caméra peut les traverser.
- Bords de la ville : haie + murs invisibles ; silhouettes d'immeubles lointaines (sans collision) pour l'horizon.
- Les tests utilisent des attentes « par sondage » (expect.poll) plutôt que des durées fixes : le rendu logiciel SwiftShader tourne à ~5-10 fps et le pas fixe est plafonné.
