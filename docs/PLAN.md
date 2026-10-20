# Le Bon Quizz — Architecture & Plan

## 1. Overview

```
┌──────────────┐        ┌───────────────────────────┐        ┌──────────────┐
│ Shared screen│◄──WS──►│      Game server (Node)    │◄──WS──►│ Phones (xN)  │
│ (host / TV)  │        │  Socket.IO room per PIN    │        │ ▲ ◆ ● ■      │
└──────────────┘        │  State machine + timer     │        └──────────────┘
                        │  Scoring                   │
┌──────────────┐  HTTP  │  REST API (quizzes, auth)  │
│ Quiz editor  │◄──────►│                            │──► PostgreSQL / Redis / S3
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
- **F. Infra** — Docker, CI, deployment, Sentry, load test (Artillery/k6, 200 fake players),
  Redis adapter + sticky sessions when scaling.

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
- Streak bonus (phase 3): +100 per consecutive correct answer, capped at +500.
- `responseMs` is measured **on the server** from the `ANSWERING` start.

## 4. Socket protocol (source of truth = `packages/shared/src/events.ts`)

Rooms: `game:<PIN>` (everyone), `game:<PIN>:host` (host sockets only).

Every client → server event takes an ack callback receiving
`{ ok: true, ...data }` or `{ ok: false, error: { code, message } }` (`Ack<T>` in shared).

### Host → server
| Event | Payload | Notes |
|---|---|---|
| `host:create` | `{ quizId }` | ack `{ pin, hostToken }` (`quizId: 'demo'` in phase 1) |
| `host:start` | `{ pin, hostToken }` | LOBBY → QUESTION_INTRO |
| `host:next` | `{ pin, hostToken }` | advance phase |
| `host:kick` | `{ pin, hostToken, playerId }` | |
| `host:end` | `{ pin, hostToken }` | → ENDED |

### Player → server
| Event | Payload | Notes |
|---|---|---|
| `player:join` | `{ pin, nickname }` | ack `{ playerId, sessionToken }` |
| `player:rejoin` | `{ pin, sessionToken }` | after disconnect; ack `{ playerId, nickname, totalScore }`, then server re-sends current `game:state` (+ `question:prompt` if ANSWERING) |
| `player:answer` | `{ pin, questionIndex, choiceIndex }` | accepted once, only during ANSWERING |

### Server → clients
| Event | To | Payload |
|---|---|---|
| `game:state` | all | `{ phase, questionIndex, totalQuestions, remainingMs? }` (`questionIndex` = -1 in LOBBY; `remainingMs` avoids clock skew) |
| `lobby:players` | host | `{ players: { id, nickname }[] }` |
| `question:show` | host | `{ index, text, imageUrl?, choices: string[], timeLimitSec }` |
| `question:prompt` | players | `{ index, choiceCount, timeLimitSec }` (no text, no answer!) |
| `answer:count` | host | `{ answered, total }` |
| `question:reveal` | host | `{ correctIndexes: number[], distribution: number[] }` |
| `player:result` | each player | `{ correct, pointsEarned, totalScore, rank }` |
| `leaderboard` | host | `{ top: { nickname, score }[] }` (top 5) |
| `podium` | all | `{ top: { nickname, score }[] }` (top 3) |
| `player:kicked` | that player | `{}` |
| `error` | sender | `{ code, message }` |

Choice index ↔ shape/color (fixed): `0 = red ▲`, `1 = blue ◆`, `2 = yellow ●`, `3 = green ■`.

## 5. Data model (Prisma, `apps/server/prisma/schema.prisma`)

- `User` — id, email (unique, lowercased), name, passwordHash (scrypt), createdAt
- `Session` — id (= SHA-256 of the host's session token), userId, expiresAt (30 days)
- `Quiz` — id, ownerId → User, title, description, coverImageUrl, createdAt, updatedAt
- `Question` — id, quizId, order, text, imageUrl?, type (`MCQ` | `TRUE_FALSE`),
  timeLimitSec (default 20), basePoints (default 1000)
- `Choice` — id, questionId, order (0–3), text, isCorrect
- `GameSession` — id, quizId? (null once the quiz is deleted), quizTitle (snapshot), hostId, pin,
  startedAt, endedAt
- `PlayerResult` — id, gameSessionId, nickname, score, correctCount, rank

Live game state is in memory (`Map<pin, Game>`) in phase 1–2; moved to Redis in phase 4.

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
- `GET /games` (history), `GET /games/:id` (report), `GET /games/:id/export.csv`
  (UTF-8 BOM, formula-injection-safe)

## 7. Web routes (`apps/web`)

- `/` landing → "Join a game" / "Host"
- `/join?pin=123456` → phone join screen (QR code points here)
- `/play` → phone controller
- `/host/:pin` → shared screen
- `/editor`, `/editor/:quizId` → quiz editor (auth required)
- `/reports/:gameId` → game report

## 8. Roadmap

| Phase | Goal | Content |
|---|---|---|
| 1. Realtime prototype | Prove the core | hardcoded quiz, PIN join, host + phones, answer, score, leaderboard, all in memory |
| 2. MVP | Usable for real | DB, host auth, editor, image upload, QR, reconnection, podium, deployment |
| 3. Polish | Feels like Kahoot | animations, sounds, streaks, mobile UX, reports, i18n FR/EN |
| 4. Extras | Growth | new question types, team mode, public library, AI-generated quizzes, Redis scaling |

Advice: test phase 1 early with 3–4 real phones on local Wi-Fi — realtime sync and
reconnection are the hard parts.
