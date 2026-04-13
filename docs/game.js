"use strict";

// ============================================================
//  Flap — responsive Flappy Bird
//  * HiDPI / Retina canvas quality fix (devicePixelRatio)
//  * Accounts: register / login with premade & custom avatars
//  * Profile icon top-right (guest silhouette when not logged in)
//  * Multiplayer via PeerJS: room codes like KND-565,
//    two birds, username label above each bird
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");

const DESIGN_W = 360;
const DESIGN_H = 640;
let W = DESIGN_W, H = DESIGN_H;

const MENU_BOB_PERIOD = 420;

function s(n) { return n * (W / DESIGN_W); }

// ---- Canvas resize with devicePixelRatio -------------------

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 540) {
    W = vw;
    H = vh;
  } else {
    H = Math.min(vh - 20, 650);
    W = Math.round(H * (DESIGN_W / DESIGN_H));
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cachedSkyGrad      = null;
  cachedPipeGrad     = null;
  cachedMenuCardGrad = null;
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  if (state === S.PLAYING) state = S.MENU;
});

// ---- Accounts ----------------------------------------------

const ACCOUNTS_KEY = "flap_accounts_v1";
const SESSION_KEY  = "flap_session_v1";

const PREMADE_AVATARS = [
  { id: "av1", bg: "#ffeb3b", emoji: "🐦" },
  { id: "av2", bg: "#ef5350", emoji: "🦅" },
  { id: "av3", bg: "#42a5f5", emoji: "🐧" },
  { id: "av4", bg: "#66bb6a", emoji: "🐸" },
  { id: "av5", bg: "#ab47bc", emoji: "👻" },
  { id: "av6", bg: "#ff9800", emoji: "🦊" },
  { id: "av7", bg: "#26c6da", emoji: "🤖" },
  { id: "av8", bg: "#8d6e63", emoji: "🐺" },
];

const pfpImgCache = {}; // username -> HTMLImageElement for custom uploads

function loadAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || []; }
  catch { return []; }
}
function persistAccounts() {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}
function persistSession(user) {
  localStorage.setItem(SESSION_KEY, user ? JSON.stringify(user) : "null");
}

function cachePfpImg(username, pfp) {
  if (!pfp || pfp.type !== "custom" || pfpImgCache[username]) return;
  const img = new Image();
  img.src = pfp.dataUrl;
  pfpImgCache[username] = img;
}

// Hash password with SHA-256 (username as salt) using SubtleCrypto
async function hashPw(username, password) {
  try {
    const data = new TextEncoder().encode(username.toLowerCase() + ":" + password);
    const buf  = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  } catch (ex) {
    // SubtleCrypto unavailable (non-HTTPS dev env) — prefix so format is detectable
    return "plain:" + password;
  }
}

async function registerAccount(username, password, pfp) {
  username = username.trim();
  if (username.length < 2 || username.length > 20)
    return { ok: false, msg: "Username must be 2-20 characters" };
  if (password.length < 4)
    return { ok: false, msg: "Password must be at least 4 characters" };
  if (accounts.find(function(a) { return a.username.toLowerCase() === username.toLowerCase(); }))
    return { ok: false, msg: "Username already taken" };
  var hashed = await hashPw(username, password);
  accounts.push({ username: username, passwordHash: hashed, pfp: pfp || null });
  persistAccounts();
  currentUser = { username: username, pfp: pfp || null };
  persistSession(currentUser);
  cachePfpImg(username, pfp);
  return { ok: true };
}

async function loginAccount(username, password) {
  username = username.trim();
  var hashed = await hashPw(username, password);
  var acct = accounts.find(function(a) {
    if (a.username.toLowerCase() !== username.toLowerCase()) return false;
    // Support both hashed (new) and legacy plain-text passwords migrated on first login
    if (a.passwordHash) return a.passwordHash === hashed;
    if (a.password === password) {
      // Migrate to hashed on first successful login
      a.passwordHash = hashed;
      delete a.password;
      persistAccounts();
      return true;
    }
    return false;
  });
  if (!acct) return { ok: false, msg: "Invalid username or password" };
  currentUser = { username: acct.username, pfp: acct.pfp || null };
  persistSession(currentUser);
  cachePfpImg(acct.username, acct.pfp);
  return { ok: true };
}

function logoutAccount() {
  currentUser = null;
  persistSession(null);
}

let accounts    = loadAccounts();
let currentUser = loadSession();
if (currentUser) cachePfpImg(currentUser.username, currentUser.pfp);

// ---- Game save (coins / skins / high score) ----------------

const SAVE_KEY = "flap_save_v2";

function defaultSave() {
  return { coins: 0, unlockedSkins: ["classic"], currentSkin: "classic", highScore: 0 };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return Object.assign(defaultSave(), JSON.parse(raw));
  } catch { return defaultSave(); }
}
function writeSave() { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }

let save = loadSave();

// ---- Skins -------------------------------------------------

const SKINS = [
  {
    id: "classic", name: "Classic", cost: 0,
    bodyColor: "#ffeb3b", wingColor: "#fbc02d",
    eyeColor: "#fff",    pupilColor: "#000", beakColor: "#ff9800",
  },
  {
    id: "red", name: "Red Hawk", cost: 50,
    bodyColor: "#ef5350", wingColor: "#b71c1c",
    eyeColor: "#fff",    pupilColor: "#000", beakColor: "#ff6f00",
  },
  {
    id: "blue", name: "Blue Jay", cost: 100,
    bodyColor: "#42a5f5", wingColor: "#0d47a1",
    eyeColor: "#fff",    pupilColor: "#000", beakColor: "#f9a825",
  },
  {
    id: "green", name: "Parrot", cost: 150,
    bodyColor: "#66bb6a", wingColor: "#1b5e20",
    eyeColor: "#fff",    pupilColor: "#000", beakColor: "#ffd600",
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

function getSkin(id) { return SKINS.find(sk => sk.id === id) || SKINS[0]; }

// ---- State machine -----------------------------------------

const S = { MENU: 0, SHOP: 1, PLAYING: 2, GAME_OVER: 3, MULTIPLAYER: 4 };
let state = S.MENU;

// ---- Game variables ----------------------------------------

let bird        = {};
let pipes       = [];
let frameCount  = 0;
let score       = 0;
let coinsEarned = 0;
let groundX     = 0;
let clouds      = [];
let cachedSkyGrad      = null;   // invalidated on resize
let cachedPipeGrad     = null;   // invalidated on resize
let cachedMenuCardGrad = null;   // invalidated on resize

// Multiplayer
let mpActive      = false;
let mpRole        = null;   // 'host' | 'guest'
let mpPeer        = null;
let mpConn        = null;
let mpCode        = null;
let mpSubState    = "menu"; // 'menu'|'creating'|'waiting'|'joining'|'connected'
let mpError       = "";
let otherBird     = null;
let otherUsername = "Guest";
let otherScore    = 0;
let otherBirdDead = false;
let myBirdDead    = false;

function initClouds() {
  clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x:     Math.random() * W,
      y:     H * (0.05 + Math.random() * 0.25),
      r:     s(18 + Math.random() * 18),
      speed: s(0.3 + Math.random() * 0.3),
    });
  }
}

