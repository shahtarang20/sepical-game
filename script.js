(() => {
"use strict";

/* ============================================================
   CONFIG
============================================================ */
const GRID_SIZE = 8;
const GEM_TYPES = ["🔴", "🔵", "🟢", "🟡", "🟣", "🟠"];
const MAX_LIVES = 5;
const LIFE_REGEN_MINUTES = 10;
const STORAGE_KEY = "gemblast_save_v1";
const TOTAL_LEVELS = 40;

/* ============================================================
   STATE
============================================================ */
let state = loadState();

function defaultState() {
  return {
    currentLevel: 1,
    bestScore: 0,
    lives: MAX_LIVES,
    lastLifeLoseTime: null,
    levelStars: {},
    boosters: { shuffle: 3, bomb: 2, extraMoves: 1 },
    soundOn: true,
    lastDailyClaim: null,
    dailyStreak: 0,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

/* ============================================================
   LEVEL DEFINITIONS (procedural difficulty curve)
============================================================ */
function getLevelConfig(levelNum) {
  const moves = Math.max(14, 26 - Math.floor(levelNum / 3));
  const targetScore = 800 + levelNum * 220;
  const colorCount = Math.min(6, 4 + Math.floor(levelNum / 6));
  return { moves, targetScore, colorCount };
}

/* ============================================================
   DOM REFS
============================================================ */
const screens = {
  home: document.getElementById("homeScreen"),
  levels: document.getElementById("levelsScreen"),
  game: document.getElementById("gameScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function showOverlay(id) { document.getElementById(id).classList.add("active"); }
function hideOverlay(id) { document.getElementById(id).classList.remove("active"); }

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ============================================================
   LIVES SYSTEM
============================================================ */
function regenLives() {
  if (state.lives >= MAX_LIVES) { state.lastLifeLoseTime = null; return; }
  if (!state.lastLifeLoseTime) { state.lastLifeLoseTime = Date.now(); return; }
  const elapsed = Date.now() - state.lastLifeLoseTime;
  const regenCount = Math.floor(elapsed / (LIFE_REGEN_MINUTES * 60 * 1000));
  if (regenCount > 0) {
    state.lives = Math.min(MAX_LIVES, state.lives + regenCount);
    if (state.lives >= MAX_LIVES) {
      state.lastLifeLoseTime = null;
    } else {
      state.lastLifeLoseTime += regenCount * LIFE_REGEN_MINUTES * 60 * 1000;
    }
    saveState();
  }
}

function loseLife() {
  state.lives = Math.max(0, state.lives - 1);
  if (state.lives < MAX_LIVES && !state.lastLifeLoseTime) {
    state.lastLifeLoseTime = Date.now();
  }
  saveState();
  updateHomeUI();
}

function timeUntilNextLife() {
  if (!state.lastLifeLoseTime) return 0;
  const elapsed = Date.now() - state.lastLifeLoseTime;
  const remaining = LIFE_REGEN_MINUTES * 60 * 1000 - (elapsed % (LIFE_REGEN_MINUTES * 60 * 1000));
  return remaining;
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

setInterval(() => {
  regenLives();
  updateHomeUI();
  if (document.getElementById("noLivesOverlay").classList.contains("active")) {
    document.getElementById("livesTimerText").textContent =
      state.lives > 0 ? "You have lives!" : `Next life in ${formatTime(timeUntilNextLife())}`;
    if (state.lives > 0) hideOverlay("noLivesOverlay");
  }
}, 1000);

/* ============================================================
   HOME SCREEN UI
============================================================ */
function updateHomeUI() {
  document.getElementById("homeLevel").textContent = state.currentLevel;
  document.getElementById("homeLives").textContent = state.lives;
  document.getElementById("homeBestScore").textContent = state.bestScore;
  document.getElementById("playLevelNum").textContent = state.currentLevel;
}

document.getElementById("soundToggleBtn").addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  document.getElementById("soundToggleBtn").textContent = state.soundOn ? "🔊 Sound On" : "🔇 Sound Off";
  saveState();
});

document.getElementById("playBtn").addEventListener("click", () => {
  regenLives();
  if (state.lives <= 0) {
    showOverlay("noLivesOverlay");
    return;
  }
  startLevel(state.currentLevel);
});

document.getElementById("levelsBtn").addEventListener("click", () => {
  renderLevelGrid();
  showScreen("levels");
});
document.getElementById("levelsBackBtn").addEventListener("click", () => showScreen("home"));

document.getElementById("dailyBtn").addEventListener("click", openDaily);

/* ============================================================
   LEVEL MAP
============================================================ */
function renderLevelGrid() {
  const grid = document.getElementById("levelGrid");
  grid.innerHTML = "";
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const node = document.createElement("div");
    const stars = state.levelStars[i] || 0;
    const locked = i > state.currentLevel;
    const completed = i < state.currentLevel;
    const current = i === state.currentLevel;

    node.className = "level-node" + (locked ? " locked" : "") + (completed ? " completed" : "") + (current ? " current" : "");
    node.innerHTML = `<span>${i}</span><span class="node-stars">${completed || current ? "⭐".repeat(stars) : "🔒"}</span>`;

    if (!locked) {
      node.addEventListener("click", () => {
        regenLives();
        if (state.lives <= 0) { showOverlay("noLivesOverlay"); return; }
        startLevel(i);
      });
    }
    grid.appendChild(node);
  }
}

/* ============================================================
   DAILY REWARD
============================================================ */
const DAILY_REWARDS = [
  { label: "+1 ❤️", type: "life", amount: 1 },
  { label: "+1 🔀", type: "shuffle", amount: 1 },
  { label: "+1 💣", type: "bomb", amount: 1 },
  { label: "+2 ❤️", type: "life", amount: 2 },
  { label: "+2 🔀", type: "shuffle", amount: 2 },
  { label: "+1 ➕", type: "extraMoves", amount: 1 },
  { label: "🎉 JACKPOT", type: "jackpot", amount: 1 },
];

function canClaimDaily() {
  if (!state.lastDailyClaim) return true;
  const last = new Date(state.lastDailyClaim);
  const now = new Date();
  return last.toDateString() !== now.toDateString();
}

function openDaily() {
  const grid = document.getElementById("dailyGrid");
  grid.innerHTML = "";
  const canClaim = canClaimDaily();
  const streakIdx = state.dailyStreak % DAILY_REWARDS.length;

  DAILY_REWARDS.forEach((r, idx) => {
    const el = document.createElement("div");
    const isToday = idx === streakIdx;
    const isPast = idx < streakIdx;
    el.className = "daily-day" + (isToday ? " today" : "") + (isPast ? " claimed" : "");
    el.innerHTML = `<span>Day ${idx + 1}</span><span>${r.label}</span>`;
    grid.appendChild(el);
  });

  document.getElementById("claimDailyBtn").disabled = !canClaim;
  document.getElementById("claimDailyBtn").style.opacity = canClaim ? "1" : "0.5";
  document.getElementById("claimDailyBtn").textContent = canClaim ? "Claim Reward" : "Come back tomorrow!";
  showOverlay("dailyOverlay");
}

document.getElementById("claimDailyBtn").addEventListener("click", () => {
  if (!canClaimDaily()) return;
  const reward = DAILY_REWARDS[state.dailyStreak % DAILY_REWARDS.length];
  applyReward(reward);
  state.lastDailyClaim = Date.now();
  state.dailyStreak++;
  saveState();
  updateHomeUI();
  hideOverlay("dailyOverlay");
  toast(`Claimed: ${reward.label}`);
});

function applyReward(reward) {
  if (reward.type === "life") state.lives = Math.min(MAX_LIVES + 5, state.lives + reward.amount);
  else if (reward.type === "jackpot") {
    state.lives = MAX_LIVES;
    state.boosters.shuffle += 2;
    state.boosters.bomb += 2;
    state.boosters.extraMoves += 1;
  }
  else state.boosters[reward.type] = (state.boosters[reward.type] || 0) + reward.amount;
}

document.getElementById("dailyCloseBtn").addEventListener("click", () => hideOverlay("dailyOverlay"));

/* ============================================================
   NO LIVES OVERLAY
============================================================ */
document.getElementById("watchAdLifeBtn").addEventListener("click", () => {
  simulateAdWatch(() => {
    state.lives = Math.min(MAX_LIVES, state.lives + 1);
    saveState();
    updateHomeUI();
    hideOverlay("noLivesOverlay");
    toast("+1 Life!");
  });
});
document.getElementById("noLivesMenuBtn").addEventListener("click", () => {
  hideOverlay("noLivesOverlay");
  showScreen("home");
});

function simulateAdWatch(onComplete) {
  toast("Loading ad...");
  setTimeout(() => {
    onComplete();
  }, 900);
}

/* ============================================================
   GAME ENGINE
============================================================ */
let game = null;

function startLevel(levelNum) {
  const cfg = getLevelConfig(levelNum);
  game = {
    level: levelNum,
    cfg,
    board: [],
    score: 0,
    movesLeft: cfg.moves,
    selected: null,
    busy: false,
    goalMet: false,
  };

  document.getElementById("hudLevel").textContent = levelNum;
  document.getElementById("hudScore").textContent = 0;
  document.getElementById("hudMoves").textContent = cfg.moves;
  updateProgressBar();
  renderGoalBar();
  updateBoosterButtons();

  showScreen("game");
  initBoard();
}

function renderGoalBar() {
  document.getElementById("goalBar").innerHTML =
    `<div class="goal-item"><span>🎯</span><span>${game.cfg.targetScore} pts</span></div>`;
}

function updateProgressBar() {
  const pct = Math.min(100, (game.score / game.cfg.targetScore) * 100);
  document.getElementById("scoreProgressFill").style.width = pct + "%";
}

function randomGem(colorCount) {
  return Math.floor(Math.random() * colorCount);
}

function initBoard() {
  const boardEl = document.getElementById("board");
  boardEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
  boardEl.innerHTML = "";
  game.board = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    const row = [];
    for (let c = 0; c < GRID_SIZE; c++) {
      let val;
      do {
        val = randomGem(game.cfg.colorCount);
      } while (
        (c >= 2 && row[c-1] === val && row[c-2] === val) ||
        (r >= 2 && game.board[r-1][c] === val && game.board[r-2][c] === val)
      );
      row.push(val);
    }
    game.board.push(row);
  }
  renderBoard();
}

function renderBoard() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const gem = document.createElement("div");
      gem.className = "gem";
      gem.dataset.r = r;
      gem.dataset.c = c;
      gem.textContent = GEM_TYPES[game.board[r][c]];
      attachGemEvents(gem);
      boardEl.appendChild(gem);
    }
  }
}

