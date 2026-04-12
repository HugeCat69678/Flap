"use strict";

// ============================================================
//  Flap — responsive Flappy Bird with skins & coin economy
//  • Responsive: mobile full-screen, desktop portrait box
//  • Menu  →  Play / Shop
//  • Coin economy – earn coins per run, spend in shop
//  • 6 purchasable bird skins
//  • LocalStorage persistence (coins, skins, high score)
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

// Design reference width; s(n) scales any size relative to canvas width
const DESIGN_W = 360;
const DESIGN_H = 640;
let W = DESIGN_W, H = DESIGN_H;

const MENU_BOB_PERIOD = 420; // ms period of the bird bob animation on the menu screen

function s(n) { return n * (W / DESIGN_W); }

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 540) {
    // Mobile: fill the whole viewport
    W = vw;
    H = vh;
  } else {
    // Desktop: fixed portrait box centred on page
    H = Math.min(vh - 20, 650);
    W = Math.round(H * (DESIGN_W / DESIGN_H));
  }
  canvas.width  = W;
  canvas.height = H;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  // Drop back to menu so bird / pipe coordinates rebuild cleanly
  if (state === S.PLAYING) state = S.MENU;
});

// ---- Persistence -------------------------------------------

const SAVE_KEY = "flap_save_v2";

function defaultSave() {
  return {
    coins:          0,
    unlockedSkins:  ["classic"],
    currentSkin:    "classic",
    highScore:      0,
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return Object.assign(defaultSave(), JSON.parse(raw));
  } catch { return defaultSave(); }
}

function writeSave() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

let save = loadSave();

// ---- Skins -------------------------------------------------

const SKINS = [
  {
    id: "classic", name: "Classic", cost: 0,
    bodyColor: "#ffeb3b", wingColor: "#fbc02d",
    eyeColor: "#fff",     pupilColor: "#000", beakColor: "#ff9800",
  },
  {
    id: "red", name: "Red Hawk", cost: 50,
    bodyColor: "#ef5350", wingColor: "#b71c1c",
    eyeColor: "#fff",     pupilColor: "#000", beakColor: "#ff6f00",
  },
  {
    id: "blue", name: "Blue Jay", cost: 100,
    bodyColor: "#42a5f5", wingColor: "#0d47a1",
    eyeColor: "#fff",     pupilColor: "#000", beakColor: "#f9a825",
  },
  {
    id: "green", name: "Parrot", cost: 150,
    bodyColor: "#66bb6a", wingColor: "#1b5e20",
    eyeColor: "#fff",     pupilColor: "#000", beakColor: "#ffd600",
  },
  {
    id: "ghost", name: "Ghost", cost: 250,
    bodyColor: "rgba(220,220,255,0.88)", wingColor: "rgba(140,140,200,0.7)",
    eyeColor: "#e8e8ff",  pupilColor: "#9c27b0", beakColor: "rgba(180,160,220,0.9)",
  },
  {
    id: "golden", name: "Golden", cost: 400,
    bodyColor: "#ffd700", wingColor: "#e65100",
    eyeColor: "#fff3e0",  pupilColor: "#3e2723", beakColor: "#bf360c",
  },
];

function getSkin(id) {
  return SKINS.find(sk => sk.id === id) || SKINS[0];
}

// ---- State machine -----------------------------------------

const S = { MENU: 0, SHOP: 1, PLAYING: 2, GAME_OVER: 3 };
let state = S.MENU;

// ---- Game variables ----------------------------------------

let bird       = {};
let pipes      = [];
let frameCount = 0;
let score      = 0;
let coinsEarned = 0;

// Scrolling ground offset
let groundX = 0;
// Simple cloud objects
let clouds = [];

function initClouds() {
  clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: Math.random() * W,
      y: H * (0.05 + Math.random() * 0.25),
      r: s(18 + Math.random() * 18),
      speed: s(0.3 + Math.random() * 0.3),
    });
  }
}