function resetGame() {
  bird = { x: s(80), y: H / 2, w: s(34), h: s(24), vy: 0 };
  if (mpActive) {
    otherBird     = { x: s(80), y: H / 2, w: s(34), h: s(24), vy: 0 };
    otherBirdDead = false;
    myBirdDead    = false;
  }
  pipes       = [];
  frameCount  = 0;
  score       = 0;
  otherScore  = 0;
  coinsEarned = 0;
  groundX     = 0;
  initClouds();
}

// ---- Difficulty --------------------------------------------

function pipeSpeed()     { return s(1.6) + Math.floor(score / 10) * s(0.15); }
function pipeGap()       { return Math.max(s(130), s(170) - Math.floor(score / 15) * s(4)); }
function pipeWidth()     { return s(55); }
function spawnInterval() { return Math.max(Math.floor(s(185) / pipeSpeed()), 55); }

// ---- Pipe helpers ------------------------------------------

function spawnPipe(topOverride) {
  const top = (topOverride !== undefined) ? topOverride : (() => {
    const minTop = s(55);
    const maxTop = H - pipeGap() - s(95);
    return Math.random() * (maxTop - minTop) + minTop;
  })();
  pipes.push({ x: W + pipeWidth(), top, bottom: top + pipeGap(), scored: false, scoredOther: false });
}

// ---- Flap --------------------------------------------------

function flap() {
  ensureAudio();
  if (state === S.PLAYING && !myBirdDead) {
    bird.vy = -s(5.8);
    playFlapSound();
    if (mpActive && mpConn) mpConn.send({ type: "flap" });
  }
}

// ---- Game Over ---------------------------------------------

function triggerGameOver() {
  if (!mpActive) {
    if (state === S.GAME_OVER) return;
    state = S.GAME_OVER;
    playHitSound();
    coinsEarned = Math.floor(score / 2) + (score >= 5 ? 5 : 0);
    save.coins += coinsEarned;
    if (score > save.highScore) save.highScore = score;
    writeSave();
    return;
  }
  if (myBirdDead) return;
  myBirdDead = true;
  playHitSound();
  if (mpConn) mpConn.send({ type: "dead", score });
  if (otherBirdDead) endMpGame();
}

function endMpGame() {
  state = S.GAME_OVER;
  coinsEarned = Math.floor(score / 2) + (score >= 5 ? 5 : 0);
  save.coins += coinsEarned;
  if (score > save.highScore) save.highScore = score;
  writeSave();
}

// ---- Game loop timing --------------------------------------

let lastFrameTime = performance.now();
let accumulator   = 0;
const FIXED_DT    = 1000 / 60;

// ---- Physics step ------------------------------------------

function step() {
  if (state !== S.PLAYING) return;

  const sp = pipeSpeed();
  const pw = pipeWidth();

  // My bird physics
  if (!myBirdDead) {
    bird.vy += s(0.22);
    bird.y  += bird.vy;
    if (bird.y + bird.h >= H - s(68) || bird.y <= 0) triggerGameOver();
  }

  // Pipes: host (or solo) drives spawning; both sides scroll them
  if (!mpActive || mpRole === "host") {
    frameCount++;
    if (frameCount % spawnInterval() === 0) {
      const minTop = s(55), maxTop = H - pipeGap() - s(95);
      const top    = Math.random() * (maxTop - minTop) + minTop;
      spawnPipe(top);
      if (mpActive && mpConn) mpConn.send({ type: "pipe", top });
    }
  }
  for (const p of pipes) p.x -= sp;
  pipes = pipes.filter(p => p.x + pw > 0);

  // Score + collision for my bird
  if (!myBirdDead) {
    for (const p of pipes) {
      if (!p.scored && p.x + pw / 2 < bird.x) {
        p.scored = true;
        score++;
        playBeep({ freq: 900, duration: 0.05, gain: 0.15 });
      }
    }
    for (const p of pipes) {
      const inX = bird.x + bird.w > p.x && bird.x < p.x + pw;
      if (inX && (bird.y < p.top || bird.y + bird.h > p.bottom)) triggerGameOver();
    }
  }

  // Score for other bird (host tracks)
  if (mpActive && mpRole === "host" && otherBird && !otherBirdDead) {
    for (const p of pipes) {
      if (!p.scoredOther && p.x + pw / 2 < otherBird.x) {
        p.scoredOther = true;
        otherScore++;
      }
    }
  }

  // Ground scroll + clouds
  groundX = (groundX - sp) % s(24);
  for (const c of clouds) {
    c.x -= c.speed;
    if (c.x + c.r * 3 < 0) {
      c.x = W + c.r;
      c.y = H * (0.05 + Math.random() * 0.25);
      c.r = s(18 + Math.random() * 18);
    }
  }

  // Sync to peer
  if (mpActive && mpConn) {
    if (mpRole === "host") {
      mpConn.send({
        type:  "sync",
        pipes: pipes.map(p => ({ x: p.x, top: p.top, bottom: p.bottom })),
        bird:  { y: bird.y, vy: bird.vy },
        score: otherScore,
      });
    } else {
      mpConn.send({ type: "bird", y: bird.y, vy: bird.vy });
    }
  }
}

// ---- Main loop ---------------------------------------------

