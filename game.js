/* ==========================================================================
   MOTEUR DE JEU UNIVERSEL COMPLET - LES FANTÔMES TÉNÉBREUX
   - Joueur : Humain 👩 / 👨 (ou Déguisement Citrouille 🎃)
   - Monstres patrouilleurs : Fantômes 👻 (H & V) avec glissement fluide (0.2s)
   - Monstres traqueurs : Vampires 🧛 (R) avec mémoire, fuite sous ail & anti-stacking
   - Monstres de zone : Zombies 🧟‍♂️ (Z) en ronde 3x3, traque 4s hors vue & retour 2 pas
   - Bonus anti-vampire : Ail 🧄 (G) avec cercle protecteur clignotant
   - Bonus furtif : Citrouille 🎃 (C) invisibilité zombies (10s) et déplacement amorti (0.34s)
   - Cases lentes : Toile 🕸️ (B) délai de déplacement
   - Clés & Portes : Clé 🔑 (K) & Porte 🚪 / 🔒 (D)
   - Canons & Projectiles : Croix rouge ➕ (L) & Laser rouge fluide ➖ synchronisé (4s)
   - Pièges : Flammes 🔥 / Cendres (X)
   - Pièces : 🪙 (P)
   - Téléporteurs : 🌀 (T1, T2... / E1 -> S1)
   - Caméra fluide & Zoom (>= 20x20)
   - Mode Plein écran
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
        render();
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
    startGameCycle();
}

/* ==========================================================================
   1. PARSEUR DE MATRICE COMPLET
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
        slowTiles: [],
        spiders: [],
        witches: [],
        potions: [],
        potionSplashes: [],
        acidPuddles: [],
        checkpoints: [],
        lastCheckpoint: null, 
        bats: [],
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
   2. CHARGEMENT & STATUTS
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
        startGameCycle();
    } else {
        if (startOverlay) startOverlay.style.display = 'flex';
        render();
    }
}

function updateStatsUI() {
    if (!currentLevel) return;

    if (coinStatus) {
        // 1. Calcul des pièces du niveau actuel
        const currentTotal = currentLevel.coins.length;
        const currentGot = currentLevel.coins.filter(c => c.collected).length;

        // Enregistre l'état du niveau actuel dans l'historique
        levelCoinHistory[currentLevelIndex] = { got: currentGot, total: currentTotal };

        // 2. Additionne les pièces de tous les niveaux précédents (0 jusqu'au niveau actuel)
        let cumulativeGot = 0;
        let cumulativeTotal = 0;

        for (let i = 0; i <= currentLevelIndex; i++) {
            if (levelCoinHistory[i]) {
                cumulativeGot += levelCoinHistory[i].got;
                cumulativeTotal += levelCoinHistory[i].total;
            } else if (window.LEVELS && window.LEVELS[i]) {
                // Si on a sauté directement à un niveau via l'URL (?lvl=2), compte quand même le total des niveaux précédents
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
    render();
}

window.addEventListener('resize', resizeGame);
/* ==========================================================================
   3. ANIMATION FLUIDE EN TEMPS RÉEL (LASERS + ZOMBIES + ARAIGNÉES + SORCIÈRES)
   ========================================================================== */
function animateLasers(timestamp) {
    // Horloge unifiée en temps réel (évite les bugs de téléportation et de flaques invisibles)
    const now = Date.now();

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (currentLevel && gameStarted && !isGameOver && !hasWon) {
        updateZombies(now);
        if (typeof updateSpiders === 'function') updateSpiders(now);
        updateWitches(now);
        updateBats(now);

        // --- VITESSE DU FAISCEAU LASER CANON ---
        const laserSpeed = 4; // 4 cases par seconde
        const keptBombs = [];
        currentLevel.bombs.forEach(b => {
            b.x += b.dirX * laserSpeed * dt;
            b.y += b.dirY * laserSpeed * dt;

            const checkX = b.dirX > 0 ? Math.ceil(b.x) : Math.floor(b.x);
            const checkY = b.dirY > 0 ? Math.ceil(b.y) : Math.floor(b.y);

            if (currentLevel.map[checkY] && currentLevel.map[checkY][checkX] === 1) return;

            if (Math.hypot(b.x - currentLevel.player.x, b.y - currentLevel.player.y) < 0.55) {
                triggerGameOver("Zzzap ! Tu as été désintégré par un laser !");
            }
            keptBombs.push(b);
        });
        currentLevel.bombs = keptBombs;

        // --- VOL ET IMPACTS DES FIOLES DE SORCIÈRE 🧪 ---
        if (currentLevel.potions) {
            // Vitesse de la fiole : 2.5 cases par seconde (soit 0.4s par case)
            const potionSpeed = 2.5;
            const keptPotions = [];

            // Durée de vie d'une flaque au sol : 2500 ms (2.5 secondes)
            const PUDDLE_DURATION_MS = 2500;

            currentLevel.potions.forEach(p => {
                const prevX = p.x;
                const prevY = p.y;

                p.x += p.dirX * potionSpeed * dt;
                p.y += p.dirY * potionSpeed * dt;
                p.angle = (p.angle || 0) + dt * 10;

                let hitObstacle = false;

                // 1. Collision Mur
                const targetTileX = Math.round(p.x);
                const targetTileY = Math.round(p.y);
                if (currentLevel.map[targetTileY] && currentLevel.map[targetTileY][targetTileX] === 1) {
                    hitObstacle = true;
                }

                // 2. Collision Laser
                if (!hitObstacle && currentLevel.bombs.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 0.6)) {
                    hitObstacle = true;
                }

                // 3. Collision Joueur
                if (!hitObstacle && Math.hypot(p.x - currentLevel.player.x, p.y - currentLevel.player.y) < 0.55) {
                    hitObstacle = true;
                    triggerGameOver("Une fiole toxique 🧪 de sorcière t'a frappé de plein fouet !", "witch");
                }

                // 4. Collision Monstres solides (Zombies, Vampires, Araignées)
                if (!hitObstacle) {
                    const hitZombie = currentLevel.zombies.some(z => Math.hypot(z.x - p.x, z.y - p.y) < 0.6);
                    const hitVampire = currentLevel.vampires.some(v => v.alive && Math.hypot(v.x - p.x, v.y - p.y) < 0.6);
                    const hitSpider = currentLevel.spiders && currentLevel.spiders.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 0.6);

                    if (hitZombie || hitVampire || hitSpider) {
                        hitObstacle = true;
                    }
                }

                // Impact : dépôt immédiat de la flaque 🫟 sur la case au sol
                if (hitObstacle) {
                    let puddleX = Math.round(prevX);
                    let puddleY = Math.round(prevY);

                    // Si la case précédente était un mur, prend la case valide la plus proche
                    if (currentLevel.map[puddleY] && currentLevel.map[puddleY][puddleX] === 1) {
                        puddleX = Math.max(0, Math.min(currentLevel.cols - 1, Math.round(p.x - p.dirX * 0.5)));
                        puddleY = Math.max(0, Math.min(currentLevel.rows - 1, Math.round(p.y - p.dirY * 0.5)));
                    }

                    if (!currentLevel.acidPuddles) currentLevel.acidPuddles = [];
                    currentLevel.acidPuddles.push({
                        x: puddleX,
                        y: puddleY,
                        spawnTime: now,
                        expireTime: now + PUDDLE_DURATION_MS // 2.5 secondes
                    });

                    // Éclaboussure d'impact
                    currentLevel.potionSplashes.push({ x: puddleX, y: puddleY, startTime: now, duration: 400 });

                    // Mort si le joueur est déjà sur cette case
                    if (currentLevel.player.x === puddleX && currentLevel.player.y === puddleY) {
                        triggerGameOver("Une flaque toxique 🧪 s'est répandue sous tes pieds !", "witch");
                    }
                    return;
                }

                keptPotions.push(p);
            });
            currentLevel.potions = keptPotions;
        }

        // --- GESTION DES FLAQUES D'ACIDE ACTIVES ---
        if (currentLevel.acidPuddles) {
            currentLevel.acidPuddles = currentLevel.acidPuddles.filter(p => now < p.expireTime);

            const onPuddle = currentLevel.acidPuddles.some(p => p.x === currentLevel.player.x && p.y === currentLevel.player.y);
            if (onPuddle) {
                triggerGameOver("Aïe ! Tu as marché dans une flaque d'acide toxique 🧪 !", "witch");
            }
        }

        if (currentLevel.potionSplashes) {
            currentLevel.potionSplashes = currentLevel.potionSplashes.filter(sp => now - sp.startTime < sp.duration);
        }

        render();
    }

    requestAnimationFrame(animateLasers);
}
requestAnimationFrame(animateLasers);

/* ==========================================================================
   4. BOUCLE DE TEMPS RÉEL (1 SECONDE PAR TICK)
   ========================================================================== */
