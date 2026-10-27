# Sound credits

All sounds in this folder are **original works generated for Le Bon Quizz** by
`apps/web/scripts/generate-sounds.mjs` (pure synthesis: sine / square / triangle tones and seeded
noise — no samples, no third-party recordings). They are dedicated to the public domain under
**CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/).

| File                   | Used for (host screen only)                                       | Source                        | License |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------- | ------- |
| `lobby.wav`            | Lobby music, seamless 8 s loop                                    | generated (`generate-sounds`) | CC0 1.0 |
| `join.wav`             | A player joins the lobby                                          | generated (`generate-sounds`) | CC0 1.0 |
| `tick.wav`             | Countdown tick, last 5 seconds of a question                      | generated (`generate-sounds`) | CC0 1.0 |
| `reveal.wav`           | Correct answer revealed                                           | generated (`generate-sounds`) | CC0 1.0 |
| `podium.wav`           | Podium: drum roll (3rd → 2nd) then winner fanfare                 | generated (`generate-sounds`) | CC0 1.0 |
| `joker.wav`            | A player plays a joker (announcement)                             | generated (`generate-sounds`) | CC0 1.0 |
| `eliminated.wav`       | « Survie »: a player loses their last heart                       | generated (`generate-sounds`) | CC0 1.0 |
| `buzz.wav`             | « Buzzer »: a player takes the hand                               | generated (`generate-sounds`) | CC0 1.0 |
| `lobby-halloween.wav`  | TV theme Halloween (spooky organ): lobby music, 8 s loop          | generated (`generate-sounds`) | CC0 1.0 |
| `reveal-halloween.wav` | TV theme Halloween (spooky organ): answer revealed                | generated (`generate-sounds`) | CC0 1.0 |
| `podium-halloween.wav` | TV theme Halloween (spooky organ): podium roll + fanfare          | generated (`generate-sounds`) | CC0 1.0 |
| `lobby-christmas.wav`  | TV theme Noël (sleigh bells, glockenspiel): lobby music, 8 s loop | generated (`generate-sounds`) | CC0 1.0 |
| `reveal-christmas.wav` | TV theme Noël (sleigh bells, glockenspiel): answer revealed       | generated (`generate-sounds`) | CC0 1.0 |
| `podium-christmas.wav` | TV theme Noël (sleigh bells, glockenspiel): podium roll + fanfare | generated (`generate-sounds`) | CC0 1.0 |
| `lobby-retro.wav`      | TV theme Rétro (8-bit chiptune): lobby music, 8 s loop            | generated (`generate-sounds`) | CC0 1.0 |
| `reveal-retro.wav`     | TV theme Rétro (8-bit chiptune): answer revealed                  | generated (`generate-sounds`) | CC0 1.0 |
| `podium-retro.wav`     | TV theme Rétro (8-bit chiptune): podium roll + fanfare            | generated (`generate-sounds`) | CC0 1.0 |
| `lobby-space.wav`      | TV theme Espace (synth pad): lobby music, 8 s loop                | generated (`generate-sounds`) | CC0 1.0 |
| `reveal-space.wav`     | TV theme Espace (synth pad): answer revealed                      | generated (`generate-sounds`) | CC0 1.0 |
| `podium-space.wav`     | TV theme Espace (synth pad): podium roll + fanfare                | generated (`generate-sounds`) | CC0 1.0 |

To regenerate (deterministic): `node apps/web/scripts/generate-sounds.mjs`.

The TV themes (T40, `src/themes/`) replace only the lobby music, the reveal and the podium
sounds; the other sounds are shared by every theme.

**Theme fonts** (bundled from npm `@fontsource/*`, served from our own origin — no CDN), all under
the **SIL Open Font License 1.1**: Creepster (Sideshow, Halloween), Mountains of Christmas
(Tart Workshop, Noël), Press Start 2P (CodeMan38, Rétro), Orbitron (Matt McInerney, Espace).

If you replace a file with a downloaded one, only use royalty-free / CC0 sounds and add a row
with its exact source URL, author and license.