function attachGemEvents(gem) {
  let startX, startY;
  gem.addEventListener("click", () => onGemClick(gem));

  gem.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  gem.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return; // treat as tap, handled by click
    const r = parseInt(gem.dataset.r), c = parseInt(gem.dataset.c);
    let tr = r, tc = c;
    if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    trySwap(r, c, tr, tc);
  }, { passive: true });
}

function onGemClick(gem) {
  if (game.busy) return;
  const r = parseInt(gem.dataset.r), c = parseInt(gem.dataset.c);

  if (activeBooster === "bomb") {
    useBombAt(r, c);
    return;
  }

  if (!game.selected) {
    game.selected = { r, c };
    gem.classList.add("selected");
    return;
  }

  const sel = game.selected;
  if (sel.r === r && sel.c === c) {
    gem.classList.remove("selected");
    game.selected = null;
    return;
  }

  const isAdjacent = Math.abs(sel.r - r) + Math.abs(sel.c - c) === 1;
  clearSelection();
  if (isAdjacent) {
    trySwap(sel.r, sel.c, r, c);
  } else {
    game.selected = { r, c };
    gem.classList.add("selected");
  }
}

function clearSelection() {
  document.querySelectorAll(".gem.selected").forEach(g => g.classList.remove("selected"));
  game.selected = null;
}

