# Halloween Pop

30 questions **fun mais corsées** sur Halloween dans la pop culture qu'on connaît en France :
dessins animés (version française !), mangas et animés japonais, jeux vidéo, films et grands
romans qui font peur. Bob Razowski, Véra, Bibendum Chamallow, Sans-Visage, les noiraudes, Ryuk,
Ectoplasma, le professeur Tastroff, Mimi Geignarde, Dracula, Frankenstein, Erik… Une **image par
question** (jamais la réponse : 8 sont floutées, zoomées ou pixelisées au départ ; le « Dessine-moi »
n'en a pas, la TV montre le dessin) et une **explication « 💡 Le saviez-vous ? »** sourcée après chaque
réponse (sources : [`CREDITS.md`](CREDITS.md)). Pas de sondage ni de nuage de mots. Thème TV :
🎃 Halloween.

## Les questions

| #   | Type              | Thème                                                  | Image (effet)                   | Points |
| --- | ----------------- | ------------------------------------------------------ | ------------------------------- | ------ |
| 1   | Choix multiple    | Rébus 🎃 + 👑 (L'Étrange Noël de monsieur Jack)        | citrouille sculptée             | 1000   |
| 2   | Réponse libre     | Monstres & Cie : Mike Wazowski en VF                   | enfants déguisés                | 1000   |
| 3   | Choix multiple    | Pac-Man : le fantôme orange                            | borne d'arcade (pixelisé)       | 1000   |
| 4   | « Mytho ! »       | SOS Fantômes : le géant de guimauve en VF              | Ecto-1                          | 1000   |
| 5   | Vrai / faux       | Halloween (1978) : le masque de Michael Myers          | chat noir                       | 1000   |
| 6   | Choix multiple    | D'où vient le nom « Scooby-Doo » ?                     | Mystery Machine                 | 1000   |
| 7   | Réponse libre     | Scooby-Doo : Velma en VF                               | dogue allemand                  | 1000   |
| 8   | Ordre             | Films : SOS Fantômes → Les Noces funèbres              | Stanley Hotel                   | 1000   |
| 9   | Choix multiple    | Casper (1995) : les trois oncles en VF                 | The Friendly Ghost (1945)       | 2000   |
| 10  | Réponse libre     | Le Voyage de Chihiro : l'esprit masqué                 | Dōgo Onsen (zoom)               | 1000   |
| 11  | Choix multiple    | Mon voisin Totoro : les boules de suie                 | forêt d'automne                 | 1000   |
| 12  | Choix multiple    | Death Note : le fruit préféré de Ryuk                  | fantôme d'Hokusai (flou)        | 1000   |
| 13  | Curseur           | Jujutsu Kaisen : les doigts de Sukuna                  | estampe de Kuniyoshi (zoom)     | 1000   |
| 14  | Choix multiple    | Demon Slayer : comment Nezuko voyage le jour           | forêt de Nikkō                  | 1000   |
| 15  | Réponse libre     | Pokémon : Fantominus → Spectrum → ?                    | yōkai de Sekien (pixelisé)      | 1000   |
| 16  | « Mytho ! »       | Luigi's Mansion : le savant en VF                      | maison hantée                   | 1000   |
| 17  | Vrai / faux       | Minecraft : la citrouille et l'Enderman                | champ de citrouilles            | 1000   |
| 18  | « Qui de nous ? » | Pause : qui mourrait le premier dans un film d'horreur | maison victorienne              | 0      |
| 19  | Curseur           | Harry Potter : les coups de hache de Nick              | château                         | 2000   |
| 20  | Réponse libre     | Harry Potter : le fantôme des toilettes                | toilettes victoriennes          | 1000   |
| 21  | Choix multiple ☑️ | Lesquels sont des fantômes ? (3 bonnes réponses)       | The Skeleton Dance (1929)       | 1000   |
| 22  | Choix multiple    | Gremlins : la règle qui n'existe pas                   | maison abandonnée               | 1000   |
| 23  | Choix multiple    | Qui a dit ? « Je ne bois jamais… de vin. »             | chauve-souris (flou)            | 1000   |
| 24  | « Mytho ! »       | Le sous-titre de Frankenstein                          | Mary Shelley                    | 1000   |
| 25  | Point sur l'image | Le lac où est né Frankenstein                          | carte de l'Europe               | 1000   |
| 26  | Réponse libre     | Le prénom du Fantôme de l'Opéra                        | Palais Garnier (zoom)           | 2000   |
| 27  | Choix multiple    | Le Horla : la preuve de l'être invisible               | Maupassant par Nadar (pixelisé) | 2000   |
| 28  | Point sur l'image | Où est la Transylvanie ?                               | carte de l'Europe               | 1000   |
| 29  | « Dessine-moi »   | 12 stars d'Halloween de la pop culture à dessiner      | — (la TV montre le dessin)      | 1000   |
| 30  | Ordre             | Finale : 6 classiques de l'horreur, de 1818 à 1986     | Edgar Allan Poe                 | 2000   |

## Images

Toutes les images sont **libres** (Wikimedia Commons : domaine public, CC0, CC BY, CC BY-SA ;
crédits dans [`CREDITS.md`](CREDITS.md)) : aucune capture de dessin animé, de film ou de jeu sous
droits. Aucune image n'est à ajouter. Pour une partie privée, vous pouvez remplacer une image par
votre propre capture : mettez le fichier dans `images/` sous le même nom (il reste hors de git
grâce à `images/.gitignore`) et réimportez. Ne remplacez pas `carte-europe.png` sans recalculer les
zones des questions 25 et 28.

## Importer

```
pnpm --filter @lbq/server quiz:import content/quizzes/halloween-anime <email de l'animateur>
```

Le quiz est importé en **privé** ; relancer la commande met à jour le quiz du même titre
(« Halloween Pop »).

## Comment jouer

- **Entre amis à une soirée d'Halloween** : mode **Équipes** (2 ou 3 équipes) — les « Mytho ! »
  et le « Dessine-moi » sont encore plus drôles en équipe.
- **Survie + Jokers** avec 3 cœurs : les questions VF et les mangas départagent vite les joueurs.
- Avec la **📱 télécommande**, l'animateur voit la réponse et l'explication sur son téléphone.
