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

## 3. Scoring

- Correct answer: `points = round(basePoints * (1 - (responseMs / timeLimitMs) / 2))`
  (`basePoints` default 1000; 0 / 1000 / 2000 per question setting). Wrong / no answer: 0.
- Streak bonus: `streak` = consecutive correct answers including this one (reset to 0 by a
  wrong or missing answer). A correct answer earns `min(100 * (streak - 1), 500)` extra points
  (1st → +0, 2nd → +100, …, 6th and later → +500), added to `pointsEarned` and the total score.
  A 0-point question awards no bonus but still extends the streak.
- `responseMs` is measured **on the server** from the `ANSWERING` start.
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

## 4. Socket protocol (source of truth = `packages/shared/src/events.ts`)

Rooms: `game:<PIN>` (everyone), `game:<PIN>:host` (host sockets only).

Every client → server event takes an ack callback receiving
`{ ok: true, ...data }` or `{ ok: false, error: { code, message } }` (`Ack<T>` in shared).

### Host → server
| Event | Payload | Notes |
|---|---|---|
| `host:create` | `{ quizId, mode?: 'solo' \| 'teams', teamCount?: 2 \| 3 \| 4 }` | default solo / 2 teams; ack `{ pin, hostToken }`, then `game:state` + `lobby:players` (+ `lobby:teams`). Host = `lbq_session` cookie of the socket handshake (or handshake `auth.token`); own quizzes only (`UNAUTHORIZED` / `QUIZ_NOT_FOUND`); `quizId: 'demo'` works without login |
| `host:start` | `{ pin, hostToken }` | LOBBY → QUESTION_INTRO. Team mode: `TEAMS_NOT_READY` unless every player has a team and ≥ 2 teams have players |
| `host:next` | `{ pin, hostToken }` | advance phase |
| `host:kick` | `{ pin, hostToken, playerId }` | |
| `host:moveplayer` | `{ pin, hostToken, playerId, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED`) |
| `host:shuffle` | `{ pin, hostToken }` | team mode, LOBBY only: random balanced teams for every player |
| `host:end` | `{ pin, hostToken }` | → ENDED |
| `host:rejoin` | `{ pin, hostToken }` | host screen reloaded / socket reconnected: re-attaches the socket as host (`GAME_NOT_FOUND` / `UNAUTHORIZED` otherwise), then re-sends to it `game:state`, `lobby:players`, `lobby:teams` (team mode), + `question:show` (question phases and LEADERBOARD), `answer:count` (ANSWERING, REVEAL), `question:reveal` (REVEAL), `leaderboard` (LEADERBOARD), `podium` (PODIUM, ENDED) |

### Player → server
| Event | Payload | Notes |
|---|---|---|
| `player:join` | `{ pin, nickname }` | ack `{ playerId, sessionToken }` |
| `player:rejoin` | `{ pin, sessionToken }` | after disconnect; ack `{ playerId, nickname, totalScore }`, then server re-sends current `game:state` (+ `lobby:teams` in team mode, `question:prompt` if ANSWERING) |
| `player:team` | `{ pin, teamId }` | team mode, LOBBY only (`GAME_ALREADY_STARTED` afterwards); can switch until the start |
| `player:answer` | `{ pin, questionIndex }` + exactly one of `choiceIndex` \| `text` \| `value` | accepted once, only during ANSWERING; `choiceIndex` for MCQ / TRUE_FALSE / POLL, `text` (≤ 40) for TYPE_ANSWER, `value` (in [min, max]) for SLIDER — another kind → `INVALID_PAYLOAD` |

### Server → clients
| Event | To | Payload |
|---|---|---|
| `game:state` | all | `{ phase, mode, questionIndex, totalQuestions, remainingMs? }` (`questionIndex` = -1 in LOBBY; `remainingMs` avoids clock skew) |
| `lobby:players` | host | `{ players: { id, nickname, teamId? }[] }` |
| `lobby:teams` | all | team mode only: `{ teams: { id, name, members: { id, nickname }[] }[] }` — every team in LOBBY, the teams in play from the start on; re-sent on any change (join, team choice, kick) |
| `question:show` | host | `{ index, type, text, imageUrl?, choices: string[], timeLimitSec, slider? }` (`choices` empty for TYPE_ANSWER / SLIDER; `slider` = `{ min, max, step, unit? }`, never the answer) |
| `question:prompt` | players | `{ index, type, timeLimitSec }` + `choiceCount` (choice types) \| `slider: { min, max, step, unit? }` \| `maxLength: 40` (TYPE_ANSWER) — no text, no answer! |
| `answer:count` | host | `{ answered, total }` |
| `question:reveal` | host | `{ type, correctIndexes: number[], distribution: number[] }` (both empty for TYPE_ANSWER / SLIDER; `correctIndexes` empty for POLL) + TYPE_ANSWER `acceptedAnswers`, `topAnswers: { text, count, correct }[]` (top 6, grouped after normalization); SLIDER `slider` (full settings), `correct`, `margin`, `guesses: number[]`, `closest?: { nickname, value }` (`RevealDetails`) |
| `player:result` | each player | `{ correct, pointsEarned, streak, streakBonus, totalScore, rank }` + `team?: { id, score, rank }` in team mode (`pointsEarned` includes `streakBonus`; `streak` = 0 if wrong / no answer) + `poll?: true` (POLL: `correct` false, 0 points) + SLIDER `yourValue?` (absent without an answer), `correctValue` |
| `leaderboard` | host | `{ top: { nickname, score }[], teams? }` (everyone, up to 15; `teams` in team mode = `{ id, name, score, playerCount }[]`, best first) |
| `podium` | all | `{ top: { nickname, score }[], teams? }` (top 3 players; all teams in team mode) |
| `player:kicked` | that player | `{}` |
| `error` | sender | `{ code, message }` |