function resetGame() {
  bird = {
    x:  s(80),
    y:  H / 2,
    w:  s(34),
    h:  s(24),
    vy: 0,
  };
  pipes      = [];
  frameCount = 0;
  score      = 0;
  coinsEarned = 0;
  groundX    = 0;
  initClouds();
}

// ---- Difficulty --------------------------------------------

function pipeSpeed()    { return s(1.6) + Math.floor(score / 10) * s(0.15); }
function pipeGap()      { return Math.max(s(130), s(170) - Math.floor(score / 15) * s(4)); }
function pipeWidth()    { return s(55); }
function spawnInterval(){ return Math.max(Math.floor(s(185) / pipeSpeed()), 55); }

// ---- Pipe spawning -----------------------------------------

function spawnPipe() {
  const minTop = s(55);
  const maxTop = H - pipeGap() - s(95);
  const top    = Math.random() * (maxTop - minTop) + minTop;
  pipes.push({ x: W + pipeWidth(), top, bottom: top + pipeGap(), scored: false });
}

// ---- Flap --------------------------------------------------

function flap() {
  ensureAudio();
  if (state === S.PLAYING) {
    bird.vy = -s(5.8);
    playFlapSound();
  }
}

// ---- Game Over ---------------------------------------------

function triggerGameOver() {
  if (state === S.GAME_OVER) return;
  state = S.GAME_OVER;
  playHitSound();
  coinsEarned = Math.floor(score / 2) + (score >= 5 ? 5 : 0);
  save.coins += coinsEarned;
  if (score > save.highScore) save.highScore = score;
  writeSave();
}

// ---- Game loop timing --------------------------------------

let lastFrameTime = 0;
let accumulator   = 0;
const FIXED_DT    = 1000 / 60; // physics tick ~16.667 ms (always 60 fps equivalent)

// ---- Physics step ------------------------------------------

function step() {
  if (state === S.PLAYING) {
    const sp = pipeSpeed();
    const pw = pipeWidth();

    // Physics
    bird.vy += s(0.22);
    bird.y  += bird.vy;

    // Boundary – ground & ceiling
    if (bird.y + bird.h >= H - s(68) || bird.y <= 0) {
      triggerGameOver();
    }

    // Pipes
    frameCount++;
    if (frameCount % spawnInterval() === 0) spawnPipe();
    for (const p of pipes) p.x -= sp;
    pipes = pipes.filter(p => p.x + pw > 0);

    // Scoring
    for (const p of pipes) {
      if (!p.scored && p.x + pw / 2 < bird.x) {
        p.scored = true;
        score++;
        playBeep({ freq: 900, duration: 0.05, gain: 0.15 });
      }
    }

    // Collision
    for (const p of pipes) {
      const inX = bird.x + bird.w > p.x && bird.x < p.x + pw;
      if (inX && (bird.y < p.top || bird.y + bird.h > p.bottom)) {
        triggerGameOver();
      }
    }

    // Scroll ground
    groundX = (groundX - sp) % s(24);

    // Move clouds
    for (const c of clouds) {
      c.x -= c.speed;
      if (c.x + c.r * 3 < 0) {
        c.x = W + c.r;
        c.y = H * (0.05 + Math.random() * 0.25);
        c.r = s(18 + Math.random() * 18);
      }
    }
  }
}

// ---- Main loop ---------------------------------------------

function update(ts = 0) {
  const elapsed = Math.min(ts - lastFrameTime, 100); // clamp to avoid spiral-of-death
  lastFrameTime = ts;
  accumulator  += elapsed;
  while (accumulator >= FIXED_DT) {
    step();
    accumulator -= FIXED_DT;
  }
  draw();
  requestAnimationFrame(update);
}

