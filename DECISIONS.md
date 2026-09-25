# Décisions

- Dépôt : le brief prévoyait `gueule-de-bois`, le projet vit dans `undefinedfr/hangover` (choix de l'utilisateur ; `gh` absent et création de dépôt refusée).
- `erasableSyntaxOnly` retiré du tsconfig généré par Vite pour autoriser les propriétés de paramètres TypeScript ; `strict` activé.
- Rapier : `KinematicCharacterController` sur une capsule cinématique (demi-hauteur 0,5 m, rayon 0,35 m), autostep 0,35 m pour monter les trottoirs, gravité 20 m/s².
- Vitesses : marche 4 m/s, course 6,5 m/s, saut 7,2 m/s.
- Pas fixe physique 60 Hz, au plus 5 pas par image (au-delà le temps de jeu ralentit plutôt que de spiraler).
- `RenderPipeline` (nouveau nom de `PostProcessing` depuis r183) utilisé pour le post-process.
- Tests Playwright : `@playwright/test` 1.56 (Chromium 1194 préinstallé). La variété de couleurs du canvas est mesurée sur la capture d'écran (le canvas WebGL n'a pas de `preserveDrawingBuffer`).
- Le personnage porte une cravate nouée autour de la tête (souvenir de la soirée, ton léger).
