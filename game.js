const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.querySelector("#score"),
  length: document.querySelector("#length"),
  combo: document.querySelector("#combo"),
  best: document.querySelector("#best"),
  overlay: document.querySelector("#overlay"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  leftBtn: document.querySelector("#leftBtn"),
  rightBtn: document.querySelector("#rightBtn"),
};

const W = canvas.width;
const H = canvas.height;
const laneCount = 5;
const laneW = W / laneCount;
const snakeY = H - 190;
const segmentR = 18;
const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");
backgroundCanvas.width = W;
backgroundCanvas.height = H;

let best = Number(localStorage.getItem("neon-serpent-best") || 0);
let state;
let lastTime = 0;
let lastHudUpdate = 0;
let rafId = 0;
let pointerActive = false;

ui.best.textContent = best;

function resetGame() {
  state = {
    mode: "running",
    score: 0,
    length: 8,
    displayLength: 8,
    combo: 1,
    lane: 2,
    x: laneW * 2.5,
    targetX: laneW * 2.5,
    speed: 285,
    spawnTimer: 260,
    spawnGap: 250,
    distance: 0,
    shield: 0,
    magnet: 0,
    shake: 0,
    objects: [],
    particles: [],
    message: "",
    messageT: 0,
  };
  spawnWave(true);
  updateHud(true);
  hideOverlay();
  startLoop();
}

function hideOverlay() {
  ui.overlay.classList.remove("is-visible");
}

function showOverlay(title, text, buttonText = "Start Run") {
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = text;
  ui.startBtn.textContent = buttonText;
  ui.overlay.classList.add("is-visible");
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function int(min, max) {
  return Math.floor(rand(min, max + 1));
}

function laneCenter(lane) {
  return lane * laneW + laneW / 2;
}

function spawnWave(first = false) {
  const y = first ? -120 : -170;
  const difficulty = Math.min(32, 6 + Math.floor(state.distance / 900));
  const safeLane = int(0, laneCount - 1);

  for (let lane = 0; lane < laneCount; lane += 1) {
    const isGap = Math.random() < 0.18 || lane === safeLane;
    if (isGap) continue;

    const value = Math.max(1, int(2, difficulty) + (lane === 0 || lane === laneCount - 1 ? 3 : 0));
    state.objects.push({
      type: "block",
      lane,
      x: lane * laneW + 10,
      y,
      w: laneW - 20,
      h: 92,
      value,
      max: value,
      hitCooldown: 0,
    });
  }

  const bonusLane = int(0, laneCount - 1);
  const bonusRoll = Math.random();
  const pickupType = bonusRoll > 0.86 ? "magnet" : bonusRoll > 0.72 ? "shield" : "spark";
  state.objects.push({
    type: pickupType,
    lane: bonusLane,
    x: laneCenter(bonusLane),
    y: y - int(110, 210),
    value: pickupType === "spark" ? int(2, 6) : 1,
    r: pickupType === "spark" ? 22 : 25,
  });

  if (Math.random() > 0.56) {
    const gateA = int(0, laneCount - 2);
    const gateB = gateA + 1;
    const good = Math.random() > 0.42;
    const label = good ? `+${int(4, 10)}` : `${Math.random() > 0.5 ? "x2" : "-5"}`;
    const label2 = good ? `${Math.random() > 0.5 ? "x2" : "-4"}` : `+${int(4, 9)}`;
    state.objects.push({ type: "gate", lane: gateA, x: gateA * laneW + 8, y: y - 350, w: laneW - 16, h: 74, label });
    state.objects.push({ type: "gate", lane: gateB, x: gateB * laneW + 8, y: y - 350, w: laneW - 16, h: 74, label: label2 });
  }

  state.spawnGap = Math.max(185, 250 - state.distance / 360);
}

function setLane(delta) {
  if (!state || state.mode !== "running") return;
  state.lane = Math.max(0, Math.min(laneCount - 1, state.lane + delta));
  state.targetX = laneCenter(state.lane);
}

function makeParticles(x, y, color, count = 14) {
  const remaining = Math.max(0, 70 - state.particles.length);
  count = Math.min(count, remaining);
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: rand(-150, 150),
      vy: rand(-220, 80),
      life: rand(0.28, 0.72),
      max: 0.72,
      color,
      r: rand(2, 5),
    });
  }
}