function inBounds(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }

function trySwap(r1, c1, r2, c2) {
  if (game.busy || !inBounds(r2, c2)) return;
  game.busy = true;

  swapCells(r1, c1, r2, c2);
  renderBoard();

  const matches = findMatches();
  if (matches.length === 0) {
    setTimeout(() => {
      swapCells(r1, c1, r2, c2);
      renderBoard();
      game.busy = false;
    }, 220);
    return;
  }

  game.movesLeft--;
  document.getElementById("hudMoves").textContent = game.movesLeft;
  processMatches();
}

function swapCells(r1, c1, r2, c2) {
  const tmp = game.board[r1][c1];
  game.board[r1][c1] = game.board[r2][c2];
  game.board[r2][c2] = tmp;
}

function findMatches() {
  const matched = [];
  const mark = new Set();

  for (let r = 0; r < GRID_SIZE; r++) {
    let runStart = 0;
    for (let c = 1; c <= GRID_SIZE; c++) {
      const same = c < GRID_SIZE && game.board[r][c] === game.board[r][runStart];
      if (!same) {
        if (c - runStart >= 3) {
          for (let k = runStart; k < c; k++) mark.add(r + "," + k);
        }
        runStart = c;
      }
    }
  }

  for (let c = 0; c < GRID_SIZE; c++) {
    let runStart = 0;
    for (let r = 1; r <= GRID_SIZE; r++) {
      const same = r < GRID_SIZE && game.board[r][c] === game.board[runStart][c];
      if (!same) {
        if (r - runStart >= 3) {
          for (let k = runStart; k < r; k++) mark.add(k + "," + c);
        }
        runStart = r;
      }
    }
  }

  mark.forEach(key => {
    const [r, c] = key.split(",").map(Number);
    matched.push({ r, c });
  });
  return matched;
}

