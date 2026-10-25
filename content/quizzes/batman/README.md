# Batman, la série animée — niveau expert

25 questions en français sur **Batman, la série animée** (_Batman: The Animated Series_, 1992–1995)
et son univers : _The New Batman Adventures_, les films (_Mask of the Phantasm_, _SubZero_,
_Mystery of the Batwoman_), _Batman, la relève_ et _La Ligue des justiciers_. Niveau expert
(doublage VO et VF, coulisses, vrais noms des méchants, chronologie), avec des respirations :
rébus, « Qui a dit ? », deux dessins et une foule de Gotham à fouiller. Durée : 25 à 30 minutes
avec 6 joueurs.

Uniquement ces types : choix multiple, réponse libre, curseur, ordre, point sur l'image,
« Mytho ! » et « Dessine-moi ». Sources de chaque fait : `CREDITS.md`.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/batman <email de l'animateur>
```

## Les questions

| #   | Type              | Thème                                                   | Temps     | Points |
| --- | ----------------- | ------------------------------------------------------- | --------- | ------ |
| 1   | Choix multiple    | Rébus 🎭 + 👻 = quel film ?                             | 20 s      | 1000   |
| 2   | Choix multiple    | Le compositeur du thème du générique                    | 20 s      | 1000   |
| 3   | Réponse libre     | La voix française de Batman                             | 25 s      | 1000   |
| 4   | Curseur           | Le nombre d'épisodes (± 5)                              | 20 s      | 1000   |
| 5   | Dessine-moi       | Un objet de Gotham (Batmobile, batarang…)               | 90 s      | 1000   |
| 6   | Choix multiple    | Le premier épisode de Harley Quinn                      | 20 s      | 1000   |
| 7   | Réponse libre     | Le vrai nom de Harley Quinn                             | 25 s      | 1000   |
| 8   | « Mytho ! »       | Les noms des hyènes de Harley                           | 45 + 20 s | 1000   |
| 9   | Point sur l'image | Dans la foule : le méchant de « Amour on Ice »          | 25 s      | 1000   |
| 10  | Choix multiple    | Le « Dark Deco » : le papier des décors                 | 20 s      | 1000   |
| 11  | Ordre             | Les séries de l'univers par date de diffusion           | 35 s      | 1000   |
| 12  | Choix multiple    | Qui a dit ? « Je suis la vengeance… »                   | 20 s      | 1000   |
| 13  | Réponse libre     | Le vrai nom du Pingouin                                 | 25 s      | 1000   |
| 14  | « Mytho ! »       | Le vrai nom du Ventriloque                              | 45 + 20 s | 1000   |
| 15  | Choix multiple    | Les personnages créés pour la série (3 bonnes réponses) | 25 s      | 1000   |
| 16  | Curseur           | L'année de _Mask of the Phantasm_ (± 1)                 | 20 s      | 1000   |
| 17  | Réponse libre     | L'ancienne fiancée de Bruce dans _Mask of the Phantasm_ | 30 s      | 1000   |
| 18  | Ordre             | Les films par date de sortie                            | 30 s      | 1000   |
| 19  | Point sur l'image | Dans la foule : la policière créée pour la série        | 25 s      | 1000   |
| 20  | Dessine-moi       | Un lieu ou une créature de Gotham                       | 90 s      | 1000   |
| 21  | Choix multiple    | La voix VO de Mr. Freeze                                | 20 s      | 2000   |
| 22  | Réponse libre     | Le nom français de Clayface                             | 25 s      | 1000   |
| 23  | « Mytho ! »       | Le vrai nom de Lock-Up (Double Tour)                    | 45 + 20 s | 2000   |
| 24  | Curseur           | La durée de _Mask of the Phantasm_ (± 4 min)            | 20 s      | 1000   |
| 25  | Ordre             | Finale : la chronologie de la Bat-famille               | 45 s      | 2000   |

Répartition : 7 choix multiple, 5 réponses libres (fautes tolérées), 3 curseurs, 3 ordres,
2 points sur l'image, 3 « Mytho ! », 2 « Dessine-moi ».

## L'image de la foule (questions 9 et 19)

Les deux questions « point sur l'image » utilisent la même image, `images/mosaique.jpg` : les 20
portraits d'avatars de l'application (`apps/web/public/avatars/`) dans une grille de 5 × 4, dans un
ordre mélangé, sans les noms. Elle sert aussi de couverture au quiz. Elle est générée par
`images/make-mosaic.ps1` (Windows PowerShell, toujours la même image) :

```
powershell -ExecutionPolicy Bypass -File content/quizzes/batman/images/make-mosaic.ps1
```

Le script affiche le centre de chaque portrait en fractions de l'image, d'où viennent les zones :

| Question | Personnage à trouver | Case (colonne, ligne) | Zone (`x`, `y`, `radius`) |
| -------- | -------------------- | --------------------- | ------------------------- |
| 9        | Mr. Freeze           | 4e colonne, 2e ligne  | 0,698 · 0,376 · 0,085     |
| 19       | Renee Montoya        | 2e colonne, 3e ligne  | 0,302 · 0,624 · 0,085     |

Un rayon de 0,085 reste à l'intérieur de la case (une case fait 0,19 de large et 0,24 de haut) :
taper sur le bon portrait est juste, taper sur le voisin donne quelques points (« Presque ! »).

**Utiliser votre propre image** (par exemple une affiche de groupe de la série que vous possédez) :
déposez-la dans `images/` (par exemple `images/foule.jpg`), remplacez `images/mosaique.jpg` par
`images/foule.jpg` dans les questions 9 et 19 (et la couverture) de `quiz.json`, ajustez les deux
zones sur votre image (ou plus simplement dans l'éditeur après l'import, en cliquant sur l'image),
puis relancez l'import. Le dossier `images/` a son propre `.gitignore` : votre image reste sur votre
disque et ne part jamais dans git (personnages Warner Bros / DC).

## Comment y jouer

- **Entre amis : « 💀 Survie » + « 🃏 Jokers »**, 3 ❤️. Les questions d'expert éliminent vite :
  les fantômes continuent à jouer et hantent les vivants (Gel, Brouilleur). Les « Mytho ! » ne font
  perdre un cœur qu'à ceux qui ne trouvent pas la vérité ; les « Dessine-moi » ne coûtent jamais de
  cœur.
- **En grand groupe : « Équipes »** (2 à 4) — le score d'équipe est une moyenne, les équipes de
  tailles différentes restent comparables.
- **Jokers** : 🎯 50/50 sur les choix multiples, les curseurs (plage réduite), les réponses libres
  (première lettre) et les « Mytho ! » (la moitié des mensonges) ; pas de 50/50 sur les ordres ni
  les points sur l'image ; aucun joker sur les « Dessine-moi ». 🦜 Copieur et ✖️2 Double ou rien
  sont redoutables sur les questions à 2000 points (21, 23, 25).
- Les « Dessine-moi » désignent le dessinateur à tour de rôle ; le mot n'apparaît que sur son
  téléphone. Chaque liste a 10 mots, jamais deux fois le même dans une partie.
