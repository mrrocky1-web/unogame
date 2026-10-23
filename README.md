# UNO Online

Folders
- `frontend/`  – HTML/CSS/JS (served by the backend)
- `backend/`   – Node.js: Express (login/register) + WebSocket (live game) + `game.js` (UNO rules)
- `database/`  – `schema.sql` (SQLite). `uno.db` is created automatically on first run.

Run
1. Install Node.js 18+ (20+ recommended)
2. `npm install`
3. `npm start`
4. Open http://localhost:3000  (friends on the same Wi-Fi: http://YOUR-PC-IP:3000)

Play: create account -> Create group (players 2-10, starting cards, turn timer) -> share the 6-digit code -> friends use "Join with code" -> host presses Start.

Notes
- Hands are kept on the server; each player only receives their own cards.
- Live games are held in memory; restarting the server ends running games (accounts, groups and results stay in SQLite).
- To play over the internet deploy to any Node host (Render, Railway, VPS) and set `PORT`.