function startGameCycle() {
    if (gameTimer) clearInterval(gameTimer);

    gameTimer = setInterval(() => {
        if (isGameOver || hasWon || !currentLevel) return;

        // --- A. DÉCOMPTE EFFETS BONUS ---
        if (currentLevel.player.garlicPowerTime > 0) {
            currentLevel.player.garlicPowerTime--;
        }
        if (currentLevel.player.pumpkinPowerTime > 0) {
            currentLevel.player.pumpkinPowerTime--;
        }

        // --- B. BASCULE FLAMMES TEMPORISÉES ---
        if (currentLevel.traps.length > 0) {
            currentLevel.trapsActive = !currentLevel.trapsActive;
            if (currentLevel.trapsActive) {
                const onTrap = currentLevel.traps.some(t => t.x === currentLevel.player.x && t.y === currentLevel.player.y);
                if (onTrap) {
                    triggerGameOver("Aïe ! Tu as brûlé dans les flammes !");
                    render();
                    return;
                }
            }
        }

        // --- C. DÉPLACEMENT DES FANTÔMES (GLISSEMENT 0.2s) ---
        const now = Date.now();
        currentLevel.ghosts.forEach(m => {
            m.fromX = m.x;
            m.fromY = m.y;
            m.stepStartTime = now;

            let nextX = m.x + m.dirX;
            let nextY = m.y + m.dirY;

            if (currentLevel.map[nextY] && currentLevel.map[nextY][nextX] === 1) {
                m.dirX = -m.dirX;
                m.dirY = -m.dirY;
                nextX = m.x + m.dirX;
                nextY = m.y + m.dirY;
            }

            if (currentLevel.map[nextY] && currentLevel.map[nextY][nextX] === 0) {
                m.x = nextX;
                m.y = nextY;
            }

            if (m.x === currentLevel.player.x && m.y === currentLevel.player.y) {
                triggerGameOver("Un fantôme t'a capturé !", "ghost");
            }
        });

        // --- D. VAMPIRES (TRAQUEURS AVEC FUITE SOUS AIL & ANTI-STACKING) ---
        const isFleeing = currentLevel.player.garlicPowerTime > 0;

        currentLevel.vampires.forEach(v => {
            if (!v.alive) return;

            const canSee = hasLineOfSight(v.x, v.y, currentLevel.player.x, currentLevel.player.y);
            if (canSee) {
                v.chasing = true;
                v.lastSeenX = currentLevel.player.x;
                v.lastSeenY = currentLevel.player.y;
                v.alertTimer = 4;
            } else if (v.alertTimer > 0) {
                v.alertTimer--;
                if (v.alertTimer === 0) {
                    v.chasing = false;
                }
            }

            if (isFleeing || v.chasing) {
                const targetX = (isFleeing || canSee) ? currentLevel.player.x : v.lastSeenX;
                const targetY = (isFleeing || canSee) ? currentLevel.player.y : v.lastSeenY;
                const currentDist = Math.hypot(targetX - v.x, targetY - v.y);

                let nextX = v.x;
                let nextY = v.y;

                const candidates = [
                    { x: v.x + 1, y: v.y },
                    { x: v.x - 1, y: v.y },
                    { x: v.x, y: v.y + 1 },
                    { x: v.x, y: v.y - 1 }
                ];

                candidates.sort((a, b) => {
                    const distA = Math.hypot(targetX - a.x, targetY - a.y);
                    const distB = Math.hypot(targetX - b.x, targetY - b.y);
                    return isFleeing ? (distB - distA) : (distA - distB);
                });

                for (const pos of candidates) {
                    const distToTarget = Math.hypot(targetX - pos.x, targetY - pos.y);

                    if (!isFleeing && distToTarget > currentDist + 0.1) continue;
                    if (isFleeing && distToTarget < currentDist - 0.1) continue;

                    const isFloor = currentLevel.map[pos.y] && currentLevel.map[pos.y][pos.x] === 0;

                    const isOccupiedByVampire = currentLevel.vampires.some(other => 
                        other !== v && other.alive && other.x === pos.x && other.y === pos.y
                    );

                    if (isFloor && !isOccupiedByVampire) {
                        nextX = pos.x;
                        nextY = pos.y;
                        break;
                    }
                }

                if (nextX !== v.x || nextY !== v.y) {
                    v.fromX = v.x;
                    v.fromY = v.y;
                    v.stepStartTime = Date.now();
                    v.x = nextX;
                    v.y = nextY;
                }
            }

            if (v.x === currentLevel.player.x && v.y === currentLevel.player.y) {
                if (currentLevel.player.garlicPowerTime > 0) {
                    v.alive = false;
                } else {
                    triggerGameOver("Un vampire t'a mordu !", "vampire");
                }
            }
        });

        // --- E. TIRS SYNCHRONISÉS TOUTES LES 4 SECONDES ---
        if (currentLevel.cannons.length > 0) {
            currentLevel.laserCooldown++;

            if (currentLevel.laserCooldown >= 4) {
                currentLevel.laserCooldown = 0;

                const dirs = [
                    { dx: 0, dy: -1 },
                    { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 },
                    { dx: 1, dy: 0 }
                ];

                currentLevel.cannons.forEach(c => {
                    dirs.forEach(d => {
                        const sx = c.x + d.dx;
                        const sy = c.y + d.dy;

                        const isCannonAdjacent = currentLevel.cannons.some(other => other.x === sx && other.y === sy);

                        if (!isCannonAdjacent && currentLevel.map[sy] && currentLevel.map[sy][sx] === 0) {
                            currentLevel.bombs.push({
                                x: sx,
                                y: sy,
                                dirX: d.dx,
                                dirY: d.dy
                            });
                        }
                    });
                });
            }
        }

        updateStatsUI();
        render();
    }, 1000);
}

// Détection de ligne de vue directe à 360° (Raycasting) sans mur intermédiaire
function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) return true;

    const steps = Math.ceil(distance * 3);
    for (let i = 1; i < steps; i++) {
        const checkX = Math.round(x1 + (dx * (i / steps)));
        const checkY = Math.round(y1 + (dy * (i / steps)));

        if (currentLevel.map[checkY] && currentLevel.map[checkY][checkX] === 1) {
            return false;
        }
    }

    return true;
}
// Vérifie si une case est déjà occupée par un autre Vampire vivant ou un Zombie
function isTileOccupiedByUndead(x, y, selfEntity) {
    const hasVampire = currentLevel.vampires.some(v => v !== selfEntity && v.alive && v.x === x && v.y === y);
    const hasZombie = currentLevel.zombies.some(z => z !== selfEntity && z.x === x && z.y === y);
    return hasVampire || hasZombie;
}

