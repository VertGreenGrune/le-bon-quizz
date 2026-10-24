# Harry Potter — niveau expert : le quiz vitrine

22 questions en français pour présenter **tout ce que sait faire Le Bon Quizz**, sur Harry Potter,
niveau expert (détails des livres, pas seulement des films). Ouverture facile, montée en
difficulté, grande finale à 2000 points. Durée : 20 à 25 minutes avec 6 joueurs.

Import (quiz **privé**) — voir aussi `CREDITS.md` pour les musiques à ajouter :

```
pnpm --filter @lbq/server quiz:import content/quizzes/harry-potter <email de l'animateur>
```

## Les questions

| #   | Type                    | Question (résumé)                          | Temps     | Points | Bonus                        |
| --- | ----------------------- | ------------------------------------------ | --------- | ------ | ---------------------------- |
| 1   | QCM                     | Rébus 👑 + 🩸 + ½                          | 20 s      | 1000   | rébus emoji                  |
| 2   | Sondage                 | Ta maison de Poudlard                      | 15 s      | 0      |                              |
| 3   | QCM                     | Blind test : nom du thème de John Williams | 20 s      | 1000   | 🎵 son pendant la question   |
| 4   | Vrai / faux             | La plume de la baguette de Harry           | 15 s      | 1000   |                              |
| 5   | QCM                     | Lesquels sont des Animagi ?                | 25 s      | 1000   | 3 bonnes réponses            |
| 6   | QCM                     | Le château de Poudlard des films           | 20 s      | 1000   | 🌫️ photo floue               |
| 7   | Réponse libre           | La formule de la Marque des Ténèbres       | 25 s      | 1000   | fautes tolérées              |
| 8   | « Qui de nous ? »       | Qui serait envoyé à Serpentard ?           | 20 s      | 0      | +200 pour la majorité        |
| 9   | Curseur                 | Les points du Vif d'or                     | 20 s      | 1000   | marge ± 20, unité « points » |
| 10  | Point sur l'image       | Le viaduc de Glenfinnan sur la carte       | 30 s      | 1000   |                              |
| 11  | QCM                     | Qui a dit ? (Dumbledore)                   | 20 s      | 1000   | citation                     |
| 12  | Réponse libre           | Le rôle de cet acteur                      | 30 s      | 1000   | 🔍 zoom sur la photo         |
| 13  | « Mytho ! »             | Le deuxième prénom de Ron                  | 45 + 20 s | 1000   | bluff                        |
| 14  | Réponse libre au buzzer | Blind test : de quel film vient ce chœur ? | 30 s      | 1000   | 🔔 buzzer + 🎵 son           |
| 15  | Nuage de mots           | Ton sortilège préféré                      | 20 s      | 0      |                              |
| 16  | Vrai / faux             | Neville et Harry nés le même jour ?        | 15 s      | 2000   |                              |
| 17  | QCM                     | La gare de la voie 9 ¾                     | 20 s      | 1000   | 👾 photo pixelisée           |
| 18  | QCM                     | Le groupe du bal de Noël                   | 20 s      | 1000   | 🎵 son à la révélation       |
| 19  | Curseur                 | L'année de la mort de Mimi Geignarde       | 25 s      | 1000   | marge ± 3                    |
| 20  | QCM                     | Le legs de Dumbledore à Ron                | 20 s      | 1000   |                              |
| 21  | Réponse libre           | Le nom complet de Voldemort                | 30 s      | 2000   |                              |
| 22  | Remettre dans l'ordre   | Finale : les Horcruxes détruits            | 45 s      | 2000   | 6 éléments                   |

## Toutes les fonctionnalités, avec le numéro de la question

