# Kaamelott — niveau confirmé

31 questions en français sur la série d'**Alexandre Astier**, de niveau **intermédiaire à
difficile**. Les premières portent sur ce que tout spectateur régulier sait (la chaîne, le
format, qui joue qui) ; les suivantes vont chercher les coulisses : le mot qui déclenche le
premier « C'est pas faux », l'auteur dont vient l'orthographe « Camaalot », la société de
production. **Aucune question ne rapporte 0 point.** Durée : environ 25 minutes avec 6 joueurs.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/kaamelott <email de l'animateur>
```

Sources de chaque réponse : `CREDITS.md`.

## Les questions

Types utilisés : QCM (dont un « coche tout »), vrai/faux, réponse libre, curseur, remettre dans
l'ordre, « Mytho ! » et « Dessine-moi ». Deux questions se jouent **au buzzer** (5 et 13).

| #   | Type                        | Thème                                         | Temps     | Points |
| --- | --------------------------- | --------------------------------------------- | --------- | ------ |
| 1   | QCM                         | La chaîne de diffusion                        | 20 s      | 1000   |
| 2   | Vrai/faux                   | Une série née d'un court-métrage              | 15 s      | 1000   |
| 3   | Réponse libre               | Le titre du court-métrage de 2003             | 30 s      | 2000   |
| 4   | QCM                         | Qui joue Léodagan                             | 20 s      | 1000   |
| 5   | Réponse libre **au buzzer** | Le royaume de Léodagan                        | 25 s      | 1000   |
| 6   | QCM (3 bonnes rép.)         | Les personnages joués par la famille Astier   | 35 s      | 2000   |
| 7   | Curseur                     | Le nombre total d'épisodes                    | 30 s      | 2000   |
| 8   | QCM                         | La durée des épisodes des Livres I à IV       | 20 s      | 1000   |
| 9   | Curseur                     | La durée des épisodes du Livre VI             | 25 s      | 1000   |
| 10  | QCM                         | L'actrice de la Dame du Lac                   | 20 s      | 1000   |
| 11  | Réponse libre               | Le prénom de la Dame du Lac                   | 30 s      | 2000   |
| 12  | QCM                         | Qui joue Merlin                               | 20 s      | 1000   |
| 13  | Réponse libre **au buzzer** | Le jeu gallois de Perceval                    | 30 s      | 2000   |
| 14  | QCM                         | Qui joue Yvain                                | 20 s      | 1000   |
| 15  | Réponse libre               | « Le gras, c'est… »                           | 20 s      | 1000   |
| 16  | Vrai/faux                   | Qui a inventé « C'est pas faux »              | 20 s      | 1000   |
| 17  | Réponse libre               | Le mot du Tavernier qui déclenche la réplique | 35 s      | 2000   |
| 18  | « Mytho ! »                 | L'épisode où naît « C'est pas faux »          | 45 + 25 s | 2000   |
| 19  | QCM                         | Le comédien du Duc d'Aquitaine                | 25 s      | 1000   |
| 20  | QCM                         | Qui joue le roi Loth d'Orcanie                | 25 s      | 1000   |
| 21  | QCM                         | Le titre complet de Karadoc                   | 25 s      | 1000   |
| 22  | QCM                         | Qui joue Élias de Kelliwic'h                  | 25 s      | 2000   |
| 23  | Vrai/faux                   | Astier compositeur de sa propre série         | 20 s      | 1000   |
| 24  | « Mytho ! »                 | L'auteur de l'orthographe « Camaalot »        | 45 + 25 s | 2000   |
| 25  | Réponse libre               | La société de production                      | 30 s      | 2000   |
| 26  | Réponse libre               | Le spectacle sur la vie extraterrestre        | 30 s      | 2000   |
| 27  | Vrai/faux                   | Qui a mis en scène ce spectacle               | 20 s      | 2000   |
| 28  | QCM                         | Son rôle sur _Astérix : Le Domaine des dieux_ | 25 s      | 1000   |
| 29  | Curseur                     | L'année du _Premier volet_ au cinéma          | 25 s      | 1000   |
| 30  | Ordre                       | Quatre projets d'Astier dans l'ordre          | 45 s      | 2000   |
| 31  | « Dessine-moi »             | Quelque chose qu'on trouve à Kaamelott        | 90 s      | 1000   |

## Comment le présenter

- **Soirée entre fans** : « Survie » + Jokers, 3 cœurs. Les questions 17, 22, 24 et 25 départagent
  vite ceux qui connaissent la série de ceux qui connaissent les coulisses.
- **Grand groupe** : « Équipes ». Les questions de casting (4, 10, 12, 14, 19, 20, 22) se
  discutent très bien à plusieurs, et le « Mytho ! » 18 sur un titre d'épisode donne les
  meilleures inventions de la soirée.
- **Les jokers qui brillent ici** : le 🎯 50/50 sur les QCM de casting, le 🦜 Copieur sur les
  réponses libres à 2000 points, et le 🌀 Brouilleur **seulement** sur les QCM (1, 4, 6, 8, 10,
  12, 14, 19, 20, 21, 22, 28).
- La question 15 est un « complète la réplique » : à faire à voix haute, tout le monde la crie
  avant de l'écrire.

## Images et sons

**Quatre images libres** dans `images/` : trois planches arthuriennes de Howard Pyle (1903,
domaine public) pour la couverture et le décor, et une photo d'Alexandre Astier sur scène
(CC BY-SA) en révélation progressive sur la question de L'Exoconférence. Crédits dans
`CREDITS.md`.

Rien de la série : images, affiches et musiques d'Alexandre Astier sont protégées. Pour un blind
test, déposez vos propres extraits dans le dossier et ajoutez `audio` à la question
(`{ "url": "audio/mon-extrait.mp3", "startSec": 0, "durationSec": 20 }`, 5 à 30 secondes), puis
réimportez. Le `.gitignore` de `images/` garde vos fichiers hors de git.