function endRun() {
  state.mode = "ended";
  best = Math.max(best, Math.floor(state.score));
  localStorage.setItem("neon-serpent-best", String(best));
  ui.best.textContent = best;
  showOverlay(
    "Run Crashed",
    `Score ${Math.floor(state.score)}. You reached ${Math.floor(state.distance)}m with a ${state.combo.toFixed(1)}x combo.`,
    "Run Again",
  );
}

function applyGate(label, obj) {
  if (label.startsWith("+")) {
    const gain = Number(label.slice(1));
    state.length += gain;
    state.message = `+${gain} length`;
    makeParticles(obj.x + obj.w / 2, obj.y + obj.h / 2, "#82f06f", 10);
  } else if (label === "x2") {
    state.combo = Math.min(5, state.combo * 2);
    state.message = "Combo doubled";
    makeParticles(obj.x + obj.w / 2, obj.y + obj.h / 2, "#ffd166", 14);
  } else {
    const loss = Math.abs(Number(label));
    state.length -= loss;
    state.combo = Math.max(1, state.combo - 0.35);
    state.message = `-${loss} length`;
    state.shake = 16;
    makeParticles(obj.x + obj.w / 2, obj.y + obj.h / 2, "#ff5a5f", 10);
  }
  state.messageT = 1.0;
}

function update(dt) {
  if (!state) return;
  if (state.mode !== "running") return;

  const speedBoost = 1 + Math.min(0.55, state.distance / 9000);
  const scroll = state.speed * speedBoost * dt;
  state.distance += scroll / 10;
  state.spawnTimer -= scroll;
  state.score += scroll * 0.06 * state.combo;
  state.combo = Math.max(1, state.combo - dt * 0.025);
  state.magnet = Math.max(0, state.magnet - dt);
  state.shake = Math.max(0, state.shake - dt * 40);
  state.messageT = Math.max(0, state.messageT - dt);
  state.x += (state.targetX - state.x) * Math.min(1, dt * 12);
  state.displayLength += (state.length - state.displayLength) * Math.min(1, dt * 8);

  for (const obj of state.objects) {
    obj.y += scroll;
    if (obj.hitCooldown) obj.hitCooldown = Math.max(0, obj.hitCooldown - dt);

    if (state.magnet && obj.type === "spark") {
      const dx = state.x - obj.x;
      const dy = snakeY - obj.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 230) {
        obj.x += dx * dt * 3.1;
        obj.y += dy * dt * 3.1;
      }
    }
  }

  handleCollisions(dt);
  updateParticles(dt);
  state.objects = state.objects.filter((obj) => obj.y < H + 140 && !obj.dead);

  while (state.spawnTimer <= 0) {
    spawnWave();
    state.spawnTimer += state.spawnGap;
  }

  if (state.length <= 0) endRun();
  updateHud();
}