// IA des Zombies : repos 3x3, traque 4s hors vue et retour 2 pas
function updateZombies(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon) return;

    currentLevel.zombies.forEach(z => {
        if (now - z.lastCheck < 500) return;
        z.lastCheck = now;

        const isPlayerHidden = currentLevel.player.pumpkinPowerTime > 0;
        const canSeePlayer = !isPlayerHidden && hasLineOfSight(z.x, z.y, currentLevel.player.x, currentLevel.player.y);

        if (canSeePlayer) {
            z.state = 'chasing';
            z.lastSeenX = currentLevel.player.x;
            z.lastSeenY = currentLevel.player.y;
            z.chaseEndTime = now + 4000;
        } else if (z.state === 'chasing') {
            if (now >= z.chaseEndTime || (z.x === z.lastSeenX && z.y === z.lastSeenY)) {
                z.state = 'returning';
                z.returnSteps = 12;
            }
        }

        let nextX = z.x;
        let nextY = z.y;

        if (z.state === 'idle') {
            if (Math.random() < 0.5) {
                const dirs = [
                    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
                ].sort(() => Math.random() - 0.5);

                for (const d of dirs) {
                    const tx = z.x + d.dx;
                    const ty = z.y + d.dy;
                    if (Math.abs(tx - z.originX) <= 1 && Math.abs(ty - z.originY) <= 1) {
                        if (currentLevel.map[ty] && currentLevel.map[ty][tx] === 0) {
                            nextX = tx;
                            nextY = ty;
                            break;
                        }
                    }
                }
            }
        } else if (z.state === 'chasing' || z.state === 'returning') {
            const targetX = (z.state === 'chasing') ? (canSeePlayer ? currentLevel.player.x : z.lastSeenX) : z.spawnX;
            const targetY = (z.state === 'chasing') ? (canSeePlayer ? currentLevel.player.y : z.lastSeenY) : z.spawnY;

            const dx = targetX - z.x;
            const dy = targetY - z.y;
            const stepX = Math.sign(dx);
            const stepY = Math.sign(dy);

            if (Math.abs(dx) >= Math.abs(dy) && stepX !== 0) {
                if (currentLevel.map[z.y] && currentLevel.map[z.y][z.x + stepX] === 0) {
                    nextX = z.x + stepX;
                } else if (stepY !== 0 && currentLevel.map[z.y + stepY] && currentLevel.map[z.y + stepY][z.x] === 0) {
                    nextY = z.y + stepY;
                }
            } else if (stepY !== 0) {
                if (currentLevel.map[z.y + stepY] && currentLevel.map[z.y + stepY][z.x] === 0) {
                    nextY = z.y + stepY;
                } else if (stepX !== 0 && currentLevel.map[z.y] && currentLevel.map[z.y][z.x + stepX] === 0) {
                    nextX = z.x + stepX;
                }
            }

            if (z.state === 'returning') {
                z.returnSteps--;

                if (nextX === z.spawnX && nextY === z.spawnY) {
                    z.state = 'idle';
                    z.originX = z.spawnX;
                    z.originY = z.spawnY;
                } else if (z.returnSteps <= 0) {
                    z.state = 'idle';
                    z.originX = nextX;
                    z.originY = nextY;
                }
            }
        }

        if (nextX !== z.x || nextY !== z.y) {
            z.fromX = z.x;
            z.fromY = z.y;
            z.stepStartTime = Date.now();
            z.x = nextX;
            z.y = nextY;
        }

        if (z.x === currentLevel.player.x && z.y === currentLevel.player.y) {
            triggerGameOver("Un zombie 🧟‍♂️ t'a dévoré !", "zombie");
        }
    });
}
// =========================================================================
// IA DE L'ARAIGNÉE 🕷️ : SURVEILLANCE 3x3 (AU NID OU EN ATTENTE SUR LA TOILE)
// =========================================================================
function updateSpiders(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.spiders) return;

    const player = currentLevel.player;

    currentLevel.spiders.forEach(s => {
        // 1. Collision directe au contact : le joueur meurt UNIQUEMENT sur la même case
        if (s.x === player.x && s.y === player.y) {
            triggerGameOver("Une araignée 🕷️ t'a dévoré !", "spider");
            return;
        }

        // 2. Surveillance stricte du carré 3x3 :
        // Cas A : Autour de son nid au repos ('idle')
        const inNestZone = Math.abs(player.x - s.spawnX) <= 1 && Math.abs(player.y - s.spawnY) <= 1;
        if (s.state === 'idle' && inNestZone) {
            s.state = 'hunting';
        }

        // Cas B : Autour de la toile UNIQUEMENT lorsqu'elle y patiente ('waiting')
        if (s.state === 'waiting' && s.targetWebX !== null) {
            const inWebZone = Math.abs(player.x - s.targetWebX) <= 1 && Math.abs(player.y - s.targetWebY) <= 1;
            if (inWebZone) {
                s.state = 'hunting';
            }
        }

        // 3. Mode Traque ('hunting') : fonce sur le joueur
        if (s.state === 'hunting') {
            s.targetX = player.x;
            s.targetY = player.y;
        }

        // 4. Arrivée sur la toile : commence la pause d'affût de 3 secondes
        if (s.state === 'investigating' && s.x === s.targetWebX && s.y === s.targetWebY) {
            s.state = 'waiting';
            s.waitEndTime = now + 2000; //araignée attend
        }

        // 5. Fin des 3 secondes sans proie : retour au nid
        if (s.state === 'waiting') {
            if (now >= s.waitEndTime) {
                s.state = 'returning';
                s.targetX = s.spawnX;
                s.targetY = s.spawnY;
            } else {
                return; // Reste immobile en embuscade sur la toile
            }
        }

        // 6. Arrivée au point de départ (nid)
        if (s.state === 'returning' && s.x === s.spawnX && s.y === s.spawnY) {
            s.state = 'idle';
            s.targetWebX = null;
            s.targetWebY = null;
        }

        // 7. Déplacement case par case
        if (now - s.stepStartTime < s.stepDuration) return;

        if (s.state === 'investigating' || s.state === 'returning' || s.state === 'hunting') {
            const dx = s.targetX - s.x;
            const dy = s.targetY - s.y;

            if (dx === 0 && dy === 0) return;

            let stepX = 0;
            let stepY = 0;

            if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
                stepX = Math.sign(dx);
            } else if (dy !== 0) {
                stepY = Math.sign(dy);
            } else if (dx !== 0) {
                stepX = Math.sign(dx);
            }

            const nextX = s.x + stepX;
            const nextY = s.y + stepY;

            if (nextY >= 0 && nextY < currentLevel.rows && nextX >= 0 && nextX < currentLevel.cols) {
                const currentIsWall = (currentLevel.map[s.y] && currentLevel.map[s.y][s.x] === 1);
                const nextIsWall = (currentLevel.map[nextY] && currentLevel.map[nextY][nextX] === 1);

                // Vitesses conservées : 450ms sur mur, 125ms sur sol
                const duration = (currentIsWall || nextIsWall) ? 450 : 125;

                s.fromX = s.x;
                s.fromY = s.y;
                s.x = nextX;
                s.y = nextY;
                s.stepStartTime = now;
                s.stepDuration = duration;

                if (s.x === player.x && s.y === player.y) {
                    triggerGameOver("Une araignée 🕷️ t'a dévoré !", "spider");
                }
            }
        }
    });
}
// =========================================================================
// IA DE LA SORCIÈRE 🧙‍♀️ (VITESSE, COOLDOWN ET PATROUILLE)
// =========================================================================
function updateWitches(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.witches) return;

    const player = currentLevel.player;
    const isPlayerHidden = player.pumpkinPowerTime > 0;

    // Chance que le tir à distance soit un tir énervé
    const WITCH_BURST_CHANCE = 0.05;

    // Vitesse déplacement sorcière : durée de glissement d'une case à l'autre
    const WITCH_STEP_DURATION = 1500; 

    // Temps d'attente sorcière : pause obligatoire sur la case avant de pouvoir rebouger
    const WITCH_STEP_PAUSE = 1500; 

    // Délai minimum entre 2 pas 
    const WITCH_MIN_STEP_DELAY = WITCH_STEP_DURATION + WITCH_STEP_PAUSE; 

    // Cooldown tir sorcière : temps d'attente entre deux tirs de fiole
    const WITCH_COOLDOWN_MS = 2500; 

    // Durée de charge avec l'aura avant de tirer
    const WITCH_CHANNEL_MS = 750; 

    // Fréquence patrouille sorcière : bouge dans sa zone 3x3 toutes les 2 secondes
    const WITCH_PATROL_INTERVAL = 3000; 

    currentLevel.witches.forEach(w => {
        if (!w.lastPatrolTime) w.lastPatrolTime = now;
        if (!w.nextCastTime) w.nextCastTime = 0;

        // Collision physique directe : charge 0.5s puis envoie 10 fioles à 360°
        if (w.x === player.x && w.y === player.y) {
            if (!w.isBurst && now >= (w.nextBurstTime || 0)) {
                w.state = 'channeling';
                w.isBurst = true;
                w.channelEndTime = now + WITCH_CHANNEL_MS; // 0.5s de recharge avec l'aura violette
                return;
            }
        }

        const dist = Math.hypot(player.x - w.x, player.y - w.y);
        const inBox12x12 = Math.abs(player.x - w.x) <= 6 && Math.abs(player.y - w.y) <= 6;
        const canSee = !isPlayerHidden && inBox12x12 && hasLineOfSight(w.x, w.y, player.x, player.y);

        // 1. Canalisation active (immobile)
        if (w.state === 'channeling') {
            if (now >= w.channelEndTime) {
                w.state = 'idle';
                w.nextCastTime = now + WITCH_COOLDOWN_MS;
                w.lastPatrolTime = now;

                if (w.isBurst) {
                    // TIR ÉNERVÉ : Salve de 8 fioles à 360°
                    w.isBurst = false;
                    w.nextBurstTime = now + WITCH_COOLDOWN_MS;

                    for (let i = 0; i < 8; i++) {
                        const angle = (i * 2 * Math.PI) / 8;
                        const dirX = Math.cos(angle);
                        const dirY = Math.sin(angle);

                        currentLevel.potions.push({
                            x: w.x + dirX * 0.6,
                            y: w.y + dirY * 0.6,
                            dirX: dirX,
                            dirY: dirY,
                            angle: angle
                        });
                    }
                } else {
                    // TIR CLASSIQUE : 1 seule fiole vers la position du joueur
                    const currentDist = Math.hypot(player.x - w.x, player.y - w.y) || 1;
                    currentLevel.potions.push({
                        x: w.x,
                        y: w.y,
                        dirX: (player.x - w.x) / currentDist,
                        dirY: (player.y - w.y) / currentDist,
                        angle: 0
                    });
                }
            }
            return;
        }

        // 2. Déclenchement de la canalisation à distance
        if (canSee && now >= w.nextCastTime) {
            w.state = 'channeling';
            w.channelEndTime = now + WITCH_CHANNEL_MS;
            // Tirage aléatoire : active la salve de 8 fioles (et l'aura rouge) selon la probabilité
            w.isBurst = Math.random() < WITCH_BURST_CHANCE;
            return;
        }

        // 3. Cadence de pas : empêche tout déplacement si le délai (300ms + 200ms) n'est pas terminé
        if (w.stepStartTime && (now - w.stepStartTime < WITCH_MIN_STEP_DELAY)) {
            return;
        }

        // 4. KITING : Recule de 1 case si le joueur s'approche à moins de 4 cases
        let didKite = false;
        if (!isPlayerHidden && dist < 4) {
            const candidates = [
                { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
            ].sort((a, b) => {
                const distA = Math.hypot(player.x - (w.x + a.dx), player.y - (w.y + a.dy));
                const distB = Math.hypot(player.x - (w.x + b.dx), player.y - (w.y + b.dy));
                return distB - distA; // Cherche la case la plus éloignée du joueur
            });

            for (const c of candidates) {
                const tx = w.x + c.dx;
                const ty = w.y + c.dy;

                const isInside = ty >= 0 && ty < currentLevel.rows && tx >= 0 && tx < currentLevel.cols;
                const isFloor = isInside && currentLevel.map[ty] && currentLevel.map[ty][tx] === 0;
                const isFarther = Math.hypot(player.x - tx, player.y - ty) > dist;

                if (isFloor && isFarther) {
                    w.fromX = w.x;
                    w.fromY = w.y;
                    w.x = tx;
                    w.y = ty;
                    w.stepStartTime = now; // Lance l'animation de glissement de 0.3s
                    didKite = true;
                    break;
                }
            }
        }

        // 5. PATROUILLE 3x3 : se déplace aléatoirement toutes les 2 secondes
        if (!didKite && (now - w.lastPatrolTime >= WITCH_PATROL_INTERVAL)) {
            w.lastPatrolTime = now;

            const dirs = [
                { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
            ].sort(() => Math.random() - 0.5);

            for (const d of dirs) {
                const tx = w.x + d.dx;
                const ty = w.y + d.dy;

                const inZone = Math.abs(tx - w.spawnX) <= 1 && Math.abs(ty - w.spawnY) <= 1;
                const isInside = ty >= 0 && ty < currentLevel.rows && tx >= 0 && tx < currentLevel.cols;
                const isFloor = isInside && currentLevel.map[ty] && currentLevel.map[ty][tx] === 0;

                if (inZone && isFloor) {
                    w.fromX = w.x;
                    w.fromY = w.y;
                    w.x = tx;
                    w.y = ty;
                    w.stepStartTime = now; // Lance l'animation de glissement de 0.3s
                    break;
                }
            }
        }
    });
}
// =========================================================================
// IA DE LA CHAUVE-SOURIS 🦇 (VOL EN DIAGONALE & REBONDS SUR LES MURS)
// =========================================================================
function updateBats(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.bats) return;

    // Vitesse : 1 déplacement diagonal des chauves-souris 
    const BAT_STEP_MS = 500;

    const isFree = (tx, ty) => {
        return ty >= 0 && ty < currentLevel.rows &&
               tx >= 0 && tx < currentLevel.cols &&
               currentLevel.map[ty] && currentLevel.map[ty][tx] === 0;
    };

    currentLevel.bats.forEach(bat => {
        if (!bat.lastStepTime) bat.lastStepTime = now;
        if (now - bat.lastStepTime < BAT_STEP_MS) return;
        bat.lastStepTime = now;

        let dx = bat.dirX;
        let dy = bat.dirY;

        // Teste les cases adjacentes pour gérer le rebond diagonal (comme sur ton dessin)
        const canX = isFree(bat.x + dx, bat.y);
        const canY = isFree(bat.x, bat.y + dy);
        const canDiag = isFree(bat.x + dx, bat.y + dy);

        if (canDiag && (canX || canY)) {
            // Voie diagonale libre : continue tout droit en diagonale
        } else if (!canX && canY && isFree(bat.x - dx, bat.y + dy)) {
            // Tape un mur vertical (gauche/droite) -> rebondit horizontalement !
            dx = -dx;
        } else if (canX && !canY && isFree(bat.x + dx, bat.y - dy)) {
            // Tape un mur horizontal (haut/bas) -> rebondit verticalement !
            dy = -dy;
        } else {
            // Tape un coin fermé ou un angle -> repart en sens inverse
            if (isFree(bat.x - dx, bat.y - dy)) {
                dx = -dx;
                dy = -dy;
            } else if (isFree(bat.x - dx, bat.y + dy)) {
                dx = -dx;
            } else if (isFree(bat.x + dx, bat.y - dy)) {
                dy = -dy;
            } else {
                return; // Entièrement emmurée
            }
        }

        bat.dirX = dx;
        bat.dirY = dy;
        bat.fromX = bat.x;
        bat.fromY = bat.y;
        bat.x += dx;
        bat.y += dy;
        bat.stepStartTime = now;

        // Collision si la chauve-souris atterrit sur le joueur
        if (bat.x === currentLevel.player.x && bat.y === currentLevel.player.y) {
            triggerGameOver("Une chauve-souris 🦇 t'a percuté en plein vol !", "bat");
        }
    });
}
/* ==========================================================================
   5. DÉPLACEMENTS DU JOUEUR & INTERACTIONS
   ========================================================================== */
