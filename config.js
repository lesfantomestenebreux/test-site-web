/* ==========================================================================
   1. CONFIG.JS — ÉTAT GLOBAL, PARSEUR DE MATRICE & CHARGEMENT
   ========================================================================== */

let cameraX = 0;
let cameraY = 0;
let currentLevelIndex = 0;
let currentLevel = null;
let isGameOver = false;
let hasWon = false;
let gameStarted = false;
let gameTimer = null;
let cellSize = 38;
let lastFrameTime = performance.now();
let levelCoinHistory = [];

// Références DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const levelTitle = document.getElementById('level-title');
const levelDesc = document.getElementById('level-desc');
const coinStatus = document.getElementById('coin-status');
const trapStatus = document.getElementById('trap-status');
const overlay = document.getElementById('status-overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayBtnReplay = document.getElementById('overlay-btn-replay');
const overlayBtnNext = document.getElementById('overlay-btn-next');
const resetBtn = document.getElementById('reset-btn');

const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');

// Avatar sélectionné par le joueur (par défaut 👩)
window.chosenAvatar = localStorage.getItem('labyrinth_avatar') || "👩";

function setPlayerAvatar(avatar) {
    window.chosenAvatar = avatar;
    localStorage.setItem('labyrinth_avatar', avatar);
    if (currentLevel && currentLevel.player) {
        currentLevel.player.avatar = avatar;
        if (typeof render === 'function') render();
    }
    document.querySelectorAll('.avatar-card, .avatar-btn').forEach(el => {
        if (el.getAttribute('data-avatar') === avatar) {
            el.classList.add('active');
            if (el.classList.contains('btn')) {
                el.classList.add('btn-warning');
                el.classList.remove('btn-outline-warning');
            }
        } else {
            el.classList.remove('active');
            if (el.classList.contains('btn')) {
                el.classList.remove('btn-warning');
                el.classList.add('btn-outline-warning');
            }
        }
    });
}

function startGame() {
    gameStarted = true;
    if (startOverlay) startOverlay.style.display = 'none';
    if (typeof startGameCycle === 'function') startGameCycle();
}

/* ==========================================================================
   PARSEUR DE MATRICE COMPLET
   ========================================================================== */
function parseLevelMatrix(levelDef) {
    const rawLines = levelDef.matrix;
    const grid = [];

    rawLines.forEach((line) => {
        let tokens = [];
        const trimmed = line.trim();
        if (trimmed.includes(' ')) {
            tokens = trimmed.split(/\s+/);
        } else {
            tokens = trimmed.match(/(T\d+|E\d+|S\d+|.)/g) || [];
        }
        grid.push(tokens);
    });

    const rows = grid.length;
    const cols = Math.max(...grid.map(r => r.length));

    const parsed = {
        name: levelDef.name || `Niveau ${currentLevelIndex + 1}`,
        desc: levelDef.desc || "Atteins la porte 🚪 !",
        rows: rows,
        cols: cols,
        map: [],
        player: { 
            x: 1, y: 1, fromX: 1, fromY: 1, moveStartTime: 0, 
            avatar: window.chosenAvatar || "👩", 
            garlicPowerTime: 0, pumpkinPowerTime: 0 
        },
        zombies: [],
        pumpkins: [],
        exit: { x: 1, y: 1 },
        coins: [],
        keys: [],
        traps: [],
        trapsActive: true,
        ghosts: [],
        vampires: [],
        garlics: [],
        cannons: [],
        laserCooldown: 0,
        bombs: [],
        teleporters: {},
        lastTpTime: 0,
        tpEffect: null,
        slowTiles: [],
        spiders: [],
        witches: [],
        potions: [],
        potionSplashes: [],
        acidPuddles: [],
        checkpoints: [],
        lastCheckpoint: null, 
        bats: [],
        trolls: [],
        tombstones: [],
        bows: [],
        arrows: [],
        shockwaves: [],
        skulls: [],
        bones: [],
        boneProjectiles: [],
    };

    for (let y = 0; y < rows; y++) {
        parsed.map[y] = [];
        for (let x = 0; x < cols; x++) {
            const token = grid[y][x] || '#';

            if (token === '#') {
                parsed.map[y][x] = 1;
            } else {
                parsed.map[y][x] = 0;

                if (token === 'J') {
                    parsed.player.x = x;
                    parsed.player.y = y;
                    parsed.player.fromX = x;
                    parsed.player.fromY = y;
                } else if (token === 'D') {
                    parsed.exit = { x, y };
                } else if (token === 'A') {
                    parsed.spiders.push({x, y, fromX: x, fromY: y, spawnX: x, spawnY: y, state: 'idle', targetWebX: null, targetWebY: null, targetX: x, targetY: y, stepStartTime: 0, stepDuration: 333 });
                } else if (token === 'P') {
                    parsed.coins.push({ x, y, collected: false });
                } else if (token === 'K') {
                    parsed.keys.push({ x, y, collected: false });
                } else if (token === 'X') {
                    parsed.traps.push({ x, y });
                } else if (token === 'H') {
                    parsed.ghosts.push({ x, y, fromX: x, fromY: y, dirX: 1, dirY: 0, type: 'H', stepStartTime: 0 });
                } else if (token === 'V') {
                    parsed.ghosts.push({ x, y, fromX: x, fromY: y, dirX: 0, dirY: 1, type: 'V', stepStartTime: 0 });
                } else if (token === 'R') {
                    parsed.vampires.push({ x, y, fromX: x, fromY: y, alive: true, chasing: false, stepStartTime: 0, alertTimer: 0, lastSeenX: x, lastSeenY: y });
                } else if (token === 'G') {
                    parsed.garlics.push({ x, y, collected: false });
                } else if (token === 'L') {
                    parsed.cannons.push({ x, y }); 
                    parsed.map[y][x] = 1; // Le bloc du laser est un mur solide infranchissable
                } else if (token === 'B') {
                    parsed.slowTiles.push({ x, y });
                } else if (token === 'M') {
                    parsed.checkpoints.push({ x, y, activated: false });
                } else if (token === 'W') {
                    parsed.witches.push({ x, y, fromX: x, fromY: y, spawnX: x, spawnY: y, state: 'idle',  channelEndTime: 0, nextCastTime: 0, lastMoveTime: 0,  stepStartTime: 0});
                } else if (token === 'Z') {
                    parsed.zombies.push({ x, y, fromX: x, fromY: y, spawnX: x, spawnY: y, originX: x, originY: y, state: 'idle', returnSteps: 0, chaseEndTime: 0, lastSeenX: x, lastSeenY: y, stepStartTime: 0, lastCheck: 0 });
                } else if (token === 'C') {
                    parsed.pumpkins.push({ x, y, collected: false });
                } else if (token === 'N') {
                    // Crâne Errant 💀 (Phase 1 -> fusionne en Tête de Mort ☠️ après 2 os)
                    parsed.skulls.push({x, y, fromX: x, fromY: y, moveStartTime: 0, lastMoveTime: 0, bonesCollected: 0, isTransformed: false, targetBone: null, lastAttackTime: 0, chargeEnd: 0});
                } else if (token === 'I') {
                    // Os au sol 🦴 (attire le Crâne si le joueur marche dessus)
                    parsed.bones.push({ x, y, collected: false, triggered: false});
                } else if (token === 'U') {
                    const isTop = (y === 0 || grid[y - 1][x] !== 'U');
                    const isLeft = (x === 0 || grid[y][x - 1] !== 'U');
                    if (isTop && isLeft) {
                        parsed.trolls.push({
                            x, y,
                            hp: 3,
                            maxHp: 3,
                            alive: true,
                            meleeChargeEnd: 0,
                            meleeDir: { dx: 0, dy: 0 },
                            chargedEnd: 0,
                            chargedAim: null,
                            attackCount: 0,
                            cooldownEnd: 0
                        });
                    }
                    parsed.map[y][x] = 3;
                } else if (token === 'Q') {
                    // Pierre Tombale 🪦 : valeur 2 dans la matrice (bloque mouvements, mais pas la vue ni les projectiles)
                    parsed.tombstones.push({ x, y });
                    parsed.map[y][x] = 2;
                } else if (token === 'O') {
                    // Arc 🏹 (utilisable 1 fois)
                    parsed.bows.push({ x, y, used: false, chargeStartTime: null });
                } else if (token === 'Y') {
                    parsed.bats.push({x, y, fromX: x, fromY: y, dirX: -1, dirY: -1, stepStartTime: 0, lastStepTime: 0});
                } else if (token.startsWith('T')) {
                    const id = token;
                    if (!parsed.teleporters[id]) parsed.teleporters[id] = [];
                    parsed.teleporters[id].push({ x, y, label: id });
                } else if (token.startsWith('E')) {
                    const num = token.substring(1);
                    if (!parsed.teleporters['DIR_' + num]) parsed.teleporters['DIR_' + num] = {};
                    parsed.teleporters['DIR_' + num].in = { x, y, label: token };
                } else if (token.startsWith('S')) {
                    const num = token.substring(1);
                    if (!parsed.teleporters['DIR_' + num]) parsed.teleporters['DIR_' + num] = {};
                    parsed.teleporters['DIR_' + num].out = { x, y, label: token };
                }
            }
        }
    }

    return parsed;
}

/* ==========================================================================
   CHARGEMENT & STATUTS
   ========================================================================== */
function loadLevel(index) {
    if (!window.LEVELS || !window.LEVELS[index]) return;
    currentLevelIndex = index;
    currentLevel = parseLevelMatrix(window.LEVELS[index]);

    if (levelTitle) levelTitle.textContent = currentLevel.name;
    if (levelDesc) levelDesc.textContent = currentLevel.desc;

    isGameOver = false;
    hasWon = false;
    updateStatsUI();

    if (overlay) overlay.style.display = "none";
    if (overlayBtnNext) overlayBtnNext.style.display = "none";

    const startPx = currentLevel.player.x * cellSize + cellSize / 2;
    const startPy = currentLevel.player.y * cellSize + cellSize / 2;
    cameraX = canvas ? Math.min(0, Math.max(canvas.width - currentLevel.cols * cellSize, canvas.width / 2 - startPx)) : 0;
    cameraY = canvas ? Math.min(0, Math.max(canvas.height - currentLevel.rows * cellSize, canvas.height / 2 - startPy)) : 0;

    resizeGame();
    if (gameStarted) {
        if (typeof startGameCycle === 'function') startGameCycle();
    } else {
        if (startOverlay) startOverlay.style.display = 'flex';
        if (typeof render === 'function') render();
    }
}

function updateStatsUI() {
    if (!currentLevel) return;

    if (coinStatus) {
        const currentTotal = currentLevel.coins.length;
        const currentGot = currentLevel.coins.filter(c => c.collected).length;
        levelCoinHistory[currentLevelIndex] = { got: currentGot, total: currentTotal };

        let cumulativeGot = 0;
        let cumulativeTotal = 0;

        for (let i = 0; i <= currentLevelIndex; i++) {
            if (levelCoinHistory[i]) {
                cumulativeGot += levelCoinHistory[i].got;
                cumulativeTotal += levelCoinHistory[i].total;
            } else if (window.LEVELS && window.LEVELS[i]) {
                const rawCoins = (window.LEVELS[i].matrix.join(' ').match(/P/g) || []).length;
                cumulativeTotal += rawCoins;
            }
        }

        coinStatus.textContent = `${cumulativeGot} / ${cumulativeTotal}`;
        coinStatus.className = (cumulativeGot === cumulativeTotal && cumulativeTotal > 0) ? "text-success fw-bold" : "text-warning";
    }

    const keyBadge = document.getElementById('key-status');
    if (keyBadge) {
        const totalKeys = currentLevel.keys.length;
        const gotKeys = currentLevel.keys.filter(k => k.collected).length;
        if (totalKeys === 0) {
            keyBadge.parentElement.style.display = 'none';
        } else {
            keyBadge.parentElement.style.display = 'inline-block';
            keyBadge.textContent = `${gotKeys} / ${totalKeys}`;
            keyBadge.className = gotKeys === totalKeys ? "text-success fw-bold" : "text-warning";
        }
    }

    if (trapStatus) {
        if (currentLevel.traps.length > 0) {
            trapStatus.parentElement.style.display = 'inline-block';
            trapStatus.textContent = currentLevel.trapsActive ? "ACTIFS" : "INACTIFS";
            trapStatus.className = currentLevel.trapsActive ? "text-danger fw-bold" : "text-success fw-bold";
        } else {
            trapStatus.parentElement.style.display = 'none';
        }
    }

    const garlicBadge = document.getElementById('garlic-status');
    if (garlicBadge) {
        if (currentLevel.player.garlicPowerTime > 0) {
            garlicBadge.parentElement.style.display = 'inline-block';
            garlicBadge.textContent = `${currentLevel.player.garlicPowerTime}s`;
            garlicBadge.className = "text-success fw-bold";
        } else {
            garlicBadge.parentElement.style.display = 'none';
        }
    }

    const pumpkinBadge = document.getElementById('pumpkin-status');
    if (pumpkinBadge) {
        if (currentLevel.player.pumpkinPowerTime > 0) {
            pumpkinBadge.parentElement.style.display = 'inline-block';
            pumpkinBadge.textContent = `${currentLevel.player.pumpkinPowerTime}s`;
            pumpkinBadge.className = "text-warning fw-bold";
        } else {
            pumpkinBadge.parentElement.style.display = 'none';
        }
    }
}

function resizeGame() {
    if (!currentLevel || !canvas) return;

    const wrapperWidth = Math.min(window.innerWidth - 32, 540);
    const isLarge = currentLevel.cols >= 18 || currentLevel.rows >= 18;

    if (isLarge) {
        const VIEW_TILES = 18;
        cellSize = Math.floor(wrapperWidth / VIEW_TILES);
        canvas.width = cellSize * VIEW_TILES;
        canvas.height = cellSize * VIEW_TILES;
    } else {
        cellSize = Math.floor(wrapperWidth / currentLevel.cols);
        canvas.width = cellSize * currentLevel.cols;
        canvas.height = cellSize * currentLevel.rows;
    }
    if (typeof render === 'function') render();
}

window.addEventListener('resize', resizeGame);