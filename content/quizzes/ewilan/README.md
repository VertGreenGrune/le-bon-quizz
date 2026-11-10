# La Quête d'Ewilan — niveau confirmé

30 questions en français sur la saga de **Pierre Bottero**, de niveau **intermédiaire à
difficile**. Le quiz commence par Gwendalavir et le Dessin (accessible à qui a lu la première
trilogie), puis monte en difficulté avec _Les Mondes d'Ewilan_, _Le Pacte des Marchombres_ et
l'auteur lui-même. **Aucune question ne rapporte 0 point** : pas de sondage, pas de nuage de
mots. Durée : environ 25 minutes avec 6 joueurs.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/ewilan <email de l'animateur>
```

Sources de chaque réponse : `CREDITS.md`.

## Les questions

Types utilisés : QCM (dont un « coche tout »), vrai/faux, réponse libre, curseur, remettre dans
l'ordre, « Mytho ! » et « Dessine-moi ». Deux questions se jouent **au buzzer** (7 et 12).

| #   | Type                        | Thème                                         | Temps     | Points |
| --- | --------------------------- | --------------------------------------------- | --------- | ------ |
| 1   | QCM                         | Le monde de l'autre côté du pas sur le côté   | 20 s      | 1000   |
| 2   | Réponse libre               | Le nom d'Ewilan dans notre monde              | 25 s      | 1000   |
| 3   | QCM                         | La couleur des yeux de Camille                | 20 s      | 1000   |
| 4   | Réponse libre               | Le geste qui fait passer d'un monde à l'autre | 30 s      | 1000   |
| 5   | QCM (3 bonnes rép.)         | Les trois caractéristiques du Don             | 30 s      | 2000   |
| 6   | QCM                         | L'analyste qui teste Camille                  | 20 s      | 1000   |
| 7   | QCM **au buzzer**           | À quoi ressemble un Ts'lich                   | 25 s      | 1000   |
| 8   | Curseur                     | Le nombre de Sentinelles                      | 25 s      | 1000   |
| 9   | Réponse libre               | La Sentinelle qui a trahi                     | 30 s      | 2000   |
| 10  | QCM                         | Le peuple qui forme les armées des Ts'liches  | 20 s      | 1000   |
| 11  | Vrai/faux                   | Les Faëls, alliés des Ts'liches ?             | 15 s      | 1000   |
| 12  | Réponse libre **au buzzer** | La capitale de Gwendalavir                    | 25 s      | 1000   |
| 13  | QCM                         | Les fonctions d'Edwin Til' Illan              | 25 s      | 1000   |
| 14  | Ordre                       | Les trois tomes de _La Quête d'Ewilan_        | 40 s      | 2000   |
| 15  | QCM                         | Le nom alavirien de Mathieu                   | 25 s      | 1000   |
| 16  | « Mytho ! »                 | Le prénom de naissance d'Ellana               | 45 + 25 s | 2000   |
| 17  | Réponse libre               | Le peuple qui a élevé Ellana                  | 30 s      | 1000   |
| 18  | QCM                         | Le maître marchombre d'Ellana                 | 25 s      | 1000   |
| 19  | Curseur                     | L'âge d'Ellana à la mort de ses parents       | 25 s      | 1000   |
| 20  | QCM                         | Qui est Illian                                | 25 s      | 1000   |
| 21  | Réponse libre               | Le lac qui guérit Ewilan                      | 30 s      | 2000   |
| 22  | QCM                         | La créature surnommée « la méduse »           | 25 s      | 2000   |
| 23  | Ordre                       | Les trois tomes des _Mondes d'Ewilan_         | 40 s      | 2000   |
| 24  | « Mytho ! »                 | Les deux Petits qui ont recueilli Ellana      | 45 + 25 s | 2000   |
| 25  | QCM                         | Qui est Merwyn Ril' Avalon                    | 25 s      | 1000   |
| 26  | Réponse libre               | La montagne liée à la voie des marchombres    | 30 s      | 2000   |
| 27  | Ordre                       | Les trois tomes du _Pacte des Marchombres_    | 45 s      | 2000   |
| 28  | Vrai/faux                   | Bottero instituteur pendant vingt ans         | 20 s      | 1000   |
| 29  | Curseur                     | L'année de parution du premier tome           | 30 s      | 2000   |
| 30  | « Dessine-moi »             | Un objet ou un lieu de Gwendalavir            | 90 s      | 1000   |

## Comment le présenter

- **Entre amis qui ont tous lu la saga** : « Survie » + Jokers, 3 cœurs. Les questions 9, 21, 22
  et 26 font tomber les plus sûrs d'eux.
- **Groupe mixte (lecteurs et non-lecteurs)** : « Équipes ». Mettez un lecteur par équipe : les
  questions 1 à 13 restent devinables, les « Mytho ! » amusent tout le monde, et la question 5
  (« coche tout ») récompense ceux qui ont vraiment lu.
- **Les jokers qui brillent ici** : le 🎯 50/50 sur les QCM à quatre noms propres (6, 15, 18, 25),
  le 🦜 Copieur sur les réponses libres difficiles, et le 🌀 Brouilleur **seulement** sur les QCM
  (1, 3, 5, 6, 7, 10, 13, 15, 18, 20, 22, 25).
- Les deux questions au buzzer (7 et 12) se jouent à voix haute : l'animateur valide depuis la TV
  ou la « Télécommande ».

## Images et sons

**Trois paysages peints du domaine public** (Albert Bierstadt), dans `images/` : la couverture, et
deux supports de révélation progressive — un lac qui se dévoile sur la question du lac Otolep
(flou), une montagne sur celle du Rentaï (zoom). Crédits dans `CREDITS.md`.

Rien de la saga elle-même : couvertures, illustrations de Jean-Louis Thouard et visuels de la
série animée sont protégés. Pour ajouter vos propres images, déposez-les dans `images/` (le
`.gitignore` les garde hors de git), renseignez `imageUrl` / `coverImageUrl` dans `quiz.json` et
réimportez. Pas de son : les livres audio sont protégés.