function update(ts = 0) {
  const elapsed = Math.min(ts - lastFrameTime, 100);
  lastFrameTime = ts;
  accumulator  += elapsed;
  while (accumulator >= FIXED_DT) { step(); accumulator -= FIXED_DT; }
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

function drawButton(x, y, w, h, label, primary) {
  if (primary === undefined) primary = true;
  const r = h / 3;
  ctx.save();
  ctx.shadowColor    = "rgba(0,0,0,0.5)";
  ctx.shadowBlur     = s(8);
  ctx.shadowOffsetY  = s(3);
  roundRect(x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (primary) { g.addColorStop(0, "#ffb347"); g.addColorStop(1, "#c0392b"); }
  else         { g.addColorStop(0, "#7f8c8d"); g.addColorStop(1, "#2d3436"); }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.save();
  roundRect(x, y, w, h, r);
  ctx.clip();
  roundRect(x + 1, y + 1, w - 2, h * 0.45, r);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle     = "#fff";
  ctx.font          = "bold " + Math.round(h * 0.38) + "px Arial, sans-serif";
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.shadowColor   = "rgba(0,0,0,0.4)";
  ctx.shadowBlur    = s(2);
  ctx.shadowOffsetY = s(1);
  ctx.fillText(label, x + w / 2, y + h / 2 + s(1));
  ctx.restore();
}

// ---- Avatar drawing ----------------------------------------

function drawAvatarCircle(cx, cy, r, pfp, username) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  if (pfp && pfp.type === "custom") {
    const img = pfpImgCache[username];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = "#444";
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  } else if (pfp && pfp.type === "premade") {
    const av = PREMADE_AVATARS.find(a => a.id === pfp.avatarId) || PREMADE_AVATARS[0];
    ctx.fillStyle = av.bg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.save();
    ctx.font         = Math.round(r * 1.15) + "px sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(av.emoji, cx, cy + r * 0.07);
  } else {
    // Guest silhouette
    ctx.fillStyle = "#2e2e50";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "#7878aa";
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.18, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.76, r * 0.62, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth   = s(1.8);
  ctx.stroke();
}

function profileR()  { return s(18); }
function profileCX() { return W - s(12) - profileR(); }
function profileCY() { return s(12) + profileR(); }

function drawProfileIcon() {
  drawAvatarCircle(
    profileCX(), profileCY(), profileR(),
    currentUser ? currentUser.pfp : null,
    currentUser ? currentUser.username : null
  );
}

// ---- Draw bird ---------------------------------------------

function drawBirdAt(x, y, w, h, vy, skin, alpha) {
  ctx.save();
  if (typeof alpha === "number" && alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(Math.min(Math.max(vy / 9, -0.5), 0.75));

  ctx.fillStyle = skin.wingColor;
  ctx.beginPath();
  ctx.ellipse(-w * 0.1, h * 0.22, w * 0.33, h * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.bodyColor;
  roundRect(-w / 2, -h / 2, w, h, h * 0.32);
  ctx.fill();

  ctx.fillStyle = skin.eyeColor;
  ctx.beginPath();
  ctx.arc(w * 0.12, -h * 0.18, h * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.pupilColor;
  ctx.beginPath();
  ctx.arc(w * 0.17, -h * 0.18, h * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.beakColor;
  ctx.beginPath();
  ctx.moveTo(w / 2,             -h * 0.05);
  ctx.lineTo(w / 2 + w * 0.28, -h * 0.22);
  ctx.lineTo(w / 2 + w * 0.28,  h * 0.1);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawBirdLabel(x, y, w, label, color) {
  ctx.save();
  ctx.font         = "bold " + s(11) + "px Arial, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  const tw = ctx.measureText(label).width;
  const px = s(6), py = s(4);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(x + w / 2 - tw / 2 - px, y - s(22), tw + px * 2, s(14) + py, s(4));
  ctx.fill();
  ctx.fillStyle   = color || "#fff";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur  = s(3);
  ctx.fillText(label, x + w / 2, y - s(11));
  ctx.restore();
}

// ---- Draw background & pipes --------------------------------

function drawBackground() {
  if (!cachedSkyGrad) {
    cachedSkyGrad = ctx.createLinearGradient(0, 0, 0, H);
    cachedSkyGrad.addColorStop(0,    "#5fc8ea");
    cachedSkyGrad.addColorStop(0.75, "#b8e4f0");
    cachedSkyGrad.addColorStop(1,    "#87ceeb");
  }
  ctx.fillStyle = cachedSkyGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  for (const c of clouds) drawCloud(c.x, c.y, c.r);

  const groundY = H - s(70);
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, groundY, W, s(70));
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, groundY, W, s(8));
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  const sw = s(24);
  for (let x = groundX; x < W + sw; x += sw * 2)
    ctx.fillRect(x, groundY, sw, s(70));
}

function drawCloud(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx,           cy,           r,       0, Math.PI * 2);
  ctx.arc(cx + r,       cy - r * 0.3, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx + r * 1.8, cy,           r * 0.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipes() {
  const pw = pipeWidth();
  if (!cachedPipeGrad) {
    cachedPipeGrad = ctx.createLinearGradient(0, 0, pw, 0);
    cachedPipeGrad.addColorStop(0,   "#4caf50");
    cachedPipeGrad.addColorStop(0.5, "#66bb6a");
    cachedPipeGrad.addColorStop(1,   "#388e3c");
  }
  for (const p of pipes) {
    ctx.save();
    ctx.translate(p.x, 0);

    ctx.fillStyle = cachedPipeGrad;
    ctx.fillRect(0, 0, pw, p.top);
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(-s(3), p.top - s(18), pw + s(6), s(18));

    ctx.fillStyle = cachedPipeGrad;
    ctx.fillRect(0, p.bottom, pw, H - p.bottom);
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(-s(3), p.bottom, pw + s(6), s(18));

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(s(5), 0, s(5), p.top);
    ctx.fillRect(s(5), p.bottom + s(18), s(5), H - p.bottom - s(18));

    ctx.restore();
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
  ctx.font         = "bold " + Math.round(r * 1.2) + "px Arial, sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", x + r, y + r);
  ctx.restore();
}

function drawHUD() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font      = "bold " + s(38) + "px Arial, sans-serif";
  const scoreStr = String(score);
  const scoreW   = Math.max(s(62), ctx.measureText(scoreStr).width + s(26));
  ctx.fillStyle  = "rgba(0,0,0,0.32)";
  roundRect(W / 2 - scoreW / 2, s(10), scoreW, s(44), s(14));
  ctx.fill();
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle    = "rgba(255,255,255,0.96)";
  ctx.shadowColor  = "rgba(0,0,0,0.55)";
  ctx.shadowBlur   = s(4);
  ctx.fillText(scoreStr, W / 2, s(49));

  drawCoinIcon(s(10), s(10), s(11));
  ctx.font      = "bold " + s(16) + "px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd700";
  ctx.shadowBlur = 0;
  ctx.fillText(save.coins, s(36), s(26));
  ctx.restore();

  if (mpActive) {
    ctx.save();
    ctx.font         = "bold " + s(12) + "px Arial, sans-serif";
    ctx.textAlign    = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle    = "rgba(255,255,255,0.7)";
    ctx.fillText(otherUsername + ": " + otherScore, W - s(6), s(44));
    ctx.restore();
  }

  drawProfileIcon();
}

// ---- Menu screen -------------------------------------------

function drawMenu() {
  drawBackground();

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur  = s(16);
  if (!cachedMenuCardGrad) {
    cachedMenuCardGrad = ctx.createLinearGradient(W * 0.1, H * 0.07, W * 0.1, H * 0.07 + H * 0.28);
    cachedMenuCardGrad.addColorStop(0, "rgba(20,20,60,0.82)");
    cachedMenuCardGrad.addColorStop(1, "rgba(5,5,25,0.82)");
  }
  ctx.fillStyle = cachedMenuCardGrad;
  roundRect(W * 0.1, H * 0.07, W * 0.8, H * 0.28, s(16));
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,215,0,0.22)";
  ctx.lineWidth   = s(1.5);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";

  ctx.font        = "bold " + s(54) + "px Arial, sans-serif";
  ctx.fillStyle   = "#ffd700";
  ctx.shadowColor = "#ff6600";
  ctx.shadowBlur  = s(18);
  ctx.strokeStyle = "rgba(200,100,0,0.5)";
  ctx.lineWidth   = s(1.5);
  ctx.strokeText("FLAP!", W / 2, H * 0.165);
  ctx.fillText("FLAP!",   W / 2, H * 0.165);

  ctx.font      = s(14) + "px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.shadowBlur = 0;
  ctx.fillText("Tap  Click  Space", W / 2, H * 0.225);

  ctx.font      = "bold " + s(16) + "px Arial, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("Best: " + save.highScore, W / 2, H * 0.27);
  ctx.restore();

  const skin = getSkin(save.currentSkin);
  const bw = s(52), bh = s(37);
  const bob = Math.sin(Date.now() / MENU_BOB_PERIOD) * s(7);
  drawBirdAt(W / 2 - bw / 2, H * 0.32 + bob, bw, bh, bob * 0.35, skin);

  drawCoinIcon(W * 0.5 - s(44), H * 0.42, s(11));
  ctx.font         = "bold " + s(17) + "px Arial, sans-serif";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle    = "#ffd700";
  ctx.fillText(save.coins + " coins", W * 0.5 - s(20), H * 0.42 + s(11));

  const bW = W * 0.62, bH = s(50);
  const bX = (W - bW) / 2;
  drawButton(bX, H * 0.50,                     bW, bH, "  PLAY");
  drawButton(bX, H * 0.50 + bH + s(12),        bW, bH, "  SHOP", false);
  drawButton(bX, H * 0.50 + (bH + s(12)) * 2,  bW, bH, "  MULTIPLAYER", false);

  drawProfileIcon();

  if (currentUser) {
    ctx.save();
    ctx.font         = "bold " + s(11) + "px Arial, sans-serif";
    ctx.textAlign    = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle    = "rgba(255,255,255,0.6)";
    ctx.fillText(currentUser.username, W - s(6), s(44));
    ctx.restore();
  }
}

// ---- Shop screen -------------------------------------------

let shopScroll          = 0;
let shopDragStartY      = null;
let shopDragStartScroll = 0;

const CARD_H      = function() { return s(82); };
const CARD_GAP    = function() { return s(10); };
const SHOP_HEADER = function() { return s(58); };

function maxShopScroll() {
  const ch = CARD_H(), cg = CARD_GAP(), sh = SHOP_HEADER();
  return Math.max(0, SKINS.length * (ch + cg) + sh + s(10) - H);
}

function drawShop() {
  const ch = CARD_H(), cg = CARD_GAP(), sh = SHOP_HEADER();

  ctx.fillStyle = "#12122a";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sh, W, H - sh);
  ctx.clip();

  const cw     = W * 0.88;
  const cx     = (W - cw) / 2;
  const startY = sh + s(8) - shopScroll;

  for (let i = 0; i < SKINS.length; i++) {
    const skin     = SKINS[i];
    const cy       = startY + i * (ch + cg);
    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.currentSkin === skin.id;

    ctx.fillStyle = selected ? "rgba(255,200,0,0.15)" : "rgba(255,255,255,0.06)";
    roundRect(cx, cy, cw, ch, s(10));
    ctx.fill();
    if (selected) { ctx.strokeStyle = "#ffd700"; ctx.lineWidth = s(2); ctx.stroke(); }

    const bw = s(38), bh = s(27);
    drawBirdAt(cx + s(12), cy + (ch - bh) / 2, bw, bh, 0, skin);

    ctx.fillStyle    = "#fff";
    ctx.font         = "bold " + s(15) + "px Arial, sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(skin.name, cx + s(60), cy + ch * 0.42);

    if (unlocked) {
      ctx.font      = s(12) + "px Arial, sans-serif";
      ctx.fillStyle = selected ? "#ffd700" : "#aaa";
      ctx.fillText(selected ? "Equipped" : "Tap to equip", cx + s(60), cy + ch * 0.68);
    } else {
      ctx.font      = s(12) + "px Arial, sans-serif";
      ctx.fillStyle = save.coins >= skin.cost ? "#66bb6a" : "#ef5350";
      ctx.fillText(skin.cost + " coins", cx + s(60), cy + ch * 0.68);
    }

    if (!selected) {
      const btnW = s(68), btnH = s(30);
      const btnX = cx + cw - btnW - s(10);
      const btnY = cy + (ch - btnH) / 2;
      const canBuy = !unlocked && save.coins >= skin.cost;
      drawButton(btnX, btnY, btnW, btnH, unlocked ? "WEAR" : "BUY", canBuy || unlocked);
    }
  }
  ctx.restore();

  ctx.fillStyle = "#0a0a22";
  ctx.fillRect(0, 0, W, sh);
  ctx.fillStyle = "#1a1a40";
  ctx.fillRect(0, sh - s(2), W, s(2));

  ctx.save();
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = "bold " + s(22) + "px Arial, sans-serif";
  ctx.fillStyle    = "#ffd700";
  ctx.fillText("SKIN SHOP", W / 2, sh / 2);

  drawCoinIcon(s(10), s(10), s(11));
  ctx.font      = "bold " + s(14) + "px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(save.coins, s(36), s(22));

  ctx.textAlign = "right";
  ctx.font      = "bold " + s(15) + "px Arial, sans-serif";
  ctx.fillStyle = "#aaa";
  ctx.fillText("< BACK", W - s(12), sh / 2);
  ctx.restore();
}

// ---- Multiplayer lobby screen ------------------------------

function drawMultiplayer() {
  ctx.fillStyle = "#0d0d28";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0a0a22";
  ctx.fillRect(0, 0, W, s(58));
  ctx.fillStyle = "#1a1a40";
  ctx.fillRect(0, s(56), W, s(2));

  ctx.save();
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.font         = "bold " + s(21) + "px Arial, sans-serif";
  ctx.fillStyle    = "#ffd700";
  ctx.fillText("MULTIPLAYER", W / 2, s(29));
  ctx.textAlign = "left";
  ctx.font      = "bold " + s(15) + "px Arial, sans-serif";
  ctx.fillStyle = "#aaa";
  ctx.fillText("< BACK", s(12), s(29));
  ctx.restore();

  if (mpSubState === "menu") {
    ctx.save();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.font         = s(14) + "px Arial, sans-serif";
    ctx.fillStyle    = "rgba(255,255,255,0.5)";
    ctx.fillText("Play with a friend in real-time!", W / 2, H * 0.30);
    ctx.restore();

    const sk1 = getSkin(save.currentSkin);
    const sk2 = getSkin(save.currentSkin === "blue" ? "classic" : "blue");
    const bw = s(44), bh = s(32);
    const bob = Math.sin(Date.now() / 350) * s(5);
    drawBirdAt(W / 2 - bw - s(12), H * 0.38 + bob, bw, bh, 0, sk1);
    drawBirdAt(W / 2 + s(12),       H * 0.38 - bob, bw, bh, 0, sk2);

    const bW = W * 0.62, bH = s(52);
    const bX = (W - bW) / 2;
    drawButton(bX, H * 0.54,               bW, bH, "CREATE ROOM");
    drawButton(bX, H * 0.54 + bH + s(14),  bW, bH, "JOIN ROOM", false);

  } else if (mpSubState === "creating") {
    ctx.save();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.font         = s(15) + "px Arial, sans-serif";
    ctx.fillStyle    = "rgba(255,255,255,0.55)";
    ctx.fillText("Setting up room...", W / 2, H * 0.45);
    ctx.restore();

  } else if (mpSubState === "waiting") {
    ctx.save();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    ctx.font      = "bold " + s(15) + "px Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("Share this code with your friend:", W / 2, H * 0.26);

    ctx.shadowColor = "rgba(255,215,0,0.55)";
    ctx.shadowBlur  = s(22);
    ctx.font        = "bold " + s(44) + "px Courier New, monospace";
    ctx.fillStyle   = "#ffd700";
    ctx.fillText(mpCode, W / 2, H * 0.40);
    ctx.shadowBlur  = 0;

    const dots = ".".repeat(Math.floor(Date.now() / 500) % 4);
    ctx.font      = s(13) + "px Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fillText("Waiting for friend to join" + dots, W / 2, H * 0.50);
    ctx.restore();

    const cbW = W * 0.5, cbH = s(44);
    drawButton((W - cbW) / 2, H * 0.62, cbW, cbH, "Cancel", false);

  } else if (mpSubState === "joining") {
    ctx.save();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.font         = s(15) + "px Arial, sans-serif";
    ctx.fillStyle    = "rgba(255,255,255,0.6)";
    ctx.fillText("Connecting...", W / 2, H * 0.42);
    if (mpError) {
      ctx.font      = s(13) + "px Arial, sans-serif";
      ctx.fillStyle = "#ef5350";
      ctx.fillText(mpError, W / 2, H * 0.50);
    }
    ctx.restore();

  } else if (mpSubState === "connected") {
    ctx.save();
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.font         = "bold " + s(18) + "px Arial, sans-serif";
    ctx.fillStyle    = "#66bb6a";
    ctx.fillText("Connected!", W / 2, H * 0.30);
    ctx.font      = s(14) + "px Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("Playing with: " + otherUsername, W / 2, H * 0.38);
    ctx.restore();

    if (mpRole === "host") {
      const bW = W * 0.62, bH = s(52);
      drawButton((W - bW) / 2, H * 0.50, bW, bH, "  START GAME");
    } else {
      ctx.save();
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.font         = s(14) + "px Arial, sans-serif";
      ctx.fillStyle    = "rgba(255,255,255,0.42)";
      ctx.fillText("Waiting for host to start...", W / 2, H * 0.52);
      ctx.restore();
    }
  }
}

// ---- Game Over screen --------------------------------------

function drawGameOver() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, W, H);

  const pW = W * 0.8;
  const pH = mpActive ? H * 0.52 : H * 0.44;
  const pX = (W - pW) / 2, pY = (H - pH) / 2 - s(20);

  const panelGrad = ctx.createLinearGradient(pX, pY, pX, pY + pH);
  panelGrad.addColorStop(0, "rgba(18,18,50,0.96)");
  panelGrad.addColorStop(1, "rgba(6,6,28,0.96)");
  ctx.fillStyle   = panelGrad;
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
  ctx.font         = "bold " + s(32) + "px Arial, sans-serif";
  ctx.fillStyle    = "#ef5350";
  ctx.shadowColor  = "rgba(239,83,80,0.4)";
  ctx.shadowBlur   = s(8);
  ctx.fillText("GAME OVER", W / 2, pY + s(46));
  ctx.shadowBlur   = 0;

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(pX + pW * 0.1, pY + s(54), pW * 0.8, s(1));

  if (!mpActive) {
    ctx.font      = "bold " + s(22) + "px Arial, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("Score: " + score, W / 2, pY + s(82));
    ctx.font      = s(14) + "px Arial, sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText("Best: " + save.highScore, W / 2, pY + s(102));
    if (coinsEarned > 0) {
      ctx.font      = "bold " + s(16) + "px Arial, sans-serif";
      ctx.fillStyle = "#ffd700";
      ctx.fillText("+" + coinsEarned + " coins earned!", W / 2, pY + s(126));
    }
  } else {
    const myName = currentUser ? currentUser.username : "You";
    ctx.font      = "bold " + s(17) + "px Arial, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(myName + ": " + score, W / 2, pY + s(82));
    ctx.font      = s(17) + "px Arial, sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText(otherUsername + ": " + otherScore, W / 2, pY + s(106));
    ctx.font = "bold " + s(18) + "px Arial, sans-serif";
    if (score > otherScore) {
      ctx.fillStyle = "#ffd700"; ctx.fillText("You Win!", W / 2, pY + s(134));
    } else if (score < otherScore) {
      ctx.fillStyle = "#aaa";    ctx.fillText("Good try!", W / 2, pY + s(134));
    } else {
      ctx.fillStyle = "#66bb6a"; ctx.fillText("Tie!", W / 2, pY + s(134));
    }
  }
  ctx.restore();

  const btnW = W * 0.55, btnH = s(48);
  const btnX = (W - btnW) / 2;
  const btnY = pY + pH - s(60);
  drawButton(btnX, btnY, btnW, btnH, "  PLAY AGAIN");

  ctx.save();
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font         = s(13) + "px Arial, sans-serif";
  ctx.fillStyle    = "rgba(255,255,255,0.5)";
  ctx.fillText("or tap outside to return to menu", W / 2, pY + pH + s(16));
  ctx.restore();
}

// ---- Main draw loop ----------------------------------------

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state === S.MENU)        { drawMenu();        return; }
  if (state === S.SHOP)        { drawShop();        return; }
  if (state === S.MULTIPLAYER) { drawMultiplayer(); return; }

  drawBackground();
  drawPipes();

  const mySkin = getSkin(save.currentSkin);

  if (mpActive && otherBird) {
    const altSkin = getSkin(mySkin.id === "blue" ? "classic" : "blue");
    drawBirdAt(otherBird.x, otherBird.y, otherBird.w, otherBird.h, otherBird.vy,
               altSkin, otherBirdDead ? 0.35 : 1);
    drawBirdLabel(otherBird.x, otherBird.y, otherBird.w, otherUsername, "#90caf9");
  }

  drawBirdAt(bird.x, bird.y, bird.w, bird.h, bird.vy,
             mySkin, myBirdDead ? 0.35 : 1);
  if (mpActive) {
    drawBirdLabel(bird.x, bird.y, bird.w,
                  currentUser ? currentUser.username : "Guest", "#fff");
  }

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

function hitCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function gameOverPanelRect() {
  const pW = W * 0.8;
  const pH = mpActive ? H * 0.52 : H * 0.44;
  const pX = (W - pW) / 2, pY = (H - pH) / 2 - s(20);
  const btnW = W * 0.55, btnH = s(48);
  return { pX, pY, pW, pH, btnX: (W - btnW) / 2, btnY: pY + pH - s(60), btnW, btnH };
}

function restartFromGameOver() {
  myBirdDead = false; otherBirdDead = false;
  resetGame();
  state = S.PLAYING;
}

function handlePointerDown(e) {
  e.preventDefault();
  const p = canvasPos(e);

  if (state === S.MENU) {
    if (hitCircle(p.x, p.y, profileCX(), profileCY(), Math.max(profileR(), s(26)))) {
      showAuthOverlay(); return;
    }
    const bW = W * 0.62, bH = s(50);
    const bX = (W - bW) / 2;
    if (hit(p.x, p.y, bX, H * 0.50, bW, bH)) {
      ensureAudio(); mpActive = false; state = S.PLAYING; resetGame(); return;
    }
    if (hit(p.x, p.y, bX, H * 0.50 + bH + s(12), bW, bH)) {
      shopScroll = 0; state = S.SHOP; return;
    }
    if (hit(p.x, p.y, bX, H * 0.50 + (bH + s(12)) * 2, bW, bH)) {
      mpSubState = "menu"; mpError = ""; state = S.MULTIPLAYER; return;
    }
    return;
  }

  if (state === S.SHOP) {
    if (hit(p.x, p.y, W - s(90), 0, s(82), SHOP_HEADER())) { state = S.MENU; return; }
    shopDragStartY = p.y; shopDragStartScroll = shopScroll; return;
  }

  if (state === S.MULTIPLAYER) {
    if (hit(p.x, p.y, 0, 0, s(90), s(58))) { cleanupMP(); state = S.MENU; return; }

    const bW = W * 0.62, bH = s(52);
    const bX = (W - bW) / 2;

    if (mpSubState === "menu") {
      if (hit(p.x, p.y, bX, H * 0.54, bW, bH))              { startHostMP();  return; }
      if (hit(p.x, p.y, bX, H * 0.54 + bH + s(14), bW, bH)) { showCodeInput(); return; }
    } else if (mpSubState === "waiting") {
      const cbW = W * 0.5, cbH = s(44);
      if (hit(p.x, p.y, (W - cbW) / 2, H * 0.62, cbW, cbH)) {
        cleanupMP(); mpSubState = "menu"; return;
      }
    } else if (mpSubState === "connected" && mpRole === "host") {
      if (hit(p.x, p.y, bX, H * 0.50, bW, bH)) { startMPGame(); return; }
    }
    return;
  }

  if (state === S.PLAYING) { flap(); return; }

  if (state === S.GAME_OVER) {
    const r = gameOverPanelRect();
    if (hit(p.x, p.y, r.btnX, r.btnY, r.btnW, r.btnH)) {
      if (mpActive && mpConn) mpConn.send({ type: "restart" });
      restartFromGameOver();
      return;
    }
    if (!hit(p.x, p.y, r.pX, r.pY, r.pW, r.pH)) {
      if (mpActive) cleanupMP();
      state = S.MENU;
    }
  }
}

