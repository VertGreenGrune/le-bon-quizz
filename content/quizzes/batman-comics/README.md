# Batman — les comics, niveau confirmé

31 questions en français sur les **comics** Batman (et non les films ni la série animée — pour
celle-ci, voir `content/quizzes/batman`), de niveau **intermédiaire à difficile**. On part de
_Detective Comics_ #27 et de la querelle de paternité Kane / Finger, on passe par les cinq Robin
et les récits cultes, et on finit sur des détails d'édition : le vote téléphonique qui a tué
Jason Todd, le prix du premier numéro. **Aucune question ne rapporte 0 point.** Durée : environ
25 minutes avec 6 joueurs.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/batman-comics <email de l'animateur>
```

Sources de chaque réponse : `CREDITS.md`.

## Les questions

Types utilisés : QCM (dont un « coche tout »), vrai/faux, réponse libre, curseur, remettre dans
l'ordre, « Mytho ! » et « Dessine-moi ». Deux questions se jouent **au buzzer** (10 et 26).

| #   | Type                        | Thème                                          | Temps     | Points |
| --- | --------------------------- | ---------------------------------------------- | --------- | ------ |
| 1   | QCM                         | La première apparition de Batman               | 20 s      | 1000   |
| 2   | Curseur                     | L'année de cette première apparition           | 25 s      | 1000   |
| 3   | QCM                         | Les deux créateurs                             | 20 s      | 1000   |
| 4   | Vrai/faux                   | Bill Finger crédité seulement en 2015          | 20 s      | 2000   |
| 5   | QCM (3 bonnes rép.)         | Les inspirations du personnage                 | 35 s      | 2000   |
| 6   | QCM                         | La première apparition d'Alfred                | 25 s      | 2000   |
| 7   | QCM                         | La première apparition de Robin                | 25 s      | 1000   |
| 8   | Vrai/faux                   | L'effet de Robin sur les ventes                | 20 s      | 1000   |
| 9   | Ordre                       | Les cinq Robin dans l'ordre                    | 50 s      | 2000   |
| 10  | Réponse libre **au buzzer** | Le nom de héros de Dick Grayson après Robin    | 30 s      | 1000   |
| 11  | QCM                         | Le numéro qui révèle Joker **et** Catwoman     | 25 s      | 1000   |
| 12  | Réponse libre               | Le nom de Catwoman dans ce numéro              | 30 s      | 2000   |
| 13  | « Mytho ! »                 | Le prénom du nom officiel d'Arkham             | 45 + 25 s | 2000   |
| 14  | Réponse libre               | Le fondateur de l'asile                        | 30 s      | 2000   |
| 15  | QCM                         | Le premier nom de Mr. Freeze                   | 25 s      | 2000   |
| 16  | QCM                         | L'année de la première apparition du Sphinx    | 25 s      | 2000   |
| 17  | Ordre                       | Cinq premières apparitions à remettre en ordre | 50 s      | 2000   |
| 18  | « Mytho ! »                 | Le meurtrier des parents de Bruce Wayne        | 45 + 25 s | 2000   |
| 19  | QCM                         | L'auteur de _The Dark Knight Returns_          | 25 s      | 1000   |
| 20  | Réponse libre               | Le scénariste de _The Killing Joke_            | 30 s      | 1000   |
| 21  | QCM                         | Le dessinateur de _The Killing Joke_           | 25 s      | 2000   |
| 22  | QCM                         | Le dessinateur de _Year One_                   | 25 s      | 2000   |
| 23  | Vrai/faux                   | Le vote des lecteurs sur la mort de Robin      | 25 s      | 1000   |
| 24  | Curseur                     | L'écart de voix de ce vote                     | 30 s      | 2000   |
| 25  | Réponse libre               | Le retour de Jason Todd                        | 30 s      | 1000   |
| 26  | Réponse libre **au buzzer** | Qui brise le dos de Batman                     | 25 s      | 1000   |
| 27  | QCM                         | La mère de Damian Wayne                        | 25 s      | 1000   |
| 28  | Réponse libre               | Le scénariste de _La Cour des Hiboux_          | 30 s      | 2000   |
| 29  | Ordre                       | Six récits par ordre de publication            | 55 s      | 2000   |
| 30  | Curseur                     | Le prix de _Detective Comics_ #27, en cents    | 30 s      | 1000   |
| 31  | « Dessine-moi »             | Un élément de l'univers de Batman              | 90 s      | 1000   |

## Comment le présenter

- **Entre lecteurs de comics** : « Survie » + Jokers, 3 cœurs. Les questions 6, 15, 16, 21 et 22
  éliminent ceux qui ne connaissent que les films.
- **Groupe mixte** : « Équipes ». Les questions 1 à 11 et 19 à 27 restent accessibles à qui a vu
  les films de Nolan ou Burton ; les trois « ordre » (9, 17, 29) se discutent en équipe et valent
  2000 points chacune.
- **Les jokers qui brillent ici** : le 🎯 50/50 sur les QCM à numéros (1, 6, 7, 11), le ⏳ Sablier
  sur les curseurs, et le 🌀 Brouilleur **seulement** sur les QCM (1, 3, 5, 6, 7, 11, 15, 16, 19,
  21, 22, 27).
- Attention à l'homonymie **Red Hood** : la question 25 attend Jason Todd, mais c'était d'abord
  une identité du Joker — l'explication le rappelle, ça lance toujours une discussion.

## Images et sons

**Trois images libres** dans `images/` : une chauve-souris en vol (domaine public) en couverture,
et deux portraits d'auteurs sous CC BY-SA en **révélation progressive** — Alan Moore se dévoile
sur la question 20 (flou), Scott Snyder sur la question 28 (pixelisé). L'image est l'indice :
reconnaître l'auteur tôt rapporte plus de points. Crédits dans `CREDITS.md`.

Rien de DC : planches, couvertures et logos sont protégés. Pour ajouter vos propres images,
déposez-les dans `images/` (le `.gitignore` les garde hors de git), renseignez `imageUrl` dans
`quiz.json` et réimportez.
