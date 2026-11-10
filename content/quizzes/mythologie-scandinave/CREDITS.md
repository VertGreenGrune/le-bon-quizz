# Mythologie scandinave — niveau expert : sources et crédits

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/mythologie-scandinave <email de l'animateur>
```

Les images sont copiées dans le stockage de médias du serveur à l'import et référencées depuis
`PUBLIC_URL` (par défaut `http://localhost:3001` ; option `--base-url`). Aucun son.

## Images (toutes dans le domaine public)

Les trois illustrations sont d'**Emil Doepler** (1855-1922), publiées dans _Walhall, die
Götterwelt der Germanen_ (vers 1905) : domaine public par ancienneté.

| Fichier                      | Utilisé pour        | Œuvre                                                 | Licence        | Source                                                                                    |
| ---------------------------- | ------------------- | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `images/cover-ragnarok.jpg`  | couverture          | Emil Doepler, _Ragnarök_                              | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Ragnar%C3%B6k_by_Doepler.jpg)           |
| `images/pin-odin-fenrir.jpg` | question 14 (point) | Emil Doepler, _Odin et le loup Fenrir, Freyr et Surt_ | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Odin_und_Fenriswolf_Freyr_und_Surt.jpg) |
| `images/thor-serpent.jpg`    | question 17         | Emil Doepler, _Thor et le serpent de Midgard_         | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Thor_und_die_Midgardsschlange.jpg)      |

Fichiers réduits à 1400 px de large (JPEG), non modifiés par ailleurs.

**Zone de la question 14.** La gueule ouverte de Fenrir occupe le coin supérieur gauche de
l'illustration. La zone (x 0,27 ; y 0,14 ; rayon 0,10, en fractions de l'image) a été placée et
vérifiée sur l'image.

## Méthode

Les faits viennent de **Wikipédia** (articles _Valhalla_, _Gleipnir_, _Hávamál_, _Yggdrasil_,
_Brokkr_), qui citent directement les strophes, et de sources spécialisées pour les textes
eddiques. Les deux sources principales sont l'**Edda poétique** (anonyme) et l'**Edda en prose**
de **Snorri Sturluson** (vers 1220). Quand un chiffre circule sous deux versions, il a été
tranché sur le texte : voir la note sur le Valhalla ci-dessous.

## Réponse par réponse

| #   | Réponse                                        | Source                                                                         |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Neuf mondes                                    | Cosmologie eddique                                                             |
| 2   | Yggdrasil                                      | Wikipédia « Yggdrasil »                                                        |
| 3   | Urd (passé), Verdandi (présent), Skuld (futur) | Les trois Nornes à la source d'Urd, au pied d'Yggdrasil                        |
| 4   | 9 nuits                                        | _Hávamál_ 138 : « pendu neuf nuits entières à un arbre battu par les vents »   |
| 5   | Les runes                                      | _Hávamál_ 139 : « je saisis les runes, hurlant je les saisis »                 |
| 6   | Pensée et Mémoire                              | Huginn « pensée », Muninn « mémoire »                                          |
| 7   | Sleipnir                                       | Cheval à huit pattes d'Odin                                                    |
| 8   | Vrai                                           | Loki change de sexe en jument et met bas Sleipnir (père : l'étalon Svadilfari) |
| 9   | Son manche trop court                          | Unique défaut de Mjöllnir dans la _Skáldskaparmál_                             |
| 10  | Loki, en mouche, pique le nain                 | Loki pique Brokkr entre les yeux pendant qu'il actionne le soufflet            |
| 11  | Brokkr et Eitri                                | Wikipédia « Brokkr » ; Eitri est aussi nommé Sindri                            |
| 12  | 540 portes                                     | _Grímnismál_ : « cinq cent quarante portes », 800 einherjar par porte          |
| 13  | Les einherjar                                  | Guerriers morts au combat accueillis au Valhalla                               |
| 14  | Fenrir, en haut à gauche                       | Zone vérifiée sur l'illustration de Doepler                                    |
| 15  | Gleipnir                                       | Lien fait de six choses impossibles (voir l'explication de la question)        |
| 16  | Tyr                                            | Tyr pose la main dans la gueule du loup en gage ; Fenrir la tranche            |
| 17  | Vrai                                           | Thor tue Jörmungand puis meurt du venin après neuf pas                         |
| 18  | Le gui                                         | Seule plante à qui Frigg n'a pas fait prêter serment                           |
| 19  | Serment → gui → Höd → mort de Baldr            | Séquence de la _Gylfaginning_                                                  |
| 20  | Snorri Sturluson                               | Edda en prose, vers 1220                                                       |

**Note sur la question 12 (un chiffre disputé).** Plusieurs sites annoncent 640 portes et 960
guerriers. Le texte du _Grímnismál_ donne **540 portes et 800 einherjar par porte** : c'est la
version retenue, vérifiée sur l'article Wikipédia « Valhalla », qui cite la strophe
(« Five hundred and forty doors… Eight hundred Einherjar go out of one door »).

**Note sur la question 11.** Le deuxième nain est appelé **Eitri** dans certaines versions et
**Sindri** dans d'autres : la réponse « Brokkr et Eitri » est celle de l'article de référence,
et les trois distracteurs (Fjalar et Galar, Dvalin et Durin, Fáfnir et Regin) sont de vrais
couples de la mythologie nordique.