Choice index ↔ shape/color (fixed): `0 = red ▲`, `1 = blue ◆`, `2 = yellow ●`, `3 = green ■`.
Team id = the same index (`TeamId` 0–3, names in `TEAM_NAMES`).

## 5. Data model (Prisma, `apps/server/prisma/schema.prisma`)

- `User` — id, email (unique, lowercased), name, passwordHash (scrypt), createdAt
- `Session` — id (= SHA-256 of the host's session token), userId, expiresAt (30 days)
- `Quiz` — id, ownerId → User, title, description, coverImageUrl, createdAt, updatedAt
- `Question` — id, quizId, order, text, imageUrl?, type (`MCQ` | `TRUE_FALSE` | `TYPE_ANSWER` |
  `POLL` | `SLIDER`), timeLimitSec (default 20), basePoints (default 1000), config? (JSON:
  TYPE_ANSWER `{ acceptedAnswers, typoTolerance }`, SLIDER `{ slider }`)
- `Choice` — id, questionId, order (0–3), text, isCorrect (MCQ / TRUE_FALSE / POLL; always false
  for a poll)
- `GameSession` — id, quizId? (null once the quiz is deleted), quizTitle (snapshot), hostId, pin,
  mode (`solo` | `teams`), startedAt, endedAt
- `PlayerResult` — id, gameSessionId, nickname, score, correctCount, rank, teamId? (team mode)
- `TeamResult` — id, gameSessionId, teamId, name, score, playerCount, rank (team mode)
- `QuestionResult` — id, gameSessionId, index, type (default MCQ), text, choices[],
  correctIndexes[], distribution[], playerCount, correctCount, answerCount? (null for older games
  = sum of distribution), details? (JSON `RevealDetails`: typed answers / slider guesses)
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
`{ error: { code, message } }` (`ApiErrorBody`). Everything except register/login/logout
requires a host session: httpOnly cookie `lbq_session` (set by register/login; web uses
`credentials: 'include'`) **or** `Authorization: Bearer <token>`. Another host's resources
answer 404. Code: routes in `apps/server/src/api`, auth helpers in `apps/server/src/auth`
(`getUserBySessionToken` is reusable for socket auth).

- `POST /auth/register` `{ email, name, password }` → 201 `AuthResponse { user, token }`;
  `POST /auth/login` `{ email, password }` → `AuthResponse`; `POST /auth/logout` → 204;
  `GET /auth/me` → `PublicUser`
- `GET/POST /quizzes`, `GET/PUT/DELETE /quizzes/:id`, `POST /quizzes/:id/duplicate`
  (body `QuizInput` = `QuizSchema` without `id`; PUT replaces all questions)
- `POST /uploads/image` (multipart, field `file`, PNG/JPEG/GIF/WebP ≤ 5 MB, checked by magic
  bytes) → 201 `{ url }`; stored on local disk and served at `/uploads/` (S3 later)
- `GET /games` (history, `GameSummary` with `winner`, `mode`), `GET /games/:id` (report: ranking
  with `teamId` + per-question `questions` with `type`, `answerCount`, `details`, empty for games
  saved before T12, + `teams` ranking,
  empty for solo games), `GET /games/:id/export.csv` (team games get a `team` column)
  (UTF-8 BOM, formula-injection-safe)

## 7. Web routes (`apps/web`)

- `/` landing → "Join a game" / "Host"
- `/join?pin=123456` → phone join screen (QR code points here)
- `/play` → phone controller
- `/host/:pin` → shared screen; `/host/new?quizId=<id>&mode=teams&teams=<n>` creates a game
  (opened by the Solo / Équipes dialog of the editor and of the home page; no `quizId` = demo,
  no `mode` = solo)
- `/login`, `/register` → host account (`?next=` = page to return to)
- `/editor`, `/editor/new`, `/editor/:quizId` → quiz list / editor (auth required)
- `/reports` → past games, `/reports/:gameId` → game report (auth required)

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