let comboCount = 0;

function processMatches() {
  const matches = findMatches();
  if (matches.length === 0) {
    comboCount = 0;
    game.busy = false;
    checkGameEnd();
    return;
  }

  comboCount++;
  const points = matches.length * 30 * comboCount;
  game.score += points;
  document.getElementById("hudScore").textContent = game.score;
  updateProgressBar();

  if (comboCount >= 2) showCombo(comboCount);

  matches.forEach(({ r, c }) => {
    const el = document.querySelector(`.gem[data-r="${r}"][data-c="${c}"]`);
    if (el) el.classList.add("matched");
    game.board[r][c] = -1;
  });

  setTimeout(() => {
    collapseBoard();
    renderBoard();
    setTimeout(() => processMatches(), 250);
  }, 260);
}

function showCombo(n) {
  const el = document.getElementById("comboText");
  el.textContent = n >= 4 ? "MEGA COMBO!" : n === 3 ? "GREAT COMBO!" : "COMBO x" + n;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function collapseBoard() {
  for (let c = 0; c < GRID_SIZE; c++) {
    let writeRow = GRID_SIZE - 1;
    for (let r = GRID_SIZE - 1; r >= 0; r--) {
      if (game.board[r][c] !== -1) {
        game.board[writeRow][c] = game.board[r][c];
        if (writeRow !== r) game.board[r][c] = -1;
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) {
      game.board[r][c] = randomGem(game.cfg.colorCount);
    }
  }
}

function checkGameEnd() {
  if (game.score >= game.cfg.targetScore && !game.goalMet) {
    game.goalMet = true;
    setTimeout(() => onLevelWin(), 300);
    return;
  }
  if (game.movesLeft <= 0) {
    setTimeout(() => onLevelLose(), 300);
    return;
  }
  if (!hasPossibleMoves()) {
    shuffleBoard();
    toast("No moves left — reshuffled!");
  }
}

function hasPossibleMoves() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (c < GRID_SIZE - 1) {
        swapCells(r, c, r, c + 1);
        const hasMatch = findMatches().length > 0;
        swapCells(r, c, r, c + 1);
        if (hasMatch) return true;
      }
      if (r < GRID_SIZE - 1) {
        swapCells(r, c, r + 1, c);
        const hasMatch = findMatches().length > 0;
        swapCells(r, c, r + 1, c);
        if (hasMatch) return true;
      }
    }
  }
  return false;
}

