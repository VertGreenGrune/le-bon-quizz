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

- `QUESTION_INTRO`: question shown on host screen ~3 s, phones show "get ready".
- `ANSWERING`: server starts timer (`timeLimitSec`); ends when timer expires or all answered.
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
  (`audioOnReveal: true` = plays once at `REVEAL` instead); follows the host mute toggle, the other
  host sounds are ducked meanwhile (`apps/web/src/host/clipPlayer.ts`). `imageEffect` (`blur` 30 px
  → 0, `zoom` ×6 on a point → ×1, `pixelate` 8 blocks → full; only with `imageUrl`): the picture
  clears up over the answering time (frozen while paused), fully clear at `REVEAL`
  (`apps/web/src/components/RevealImage.tsx`). Scoring is unchanged (faster = more points).
- **Question types** (`Question.type`): `MCQ` and `TRUE_FALSE` (shape buttons, ≥ 1 correct
  choice), plus:
  - `TYPE_ANSWER` (réponse libre): players type ≤ 40 characters; correct if it matches one of the
    1–3 `acceptedAnswers` after normalizing both sides (trim, lower case, no accents /
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
  `POLL`, `WHO_OF_US` and `WORD_CLOUD` are the types without a right answer
  (`NO_RIGHT_ANSWER_TYPES` / `hasRightAnswer`); the logic of the T27 types lives in
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
  question, played during `QUESTION_INTRO` / `ANSWERING` before answering, not while paused
  (`JOKER_REFUSED` / `GAME_PAUSED` otherwise; a refused joker stays in hand). Which jokers a
  question type takes comes from **one table**, `jokerAvailability(type)` in shared: `POLL` takes
  none (bar hidden), `TRUE_FALSE` no 50/50.
  - 🎯 **50/50** (`fifty`): hides `min(ceil(wrong / 2), wrong − 1)` wrong choices on that phone;
    SLIDER: a range half as wide containing the answer (random position); TYPE_ANSWER: the first
    letter of the first accepted answer (leading article skipped). Refused when it would hide
    nothing.
  - 🦜 **Copieur** (`copy`, target; team mode: own team): as soon as the target answers, the
    copier gives the same answer with `responseMs = max(target's + 1 s, elapsed when played,
    own Gel)`. Target never answers → nothing. A copier is never awaited by itself (it waits for
    its target; a kicked target / copy loop → not awaited). The target stays secret (`joker:used`
    has no `target`).
  - 🥶 **Gel** (`freeze`, attack): at the target's next question that takes jokers, its answers
    are refused (`FROZEN`) during the first 5 s of `ANSWERING` (pauses excluded).
  - 🌀 **Brouilleur** (`scramble`, attack): at the target's next question whose type has
    `scramble: true` (MCQ / TRUE_FALSE), its phone gets grey buttons in a shuffled order labelled
    with the choice texts.
  - ✖️2 **Double ou rien** (`double`): right → `pointsEarned` ×2 (streak bonus included); wrong /
    no answer → −500 (the total never goes below 0).
  - 🛡️ **Bouclier** (`shield`): arms a shield that blocks the next attack aimed at the player
    (announced `blocked`), and a wrong answer on this question keeps the streak.
  - 🦹 **Voleur** (`thief`, attack): if the thief is right, `round(10 % × target's total)` after
    this question's points moves from the target to the thief (both `pointsEarned` change).
  - ⏳ **Sablier** (`hourglass`): speed points computed with `responseMs / 2`.
  Attacks (Gel, Brouilleur, Voleur): one per target per question; team mode: other teams only.
  Team averages use the points after the jokers (a negative member pulls the average down; a
  team score never goes below 0). Order at REVEAL: question points + streak bonus → Double →
  Voleur → new jokers for streaks.

## 4. Socket protocol (source of truth = `packages/shared/src/events.ts`)

Rooms: `game:<PIN>` (everyone), `game:<PIN>:host` (host sockets only).

Every client → server event takes an ack callback receiving
`{ ok: true, ...data }` or `{ ok: false, error: { code, message } }` (`Ack<T>` in shared).

### Host → server
| Event | Payload | Notes |
|---|---|---|
| `host:create` | `{ quizId, mode?: 'solo' \| 'teams', teamCount?: 2 \| 3 \| 4, jokers?: boolean }` | default solo / 2 teams / no jokers; ack `{ pin, hostToken }`, then `game:state` + `lobby:players` (+ `lobby:teams`). Host = `lbq_session` cookie of the socket handshake (or handshake `auth.token`); own quizzes + other hosts' `PUBLIC` quizzes (`UNAUTHORIZED` / `QUIZ_NOT_FOUND`, also for another host's private quiz); `quizId: 'demo'` works without login |
| `host:start` | `{ pin, hostToken }` | LOBBY → QUESTION_INTRO. Team mode: `TEAMS_NOT_READY` unless every player has a team and ≥ 2 teams have players |
| `host:next` | `{ pin, hostToken }` | advance phase |
| `host:kick` | `{ pin, hostToken, playerId }` | |
| `host:moveplayer` | `{ pin, hostToken, playerId, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED`) |
| `host:shuffle` | `{ pin, hostToken }` | team mode, LOBBY only: random balanced teams for every player |
| `host:end` | `{ pin, hostToken }` | → ENDED |
| `host:resume` | `{ pin, hostToken }` | « Continuer sans… » while paused: the missing players become absent for the current question, then `game:resuming` (no-op when not paused) |
| `host:rejoin` | `{ pin, hostToken }` | host screen reloaded / socket reconnected: re-attaches the socket as host (`GAME_NOT_FOUND` / `UNAUTHORIZED` otherwise), then re-sends to it `game:state`, `lobby:players`, `lobby:teams` (team mode), + `question:show` (question phases and LEADERBOARD), `answer:count` (ANSWERING, REVEAL), `question:reveal` (REVEAL), `leaderboard` (LEADERBOARD), `podium` (PODIUM, ENDED) |