function movePlayer(dx, dy) {
    if (!gameStarted || isGameOver || hasWon || !currentLevel) return;
    const now = Date.now();

    const onSlowTile = currentLevel.slowTiles && currentLevel.slowTiles.some(t => t.x === currentLevel.player.x && t.y === currentLevel.player.y);
    const requiredDelay = onSlowTile ? 500 : (currentLevel.player.pumpkinPowerTime > 0 ? 333 : 0);

    if (requiredDelay > 0 && (now - currentLevel.player.moveStartTime < requiredDelay)) {
        return;
    }

    currentLevel.player.fromX = currentLevel.player.x;
    currentLevel.player.fromY = currentLevel.player.y;
    currentLevel.player.moveStartTime = now;

    const newX = currentLevel.player.x + dx;
    const newY = currentLevel.player.y + dy;

    if (currentLevel.map[newY] === undefined || currentLevel.map[newY][newX] === 1) return;

    currentLevel.player.x = newX;
    currentLevel.player.y = newY;

    // Validation du Checkpoint 🏴 -> 🏳️ + Sauvegarde complète (Objets + Monstres)
    if (currentLevel.checkpoints) {
        currentLevel.checkpoints.forEach(cp => {
            if (newX === cp.x && newY === cp.y) {
                cp.activated = true;
                currentLevel.lastCheckpoint = {
                    x: cp.x,
                    y: cp.y,
                    // Objets et bonus
                    coins: JSON.parse(JSON.stringify(currentLevel.coins)),
                    keys: JSON.parse(JSON.stringify(currentLevel.keys)),
                    garlics: JSON.parse(JSON.stringify(currentLevel.garlics)),
                    pumpkins: JSON.parse(JSON.stringify(currentLevel.pumpkins)),
                    garlicPowerTime: currentLevel.player.garlicPowerTime,
                    pumpkinPowerTime: currentLevel.player.pumpkinPowerTime,
                    // Sauvegarde complète des monstres à cet instant précis
                    vampires: JSON.parse(JSON.stringify(currentLevel.vampires)),
                    zombies: JSON.parse(JSON.stringify(currentLevel.zombies)),
                    witches: JSON.parse(JSON.stringify(currentLevel.witches)),
                    spiders: JSON.parse(JSON.stringify(currentLevel.spiders)),
                    bats: JSON.parse(JSON.stringify(currentLevel.bats))
                };
            }
        });
    }
    // 1. Alerte UNIQUEMENT l'araignée la plus proche de la toile 🕸️
    const steppedOnWeb = currentLevel.slowTiles && currentLevel.slowTiles.some(t => t.x === newX && t.y === newY);
    if (steppedOnWeb && currentLevel.spiders && currentLevel.spiders.length > 0) {
        let closestSpider = null;
        let minDistance = Infinity;

        // Recherche de l'araignée la plus proche de la case de toile activée
        currentLevel.spiders.forEach(s => {
            const dist = Math.hypot(s.x - newX, s.y - newY);
            if (dist < minDistance) {
                minDistance = dist;
                closestSpider = s;
            }
        });

        // Seule l'araignée désignée est envoyée en mission
        if (closestSpider) {
            closestSpider.state = 'investigating';
            closestSpider.targetWebX = newX;
            closestSpider.targetWebY = newY;
            closestSpider.targetX = newX;
            closestSpider.targetY = newY;
        }
    }

    // 2. Collision si le joueur fonce directement sur une araignée
    if (currentLevel.spiders && currentLevel.spiders.length > 0) {
        const hitSpider = currentLevel.spiders.some(s => s.x === newX && s.y === newY);
        if (hitSpider) {
            triggerGameOver("Tu as foncé droit sur une araignée 🕷️ !", "spider");
            render();
            return;
        }
    }
    // Bloque le passage si la case visée est un mur ou un émetteur laser
    const hitCannon = currentLevel.cannons && currentLevel.cannons.some(c => c.x === newX && c.y === newY);
    if (hitCannon || currentLevel.map[newY] === undefined || currentLevel.map[newY][newX] === 1) return;

    // Collecte Citrouille 🎃
    currentLevel.pumpkins.forEach(p => {
        if (!p.collected && newX === p.x && newY === p.y) {
            p.collected = true;
            currentLevel.player.pumpkinPowerTime = 10;
        }
    });

    // Collision directe Zombie
    const hitZombie = currentLevel.zombies.some(z => z.x === newX && z.y === newY);
    if (hitZombie) {
        triggerGameOver("Tu as foncé droit sur un zombie 🧟‍♂️ !", "zombie");
        render();
        return;
    }

    // Gestion de la téléportation en premier
    handleTeleport(currentLevel.player.x, currentLevel.player.y);

    // Réveil immédiat de tous les vampires qui ont une ligne de vue dégagée
    currentLevel.vampires.forEach(v => {
        if (!v.alive) return;
        if (hasLineOfSight(v.x, v.y, currentLevel.player.x, currentLevel.player.y)) {
            v.chasing = true;
            v.lastSeenX = currentLevel.player.x;
            v.lastSeenY = currentLevel.player.y;
            v.alertTimer = 3;
        }
    });

    // Réveil immédiat des zombies si non déguisé
    if (currentLevel.player.pumpkinPowerTime <= 0) {
        currentLevel.zombies.forEach(z => {
            if (hasLineOfSight(z.x, z.y, currentLevel.player.x, currentLevel.player.y)) {
                z.state = 'chasing';
                z.lastSeenX = currentLevel.player.x;
                z.lastSeenY = currentLevel.player.y;
                z.chaseEndTime = Date.now() + 4000;
            }
        });
    }

    // Collecte Pièces
    currentLevel.coins.forEach(c => {
        if (!c.collected && newX === c.x && newY === c.y) {
            c.collected = true;
            updateStatsUI();
        }
    });

    // Collecte Clés
    currentLevel.keys.forEach(k => {
        if (!k.collected && newX === k.x && newY === k.y) {
            k.collected = true;
            updateStatsUI();
        }
    });

    // Collecte Ail 🧄
    currentLevel.garlics.forEach(g => {
        if (!g.collected && newX === g.x && newY === g.y) {
            g.collected = true;
            currentLevel.player.garlicPowerTime = 6;
            updateStatsUI();
        }
    });

    // Collision Flammes
    if (currentLevel.trapsActive) {
        const hitTrap = currentLevel.traps.some(t => t.x === newX && t.y === newY);
        if (hitTrap) {
            triggerGameOver("Aïe ! Tu as marché dans les flammes !");
            render();
            return;
        }
    }

    // Collision avec une flaque d'acide toxique au sol
    if (currentLevel.acidPuddles) {
        const hitPuddle = currentLevel.acidPuddles.some(p => p.x === newX && p.y === newY);
        if (hitPuddle) {
            triggerGameOver("Aïe ! Tu as marché dans une flaque d'acide toxique 🧪 !", "witch");
            render();
            return;
        }
    }

    // Collision Fantômes
    const hitGhost = currentLevel.ghosts.some(m => m.x === newX && m.y === newY);
    if (hitGhost) {
        triggerGameOver("Un fantôme t'a barré la route !", "ghost");
        render();
        return;
    }

    // Collision Chauves-souris 🦇
    if (currentLevel.bats) {
        const hitBat = currentLevel.bats.some(b => b.x === newX && b.y === newY);
        if (hitBat) {
            triggerGameOver("Tu as foncé dans une chauve-souris 🦇 !", "bat");
            render();
            return;
        }
    }

    // Collision Vampires
    currentLevel.vampires.forEach(v => {
        if (v.alive && v.x === newX && v.y === newY) {
            if (currentLevel.player.garlicPowerTime > 0) {
                v.alive = false;
            } else {
                triggerGameOver("Un vampire t'a mordu !", "vampire");
            }
        }
    });

    // Collision Lasers
    const hitBomb = currentLevel.bombs.some(b => Math.hypot(b.x - newX, b.y - newY) < 0.55);
    if (hitBomb) {
        triggerGameOver("Zzzap ! Tu as percuté un rayon laser !");
        render();
        return;
    }

    // Arrivée Porte 🚪
    if (newX === currentLevel.exit.x && newY === currentLevel.exit.y) {
        const remainingKeys = currentLevel.keys.filter(k => !k.collected).length;
        if (remainingKeys > 0) {
            overlayMsg.textContent = `La porte est verrouillée ! Trouve d'abord les ${remainingKeys} clé(s) manquante(s) 🔑 !`;
            overlayTitle.textContent = "🔒 Porte Verrouillée";
            overlayTitle.style.color = "#ffaa00";
            overlayBtnReplay.textContent = "Continuer";
            overlayBtnNext.style.display = "none";
            overlay.style.display = "flex";
            return;
        } else {
            triggerVictory();
        }
    }

    render();
}

