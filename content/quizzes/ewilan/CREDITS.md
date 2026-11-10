# La Quête d'Ewilan — niveau confirmé : sources

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/ewilan <email de l'animateur>
```

Le quiz contient **trois images librement réutilisables** (aucun son). Elles sont copiées dans le
stockage de médias du serveur à l'import et référencées depuis `PUBLIC_URL` (par défaut
`http://localhost:3001` ; option `--base-url`).

## Images (domaine public)

Aucune couverture de livre, illustration de Jean-Louis Thouard ni visuel de la série animée
n'est incluse : tout est protégé. Les trois images sont des **paysages peints du domaine public**
qui servent d'ambiance et, pour les questions 21 et 26, de support à un effet de révélation
progressive — un lac pour la question sur le lac, une montagne pour la question sur la montagne.
Aucune ne nomme ni ne montre la réponse.

| Fichier                    | Utilisé pour                 | Œuvre                                                                  | Licence        | Source                                                                                                                                     |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `images/cover-paysage.jpg` | couverture                   | Albert Bierstadt, _Among the Sierra Nevada, California_ (1868)         | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Albert_Bierstadt_-_Among_the_Sierra_Nevada,_California_-_Google_Art_Project.jpg)         |
| `images/21-lac.jpg`        | question 21 (effet **flou**) | Albert Bierstadt, _A Storm in the Rocky Mountains, Mt. Rosalie_ (1866) | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Albert_Bierstadt_-_A_Storm_in_the_Rocky_Mountains,_Mt._Rosalie_-_Google_Art_Project.jpg) |
| `images/26-montagne.jpg`   | question 26 (effet **zoom**) | Albert Bierstadt, _The Rocky Mountains, Lander's Peak_ (1863)          | Domaine public | [Commons](https://commons.wikimedia.org/wiki/File:Albert_Bierstadt_-_The_Rocky_Mountains,_Lander%27s_Peak.jpg)                             |

Fichiers réduits à 1400 px de large (JPEG), non modifiés par ailleurs. Albert Bierstadt
(1830-1902) : œuvres dans le domaine public, reproductions fidèles d'œuvres 2D du domaine public
(`PD-Art` sur Commons).

Le quiz n'a **aucun son** : les musiques et les livres audio de la saga sont protégés.

## Méthode