function handlePointerMove(e) {
  if (state !== S.SHOP || shopDragStartY === null) return;
  const p = canvasPos(e);
  shopScroll = Math.max(0, Math.min(maxShopScroll(), shopDragStartScroll + (shopDragStartY - p.y)));
}

function handlePointerUp(e) {
  if (state === S.SHOP && shopDragStartY !== null) {
    const p = canvasPos(e);
    if (Math.abs(p.y - shopDragStartY) < s(6)) handleShopTap(p.x, p.y);
    shopDragStartY = null;
  }
}

function handleShopTap(px, py) {
  const ch = CARD_H(), cg = CARD_GAP(), sh = SHOP_HEADER();
  const cw     = W * 0.88;
  const cx     = (W - cw) / 2;
  const startY = sh + s(8) - shopScroll;

  for (let i = 0; i < SKINS.length; i++) {
    const skin = SKINS[i];
    const cy   = startY + i * (ch + cg);
    if (!hit(px, py, cx, cy, cw, ch)) continue;

    const unlocked = save.unlockedSkins.includes(skin.id);
    const selected = save.currentSkin === skin.id;
    const btnW = s(68), btnH = s(30);
    const btnX = cx + cw - btnW - s(10);
    const btnY = cy + (ch - btnH) / 2;

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
    if (unlocked && !selected) { save.currentSkin = skin.id; writeSave(); }
    return;
  }
}