function shuffleBoard() {
  const flat = game.board.flat();
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }
  let idx = 0;
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      game.board[r][c] = flat[idx++];
  renderBoard();
}

/* ============================================================
   WIN / LOSE
============================================================ */
function calcStars() {
  const ratio = game.score / game.cfg.targetScore;
  if (ratio >= 1.6) return 3;
  if (ratio >= 1.2) return 2;
  return 1;
}

function onLevelWin() {
  const stars = calcStars();
  state.levelStars[game.level] = Math.max(state.levelStars[game.level] || 0, stars);
  if (game.level === state.currentLevel) state.currentLevel++;
  if (game.score > state.bestScore) state.bestScore = game.score;

  const bonusMoves = game.movesLeft;
  const bonusPoints = bonusMoves * 20;
  game.score += bonusPoints;

  saveState();
  updateHomeUI();

  document.getElementById("winScoreVal").textContent = game.score;
  document.getElementById("winBonusText").textContent = bonusMoves > 0 ? `+${bonusPoints} moves bonus!` : "";

  const starEls = document.querySelectorAll("#winStars .star");
  starEls.forEach((el, i) => el.classList.toggle("earned", i < stars));

  showOverlay("winOverlay");
  initAdSlot("adWin");
}

document.getElementById("nextLevelBtn").addEventListener("click", () => {
  hideOverlay("winOverlay");
  regenLives();
  if (state.lives <= 0) { showOverlay("noLivesOverlay"); return; }
  startLevel(state.currentLevel);
});
document.getElementById("winMenuBtn").addEventListener("click", () => {
  hideOverlay("winOverlay");
  showScreen("home");
});

function onLevelLose() {
  loseLife();
  document.getElementById("loseScoreVal").textContent = game.score;
  showOverlay("loseOverlay");
  initAdSlot("adLose");
}

document.getElementById("watchAdContinueBtn").addEventListener("click", () => {
  simulateAdWatch(() => {
    hideOverlay("loseOverlay");
    game.movesLeft += 5;
    document.getElementById("hudMoves").textContent = game.movesLeft;
    game.busy = false;
    toast("+5 Moves!");
  });
});
document.getElementById("retryLevelBtn").addEventListener("click", () => {
  hideOverlay("loseOverlay");
  regenLives();
  if (state.lives <= 0) { showOverlay("noLivesOverlay"); return; }
  startLevel(game.level);
});
document.getElementById("loseMenuBtn").addEventListener("click", () => {
  hideOverlay("loseOverlay");
  showScreen("home");
});

/* ============================================================
   PAUSE
============================================================ */
document.getElementById("pauseBtn").addEventListener("click", () => showOverlay("pauseOverlay"));
document.getElementById("resumeBtn").addEventListener("click", () => hideOverlay("pauseOverlay"));
document.getElementById("restartBtn").addEventListener("click", () => {
  hideOverlay("pauseOverlay");
  startLevel(game.level);
});
document.getElementById("quitBtn").addEventListener("click", () => {
  hideOverlay("pauseOverlay");
  showScreen("home");
});
document.getElementById("gameBackBtn").addEventListener("click", () => showScreen("home"));