function handleTeleport(px, py) {
    const now = Date.now();
    if (now - currentLevel.lastTpTime < 600) return;

    const triggerTpEffect = (destX, destY) => {
        currentLevel.player.x = destX;
        currentLevel.player.y = destY;
        currentLevel.player.fromX = destX;
        currentLevel.player.fromY = destY;
        currentLevel.lastTpTime = now;

        // Enregistre l'animation de téléportation (départ -> arrivée)
        currentLevel.tpEffect = {
            fromX: px,
            fromY: py,
            toX: destX,
            toY: destY,
            startTime: now,
            duration: 850
        };
    };

    for (const [id, points] of Object.entries(currentLevel.teleporters)) {
        if (Array.isArray(points) && points.length >= 2) {
            const p0 = points[0];
            const p1 = points[1];

            if (px === p0.x && py === p0.y) {
                triggerTpEffect(p1.x, p1.y);
                return;
            } else if (px === p1.x && py === p1.y) {
                triggerTpEffect(p0.x, p0.y);
                return;
            }
        }
    }

    for (const [id, pair] of Object.entries(currentLevel.teleporters)) {
        if (pair && pair.in && pair.out) {
            if (px === pair.in.x && py === pair.in.y) {
                triggerTpEffect(pair.out.x, pair.out.y);
                return;
            }
        }
    }
}

/* ==========================================================================
   6. GAME OVER & VICTOIRE
   ========================================================================== */
function triggerGameOver(msg, deathType = 'default') {
    if (window.ScreamerModule) {
        window.ScreamerModule.trigger(deathType, 1000);
    }

    isGameOver = true;
    if (overlayTitle) {
        overlayTitle.textContent = "💀 Game Over !";
        overlayTitle.style.color = "#ff4444";
    }
    if (overlayMsg) overlayMsg.textContent = msg;

    // Si un checkpoint a été validé, proposer de reprendre depuis celui-ci
    if (overlayBtnReplay) {
        overlayBtnReplay.textContent = (currentLevel && currentLevel.lastCheckpoint) 
            ? "Reprendre au Checkpoint 🏳️" 
            : "Réessayer";
    }

    if (overlayBtnNext) overlayBtnNext.style.display = "none";
    if (overlay) overlay.style.display = "flex";
}

function triggerVictory() {
    hasWon = true;
    if (overlayTitle) {
        overlayTitle.textContent = "🎉 Niveau Terminé !";
        overlayTitle.style.color = "#28a745";
    }

    let cumulativeGot = 0;
    let cumulativeTotal = 0;
    for (let i = 0; i <= currentLevelIndex; i++) {
        if (levelCoinHistory[i]) {
            cumulativeGot += levelCoinHistory[i].got;
            cumulativeTotal += levelCoinHistory[i].total;
        }
    }
    const bonusText = cumulativeTotal > 0 ? ` (Pièces : ${cumulativeGot}/${cumulativeTotal})` : "";

    if (currentLevelIndex < window.LEVELS.length - 1) {
        if (overlayMsg) overlayMsg.textContent = `Bravo, tu as franchi la porte du ${currentLevel.name} !${bonusText}`;
        if (overlayBtnReplay) overlayBtnReplay.textContent = "Rejouer";
        if (overlayBtnNext) overlayBtnNext.style.display = "inline-block";
    } else {
        if (overlayMsg) overlayMsg.textContent = `Félicitations, tu as terminé tous les niveaux du jeu !${bonusText}`;
        if (overlayBtnReplay) overlayBtnReplay.textContent = "Recommencer le jeu";
        if (overlayBtnNext) overlayBtnNext.style.display = "none";
    }

    if (overlay) overlay.style.display = "flex";
}

/* ==========================================================================
   7. MOTEUR DE DESSIN CANVAS
   ========================================================================== */
