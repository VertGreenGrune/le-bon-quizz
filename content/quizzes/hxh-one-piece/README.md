# One Piece × Hunter × Hunter

30 questions de tous niveaux (de l'échauffement au 2000 points), qui utilisent toutes les
fonctionnalités du jeu. Thème TV : classique.

| #   | Type                           | Sujet                                         | Média                   | Points |
| --- | ------------------------------ | --------------------------------------------- | ----------------------- | ------ |
| 1   | Choix multiple                 | Rébus 🐟 + 🧍 + 🏝️                            |                         | 1000   |
| 2   | Sondage                        | One Piece ou Hunter × Hunter ?                |                         | 0      |
| 3   | Choix multiple                 | Le fruit de Luffy                             |                         | 1000   |
| 4   | Vrai / faux                    | L'âge de Gon                                  |                         | 1000   |
| 5   | Réponse libre                  | Le nom de famille de Kirua                    |                         | 1000   |
| 6   | Choix multiple                 | Qui a confié le chapeau à Luffy ?             | photo floutée           | 1000   |
| 7   | Réponse libre                  | Le Nen                                        |                         | 1000   |
| 8   | Curseur                        | La première prime de Luffy (30 M ± 5)         |                         | 1000   |
| 9   | Qui de nous ?                  | Qui se perdrait comme Zoro ? (bonus majorité) |                         | 0      |
| 10  | Choix multiple « tout cocher » | Membres de la Brigade fantôme                 |                         | 1000   |
| 11  | Choix multiple                 | « Qui a dit ? » Barbe Noire                   |                         | 1000   |
| 12  | Réponse libre                  | Le yo-yo de Kirua                             | photo zoomée            | 1000   |
| 13  | Mytho !                        | Le chien d'Orange Town                        |                         | 1000   |
| 14  | Point sur l'image              | Ville natale d'Oda (Kumamoto)                 | carte du Japon          | 1000   |
| 15  | Réponse libre **au buzzer**    | Le premier générique de One Piece             | son pendant la question | 1000   |
| 16  | Ordre                          | L'arrivée des membres de l'équipage           |                         | 1000   |
| 17  | Choix multiple                 | Le type de Nen de Gon                         |                         | 1000   |
| 18  | Vrai / faux                    | Le Vogue Merry et Franky                      |                         | 1000   |
| 19  | Nuage de mots                  | Le pouvoir que tu voudrais                    |                         | 0      |
| 20  | Choix multiple                 | Le Bungee Gum de Hisoka                       | photo pixelisée         | 1000   |
| 21  | Réponse libre                  | Laugh Tale / Raftel                           |                         | 1000   |
| 22  | Mytho !                        | L'île de Gon                                  |                         | 1000   |
| 23  | Choix multiple                 | Qui chante « departure! » ?                   | son à la révélation     | 1000   |
| 24  | Curseur                        | Épisodes de l'anime 2011 (148 ± 5)            |                         | 2000   |
| 25  | Point sur l'image              | Ville natale de Togashi (Shinjō)              | carte du Japon          | 2000   |
| 26  | Réponse libre **au buzzer**    | Alluka et Nanika                              |                         | 2000   |
| 27  | Choix multiple                 | Oda, assistant de Nobuhiro Watsuki            |                         | 2000   |
| 28  | Réponse libre                  | Le Roi des Fourmis-Chimères                   | photo floutée           | 1000   |
| 29  | Dessine-moi                    | 12 objets des deux séries                     |                         | 1000   |
| 30  | Ordre (finale)                 | Les îles dans l'ordre du voyage               |                         | 2000   |

Chaque question a une explication « 💡 Le saviez-vous ? » affichée à la révélation.

## Musique à ajouter

Les extraits ne sont pas dans le dépôt (droits d'auteur). Mettez vos propres fichiers dans
`audio/` (ignoré par git) puis réimportez :

| Fichier               | Morceau                                                           | Extrait conseillé                                   |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| `audio/we-are.mp3`    | « We Are! » (Hiroshi Kitadani), 1er générique de One Piece        | l'intro instrumentale, avant le refrain « We are! » |
| `audio/departure.mp3` | « departure! » (Masatoshi Ono), générique de Hunter × Hunter 2011 | n'importe où : il joue **à la révélation**          |

Sans ces fichiers, les questions 15 et 23 restent jouables sans le son. Ajustez `startSec` dans
`quiz.json` si vous donnez le morceau entier.

## Importer

```
pnpm --filter @lbq/server quiz:import content/quizzes/hxh-one-piece <e-mail de l'animateur>
```

Réimporter met à jour le quiz du même titre (toujours privé).

## Comment jouer

- **Entre amis (4 à 8)** : « Survie » avec 3 ❤️ + Jokers. Les fantômes ont de quoi hanter les
  vivants pendant les questions de la fin à 2000 points.
- **Grand groupe** : « Équipes » (2 ou 3), les « Mytho ! » et le « Dessine-moi » deviennent des
  moments de groupe.
- Buzzer (15, 26) : la réponse se dit à voix haute, l'animateur valide ✅ / ❌ sur la TV ou la
  télécommande.
