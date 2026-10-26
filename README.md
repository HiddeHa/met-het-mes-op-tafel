# Met het Mes op Tafel — Trivia & Inzet

A web-based trivia and betting game inspired by the Dutch TV show
*Met het Mes op Tafel*. Three contestants answer the same four questions in
secret; the correct answers are revealed, and then the table bids for a central
pot before the sheets are opened. Playable on one screen or online with a room
code — each player on their own PC.

![status](https://img.shields.io/badge/status-playable-e8c478)

## Play

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite client on `http://localhost:5173` and the game
server on port `8787` (Vite proxies `/ws`).

Modes:

- **Solo** — you against two AI opponents (Sanne and Daan).
- **Duo** — two friends on one screen plus one bot.
- **Lokaal** — three players, one screen, with a pass-the-screen curtain for
  secret answers.
- **Online** — everyone on their own device; the host shares a room code.

The end screen shows the final leaderboard and the pot each player took home.

**Question sets.** Before starting, pick which bank to play: **Klassiek** (49
questions across the seven trivia categories) or **Memes** (30 internet-meme
questions, English prompts). The meme set is smaller, so it caps the table at
seven rounds instead of nine. Online, the host picks the set when creating the
room and everyone else plays that set.

## Online with a friend

1. Start the game (`npm run dev`) on the PC that hosts the table and choose
   **Online → Nieuwe tafel**. Enter your name, pick the question set and the
   number of rounds.
2. The waiting room shows a **tafelcode** (five characters) and an
   **invite link** that already contains your network address, e.g.
   `http://192.168.178.218:5173/?room=3CNC8`.
3. Your friend opens that link (or the same URL plus the code under
   **Online → Deelnemen**) on their own PC, in the same Wi-Fi network.
4. When the second player sits down, the host presses **Start het spel**. Two
   humans means a two-player game — no bot fills the third chair. A third human
   can still join before the start.

Things worth knowing:

- Online everyone fills in their sheet at the same moment on one shared
  countdown. When the last sheet is locked, the correct answers appear on every
  screen; the host then opens the bidding round (it opens by itself when the
  reveal timer runs out). Sheets still can't be submitted twice, and when the
  clock hits zero the sheets that are still open are locked empty.
- The correct answers become public before the bidding starts, but the written
  sheets and the scores stay on the server until the round is settled. Every
  player only receives their own sheet, and only the player whose turn it is can
  bid.
- Refreshing a page keeps your seat: the browser stores a resume token, so you
  rejoin the same table after a reload or a short network drop.
- Windows may ask to allow Node through the firewall the first time. Allow it on
  private networks, otherwise the other PC cannot connect.
- Players on another network cannot use the `192.168.x.x` invite link — see
  **Sharing over the internet** below.

## Sharing over the internet

The invite link the waiting room shows contains your local address, so it only
works inside your own network. To let someone elsewhere join, expose the game
through a tunnel.

1. Build and serve the app from one port (stop `npm run dev` first, it holds
   `8787`):

   ```bash
   npm run build && npm start
   ```

2. Tunnel that port with [cloudflared](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
   (no account needed):

   ```bash
   cloudflared tunnel --url http://localhost:8787
   ```

   It prints a public `https://….trycloudflare.com` address. Open that address
   yourself, create a table, and send the invite link it now shows — the link
   picks up the public hostname automatically.

Worth knowing: a quick tunnel's hostname is random and changes every time
cloudflared restarts; the PC running it has to stay awake; anyone with the URL
can reach the lobby, though a table code is still needed to sit down; and rooms
live in memory, so restarting the server ends open tables. If you would rather
run the dev server behind the tunnel, `vite.config.ts` already allows
`*.trycloudflare.com` — point the tunnel at port `5173` instead and the `/ws`
proxy follows.

## Rules in one minute

1. **Vier vragen** — every round deals four questions from different
   categories. Everyone starts with **€750** and pays an obligatory opening
   stake before the questions: **€10** in round 1, **€20** in round 2, **€40**
   in round 3 and **€80** from round 4 onwards. All four answers go on one
   secret sheet; online all sheets are written at the same time.
2. **De antwoorden** — once every sheet is locked, the table sees the four
   correct answers. You know how you did; the other sheets stay closed.
3. **Inzetten** — the obligatory stake is already in the pot, so bidding opens
   with a raise or a fold. Raises go in steps of €10, up to €50 above the
   obligatory stake of the round; you can call, raise or fold. Every extra bet is paid from your bankroll straight into the
   pot. If all opponents fold, the last player may still raise or fold.
4. **Onthullen** — all sheets open. The pot is claimed by the non-folded
   player with the **most correct answers**; equal counts split it. If no
   remaining player has a correct answer, the pot carries over and grows.
5. **Shootout** — after the last round a hard question appears. Buzz first
   (keys `1`–`3`, one per seat), answer correctly for a €100 bonus plus the
   remaining pot. A wrong answer eliminates you and reopens the buzzer. Ties
   trigger another shootout.

## Stack

- React 19 + TypeScript + Vite
- Pure reducer state machine, no external state or UI libraries
- Authoritative Node game server (`ws`) that owns rooms and redacts state
- WebAudio-synthesised sound effects, no audio assets
- JSON question bank split in two sets: 49 classic questions across 7
  categories, and 30 English meme questions in their own category
- Vitest for reducer, answer-matching, room/projection and full-game tests

## Structure

```text
src/
  App.tsx                 screen routing, sound preference, rules modal
  game/
    machine.ts            pure reducer: answers → answer reveal → bidding → reveal → shootout
    engine.ts             constants, obligatory stakes, player creation, bidding helpers
    ai.ts                 bot answer, bid, buzz and shootout logic
    matching.ts           accent/punctuation-insensitive answer matching
    data/questions.json   79 questions with accepted alternative answers
    machine.test.ts       rules and scoring tests
    simulation.test.ts    20 complete solo games driven by the AI
  hooks/
    useGame.ts            timers and bot scheduling (local modes)
    useGameAudio.ts       reducer events → sound cues
    useOnlineGame.ts      WebSocket client: rooms, resume, reconnects
  net/protocol.ts         shared client/server message and room types
  components/             lobby, online room, table, seats, pot, phases
  styles.css              broadcast-style dark/gold responsive theme
  online.css              online lobby and waiting-room styles
server/
  index.ts                HTTP + WebSocket server, turns, timers, redaction
  room.ts                 room codes, host handover, seats, tokens
  projection.ts           per-player view: other sheets stay hidden
  bots.ts                 bot answers and bids on a timer
  main.ts                 dev/production entry (`tsx server/main.ts --serve`)
```

## Commands

```bash
npm run dev         # Vite client + game server together
npm run dev:client  # client only
npm run dev:server  # game server only (port 8787)
npm run build       # typecheck + production build
npm start           # serve dist and the WebSocket on one port
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

## Notes

- Answers are normalised for case, accents and articles, with small typo
  tolerance and alternative spellings per question.
- The seeded RNG makes bot decisions and question shuffles reproducible from a
  game seed. Bots answer all four questions of their sheet in one turn and bid
  on how many they actually got right, which they know once the answers are on
  the table.
- Local modes run entirely in the browser. Online rooms run on the bundled
  Node server; no external service or database is involved and rooms live in
  memory, so a restart of the server ends open tables.
