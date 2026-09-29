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
- Cachettes générées par la ville et typées : `open` (trottoir, allées, parking), `behind` (derrière banc, arbre, buisson, haie, voiture garée), `nook` (sous un banc, dans une poubelle, fond de ruelle, fond du hall du cinéma, entre deux voitures). Facile → open, normal → behind, hardcore → nook.
- Espacement minimal entre objets ≈ ¼ de la taille de la ville (assoupli si besoin), rien à moins de 12 m du départ ni 20 m de la porte ; les lunettes restent dans les 80 % du rayon autour du départ.
- Le message de ramassage combine une réplique par objet et la cachette (« Tes lunettes étaient dans une poubelle du trottoir. Classique. »).
- Halo : disque additif + colonne de lumière ; portée « infinie » en facile, 15 m en normal (fondu), aucun en hardcore.
- Icônes HUD en SVG inline (pas d'emoji, rendu identique partout).
- Ombres : bias -0,001 / normalBias 0,08 pour supprimer l'acné d'ombre sur les façades rasantes.
- Hash des fenêtres sans la coordonnée de profondeur de la façade (instable quand elle tombe sur un entier).
- `teleportTo(objet)` place le joueur sur une position libre à ~1 m de l'objet (test de chevauchement de capsule).
- Flou : `pass()` → `gaussianBlur` (demi-résolution, rayon selon le mode) ; distance au joueur reconstruite par `getViewPosition` depuis la profondeur de la passe, mélange par `smoothstep(rayonNet, rayonNet + fondu)`. Ajout d'un léger dédoublement ondulant et d'une vignette, proportionnels au flou. Une fois net, la sortie du pipeline redevient la passe de scène seule (coût nul).
- Titubement : dérive latérale (somme de sinus déphasés par la seed) proportionnelle à la vitesse + roulis du buste + léger roulis caméra. Réduit à 30 % quand téléphone + portefeuille sont trouvés (en facile, où ils n'existent pas : avec les lunettes).
- Les lunettes apparaissent sur le visage du personnage une fois ramassées.
- Véhicules : corps cinématiques Rapier (round cuboid) déplacés par leur propre `KinematicCharacterController` (autostep 0,32 m pour les trottoirs, glissement le long des murs, perte de vitesse au choc). Une rotation qui ferait chevaucher le décor est refusée (test d'intersection).
- Vitesses max : voiture 17 m/s (~60 km/h), trottinette 8 m/s (2× la marche), tricycle 7 m/s.
- En normal/hardcore, la voiture refuse de démarrer sans portefeuille (« Sans papiers, pas de volant »). La voiture entre dans l'inventaire au premier démarrage.
- Descente : on teste des positions libres (côtés, arrière, avant) avec la capsule du joueur ; en dernier recours on dépose le joueur sur le toit.
- En véhicule, la caméra se replace derrière après 0,8 s sans mouvement de souris.
- Le tricycle démarre dans le hall moquetté du cinéma (clin d'œil, sans référence visuelle directe).
- La voiture du joueur est turquoise avec un cône de chantier sur le toit, pour qu'on la reconnaisse.
- Facile ne contient pas de téléphone parmi les objets : on considère qu'il est déjà dans ta poche, la mini-carte (objets restants + voiture + maison) est donc active dès le départ. Normal : mini-carte voiture + maison après le téléphone. Hardcore : le téléphone ne sert à rien (écran fissuré, 1 %).
- Mini-carte orientée nord (z vers le bas), carte de la ville pré-rendue dans un canvas hors écran, rayon 55 m, marqueurs rabattus sur le bord quand ils sont loin.
- Victoire : il faut les objets requis, être arrivé en voiture à moins de 14 m devant la maison (drapeau conservé ensuite), puis ouvrir la porte avec E. Chaque manque a son message.
- Menu : la ville de démonstration (facile, seed 20240 ou celle de l'URL) tourne en fond, floutée. `?seed=` et `?mode=` pré-remplissent la première partie ; l'URL est mise à jour à chaque partie.
- Pause : Échap (ou perte du pointer lock, ou bouton ❚❚). Le chrono compte le temps de jeu (pas fixe), donc il s'arrête en pause.
- Meilleurs temps par mode dans `localStorage` (clé `gueule-de-bois.best.v1`), lecture et écriture protégées par try/catch.
- Durées estimées (chemin optimal connu, 5 seeds) : facile ≈ 400 m à pied + 150 m en voiture ; normal ≈ 1 km + 400 m ; hardcore ≈ 1,6 km + 500 m, à multiplier par la recherche.
- Audio 100 % WebAudio : pas (bruit filtré, étouffé sur moquette), jingle d'arpège au ramassage, moteur (dents de scie désaccordées, régime selon la vitesse), roulement du tricycle/trottinette (bruit en bande, coupé sur la moquette) avec grincement de pédalier, rumeur de ville + oiseaux du matin + klaxon lointain. Contexte créé à la première interaction ; état « muet » mémorisé.
- Écran d'erreur : si ni `navigator.gpu` ni WebGL2 → message « Ton navigateur a encore plus mal au crâne que toi » ; si l'initialisation du renderer échoue → second message explicite.
- Image de partage générée par capture Playwright (`npm run capture`) : `public/og-image.png` (1200×630, menu sur la ville floutée) ; captures du README dans `docs/`.
- Déploiement : workflow GitHub Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`) ; l'activation de Pages (Source : GitHub Actions) doit être faite une fois dans les réglages du dépôt (pas de `gh` ici).
- Mobile : détection par `ontouchstart` / `maxTouchPoints` / `pointer: coarse`. Joystick flottant (apparaît sous le doigt) sur les 45 % gauche, glisser pour la caméra sur les 55 % droits, boutons Sac / Courir (bascule) / Saut / Action (E, pulse quand une interaction est possible). Résolution limitée à 1,5× et FOV 78° en portrait.
- Retours de test : la mini-carte n'affiche plus jamais les objets (voiture + maison seulement) ; les lunettes sont à moins de ~38 m du banc de départ ; flou nettement plus fort (deux passes gaussiennes chaînées à demi-résolution, rayon par mode 3,2 / 4,5 / 6,5, zone nette 3 / 2,4 / 1,5 m, couleurs délavées au loin).
- Tests : attente de l'invite d'interaction avant d'appuyer sur E, et historique des messages dans le hook (`messages`, `prompt`) pour éviter les tests instables.

## Refonte artistique : « Paris au petit matin »
- Direction choisie pour sortir du « tout carré, tout rond » : une ville parisienne stylisée, cohérente avec le ton français du jeu.
- Immeubles : façades 100 % procédurales en TSL, alignées sur les arêtes de chaque bâtiment grâce à des attributs d'instance (taille, couleur, style, graine, couleur d'accent). Deux styles : haussmannien (pierre de taille, refends au rez-de-chaussée, portes-fenêtres à garde-corps en fer forgé, bandeaux) et faubourg (enduit pastel, volets colorés à persiennes). Devantures peintes (vert, bordeaux, bleu nuit…) avec bandeau d'enseigne.
- Architecture en géométrie fusionnée : corniches, bandeau d'entresol, balcons filants au 2e et au dernier étage (garde-corps en alpha-to-coverage), toits mansardés en zinc avec lucarnes alignées sur les travées, souches de cheminée avec mitrons, toits de tuiles à quatre pans pour les faubourgs, stores bannes rayés sur les devantures côté rue.
- Mobilier parisien : candélabres à lanterne, bancs Davioud (fonte + lattes vertes), poubelles « Vigipirate » (cerceau + sac), potelets, colonnes Morris avec affiches générées, fontaines Wallace, grilles d'arbre, platanes à l'écorce marbrée et houppier en bouquets bosselés, buis taillés.
- Voitures : carrosserie extrudée à partir d'un profil arrondi (biseautée), vitres, pare-chocs chromés, phares ronds, jantes ; teintes sourdes (crème, bleu pâle, vert anglais, rouge, gris…). La voiture du joueur garde sa couleur turquoise et son cône.
- Sol : trottoir en dalles décalées, bordures en granit, caniveaux pavés, enrobé avec rapiéçages, allées de parc en gravier, pelouses tondues en bandes, grande fontaine à vasques.
- Personnage : chemise hawaïenne (motif TSL), jean, baskets, cheveux en bataille, nez rougi, cernes, bracelet fluo de soirée, cravate nouée autour du front.
- Maison d'arrivée : « la maison bleue » (clin d'œil), volets, jardinières fleuries, marquise vitrée, porte jaune, plaque de rue émaillée.
- Bords de ville : rangée continue d'immeubles de l'autre côté de la dernière rue (décor sans collision) au lieu de la haie et des silhouettes roses.
- Rendu : occlusion ambiante GTAO (demi-résolution, lissée), étalonnage (ombres légèrement lavande, hautes lumières dorées, +12 % de saturation, vignette légère), nuages procéduraux dans le ciel, PCF d'ombre déterministe 3×3 (le filtre par défaut de three.js utilise un bruit par pixel qui donnait du grain sur les vitres), motifs fins atténués selon `fwidth` (pas de moiré au loin).
- Performance : les instances et l'architecture sont découpées en tuiles de 64 m (culling caméra et ombre possible) ; modèles allégés. En mode normal on passe de ~2,3 M à ~0,35 M triangles dessinés par image (ombres comprises).

## Refonte 2 : quartier pavillonnaire en plein jour (référence fournie)
- Nouvelle direction demandée à partir d'une capture de référence : banlieue résidentielle, lumière de jour, caméra proche derrière le personnage. La refonte « Paris » est remplacée (le code parisien inutilisé a été retiré).
- Rendu : soleil plus haut (~40°), lumière neutre légèrement chaude, ciel bleu avec nuages blancs, brouillard bleuté, étalonnage sobre (saturation +6 %). Caméra à pied à 3,9 m, légèrement au-dessus des épaules, FOV 60°.
- Rues : double ligne jaune continue, passages piétons « échelle », bordure béton, bande d'herbe entre bordure et trottoir (arbres, poteaux, boîtes aux lettres, bornes d'incendie), trottoir en béton à joints.
- Poteaux électriques en bois (traverse, isolateurs, transformateurs, lampadaires « cobra » un poteau sur deux) sur deux côtés de chaque îlot, reliés par des fils à flèche parabolique (un seul `LineSegments` pour toute la ville).
- Îlots pavillonnaires : deux rangées de maisons dos à dos (2 lots de 15 m par rangée), maisons à 1 ou 2 niveaux en bardage à clin ou en brique (shaders TSL), toit à deux pans en bardeaux avec débord et pignons, fenêtres à encadrement blanc (volets une fois sur deux), porche avec poteaux et auvent, cheminée, garage accolé à porte sectionnelle, allée de garage et allée piétonne en béton, boîte aux lettres, poubelles à roulettes, clôture à piquets ou haie devant, palissade grise derrière et entre les jardins.
- Petit centre commerçant (îlots proches du centre) : façades en brique (style 2 du shader de façade) avec devantures, stores, toit plat à acrotère, climatiseurs et réservoirs d'eau ; le cinéma est dans ce style.
- Arbres : tronc + branches + houppier en ~44 cartes de feuilles croisées (feuilles découpées en alpha-to-coverage, normales sphériques pour un éclairage doux), teinte par instance.
- Maison d'arrivée : pavillon bleu à porte jaune, volets blancs, toit rouge sombre, avec une pancarte « MAISON — Enfin. » dans le jardin.
- Bords de ville : le quartier continue en décor (maisons sans collision de l'autre côté de la dernière rue).
- Cachettes adaptées : boîtes aux lettres, poubelles à roulettes, bornes d'incendie, haies, allées de garage, jardins de derrière.

## Personnage (itération 5) : modèle humain réaliste MakeHuman
- **Écart assumé à la règle « aucun asset externe »** (demande explicite : « un personnage beaucoup plus réaliste », option « modèle 3D externe » choisie). Le reste du jeu reste 100 % procédural.
- Source : données système de [MakeHuman](http://www.makehumancommunity.org/) (maillage de base, squelette par défaut, poids, cibles de morphing, peau, yeux, sourcils, cils, chaussures), sous licence **CC0** depuis la v1.1. Rien n'est versionné à part le résultat : `scripts/character/fetch_assets.sh` télécharge `makehuman-data` (npm) et `targets.npz` (paquet PyPI `makehuman`) dans `.cache/`, et `scripts/character/build_hero.py` (numpy) écrit `public/models/hero.glb` (~3,5 Mo, 163 os, ~43 k triangles). Commande : `npm run build:hero`.
- Morphologie : homme jeune, 1,81 m, un peu de ventre, cou épais.
- Squelette sans rotation de repos (pivot au joint) : l'animation reste procédurale (`HeroPose` : cuisses, genoux, chevilles, colonne, tête, bras). Les bras de la pose en A sont réorientés vers une direction cible (`setFromUnitVectors`).
- Vêtements générés dans le script en décalant des régions du corps le long des normales lissées (ils suivent donc les poids du corps) : sweat jusqu'aux poignets, col ample, capuche relevée (tête lissée sans oreilles ni nez, ouverture ovale du visage, bord roulotté en tube), caleçon, chaussettes dépareillées. Chaussures : proxies MakeHuman (basket à gauche, chaussure de ville à droite, une seule de chaque paire).
- Matériaux TSL dans `HeroModel.ts` : sweat chiné avec côtes, poche kangourou et vomi (coulures, bord humide, morceaux), chaussette rayée, caleçon à pois, peau avec barbe de trois jours, cernes et crâne rasé sous la capuche. Tutu (trois couches de tulle) et éclaboussure sur la basket ajoutés à l'exécution via des ancres du glb (`anchor_tutu`, `anchor_glasses`).
- Le modèle est préchargé dans `Game.init()` puis cloné (`SkeletonUtils.clone`) à chaque partie.

## Lunettes cassées
- Modèle dédié (`src/items/glasses.ts`) à l'échelle réelle, partagé entre l'objet au sol (agrandi ×5,5 pour rester lisible) et les lunettes portées (ancre `anchor_glasses` du héros).
- Monture pantos en acétate écaille (bruit TSL), charnières métalliques, verre gauche intact et transparent, verre droit fêlé en étoile (rayons irréguliers + arcs concentriques calculés en TSL, plus opaques et rugueux sur les fissures).
- Traces de la soirée : pont réparé au ruban adhésif, branche gauche tordue vers le bas et l'extérieur, face avant vrillée et monture de travers.

## Écran de chargement
- Affiché avant tout téléchargement (styles et script en ligne dans `index.html`) pour qu'on voie tout de suite que le jeu charge.
- Progression réelle pendant le téléchargement : au build, un plugin Vite injecte `window.__BOOT_FILES` (url + taille décompressée de chaque fichier) à la place de la balise du module ; le script en ligne télécharge ces fichiers en flux (octets comptés), puis ajoute le module, relu depuis le cache HTTP. En développement, le module se charge normalement.
- 60 % de la barre pour le téléchargement, puis des jalons posés par le jeu (`window.__boot` : `set`, `creep`, `done`). Les étapes sans mesure (compilation des shaders) avancent de façon asymptotique vers le jalon suivant ; le temps restant est extrapolé du rythme observé.