canvas.addEventListener("pointerdown",   handlePointerDown,  { passive: false });
canvas.addEventListener("pointermove",   handlePointerMove,  { passive: true });
canvas.addEventListener("pointerup",     handlePointerUp,    { passive: true });
canvas.addEventListener("pointercancel", function() { shopDragStartY = null; });
canvas.addEventListener("contextmenu",   function(e) { e.preventDefault(); });

document.addEventListener("keydown", function(e) {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    if (state === S.PLAYING)   { flap(); return; }
    if (state === S.MENU)      { ensureAudio(); mpActive = false; state = S.PLAYING; resetGame(); return; }
    if (state === S.GAME_OVER) {
      if (mpActive && mpConn) mpConn.send({ type: "restart" });
      restartFromGameOver(); return;
    }
  }
  if (e.key === "Escape") {
    if (state === S.SHOP)        { state = S.MENU; return; }
    if (state === S.MULTIPLAYER) { cleanupMP(); state = S.MENU; return; }
    if (state === S.PLAYING)     { triggerGameOver(); return; }
    if (state === S.GAME_OVER)   { if (mpActive) cleanupMP(); state = S.MENU; return; }
  }
});

// ---- Multiplayer (PeerJS) ----------------------------------

function generateCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const D = "0123456789";
  let c = "";
  for (let i = 0; i < 3; i++) c += L[Math.floor(Math.random() * L.length)];
  c += "-";
  for (let i = 0; i < 3; i++) c += D[Math.floor(Math.random() * D.length)];
  return c;
}

function peerIdFromCode(code) {
  return "flapgame-" + code.toUpperCase().replace(/-/g, "");
}

var _mpHostRetries = 0;

function startHostMP() {
  if (!window.Peer) { mpError = "Multiplayer unavailable"; return; }
  mpRole     = "host";
  mpCode     = generateCode();
  mpSubState = "creating";
  mpError    = "";

  try { mpPeer = new window.Peer(peerIdFromCode(mpCode)); }
  catch (ex) { mpError = "Could not start peer"; mpSubState = "menu"; return; }

  mpPeer.on("open", function() { _mpHostRetries = 0; mpSubState = "waiting"; });

  mpPeer.on("error", function(err) {
    if (err.type === "unavailable-id" && _mpHostRetries < 5) {
      _mpHostRetries++;
      mpPeer.destroy(); mpPeer = null;
      mpCode = generateCode();
      startHostMP();
    } else {
      _mpHostRetries = 0;
      mpError = "Error: " + err.type; mpSubState = "menu";
    }
  });

  mpPeer.on("connection", function(conn) {
    if (mpConn) { conn.close(); return; }
    mpConn = conn;
    setupMPConn();
  });
}