function handleCollisions(dt) {
  const head = { x: state.x, y: snakeY };

  for (const obj of state.objects) {
    if (obj.dead) continue;

    if (obj.type === "block") {
      const inX = head.x > obj.x - segmentR && head.x < obj.x + obj.w + segmentR;
      const inY = head.y > obj.y - segmentR && head.y < obj.y + obj.h + segmentR;
      if (inX && inY && !obj.hitCooldown) {
        obj.hitCooldown = 0.055;
        if (state.shield > 0) {
          state.shield -= 1;
          obj.value -= 3;
          state.message = "Shield hit";
          state.messageT = 0.8;
          makeParticles(head.x, head.y, "#35d6ff", 10);
        } else {
          obj.value -= 1;
          state.length -= 1;
          state.combo = Math.max(1, state.combo - 0.06);
          state.shake = 10;
        }
        state.score += 8 * state.combo;
        if (obj.value <= 0) {
          obj.dead = true;
          state.combo = Math.min(5, state.combo + 0.08);
          makeParticles(obj.x + obj.w / 2, obj.y + obj.h / 2, "#ffd166", 14);
        }
      }
      continue;
    }

    const dx = head.x - obj.x;
    const dy = head.y - obj.y;
    if (obj.type === "gate") {
      const inGate = head.x > obj.x && head.x < obj.x + obj.w && head.y > obj.y && head.y < obj.y + obj.h;
      if (inGate) {
        obj.dead = true;
        applyGate(obj.label, obj);
      }
      continue;
    }

    if (Math.hypot(dx, dy) < obj.r + segmentR) {
      obj.dead = true;
      if (obj.type === "spark") {
        state.length += obj.value;
        state.score += obj.value * 18 * state.combo;
        state.combo = Math.min(5, state.combo + 0.12);
        makeParticles(obj.x, obj.y, "#82f06f", 10);
      }
      if (obj.type === "shield") {
        state.shield = Math.min(3, state.shield + 1);
        state.score += 75;
        state.message = "Shield armed";
        state.messageT = 1;
        makeParticles(obj.x, obj.y, "#35d6ff", 12);
      }
      if (obj.type === "magnet") {
        state.magnet = 7;
        state.score += 75;
        state.message = "Magnet active";
        state.messageT = 1;
        makeParticles(obj.x, obj.y, "#ff5ea8", 12);
      }
    }
  }
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHudUpdate < 90) return;
  lastHudUpdate = now;
  ui.score.textContent = Math.floor(state.score);
  ui.length.textContent = Math.max(0, Math.ceil(state.length));
  ui.combo.textContent = `${state.combo.toFixed(1)}x`;
}

function draw(t = 0) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (state?.shake) {
    ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  }
  drawBackground();
  if (state) {
    drawObjects();
    drawSnake(t);
    drawParticles();
    drawEffects(t);
  }
  ctx.restore();
}

function drawBackground() {
  ctx.drawImage(backgroundCanvas, 0, 0);

  if (!state) return;
  const offset = (state.distance * 10) % 72;
  ctx.strokeStyle = "rgba(40,199,255,0.12)";
  ctx.lineWidth = 1;
  for (let y = -72 + offset; y < H; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + 20);
    ctx.stroke();
  }
}

function drawObjects() {
  for (const obj of state.objects) {
    if (obj.type === "block") drawBlock(obj);
    if (obj.type === "spark") drawPickup(obj, "#82f06f", `+${obj.value}`);
    if (obj.type === "shield") drawPickup(obj, "#35d6ff", "S");
    if (obj.type === "magnet") drawPickup(obj, "#ff5ea8", "M");
    if (obj.type === "gate") drawGate(obj);
  }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBlock(obj) {
  const ratio = Math.max(0, obj.value / obj.max);
  const hue = ratio > 0.62 ? "#ff5a5f" : ratio > 0.3 ? "#ffd166" : "#82f06f";
  roundedRect(obj.x, obj.y, obj.w, obj.h, 8);
  ctx.fillStyle = hue;
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(obj.x, obj.y + obj.h * ratio, obj.w, obj.h * (1 - ratio));
  ctx.fillStyle = "#071016";
  ctx.font = "800 24px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.max(0, obj.value), obj.x + obj.w / 2, obj.y + obj.h / 2);
}

function drawPickup(obj, color, label) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI * 2 * i) / 8;
    const r = i % 2 ? obj.r * 0.55 : obj.r;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#081016";
  ctx.font = "800 15px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawGate(obj) {
  const good = obj.label.startsWith("+") || obj.label === "x2";
  roundedRect(obj.x, obj.y, obj.w, obj.h, 8);
  ctx.fillStyle = good ? "rgba(255,209,102,0.9)" : "rgba(255,90,95,0.9)";
  ctx.fill();
  ctx.fillStyle = "#071016";
  ctx.font = "800 21px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(obj.label, obj.x + obj.w / 2, obj.y + obj.h / 2);
}

