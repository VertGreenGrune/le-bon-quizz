# Sound credits

All sounds in this folder are **original works generated for Le Bon Quizz** by
`apps/web/scripts/generate-sounds.mjs` (pure synthesis: sine / square / triangle tones and seeded
noise — no samples, no third-party recordings). They are dedicated to the public domain under
**CC0 1.0** (https://creativecommons.org/publicdomain/zero/1.0/).

| File         | Used for (host screen only)                       | Source                        | License |
| ------------ | ------------------------------------------------- | ----------------------------- | ------- |
| `lobby.wav`  | Lobby music, seamless 8 s loop                    | generated (`generate-sounds`) | CC0 1.0 |
| `join.wav`   | A player joins the lobby                          | generated (`generate-sounds`) | CC0 1.0 |
| `tick.wav`   | Countdown tick, last 5 seconds of a question      | generated (`generate-sounds`) | CC0 1.0 |
| `reveal.wav` | Correct answer revealed                           | generated (`generate-sounds`) | CC0 1.0 |
| `podium.wav` | Podium: drum roll (3rd → 2nd) then winner fanfare | generated (`generate-sounds`) | CC0 1.0 |

To regenerate (deterministic): `node apps/web/scripts/generate-sounds.mjs`.

If you replace a file with a downloaded one, only use royalty-free / CC0 sounds and add a row
with its exact source URL, author and license.
