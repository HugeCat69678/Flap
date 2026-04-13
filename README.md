# Flap 🐦

A responsive, feature-rich Flappy Bird clone playable in any modern browser — no install needed.

**[▶ Play now](https://hugecat69678.github.io/Flap/)**

---

## Features

- **Smooth 60 Hz gameplay** — fixed-timestep physics with `requestAnimationFrame`, HiDPI/Retina canvas support
- **6 unlockable skins** — earn coins by playing and spend them in the Skin Shop
- **Accounts system** — register / log in; passwords are hashed with SHA-256 (SubtleCrypto)
- **Custom avatars** — choose from 8 preset emojis or upload your own photo
- **Real-time multiplayer** — peer-to-peer via [PeerJS](https://peerjs.com/); share a room code like `ABC-123` with a friend
- **Fully responsive** — works on mobile, tablet, and desktop; touch, mouse, and keyboard all supported
- **No dependencies to install** — pure HTML + CSS + vanilla JS; the only external library is PeerJS (loaded from CDN)

---

## How to Play

| Control | Action |
|---------|--------|
| **Tap / Click** | Flap |
| **Space** | Flap |
| **Escape** | Pause / back |

Pass through the gaps between pipes to score points. The game gets faster and the gaps narrower as your score increases.

---

## Coins & Skins

- You earn **coins** at the end of every run: `floor(score / 2) + 5` bonus if you score ≥ 5.
- Open the **Skin Shop** from the main menu to buy and equip new bird skins.

| Skin | Cost |
|------|------|
| Classic | Free |
| Red Hawk | 50 |
| Blue Jay | 100 |
| Parrot | 150 |
| Ghost | 250 |
| Golden | 400 |

---

## Multiplayer

1. One player taps **MULTIPLAYER → CREATE ROOM** and shares the 6-character code.
2. The other player taps **MULTIPLAYER → JOIN ROOM** and enters the code.
3. The host taps **START GAME** when both are connected.
4. Both birds appear on screen simultaneously; the game ends when both birds crash.

Multiplayer uses WebRTC (via PeerJS) — no server required beyond the PeerJS signalling service.

---

## Running Locally

Because the game uses `SubtleCrypto` for password hashing, it requires a **secure context** (HTTPS or `localhost`).

```bash
# Any static file server works, e.g.:
npx serve docs
# then open http://localhost:3000
```

Or simply open `docs/index.html` via `localhost` in your browser.

---

## Project Structure

```
docs/
  index.html   — page shell + overlay markup
  style.css    — layout, modal, button styles
  game.js      — all game logic (canvas rendering, physics, accounts, multiplayer)
  .nojekyll    — disables Jekyll so GitHub Pages serves the files as-is
README.md
```

---

## License

MIT — do whatever you like with it.