- [x] **QCM** — 1, 3, 5, 6, 11, 17, 18, 20 (plusieurs bonnes réponses : **5**)
- [x] **Vrai / faux** — 4 (vrai), 16 (faux)
- [x] **Réponse libre** avec tolérance des fautes — 7 (« Morsmordre »), 12, 21
- [x] **Sondage** — 2
- [x] **Curseur** avec marge et unité — 9 (± 20 points), 19 (± 3 ans)
- [x] **Remettre dans l'ordre** — 22
- [x] **Point sur l'image** — 10 (carte de l'Écosse)
- [x] **« Qui de nous ? »** avec bonus de majorité — 8
- [x] **Nuage de mots** — 15
- [x] **« Mytho ! »** (bluff) — 13
- [x] **Buzzer** — 14 (avec un extrait musical : le blind test au buzzer)
- [x] **Son pendant la question** — 3, 14
- [x] **Son à la révélation** — 18
- [x] **Effets sur l'image** : flou 6, zoom 12, pixelisé 17
- [x] **Image de couverture** — le viaduc de Glenfinnan
- [x] **Rébus emoji** — 1 ; **« Qui a dit ? »** — 11
- [x] **Points variés** : 0 (2, 8, 15), 1000, 2000 (16, 21, 22)
- [ ] « Dessine-moi » — à ajouter quand ce type de question existera

Les 3 musiques ne sont pas fournies : sans elles, les questions 3, 14 et 18 restent jouables (sans
le son). Voir `CREDITS.md`.

## Présenter les modes de jeu

Le mode se choisit au lancement (« ▶ Lancer » → Solo / Équipes / Survie, + Jokers), pas dans le
quiz : le même quiz sert à tout montrer.

- **Solo** — la première partie, pour découvrir : chacun pour soi, classement après chaque
  question, séries 🔥 (bonus jusqu'à +500), podium à la fin. Idéal pour montrer les types de
  questions un par un.
- **Équipes** (2 à 4) — pour un grand groupe (8 à 15 personnes) : chacun choisit son équipe
  dans le salon, le score d'équipe est la **moyenne** des points de ses membres, donc une équipe
  de 2 peut battre une équipe de 5. Le « Qui de nous ? » (8) et le « Mytho ! » (13) marchent
  aussi en équipes (moyenne des points).
- **Survie** (1 à 5 ❤️) — la soirée « démo » : une mauvaise réponse coûte un cœur, à 0 on
  devient 👻 fantôme et on hante les vivants (Gel / Brouilleur). Avec ce quiz expert, **2 ou 3
  cœurs** suffisent pour avoir des éliminations dès la moitié du quiz. Les questions sans bonne
  réponse (2, 8, 15) ne coûtent rien ; au buzzer (14), seul un buzz raté coûte un cœur ; à l'ordre
  (22), un ordre presque juste coûte quand même un cœur.
- **Conseil démo** : **Survie + Jokers** pour une soirée entre amis (le plus spectaculaire),
  **Équipes + Jokers** pour un grand groupe, **Solo sans jokers** pour un quiz « sérieux ».

## Montrer les jokers

Avec l'option **🃏 Jokers**, chacun reçoit 3 jokers au départ et 1 de plus toutes les 3 bonnes
réponses d'affilée. Où les montrer :

| Joker              | Questions idéales                      | Pourquoi                                                                                  |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 🎯 50/50           | 5, 11, 20 (QCM) ; 9, 19 (curseur) ; 21 | QCM : cache des mauvaises réponses ; curseur : plage réduite ; réponse libre : 1re lettre |
| 🦜 Copieur         | 21, 22                                 | copier le meilleur joueur sur les questions les plus dures                                |
| 🥶 Gel             | avant 3, 14                            | 5 s bloqué au début ; au buzzer (14), il retarde le BUZZ                                  |
| 🌀 Brouilleur      | avant 5, 6, 11, 17, 18, 20             | boutons gris et mélangés : il faut lire le texte à l'écran                                |
| ✖️2 Double ou rien | 16, 21, 22 (2000 points)               | ×2 si juste, −500 si faux                                                                 |
| 🛡️ Bouclier        | n'importe quand                        | bloque la prochaine attaque et garde la série                                             |
| 🦹 Voleur          | à partir de la question 10             | vole 10 % du score du leader                                                              |
| ⏳ Sablier         | 7, 10, 12                              | les questions où l'on réfléchit longtemps                                                 |

Pas de joker sur les questions 2, 8 et 15 (pas de bonne réponse) ni sur la question 14 (buzzer).
Pas de 50/50 sur les vrai / faux (4, 16), le point sur l'image (10) et l'ordre (22). Pour le
« Mytho ! » (13), le Copieur copie le vote et le 50/50 cache la moitié des mythos ; pas de
Brouilleur ni de Sablier.
