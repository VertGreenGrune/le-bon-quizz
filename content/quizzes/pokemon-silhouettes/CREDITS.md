# Pokémon — Qui est cette silhouette ? : sources et droits

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/pokemon-silhouettes <email de l'animateur>
```

## ⚠️ Droits : à lire avant de partager ce quiz

Les 15 images de `images/` sont des **silhouettes dérivées des artworks officiels** des jeux
Pokémon. Les personnages et leurs illustrations sont la propriété de **Nintendo, Creatures Inc. et
GAME FREAK inc.** Contrairement aux autres quiz du dossier `content/`, **ce ne sont pas des
images libres de droits.**

Concrètement :

- Le quiz est importé en **privé**, et doit le rester : ne le passez pas en « Public » (il
  arriverait dans la bibliothèque, visible par les autres animateurs).
- Pour une soirée entre amis sur votre instance, c'est l'usage classique du « Qui est ce
  Pokémon ? » de la série animée.
- Pour une mise en ligne publique, une diffusion ou un usage commercial : **ne l'utilisez pas**
  en l'état.

Aucun artwork en couleur n'est inclus : seules les silhouettes noires, sur fond blanc.

## Comment les silhouettes ont été fabriquées

1. Les artworks officiels ont été récupérés via le dépôt de sprites de
   [PokeAPI](https://pokeapi.co) (`sprites/pokemon/other/official-artwork/<id>.png`, PNG à fond
   transparent, 475 × 475).
2. Un script Windows (`System.Drawing`) remplace chaque pixel opaque par du noir (24, 20, 17),
   met le fond en blanc, recadre sur la forme et ajoute 6 % de marge — d'où des fichiers carrés
   de 427 à 506 px.

Rien n'a été retouché à la main : la silhouette est exactement le contour de l'artwork.

## Données

**Tous les chiffres, noms français et relations de types viennent de l'API de
[PokeAPI](https://pokeapi.co)**, interrogée au moment de l'écriture — rien n'a été écrit de
mémoire. C'est important : plusieurs noms français sont contre-intuitifs (Tutankafer et non
« Tutafeh » qui est la pré-évolution, Golemastoc, Lanssorien, Forgelina).

| Donnée                                           | Point d'entrée interrogé           |
| ------------------------------------------------ | ---------------------------------- |
| Noms français et anglais, génération             | `/pokemon-species/{id}`            |
| Statistiques de base, types                      | `/pokemon/{id}`                    |
| Immunités et faiblesses (questions 4, 6, 10, 24) | `/type/{nom}` → `damage_relations` |
| Espèces par génération (questions 2, 16, 18)     | `/generation/{n}`                  |
| Lignées d'évolution (questions 20, 26)           | `/evolution-chain/{id}`            |

## Les 14 silhouettes

| Question | Fichier                     | N°  | Nom français | Génération |
| -------- | --------------------------- | --- | ------------ | ---------- |
| 1        | `images/115-kangaskhan.png` | 115 | Kangourex    | I          |
| 3        | `images/142-aerodactyl.png` | 142 | Ptéra        | I          |
| 5        | `images/203-girafarig.png`  | 203 | Girafarig    | II         |
| 7        | `images/227-skarmory.png`   | 227 | Airmure      | II         |
| 9        | `images/302-sableye.png`    | 302 | Ténéfix      | III        |
| 11       | `images/357-tropius.png`    | 357 | Tropius      | III        |
| 13       | `images/426-drifblim.png`   | 426 | Grodrive     | IV         |
| 15       | `images/472-gliscor.png`    | 472 | Scorvol      | IV         |
| 17       | `images/563-cofagrigus.png` | 563 | Tutankafer   | V          |
| 19       | `images/623-golurk.png`     | 623 | Golemastoc   | V          |
| 21       | `images/681-aegislash.png`  | 681 | Exagide      | VI         |
| 23       | `images/778-mimikyu.png`    | 778 | Mimiqui      | VII        |
| 25       | `images/887-dragapult.png`  | 887 | Lanssorien   | VIII       |
| 27       | `images/959-tinkaton.png`   | 959 | Forgelina    | IX         |

La couverture (`images/cover-silhouette.png`) est la silhouette de **Pikachu**, choisie exprès
parce qu'elle n'est la réponse d'aucune question : elle ne dévoile rien.

**Spiritomb (n° 442) a été écarté** après vérification : sa silhouette est une tache noire
quasiment ronde, impossible à identifier. Scorvol l'a remplacé.

## Chiffres utilisés, question par question

| #   | Réponse                     | Donnée vérifiée                                            |
| --- | --------------------------- | ---------------------------------------------------------- |
| 2   | 151 espèces                 | `/generation/1` → 151 espèces (Kanto)                      |
| 4   | Fée                         | `/type/dragon` → `no_damage_to` : fairy                    |
| 6   | Vrai                        | `/type/ghost` → `no_damage_from` : normal, fighting        |
| 8   | 230 en Défense              | `/pokemon/213` → defense 230, special-defense 230          |
| 10  | Poison et Acier             | `/type/fairy` → `double_damage_from` : poison, steel       |
| 12  | 450 / 505 / 540 / 670 / 720 | Totaux de Leveinard, Caratroc, Ronflex, Monaflèmit, Arceus |
| 14  | Leuphorie                   | `/pokemon/242` → hp 255                                    |
| 16  | La 5e génération            | `/generation/5` → 156 espèces, le maximum                  |
| 18  | 72 espèces                  | `/generation/6` → 72 espèces, le minimum                   |
| 20  | Vrai (huit évolutions)      | Chaîne d'évolution d'Évoli : 8 branches                    |
| 22  | Arceus                      | `/pokemon/493` → 120 dans les six statistiques             |
| 24  | Poison                      | `/type/poison` → `no_damage_to` : steel                    |
| 26  | Terhal → Métang → Métalosse | Chaîne d'évolution n° 374                                  |
| 28  | Métamorph                   | `/pokemon-species/132`                                     |
| 29  | Insecte et Roche            | `/pokemon/213` → types bug/rock                            |
| 30  | Rayquaza                    | `/pokemon/384` → dragon/flying, total 680                  |
