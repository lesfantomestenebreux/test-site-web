// =========================================================================
// SAUVEGARDE LÉGÈRE EN LOCALSTORAGE (NIVEAU + PIÈCES DES NIVEAUX PRÉCÉDENTS)
// =========================================================================
function saveProgress() {
    const saveData = {
        level: currentLevelIndex,
        // Enregistre uniquement les pièces récupérées sur les niveaux terminés (0 à currentLevelIndex - 1)
        coinHistory: levelCoinHistory.slice(0, currentLevelIndex)
    };
    localStorage.setItem('labyrinthe_save', JSON.stringify(saveData));
}

function loadProgress() {
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) return;

    const rawSave = localStorage.getItem('labyrinthe_save');
    if (!rawSave) {
        continueBtn.style.display = 'none';
        return;
    }

    try {
        const saveData = JSON.parse(rawSave);
        const savedLevel = parseInt(saveData.level, 10);

        if (!isNaN(savedLevel) && window.LEVELS && savedLevel >= 0 && savedLevel < window.LEVELS.length) {
            const savedCoins = Array.isArray(saveData.coinHistory)
                ? saveData.coinHistory.reduce((sum, item) => sum + (item ? item.got : 0), 0)
                : 0;

            continueBtn.textContent = `▶️ Continuer (Niveau ${savedLevel + 1})`;
            continueBtn.style.display = 'inline-block';

            continueBtn.onclick = () => {
                levelCoinHistory = Array.isArray(saveData.coinHistory)
                    ? JSON.parse(JSON.stringify(saveData.coinHistory))
                    : [];
                loadLevel(savedLevel);
                startGame();
            };
        } else {
            continueBtn.style.display = 'none';
        }
    } catch (e) {
        localStorage.removeItem('labyrinthe_save');
        continueBtn.style.display = 'none';
    }
}
/* ==========================================================================
   5. MAIN.JS — BOUCLE TEMPS RÉEL (60 FPS), CONTRÔLES & INITIALISATION
   ========================================================================== */