Les faits d'édition (titres, dates, éditeur, biographie de l'auteur) viennent de **Wikipédia en
français**. Les détails de l'univers ont été pris sur Wikipédia quand ils y figurent, et
recoupés sinon avec le **wiki Gwendalavir** et des résumés détaillés de lecteurs. Les points où
les sources divergeaient ou restaient floues (le nombre exact de traîtres parmi les Sentinelles,
le rôle d'Artis Valpierre, l'animal d'Ellana) ont été **écartés** plutôt que devinés.

Sources générales :

- [La Quête d'Ewilan](https://fr.wikipedia.org/wiki/La_Qu%C3%AAte_d%27Ewilan) — Wikipédia
- [Les Mondes d'Ewilan](https://fr.wikipedia.org/wiki/Les_Mondes_d%27Ewilan) — Wikipédia
- [Le Pacte des Marchombres](https://fr.wikipedia.org/wiki/Le_Pacte_des_Marchombres) — Wikipédia
- [Pierre Bottero](https://fr.wikipedia.org/wiki/Pierre_Bottero) — Wikipédia
- [Wiki Gwendalavir](https://gwendalavir.fandom.com/fr/wiki/Gwendalavir) — univers, Ts'liches,
  Sentinelles
- [Résumé et personnages du tome 1](https://www.lesresumes.com/litterature/pierre-bottero-la-quete-dewilan-dun-monde-a-lautre-resume-personnages-et-analyse/)
  — rôles détaillés des personnages

## Réponse par réponse

| #   | Réponse                                                          | Source                                                                      |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Gwendalavir                                                      | Wikipédia (_La Quête d'Ewilan_) : « Terre et Gwendalavir, monde parallèle » |
| 2   | Camille Duciel                                                   | Wikipédia : « Camille Duciel / Ewilan Gil' Sayan »                          |
| 3   | Violets                                                          | Résumé du tome 1 : « cheveux bruns et yeux violets »                        |
| 4   | Le pas sur le côté                                               | Wikipédia : « le pas sur le côté », réservé aux plus puissants              |
| 5   | La Volonté, la Créativité, le Pouvoir                            | Les trois cercles de l'analyste (rouge, bleu, jaune) — wiki Gwendalavir     |
| 6   | Duom Nil' Erg                                                    | Wikipédia : « Duom Nil' Erg (analyste, mentor) »                            |
| 7   | Un croisement entre un lézard et une mante religieuse            | Wiki Gwendalavir : « lézard et mante religieuse », plus de deux mètres      |
| 8   | 12 Sentinelles                                                   | Wiki Gwendalavir : douze Sentinelles, figées sept ans plus tôt              |
| 9   | Éléa Ril' Morienval                                              | Wikipédia (_Les Mondes d'Ewilan_) : l'Institution, sa mort au tome 3        |
| 10  | Les Raïs                                                         | Résumé du tome 1 : « humanoïdes verts manipulés par les Ts'liches »         |
| 11  | Faux (les Faëls sont des alliés recherchés)                      | Résumé du tome 1 : « peuple de l'ouest, allié recherché »                   |
| 12  | Al-Jeit                                                          | Wikipédia : « Capitale : Al-Jeit »                                          |
| 13  | Maître d'armes de l'Empereur, chef de la Légion noire            | Résumé du tome 1 ; Wikipédia : « Edwin Til' Illan (guerrier légendaire) »   |
| 14  | D'un monde à l'autre → Les Frontières de glace → L'Île du destin | Wikipédia : 1er mars, 17 mai et 30 novembre 2003, Rageot                    |
| 15  | Akiro Gil' Sayan                                                 | Wikipédia : « Mathieu Boulanger / Akiro Gil' Sayan »                        |
| 16  | Ipiutiminelle                                                    | Wikipédia (_Le Pacte des Marchombres_) : « Ipiutiminelle (Ipiu) »           |
| 17  | Les Petits                                                       | Wikipédia : élevée par les Petits après la mort de ses parents              |
| 18  | Jilano Alhuïn                                                    | Wikipédia : « le plus grand professeur de la voie marchombre »              |
| 19  | 5 ans                                                            | Wikipédia : parents tués par des Raïs « when she was five years old »       |
| 20  | Un garçon de huit ans au pouvoir étonnant                        | Wikipédia (_Les Mondes d'Ewilan_) : « un jeune garçon de 8 ans »            |
| 21  | Otolep                                                           | Wikipédia : « le lac mythique Otolep guérit Ewilan »                        |
| 22  | Ahmour                                                           | Wikipédia : la « méduse » Ahmour, arènes de Valingaï                        |
| 23  | La Forêt des captifs → L'Œil d'Otolep → Les Tentacules du mal    | Wikipédia : 2004, 2005, 2005                                                |
| 24  | Oukilip et Pilipip                                               | Wikipédia (_Le Pacte des Marchombres_) : « Oukilip and Pilipip »            |
| 25  | Le plus grand dessinateur de l'histoire                          | Wiki Gwendalavir : « humanity's greatest and most powerful hope »           |
| 26  | Le Rentaï                                                        | Wikipédia : « the Rentaï (sacred mountain) »                                |
| 27  | Ellana → Ellana, l'Envol → Ellana, la Prophétie                  | Wikipédia : 25 octobre 2006, avril 2008, octobre 2008 (624 p.)              |
| 28  | Vrai                                                             | Wikipédia (Pierre Bottero) : instituteur vingt ans, écriture dès 2001       |
| 29  | 2003                                                             | Wikipédia : mars 2003 ; « 1 million d'exemplaires en cinq ans »             |
| 30  | « Dessine-moi » (pas de réponse à vérifier)                      | —                                                                           |

## Précisions

- **Question 5.** Les trois caractéristiques sont mesurées par un analyste à l'aide de trois
  cercles de couleur. Les sources francophones s'accordent sur Volonté / Créativité / Pouvoir ;
  l'Empereur est l'exemple classique de quelqu'un doté de Volonté et de Pouvoir mais privé de
  Créativité.
- **Question 8.** Les douze Sentinelles comprennent les parents d'Ewilan et au moins deux
  traîtres (Éléa Ril' Morienval et Holts Kil' Muirt). L'énoncé ne porte que sur le nombre total,
  sur lequel les sources s'accordent.
- **Question 16 et 24.** Ces deux « Mytho ! » reposent sur des noms propres très sonores de la
  langue des Petits : les faux mythos passent remarquablement bien.
- **Question 27.** Les titres sont donnés sous la forme _Ellana_, _Ellana, l'Envol_ et
  _Ellana, la Prophétie_ ; certaines éditions écrivent _Ellana l'envol_ sans virgule.

Aucune couverture, illustration ou image de la série animée n'est incluse dans ce dossier.