### Player → server
| Event | Payload | Notes |
|---|---|---|
| `player:join` | `{ pin, nickname, avatar? }` | `avatar` = an `AvatarId` (`AVATARS` in `packages/shared/src/avatars.ts`, 20 Batman: The Animated Series portraits, images in `apps/web/public/avatars/<id>.jpg`; unknown id → `INVALID_PAYLOAD`, missing → random, preferably not taken); several players may share one. Ack `{ playerId, sessionToken, avatar }`. **Started game:** takes the place of the *disconnected* player with that nickname (case-insensitive) → ack `{ playerId, sessionToken, avatar, reclaimed: true, nickname, totalScore }` + the usual resync; the old session token is revoked. Connected player → `NICKNAME_TAKEN`, unknown nickname / ENDED → `GAME_ALREADY_STARTED` |
| `player:avatars` | `{ pin }` | join screen, before joining: ack `{ taken: AvatarId[], started: boolean }` (avatars already in that game, shown dimmed as a hint; `started` → the join screen offers to take a disconnected player's place); `GAME_NOT_FOUND` |
| `player:rejoin` | `{ pin, sessionToken }` | after disconnect; ack `{ playerId, nickname, avatar, totalScore }`, then server re-sends current `game:state` (+ `lobby:teams` in team mode, `question:prompt` if ANSWERING) |
| `player:team` | `{ pin, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED` afterwards); can switch until the start |
| `player:joker` | `{ pin, questionIndex, joker, targetId? }` | games with jokers (§3 "Jokers"): `joker` = `fifty` \| `copy` \| `freeze` \| `scramble` \| `double` \| `shield` \| `thief` \| `hourglass`, `targetId` for copy / freeze / scramble / thief; then `joker:used` + `joker:state`. `JOKER_REFUSED` (not in hand, one per question, already answered, wrong target / phase / question type), `GAME_PAUSED` |
| `player:answer` | `{ pin, questionIndex }` + exactly one of `choiceIndex` \| `text` \| `value` \| `order` \| `point` \| `playerId` | accepted once, only during ANSWERING (`FROZEN` during a Gel, `ALREADY_ANSWERED` for a Copieur); `choiceIndex` for MCQ / TRUE_FALSE / POLL, `text` (≤ 40) for TYPE_ANSWER and WORD_CLOUD (cut at 20), `value` (in [min, max]) for SLIDER, `order` (permutation of the shown item indexes) for ORDER, `point { x, y }` (0–1) for PIN, `playerId` (a player of the game) for WHO_OF_US — another kind → `INVALID_PAYLOAD` |