function animateLasers(timestamp) {
    const now = Date.now();
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (currentLevel && gameStarted && !isGameOver && !hasWon) {
        if (!isDying) {
            updateZombies(now);
            if (typeof updateSpiders === 'function') updateSpiders(now);
            updateWitches(now);
            updateBats(now);
            if (typeof updateTrollsAndBows === 'function') updateTrollsAndBows(now);
            if (typeof updateSkullsAndBones === 'function') updateSkullsAndBones(now);

            // --- VITESSE DU FAISCEAU LASER CANON ---
            const laserSpeed = 4;
            const keptBombs = [];
            currentLevel.bombs.forEach(b => {
                b.x += b.dirX * laserSpeed * dt;
                b.y += b.dirY * laserSpeed * dt;

                const checkX = b.dirX > 0 ? Math.ceil(b.x) : Math.floor(b.x);
                const checkY = b.dirY > 0 ? Math.ceil(b.y) : Math.floor(b.y);

                const laserTile = currentLevel.map[checkY] && currentLevel.map[checkY][checkX];
                if (laserTile === 1 || laserTile === 3) return;

                if (Math.hypot(b.x - currentLevel.player.x, b.y - currentLevel.player.y) < 0.55) {
                    triggerGameOver("Zzzap ! Tu as été désintégré par un laser !");
                }
                keptBombs.push(b);
            });
            currentLevel.bombs = keptBombs;

        // --- VOL ET IMPACTS DES FIOLES DE SORCIÈRE 🧪 ---
            if (currentLevel.potions) {
                const potionSpeed = 2.5;
                const keptPotions = [];
                const PUDDLE_DURATION_MS = 2500;

                currentLevel.potions.forEach(p => {
                    const prevX = p.x;
                    const prevY = p.y;

                    p.x += p.dirX * potionSpeed * dt;
                    p.y += p.dirY * potionSpeed * dt;
                    p.angle = (p.angle || 0) + dt * 10;

                    let hitObstacle = false;
                    
                    const targetTileX = Math.round(p.x);
                    const targetTileY = Math.round(p.y);
                    const potionTile = currentLevel.map[targetTileY] && currentLevel.map[targetTileY][targetTileX];
                    if (potionTile === 1 || potionTile === 3) {
                        hitObstacle = true;    
                    }

                    if (!hitObstacle && currentLevel.bombs.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 0.6)) {
                        hitObstacle = true;
                    }

                    if (!hitObstacle && Math.hypot(p.x - currentLevel.player.x, p.y - currentLevel.player.y) < 0.55) {
                        hitObstacle = true;
                        triggerGameOver("Une fiole toxique 🧪 de sorcière t'a frappé de plein fouet !", "witch");
                    }

                    if (!hitObstacle) {
                        const hitZombie = currentLevel.zombies.some(z => Math.hypot(z.x - p.x, z.y - p.y) < 0.6);
                        const hitVampire = currentLevel.vampires.some(v => v.alive && Math.hypot(v.x - p.x, v.y - p.y) < 0.6);
                        const hitSpider = currentLevel.spiders && currentLevel.spiders.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 0.6);

                        if (hitZombie || hitVampire || hitSpider) {
                            hitObstacle = true;
                        }
                    }
                

                    if (hitObstacle) {
                        let puddleX = Math.round(prevX);
                        let puddleY = Math.round(prevY);

                        if (currentLevel.map[puddleY] && currentLevel.map[puddleY][puddleX] === 1) {
                            puddleX = Math.max(0, Math.min(currentLevel.cols - 1, Math.round(p.x - p.dirX * 0.5)));
                            puddleY = Math.max(0, Math.min(currentLevel.rows - 1, Math.round(p.y - p.dirY * 0.5)));
                        }

                        if (!currentLevel.acidPuddles) currentLevel.acidPuddles = [];
                        currentLevel.acidPuddles.push({
                            x: puddleX,
                            y: puddleY,
                            spawnTime: now,
                            expireTime: now + PUDDLE_DURATION_MS
                        });

                        currentLevel.potionSplashes.push({ x: puddleX, y: puddleY, startTime: now, duration: 400 });

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
        }

        render();
    }

    requestAnimationFrame(animateLasers);
}
requestAnimationFrame(animateLasers);

// --- CONTRÔLES CLAVIER ---
window.addEventListener('keydown', (e) => {
    switch (e.key) {
        case 'ArrowUp': case 'z': case 'Z': movePlayer(0, -1); break;
        case 'ArrowDown': case 's': case 'S': movePlayer(0, 1); break;
        case 'ArrowLeft': case 'q': case 'Q': movePlayer(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': movePlayer(1, 0); break;
    }
});

// --- CONTRÔLES D-PAD MOBILE ---
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
        if (e.cancelable) e.preventDefault();
        stopDpadHold();
        stepMove();
        dpadInitialTimeout = setTimeout(() => {
            dpadRepeatInterval = setInterval(stepMove, 55);
        }, 220);
    };

    btn.addEventListener('touchstart', startHold, { passive: false });
    btn.addEventListener('touchend', stopDpadHold);
    btn.addEventListener('touchcancel', stopDpadHold);

    btn.addEventListener('mousedown', (e) => {
        if ('ontouchstart' in window) return;
        startHold(e);
    });
    btn.addEventListener('mouseup', stopDpadHold);
    btn.addEventListener('mouseleave', stopDpadHold);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// --- SWIPE SUR CANVAS ---
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

// --- BOUTONS INTERFACE & PLEIN ÉCRAN ---
if (resetBtn) resetBtn.addEventListener('click', () => loadLevel(currentLevelIndex));
    if (overlayBtnReplay) {
    overlayBtnReplay.addEventListener('click', () => {
        if (!isGameOver && !hasWon) {
            if (overlay) overlay.style.display = "none";
            return;
        }
        if (currentLevel && currentLevel.bossPhaseCheckpoint) {
            restoreBossPhaseCheckpoint();
        } else if (currentLevel && currentLevel.lastCheckpoint) {
            respawnAtCheckpoint();
        } else {
            loadLevel(currentLevelIndex);
        }
    });
}

if (overlayBtnNext) {
    overlayBtnNext.addEventListener('click', () => {
        if (currentLevelIndex < window.LEVELS.length - 1) {
            loadLevel(currentLevelIndex + 1);
            saveProgress(); // Sauvegarde le nouveau niveau et les pièces des niveaux précédents
        }
    });
}

if (startBtn) {
    startBtn.addEventListener('click', () => {
        // "Nouvelle partie" : efface l'ancienne sauvegarde, remet les pièces à 0 et repart au niveau 1
        localStorage.removeItem('labyrinthe_save');
        levelCoinHistory = [];
        loadLevel(0);
        saveProgress();
        startGame();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setPlayerAvatar(window.chosenAvatar);

    if (window.LEVELS && window.LEVELS.length > 0) {
        let targetLevel = 0;
        const params = new URLSearchParams(window.location.search);
        const lvlParam = params.get('lvl') || params.get('level');
        const hashParam = window.location.hash.replace('#', '');
        const chosen = lvlParam || hashParam;

        if (chosen !== null && chosen !== "") {
            const parsedNum = parseInt(chosen, 10);
            if (!isNaN(parsedNum) && parsedNum >= 1 && parsedNum <= window.LEVELS.length) {
                targetLevel = parsedNum - 1;
            }
        }
        loadLevel(targetLevel);
    }

    loadProgress(); // Affiche le bouton "Continuer (Niveau X)" si une sauvegarde existe
});
// =========================================================================
// CHECKPOINT AUTOMATIQUE PAR PHASE DE BOSS 🧌
// =========================================================================
function saveBossPhaseCheckpoint(boss) {
    if (!currentLevel || !boss) return;

    const initialData = (typeof parseLevelMatrix === 'function' && window.LEVELS && window.LEVELS[currentLevelIndex])
        ? parseLevelMatrix(window.LEVELS[currentLevelIndex])
        : null;

    // Position sécurisée : dernier checkpoint actif > entrée de l'arène > départ du niveau
    let safePos = { x: currentLevel.player.x, y: currentLevel.player.y };
    if (currentLevel.lastCheckpoint) {
        safePos = { x: currentLevel.lastCheckpoint.x, y: currentLevel.lastCheckpoint.y };
    } else if (boss.arenaEntryPos) {
        safePos = { x: boss.arenaEntryPos.x, y: boss.arenaEntryPos.y };
    } else if (initialData && initialData.player) {
        safePos = { x: initialData.player.x, y: initialData.player.y };
    }

    currentLevel.bossPhaseCheckpoint = {
        safePos,
        bossHp: boss.hp,
        bossMaxHp: boss.maxHp,
        bossSpawnX: boss.spawnX !== undefined ? boss.spawnX : boss.x,
        bossSpawnY: boss.spawnY !== undefined ? boss.spawnY : boss.y,
        map: JSON.parse(JSON.stringify(currentLevel.map)),
        checkpoints: JSON.parse(JSON.stringify(currentLevel.checkpoints || [])),
        coins: JSON.parse(JSON.stringify(currentLevel.coins || [])),
        keys: JSON.parse(JSON.stringify(currentLevel.keys || [])),
        garlics: JSON.parse(JSON.stringify(currentLevel.garlics || [])),
        pumpkins: JSON.parse(JSON.stringify(currentLevel.pumpkins || [])),
        tombstones: JSON.parse(JSON.stringify(currentLevel.tombstones || [])),
        bows: JSON.parse(JSON.stringify(currentLevel.bows || [])),
        spiders: JSON.parse(JSON.stringify(currentLevel.spiders || [])),
        bats: JSON.parse(JSON.stringify(currentLevel.bats || [])),
        skulls: JSON.parse(JSON.stringify(currentLevel.skulls || [])),
        bones: JSON.parse(JSON.stringify(currentLevel.bones || []))
    };
}

function restoreBossPhaseCheckpoint() {
    if (!currentLevel || !currentLevel.bossPhaseCheckpoint) return;
    const snap = currentLevel.bossPhaseCheckpoint;
    const now = Date.now();

    // 1. Replace le joueur à la position sécurisée et annule les malus
    currentLevel.player.x = snap.safePos.x;
    currentLevel.player.y = snap.safePos.y;
    currentLevel.player.fromX = snap.safePos.x;
    currentLevel.player.fromY = snap.safePos.y;
    currentLevel.player.moveStartTime = now;
    currentLevel.player.slowDebuffEndTime = 0;
    currentLevel.player.wallHurtEndTime = 0;
    currentLevel.player.garlicPowerTime = 0;
    currentLevel.player.pumpkinPowerTime = 0;

    // 2. Restaure la matrice et les objets (pièces, tombes, arcs, checkpoints)
    if (snap.map) currentLevel.map = JSON.parse(JSON.stringify(snap.map));
    if (snap.checkpoints) currentLevel.checkpoints = JSON.parse(JSON.stringify(snap.checkpoints));
    if (snap.coins) currentLevel.coins = JSON.parse(JSON.stringify(snap.coins));
    if (snap.keys) currentLevel.keys = JSON.parse(JSON.stringify(snap.keys));
    if (snap.garlics) currentLevel.garlics = JSON.parse(JSON.stringify(snap.garlics));
    if (snap.pumpkins) currentLevel.pumpkins = JSON.parse(JSON.stringify(snap.pumpkins));
    if (snap.tombstones) currentLevel.tombstones = JSON.parse(JSON.stringify(snap.tombstones));
    if (snap.bones) currentLevel.bones = JSON.parse(JSON.stringify(snap.bones));

    if (snap.bows) {
        currentLevel.bows = JSON.parse(JSON.stringify(snap.bows));
        currentLevel.bows.forEach(b => { b.chargeStartTime = null; });
    }

    // 3. Réinitialise les monstres annexes (Vampires, Zombies, Sorcières) au début du niveau
    const initialLevel = (typeof parseLevelMatrix === 'function' && window.LEVELS && window.LEVELS[currentLevelIndex])
        ? parseLevelMatrix(window.LEVELS[currentLevelIndex])
        : null;

    if (initialLevel) {
        currentLevel.vampires = initialLevel.vampires;
        currentLevel.zombies = initialLevel.zombies;
        currentLevel.witches = initialLevel.witches;
    }

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

    if (snap.bats) {
        currentLevel.bats = JSON.parse(JSON.stringify(snap.bats));
        currentLevel.bats.forEach(b => {
            b.fromX = b.x;
            b.fromY = b.y;
            b.stepStartTime = 0;
        });
    }

    if (snap.skulls) {
        currentLevel.skulls = JSON.parse(JSON.stringify(snap.skulls));
        currentLevel.skulls.forEach(s => {
            s.fromX = s.x;
            s.fromY = s.y;
            s.moveStartTime = 0;
            s.targetBone = null;
            s.chargeEnd = 0;
        });
    }

    // 4. Restaure le Boss à sa position initiale avec ses PV et sa phase sauvegardés
    for (let y = 0; y < currentLevel.rows; y++) {
        for (let x = 0; x < currentLevel.cols; x++) {
            if (currentLevel.map[y][x] === 3) currentLevel.map[y][x] = 0;
        }
    }

    currentLevel.miniTrolls = [];
    if (currentLevel.trolls && currentLevel.trolls.length > 0) {
        const boss = currentLevel.trolls[0];
        boss.x = snap.bossSpawnX;
        boss.y = snap.bossSpawnY;
        boss.spawnX = snap.bossSpawnX;
        boss.spawnY = snap.bossSpawnY;
        boss.hp = snap.bossHp;
        boss.maxHp = snap.bossMaxHp;
        boss.alive = true;

        // Réoccupe le bloc 2x2 dans la matrice
        for (let oy = 0; oy < 2; oy++) {
            for (let ox = 0; ox < 2; ox++) {
                if (currentLevel.map[boss.y + oy]) {
                    currentLevel.map[boss.y + oy][boss.x + ox] = 3;
                }
            }
        }

        // Réinitialise les états d'attaque et applique la phase correspondante
        boss.meleeChargeEnd = 0;
        boss.chargedEnd = 0;
        boss.chargedAim = null;
        boss.dashChargeEnd = 0;
        boss.dashAim = null;
        boss.isDashing = false;
        boss.stunEnd = 0;
        boss.behindCoverSince = null;
        boss.cooldownEnd = now + 1200;

        const bossCfg = window.BOSS_CONFIG || {};
        if (boss.hp === 2) {
            // Phase 2 : réinvoque la horde de Mini-Trolls définie dans monsters.js
            if (typeof window.spawnMiniTrollHorde === 'function') {
                window.spawnMiniTrollHorde(boss, bossCfg.MINI_TROLL_COUNT_P2);
            }
        } else if (boss.hp === 1) {
            // Phase 3 : réinvoque la vague d'entrée et réinitialise le cycle sur 'classic'
            boss.phase3Step = 'classic';
            if (typeof window.spawnMiniTrollHorde === 'function') {
                window.spawnMiniTrollHorde(boss, bossCfg.MINI_TROLL_COUNT_P3_ENTRY);
            }
        }
    }

    // 5. Nettoie tous les projectiles et effets actifs
    currentLevel.potions = [];
    currentLevel.potionSplashes = [];
    currentLevel.acidPuddles = [];
    currentLevel.bombs = [];
    currentLevel.arrows = [];
    currentLevel.shockwaves = [];
    currentLevel.boneProjectiles = [];
    currentLevel.tpEffect = null;

    // 6. Relance le combat et rafraîchit immédiatement la barre de vie (❤️) du Boss
    isGameOver = false;
    isDying = false;
    hasWon = false;

    updateStatsUI();
    if (overlay) overlay.style.display = "none";
    render();
}
function toggleFullScreen() {
    const gameContainer = document.getElementById('game-wrapper');
    const btn = document.getElementById('fullscreen-btn');

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (gameContainer.requestFullscreen) gameContainer.requestFullscreen();
        else if (gameContainer.webkitRequestFullscreen) gameContainer.webkitRequestFullscreen();
        if (btn) btn.textContent = "✕ Quitter plein écran";
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        if (btn) btn.textContent = "⛶ Plein écran";
    }
}

document.addEventListener('fullscreenchange', () => {
    resizeGame();
    const btn = document.getElementById('fullscreen-btn');
    if (!document.fullscreenElement && btn) btn.textContent = "⛶ Plein écran";
});
document.addEventListener('webkitfullscreenchange', () => {
    resizeGame();
    const btn = document.getElementById('fullscreen-btn');
    if (!document.webkitFullscreenElement && btn) btn.textContent = "⛶ Plein écran";
});