/* ============================================================
   BOOSTERS
============================================================ */
let activeBooster = null;

function updateBoosterButtons() {
  document.getElementById("boosterShuffle").querySelector(".booster-count").textContent = state.boosters.shuffle;
  document.getElementById("boosterBomb").querySelector(".booster-count").textContent = state.boosters.bomb;
  document.getElementById("boosterExtraMoves").querySelector(".booster-count").textContent = state.boosters.extraMoves;
}

document.getElementById("boosterShuffle").addEventListener("click", () => {
  if (state.boosters.shuffle <= 0 || game.busy) return;
  state.boosters.shuffle--;
  saveState();
  updateBoosterButtons();
  shuffleBoard();
  toast("Board shuffled!");
});

document.getElementById("boosterBomb").addEventListener("click", () => {
  if (state.boosters.bomb <= 0 || game.busy) return;
  activeBooster = activeBooster === "bomb" ? null : "bomb";
  document.getElementById("boosterBomb").classList.toggle("active", activeBooster === "bomb");
  if (activeBooster === "bomb") toast("Tap a gem to blast it!");
});

function useBombAt(r, c) {
  if (state.boosters.bomb <= 0) return;
  state.boosters.bomb--;
  saveState();
  updateBoosterButtons();
  activeBooster = null;
  document.getElementById("boosterBomb").classList.remove("active");

  game.board[r][c] = -1;
  game.score += 50;
  document.getElementById("hudScore").textContent = game.score;
  updateProgressBar();

  game.busy = true;
  setTimeout(() => {
    collapseBoard();
    renderBoard();
    setTimeout(() => processMatches(), 200);
  }, 150);
}

document.getElementById("boosterExtraMoves").addEventListener("click", () => {
  if (state.boosters.extraMoves <= 0 || game.busy) return;
  state.boosters.extraMoves--;
  saveState();
  updateBoosterButtons();
  game.movesLeft += 5;
  document.getElementById("hudMoves").textContent = game.movesLeft;
  toast("+5 Moves!");
});

/* ============================================================
   AD SLOTS - request ads, hide slot cleanly if unfilled
============================================================ */
const _initializedAdSlots = new Set();

function initAdSlot(slotId) {
  if (_initializedAdSlots.has(slotId)) return;
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const ins = slot.querySelector("ins.adsbygoogle");
  if (!ins) { slot.classList.add("ad-hidden"); return; }
  _initializedAdSlots.add(slotId);

  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    slot.classList.add("ad-hidden");
    return;
  }

  // AdSense sets data-ad-status="filled"|"unfilled" on the <ins> once it resolves.
  const checkStatus = () => {
    const status = ins.getAttribute("data-ad-status");
    if (status === "unfilled") {
      slot.classList.add("ad-hidden");
      return true;
    }
    if (status === "filled") {
      slot.classList.add("ad-filled");
      return true;
    }
    return false;
  };

  if (checkStatus()) return;

  const observer = new MutationObserver(() => {
    if (checkStatus()) observer.disconnect();
  });
  observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });

  // Fallback: if AdSense never resolves (blocked, offline, ad blocker), hide after timeout
  setTimeout(() => {
    if (!checkStatus()) {
      observer.disconnect();
      slot.classList.add("ad-hidden");
    }
  }, 3500);
}

function initAllAdSlots() {
  ["adTop", "adBottom", "adWin", "adLose"].forEach(initAdSlot);
}

/* ============================================================
   INIT
============================================================ */
regenLives();
updateHomeUI();
document.getElementById("soundToggleBtn").textContent = state.soundOn ? "🔊 Sound On" : "🔇 Sound Off";
initAdSlot("adTop");
initAdSlot("adBottom");

// Prevent pull-to-refresh / bounce scrolling on mobile
document.addEventListener("touchmove", (e) => {
  if (e.target.closest(".board")) e.preventDefault();
}, { passive: false });

})();
