# Pokémon — Qui est cette silhouette ? (difficile)

30 questions en français, **difficiles**, dont **14 silhouettes à reconnaître** — une par
génération ou presque, de Kangourex à Forgelina. Entre les silhouettes, 16 questions de types,
de statistiques de base et d'évolutions, toutes tirées de l'API PokeAPI. **Aucune question ne
rapporte 0 point.** Durée : environ 20 minutes avec 6 joueurs.

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/pokemon-silhouettes <email de l'animateur>
```

> ⚠️ Les silhouettes sont dérivées des artworks officiels (Nintendo / Creatures / GAME FREAK).
> Gardez ce quiz **privé** : voir `CREDITS.md`.

## Comment ça se joue

Les silhouettes alternent avec les questions de connaissance, une sur deux. Sur la TV, la
silhouette noire s'affiche en grand ; les joueurs **tapent le nom** sur leur téléphone (10
questions) ou **choisissent parmi quatre noms** (4 questions). Les mauvaises réponses des QCM
sont de vrais Pokémon proches — souvent la pré-évolution, ce qui ne pardonne pas.

Deux silhouettes (6 et 10, soit les questions 11 et 19) se jouent **au buzzer** : les téléphones
n'ont qu'un gros bouton BUZZ, le premier qui buzze annonce le nom à voix haute et l'animateur
valide avec ✅ / ❌ depuis la TV ou la « Télécommande ». C'est le moment le plus bruyant du quiz.

Les réponses tapées tolèrent les fautes, et **le nom anglais est accepté** partout (Mimikyu pour
Mimiqui, Dragapult pour Lanssorien…).

## Les questions

| #   | Type                     | Thème                                  | Temps     | Points |
| --- | ------------------------ | -------------------------------------- | --------- | ------ |
| 1   | Silhouette (QCM)         | Kangourex                              | 20 s      | 1000   |
| 2   | Curseur                  | Espèces de la 1re génération           | 25 s      | 1000   |
| 3   | Silhouette (libre)       | Ptéra                                  | 25 s      | 1000   |
| 4   | QCM                      | Le type insensible au Dragon           | 25 s      | 1000   |
| 5   | Silhouette (libre)       | Girafarig                              | 25 s      | 1000   |
| 6   | Vrai/faux                | Les immunités du type Spectre          | 20 s      | 2000   |
| 7   | Silhouette (QCM)         | Airmure                                | 20 s      | 1000   |
| 8   | Curseur                  | La Défense de Caratroc                 | 30 s      | 2000   |
| 9   | Silhouette (libre)       | Ténéfix                                | 30 s      | 2000   |
| 10  | QCM (2 bonnes rép.)      | Les faiblesses du type Fée             | 30 s      | 2000   |
| 11  | Silhouette **au buzzer** | Tropius                                | 25 s      | 2000   |
| 12  | Ordre                    | Cinq Pokémon par total de statistiques | 50 s      | 2000   |
| 13  | Silhouette (QCM)         | Grodrive                               | 25 s      | 2000   |
| 14  | Réponse libre            | Le record de PV de base                | 30 s      | 2000   |
| 15  | Silhouette (libre)       | Scorvol                                | 30 s      | 2000   |
| 16  | QCM                      | La génération la plus prolifique       | 25 s      | 2000   |
| 17  | Silhouette (libre)       | Tutankafer                             | 30 s      | 2000   |
| 18  | Curseur                  | La plus petite génération              | 30 s      | 2000   |
| 19  | Silhouette **au buzzer** | Golemastoc                             | 25 s      | 2000   |
| 20  | Vrai/faux                | Les évolutions d'Évoli                 | 20 s      | 1000   |
| 21  | Silhouette (QCM)         | Exagide                                | 25 s      | 2000   |
| 22  | Réponse libre            | Le Pokémon à 120 partout               | 30 s      | 2000   |
| 23  | Silhouette (libre)       | Mimiqui                                | 25 s      | 1000   |
| 24  | QCM                      | Le type sans effet sur l'Acier         | 25 s      | 2000   |
| 25  | Silhouette (libre)       | Lanssorien                             | 30 s      | 2000   |
| 26  | Ordre                    | La lignée de Métalosse                 | 40 s      | 1000   |
| 27  | Silhouette (libre)       | Forgelina                              | 30 s      | 2000   |
| 28  | « Mytho ! »              | Le Pokémon n° 132                      | 45 + 25 s | 2000   |
| 29  | QCM                      | Les types de Caratroc                  | 25 s      | 2000   |
| 30  | Réponse libre            | Le légendaire à 680                    | 30 s      | 2000   |

## Comment le présenter

- **Entre connaisseurs** : « Survie » + Jokers, 3 cœurs. Les silhouettes 9, 15, 17 et 27
  (Ténéfix, Scorvol, Tutankafer, Forgelina) éliminent vite.
- **Groupe mixte** : « Équipes ». Les silhouettes se devinent à plusieurs, et les quatre QCM
  (1, 7, 13, 21) restent jouables même sans tout connaître.
- **Les jokers qui brillent** : le 🎯 50/50 sur les quatre silhouettes en QCM, le 🦜 Copieur sur
  les réponses libres à 2000 points. Le 🌀 Brouilleur ne marche **que** sur les QCM.
- Le quiz monte en difficulté avec les générations : la 1re au début, la 9e à la fin.

## Changer les silhouettes

Elles sont régénérables : `CREDITS.md` donne la méthode exacte (artwork PokeAPI → script
`System.Drawing`). Pour en ajouter, déposez vos propres PNG dans `images/`, ajoutez la question
dans `quiz.json` et réimportez. Le `.gitignore` de `images/` ne versionne que les fichiers listés.