function render() {
    if (!ctx || !currentLevel || cellSize <= 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const isLarge = currentLevel.cols >= 20 || currentLevel.rows >= 20; // Aligné sur 20 comme dans resizeGame

    let minX = 0, maxX = currentLevel.cols - 1;
    let minY = 0, maxY = currentLevel.rows - 1;

    if (isLarge) {
        ctx.save();

        const playerScreenTargetX = currentLevel.player.x * cellSize + cellSize / 2;
        const playerScreenTargetY = currentLevel.player.y * cellSize + cellSize / 2;
        const targetCamX = Math.min(0, Math.max(canvas.width - currentLevel.cols * cellSize, canvas.width / 2 - playerScreenTargetX));
        const targetCamY = Math.min(0, Math.max(canvas.height - currentLevel.rows * cellSize, canvas.height / 2 - playerScreenTargetY));

        const isJustTeleported = (Date.now() - (currentLevel.lastTpTime || 0)) < 600;
        const camLerp = isJustTeleported ? 0.35 : 0.12;

        cameraX += (targetCamX - cameraX) * camLerp;
        cameraY += (targetCamY - cameraY) * camLerp;

        ctx.translate(cameraX, cameraY);

        // --- OPTIMISATION CAMÉRA (Fonctionne même dans les coins !) ---
        // Calcule exactement les cases affichées à l'écran par la caméra + 3 cases de marge
        const MARGIN = 3;
        minX = Math.max(0, Math.floor((-cameraX) / cellSize) - MARGIN);
        maxX = Math.min(currentLevel.cols - 1, Math.ceil((-cameraX + canvas.width) / cellSize) + MARGIN);
        minY = Math.max(0, Math.floor((-cameraY) / cellSize) - MARGIN);
        maxY = Math.min(currentLevel.rows - 1, Math.ceil((-cameraY + canvas.height) / cellSize) + MARGIN);
    }

    // Mémorise les bornes exactes de la caméra pour drawEmoji et drawPortal
    currentLevel.viewBounds = { minX, maxX, minY, maxY };

    // Fonction rapide pour savoir si un objet/monstre est dans le champ de la caméra
    const isVisible = (x, y) => (x >= minX && x <= maxX && y >= minY && y <= maxY);

    // 1. Fond et Murs (ne dessine QUE ce que la caméra voit + marge)
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const px = x * cellSize;
            const py = y * cellSize;

            if (currentLevel.map[y][x] === 1) {
                ctx.fillStyle = "#2c303c";
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = "#1e222b";
                ctx.lineWidth = 1;
                ctx.strokeRect(px, py, cellSize, cellSize);
            } else {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(px, py, cellSize, cellSize);
                ctx.strokeStyle = "#e5e7eb";
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, cellSize, cellSize);
            }
        }
    }


    // 2. Émetteurs laser fixes (L) - Rendu Croix Rouge ➕
    currentLevel.cannons.forEach(c => {
        const cx = c.x * cellSize + cellSize / 2;
        const cy = c.y * cellSize + cellSize / 2;
        const s = cellSize * 0.32;
        const t = Math.max(3, cellSize * 0.12);

        ctx.fillStyle = "#22252e";
        ctx.fillRect(c.x * cellSize + 2, c.y * cellSize + 2, cellSize - 4, cellSize - 4);

        ctx.fillStyle = "#ff1133";
        ctx.fillRect(cx - s, cy - t/2, s * 2, t);
        ctx.fillRect(cx - t/2, cy - s, t, s * 2);
    });

    // 3. Téléporteurs 🌀
    for (const [id, points] of Object.entries(currentLevel.teleporters)) {
        if (Array.isArray(points)) {
            points.forEach(p => drawPortal(p.x, p.y));
        } else if (points.in && points.out) {
            drawPortal(points.in.x, points.in.y);
            drawPortal(points.out.x, points.out.y);
        }
    }

    // 4. Flammes / Feu (X) - Actif: 🔥 / Inactif: Cendres
    currentLevel.traps.forEach(t => {
        const tx = t.x * cellSize + cellSize / 2;
        const ty = t.y * cellSize + cellSize / 2;

        if (currentLevel.trapsActive) {
            drawEmoji(t.x, t.y, "🔥", 0.78);
        } else {
            ctx.fillStyle = "#555b6e";
            const r = Math.max(2, cellSize * 0.07);
            ctx.beginPath();
            ctx.arc(tx - cellSize * 0.18, ty + cellSize * 0.1, r, 0, Math.PI * 2);
            ctx.arc(tx, ty - cellSize * 0.05, r * 1.2, 0, Math.PI * 2);
            ctx.arc(tx + cellSize * 0.18, ty + cellSize * 0.1, r, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 5. Pièces 🪙
    currentLevel.coins.forEach(c => {
        if (!c.collected) {
            drawEmoji(c.x, c.y, "🪙", 0.68);
        }
    });

    // 6. Clés 🔑
    currentLevel.keys.forEach(k => {
        if (!k.collected) {
            drawEmoji(k.x, k.y, "🔑", 0.75);
        }
    });

    // 7. Ail 🧄
    currentLevel.garlics.forEach(g => {
        if (!g.collected) {
            drawEmoji(g.x, g.y, "🧄", 0.75);
        }
    });

    // 8. Citrouilles 🎃 (au sol)
    const now = Date.now();
    const pumpkinFloat = Math.sin(now / 220) * (cellSize * 0.08);
    currentLevel.pumpkins.forEach(p => {
        if (!p.collected) {
            const cx = p.x * cellSize + cellSize / 2;
            const cy = p.y * cellSize + cellSize / 2 + pumpkinFloat;
            ctx.font = `${Math.floor(cellSize * 0.76)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🎃", cx, cy);
        }
    });

    // 9. Porte de sortie 🚪 / 🔒
    const hasRemainingKeys = currentLevel.keys.some(k => !k.collected);
    const doorEmoji = hasRemainingKeys ? "🔒" : "🚪";
    drawEmoji(currentLevel.exit.x, currentLevel.exit.y, doorEmoji, 0.78);

    // 10. Rayons Lasers en vol ➖
    currentLevel.bombs.forEach(b => {
        const cx = b.x * cellSize + cellSize / 2;
        const cy = b.y * cellSize + cellSize / 2;
        const isHoriz = (b.dirX !== 0);

        ctx.fillStyle = "#ff1122";

        if (isHoriz) {
            const lw = cellSize * 0.75;
            const lh = Math.max(4, cellSize * 0.18);
            ctx.fillRect(cx - lw/2, cy - lh/2, lw, lh);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(cx - lw/2 + 2, cy - lh/4, lw - 4, lh/2);
        } else {
            const lw = Math.max(4, cellSize * 0.18);
            const lh = cellSize * 0.75;
            ctx.fillRect(cx - lw/2, cy - lh/2, lw, lh);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(cx - lw/4, cy - lh/2 + 2, lw/2, lh - 4);
        }
    });

    // 11. Fantômes 👻 (Glissement fluide 0.2s)
    const moveDuration = 200;
    currentLevel.ghosts.forEach(m => {
        let currentX = m.x;
        let currentY = m.y;

        if (m.stepStartTime) {
            const elapsed = now - m.stepStartTime;
            if (elapsed < moveDuration) {
                const t = elapsed / moveDuration;
                currentX = m.fromX + (m.x - m.fromX) * t;
                currentY = m.fromY + (m.y - m.fromY) * t;
            }
        }

        const mx = currentX * cellSize + cellSize / 2;
        const my = currentY * cellSize + cellSize / 2;

        ctx.save();
        ctx.translate(mx, my);

        if (m.dirX === -1) {
            ctx.scale(-1, 1);
        }

        ctx.font = `${Math.floor(cellSize * 0.78)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👻", 0, 0);

        ctx.restore();
    });

    // 12. Vampires 🧛 (Glissement fluide 0.2s)
    currentLevel.vampires.forEach(v => {
        if (!v.alive) return;

        let currentX = v.x;
        let currentY = v.y;

        if (v.stepStartTime) {
            const elapsed = now - v.stepStartTime;
            if (elapsed < moveDuration) {
                const t = elapsed / moveDuration;
                currentX = v.fromX + (v.x - v.fromX) * t;
                currentY = v.fromY + (v.y - v.fromY) * t;
            }
        }

        drawEmoji(currentX, currentY, "🧛", 0.78);
    });

    // 13. Zombies 🧟‍♂️ (Glissement fluide 0.2s)
    currentLevel.zombies.forEach(z => {
        let zx = z.x;
        let zy = z.y;
        if (z.stepStartTime) {
            const elapsed = now - z.stepStartTime;
            if (elapsed < moveDuration) {
                const t = elapsed / moveDuration;
                zx = z.fromX + (z.x - z.fromX) * t;
                zy = z.fromY + (z.y - z.fromY) * t;
            }
        }
        drawEmoji(zx, zy, "🧟‍♂️", 0.78);
    });

    // 13b. Chauves-souris 🦇 (Rotation par paliers de 90° : 0°, 90°, 180°, 270°)
    if (currentLevel.bats) {
        const batMoveDuration = 500;
        currentLevel.bats.forEach(b => {
            if (!isVisible(b.x, b.y)) return;

            let bx = b.x;
            let by = b.y;
            if (b.stepStartTime) {
                const elapsed = now - b.stepStartTime;
                if (elapsed < batMoveDuration) {
                    const t = elapsed / batMoveDuration;
                    bx = b.fromX + (b.x - b.fromX) * t;
                    by = b.fromY + (b.y - b.fromY) * t;
                }
            }

            const px = bx * cellSize + cellSize / 2;
            const py = by * cellSize + cellSize / 2;

            ctx.save();
            ctx.translate(px, py);

            // Angle selon la direction (0° au départ vers haut-gauche)
            let angle = 0;
            if (b.dirX === -1 && b.dirY === -1) angle = 0;               // 0°   (Haut-Gauche)
            else if (b.dirX === 1 && b.dirY === -1) angle = Math.PI / 2;  // 90°  (Haut-Droite)
            else if (b.dirX === 1 && b.dirY === 1) angle = Math.PI;       // 180° (Bas-Droite)
            else if (b.dirX === -1 && b.dirY === 1) angle = -Math.PI / 2; // 270° (Bas-Gauche)

            ctx.rotate(angle);

            // Battement d'ailes continu
            const wingFlap = 1 + Math.sin(now / 60) * 0.12;
            ctx.scale(wingFlap, 1 / wingFlap);

            ctx.font = `${Math.floor(cellSize * 0.80)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🦇", 0, 0);
            ctx.restore();
        });
    }

    // Dessin des cases lentes 🕸️
    if (currentLevel.slowTiles) {
        currentLevel.slowTiles.forEach(t => {
            drawEmoji(t.x, t.y, "🕸️", 0.95);
        });
    }
    // Araignées 🕷️ (Animation directionnelle de course, d'escalade et de veille)
    if (currentLevel.spiders) {
        currentLevel.spiders.forEach(s => {
            let sx = s.x;
            let sy = s.y;
            let isMoving = false;
            let moveProgress = 0;

            const dirX = s.x - s.fromX;
            const dirY = s.y - s.fromY;

            if (s.stepStartTime && s.stepDuration) {
                const elapsed = now - s.stepStartTime;
                if (elapsed < s.stepDuration) {
                    isMoving = true;
                    moveProgress = elapsed / s.stepDuration;
                    
                    // Progression fluide avec légère saccade de pattes
                    sx = s.fromX + dirX * moveProgress;
                    sy = s.fromY + dirY * moveProgress;
                }
            }

            let px = sx * cellSize + cellSize / 2;
            let py = sy * cellSize + cellSize / 2;

            const isOnWall = currentLevel.map[Math.round(sy)] && currentLevel.map[Math.round(sy)][Math.round(sx)] === 1;

            ctx.save();
            ctx.translate(px, py);

            // 1. Orientation vers la direction de marche
            let angle = 0;
            if (dirX > 0) angle = Math.PI / 2;        // Vers la droite
            else if (dirX < 0) angle = -Math.PI / 2;  // Vers la gauche
            else if (dirY > 0) angle = Math.PI;       // Vers le bas
            else if (dirY < 0) angle = 0;             // Vers le haut

            ctx.rotate(angle);

            // 2. Animation dynamique des pattes en marche (oscillation + tremblement latéral)
            if (isMoving) {
                const stepWiggle = Math.sin(moveProgress * Math.PI * 6) * 0.15; // Frétillement
                const sideShift = Math.cos(moveProgress * Math.PI * 6) * (cellSize * 0.04);
                ctx.translate(sideShift, 0);
                ctx.rotate(stepWiggle);
            }

            // 3. Échelle selon l'état (escalade ou embuscade)
            let scaleMultiplier = 1;
            if (s.state === 'waiting') {
                scaleMultiplier = 1 + Math.sin(now / 110) * 0.14; // Respiration d'affût
            } else if (isOnWall) {
                scaleMultiplier = 1.18; // Grossissement en escalade sur le mur
            }

            const spiderSize = Math.floor(cellSize * 0.82 * scaleMultiplier);
            ctx.font = `${spiderSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🕷️", 0, 0);

            ctx.restore();
        });
    }
    
    // --- 14. SORCIÈRES 🧙‍♀️ & CANALISATION MAGIQUE ---
    if (currentLevel.witches) {
        currentLevel.witches.forEach(w => {
            let wx = w.x;
            let wy = w.y;
            // Glissement fluide calibré à 0.3s
            if (w.stepStartTime) {
                const elapsed = now - w.stepStartTime;
                if (elapsed < 1500) {
                    const t = elapsed / 1500;
                    wx = w.fromX + (w.x - w.fromX) * t;
                    wy = w.fromY + (w.y - w.fromY) * t;
                }
            }

            const cx = wx * cellSize + cellSize / 2;
            const cy = wy * cellSize + cellSize / 2;

            // Animation de charge magique : AURA ROUGE pour la salve des 10 fioles, sinon VIOLETTE
            if (w.state === 'channeling') {
                const chargeProgress = 1 - Math.max(0, (w.channelEndTime - now) / 750);
                const pulseR = (cellSize * 0.45) + Math.sin(now / 40) * (cellSize * 0.08);

                // Choix des couleurs : Rouge si w.isBurst est actif, sinon Violet standard
                const isRed = w.isBurst; 
                const fillColor = isRed 
                    ? `rgba(239, 35, 60, ${0.30 + chargeProgress * 0.50})`   // Fond rouge sang
                    : `rgba(168, 85, 247, ${0.25 + chargeProgress * 0.45})`; // Fond violet
                const strokeColor = isRed ? "#ff1a40" : "#00f9e0";           // Contour
                const particleColor = isRed ? "#eeff00" : "#0069fd";         // Particules

                ctx.save();
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 2 + chargeProgress * 3;
                ctx.stroke();

                for (let i = 0; i < 4; i++) {
                    const ang = (now / 150) + (i * Math.PI / 2);
                    const px = cx + Math.cos(ang) * (cellSize * 0.38);
                    const py = cy + Math.sin(ang) * (cellSize * 0.38);
                    ctx.fillStyle = particleColor;
                    ctx.beginPath();
                    ctx.arc(px, py, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            drawEmoji(wx, wy, "🧙‍♀️", 0.82);
        });
    }

    // --- FLAQUES TOXIQUES D'ACIDE AU SOL 🫟 (DURÉE : 3 SECONDES) ---
    if (currentLevel.acidPuddles) {
        currentLevel.acidPuddles.forEach(pdl => {
            const px = pdl.x * cellSize + cellSize / 2;
            const py = pdl.y * cellSize + cellSize / 2;
            const timeLeft = pdl.expireTime - now;
            const lifeRatio = Math.max(0, timeLeft / 3000);

            if (lifeRatio <= 0) return;

            ctx.save();

            // 1. Mare toxique verte bouillonnante (toujours visible)
            const boil = Math.sin(now / 80) * (cellSize * 0.06);
            const r = (cellSize * 0.38 + boil) * Math.min(1, lifeRatio * 1.4);

            ctx.fillStyle = `rgba(57, 255, 20, ${0.45 * lifeRatio})`;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();

            // 2. Bordure violette
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.8 * lifeRatio})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // 3. Émoji de la tache 🫟
            ctx.font = `${Math.floor(cellSize * 0.80)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.globalAlpha = Math.min(1, lifeRatio * 1.5);
            ctx.fillText("🫟", px, py);

            ctx.restore();
        });
    }

    // --- 15. FIOLES EN VOL 🧪 (AVEC ROTATION FLUIDE) ---
    if (currentLevel.potions) {
        currentLevel.potions.forEach(p => {
            const px = p.x * cellSize + cellSize / 2;
            const py = p.y * cellSize + cellSize / 2;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.angle || 0); // Rotation continue de la fiole

            // Traînée de poison luminescente
            ctx.shadowColor = "#26ff00";

            ctx.font = `${Math.floor(cellSize * 0.72)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧪", 0, 0);

            ctx.restore();
        });
    }

    // --- 16. ANIMATION DE BRIS DE FIOLE (SPLASH ACIDE VERT & VIOLET) ---
    if (currentLevel.potionSplashes) {
        currentLevel.potionSplashes.forEach(sp => {
            const elapsed = now - sp.startTime;
            const progress = elapsed / sp.duration;
            const alpha = 1 - progress;
            const radius = (cellSize * 0.25) + (progress * cellSize * 0.65);

            const sx = sp.x * cellSize + cellSize / 2;
            const sy = sp.y * cellSize + cellSize / 2;

            ctx.save();
            // Éclaboussures d'acide
            ctx.fillStyle = `rgba(57, 255, 20, ${alpha * 0.7})`;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });
    }

    // 14. Joueur (Humain ou Déguisement Citrouille avec glissement à 0.34s)
    let playerGridX = currentLevel.player.x;
    let playerGridY = currentLevel.player.y;

    if (currentLevel.player.pumpkinPowerTime > 0 && currentLevel.player.moveStartTime) {
        const elapsed = now - currentLevel.player.moveStartTime;
        if (elapsed < 340) {
            const t = elapsed / 340;
            playerGridX = currentLevel.player.fromX + (currentLevel.player.x - currentLevel.player.fromX) * t;
            playerGridY = currentLevel.player.fromY + (currentLevel.player.y - currentLevel.player.fromY) * t;
        }
    }

    // --- CHECKPOINTS : 🏴 (non validé) / 🏳️ (validé) ---
    if (currentLevel.checkpoints) {
        currentLevel.checkpoints.forEach(cp => {
            const flagEmoji = cp.activated ? "🏳️" : "🏴";
            drawEmoji(cp.x, cp.y, flagEmoji, 0.78);
        });
    }

    const playerScreenX = playerGridX * cellSize + cellSize / 2;
    const playerScreenY = playerGridY * cellSize + cellSize / 2;

    if (currentLevel.player.garlicPowerTime > 0) {
        let showAura = true;
        if (currentLevel.player.garlicPowerTime <= 2) {
            showAura = Math.floor(now / 150) % 2 === 0;
        }

        if (showAura) {
            ctx.fillStyle = "rgba(40, 167, 69, 0.35)";
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, cellSize * 0.45, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#28a745";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    const avatarToDraw = currentLevel.player.pumpkinPowerTime > 0 ? "🎃" : currentLevel.player.avatar;
    drawEmoji(playerGridX, playerGridY, avatarToDraw, 0.82);

    // --- ANIMATION VISUELLE DE TÉLÉPORTATION 🌀 ---
    if (currentLevel.tpEffect) {
        const tp = currentLevel.tpEffect;
        const elapsed = now - tp.startTime;

        if (elapsed < tp.duration) {
            const progress = elapsed / tp.duration; // 0 -> 1
            const alpha = 1 - progress;

            // 1. Anneau qui se referme sur le portail de départ
            const departX = tp.fromX * cellSize + cellSize / 2;
            const departY = tp.fromY * cellSize + cellSize / 2;
            ctx.save();
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.8})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(departX, departY, cellSize * 0.65 * (1 - progress), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // 2. Onde de choc + faisceau sur le joueur à l'arrivée
            ctx.save();

            // Faisceau lumineux vertical qui s'estompe
            const beamGrad = ctx.createLinearGradient(playerScreenX, playerScreenY - cellSize * 1.4, playerScreenX, playerScreenY + cellSize * 0.4);
            beamGrad.addColorStop(0, "rgba(0, 245, 212, 0)");
            beamGrad.addColorStop(0.5, `rgba(0, 245, 212, ${alpha * 0.45})`);
            beamGrad.addColorStop(1, "rgba(0, 245, 212, 0)");
            ctx.fillStyle = beamGrad;
            ctx.fillRect(playerScreenX - cellSize * 0.35, playerScreenY - cellSize * 1.4, cellSize * 0.7, cellSize * 1.8);

            // Grand anneau extérieur cyan (attire immédiatement le regard)
            const outerRadius = cellSize * (0.3 + progress * 1.6);
            ctx.strokeStyle = `rgba(0, 245, 212, ${alpha})`;
            ctx.lineWidth = Math.max(1.5, 4 * alpha);
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, outerRadius, 0, Math.PI * 2);
            ctx.stroke();

            // Second anneau intérieur orange/doré
            const innerRadius = cellSize * (0.2 + progress * 0.95);
            ctx.strokeStyle = `rgba(255, 158, 0, ${alpha})`;
            ctx.lineWidth = Math.max(1, 3 * alpha);
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, innerRadius, 0, Math.PI * 2);
            ctx.stroke();

            // 6 étincelles magiques qui tournoient autour du personnage
            for (let i = 0; i < 6; i++) {
                const angle = (progress * Math.PI * 3) + (i * Math.PI / 3);
                const orbitR = cellSize * (0.45 + Math.sin(progress * Math.PI) * 0.35);
                const sx = playerScreenX + Math.cos(angle) * orbitR;
                const sy = playerScreenY + Math.sin(angle) * orbitR;

                ctx.fillStyle = (i % 2 === 0) ? `rgba(0, 245, 212, ${alpha})` : `rgba(255, 209, 102, ${alpha})`;
                ctx.beginPath();
                ctx.arc(sx, sy, Math.max(2, cellSize * 0.08 * alpha), 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        } else {
            currentLevel.tpEffect = null;
        }
    }

    if (isLarge) {
        ctx.restore();
    }
}

function drawEmoji(gx, gy, emoji, scale) {
    // Vérifie si l'émoji est dans le rectangle visible de la caméra (même dans les coins)
    if (currentLevel && currentLevel.viewBounds) {
        const b = currentLevel.viewBounds;
        if (gx < b.minX || gx > b.maxX || gy < b.minY || gy > b.maxY) return;
    }

    const cx = gx * cellSize + cellSize / 2;
    const cy = gy * cellSize + cellSize / 2;
    ctx.font = `${Math.floor(cellSize * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, cx, cy);
}

function drawPortal(gx, gy) {
    if (currentLevel && currentLevel.viewBounds) {
        const b = currentLevel.viewBounds;
        if (gx < b.minX || gx > b.maxX || gy < b.minY || gy > b.maxY) return;
    }

    const cx = gx * cellSize + cellSize / 2;
    const cy = gy * cellSize + cellSize / 2;
    ctx.font = `${Math.floor(cellSize * 0.78)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌀", cx, cy);
}

/* ==========================================================================
   8. ÉCOUTEURS D'ÉVÉNEMENTS (CLAVIER & MOBILE)
   ========================================================================= */
window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'z': case 'Z': movePlayer(0, -1); break;
        case 'ArrowDown': case 's': case 'S': movePlayer(0, 1); break;
        case 'ArrowLeft': case 'q': case 'Q': movePlayer(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': movePlayer(1, 0); break;
    }
});

let dpadInitialTimeout = null;
let dpadRepeatInterval = null;

function stopDpadHold() {
    if (dpadInitialTimeout) {
        clearTimeout(dpadInitialTimeout);
        dpadInitialTimeout = null;
    }
    if (dpadRepeatInterval) {
        clearInterval(dpadRepeatInterval);
        dpadRepeatInterval = null;
    }
}

document.querySelectorAll('.dpad-btn').forEach(btn => {
    const dir = btn.getAttribute('data-dir');

    const stepMove = () => {
        if (dir === 'up') movePlayer(0, -1);
        if (dir === 'down') movePlayer(0, 1);
        if (dir === 'left') movePlayer(-1, 0);
        if (dir === 'right') movePlayer(1, 0);
    };

    const startHold = (e) => {
        if (e.cancelable) e.preventDefault(); // Bloque le double clic fantôme sur mobile
        stopDpadHold();

        // 1. Premier pas immédiat (1 clic = 1 seule case garantie)
        stepMove();

        // 2. Comme sur clavier PC : attend 220ms avant d'activer le sprint continu (toutes les 55ms)
        dpadInitialTimeout = setTimeout(() => {
            dpadRepeatInterval = setInterval(stepMove, 55);
        }, 220);
    };

    // Événements tactiles (téléphone)
    btn.addEventListener('touchstart', startHold, { passive: false });
    btn.addEventListener('touchend', stopDpadHold);
    btn.addEventListener('touchcancel', stopDpadHold);

    // Événements souris (uniquement si ce n'est pas un écran tactile pour éviter le doublon)
    btn.addEventListener('mousedown', (e) => {
        if ('ontouchstart' in window) return;
        startHold(e);
    });
    btn.addEventListener('mouseup', stopDpadHold);
    btn.addEventListener('mouseleave', stopDpadHold);

    // Empêche le menu contextuel d'apparaître quand on reste appuyé longtemps sur mobile
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

if (canvas) {
    let touchStartX = 0;
    let touchStartY = 0;
    canvas.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
            if (Math.abs(dx) > Math.abs(dy)) {
                movePlayer(dx > 0 ? 1 : -1, 0);
            } else {
                movePlayer(0, dy > 0 ? 1 : -1);
            }
        }
    }, { passive: true });
}

if (resetBtn) resetBtn.addEventListener('click', () => loadLevel(currentLevelIndex));
if (overlayBtnReplay) {
    overlayBtnReplay.addEventListener('click', () => {
        // S'il y a un checkpoint actif, on replace le joueur dessus et on relance le jeu
        if (currentLevel && currentLevel.lastCheckpoint) {
            respawnAtCheckpoint();
        } else {
            loadLevel(currentLevelIndex);
        }
    });
}

// Fonction de réapparition au checkpoint avec restauration des objets ET des monstres
function respawnAtCheckpoint() {
    if (!currentLevel || !currentLevel.lastCheckpoint) return;
    const snap = currentLevel.lastCheckpoint;
    const now = Date.now();

    // 1. Replacer le joueur sur le checkpoint avec ses bonus du moment
    currentLevel.player.x = snap.x;
    currentLevel.player.y = snap.y;
    currentLevel.player.fromX = snap.x;
    currentLevel.player.fromY = snap.y;
    currentLevel.player.moveStartTime = now;
    currentLevel.player.garlicPowerTime = snap.garlicPowerTime || 0;
    currentLevel.player.pumpkinPowerTime = snap.pumpkinPowerTime || 0;

    // 2. Restaurer l'état des pièces, clés et bonus
    if (snap.coins) currentLevel.coins = JSON.parse(JSON.stringify(snap.coins));
    if (snap.keys) currentLevel.keys = JSON.parse(JSON.stringify(snap.keys));
    if (snap.garlics) currentLevel.garlics = JSON.parse(JSON.stringify(snap.garlics));
    if (snap.pumpkins) currentLevel.pumpkins = JSON.parse(JSON.stringify(snap.pumpkins));

    // 3. Restaurer les Vampires (position exacte au moment du checkpoint + arrêt de la traque)
    if (snap.vampires) {
        currentLevel.vampires = JSON.parse(JSON.stringify(snap.vampires));
        currentLevel.vampires.forEach(v => {
            v.fromX = v.x;
            v.fromY = v.y;
            v.stepStartTime = 0;
            v.chasing = false;
            v.alertTimer = 0;
        });
    }

    // 4. Restaurer les Zombies (position et zone de ronde au moment du checkpoint + repos)
    if (snap.zombies) {
        currentLevel.zombies = JSON.parse(JSON.stringify(snap.zombies));
        currentLevel.zombies.forEach(z => {
            z.fromX = z.x;
            z.fromY = z.y;
            z.stepStartTime = 0;
            z.state = 'idle';
            z.chaseEndTime = 0;
            z.lastCheck = now;
        });
    }

    // 5. Restaurer les Sorcières (position au moment du checkpoint + annulation des sorts)
    if (snap.witches) {
        currentLevel.witches = JSON.parse(JSON.stringify(snap.witches));
        currentLevel.witches.forEach(w => {
            w.fromX = w.x;
            w.fromY = w.y;
            w.stepStartTime = 0;
            w.state = 'idle';
            w.isBurst = false;
            w.nextCastTime = now + 1000;
            w.lastPatrolTime = now;
        });
    }

    // 6. Restaurer les Araignées
    if (snap.spiders) {
        currentLevel.spiders = JSON.parse(JSON.stringify(snap.spiders));
        currentLevel.spiders.forEach(s => {
            s.state = 'idle';
            s.x = s.spawnX;
            s.y = s.spawnY;
            s.fromX = s.spawnX;
            s.fromY = s.spawnY;
            s.targetX = s.spawnX;
            s.targetY = s.spawnY;
            s.targetWebX = null;
            s.targetWebY = null;
            s.stepStartTime = 0;
        });
    }

    // 7. Nettoyer les projectiles et flaques en cours
    currentLevel.potions = [];
    currentLevel.potionSplashes = [];
    currentLevel.acidPuddles = [];
    currentLevel.bombs = [];

    isGameOver = false;
    hasWon = false;

    updateStatsUI();
    if (overlay) overlay.style.display = "none";
    render();
    if (snap.bats) {
        currentLevel.bats = JSON.parse(JSON.stringify(snap.bats));
        currentLevel.bats.forEach(b => { b.fromX = b.x; b.fromY = b.y; b.stepStartTime = 0; });
    }
}
if (overlayBtnNext) overlayBtnNext.addEventListener('click', () => {
    if (currentLevelIndex < window.LEVELS.length - 1) {
        loadLevel(currentLevelIndex + 1);
    }
});

if (startBtn) {
    startBtn.addEventListener('click', startGame);
}

document.addEventListener('DOMContentLoaded', () => {
    setPlayerAvatar(window.chosenAvatar);

    if (window.LEVELS && window.LEVELS.length > 0) {
        let targetLevel = 0; // Niveau 1 par défaut (index 0)

        // 1. Détection via paramètre URL : ?lvl=2 ou ?level=2
        const params = new URLSearchParams(window.location.search);
        const lvlParam = params.get('lvl') || params.get('level');

        // 2. Détection alternative via hash : #2
        const hashParam = window.location.hash.replace('#', '');

        const chosen = lvlParam || hashParam;

        if (chosen !== null && chosen !== "") {
            const parsedNum = parseInt(chosen, 10);
            // Si le numéro est valide (ex: 1 pour le premier niveau)
            if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= window.LEVELS.length) {
                targetLevel = parsedNum - 1; // Convertit le niveau 1 en index 0
            }
        }

        loadLevel(targetLevel);
    }
});

function toggleFullScreen() {
    const gameContainer = document.getElementById('game-wrapper');
    const btn = document.getElementById('fullscreen-btn');

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (gameContainer.requestFullscreen) {
            gameContainer.requestFullscreen();
        } else if (gameContainer.webkitRequestFullscreen) {
            gameContainer.webkitRequestFullscreen();
        }
        if (btn) btn.textContent = "✕ Quitter plein écran";
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        if (btn) btn.textContent = "⛶ Plein écran";
    }
}

document.addEventListener('fullscreenchange', () => {
    resizeGame();
    const btn = document.getElementById('fullscreen-btn');
    if (!document.fullscreenElement && btn) {
        btn.textContent = "⛶ Plein écran";
    }
});
document.addEventListener('webkitfullscreenchange', () => {
    resizeGame();
    const btn = document.getElementById('fullscreen-btn');
    if (!document.webkitFullscreenElement && btn) {
        btn.textContent = "⛶ Plein écran";
    }
});