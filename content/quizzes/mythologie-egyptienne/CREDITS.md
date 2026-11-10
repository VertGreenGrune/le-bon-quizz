# Mythologie égyptienne — niveau expert : sources et crédits

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/mythologie-egyptienne <email de l'animateur>
```

Les images sont copiées dans le stockage de médias du serveur à l'import et référencées depuis
`PUBLIC_URL` (par défaut `http://localhost:3001` ; option `--base-url`). Aucun son.

## Images (toutes dans le domaine public)

| Fichier                         | Utilisé pour                    | Œuvre                                                                  | Licence        | Source                                                                          |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| `images/pin-pesee-du-coeur.jpg` | couverture + question 4 (point) | Papyrus d'Ani, scène de la pesée du cœur, British Museum               | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:BD_Weighing_of_the_Heart.jpg) |
| `images/vases-canopes.jpg`      | question 8                      | Jeu de quatre vases canopes aux têtes des fils d'Horus, British Museum | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Canopic_jars_BM_4SoH.jpg)     |
| `images/anubis.jpg`             | question 1                      | Sanctuaire d'Anubis (chacal couché), photographié par Edward R. Ayrton | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Horemheb_Anubis_Shrine.jpg)   |

Fichiers réduits à 1400 px de large maximum (JPEG), non modifiés par ailleurs.

**Zone de la question 4.** Ammit, la Dévoreuse, est la créature composite assise tout à droite du
registre inférieur, juste derrière Thot. La zone (x 0,885 ; y 0,73 ; rayon 0,085, en fractions de
l'image) a été placée et vérifiée sur l'image. Le papyrus n'étant pas carré, la zone est une
ellipse — c'est le comportement normal des questions « point sur l'image ».

## Méthode

Les faits viennent de **Wikipédia** (articles _Book of the Dead_, _Assessors of Maat_,
_Four sons of Horus_, _Osiris myth_), de la **World History Encyclopedia** et de l'**Encyclopædia
Britannica**. Le mythe d'Osiris est donné dans la version de **Plutarque** (_Isis et Osiris_),
seule source antique continue — c'est précisé dans l'énoncé de la question 13. Les variantes
locales et tardives (nombre de morceaux selon les villes, généalogies régionales) ont été
**écartées**.

## Réponse par réponse

| #   | Réponse                        | Source                                                                         |
| --- | ------------------------------ | ------------------------------------------------------------------------------ |
| 1   | Anubis                         | Anubis règle la balance, Thot note, Osiris préside (papyrus d'Ani)             |
| 2   | La plume de Maât               | Plume d'autruche de Maât, étalon du jugement                                   |
| 3   | Ammit                          | « La Dévoreuse » : crocodile, lion, hippopotame                                |
| 4   | Ammit, à droite du papyrus     | Zone vérifiée sur l'image                                                      |
| 5   | 42 assesseurs                  | Wikipédia « Assessors of Maat » ; 42 déclarations du chapitre 125              |
| 6   | La salle des Deux Vérités      | _Maaty_, chambre du jugement dans la Douat                                     |
| 7   | « Livre pour sortir au jour »  | Titre égyptien _rw nw prt m hrw_ ; « Livre des Morts » vient de Lepsius (1842) |
| 8   | Foie, poumons, estomac         | Wikipédia « Four sons of Horus » : + intestins ; le cœur reste dans le corps   |
| 9   | Faux                           | Le cœur est laissé en place pour la pesée                                      |
| 10  | Le cerveau                     | Extrait par les narines et jeté ; l'intelligence siégeait dans le cœur         |
| 11  | Faux                           | Seul Amset a une tête humaine (babouin, chacal, faucon pour les trois autres)  |
| 12  | 70 jours                       | World History Encyclopedia : ~70 jours, dont 35-40 de natron                   |
| 13  | 14 morceaux                    | Plutarque, repris par Britannica                                               |
| 14  | Le phallus                     | Plutarque : seul morceau non retrouvé, avalé par un poisson                    |
| 15  | Isis (aidée de Nephtys)        | Britannica : « Isis and her sister Nephthys found and buried all the pieces »  |
| 16  | Horus                          | Fils posthume d'Isis et Osiris, rival de Seth pour le trône                    |
| 17  | Atoum → Shou → Geb → Osiris    | Généalogie de l'Ennéade d'Héliopolis                                           |
| 18  | Le désert, l'orage et le chaos | Seth, dieu des terres rouges, mais défenseur de la barque contre Apophis       |
| 19  | Apophis                        | Serpent attaquant la barque solaire chaque nuit                                |
| 20  | Sekhmet                        | Déesse lionne de la guerre et des épidémies                                    |

**Note sur la question 7.** Les trois mauvaises réponses — _Livre des Portes_, _Livre de la Nuit_,
_Livre des Cavernes_ — sont de vrais textes funéraires du Nouvel Empire. C'est ce qui rend la
question difficile pour qui connaît un peu le sujet.