### Server → clients
| Event | To | Payload |
|---|---|---|
| `game:state` | all | `{ phase, mode, questionIndex, totalQuestions, remainingMs?, paused? }` (`questionIndex` = -1 in LOBBY; `remainingMs` avoids clock skew, frozen value while paused; `paused` = `{ waitingFor: { id, nickname, avatar }[], hostMissing, sinceMs }`, `waitingFor` empty during the resume countdown; `jokers: true` in games with jokers) |
| `game:resuming` | all | `{ inMs }` — 3-2-1 countdown before a paused game resumes (also re-sent on rejoin) |
| `lobby:players` | host | `{ players: { id, nickname, avatar, teamId?, offline? }[] }` (re-sent when a player drops / comes back) |
| `lobby:teams` | all | team mode only: `{ teams: { id, name, members: { id, nickname, avatar }[] }[] }` — every team in LOBBY, the teams in play from the start on; re-sent on any change (join, team choice, kick) |
| `question:show` | host | `{ index, type, text, imageUrl?, choices: string[], timeLimitSec, slider?, audio?, audioOnReveal?, imageEffect? }` (`choices` empty for TYPE_ANSWER / SLIDER; `slider` = `{ min, max, step, unit? }`, never the answer; media of §3 "Media": `audio` = `{ url, startSec, durationSec }`, `audioOnReveal: true`, `imageEffect` = `blur` \| `zoom` \| `pixelate`, absent = none; ORDER `items` (shuffled, as on the phones), WHO_OF_US `candidates: LobbyMember[]`) |
| `question:prompt` | players | `{ index, type, timeLimitSec }` + `choiceCount` (choice types) \| `slider: { min, max, step, unit? }` \| `maxLength: 40` (TYPE_ANSWER) / `20` (WORD_CLOUD) \| `items` (ORDER, shuffled — never in the right order) \| `imageUrl` (PIN only — never the zone) \| `candidates: LobbyMember[]` (WHO_OF_US) — no text, no answer, no sound, no picture except PIN! |
| `answer:count` | host | `{ answered, total }` |
| `question:reveal` | host | `{ type, correctIndexes: number[], distribution: number[] }` (both empty for TYPE_ANSWER / SLIDER; `correctIndexes` empty for POLL) + TYPE_ANSWER `acceptedAnswers`, `topAnswers: { text, count, correct }[]` (top 6, grouped after normalization); SLIDER `slider` (full settings), `correct`, `margin`, `guesses: number[]`, `closest?: { nickname, value, avatar? }` (`avatar` absent in reports saved before avatars); ORDER `order: { items (right order), placed: number[] (players with the right item at each position) }`; PIN `pin: { imageUrl, zone, pins: { x, y, nickname, avatar, correct }[] }`; WHO_OF_US `votes: { nickname, avatar, count }[]` (most voted first) + `majorityBonus?: true`; WORD_CLOUD `words: { text, count }[]` (top 40) (`RevealDetails`) |
| `player:result` | each player | `{ correct, pointsEarned, streak, streakBonus, totalScore, rank }` + `team?: { id, score, rank }` in team mode (`pointsEarned` includes `streakBonus`; `streak` = 0 if wrong / no answer) + `poll?: true` (POLL, WHO_OF_US, WORD_CLOUD: `correct` false; 0 points except the WHO_OF_US majority bonus) + SLIDER `yourValue?` (absent without an answer), `correctValue` + ORDER `placed?: { correct, total }` (partial points: `pointsEarned` > 0 with `correct` false, also for PIN near the zone) + WHO_OF_US `votesReceived`, `withMajority?` (absent without a vote) + `jokers?: JokerResult[]` (what jokers did: `double`, `doubleLost`, `shieldSaved`, `stole`, `stolen`, `copied`, `copyMissed`, `hourglass`, `earned`; `pointsEarned` may then be negative) |
| `leaderboard` | host | `{ top: { nickname, avatar, score, jokers? }[], teams? }` (everyone, up to 15; `jokers` = `{ hand, used? }` in games with jokers; `teams` in team mode = `{ id, name, score, playerCount }[]`, best first) |
| `podium` | all | `{ top: { nickname, avatar, score }[], teams? }` (top 3 players; all teams in team mode) |
| `player:kicked` | that player | `{}` |
| `joker:state` | each player | games with jokers, sent at the start, each question, each joker played, REVEAL, kick and in the rejoin resync: `{ questionIndex, questionType?, hand, played?: { joker, target? }, shield?, others: { id, nickname, avatar, teamId? }[], attacked: string[], effects }` — `effects` (this phone only) = `hiddenChoices?`, `sliderRange?`, `firstLetter?`, `frozen?: { ms, by }`, `scrambled?: { by, choices: { index, text }[] }`, `copied?` |
| `joker:used` | all | `{ questionIndex, joker, by, target?, blocked? }` (TV announcement; no `target` for Copieur; never re-sent) |
| `error` | sender | `{ code, message }` |

Choice index ↔ shape/color (fixed): `0 = red ▲`, `1 = blue ◆`, `2 = yellow ●`, `3 = green ■`.
Team id = the same index (`TeamId` 0–3, names in `TEAM_NAMES`).

## 5. Data model (Prisma, `apps/server/prisma/schema.prisma`)