function joinGameMP(code) {
  if (!window.Peer) { mpError = "Multiplayer unavailable"; return; }
  mpRole     = "guest";
  mpCode     = code.toUpperCase();
  mpSubState = "joining";
  mpError    = "";

  try { mpPeer = new window.Peer(); }
  catch (ex) { mpError = "Could not start peer"; mpSubState = "menu"; return; }

  mpPeer.on("open", function() {
    mpConn = mpPeer.connect(peerIdFromCode(mpCode), { reliable: true });
    setupMPConn();
  });

  mpPeer.on("error", function(err) {
    mpError = "Could not connect: " + err.type;
    mpSubState = "menu";
  });
}

function setupMPConn() {
  mpConn.on("open", function() {
    mpSubState = "connected";
    mpConn.send({ type: "hello", username: currentUser ? currentUser.username : "Guest" });
  });

  mpConn.on("data", handleMPData);

  mpConn.on("close", function() {
    if ((state === S.PLAYING || state === S.GAME_OVER) && mpActive) {
      otherBirdDead = true;
      if (state === S.PLAYING && !myBirdDead) endMpGame();
    }
    mpConn = null;
  });

  mpConn.on("error", function() { mpError = "Connection error"; });
}

function handleMPData(data) {
  if (!data || typeof data.type !== "string") return;

  if (data.type === "hello") {
    var uname = (typeof data.username === "string") ? data.username.slice(0, 20).trim() : "";
    otherUsername = uname || "Guest";

  } else if (data.type === "start" && mpRole === "guest") {
    mpActive   = true;
    mpSubState = "playing";
    resetGame();
    state = S.PLAYING;

  } else if (data.type === "sync" && mpRole === "guest") {
    if (!Array.isArray(data.pipes) || !data.bird) return;
    var hp = data.pipes;
    var scoredMap = {};
    for (var i = 0; i < pipes.length; i++) {
      var key = Math.round(pipes[i].top) + "_" + Math.round(pipes[i].bottom);
      scoredMap[key] = pipes[i].scored;
    }
    pipes = hp.map(function(h) {
      if (typeof h.x !== "number" || typeof h.top !== "number" || typeof h.bottom !== "number") return null;
      var k = Math.round(h.top) + "_" + Math.round(h.bottom);
      return { x: h.x, top: h.top, bottom: h.bottom, scored: !!scoredMap[k], scoredOther: false };
    }).filter(Boolean);
    if (typeof data.bird.y === "number") {
      if (otherBird) { otherBird.y = data.bird.y; otherBird.vy = data.bird.vy || 0; }
    }
    if (typeof data.score === "number") otherScore = data.score;

  } else if (data.type === "bird" && mpRole === "host") {
    if (otherBird && typeof data.y === "number") { otherBird.y = data.y; otherBird.vy = data.vy || 0; }

  } else if (data.type === "pipe" && mpRole === "guest") {
    if (typeof data.top === "number" && data.top >= 0 && data.top <= H) {
      spawnPipe(data.top);
    }

  } else if (data.type === "dead") {
    otherScore    = data.score || 0;
    otherBirdDead = true;
    if (myBirdDead && mpActive) endMpGame();

  } else if (data.type === "restart") {
    if (mpActive) restartFromGameOver();
  }
}

function startMPGame() {
  mpActive   = true;
  mpSubState = "playing";
  if (mpConn) mpConn.send({ type: "start" });
  resetGame();
  state = S.PLAYING;
}

function cleanupMP() {
  if (mpConn)  { try { mpConn.close();   } catch(ex) {} mpConn = null; }
  if (mpPeer)  { try { mpPeer.destroy(); } catch(ex) {} mpPeer = null; }
  mpActive      = false;
  mpRole        = null;
  mpCode        = null;
  mpSubState    = "menu";
  mpError       = "";
  otherBird     = null;
  otherBirdDead = false;
  myBirdDead    = false;
  otherUsername = "Guest";
  otherScore    = 0;
}

// ---- Code-entry overlay (join room) ------------------------

function showCodeInput() {
  var overlay = document.getElementById("codeOverlay");
  if (!overlay) return;
  var input = document.getElementById("codeInput");
  var err   = document.getElementById("codeError");
  input.value = "";
  err.classList.add("hidden");
  overlay.classList.remove("hidden");
  setTimeout(function() { input.focus(); }, 80);

  document.getElementById("codeJoinBtn").onclick = function() {
    var code = input.value.trim().toUpperCase().replace(/\s/g, "");
    if (code.length === 6 && code.indexOf("-") === -1)
      code = code.slice(0, 3) + "-" + code.slice(3);
    if (!/^[A-Z]{3}-[0-9]{3}$/.test(code)) {
      err.textContent = "Invalid format — enter something like ABC-123";
      err.classList.remove("hidden");
      return;
    }
    overlay.classList.add("hidden");
    joinGameMP(code);
  };

  document.getElementById("codeCancelBtn").onclick = function() {
    overlay.classList.add("hidden");
  };

  input.onkeydown = function(e) {
    if (e.key === "Enter") document.getElementById("codeJoinBtn").click();
  };
}

// ---- Auth overlay (login / register / profile) -------------

function showAuthOverlay() {
  var overlay = document.getElementById("authOverlay");
  var card    = document.getElementById("authCard");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  renderAuthCard(card, currentUser ? "profile" : "login");
}

function hideAuthOverlay() {
  var ov = document.getElementById("authOverlay");
  if (ov) ov.classList.add("hidden");
}

var _selectedAvId = PREMADE_AVATARS[0].id;
var _customPfpUrl = null;

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderAuthCard(card, view) {
  if (view === "profile")  { renderProfileView(card);   return; }
  if (view === "login")    { renderLoginView(card);     return; }
  if (view === "register") { renderRegisterView(card);  return; }
}

function renderProfileView(card) {
  var user = currentUser;
  var avatarHtml = "";
  if (user.pfp && user.pfp.type === "premade") {
    var av = PREMADE_AVATARS.find(function(a) { return a.id === user.pfp.avatarId; }) || PREMADE_AVATARS[0];
    avatarHtml = '<div style="width:70px;height:70px;border-radius:50%;background:' + av.bg +
      ';display:flex;align-items:center;justify-content:center;font-size:38px;' +
      'margin:0 auto 12px;border:2px solid rgba(255,255,255,0.35)">' + av.emoji + '</div>';
  } else if (user.pfp && user.pfp.type === "custom") {
    avatarHtml = '<img src="' + escHtml(user.pfp.dataUrl) + '" style="width:70px;height:70px;' +
      'border-radius:50%;object-fit:cover;display:block;margin:0 auto 12px;border:2px solid rgba(255,255,255,0.35)">';
  } else {
    avatarHtml = '<div style="width:70px;height:70px;border-radius:50%;background:#2e2e50;display:flex;' +
      'align-items:center;justify-content:center;font-size:36px;margin:0 auto 12px;' +
      'border:2px solid rgba(255,255,255,0.35)">&#128100;</div>';
  }
  card.innerHTML =
    '<h2>Profile</h2>' + avatarHtml +
    '<p style="font-family:Arial;font-size:18px;font-weight:bold;text-align:center;color:#fff;margin-bottom:4px">' +
    escHtml(user.username) + '</p>' +
    '<p style="font-family:Arial;font-size:13px;text-align:center;color:rgba(255,255,255,0.42);margin-bottom:20px">' +
    'Best: ' + save.highScore + '  Coins: ' + save.coins + '</p>' +
    '<div class="modal-buttons">' +
    '<button class="btn-secondary" id="authLogoutBtn">Log Out</button>' +
    '<button class="btn-secondary" id="authCloseBtn">Close</button></div>';
  card.querySelector("#authLogoutBtn").onclick = function() { logoutAccount(); hideAuthOverlay(); };
  card.querySelector("#authCloseBtn").onclick  = hideAuthOverlay;
}

