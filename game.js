'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions
canvas.width = 400;
canvas.height = 600;

// ─── Constants ────────────────────────────────────────────────────────────────
const GRAVITY        = 0.5;
const FLAP_STRENGTH  = -9;
const PIPE_WIDTH     = 60;
const PIPE_GAP       = 160;
const PIPE_SPEED     = 3;
const PIPE_INTERVAL  = 1500; // ms between new pipes
const GROUND_HEIGHT  = 80;
const BIRD_X         = 80;
const BIRD_RADIUS    = 18;

// ─── Colors / Theme ──────────────────────────────────────────────────────────
const COLORS = {
  sky:         '#70c5ce',
  ground:      '#ded895',
  groundDark:  '#c8b560',
  pipe:        '#73bf2e',
  pipeDark:    '#4e8c1a',
  pipeCap:     '#5aad1e',
  bird:        '#f5c518',
  birdDark:    '#e0a800',
  birdEye:     '#ffffff',
  birdPupil:   '#333333',
  birdBeak:    '#f08030',
  birdWing:    '#f0b010',
  scoreText:   '#ffffff',
  overlayBg:   'rgba(0,0,0,0.45)',
};

// ─── Game State ──────────────────────────────────────────────────────────────
const State = { WAITING: 0, PLAYING: 1, DEAD: 2 };

let bird, pipes, score, highScore, state, lastPipeTime, animFrame;

function init() {
  bird = {
    x:        BIRD_X,
    y:        canvas.height / 2 - 50,
    vy:       0,
    rotation: 0,
    flapAnim: 0,   // wing flap progress (0-1)
    flapDir:  1,
  };
  pipes      = [];
  score      = 0;
  state      = State.WAITING;
  lastPipeTime = 0;
}

// ─── Input ───────────────────────────────────────────────────────────────────
function flap() {
  if (state === State.DEAD) {
    init();
    return;
  }
  if (state === State.WAITING) {
    state = State.PLAYING;
  }
  bird.vy = FLAP_STRENGTH;
  bird.flapAnim = 1;
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
    e.preventDefault();
    flap();
  }
});
canvas.addEventListener('click', flap);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });

// ─── Pipe Generation ─────────────────────────────────────────────────────────
function spawnPipe(timestamp) {
  const minY   = 60;
  const maxY   = canvas.height - GROUND_HEIGHT - PIPE_GAP - 60;
  const topH   = minY + Math.random() * (maxY - minY);
  pipes.push({
    x:    canvas.width,
    topH: topH,
    passed: false,
  });
  lastPipeTime = timestamp;
}

// ─── Collision ────────────────────────────────────────────────────────────────
function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

function checkCollision() {
  const bx = bird.x;
  const by = bird.y;
  const r  = BIRD_RADIUS - 4; // slightly forgiving hit-box

  // Ground / ceiling
  if (by + r >= canvas.height - GROUND_HEIGHT || by - r <= 0) return true;

  for (const p of pipes) {
    const px = p.x;
    const pw = PIPE_WIDTH;
    // Top pipe rect
    if (circleRect(bx, by, r, px, 0, pw, p.topH)) return true;
    // Bottom pipe rect
    const botY = p.topH + PIPE_GAP;
    if (circleRect(bx, by, r, px, botY, pw, canvas.height - GROUND_HEIGHT - botY)) return true;
  }
  return false;
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(timestamp) {
  if (state !== State.PLAYING) return;

  // Bird physics
  bird.vy       += GRAVITY;
  bird.y        += bird.vy;
  bird.rotation  = Math.max(-25, Math.min(90, bird.vy * 4));

  // Wing animation
  bird.flapAnim = Math.max(0, bird.flapAnim - 0.15);

  // Spawn pipes
  if (!lastPipeTime || timestamp - lastPipeTime > PIPE_INTERVAL) {
    spawnPipe(timestamp);
  }

  // Move pipes & score
  for (const p of pipes) {
    p.x -= PIPE_SPEED;
    if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
      p.passed = true;
      score++;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('flapHighScore', highScore);
      }
    }
  }

  // Remove off-screen pipes
  pipes = pipes.filter(p => p.x + PIPE_WIDTH > 0);

  // Collision check
  if (checkCollision()) {
    state = State.DEAD;
  }
}

// ─── Draw helpers ─────────────────────────────────────────────────────────────
function drawSky() {
  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height - GROUND_HEIGHT);
  grad.addColorStop(0,   '#4ec0d0');
  grad.addColorStop(1,   '#a0e4f0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height - GROUND_HEIGHT);
}

function drawGround() {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
  ctx.fillStyle = COLORS.groundDark;
  ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, 8);
}

