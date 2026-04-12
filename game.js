const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Game states
const STATE_READY = 0;
const STATE_RUNNING = 1;
const STATE_GAME_OVER = 2;

let state = STATE_READY;

// Bird
const bird = {
  x: 80,
  y: HEIGHT / 2,
  width: 34,
  height: 24,
  vy: 0,
};

const GRAVITY = 0.5;
const FLAP_STRENGTH = -8;

// Pipes
const PIPE_WIDTH = 60;
const PIPE_GAP = 140;
const PIPE_DISTANCE = 200;
const PIPE_SPEED = 2.5;

let pipes = [];
let frameCount = 0;
let score = 0;
let passedPipeIndex = 0;

// DOM elements
const scoreSpan = document.getElementById("score");
const messageEl = document.getElementById("message");

// --- Simple sound system (Web Audio API) ---

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep({ freq = 440, duration = 0.1, type = "square", gain = 0.2 }) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  g.gain.value = gain;

  osc.connect(g);
  g.connect(ctx.destination);

  const now = ctx.currentTime;
  osc.start(now);
  osc.stop(now + duration);
}

// Flap sound: quick upward chirp
function playFlapSound() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.16);
}

// Hit sound: short thud
function playHitSound() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.22);
}

// --- Game logic ---

function resetGame() {
  bird.y = HEIGHT / 2;
  bird.vy = 0;
  pipes = [];
  frameCount = 0;
  score = 0;
  passedPipeIndex = 0;
  scoreSpan.textContent = score;
  state = STATE_READY;
  messageEl.textContent = "Press SPACE or TAP/CLICK to start";
}

function spawnPipe() {
  const minTop = 40;
  const maxTop = HEIGHT - PIPE_GAP - 80;
  const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;

  pipes.push({
    x: WIDTH + PIPE_WIDTH,
    top: topHeight,
    bottom: topHeight + PIPE_GAP,
  });
}

function flap() {
  // First user interaction can also unlock AudioContext on some browsers
  getAudioCtx();

  if (state === STATE_READY) {
    state = STATE_RUNNING;
    messageEl.textContent = "";
  }
  if (state === STATE_RUNNING) {
    bird.vy = FLAP_STRENGTH;
    playFlapSound();
  } else if (state === STATE_GAME_OVER) {
    resetGame();
  }
}

function triggerGameOver() {
  if (state !== STATE_GAME_OVER) {
    state = STATE_GAME_OVER;
    messageEl.textContent = "Game Over! Press SPACE or TAP/CLICK to restart";
    playHitSound();
  }
}

function update() {
  if (state === STATE_RUNNING) {
    // Bird physics
    bird.vy += GRAVITY;
    bird.y += bird.vy;

    // Ground / ceiling collision
    if (bird.y + bird.height > HEIGHT || bird.y < 0) {
      triggerGameOver();
    }

    // Spawn pipes
    frameCount++;
    if (frameCount % Math.floor(PIPE_DISTANCE / PIPE_SPEED) === 0) {
      spawnPipe();
    }

    // Move pipes
    for (let pipe of pipes) {
      pipe.x -= PIPE_SPEED;
    }

    // Remove off-screen pipes
    pipes = pipes.filter((pipe) => pipe.x + PIPE_WIDTH > 0);

    // Scoring: when bird passes the center of a pipe
    for (let i = 0; i < pipes.length; i++) {
      const pipe = pipes[i];
      const pipeCenter = pipe.x + PIPE_WIDTH / 2;
      if (pipeCenter < bird.x && i >= passedPipeIndex) {
        score++;
        passedPipeIndex = i + 1;
        scoreSpan.textContent = score;

        // optional: tiny confirm beep
        playBeep({ freq: 900, duration: 0.05, gain: 0.15 });
      }
    }

    // Collision with pipes
    for (let pipe of pipes) {
      const inXRange =
        bird.x + bird.width > pipe.x && bird.x < pipe.x + PIPE_WIDTH;
      const hitsTop = bird.y < pipe.top;
      const hitsBottom = bird.y + bird.height > pipe.bottom;
      if (inXRange && (hitsTop || hitsBottom)) {
        triggerGameOver();
      }
    }
  }

  draw();
  requestAnimationFrame(update);
}

function drawBackground() {
  // Ground
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, HEIGHT - 80, WIDTH, 80);

  // Simple grass strip
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, HEIGHT - 90, WIDTH, 10);
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x + bird.width / 2, bird.y + bird.height / 2);
  ctx.rotate(Math.min(Math.max(bird.vy / 10, -0.5), 0.7));

  // Body
  ctx.fillStyle = "#ffeb3b";
  ctx.fillRect(-bird.width / 2, -bird.height / 2, bird.width, bird.height);

  // Eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(4, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(5, -4, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#ff9800";
  ctx.beginPath();
  ctx.moveTo(bird.width / 2, 0);
  ctx.lineTo(bird.width / 2 + 8, -4);
  ctx.lineTo(bird.width / 2 + 8, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPipes() {
  for (let pipe of pipes) {
    // Top pipe
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.top);
    ctx.fillStyle = "#388e3c";
    ctx.fillRect(pipe.x - 2, pipe.top - 20, PIPE_WIDTH + 4, 20);

    // Bottom pipe
    ctx.fillStyle = "#4caf50";
    ctx.fillRect(pipe.x, pipe.bottom, PIPE_WIDTH, HEIGHT - pipe.bottom);
    ctx.fillStyle = "#388e3c";
    ctx.fillRect(pipe.x - 2, pipe.bottom, PIPE_WIDTH + 4, 20);
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawPipes();
  drawBird();
}

// Input handling
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === " ") {
    e.preventDefault();
    flap();
  }
});

canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  flap();
});

// Init
resetGame();
update();
