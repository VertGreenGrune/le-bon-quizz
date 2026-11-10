# Kaamelott — niveau confirmé : sources

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/kaamelott <email de l'animateur>
```

Le quiz contient **quatre images librement réutilisables** (aucun son). Elles sont copiées dans le
stockage de médias du serveur à l'import et référencées depuis `PUBLIC_URL` (par défaut
`http://localhost:3001` ; option `--base-url`).

## Images

Aucune image de la série, affiche de film ni photogramme n'est incluse : tout est protégé. Les
illustrations arthuriennes de **Howard Pyle** (1853-1911) sont dans le domaine public et donnent
le décor ; la photo d'**Alexandre Astier** est sous licence Creative Commons.

| Fichier                      | Utilisé pour                        | Œuvre                                                  | Licence                                                               | Source                                                                                              |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `images/cover-excalibur.jpg` | couverture                          | Howard Pyle, _Excalibur the Sword_ (1903)              | Domaine public                                                        | [Commons](https://commons.wikimedia.org/wiki/File:Arthur-Pyle_Excalibur_the_Sword.JPG)              |
| `images/10-guinevere.jpg`    | question 5 (le royaume de Léodagan) | Howard Pyle, _King Arthur meets Lady Guinevere_ (1903) | Domaine public                                                        | [Commons](https://commons.wikimedia.org/wiki/File:Arthur-Pyle_King_Arthur_meets_Lady_Guinevere.JPG) |
| `images/03-astier.jpg`       | question 26 (effet **flou**)        | Alexandre Astier sur scène pendant _L'Exoconférence_   | CC BY-SA 4.0 (auteur « FR », voir la page Commons pour l'attribution) | [Commons](https://commons.wikimedia.org/wiki/File:Alexandre_Astier_-_L%27Exoconf%C3%A9rence.jpg)    |
| `images/30-arthur-pyle.jpg`  | question 30 (décor)                 | Howard Pyle, _King Arthur of Britain_ (1903)           | Domaine public                                                        | [Commons](https://commons.wikimedia.org/wiki/File:Arthur-Pyle_King_Arthur_of_Britain.JPG)           |

Fichiers réduits à 1400 px de large maximum (JPEG), non modifiés par ailleurs. Les planches de
Pyle viennent de _The Story of King Arthur and His Knights_ (1903), dans le domaine public
(`PD-Art` / `PD-old` sur Commons).

**Choix de la question 5.** Léodagan est le roi de Carmélide et le père de Guenièvre : la planche
de Pyle montrant la rencontre d'Arthur et de Guenièvre illustre l'alliance des deux royaumes sans
nommer la réponse.

Le quiz n'a **aucun son** : la musique de Kaamelott est composée par Alexandre Astier et
protégée. Pour un blind test, ajoutez vos propres extraits (voir `README.md`).

## Méthode

Les faits de production (chaîne, dates, nombre d'épisodes, durées, origine du titre, audiences)
viennent de **Wikipédia**. Le casting a été recoupé entre Wikipédia, AlloCiné et les pages de
la série. Les répliques et leur contexte (épisode, mot déclencheur) ont été vérifiés sur
**Wikiquote** et sur des fiches d'épisodes. Les points incertains (titres exacts de certains
épisodes au-delà de ceux cités, rôles secondaires attribués de façon contradictoire selon les
sources) ont été **écartés**.

Sources générales :

- [Kaamelott](https://en.wikipedia.org/wiki/Kaamelott) — production, format, audiences, origine du
  titre
- [Liste des personnages de Kaamelott](https://fr.wikipedia.org/wiki/Liste_des_personnages_de_Kaamelott)
  — casting
- [Alexandre Astier](https://en.wikipedia.org/wiki/Alexandre_Astier) — biographie, famille,
  autres œuvres
- [Kaamelott/Perceval](https://fr.wikiquote.org/wiki/Kaamelott/Perceval) — Wikiquote, répliques
- [L'Exoconférence](https://fr.wikipedia.org/wiki/L%27Exoconf%C3%A9rence) — Wikipédia
- [Astérix : Le Domaine des dieux](https://fr.wikipedia.org/wiki/Ast%C3%A9rix_:_Le_Domaine_des_dieux)
  — Wikipédia

## Réponse par réponse

| #   | Réponse                                                        | Source                                                                    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | M6                                                             | Wikipédia : diffusion du 3 janvier 2005 au 31 octobre 2009 sur M6         |
| 2   | Vrai                                                           | Wikipédia : « based on a 2003 short film »                                |
| 3   | _Dies iræ_                                                     | Wikipédia : court-métrage _Dies iræ_ (2003)                               |
| 4   | Lionnel Astier                                                 | Wikipédia : « Lionnel Astier (Léodagan) », père d'Alexandre               |
| 5   | La Carmélide                                                   | Wikipédia : « Léodagan — King of Carmélide, Arthur's father-in-law »      |
| 6   | Léodagan, Yvain, Dame Séli                                     | Wikipédia (A. Astier) : père Lionnel, demi-frère Simon, mère J. Sevilla   |
| 7   | 458 épisodes                                                   | Wikipédia : « 458 episodes plus two films »                               |
| 8   | Environ 3 min 30                                               | Wikipédia : « Episodes I-IV: 3 min 30 sec »                               |
| 9   | 40 minutes                                                     | Wikipédia : Livre VI, 40 minutes, neuf épisodes                           |
| 10  | Audrey Fleurot                                                 | Casting : Audrey Fleurot en Viviane, la Dame du Lac                       |
| 11  | Viviane                                                        | Casting : « Audrey Fleurot played Viviane, la Dame du Lac »               |
| 12  | Jacques Chambon                                                | Wikipédia : « Merlin (Jacques Chambon) »                                  |
| 13  | Le Sloubi                                                      | Fiche d'épisode « Perceval chante Sloubi » ; jeu « du pays de Galles »    |
| 14  | Simon Astier                                                   | Wikipédia : « Yvain (Simon Astier) », demi-frère d'Alexandre              |
| 15  | « la vie »                                                     | Wikiquote / épisode _Corpore Sano_ (Livre II) : « Le gras, c'est la vie » |
| 16  | Faux — c'est Karadoc                                           | Fiche « C'est pas faux » : ruse inventée par Karadoc, apprise à Perceval  |
| 17  | Sinécure                                                       | Même source : mot du Tavernier, épisode 28 du Livre I                     |
| 18  | _La Botte secrète_                                             | Même source : « épisode 28 du Livre I : La Botte Secrète »                |
| 19  | Alain Chabat                                                   | Casting : « Alain Chabat played the Duc d'Aquitaine »                     |
| 20  | François Rollin                                                | Casting : « François Rollin played Loth d'Orcanie »                       |
| 21  | Karadoc de Vannes                                              | Wikipédia : « Karadoc de Vannes » ; « Bohort de Gaunes »                  |
| 22  | Bruno Fontaine                                                 | Casting : « Bruno Fontaine played Elias de Kelliwic'h »                   |
| 23  | Vrai                                                           | Wikipédia : Astier « compositeur et interprète de la musique »            |
| 24  | Jean Markale                                                   | Wikipédia : orthographe « Camaalot » de Jean Markale + T de « camelote »  |
| 25  | CALT                                                           | Wikipédia : production CALT, ~2 M€ par saison                             |
| 26  | _L'Exoconférence_                                              | Wikipédia : spectacle créé le 12 septembre 2014, Radiant Bellevue         |
| 27  | Vrai — Jean-Christophe Hembert                                 | Wikipédia : « mise en scène de Jean-Christophe Hembert » (Karadoc)        |
| 28  | Scénariste et co-réalisateur                                   | Wikipédia : réalisé par Louis Clichy, « écrit et co-réalisé » par Astier  |
| 29  | 2021                                                           | Wikipédia : premier film sorti en 2021 ; _Deuxième volet_ en 2025         |
| 30  | Dies iræ → série sur M6 → Le Domaine des dieux → Premier volet | 2003, 2005, 2014, 2021 (sources ci-dessus)                                |
| 31  | « Dessine-moi » (pas de réponse à vérifier)                    | —                                                                         |

## Précisions

- **Question 6.** Quatre membres de la famille jouent dans la série : Alexandre (Arthur), son père
  Lionnel (Léodagan), sa mère Joëlle Sevilla (Dame Séli) et son demi-frère Simon (Yvain, né de
  l'union de Lionnel Astier et de Josée Drevon). La question ne propose que les trois autres
  qu'Alexandre, pour rester jouable en « coche tout » à quatre cases.
- **Questions 16 à 18.** Les trois portent sur la même scène et se suivent volontairement : la
  16 pose le piège (presque tout le monde répond « Perceval »), la 17 demande le mot, la 18 le
  titre de l'épisode. L'explication de la 16 révèle Karadoc, pas le mot ni le titre.
- **Question 24.** Alexandre Astier a expliqué avoir repris l'orthographe « Camaalot » de Jean
  Markale et ajouté des T pour faire entendre « camelote ».
- **Audience non utilisée dans le quiz** mais utile à l'animateur : pic à 5,6 millions de
  téléspectateurs (20,2 % de part d'audience) en novembre 2005.

Aucune image, affiche, logo ni musique de la série n'est incluse dans ce dossier.