function drawPipe(p) {
  const cw = PIPE_WIDTH;
  const capH = 20;
  const capW = cw + 10;

  // ── Top pipe ──
  const topH = p.topH;
  ctx.fillStyle = COLORS.pipe;
  ctx.fillRect(p.x, 0, cw, topH - capH);
  // Highlight stripe
  ctx.fillStyle = COLORS.pipeDark;
  ctx.fillRect(p.x, 0, 8, topH - capH);
  // Cap
  ctx.fillStyle = COLORS.pipeCap;
  ctx.fillRect(p.x - 5, topH - capH, capW, capH);
  ctx.fillStyle = COLORS.pipeDark;
  ctx.fillRect(p.x - 5, topH - capH, 8, capH);

  // ── Bottom pipe ──
  const botY = topH + PIPE_GAP;
  const botH = canvas.height - GROUND_HEIGHT - botY;
  ctx.fillStyle = COLORS.pipe;
  ctx.fillRect(p.x, botY + capH, cw, botH - capH);
  ctx.fillStyle = COLORS.pipeDark;
  ctx.fillRect(p.x, botY + capH, 8, botH - capH);
  // Cap
  ctx.fillStyle = COLORS.pipeCap;
  ctx.fillRect(p.x - 5, botY, capW, capH);
  ctx.fillStyle = COLORS.pipeDark;
  ctx.fillRect(p.x - 5, botY, 8, capH);
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate((bird.rotation * Math.PI) / 180);

  // Body
  ctx.fillStyle = COLORS.bird;
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_RADIUS, BIRD_RADIUS - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = COLORS.birdDark;
  ctx.beginPath();
  ctx.ellipse(2, 4, BIRD_RADIUS - 6, BIRD_RADIUS - 8, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Wing (animated)
  const wingOffset = -6 + bird.flapAnim * 8;
  ctx.fillStyle = COLORS.birdWing;
  ctx.beginPath();
  ctx.ellipse(-2, wingOffset, 10, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye white
  ctx.fillStyle = COLORS.birdEye;
  ctx.beginPath();
  ctx.arc(8, -5, 6, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = COLORS.birdPupil;
  ctx.beginPath();
  ctx.arc(9, -5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = COLORS.birdBeak;
  ctx.beginPath();
  ctx.moveTo(14,  -2);
  ctx.lineTo(22,   1);
  ctx.lineTo(14,   4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawScore() {
  ctx.fillStyle = COLORS.scoreText;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeText(score, canvas.width / 2, 60);
  ctx.fillText(score, canvas.width / 2, 60);
}

function drawWaitingScreen() {
  // Semi-transparent panel
  ctx.fillStyle = COLORS.overlayBg;
  ctx.beginPath();
  ctx.roundRect(60, canvas.height / 2 - 110, canvas.width - 120, 180, 12);
  ctx.fill();

  ctx.textAlign = 'center';

  // Title
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 54px Arial, sans-serif';
  ctx.strokeText('FLAP', canvas.width / 2, canvas.height / 2 - 40);
  ctx.fillText('FLAP', canvas.width / 2, canvas.height / 2 - 40);

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.strokeText('Tap / Space to start', canvas.width / 2, canvas.height / 2 + 10);
  ctx.fillText('Tap / Space to start', canvas.width / 2, canvas.height / 2 + 10);

  if (highScore > 0) {
    ctx.fillStyle = '#ffe066';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(`Best: ${highScore}`, canvas.width / 2, canvas.height / 2 + 42);
  }
}

function drawGameOverScreen() {
  ctx.fillStyle = COLORS.overlayBg;
  ctx.beginPath();
  ctx.roundRect(50, canvas.height / 2 - 130, canvas.width - 100, 230, 12);
  ctx.fill();

  ctx.textAlign = 'center';

  ctx.fillStyle = '#ff4444';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 46px Arial, sans-serif';
  ctx.strokeText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 60);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 - 10);

  ctx.fillStyle = '#ffe066';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText(`Best: ${highScore}`, canvas.width / 2, canvas.height / 2 + 24);

  ctx.fillStyle = '#aaffaa';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText('Tap / Space to play again', canvas.width / 2, canvas.height / 2 + 68);
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  update(timestamp);

  // Draw background
  drawSky();
  pipes.forEach(drawPipe);
  drawGround();
  drawBird();

  if (state === State.PLAYING || state === State.DEAD) {
    drawScore();
  }

  if (state === State.WAITING) drawWaitingScreen();
  if (state === State.DEAD)    drawGameOverScreen();

  animFrame = requestAnimationFrame(gameLoop);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
highScore = parseInt(localStorage.getItem('flapHighScore')) || 0;
init();
requestAnimationFrame(gameLoop);
