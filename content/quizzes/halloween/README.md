# Halloween — les secrets les mieux gardés

25 questions en français, **très difficiles**, sur ce qu'on ne sait pas d'Halloween : les fêtes
des morts du monde entier, les légendes et les fantômes, les vraies chasses aux sorcières. Pas de
« que disent les enfants à la porte ? » : il faut connaître Odilon de Cluny, le getai de
Singapour ou Pierre de Lancre. Quelques questions plus légères pour respirer (rébus, dessins),
finale à 2000 points. Durée : 25 à 30 minutes avec 6 joueurs.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/halloween <email de l'animateur>
```

Sources de chaque réponse et crédit du tableau : `CREDITS.md`.

## Les questions

Types utilisés : QCM, réponse libre, curseur, remettre dans l'ordre, point sur l'image,
« Mytho ! » et « Dessine-moi » (aucun autre).

| #   | Type                  | Thème                                                | Temps     | Points |
| --- | --------------------- | ---------------------------------------------------- | --------- | ------ |
| 1   | QCM                   | Rébus 🔥 + ⭕ (le chaudron de Macbeth)               | 20 s      | 1000   |
| 2   | Réponse libre         | Stingy Jack et sa lanterne… en navet                 | 25 s      | 1000   |
| 3   | QCM (3 bonnes rép.)   | Les fêtes des morts du monde (Obon, Zhongyuan, Gede) | 25 s      | 1000   |
| 4   | « Mytho ! »           | La fleur des morts mexicaine (cempasúchil)           | 45 + 20 s | 1000   |
| 5   | Curseur               | Le mois lunaire de la fête des fantômes              | 20 s      | 1000   |
| 6   | Point sur l'image     | Bruegel : le squelette à la vielle à roue            | 30 s      | 1000   |
| 7   | QCM                   | Qui a dit ? « Nature les fait sorcières » (Michelet) | 20 s      | 1000   |
| 8   | Remettre dans l'ordre | De la Toussaint à « trick or treat » (609 → 1917)    | 45 s      | 1000   |
| 9   | Dessine-moi           | Une créature de la nuit                              | 90 s      | 1000   |
| 10  | Réponse libre         | Le traité de Heinrich Kramer (Malleus Maleficarum)   | 30 s      | 1000   |
| 11  | QCM                   | Le getai de Singapour : les places des fantômes      | 20 s      | 1000   |
| 12  | Curseur               | Les pendus de Salem (± 2)                            | 25 s      | 1000   |
| 13  | « Mytho ! »           | Qui devient l'Ankou en Bretagne ?                    | 45 + 20 s | 1000   |
| 14  | QCM                   | La brioche des filleuls à la Toussaint en Autriche   | 20 s      | 1000   |
| 15  | Réponse libre         | Le lwa de la Fèt Gede haïtienne (Baron Samedi)       | 30 s      | 1000   |
| 16  | Remettre dans l'ordre | Walpurgis, Lémuries, Día de Muertos… au calendrier   | 40 s      | 1000   |
| 17  | Point sur l'image     | Bruegel : l'homme au damier caché sous la table      | 30 s      | 2000   |
| 18  | QCM                   | Les « Dziady » et leur poète (Mickiewicz)            | 20 s      | 1000   |
| 19  | Réponse libre         | L'auteur des « Sorcières de Salem » (Arthur Miller)  | 25 s      | 1000   |
| 20  | Dessine-moi           | Un objet d'Halloween                                 | 90 s      | 1000   |
| 21  | Curseur               | L'année de la mort de Houdini, un 31 octobre (± 3)   | 20 s      | 1000   |
| 22  | « Mytho ! »           | Les derniers mots de Giles Corey                     | 45 + 20 s | 2000   |
| 23  | QCM                   | Le juge de la chasse aux sorcières du Labourd        | 25 s      | 2000   |
| 24  | Réponse libre         | Le fantôme mexicain des rivières (La Llorona)        | 25 s      | 1000   |
| 25  | Remettre dans l'ordre | Finale : cinq procès de sorcellerie, de 1610 à 1782  | 45 s      | 2000   |

Bilan : 7 QCM, 5 réponses libres (fautes de frappe tolérées, plusieurs orthographes acceptées),
3 curseurs, 3 « remettre dans l'ordre », 2 points sur l'image, 3 « Mytho ! », 2 « Dessine-moi ».

## Le tableau des questions 6 et 17

Les deux « point sur l'image » se jouent sur **_Le Triomphe de la Mort_ de Pieter Bruegel
l'Ancien** (vers 1562, musée du Prado), une armée de squelettes qui envahit le monde des vivants :
des centaines de personnages, l'idéal pour chercher. Œuvre du domaine public, reproduction
Wikimedia Commons (voir `CREDITS.md`). Sur ce type de question, les téléphones reçoivent l'image
et chacun touche l'endroit voulu.

- **Question 6** — le squelette assis sur la charrette de crânes, à gauche, qui joue de la
  vielle à roue (zone : `x 0,12 · y 0,655 · rayon 0,045`).
- **Question 17** — l'homme en habit à damier rouge et blanc qui se cache sous la table du
  banquet, en bas à droite (zone : `x 0,794 · y 0,858 · rayon 0,05`).

Les deux zones ont été vérifiées sur l'image. Un point hors de la zone mais tout proche rapporte
encore une partie des points.

**Mettre votre propre image** : déposez-la dans `images/` (elle reste hors de git grâce à
`images/.gitignore`), remplacez `images/triomphe-de-la-mort.jpg` par son nom dans les questions 6
et 17 de `quiz.json`, adaptez le texte et les zones (`x`, `y`, `rayon` en fractions de la largeur
et de la hauteur — ou redessinez la zone dans l'éditeur en cliquant sur l'image), puis relancez
l'import.

## Comment y jouer

- **Équipes** (2 à 4) — conseillé pour une **soirée d'Halloween** : le quiz est dur, on se
  dispute la réponse à plusieurs. Le score d'équipe est la moyenne des points de ses membres,
  donc les petites équipes ne sont pas désavantagées. Les « Mytho ! » et les dessins marchent
  très bien en équipes.
- **Survie + Jokers** — pour une petite bande d'amis : avec un quiz aussi difficile, **3 ou 4
  cœurs** évitent d'être tous fantômes à la moitié. Les « Dessine-moi » (9, 20) ne coûtent jamais
  de cœur ; à l'ordre (8, 16, 25) et au point sur l'image (6, 17), une réponse presque juste
  coûte quand même un cœur.
- **Jokers** : 🎯 50/50 sur les QCM (sauf le 3, qui n'a qu'une mauvaise réponse), les curseurs
  (plage réduite), les réponses libres (1re lettre) et les « Mytho ! » (la moitié des mythos
  cachée) ; ✖️2 Double ou rien sur les questions à 2000 points (17, 22, 23, 25) ; 🦜 Copieur sur
  la finale. Pas de joker sur les « Dessine-moi », pas de 50/50 sur l'ordre ni le point sur
  l'image.