function drawSnake(t) {
  const visible = Math.min(18, Math.ceil(state.displayLength));
  for (let i = visible - 1; i >= 0; i -= 1) {
    const y = snakeY + i * (segmentR * 1.15);
    const taper = 1 - i / (visible * 1.7);
    const r = segmentR * taper;
    const wobble = Math.sin(t / 150 + i * 0.7) * 4;
    ctx.beginPath();
    ctx.fillStyle = i === 0 ? "#f5f7fb" : i % 2 ? "#35d6ff" : "#82f06f";
    ctx.arc(state.x + wobble, y, Math.max(6, r), 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.shield) {
    ctx.strokeStyle = "rgba(53,214,255,0.82)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(state.x, snakeY, 31 + Math.sin(t / 140) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEffects(t) {
  if (state.magnet) {
    ctx.strokeStyle = "rgba(255,94,168,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.x, snakeY, 126 + Math.sin(t / 140) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (state.messageT) {
    ctx.globalAlpha = Math.min(1, state.messageT * 2);
    ctx.fillStyle = "#f5f7fb";
    ctx.font = "800 21px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.message, W / 2, 132);
    ctx.globalAlpha = 1;
  }
}

function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;
  update(dt);
  draw(t);
  if (state?.mode === "running") {
    rafId = requestAnimationFrame(loop);
  } else {
    rafId = 0;
  }
}

function startLoop() {
  lastTime = performance.now();
  if (!rafId) {
    rafId = requestAnimationFrame(loop);
  }
}

function togglePause() {
  if (!state || state.mode === "ended") return;
  if (state.mode === "paused") {
    state.mode = "running";
    hideOverlay();
    startLoop();
  } else {
    state.mode = "paused";
    showOverlay("Paused", "Catch your breath, then jump back into the lane fight.", "Resume");
  }
}

ui.startBtn.addEventListener("click", () => {
  if (state?.mode === "paused") {
    state.mode = "running";
    hideOverlay();
    startLoop();
  } else {
    resetGame();
  }
});

ui.pauseBtn.addEventListener("click", togglePause);
ui.leftBtn.addEventListener("click", () => setLane(-1));
ui.rightBtn.addEventListener("click", () => setLane(1));

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setLane(-1);
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setLane(1);
  if (event.key === " " || event.key.toLowerCase() === "p") {
    event.preventDefault();
    togglePause();
  }
  if (event.key === "Enter" && ui.overlay.classList.contains("is-visible")) ui.startBtn.click();
});

canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerActive || state?.mode !== "running") return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  state.lane = Math.max(0, Math.min(laneCount - 1, Math.floor(x / laneW)));
  state.targetX = laneCenter(state.lane);
});

canvas.addEventListener("pointerup", () => {
  pointerActive = false;
});

function buildBackground() {
  const grd = backgroundCtx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#121a24");
  grd.addColorStop(0.58, "#0a0f16");
  grd.addColorStop(1, "#0d1117");
  backgroundCtx.fillStyle = grd;
  backgroundCtx.fillRect(0, 0, W, H);

  backgroundCtx.strokeStyle = "rgba(255,255,255,0.08)";
  backgroundCtx.lineWidth = 1;
  for (let i = 1; i < laneCount; i += 1) {
    const x = i * laneW;
    backgroundCtx.beginPath();
    backgroundCtx.moveTo(x, 0);
    backgroundCtx.lineTo(x, H);
    backgroundCtx.stroke();
  }
}

buildBackground();
draw();