// ---- Drawing helpers ----------------------------------------

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawButton(x, y, w, h, label, primary = true) {
  const r = h / 3;
  ctx.save();
  ctx.shadowColor    = "rgba(0,0,0,0.5)";
  ctx.shadowBlur     = s(8);
  ctx.shadowOffsetY  = s(3);
  roundRect(x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (primary) {
    g.addColorStop(0, "#ffb347");
    g.addColorStop(1, "#c0392b");
  } else {
    g.addColorStop(0, "#7f8c8d");
    g.addColorStop(1, "#2d3436");
  }
  ctx.fillStyle = g;
  ctx.fill();
  // Gloss shine on top half
  ctx.shadowColor = "transparent";
  ctx.save();
  roundRect(x, y, w, h, r);
  ctx.clip();
  roundRect(x + 1, y + 1, w - 2, h * 0.45, r);
  ctx.fillStyle = "rgba(255,255,255,0.20)";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle     = "#fff";
  ctx.font          = `bold ${Math.round(h * 0.38)}px Arial, sans-serif`;
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.shadowColor   = "rgba(0,0,0,0.45)";
  ctx.shadowBlur    = s(2);
  ctx.shadowOffsetY = s(1);
  ctx.fillText(label, x + w / 2, y + h / 2 + s(1));
  ctx.restore();
}

// ---- Draw bird ---------------------------------------------

function drawBirdAt(x, y, w, h, vy, skin) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(Math.min(Math.max(vy / 9, -0.5), 0.75));

  // Wing
  ctx.fillStyle = skin.wingColor;
  ctx.beginPath();
  ctx.ellipse(-w * 0.1, h * 0.22, w * 0.33, h * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = skin.bodyColor;
  roundRect(-w / 2, -h / 2, w, h, h * 0.32);
  ctx.fill();

  // Eye white
  ctx.fillStyle = skin.eyeColor;
  ctx.beginPath();
  ctx.arc(w * 0.12, -h * 0.18, h * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = skin.pupilColor;
  ctx.beginPath();
  ctx.arc(w * 0.17, -h * 0.18, h * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = skin.beakColor;
  ctx.beginPath();
  ctx.moveTo(w / 2,                  -h * 0.05);
  ctx.lineTo(w / 2 + w * 0.28,       -h * 0.22);
  ctx.lineTo(w / 2 + w * 0.28,        h * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ---- Draw background & pipes --------------------------------

function drawBackground() {
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    "#5fc8ea");
  sky.addColorStop(0.75, "#b8e4f0");
  sky.addColorStop(1,    "#87ceeb");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Clouds
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  for (const c of clouds) drawCloud(c.x, c.y, c.r);

  // Scrolling striped ground
  const groundY = H - s(70);
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, groundY, W, s(70));
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, groundY, W, s(8));
  // Stripes
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  const stripeW = s(24);
  for (let x = groundX; x < W + stripeW; x += stripeW * 2) {
    ctx.fillRect(x, groundY, stripeW, s(70));
  }
}

function drawCloud(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx,          cy,            r,        0, Math.PI * 2);
  ctx.arc(cx + r,      cy - r * 0.3,  r * 0.8,  0, Math.PI * 2);
  ctx.arc(cx + r * 1.8, cy,           r * 0.9,  0, Math.PI * 2);
  ctx.fill();
}

function drawPipes() {
  const pw = pipeWidth();
  for (const p of pipes) {
    // Gradient
    const grad = ctx.createLinearGradient(p.x, 0, p.x + pw, 0);
    grad.addColorStop(0,   "#4caf50");
    grad.addColorStop(0.5, "#66bb6a");
    grad.addColorStop(1,   "#388e3c");

    // Top pipe
    ctx.fillStyle = grad;
    ctx.fillRect(p.x, 0, pw, p.top);
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(p.x - s(3), p.top - s(18), pw + s(6), s(18));

    // Bottom pipe
    ctx.fillStyle = grad;
    ctx.fillRect(p.x, p.bottom, pw, H - p.bottom);
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(p.x - s(3), p.bottom, pw + s(6), s(18));

    // Highlight stripe
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(p.x + s(5), 0, s(5), p.top);
    ctx.fillRect(p.x + s(5), p.bottom + s(18), s(5), H - p.bottom - s(18));
  }
}

// ---- HUD ---------------------------------------------------

function drawCoinIcon(x, y, r) {
  ctx.save();
  ctx.fillStyle   = "#ffd700";
  ctx.strokeStyle = "#e65100";
  ctx.lineWidth   = s(1.5);
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle    = "#e65100";
  ctx.font         = `bold ${Math.round(r * 1.2)}px Arial, sans-serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x + r, y + r);
  ctx.restore();
}

function drawHUD() {
  ctx.save();

  // Score pill backdrop
  ctx.textAlign = "center";
  ctx.font      = `bold ${s(38)}px Arial, sans-serif`;
  const scoreStr = String(score);
  const scoreW   = Math.max(s(62), ctx.measureText(scoreStr).width + s(26));
  ctx.fillStyle  = "rgba(0,0,0,0.32)";
  roundRect(W / 2 - scoreW / 2, s(10), scoreW, s(44), s(14));
  ctx.fill();

  // Score number
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = "rgba(255,255,255,0.96)";
  ctx.shadowColor  = "rgba(0,0,0,0.55)";
  ctx.shadowBlur   = s(4);
  ctx.fillText(scoreStr, W / 2, s(49));

  // Coin counter top-left
  drawCoinIcon(s(10), s(10), s(11));
  ctx.font      = `bold ${s(16)}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd700";
  ctx.shadowBlur = 0;
  ctx.fillText(save.coins, s(36), s(26));
  ctx.restore();
}

// ---- Menu screen -------------------------------------------

function drawMenu() {
  drawBackground();

  // Title card
  ctx.save();
  ctx.shadowColor   = "rgba(0,0,0,0.55)";
  ctx.shadowBlur    = s(16);
  const cardGrad = ctx.createLinearGradient(W * 0.1, H * 0.07, W * 0.1, H * 0.07 + H * 0.34);
  cardGrad.addColorStop(0, "rgba(20,20,60,0.80)");
  cardGrad.addColorStop(1, "rgba(5,5,25,0.80)");
  ctx.fillStyle = cardGrad;
  roundRect(W * 0.1, H * 0.07, W * 0.8, H * 0.34, s(16));
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,215,0,0.22)";
  ctx.lineWidth   = s(1.5);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";

  // Title
  ctx.font        = `bold ${s(54)}px Arial, sans-serif`;
  ctx.fillStyle   = "#ffd700";
  ctx.shadowColor = "#ff6600";
  ctx.shadowBlur  = s(18);
  ctx.strokeStyle = "rgba(200,100,0,0.5)";
  ctx.lineWidth   = s(1.5);
  ctx.strokeText("FLAP!", W / 2, H * 0.18);
  ctx.fillText("FLAP!", W / 2, H * 0.18);

  // Tagline
  ctx.font        = `${s(14)}px Arial, sans-serif`;
  ctx.fillStyle   = "rgba(255,255,255,0.75)";
  ctx.shadowBlur  = 0;
  ctx.fillText("Tap · Click · Space", W / 2, H * 0.24);

  // Best score
  ctx.font      = `bold ${s(16)}px Arial, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText(`Best: ${save.highScore}`, W / 2, H * 0.30);

  ctx.restore();

  // Bird preview – animated bob
  const skin = getSkin(save.currentSkin);
  const bw = s(52), bh = s(37);
  const bob = Math.sin(Date.now() / MENU_BOB_PERIOD) * s(7);
  drawBirdAt(W / 2 - bw / 2, H * 0.35 + bob, bw, bh, bob * 0.35, skin);

  // Coin display
  drawCoinIcon(W * 0.5 - s(44), H * 0.46, s(11));
  ctx.font         = `bold ${s(17)}px Arial, sans-serif`;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle    = "#ffd700";
  ctx.fillText(`${save.coins} coins`, W * 0.5 - s(20), H * 0.46 + s(11));

  // Buttons
  const bW = W * 0.62, bH = s(52);
  const bX = (W - bW) / 2;
  drawButton(bX, H * 0.56, bW, bH, "▶  PLAY");
  drawButton(bX, H * 0.56 + bH + s(14), bW, bH, "🎨  SHOP", false);
}

// ---- Shop screen -------------------------------------------

let shopScroll = 0;
let shopDragStartY = null;
let shopDragStartScroll = 0;

const CARD_H  = () => s(82);
const CARD_GAP = () => s(10);
const SHOP_HEADER = () => s(58);

function maxShopScroll() {
  const total = SKINS.length * (CARD_H() + CARD_GAP()) + SHOP_HEADER() + s(10);
  return Math.max(0, total - H);
}

function drawShop() {
  // Background
  ctx.fillStyle = "#12122a";
  ctx.fillRect(0, 0, W, H);

  // Draw cards (clipped below header)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SHOP_HEADER(), W, H - SHOP_HEADER());
  ctx.clip();

  const cw = W * 0.88;
  const cx = (W - cw) / 2;
  const startY = SHOP_HEADER() + s(8) - shopScroll;

  for (let i = 0; i < SKINS.length; i++) {
    const skin     = SKINS[i];
    const cy       = startY + i * (CARD_H() + CARD_GAP());
    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.currentSkin === skin.id;

    // Card
    ctx.fillStyle = selected
      ? "rgba(255,200,0,0.15)"
      : "rgba(255,255,255,0.06)";
    roundRect(cx, cy, cw, CARD_H(), s(10));
    ctx.fill();

    if (selected) {
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth   = s(2);
      ctx.stroke();
    }

    // Bird preview
    const bw = s(38), bh = s(27);
    drawBirdAt(cx + s(12), cy + (CARD_H() - bh) / 2, bw, bh, 0, skin);

    // Name
    ctx.fillStyle    = "#fff";
    ctx.font         = `bold ${s(15)}px Arial, sans-serif`;
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(skin.name, cx + s(60), cy + CARD_H() * 0.42);

    // Cost / status line
    if (unlocked) {
      ctx.font      = `${s(12)}px Arial, sans-serif`;
      ctx.fillStyle = selected ? "#ffd700" : "#aaa";
      ctx.fillText(selected ? "✔ Equipped" : "Tap to equip", cx + s(60), cy + CARD_H() * 0.68);
    } else {
      ctx.font      = `${s(12)}px Arial, sans-serif`;
      ctx.fillStyle = save.coins >= skin.cost ? "#66bb6a" : "#ef5350";
      ctx.fillText(`🪙 ${skin.cost} coins`, cx + s(60), cy + CARD_H() * 0.68);
    }

    // Action button
    if (!selected) {
      const btnW = s(68), btnH = s(30);
      const btnX = cx + cw - btnW - s(10);
      const btnY = cy + (CARD_H() - btnH) / 2;
      const canBuy = !unlocked && save.coins >= skin.cost;
      drawButton(btnX, btnY, btnW, btnH, unlocked ? "WEAR" : "BUY", canBuy || unlocked);
    }
  }
  ctx.restore();

  // Header (drawn on top so it covers scrolled cards)
  ctx.fillStyle = "#0a0a22";
  ctx.fillRect(0, 0, W, SHOP_HEADER());
  ctx.fillStyle = "#1a1a40";
  ctx.fillRect(0, SHOP_HEADER() - s(2), W, s(2));

  ctx.save();
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = `bold ${s(22)}px Arial, sans-serif`;
  ctx.fillStyle    = "#ffd700";
  ctx.fillText("SKIN SHOP", W / 2, SHOP_HEADER() / 2);

  // Coin display
  drawCoinIcon(s(10), s(10), s(11));
  ctx.font         = `bold ${s(14)}px Arial, sans-serif`;
  ctx.textAlign    = "left";
  ctx.fillStyle    = "#ffd700";
  ctx.fillText(save.coins, s(36), s(22));

  // Back button
  ctx.textAlign = "right";
  ctx.font      = `bold ${s(15)}px Arial, sans-serif`;
  ctx.fillStyle = "#aaa";
  ctx.fillText("← BACK", W - s(12), SHOP_HEADER() / 2);
  ctx.restore();
}

// ---- Game Over screen --------------------------------------

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, W, H);

  const pW = W * 0.8, pH = H * 0.44;
  const pX = (W - pW) / 2, pY = (H - pH) / 2 - s(20);

  // Panel with gradient
  const panelGrad = ctx.createLinearGradient(pX, pY, pX, pY + pH);
  panelGrad.addColorStop(0, "rgba(18,18,50,0.96)");
  panelGrad.addColorStop(1, "rgba(6,6,28,0.96)");
  ctx.fillStyle = panelGrad;
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur  = s(20);
  roundRect(pX, pY, pW, pH, s(18));
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(239,83,80,0.35)";
  ctx.lineWidth   = s(1.5);
  ctx.stroke();

  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";

  ctx.font        = `bold ${s(32)}px Arial, sans-serif`;
  ctx.fillStyle   = "#ef5350";
  ctx.shadowColor = "rgba(239,83,80,0.4)";
  ctx.shadowBlur  = s(8);
  ctx.fillText("GAME OVER", W / 2, pY + s(46));
  ctx.shadowBlur  = 0;

  // Divider
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(pX + pW * 0.1, pY + s(54), pW * 0.8, s(1));

  ctx.font      = `bold ${s(22)}px Arial, sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText(`Score: ${score}`, W / 2, pY + s(80));

  ctx.font      = `${s(14)}px Arial, sans-serif`;
  ctx.fillStyle = "#aaa";
  ctx.fillText(`Best: ${save.highScore}`, W / 2, pY + s(100));

  if (coinsEarned > 0) {
    ctx.font      = `bold ${s(16)}px Arial, sans-serif`;
    ctx.fillStyle = "#ffd700";
    ctx.fillText(`+${coinsEarned} 🪙 coins earned!`, W / 2, pY + s(124));
  }

  ctx.restore();

  const btnW = W * 0.55, btnH = s(48);
  const btnX = (W - btnW) / 2, btnY = pY + pH - s(60);
  drawButton(btnX, btnY, btnW, btnH, "▶  PLAY AGAIN");

  // Menu link
  ctx.save();
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font         = `${s(13)}px Arial, sans-serif`;
  ctx.fillStyle    = "rgba(255,255,255,0.5)";
  ctx.fillText("or tap outside to return to menu", W / 2, pY + pH + s(16));
  ctx.restore();
}

