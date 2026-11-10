# Batman — les comics, niveau confirmé : sources

Import (quiz **privé**, mis à jour s'il existe déjà sous ce titre) :

```
pnpm --filter @lbq/server quiz:import content/quizzes/batman-comics <email de l'animateur>
```

Le quiz contient **trois images librement réutilisables** (aucun son). Elles sont copiées dans le
stockage de médias du serveur à l'import et référencées depuis `PUBLIC_URL` (par défaut
`http://localhost:3001` ; option `--base-url`).

## Images

Aucune planche, couverture ni logo DC ou Warner n'est inclus : tout est protégé. Les deux
portraits sont des photos sous licence Creative Commons, utilisées en **révélation progressive**
(l'image est l'indice : plus on reconnaît l'auteur vite, plus on marque). La couverture est une
photo de chauve-souris du domaine public.

| Fichier                          | Utilisé pour                     | Sujet                                | Licence                                    | Source                                                                                        |
| -------------------------------- | -------------------------------- | ------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `images/cover-chauve-souris.jpg` | couverture                       | Chauve-souris en vol, Joshua Tree NP | Domaine public (National Park Service)     | [Commons](<https://commons.wikimedia.org/wiki/File:Bat_flying_(51308534787).jpg>)             |
| `images/20-alan-moore.jpg`       | question 20 (effet **flou**)     | Alan Moore à l'ICA, 2 juin 2009      | CC BY-SA 2.0 — Matt Biddulph (Royaume-Uni) | [Commons](https://commons.wikimedia.org/wiki/File:Alan_Moore_at_the_ICA_on_June_2nd_2009.jpg) |
| `images/28-scott-snyder.jpg`     | question 28 (effet **pixelisé**) | Scott Snyder                         | CC BY-SA 3.0 — Gage Skidmore               | [Commons](https://commons.wikimedia.org/wiki/File:Scott_Snyder_by_Gage_Skidmore.jpg)          |

Fichiers réduits à 1400 px de large (JPEG), non modifiés par ailleurs. Les deux photos sous
CC BY-SA imposent de **citer l'auteur** : les crédits ci-dessus suffisent pour un usage privé,
gardez-les si le quiz est rendu public.

Le quiz n'a **aucun son** : les musiques des films Batman sont protégées.

## Méthode

Toutes les dates de première apparition, les créateurs et les récits viennent de **Wikipédia en
anglais** (articles de personnages et de récits, qui citent les numéros et les dates de
couverture). Les dates de couverture (_cover date_) et les dates de mise en vente diffèrent
souvent de deux mois : le quiz s'en tient aux dates de couverture, sauf pour _Detective Comics_
#27, où les deux sont données dans l'explication. Les détails incertains ou propres à une
continuité particulière (second prénom de Victor Fries, origine « définitive » du Joker) ont été
**écartés**.

Sources générales :

- [Batman](https://en.wikipedia.org/wiki/Batman) — première apparition, créateurs, crédit de Bill
  Finger, inspirations, Robin, liste des Robin
- [A Death in the Family](<https://en.wikipedia.org/wiki/A_Death_in_the_Family_(comics)>) — le vote
  téléphonique
- [Batman: The Killing Joke](https://en.wikipedia.org/wiki/Batman:_The_Killing_Joke) — Moore et
  Bolland, 1988
- [Batman: Year One](https://en.wikipedia.org/wiki/Batman:_Year_One) — Miller et Mazzucchelli,
  _Batman_ #404-407
- [Batman: Hush](https://en.wikipedia.org/wiki/Batman:_Hush) — _Batman_ #608-619, 2002-2003
- [Arkham Asylum](https://en.wikipedia.org/wiki/Arkham_Asylum) — nom officiel, Amadeus Arkham
- [Mr. Freeze](https://en.wikipedia.org/wiki/Mr._Freeze) — « Mister Zero », _Batman_ #121 (1959)
- [Joe Chill](https://en.wikipedia.org/wiki/Joe_Chill) — nommé dans _Batman_ #47 (1948)
- [Penguin](<https://en.wikipedia.org/wiki/Penguin_(character)>),
  [Riddler](https://en.wikipedia.org/wiki/Riddler),
  [Ra's al Ghul](https://en.wikipedia.org/wiki/Ra%27s_al_Ghul),
  [Talia al Ghul](https://en.wikipedia.org/wiki/Talia_al_Ghul) — premières apparitions

## Réponse par réponse

| #   | Réponse                                                    | Source                                                                   |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | _Detective Comics_ #27                                     | Wikipédia : daté mai 1939, publié le 30 mars 1939                        |
| 2   | 1939                                                       | Idem ; titre _Batman_ lancé au printemps 1940                            |
| 3   | Bob Kane et Bill Finger                                    | Wikipédia : « Bob Kane and Bill Finger created the character »           |
| 4   | Vrai                                                       | Wikipédia : « DC began crediting Finger as co-creator in 2015 »          |
| 5   | Zorro (1920), _The Bat Whispers_ (1930), _The Shadow_      | Wikipédia : inspirations citées (+ Sherlock Holmes)                      |
| 6   | _Batman_ #16, en 1943                                      | Wikipédia : « Alfred Pennyworth: first appeared in Batman #16 (1943) »   |
| 7   | _Detective Comics_ #38                                     | Wikipédia : Robin, _Detective Comics_ #38 (avril 1940)                   |
| 8   | Vrai                                                       | Wikipédia : « Sales nearly doubled »                                     |
| 9   | Grayson → Todd → Drake → Brown → Wayne                     | Wikipédia : « The Five Robins », dans cet ordre                          |
| 10  | Nightwing                                                  | Wikipédia : « Dick Grayson (became Nightwing) »                          |
| 11  | _Batman_ #1                                                | Wikipédia : « Joker & Catwoman: both debuted in Batman #1 »              |
| 12  | « The Cat »                                                | Wikipédia : « Catwoman originally called “The Cat” »                     |
| 13  | Elizabeth                                                  | Wikipédia : « Elizabeth Arkham Asylum for the Criminally Insane »        |
| 14  | Amadeus Arkham                                             | Wikipédia : fondateur, nom donné d'après sa mère Elizabeth               |
| 15  | Mister Zero                                                | Wikipédia : alias initial, _Batman_ #121 (1959), Wood et Moldoff         |
| 16  | 1948                                                       | Wikipédia : Riddler, _Detective Comics_ #140 (octobre 1948)              |
| 17  | Batman → Pingouin → Double-Face → Batgirl → Ra's al Ghul   | 1939 ; #58 déc. 1941 ; #66 août 1942 ; #359 janv. 1967 ; juin 1971       |
| 18  | Joe Chill                                                  | Wikipédia : sans nom dès 1939, nommé dans _Batman_ #47 (1948)            |
| 19  | Frank Miller                                               | Wikipédia : _The Dark Knight Returns_ (1986, Frank Miller)               |
| 20  | Alan Moore                                                 | Wikipédia : one-shot 1988, écrit par Alan Moore                          |
| 21  | Brian Bolland                                              | Idem : « illustrated by Brian Bolland »                                  |
| 22  | David Mazzucchelli                                         | Wikipédia : _Batman_ #404-407, février-mai 1987                          |
| 23  | Vrai                                                       | Wikipédia : deux numéros de téléphone, 35 h à partir du 15 sept. 1988    |
| 24  | 72 voix                                                    | Wikipédia : 5 343 contre 5 271                                           |
| 25  | Red Hood                                                   | Wikipédia : « later resurrected as Red Hood »                            |
| 26  | Bane                                                       | Wikipédia : _Knightfall_ (1993-1994), _Batman_ #497, juillet 1993        |
| 27  | Talia al Ghul                                              | Wikipédia : « Damian Wayne (Bruce's biological son with Talia al Ghul) » |
| 28  | Scott Snyder                                               | Wikipédia : _Batman_ (vol. 2) #1-11, Snyder et Capullo                   |
| 29  | DKR → Year One → Killing Joke → Knightfall → Hush → Hiboux | 1986, 1987, 1988, 1993, 2002-2003, 2011-2012                             |
| 30  | 10 cents                                                   | Prix de couverture de _Detective Comics_ #27 (1939)                      |
| 31  | « Dessine-moi » (pas de réponse à vérifier)                | —                                                                        |

## Précisions

- **Question 5.** Les sources citent _The Mark of Zorro_ (1920), _The Bat Whispers_ (1930),
  Sherlock Holmes et _The Shadow_. Le mauvais choix proposé (_Dracula_ de Bram Stoker) n'apparaît
  dans aucune des inspirations documentées, malgré le thème de la chauve-souris.
- **Questions 11 et 12.** _Batman_ #1 (printemps 1940) contient à la fois la première apparition
  du Joker et celle de Catwoman, alors simplement nommée « The Cat ».
- **Question 17.** Les cinq apparitions sont assez espacées pour qu'aucun doute d'ordre ne
  subsiste, même en prenant les dates de mise en vente plutôt que les dates de couverture.
- **Question 18.** Joe Chill apparaît sans nom dans _Detective Comics_ #33 (novembre 1939) ; il
  n'est baptisé qu'en 1948, dans _Batman_ #47, par Bill Finger. L'énoncé demande le nom, pas la
  date.
- **Question 25.** _Red Hood_ était d'abord une identité du Joker, avant d'être reprise par Jason
  Todd : l'explication de la question le précise pour éviter la contestation.
- **Question 29.** _Hush_ court sur _Batman_ #608-619 (octobre 2002 - septembre 2003) et
  _La Cour des Hiboux_ sur _Batman_ (vol. 2) #1-11 (2011-2012) : les deux ne se chevauchent pas.

Aucune couverture, planche, logo DC ou Warner n'est inclus dans ce dossier.