- `User` — id, email (unique, lowercased), name, passwordHash (scrypt), createdAt
- `Session` — id (= SHA-256 of the host's session token), userId, expiresAt (30 days)
- `PasswordResetToken` — id (= SHA-256 of the token in the e-mailed link), userId, expiresAt
  (1 hour), usedAt? (single use), createdAt; a new request deletes the user's unused ones
- `Quiz` — id, ownerId → User, title, description, coverImageUrl, visibility (`PRIVATE` |
  `PUBLIC`, default `PRIVATE`: public quizzes are in the library), createdAt, updatedAt
- `Question` — id, quizId, order, text, imageUrl?, type (`MCQ` | `TRUE_FALSE` | `TYPE_ANSWER` |
  `POLL` | `SLIDER` | `ORDER` | `PIN` | `WHO_OF_US` | `WORD_CLOUD`), timeLimitSec (default 20),
  basePoints (default 1000), config? (JSON: TYPE_ANSWER `{ acceptedAnswers, typoTolerance }`,
  SLIDER `{ slider }`, ORDER `{ items }`, PIN `{ zone }`, WHO_OF_US `{ majorityBonus }`), audioUrl?, audioStartSec?,
  audioDurationSec?, audioOnReveal? (null = false), imageEffect? (`none` | `blur` | `zoom` |
  `pixelate`, null = none)
- `Choice` — id, questionId, order (0–3), text, isCorrect (MCQ / TRUE_FALSE / POLL; always false
  for a poll)
- `GameSession` — id, quizId? (null once the quiz is deleted), quizTitle (snapshot), hostId, pin,
  mode (`solo` | `teams`), jokers (bool, default false), startedAt, endedAt
- `PlayerResult` — id, gameSessionId, nickname, avatar? (null for games saved before avatars), score, correctCount, rank, teamId? (team mode), jokersUsed (`String[]`, default empty: joker ids played, in order)
- `TeamResult` — id, gameSessionId, teamId, name, score, playerCount, rank (team mode)
- `QuestionResult` — id, gameSessionId, index, type (default MCQ), text, choices[],
  correctIndexes[], distribution[], playerCount, correctCount, answerCount? (null for older games
  = sum of distribution), details? (JSON `RevealDetails`: typed answers / slider guesses / order /
  pins / votes / words)
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
- `GET/POST /quizzes`, `GET/PUT/DELETE /quizzes/:id`, `POST /quizzes/:id/duplicate`
  (body `QuizInput` = `QuizSchema` without `id` + optional `visibility` — absent = `PRIVATE` on
  creation, unchanged on update; PUT replaces all questions). Owner only, public or not.
  `QuizSummary` has `visibility` and `playCount` (games played with it by any host); copies
  (duplicate, library copy) are always `PRIVATE`, title + " (copie)"
- `GET /library?search=&sort=popular|newest` → `LibraryQuiz[]`: `PUBLIC` quizzes of the **other**
  hosts (title search, case-insensitive; max 100), with `authorName`, `questionCount`,
  `playCount` — no questions, so never the answers. `POST /library/:id/copy` → 201
  `QuizDetail`: private copy owned by the current host (404 if the quiz is not public)
- `POST /uploads/image` (multipart, field `file`, PNG/JPEG/GIF/WebP ≤ 5 MB, checked by magic
  bytes) → 201 `{ url }`; stored on local disk and served at `/uploads/` (S3 later).
  `POST /uploads/audio`: same, MP3/OGG/M4A/AAC/WAV ≤ 10 MB (`AUDIO_UPLOAD_MAX_BYTES`)
- `GET /games` (history, `GameSummary` with `winner`, `mode`, `jokers?: true`), `GET /games/:id` (report: ranking
  with `teamId`, `avatar` (null before T20) + per-question `questions` with `type`, `answerCount`, `details`, empty for games
  saved before T12, + `teams` ranking,
  empty for solo games), `GET /games/:id/export.csv` (team games get a `team` column, games with jokers a `jokers`
  column = names of the jokers played; report rows have `jokersUsed?`)
  (UTF-8 BOM, formula-injection-safe)

## 7. Web routes (`apps/web`)

- `/` landing → "Join a game" / "Host"
- `/join?pin=123456` → phone join screen (QR code points here)
- `/play` → phone controller
- `/host/:pin` → shared screen; `/host/new?quizId=<id>&mode=teams&teams=<n>&jokers=1` creates a
  game (opened by the Solo / Équipes + Jokers dialog of the editor and of the home page; no
  `quizId` = demo, no `mode` = solo, no `jokers` = classic game)
- `/login`, `/register` → host account (`?next=` = page to return to)
- `/forgot-password` (« Mot de passe oublié ? » on `/login`), `/reset-password?token=` (link of
  the e-mail: new password ×2 → logged in → `/editor`), `/account` « Mon compte » (change
  password; link in the editor header, auth required)
- `/editor`, `/editor/new`, `/editor/:quizId` → quiz list / editor (auth required)
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
- **CI:** `.github/workflows/ci.yml` (Prettier, typecheck, tests with a Postgres service, build,
  Playwright e2e, Docker build); `deploy.yml` (manual `flyctl deploy`). Steps: `DEPLOY.md`.