function renderLoginView(card) {
  card.innerHTML =
    '<h2>Welcome Back</h2>' +
    '<p class="modal-sub">Log in to save your progress</p>' +
    '<div class="modal-tabs">' +
    '<button class="modal-tab active" id="tabLgIn">Log In</button>' +
    '<button class="modal-tab" id="tabLgReg">Register</button></div>' +
    '<p class="section-label">Username</p>' +
    '<input type="text" id="lgUser" placeholder="Enter username" autocomplete="username" />' +
    '<p class="section-label">Password</p>' +
    '<input type="password" id="lgPass" placeholder="Enter password" autocomplete="current-password" />' +
    '<div id="lgErr" class="error-msg hidden"></div>' +
    '<div class="modal-buttons">' +
    '<button class="btn-primary" id="lgSubmit">Log In</button>' +
    '<button class="btn-secondary" id="lgClose">Cancel</button></div>';

  card.querySelector("#tabLgIn").onclick  = function() { renderAuthCard(card, "login"); };
  card.querySelector("#tabLgReg").onclick = function() { renderAuthCard(card, "register"); };
  card.querySelector("#lgClose").onclick  = hideAuthOverlay;

  function doLogin() {
    var u = card.querySelector("#lgUser").value;
    var p = card.querySelector("#lgPass").value;
    var errEl = card.querySelector("#lgErr");
    var btn = card.querySelector("#lgSubmit");
    btn.disabled = true;
    loginAccount(u, p).then(function(res) {
      btn.disabled = false;
      if (!res.ok) { errEl.textContent = res.msg; errEl.classList.remove("hidden"); }
      else         { hideAuthOverlay(); }
    });
  }
  card.querySelector("#lgSubmit").onclick = doLogin;
  card.querySelector("#lgPass").addEventListener("keydown", function(e) { if (e.key === "Enter") doLogin(); });
}

function renderRegisterView(card) {
  _selectedAvId = PREMADE_AVATARS[0].id;
  _customPfpUrl = null;

  var grid = PREMADE_AVATARS.map(function(av) {
    return '<div class="avatar-option' + (av.id === _selectedAvId ? " selected" : "") +
      '" data-id="' + av.id + '" style="background:' + av.bg + '">' + av.emoji + '</div>';
  }).join("");

  card.innerHTML =
    '<h2>Create Account</h2>' +
    '<div class="modal-tabs">' +
    '<button class="modal-tab" id="tabRgIn">Log In</button>' +
    '<button class="modal-tab active" id="tabRgReg">Register</button></div>' +
    '<p class="section-label">Choose Avatar</p>' +
    '<div class="avatar-grid" id="avGrid">' + grid + '</div>' +
    '<label class="upload-btn" id="uploadLbl">Upload your own photo' +
    '<input type="file" id="pfpFile" accept="image/*" style="display:none"></label>' +
    '<p class="section-label">Username</p>' +
    '<input type="text" id="rgUser" placeholder="Choose a username" autocomplete="username" maxlength="20" />' +
    '<p class="section-label">Password</p>' +
    '<input type="password" id="rgPass" placeholder="Min 4 characters" autocomplete="new-password" />' +
    '<div id="rgErr" class="error-msg hidden"></div>' +
    '<div class="modal-buttons">' +
    '<button class="btn-primary" id="rgSubmit">Create Account</button>' +
    '<button class="btn-secondary" id="rgClose">Cancel</button></div>';

  card.querySelector("#tabRgIn").onclick  = function() { renderAuthCard(card, "login"); };
  card.querySelector("#tabRgReg").onclick = function() { renderAuthCard(card, "register"); };
  card.querySelector("#rgClose").onclick  = hideAuthOverlay;

  card.querySelectorAll(".avatar-option").forEach(function(el) {
    el.onclick = function() {
      card.querySelectorAll(".avatar-option").forEach(function(x) { x.classList.remove("selected"); });
      el.classList.add("selected");
      _selectedAvId = el.dataset.id;
      _customPfpUrl = null;
      card.querySelector("#uploadLbl").style.borderColor = "";
    };
  });

  card.querySelector("#pfpFile").onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      _customPfpUrl = ev.target.result;
      card.querySelectorAll(".avatar-option").forEach(function(x) { x.classList.remove("selected"); });
      card.querySelector("#uploadLbl").style.borderColor = "#ffd700";
    };
    reader.readAsDataURL(file);
  };

  function doRegister() {
    var u = card.querySelector("#rgUser").value;
    var p = card.querySelector("#rgPass").value;
    var errEl = card.querySelector("#rgErr");
    var btn = card.querySelector("#rgSubmit");
    btn.disabled = true;
    var pfp = _customPfpUrl
      ? { type: "custom",  dataUrl: _customPfpUrl }
      : { type: "premade", avatarId: _selectedAvId };
    registerAccount(u, p, pfp).then(function(res) {
      btn.disabled = false;
      if (!res.ok) { errEl.textContent = res.msg; errEl.classList.remove("hidden"); }
      else         { hideAuthOverlay(); }
    });
  }
  card.querySelector("#rgSubmit").onclick = doRegister;
  card.querySelector("#rgPass").addEventListener("keydown", function(e) { if (e.key === "Enter") doRegister(); });
}

document.getElementById("authOverlay").addEventListener("click", function(e) {
  if (e.target === document.getElementById("authOverlay")) hideAuthOverlay();
});

// ---- Audio -------------------------------------------------

var audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playBeep(opts) {
  var freq = opts.freq || 440, duration = opts.duration || 0.1,
      type = opts.type || "square", gain = opts.gain || 0.2;
  if (!audioCtx) return;
  var osc = audioCtx.createOscillator();
  var g   = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
  osc.connect(g); g.connect(audioCtx.destination);
  var now = audioCtx.currentTime;
  osc.start(now); osc.stop(now + duration);
}

function playFlapSound() {
  if (!audioCtx) return;
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var g   = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
  g.gain.setValueAtTime(0.0,   now);
  g.gain.linearRampToValueAtTime(0.25, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.16);
}

function playHitSound() {
  if (!audioCtx) return;
  var now = audioCtx.currentTime;
  var osc = audioCtx.createOscillator();
  var g   = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.22);
}

// ---- Boot --------------------------------------------------

initClouds();
update();
