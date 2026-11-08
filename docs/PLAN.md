# Le Bon Quizz — Architecture & Plan

## 1. Overview

```
┌──────────────┐        ┌───────────────────────────┐        ┌──────────────┐
│ Shared screen│◄──WS──►│      Game server (Node)    │◄──WS──►│ Phones (xN)  │
│ (host / TV)  │        │  Socket.IO room per PIN    │        │ ▲ ◆ ● ■      │
└──────────────┘        │  State machine + timer     │        └──────────────┘
                        │  Scoring                   │
┌──────────────┐  HTTP  │  REST API (quizzes, auth)  │
│ Quiz editor  │◄──────►│                            │──► PostgreSQL / S3        
└──────────────┘        └───────────────────────────┘
```

Parts:
- **A. Game server** — state machine, PIN rooms, players, timer, scoring, reconnection.
- **B. Shared screen (host view)** — lobby (PIN + QR + names), question + countdown,
  answer counter, reveal + distribution chart, leaderboard, podium, host controls, sound.
- **C. Player controller (phone)** — join (PIN/QR → nickname), 2–4 colored shape buttons
  (question text is only on the shared screen), feedback (correct/wrong, points, rank),
  vibration, wake-lock, portrait layout.
- **D. Quiz editor (dashboard)** — CRUD quizzes/questions, time limit, points, images,
  start a game, game history + CSV export.
- **E. API, DB, auth** — Prisma models, REST endpoints, host auth (players are anonymous).
- **F. Infra** — Docker, CI, deployment, Sentry
  (no Redis / multi-instance: ~6 players per game, 15 max — one process is enough).

## 2. Game state machine (server-authoritative)

```
LOBBY → QUESTION_INTRO → ANSWERING → REVEAL → LEADERBOARD ─┐
          ▲                                                 │ more questions
          └─────────────────────────────────────────────────┘
                                         last question → PODIUM → ENDED
```

- `QUESTION_INTRO`: question shown alone on the host screen, phones show "get ready". Length
  (`introDurationMs`, T42, sent as `game:state.introMs`): 3 s, **8 s** (`JOKER_INTRO_MS`) when the
  game has the joker engine (Jokers option or « Survie ») and the question takes jokers — the TV
  shows « 🃏 Jouez vos jokers ! » + countdown, the phones a big joker bar —, + 1 s per 40
  characters of text beyond 80, at most 12 s. The host can skip it; it freezes with a pause.
- `ANSWERING`: server starts timer (`timeLimitSec`); ends when timer expires or all answered —
  for the types whose answers can be cancelled (T43), **2 s** after the last answer
  (`ALL_ANSWERED_GRACE_MS`, TV « ✅ Tout le monde a répondu ! »); a cancel meanwhile stops the reveal.
- `REVEAL`: correct answer + distribution sent to host; per-player result sent to each phone.
- Host drives transitions with `host:next` (except the automatic end of `ANSWERING`).
- **Pause** (`Game.ts`): during `QUESTION_INTRO` / `ANSWERING`, a player who still has to answer
  (no answer yet, not excused) or the host screen offline for more than `PAUSE_GRACE_MS` (2 s)
  pauses the game; a question entered while someone is offline starts paused. The timer freezes
  at its value when the first one dropped (grace given back; a timer running out during the
  grace pauses instead of ending the phase); `responseMs` excludes the paused time; answers →
  `GAME_PAUSED`. `game:state.paused` lists who it waits for. Once everyone is back — or the host
  sends `host:resume` (« Continuer sans… »: missing players are excused = absent for this
  question only, not awaited, not "present" for team averages) or kicks them — `game:resuming
  { inMs: 3000 }` then the timer goes on (a new drop during the countdown cancels it). `host:next`
  / `host:end` during a pause skip it. REVEAL / LEADERBOARD / PODIUM never pause (offline players
  are flagged in `lobby:players`). Socket.IO heartbeat is 5 s + 5 s so silent drops are seen
  within ~10 s.