// ---- Main draw loop ----------------------------------------

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state === S.MENU) { drawMenu(); return; }
  if (state === S.SHOP) { drawShop(); return; }

  drawBackground();
  drawPipes();
  drawBirdAt(bird.x, bird.y, bird.w, bird.h, bird.vy, getSkin(save.currentSkin));
  drawHUD();
  if (state === S.GAME_OVER) drawGameOver();
}

// ---- Input -------------------------------------------------

function canvasPos(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  const src    = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY,
  };
}

function hit(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

// Panel / button geometry helpers (must match drawGameOver)
function gameOverBtnRect() {
  const pW = W * 0.8, pH = H * 0.44;
  const pX = (W - pW) / 2, pY = (H - pH) / 2 - s(20);
  const btnW = W * 0.55, btnH = s(48);
  return { x: (W - btnW) / 2, y: pY + pH - s(58), w: btnW, h: btnH, pX, pY, pW, pH };
}

function handlePointerDown(e) {
  const p = canvasPos(e);

  if (state === S.MENU) {
    const bW = W * 0.62, bH = s(52);
    const bX = (W - bW) / 2;
    if (hit(p.x, p.y, bX, H * 0.56, bW, bH)) {
      ensureAudio();
      state = S.PLAYING;
      resetGame();
      return;
    }
    if (hit(p.x, p.y, bX, H * 0.56 + bH + s(14), bW, bH)) {
      shopScroll = 0;
      state = S.SHOP;
      return;
    }
    return;
  }

  if (state === S.SHOP) {
    // Back button
    if (hit(p.x, p.y, W - s(90), 0, s(82), SHOP_HEADER())) {
      state = S.MENU;
      return;
    }
    shopDragStartY      = p.y;
    shopDragStartScroll = shopScroll;
    return;
  }

  if (state === S.PLAYING) {
    flap();
    return;
  }

  if (state === S.GAME_OVER) {
    const r = gameOverBtnRect();
    if (hit(p.x, p.y, r.x, r.y, r.w, r.h)) {
      state = S.PLAYING;
      resetGame();
      return;
    }
    // Tap outside panel → menu
    if (!hit(p.x, p.y, r.pX, r.pY, r.pW, r.pH)) {
      state = S.MENU;
    }
  }
}

function handlePointerMove(e) {
  if (state !== S.SHOP || shopDragStartY === null) return;
  const p = canvasPos(e);
  const dy = shopDragStartY - p.y;
  shopScroll = Math.max(0, Math.min(maxShopScroll(), shopDragStartScroll + dy));
}

function handlePointerUp(e) {
  if (state === S.SHOP && shopDragStartY !== null) {
    const p = canvasPos(e);
    const dy = Math.abs(p.y - shopDragStartY);
    // If minimal drag → treat as a tap on a card
    if (dy < s(6)) handleShopTap(p.x, p.y);
    shopDragStartY = null;
  }
}

function handleShopTap(px, py) {
  const cw     = W * 0.88;
  const cx     = (W - cw) / 2;
  const startY = SHOP_HEADER() + s(8) - shopScroll;

  for (let i = 0; i < SKINS.length; i++) {
    const skin     = SKINS[i];
    const cy       = startY + i * (CARD_H() + CARD_GAP());
    if (!hit(px, py, cx, cy, cw, CARD_H())) continue;

    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.currentSkin === skin.id;

    // Action button area
    const btnW = s(68), btnH = s(30);
    const btnX = cx + cw - btnW - s(10);
    const btnY = cy + (CARD_H() - btnH) / 2;

    if (hit(px, py, btnX, btnY, btnW, btnH)) {
      if (!unlocked && save.coins >= skin.cost) {
        save.coins -= skin.cost;
        save.unlockedSkins.push(skin.id);
        save.currentSkin = skin.id;
        writeSave();
        playBeep({ freq: 1050, duration: 0.12, type: "sine", gain: 0.2 });
      } else if (unlocked && !selected) {
        save.currentSkin = skin.id;
        writeSave();
        playBeep({ freq: 800, duration: 0.07, type: "sine", gain: 0.15 });
      }
      return;
    }

    // Tap card body to equip if already owned
    if (unlocked && !selected) {
      save.currentSkin = skin.id;
      writeSave();
    }
    return;
  }
}

// Pointer events (works for both mouse and touch)
canvas.addEventListener("pointerdown",  handlePointerDown, { passive: false });
canvas.addEventListener("pointermove",  handlePointerMove, { passive: true });
canvas.addEventListener("pointerup",    handlePointerUp,   { passive: true });
canvas.addEventListener("pointercancel", () => { shopDragStartY = null; });

// Prevent context menu on long-press (mobile)
canvas.addEventListener("contextmenu", e => e.preventDefault());

// Keyboard
document.addEventListener("keydown", e => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (state === S.PLAYING)  { flap(); return; }
    if (state === S.MENU)     { ensureAudio(); state = S.PLAYING; resetGame(); return; }
    if (state === S.GAME_OVER){ state = S.PLAYING; resetGame(); return; }
  }
  if (e.key === "Escape") {
    if (state === S.SHOP)     { state = S.MENU; return; }
    if (state === S.PLAYING)  { triggerGameOver(); return; }
    if (state === S.GAME_OVER){ state = S.MENU; return; }
  }
});

// ---- Audio -------------------------------------------------

let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playBeep({ freq = 440, duration = 0.1, type = "square", gain = 0.2 }) {
  const c = audioCtx;
  if (!c) return;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(c.destination);
  const now = c.currentTime;
  osc.start(now);
  osc.stop(now + duration);
}

function playFlapSound() {
  const c = audioCtx;
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
  g.gain.setValueAtTime(0.0,   now);
  g.gain.linearRampToValueAtTime(0.25, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

function playHitSound() {
  const c = audioCtx;
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g   = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

// ---- Boot --------------------------------------------------

initClouds();
update();