- **Manual pause** (T39): « ⏸ Pause » (TV or remote, `host:pause`) during QUESTION_INTRO /
  ANSWERING pauses exactly like a drop (timer frozen, answers `GAME_PAUSED`, `responseMs` excludes
  it, sound clip paused), `game:state.paused.byHost: true` (« ⏸ Pause demandée par l'animateur »), until
  `host:resume` (« ▶ Reprendre », then the 3-2-1). Players still missing keep it paused: a second
  `host:resume` is « Continuer sans… ». A phase change (`host:next` / `host:end`) ends it.
- **« Télécommande »** (T39, host remote on a phone): the TV's « 📱 Télécommande » dialog shows
  (on demand only) a QR code to `<origin>/remote/<PIN>#<remoteToken>` — 24 random bytes,
  separate from the `hostToken`, in the fragment so it never reaches HTTP logs; kept in the phone's
  `localStorage` per PIN. A remote gets the host events (it joins `game:<PIN>` + `game:<PIN>:host`)
  but **never counts as the TV** (`hostMissing` unchanged); every host action accepts its
  `remoteToken`; it alone gets the answer (`remote:answer`, `answerText(q)` + explanation, PIN
  zone). « Déconnecter la télécommande » = new token, remotes told (`remote:revoked`) and dropped.
  In memory only (`Game.ts`), no DB.

## 3. Scoring

- Correct answer: `points = round(basePoints * (1 - (responseMs / timeLimitMs) / 2))`
  (`basePoints` default 1000; 0 / 1000 / 2000 per question setting). Wrong / no answer: 0.
- Streak bonus: `streak` = consecutive correct answers including this one (reset to 0 by a
  wrong or missing answer). A correct answer earns `min(100 * (streak - 1), 500)` extra points
  (1st → +0, 2nd → +100, …, 6th and later → +500), added to `pointsEarned` and the total score.
  A 0-point question awards no bonus but still extends the streak.
- `responseMs` is measured **on the server** from the `ANSWERING` start.
- **Media** (any question type, optional, host screen only — phones never get them):
  `audio: { url, startSec ≥ 0, durationSec 5–30 (default 15) }` — the excerpt plays from the start
  of `ANSWERING`, looped, stops at `REVEAL`, pauses with the game and resumes after the 3-2-1
  (`audioOnReveal: true` = plays once at `REVEAL` instead); the other host sounds are ducked
  meanwhile (`apps/web/src/host/clipPlayer.ts`). TV volumes (T41, « 🔊 Son » in the TV header,
  `host/soundSettings.tsx`, `localStorage`): « Musique et effets » (every other host sound) and
  « Extraits du quiz » (the clip), 0–100 % each, plus « Tout couper ». `imageEffect` (`blur` 30 px
  → 0, `zoom` ×6 on a point → ×1, `pixelate` 8 blocks → full; only with `imageUrl`): the picture
  clears up over the answering time (frozen while paused), fully clear at `REVEAL`
  (`apps/web/src/components/RevealImage.tsx`). Scoring is unchanged (faster = more points).
- **« Annuler ma réponse »** (T43, `apps/server/src/game/answerCancel.ts` + `Game.unanswer`):
  during `ANSWERING` the « Réponse envoyée ! » screen offers « ↩︎ Annuler ma réponse »
  (`player:unanswer`): the answer is removed (`answer:count` goes down), the phone goes back to the
  answer screen and the next answer is scored from **its own** time. Every type except « Buzzer »
  questions, `DRAW` and `BLUFF` (`answerCancellable` in shared); refused while paused
  (`GAME_PAUSED`), for a Copieur's copied answer, and after `MAX_ANSWER_CANCELS` (3) per question
  per player (`CANCEL_REFUSED`). Copieur: when the **target** cancels, the copies of its answer are
  removed too (copiers of copiers included) and redone when it answers again. Jokers already played
  stay played (still one per question) and apply to the new answer (Double, Bouclier, Voleur at the
  reveal; a Sablier halves the new time); a player who cancelled can be hit by a Gel / Brouilleur
  (no answer any more) and a frozen player can't answer again during the freeze.
- **Explanation** (T37, any question type, optional): `explanation` (≤ 300 characters,
  `EXPLANATION_MAX_LENGTH`, trimmed, empty = none) — « 💡 Le saviez-vous ? ». Sent **only from
  REVEAL on** (`question:reveal.explanation` to the TV, `player:result.explanation` to each phone,
  re-sent by both resyncs), never in `question:show` / `question:prompt`; saved on
  `QuestionResult.explanation` for the report.
- **« Select all »** (T37): an `MCQ` with **2 or more** correct choices, not played with the buzzer
  (`isMultipleAnswer`). Phones toggle the shapes and send them with « Valider » as
  `choiceIndexes`; right **only if the set equals the correct choices** (no partial points), then
  the usual time points (from the validation), streak, team averages, « Survie » heart. Every
  ticked choice counts in `distribution`; `RevealDetails.multiple.allFound` = players who ticked
  exactly the right set. Jokers as usual: 50/50 hides wrong choices, Copieur copies the whole
  selection, Brouilleur's grey buttons become toggles. Single-answer MCQ, TRUE_FALSE and POLL are
  unchanged (one tap).
- **Question types** (`Question.type`): `MCQ` and `TRUE_FALSE` (shape buttons, ≥ 1 correct
  choice), plus:
  - `TYPE_ANSWER` (réponse libre): players type ≤ 40 characters; correct if it matches one of the
    1–10 `acceptedAnswers` (`MAX_ACCEPTED_ANSWERS`) after normalizing both sides (trim, lower case, no accents /
    punctuation / extra spaces, leading article le/la/les/l'/un/une/des ignored). With
    `typoTolerance` (default on) a Levenshtein distance of 1 is accepted for normalized answers
    of 5–9 characters, 2 for 10+; answers containing a digit must match exactly
    (`apps/server/src/game/matching.ts`). Points as above.
  - `POLL` (sondage): 2–4 choices, no correct answer, 0 points for everyone; the streak is
    left **unchanged** (neither broken nor extended, answered or not).
  - `SLIDER` (curseur): `slider { min, max, step, correct, margin, unit? }`; a guess in
    [min, max] is correct if `|guess − correct| ≤ margin`, and earns the time-based points ×
    `(1 − 0.5 × distance / margin)` (exact = full, edge = half; margin 0 = exact only, full
    points). Outside the margin: wrong, 0 points, streak broken.
  - `ORDER` (remettre dans l'ordre, T27): 3–6 different `items`, stored in the right order; TV and
    phones show them shuffled (one shuffle per question, never leaving an item in its place) and
    labelled A, B, C…; players answer `order` = shown indexes, first to last. Points = time-based
    points × share of items in the right place; only a fully right order is correct (streak).
  - `PIN` (point sur l'image, T27): `imageUrl` required, no `imageEffect`, `zone { x, y, radius }`
    in picture fractions (x in widths, y in heights — an ellipse on a non-square picture). The
    phones get the picture for this type only. Inside the zone: correct, full time-based points;
    outside: wrong, half the points at the edge fading to 0 at 0.2 beyond it
    (`apps/server/src/game/questionTypes/pin.ts`).
  - `WHO_OF_US` (« Qui de nous ? », T27): players vote for a player of the game (oneself
    included). No right answer, streak unchanged; with `majorityBonus` the voters of the most
    voted player(s) (ties included) get +200 (`WHO_OF_US_MAJORITY_BONUS`), else 0.
  - `WORD_CLOUD` (nuage de mots, T27): free text ≤ 20 characters, grouped after normalization like
    typed answers; no right answer, 0 points, streak unchanged.
  - `BLUFF` (« Mytho ! », T26, Fibbage-like): `truth` (≤ 40 characters) + `voteTimeSec` (5–120,
    default 20; `timeLimitSec` default 45 = writing time). `ANSWERING` has two **stages** (same
    phase, new timer — the pause, the 3-2-1 and the rejoin work as usual): **write** — each phone
    sends a lie (`player:answer { text }`, stored, not scored, a new one replaces it; refused
    with `LIE_TOO_CLOSE` when `matchesAnswer(lie, [truth], typoTolerance = true)`); ends when
    every awaited player wrote one, on the timer or on `host:next` → **vote** — the lies (merged
    after normalization, first spelling kept) + the truth, shuffled once, are the options; each
    phone votes `{ choiceIndex }` (the scored answer, through `recordAnswer`), never for its own
    lie (`INVALID_PAYLOAD`). Finding the truth = `basePoints` (correct, streak); each player who
    voted for your lie = `basePoints × BLUFF_FOOL_SHARE` (+500), added at the reveal even without
    a vote. No time points. Phones never get which option is true before the reveal. A kicked
    player's lie is dropped while writing. Jokers: Copieur copies the vote (a copied vote for
    one's own lie scores nothing), 50/50 hides half of the others' lies once the vote starts, Gel
    blocks the first 5 s of the vote, no Brouilleur nor Sablier
    (`apps/server/src/game/questionTypes/bluff.ts`).
  - `DRAW` (« Dessine-moi », T30, Pictionary-like): `words` (0–30, ≤ 30 characters; none = the
    built-in French list `DRAW_WORDS`, no word twice in a game), `timeLimitSec` default 90, no
    `imageUrl` (the TV shows the drawing). At `QUESTION_INTRO` the server picks the **drawer**:
    among the connected players, one who drew the fewest times (everyone draws before anyone
    draws twice; join order; team mode: the teams take turns) and a word. Only the drawer's
    `question:prompt` has the word (TV: blanks `wordHint`); the drawer sends stroke chunks
    (`player:draw`, integer points in a 1000 × 750 space, throttled every 60 ms by the phone,
    ≤ 1000 strokes / 20 000 points), relayed to the host room (`draw:strokes`), never images.
    The others guess with `player:answer { text }` as often as they like: matched like typed
    answers (typo tolerance on), a wrong guess is not recorded (ack `guess: 'wrong'`, or
    `'close'` = « Presque ! »: one typo more than accepted, or a word of the answer), a right one
    is the scored answer (time-based points, streak; `game:state.draw.found` tells everyone who
    found it, never what was typed). ANSWERING ends when every guesser found it or on the timer.
    The drawer scores `basePoints × DRAW_FINDER_SHARE` (+200) per finder, up to `basePoints`, is
    left out of the answer count, keeps their streak, and is awaited like any player (offline →
    pause; drawing refused while paused). No joker (pending attacks wait), no buzzer; « Survie »:
    never costs a heart (a ghost who finds it earns a haunt). Rejoin: the TV and the drawer's
    phone get the whole drawing back (`draw:strokes` with `clear`). The reveal (and the report)
    keeps the word, the drawer, the strokes and the finders (`apps/server/src/game/questionTypes/draw.ts`).
  `POLL`, `WHO_OF_US` and `WORD_CLOUD` are the types without a right answer
  (`NO_RIGHT_ANSWER_TYPES` / `hasRightAnswer`); the logic of the T27 / T26 / T30 types lives in
  `apps/server/src/game/questionTypes/` (hooks in `Game.ts`).
  Team averages (below) apply to every type (a poll adds 0 to every team).
- **Team mode** (`host:create` with `mode: 'teams'`, 2–4 teams = the first answer colors:
  Équipe Rouge ▲, Bleue ◆, Jaune ●, Verte ■; players pick their team in the lobby, empty teams
  are dropped at the start). Each player scores exactly as above. For each question a team earns
  `round(sum of its present members' points / number of present members)` (0 if nobody is
  present); team score = sum of these per-question averages, so teams of different sizes stay
  comparable. "Present" = connected when `ANSWERING` started, or answered anyway: a player who
  drops mid-question counts with 0, one absent for the whole question is left out. A kicked
  player stops counting from then on (points already earned by the team stay). Ties share a
  rank (competition ranks, like players).
- **Jokers** (T25; `host:create` with `jokers: true` — the start dialog's « 🃏 Jokers », on by
  default there; code `apps/server/src/game/jokers.ts`, ids/names/constants
  `packages/shared/src/jokers.ts`). Each player gets 3 different random jokers at the start and
  1 random one more each time their streak reaches 3, 6, 9… (max 5 in hand). One joker per
  question, played during `QUESTION_INTRO` / `ANSWERING`, not while paused (`JOKER_REFUSED` /
  `GAME_PAUSED` otherwise; a refused joker stays in hand). **After answering** (T42), during
  `ANSWERING`, the player can still play one (still one per question) among the jokers marked
  `afterAnswer` (Gel, Brouilleur, Voleur, Double ou rien, Bouclier, Sablier); 50/50 and Copieur are
  « before answering » only. Which jokers a question type takes comes from **one table**,
  `jokerAvailability(type)` in shared (+ `afterAnswer` per type), and the refusal reasons from
  `jokerRefusal` (server message = the phone's greyed-joker reason): `POLL` takes none (bar
  hidden), `TRUE_FALSE` no 50/50, Brouilleur only on MCQ / TRUE_FALSE.
  - 🎯 **50/50** (`fifty`): hides `min(ceil(wrong / 2), wrong − 1)` wrong choices on that phone;
    SLIDER: a range half as wide containing the answer (random position); TYPE_ANSWER: the first
    letter of the first accepted answer (leading article skipped). Refused when it would hide
    nothing.
  - 🦜 **Copieur** (`copy`, target; team mode: own team): as soon as the target answers, the
    copier gives the same answer with `responseMs = max(target's + 1 s, elapsed when played,
    own Gel)`. Target never answers → nothing. A copier is never awaited by itself (it waits for
    its target; a kicked target / copy loop → not awaited). The target stays secret (`joker:used`
    has no `target`).
  - 🥶 **Gel** (`freeze`, attack, T42: **this** question): the target's answers are refused
    (`FROZEN`) for 5 s — from the start of `ANSWERING` when played during the intro, from the
    moment it lands when played during `ANSWERING` (`effects.frozen.ms` = elapsed ANSWERING time
    when it ends; pauses excluded). « Mytho ! »: it blocks the vote (not the writing).
  - 🌀 **Brouilleur** (`scramble`, attack, T42: **this** question, MCQ / TRUE_FALSE only): the
    target's phone gets grey buttons in a shuffled order labelled with the choice texts, right
    away (`joker:state` pushed).
  - Gel / Brouilleur on a target who already answered → `JOKER_REFUSED` « X a déjà répondu »
    (joker kept); on a type they can't hit → refused with the reason. « Survie » haunts (§ Survie)
    still land on the target's **next** question that takes them.
  - ✖️2 **Double ou rien** (`double`): right → `pointsEarned` ×2 (streak bonus included); wrong /
    no answer → −500 (the total never goes below 0).
  - 🛡️ **Bouclier** (`shield`): arms a shield that blocks the next attack aimed at the player
    (announced `blocked`), and a wrong answer on this question keeps the streak.
  - 🦹 **Voleur** (`thief`, attack): if the thief is right, `round(10 % × target's total)` after
    this question's points moves from the target to the thief (both `pointsEarned` change).
  - ⏳ **Sablier** (`hourglass`): speed points computed with `responseMs / 2` (played after
    answering: the recorded answer is scored again with half its time).
  Attacks (Gel, Brouilleur, Voleur): one per target per question; team mode: other teams only.
  Team averages use the points after the jokers (a negative member pulls the average down; a
  team score never goes below 0). Order at REVEAL: question points + streak bonus → Double →
  Voleur → new jokers for streaks.
- **Survie** (T31; `host:create` with `mode: 'survival'`, `hearts` 1–5, default 3 — the start
  dialog's « 💀 Survie », exclusive with Équipes, compatible with the Jokers option; code
  `apps/server/src/game/survival.ts`, hooks in `Game.ts`, constants `packages/shared/src/survival.ts`).
  Everyone starts with `hearts` ❤️. At REVEAL, a living player whose answer isn't `correct`
  (wrong or missing) loses one — so ORDER / PIN partial points count as wrong, and for BLUFF not
  voting for the truth costs one. Never on POLL / WHO_OF_US / WORD_CLOUD (`hasRightAnswer`), nor
  for a player excused with « Continuer sans » or absent for the whole question (not present, no
  answer — same "present" as the team averages). At 0 the player becomes a 👻 **fantôme**: keeps
  answering and scoring, and each correct ghost answer earns one **haunt**: `player:haunt` gives
  a living player a free Gel or Brouilleur (the T25 effects, through the joker engine — which every
  « Survie » game has, without hands when the Jokers option is off) landing on their next
  question; a Bouclier blocks it; one pending haunt of each kind per target; usable from the
  start to the podium, not while paused. Points are scored as usual. **End:** when at most one
  player is alive (none, for a game started alone) after a REVEAL, `host:next` on that
  LEADERBOARD goes to PODIUM (`survival:state.finished`); kicks count. **Ranking:** the living
  first, then the ghosts eliminated last; ties in the same group by points (then competition
  ranks). Bouclier doesn't save a heart (only the streak).
- **Buzzer** (T28; question option `buzzer: true`, on `BUZZER_QUESTION_TYPES` = MCQ, TRUE_FALSE,
  TYPE_ANSWER, SLIDER, ORDER — the types with an answer one can say out loud; code
  `apps/server/src/game/buzzer.ts` + hooks in `Game.ts`). The TV shows the question without its
  choices (ORDER keeps its items; picture, effect and sound clip as usual); phones get one BUZZ
  button. During `ANSWERING`, the first `player:buzz` the server processes takes the hand: the
  timer freezes (`game:state.buzzer.holder`, frozen `remainingMs`), the player answers out loud,
  the host judges with `host:judge { correct }` (allowed while paused). ✅ → that player's answer
  is right, `basePoints` (no time factor) + the usual streak bonus, REVEAL. ❌ → the player can't buzz
  again (`ALREADY_ANSWERED`), the timer and the sound clip go on from where they stopped; when
  everyone has answered wrong, the locks are lifted and everyone can buzz again (`game:state.buzzer.wrong`
  = who is locked right now; the reveal lists every wrong answer). Only a right answer or the
  timer ends the question (nobody scores); a wrong buzz counts once (streak, « Survie » heart). Usual streak rules (not buzzing =
  no answer = streak reset); team averages as usual; « Survie »: a wrong buzz costs a heart, not
  buzzing doesn't. Jokers: none can be played (`jokerAvailability(type, buzzer = true)`), but a
  pending Gel (or haunt) lands and refuses the BUZZ for 5 s of clock time (`FROZEN`); Brouilleur
  waits for a later question. Pause: a holder / host who drops pauses the game as usual (the
  clock stays frozen after the 3-2-1 until judged); kicking the holder frees the hand. The TV hides
  the answer behind « 👁 Voir la réponse (animateur) ».

- **« ✅ Accepter aussi cette réponse »** (T44; `host:accept`, code `apps/server/src/game/rejudge.ts`,
  hooks in `Game.ts`): at the REVEAL of an MCQ / TRUE_FALSE (a refused choice), a TYPE_ANSWER (a
  refused typed group) or a SLIDER (a wider margin) — not au buzzer, not the other types
  (`acceptKind` in shared) — the host (TV or remote) makes a refused answer right too. Just before
  the reveal's settlement the game saves what it changes (`Settlement`: scores, correct counts,
  streaks, team scores / gains, joker hands / results / Sablier points, « Survie » lives, the report
  entry); an accept restores it, judges every answer again from the answer **as given** with all the
  accepts so far (`rejudgeAnswer`: a newly right answer gets its time-based points from its real
  time — halved by a Sablier —; an accept never makes a right answer wrong; SLIDER: every guess is
  scored again with the wider margin) and settles again: streak + bonus, Double / Bouclier / Voleur,
  team averages, « Survie » heart given back (an elimination undone, so `finished` may go back to
  false; haunts spent since the reveal stay spent), `gained` of the next leaderboard, the report
  entry replaced. Jokers earned for a streak come from the same random draws (`ReplayRandom`).
  « Select all »: the accepted choice joins the set to tick (players who ticked the quiz's own set
  stay right). Accepting what is already right is a no-op; only during the REVEAL of that question
  (`NOT_REVEALING` after « Suivant »); no undo. The fix isn't saved into the quiz (edit it in the
  editor).
- **TV themes** (T40; `QuizTheme` = `classic` (default) | `halloween` | `christmas` | `retro` |
  `space`, `Quiz.theme`, overridable per game by the start dialog → `host:create.theme`). The
  server resolves the game's theme (override, else the quiz's) and sends it in `game:state.theme`
  (absent = classic, so also in both resyncs). One file per theme in `apps/web/src/themes/`: CSS
  variables (`--color-brand`, `--theme-bg` / `-panel` / `-accent` / `-text` / `-timer` /
  `-font`, Tailwind `bg-panel`, `text-accent`, `stroke-timer`, `font-display`), a local display
  font (`@fontsource/*`, OFL), an animated background layer (`backgrounds.tsx` + `themes.css`:
  ≤ 30 elements, transforms / opacity only, moving pieces hidden with `prefers-reduced-motion`),
  confetti shapes, a lobby title and its own lobby music / reveal / podium sounds
  (`public/sounds/<name>-<theme>.wav`, synthesized CC0 by `generate-sounds.mjs`; `soundFile` in
  `host/sounds.ts`). **Never themed:** the answer colors and shapes, the question text, the
  explanation card, the scoring. Phones: only the waiting screens (lobby, get ready, answered,
  standings, podium) follow it (`followsTheme`); answer / result screens keep the classic look.

## 4. Socket protocol (source of truth = `packages/shared/src/events.ts`)

Rooms: `game:<PIN>` (everyone), `game:<PIN>:host` (host sockets only: the TV and the paired
remotes). Remote-only events (`remote:answer`, `remote:revoked`) and `tv:control` are sent to the
remote / TV sockets one by one (the game tracks them), never to a room.

**Host actions** (`host:start`, `next`, `kick`, `moveplayer`, `shuffle`, `pause`, `resume`, `judge`, `accept`,
`end`) carry `{ pin, hostToken }` **or** `{ pin, remoteToken }` (T39; `host:rejoin` and
`host:remote` need the `hostToken`). The tables below write `hostToken` for short.

Every client → server event takes an ack callback receiving
`{ ok: true, ...data }` or `{ ok: false, error: { code, message } }` (`Ack<T>` in shared).

### Host → server
| Event | Payload | Notes |
|---|---|---|
| `host:create` | `{ quizId, mode?: 'solo' \| 'teams' \| 'survival', teamCount?: 2 \| 3 \| 4, jokers?: boolean, hearts?: 1–5, theme?: QuizTheme }` | default solo / 2 teams / no jokers / 3 hearts (« Survie » only) / the quiz's theme (T40); ack `{ pin, hostToken }`, then `game:state` + `lobby:players` (+ `lobby:teams`). Host = `lbq_session` cookie of the socket handshake (or handshake `auth.token`); own quizzes + quizzes shared with the host (T45) + other hosts' `PUBLIC` quizzes (`UNAUTHORIZED` / `QUIZ_NOT_FOUND`, also for another host's private quiz); `quizId: 'demo'` works without login |
| `host:start` | `{ pin, hostToken }` | LOBBY → QUESTION_INTRO. Team mode: `TEAMS_NOT_READY` unless every player has a team and ≥ 2 teams have players |
| `host:next` | `{ pin, hostToken }` | advance phase |
| `host:kick` | `{ pin, hostToken, playerId }` | |
| `host:moveplayer` | `{ pin, hostToken, playerId, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED`) |
| `host:shuffle` | `{ pin, hostToken }` | team mode, LOBBY only: random balanced teams for every player |
| `host:end` | `{ pin, hostToken }` | → ENDED |
| `host:judge` | `{ pin, hostToken, correct: boolean }` | « Buzzer » (§3): ✅ / ❌ on the answer said out loud by the player who has the hand (allowed while paused); `INVALID_PAYLOAD` when nobody has it |
| `host:accept` | `{ pin, hostToken, questionIndex }` + exactly one of `choiceIndex` (MCQ / TRUE_FALSE) \| `text` (TYPE_ANSWER, ≤ 40) \| `margin` (SLIDER, > 0) | « ✅ Accepter » (T44, §3), REVEAL of `questionIndex` only (`NOT_REVEALING` otherwise), `INVALID_PAYLOAD` for a type that doesn't take it; then `game:state`, `survival:state`, `question:reveal` and every `player:result` again |
| `host:resume` | `{ pin, hostToken }` | « Continuer sans… » while paused: the missing players become absent for the current question, then `game:resuming` (no-op when not paused) |
| `host:pause` | `{ pin, hostToken }` | « ⏸ Pause » (T39), QUESTION_INTRO / ANSWERING only (`NOT_ANSWERING` otherwise): see §2 « Manual pause » |
| `host:remote` | `{ pin, hostToken, revoke?: true }` | TV only: ack `{ remoteToken }` (created the first time); `revoke` = new token, paired remotes get `remote:revoked` and are dropped |
| `host:rejoin` | `{ pin, hostToken }` | host screen reloaded / socket reconnected: re-attaches the socket as host (`GAME_NOT_FOUND` / `UNAUTHORIZED` otherwise), then re-sends to it `game:state`, `lobby:players`, `lobby:teams` (team mode), + `question:show` (question phases and LEADERBOARD), `answer:count` (ANSWERING, REVEAL), `question:reveal` (REVEAL), `leaderboard` (LEADERBOARD), `podium` (PODIUM, ENDED), `remote:status` |

### Remote → server (« Télécommande », T39)
| Event | Payload | Notes |
|---|---|---|
| `remote:join` | `{ pin, remoteToken }` | pairs the socket (`UNAUTHORIZED` for a wrong / revoked token, `GAME_NOT_FOUND`), then the `host:rejoin` resync + `remote:answer`; sent again on every reconnection |
| `remote:tv` | `{ pin, remoteToken, action: 'mute' \| 'unmute' \| 'replay' \| 'music-down' \| 'music-up' }` | relayed to the TV sockets as `tv:control` (🔇 / 🔊 « Tout couper », ↻ the sound clip, « Musique − / + » = the « Musique et effets » level by 20 %, T41) |

### Player → server
| Event | Payload | Notes |
|---|---|---|
| `player:join` | `{ pin, nickname, avatar? }` | `avatar` = an `AvatarId` (`AVATARS` in `packages/shared/src/avatars.ts`, 20 Batman: The Animated Series portraits, images in `apps/web/public/avatars/<id>.jpg`; unknown id → `INVALID_PAYLOAD`, missing → random, preferably not taken); several players may share one. Ack `{ playerId, sessionToken, avatar }`. **Started game:** takes the place of the *disconnected* player with that nickname (case-insensitive) → ack `{ playerId, sessionToken, avatar, reclaimed: true, nickname, totalScore }` + the usual resync; the old session token is revoked. Connected player → `NICKNAME_TAKEN`, unknown nickname / ENDED → `GAME_ALREADY_STARTED` |
| `player:avatars` | `{ pin }` | join screen, before joining: ack `{ taken: AvatarId[], started: boolean }` (avatars already in that game, shown dimmed as a hint; `started` → the join screen offers to take a disconnected player's place); `GAME_NOT_FOUND` |
| `player:rejoin` | `{ pin, sessionToken }` | after disconnect; ack `{ playerId, nickname, avatar, totalScore }`, then server re-sends current `game:state` (+ `lobby:teams` in team mode, `question:prompt` if ANSWERING) |
| `player:team` | `{ pin, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED` afterwards); can switch until the start |
| `player:joker` | `{ pin, questionIndex, joker, targetId? }` | games with jokers (§3 "Jokers"): `joker` = `fifty` \| `copy` \| `freeze` \| `scramble` \| `double` \| `shield` \| `thief` \| `hourglass`, `targetId` for copy / freeze / scramble / thief; then `joker:used` + `joker:state`. `JOKER_REFUSED` (not in hand, one per question, 50/50 or Copieur after answering, Gel / Brouilleur on a target who answered, wrong target / phase / question type), `GAME_PAUSED` |
| `player:buzz` | `{ pin, questionIndex }` | « Buzzer » question during ANSWERING: takes the hand (first processed wins). `BUZZER_TAKEN` (someone has it), `ALREADY_ANSWERED` (out after a wrong answer), `FROZEN` (Gel), `GAME_PAUSED`, `NOT_ANSWERING` |
| `player:haunt` | `{ pin, haunt: 'freeze' \| 'scramble', targetId }` | « Survie » (§3): a ghost with a haunt in stock, on a living player (not oneself); then `joker:used` (`haunt: true`) + `survival:state`. `JOKER_REFUSED` (alive, no haunt, target a ghost / already haunted that way, LOBBY / PODIUM / ENDED), `GAME_PAUSED` |
| `player:answer` | `{ pin, questionIndex }` + exactly one of `choiceIndex` \| `choiceIndexes` (« select all » MCQ only, 1–4 indexes; a single `choiceIndex` there, or `choiceIndexes` elsewhere → `INVALID_PAYLOAD`) \| `text` \| `value` \| `order` \| `point` \| `playerId` | accepted once, only during ANSWERING (`FROZEN` during a Gel, `ALREADY_ANSWERED` for a Copieur); `choiceIndex` for MCQ / TRUE_FALSE / POLL, `text` (≤ 40) for TYPE_ANSWER and WORD_CLOUD (cut at 20), `value` (in [min, max]) for SLIDER, `order` (permutation of the shown item indexes) for ORDER, `point { x, y }` (0–1) for PIN, `playerId` (a player of the game) for WHO_OF_US — another kind → `INVALID_PAYLOAD` « Dessine-moi »: a guess, ack `{ guess: 'found' \| 'close' \| 'wrong' }` (only `found` is recorded; the drawer → `INVALID_PAYLOAD`) |
| `player:unanswer` | `{ pin, questionIndex }` | « Annuler ma réponse » (T43, §3), ANSWERING: removes the answer; ack `{ cancelsLeft }`. `CANCEL_REFUSED` (« Buzzer » / DRAW / BLUFF question, copied answer, no answer, 3 cancels used), `GAME_PAUSED`, `NOT_ANSWERING` |
| `player:draw` | `{ pin, questionIndex, strokes: DrawStroke[] (≤ 20), clear? }` | « Dessine-moi », the drawer during ANSWERING: stroke chunks (`{ id, color, size, erase?, points }`, a known `id` = points appended), relayed to the TV as `draw:strokes`. `GAME_PAUSED`, `NOT_ANSWERING`, `INVALID_PAYLOAD` (not the drawer, drawing too big) |

### Server → clients
| Event | To | Payload |
|---|---|---|
| `game:state` | all | `{ phase, mode, questionIndex, totalQuestions, remainingMs?, paused? }` (`questionIndex` = -1 in LOBBY; `remainingMs` avoids clock skew, frozen value while paused; `paused` = `{ waitingFor: { id, nickname, avatar }[], hostMissing, sinceMs, byHost?: true }` (`byHost`: « ⏸ Pause » pressed by the host, T39), `waitingFor` empty during the resume countdown; `jokers: true` in games with jokers; `theme` = the TV theme, absent = `classic`; `quizTitle` = the quiz title (T47: TV lobby + header, phone lobby, remote); `introMs` during QUESTION_INTRO = its whole length, T42) + « Buzzer » question during ANSWERING: `buzzer: { holder?: LobbyMember, wrong: LobbyMember[] }` (who has the hand — `remainingMs` is then the frozen value — and who answered wrong, in order) + « Dessine-moi » question during QUESTION_INTRO / ANSWERING: `draw: { drawer?: LobbyMember, found: LobbyMember[] }` |
| `game:resuming` | all | `{ inMs }` — 3-2-1 countdown before a paused game resumes (also re-sent on rejoin) |
| `lobby:players` | host | `{ players: { id, nickname, avatar, teamId?, offline? }[] }` (re-sent when a player drops / comes back) |
| `lobby:teams` | all | team mode only: `{ teams: { id, name, members: { id, nickname, avatar }[] }[] }` — every team in LOBBY, the teams in play from the start on; re-sent on any change (join, team choice, kick) |
| `question:show` | host | `{ index, type, text, imageUrl?, choices: string[], timeLimitSec, slider?, audio?, audioOnReveal?, imageEffect? }` (`choices` empty for TYPE_ANSWER / SLIDER; `slider` = `{ min, max, step, unit? }`, never the answer; media of §3 "Media": `audio` = `{ url, startSec, durationSec }`, `audioOnReveal: true`, `imageEffect` = `blur` \| `zoom` \| `pixelate`, absent = none; ORDER `items` (shuffled, as on the phones), WHO_OF_US `candidates: LobbyMember[]`; BLUFF `bluff` = `{ stage: 'write' }` \| `{ stage: 'vote', options }` — re-sent when the vote starts, then with `timeLimitSec` = `voteTimeSec`); « Buzzer »: `buzzer: { answer: string[] }` (the right answer in words for the host to judge, `buzzerAnswer`), `choices` empty and no `slider` (ORDER keeps its `items`); DRAW `draw: { drawer?, hint }` (blanks, never the word); `multiple: true` for a « select all » MCQ (T37) — never the `explanation` |
| `question:prompt` | players | `{ index, type, timeLimitSec }` + `choiceCount` (choice types) \| `slider: { min, max, step, unit?, start }` (`start` = where the phone slider starts, T49: random on a step, at least `margin + 10 %` of the range away from the answer) \| `maxLength: 40` (TYPE_ANSWER) / `20` (WORD_CLOUD) \| `items` (ORDER, shuffled — never in the right order) \| `imageUrl` (PIN only — never the zone) \| `candidates: LobbyMember[]` (WHO_OF_US) \| `bluff` (BLUFF, per phone: `{ stage: 'write', maxLength: 40, lie? }`, then a new prompt `{ stage: 'vote', options, own? }` with `timeLimitSec` = `voteTimeSec` — never which option is true) — no text, no answer, no sound, no picture except PIN! « Buzzer » question: only `{ index, type, timeLimitSec, buzzer: true }` (one BUZZ button) DRAW: `draw: { drawer?, hint, maxLength: 40, word? }` — `word` for the drawer's phone only; `multiple: true` (« select all » MCQ, T37: toggles + « Valider ») — never the explanation |
| `answer:count` | host | `{ answered, total }` |
| `question:reveal` | host | `{ type, correctIndexes: number[], distribution: number[] }` (both empty for TYPE_ANSWER / SLIDER; `correctIndexes` empty for POLL) + TYPE_ANSWER `acceptedAnswers`, `topAnswers: { text, count, correct }[]` (top 6, grouped after normalization); SLIDER `slider` (full settings), `correct`, `margin`, `guesses: number[]`, `closest?: { nickname, value, avatar? }` (`avatar` absent in reports saved before avatars); ORDER `order: { items (right order), placed: number[] (players with the right item at each position) }`; PIN `pin: { imageUrl, zone, pins: { x, y, nickname, avatar, correct }[] }`; WHO_OF_US `votes: { nickname, avatar, count }[]` (most voted first) + `majorityBonus?: true`; WORD_CLOUD `words: { text, count }[]` (top 40); BLUFF `bluff: { truth, options: { text, truth, authors, voters }[] }` (lies that fooled the fewest first, truth last — the TV reveals them one by one) (`RevealDetails`) « Buzzer »: `buzzer: { answer, winner?, wrong }` (`distribution` empty, no type details) DRAW: `draw: { word, drawer?, strokes, found: (LobbyMember & { ms })[] }`; « select all »: `distribution` counts every ticked choice + `multiple: { allFound }`; `explanation?` (T37); T44: `accepted?: { choiceIndexes?, texts?, margin? }` (also in the report details; `correctIndexes` includes the accepted choices, `slider.margin` / `margin` = the accepted margin), TYPE_ANSWER groups `accepted?: true` and `typedAnswers` (every group, for the remote) |
| `player:result` | each player | `{ correct, pointsEarned, streak, streakBonus, totalScore, rank }` + `team?: { id, score, rank }` in team mode (`pointsEarned` includes `streakBonus`; `streak` = 0 if wrong / no answer) + `poll?: true` (POLL, WHO_OF_US, WORD_CLOUD: `correct` false; 0 points except the WHO_OF_US majority bonus) + SLIDER `yourValue?` (absent without an answer), `correctValue` + ORDER `placed?: { correct, total }` (partial points: `pointsEarned` > 0 with `correct` false, also for PIN near the zone) + WHO_OF_US `votesReceived`, `withMajority?` (absent without a vote) + BLUFF `bluff: { truth, found, lie?, fooled, fooledPoints, fellFor? }` + `jokers?: JokerResult[]` (what jokers did: `double`, `doubleLost`, `shieldSaved`, `stole`, `stolen`, `copied`, `copyMissed`, `hourglass`, `earned`; `pointsEarned` may then be negative) + « Survie » `survival: { hearts, lostHeart, eliminated?, ghost?, hauntEarned? }` (`rank` = survivor ranking) + « Buzzer » `buzzer: { answer, won, wrong, winner? }` (no type-specific fields) + DRAW `draw: { word, drawer?, drew, found, finders }` + « select all » `multiple: { correctIndexes, yours? }` + `explanation?` (T37) + `accepted?: true` (refused, then accepted by the host: « ✅ Réponse acceptée par l’animateur ! », T44) |
| `leaderboard` | host | `{ top: { nickname, avatar, score, gained, jokers?, survival? }[], teams? }` (everyone, up to 15; `gained` (T41) = what the player earned on the question just played, after jokers — may be negative, 0 without an answer; `jokers` = `{ hand, used? }` in games with jokers; `survival` = `{ hearts, eliminatedAt? }` in « Survie », ordered by the survivor ranking; `teams` in team mode = `{ id, name, score, playerCount, gained }[]`, best first, `gained` = what the team's score moved by). `podium` never has `gained` |
| `podium` | all | `{ top: { nickname, avatar, score, survival? }[], teams? }` (top 3 players; all teams in team mode) |
| `survival:state` | all | « Survie » only, from the lobby on, re-sent after each REVEAL, haunt, join, kick and in both rejoin resyncs: `{ hearts (at start), players: { id, nickname, avatar, hearts, eliminatedAt?, lastLoss?, haunts? }[], finished? }` |
| `draw:strokes` | host (+ the drawer on rejoin) | « Dessine-moi »: `{ index, clear?, strokes: DrawStroke[] }` — new chunks of the drawing (`mergeStrokes`); `clear` = start from empty (« Tout effacer », or the whole drawing re-sent on `host:rejoin` / `player:rejoin`) |
| `player:kicked` | that player | `{}` |
| `joker:state` | each player | games with jokers, sent at the start, each question, each joker played, REVEAL, kick and in the rejoin resync: `{ questionIndex, questionType?, hand, played?: { joker, target? }, shield?, others: { id, nickname, avatar, teamId? }[], attacked: string[], answered?: string[], effects }` (`answered` = who already answered this question, re-sent on each answer, T42) — `effects` (this phone only) = `hiddenChoices?`, `sliderRange?`, `firstLetter?`, `frozen?: { ms, by }` (answers refused until `ms` of ANSWERING), `scrambled?: { by, choices: { index, text }[] }`, `copied?` (`buzzer: true` on a « Buzzer » question: no joker playable) |
| `joker:used` | all | `{ questionIndex, joker, by, target?, blocked?, haunt? }` (TV announcement; no `target` for Copieur; `haunt: true` = a « Survie » ghost's Gel / Brouilleur; never re-sent) |
| `remote:answer` | each remote | `{ index, answer: string[], pin?: { imageUrl, zone }, explanation? }` at each QUESTION_INTRO and in its resync — `answerText(q)` (« Dessine-moi »: the word drawn; [] without a right answer); never sent to the TV nor the phones |
| `remote:revoked` | each remote | `{}` — the TV revoked the token (the socket leaves the rooms) |
| `remote:status` | host room | `{ remotes }` — remotes connected (TV indicator + toast), also in the host resync |
| `tv:control` | the TV sockets | `{ action }` from `remote:tv` |
| `error` | sender | `{ code, message }` |

Choice index ↔ shape/color (fixed): `0 = red ▲`, `1 = blue ◆`, `2 = yellow ●`, `3 = green ■`.
Team id = the same index (`TeamId` 0–3, names in `TEAM_NAMES`).

## 5. Data model (Prisma, `apps/server/prisma/schema.prisma`)

- `User` — id, email (unique, lowercased), name, passwordHash? (scrypt; null for accounts
  created through Firebase), firebaseUid? (unique, T46), createdAt
- `Session` — id (= SHA-256 of the host's session token), userId, expiresAt (30 days)
- `PasswordResetToken` — id (= SHA-256 of the token in the e-mailed link), userId, expiresAt
  (1 hour), usedAt? (single use), createdAt; a new request deletes the user's unused ones
- `Quiz` — id, ownerId → User, title, description, coverImageUrl, visibility (`PRIVATE` |
  `PUBLIC`, default `PRIVATE`: public quizzes are in the library), theme (`QuizTheme` enum, default
  `classic`, T40), createdAt, updatedAt
- `QuizShare` (T45) — quizId → Quiz, userId → User (primary key = both, cascades on delete), role
  (`ShareRole`: `viewer` « Peut lancer » | `editor` « Peut modifier »), createdAt
- `Question` — id, quizId, order, text, imageUrl?, type (`MCQ` | `TRUE_FALSE` | `TYPE_ANSWER` |
  `POLL` | `SLIDER` | `ORDER` | `PIN` | `WHO_OF_US` | `WORD_CLOUD` | `BLUFF` | `DRAW`), timeLimitSec (default 20),
  basePoints (default 1000), config? (JSON: TYPE_ANSWER `{ acceptedAnswers, typoTolerance }`,
  SLIDER `{ slider }`, ORDER `{ items }`, PIN `{ zone }`, WHO_OF_US `{ majorityBonus }`, BLUFF `{ truth, voteTimeSec }`, DRAW `{ words }`), audioUrl?, audioStartSec?,
  audioDurationSec?, audioOnReveal? (null = false), imageEffect? (`none` | `blur` | `zoom` |
  `pixelate`, null = none), buzzer (bool, default false: « Buzzer » option, T28), explanation?
  (T37, null = none)
- `Choice` — id, questionId, order (0–3), text, isCorrect (MCQ / TRUE_FALSE / POLL; always false
  for a poll)
- `GameSession` — id, quizId? (null once the quiz is deleted), quizTitle (snapshot), hostId, pin,
  mode (`solo` | `teams` | `survival`), jokers (bool, default false), hearts? (« Survie »: hearts
  at start), startedAt, endedAt
- `PlayerResult` — id, gameSessionId, nickname, avatar? (null for games saved before avatars), score, correctCount, rank, teamId? (team mode), jokersUsed (`String[]`, default empty: joker ids played, in order), hearts? / eliminatedAt? (« Survie »: hearts left, question index of the elimination — null for a survivor)
- `TeamResult` — id, gameSessionId, teamId, name, score, playerCount, rank (team mode)
- `Media` — name (id: content hash + extension, the file name of `/uploads/<name>`), contentType,
  size, data (bytes), createdAt: uploaded pictures and sounds
- `QuestionResult` — id, gameSessionId, index, type (default MCQ), text, choices[],
  correctIndexes[], distribution[], playerCount, correctCount, answerCount? (null for older games
  = sum of distribution), details? (JSON `RevealDetails`: typed answers / slider guesses / order /
  pins / votes / words / lies / drawing / « select all » count), explanation? (T37, snapshot)
  (snapshot of each revealed question, for the game report)

Live game state stays in memory (`Map<pin, Game>`) in a single server process (small games: ~6 players, 15 max).
Quiz loading, socket auth and result saving go through `GamePersistence`
(`apps/server/src/game/persistence.ts`). When a game reaches ENDED, a logged-in host's game
(if it left the lobby) is saved as `GameSession` + `PlayerResult`s + `QuestionResult`s (+ `TeamResult`s); anonymous
demo games are not. A game reaches ENDED by `host:end` (any phase), or through the sweep (`GameManager.sweep`, every
minute) when abandoned: no host screen connected for 10 min, or no activity for 2 h. Players
kicked after the start are saved too, ranked below the remaining players (who keep the podium
order); players kicked in the lobby are not.

## 6. REST API (prefix `/api`)

Contract: `packages/shared/src/api.ts` (zod request bodies + response types). Errors are
`{ error: { code, message } }` (`ApiErrorBody`). Everything except register/login/logout and
forgot/reset-password requires a host session: httpOnly cookie `lbq_session` (set by register/login; web uses
`credentials: 'include'`) **or** `Authorization: Bearer <token>`. Another host's resources
answer 404. Code: routes in `apps/server/src/api`, auth helpers in `apps/server/src/auth`
(`getUserBySessionToken` is reusable for socket auth).

- `POST /auth/register` `{ email, name, password }` → 201 `AuthResponse { user, token }`;
  `POST /auth/login` `{ email, password }` → `AuthResponse`; `POST /auth/logout` → 204;
  `GET /auth/me` → `PublicUser`. Login: 10 failed attempts / 15 min per IP + e-mail → 429
  `TOO_MANY_ATTEMPTS` (in-memory counters, `apps/server/src/auth/rateLimit.ts`)
- Password (T24): `POST /auth/forgot-password` `{ email }` → **always 204** (no account
  enumeration; 3 requests / hour per e-mail and 10 / hour per IP, beyond = nothing sent) and, if
  the account exists, an e-mail (`apps/server/src/mail/`, nodemailer over `SMTP_URL`, Mailpit in
  dev, server log in production without SMTP) with `<PUBLIC_WEB_URL or CORS_ORIGIN or request
  Origin>/reset-password?token=…` (32 random bytes, 1 hour, single use);
  `POST /auth/reset-password` `{ token, password }` → `AuthResponse` + cookie (every other
  session revoked) or 400 `RESET_TOKEN_INVALID`; `POST /auth/change-password`
  `{ currentPassword, newPassword }` (logged in) → 204 (other sessions revoked, this one kept) or
  400 `WRONG_PASSWORD`
- **Firebase Auth** (T46, `apps/server/src/auth/firebase.ts`): on when the server has
  `FIREBASE_PROJECT_ID` + `FIREBASE_API_KEY`. `GET /auth/config` → `AuthConfig` (`{ firebase:
  FirebaseWebConfig }`, or `{}` for local accounts — the web app reads it, nothing is baked in
  the build). The web app signs in with the Firebase SDK (Google popup or e-mail / password) and
  sends the ID token: `POST /auth/firebase` `{ idToken, name? }` → `AuthResponse` + the usual
  `lbq_session` cookie (so sockets, quizzes, sharing… are unchanged). The token is checked
  without a service account (`jose`, Google's public keys, RS256, `aud` = project id, `iss` =
  `https://securetoken.google.com/<project>`, `auth_time` in the past). Account = the one with
  that `firebaseUid`, else the one with that e-mail — **linked only if Firebase verified the
  e-mail** (403 `EMAIL_NOT_VERIFIED` otherwise: the web app sends the confirmation e-mail) —,
  else a new one (name from the body, the token, or the e-mail). Invalid token → 401
  `FIREBASE_TOKEN_INVALID`; local mode → 404. In Firebase mode register / login /
  forgot-password / reset-password / change-password answer 404 `LOCAL_AUTH_DISABLED`
  (passwords and reset e-mails are Firebase's); `PublicUser.firebase: true` for linked accounts
- `GET/POST /quizzes`, `GET/PUT/DELETE /quizzes/:id`, `POST /quizzes/:id/duplicate`
  (body `QuizInput` = `QuizSchema` without `id` + optional `visibility` — absent = `PRIVATE` on
  creation, unchanged on update — and optional `theme`, same rule with `classic`; PUT replaces all
  questions). `QuizDetail`, `QuizSummary` and `LibraryQuiz` have `theme` (copies keep it).
  Access (T45): GET + duplicate = owner or any shared host; PUT = owner or `editor` (an editor's
  `visibility` is ignored); DELETE = owner only (others: 404). `QuizDetail.access` (`owner` |
  `editor` | `viewer`) + `ownerName`. Co-editing: PUT may carry `expectedUpdatedAt` (the
  `updatedAt` the client loaded) → 409 `QUIZ_CONFLICT` if the quiz was saved in between.
- Sharing (T45, owner only — others 404): `GET /quizzes/:id/shares` → `QuizShareInfo[]`
  (`{ user: { id, name, email }, role, createdAt }`); `POST /quizzes/:id/shares` `{ email, role? }`
  (default `viewer`; again = change the role) → 201 `QuizShareInfo`, 404 `USER_NOT_FOUND`, 400 for
  one's own e-mail; `DELETE /quizzes/:id/shares/:userId` → 204 (also allowed for the shared host
  itself: « Ne plus voir »). `GET /shared-quizzes` → `SharedQuizSummary[]` (`QuizSummary` + `role`,
  `ownerName`, `sharedAt`), never in `GET /quizzes`.
  `QuizSummary` has `visibility` and `playCount` (games played with it by any host); copies
  (duplicate, library copy) are always `PRIVATE`, title + " (copie)"
- `GET /library?search=&sort=popular|newest` → `LibraryQuiz[]`: `PUBLIC` quizzes of the **other**
  hosts (title search, case-insensitive; max 100), with `authorName`, `questionCount`,
  `playCount` — no questions, so never the answers. `POST /library/:id/copy` → 201
  `QuizDetail`: private copy owned by the current host (404 if the quiz is not public)
- `POST /uploads/image` (multipart, field `file`, PNG/JPEG/GIF/WebP ≤ 5 MB, checked by magic
  bytes) → 201 `{ url }`; stored **in the database** (`Media`: name = content hash + extension,
  bytes, type) and served at `/uploads/<name>` (`apps/server/src/media.ts`: memory cache, byte
  ranges, cached a year by browsers; a file still in the old `UPLOAD_DIR` is served from there —
  `media:to-db` copies them into the database).
  `POST /uploads/audio`: same, MP3/OGG/M4A/AAC/WAV ≤ 10 MB (`AUDIO_UPLOAD_MAX_BYTES`)
- `GET /games` (history, `GameSummary` with `winner`, `mode`, `jokers?: true`, `hearts?` for « Survie »), `GET /games/:id` (report: ranking
  with `teamId`, `avatar` (null before T20) + per-question `questions` with `type`, `answerCount`, `details`, empty for games
  saved before T12, + `teams` ranking,
  empty for solo games), `GET /games/:id/export.csv` (team games get a `team` column, games with jokers a `jokers`
  column = names of the jokers played, « Survie » games a `survival` column = hearts left or « fantôme (question n) »;
  report rows have `jokersUsed?`, `survival?: { hearts, eliminatedAt? }`)
  (UTF-8 BOM, formula-injection-safe)

## 7. Web routes (`apps/web`)

- `/` landing → "Join a game" / "Host"
- `/join?pin=123456` → phone join screen (QR code points here)
- `/play` → phone controller. Phone full screen (T41): « ⛶ Plein écran » on `/join`, in the lobby
  and in the header (Fullscreen API on a tap, never automatic; banner to come back after the
  browser drops it), `lib/fullscreen.ts`; iPhone Safari (no API): « Sur l'écran d'accueil » hint +
  web app manifest (`public/manifest.webmanifest`, `display: fullscreen`, `start_url: /join`, icons
  from `scripts/generate-icons.mjs`)
- `/remote/:pin#<remoteToken>` → « Télécommande » (T39): the host's phone drives the game (token
  kept in `localStorage` `lbq:remote:<pin>`, removed from the address bar)
- `/host/:pin` → shared screen; `/host/new?quizId=<id>&mode=teams&teams=<n>&jokers=1&theme=<theme>`
  (or `mode=survival&hearts=<n>`; no `theme` = the quiz's) creates a game (opened by the Solo / Équipes / Survie + Jokers dialog
  of the editor and of the home page; no `quizId` = demo, no `mode` = solo, no `jokers` = classic
  game)
- `/login`, `/register` → host account (`?next=` = page to return to); with Firebase (T46) also
  « Continuer avec Google », the e-mail forms go through Firebase (`apps/web/src/lib/firebase.ts`,
  SDK loaded lazily, never on the phones), « Mot de passe oublié » = Firebase's reset e-mail,
  « Mon compte » changes the Firebase password (nothing to change for a Google account)
- `/forgot-password` (« Mot de passe oublié ? » on `/login`), `/reset-password?token=` (link of
  the e-mail: new password ×2 → logged in → `/editor`), `/account` « Mon compte » (change
  password; link in the editor header, auth required)
- `/editor`, `/editor/new`, `/editor/:quizId` → quiz list (+ « 👥 Partagés avec moi », T45) / editor
  (auth required; « 👥 Partager » for the owner, read-only + « Copier dans mes quiz » for a viewer)
- `/reports` → past games, `/reports/:gameId` → game report (auth required)
- `/library` → public quizzes of the other hosts: search, sort, launch, copy (auth required)

## 8. Roadmap

| Phase | Goal | Content |
|---|---|---|
| 1. Realtime prototype | Prove the core | hardcoded quiz, PIN join, host + phones, answer, score, leaderboard, all in memory |
| 2. MVP | Usable for real | DB, host auth, editor, image upload, QR, reconnection, podium, deployment |
| 3. Polish | Feels like Kahoot | animations, sounds, streaks, mobile UX, reports (French only, no i18n) |
| 4. Extras | Growth | new question types, team mode, public library, AI-generated quizzes |

Advice: test phase 1 early with 3–4 real phones on local Wi-Fi — realtime sync and
reconnection are the hard parts.

## 9. Production & deployment

- **Build:** `pnpm build` — web: `tsc` + Vite → `apps/web/dist`; server: esbuild
  (`apps/server/build.mjs`) bundles `src/index.ts` + `@lbq/shared` + the generated Prisma client
  into `apps/server/dist` (npm deps stay external). Run with
  `node --import ./dist/instrument.js dist/index.js` (`pnpm --filter @lbq/server start`).
- **One process, one origin:** with `WEB_DIST_DIR` set, the server also serves the built web app
  (`apps/server/src/web.ts`, SPA fallback to `index.html`). Needed because the session cookie is
  `SameSite=Lax` and `*.fly.dev` is a public suffix. A production web build talks to
  `location.origin` unless `VITE_SERVER_URL` is set (`apps/web/src/lib/serverUrl.ts`).
- **Image:** root `Dockerfile` (multi-stage, `pnpm deploy --prod`; Prisma CLI kept for
  `migrate deploy`). **Fly.io:** `fly.toml` — 1 machine (in-memory games), volume `/data` for
  uploads, `release_command` = `prisma migrate deploy`, Managed Postgres via `DATABASE_URL`.
- **Sentry:** server `src/instrument.ts` (`SENTRY_DSN`), web `src/lib/sentry.ts`
  (`VITE_SENTRY_DSN` at build time); both off when unset.
- **Own server:** `deploy/docker-compose.yml` (app built from the `Dockerfile`, Postgres 17, Caddy
  for HTTPS; migrations at every start; `content/quizzes` mounted read-only at `/content`, imported
  with `node dist/import-quiz.js` — bundled by `build.mjs`). Step by step: `SELF-HOSTING.md`.
- **CI:** `.github/workflows/ci.yml` (Prettier, typecheck, tests with a Postgres service, build,
  Playwright e2e, Docker build); `deploy.yml` (manual `flyctl deploy`). Steps: `DEPLOY.md`.
