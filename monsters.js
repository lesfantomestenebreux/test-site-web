/* ==========================================================================
   2. MONSTERS.JS — BOUCLE DE JEU & INTELLIGENCE ARTIFICIELLE DES MONSTRES
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

            // Rebondit sur tout obstacle : mur (1), tombe (2), troll (3) ou bord de carte
            const nextTile = currentLevel.map[nextY] && currentLevel.map[nextY][nextX];
            if (nextTile === undefined || nextTile !== 0) {
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

        // --- D. VAMPIRES (TRAQUEURS AVEC FUITE SOUS AIL EN LIGNE DE VUE & ANTI-STACKING) ---
        const hasGarlic = currentLevel.player.garlicPowerTime > 0;

        currentLevel.vampires.forEach(v => {
            if (!v.alive) return;

            const canSee = hasLineOfSight(v.x, v.y, currentLevel.player.x, currentLevel.player.y);
            const isFleeing = hasGarlic && canSee;

            if (hasGarlic) {
                // Sous l'effet de l'ail : annule la traque et ne fuit que si la ligne de vue est directe
                v.chasing = false;
                v.alertTimer = 0;
            } else if (canSee) {
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
                    const isOccupiedByVampire = isTileOccupiedByUndead(pos.x, pos.y, v);

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
                if (hasGarlic) {
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

// Détection de ligne de vue directe à 360° (Raycasting — Pierres Tombales 2 transparentes)
function hasLineOfSight(x1, y1, x2, y2, ignoreBox = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) return true;

    const steps = Math.ceil(distance * 3);
    for (let i = 1; i < steps; i++) {
        const checkX = Math.round(x1 + (dx * (i / steps)));
        const checkY = Math.round(y1 + (dy * (i / steps)));

        if (checkX === x1 && checkY === y1) continue;
        if (ignoreBox && checkX >= ignoreBox.minX && checkX <= ignoreBox.maxX &&
            checkY >= ignoreBox.minY && checkY <= ignoreBox.maxY) {
            continue;
        }

        const tile = currentLevel.map[checkY] && currentLevel.map[checkY][checkX];
        if (tile === 1 || tile === 3) {
            return false;
        }
    }

    return true;
}

// Ligne de vue stricte (s'arrête sur les murs 1 ET les Pierres Tombales 2)
function hasStrictSight(x1, y1, x2, y2, ignoreBox = null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) return true;

    const steps = Math.ceil(distance * 3);
    for (let i = 1; i < steps; i++) {
        const checkX = Math.round(x1 + (dx * (i / steps)));
        const checkY = Math.round(y1 + (dy * (i / steps)));

        if (checkX === x1 && checkY === y1) continue;
        if (ignoreBox && checkX >= ignoreBox.minX && checkX <= ignoreBox.maxX &&
            checkY >= ignoreBox.minY && checkY <= ignoreBox.maxY) {
            continue;
        }

        const tile = currentLevel.map[checkY] && currentLevel.map[checkY][checkX];
        if (tile === 1 || tile === 2 || tile === 3) {
            return false;
        }
    }

    return true;
}

// =========================================================================
// IA DU BOSS TROLL 🧌 (3 PHASES, RECUL STRICT, MINI-TROLLS BFS, CHARGE) & ARC 🏹
// =========================================================================
function updateTrollsAndBows(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon) return;

    // --- CONSTANTES D'ÉQUILIBRAGE ---
    const BOW_CHARGE_MS = 1500;             // Temps de charge de l'arc
    const ARROW_SPEED = 12;                 // Vitesse des flèches
    const WALL_HURT_DURATION_MS = 6000;     // Durée de la blessure murale rouge
    const WALL_SLOW_DURATION_MS = 2000;     // Durée du ralentissement après choc mural
    const BOSS_MELEE_CHARGE_MS = 600;       // Charge attaque de base du Boss
    const BOSS_MELEE_PUSH_STEPS = 2;        // Cases de recul de l'attaque de base
    const BOSS_POWER_CHARGE_MS = 1500;      // Charge du tir puissant Phases 1 & 2
    const BOSS_POWER_LOCK_MS = 500;         // Verrouillage de la visée en fin de charge
    const BOSS_POWER_EVERY_N_ATTACKS = 4;   // Fréquence du tir puissant
    const BOSS_COVER_TRIGGER_MS = 3000;     // Temps derrière une tombe avant tir puissant forcé
    const BOSS_SHOCKWAVE_SPEED = 9;         // Vitesse de l'onde de choc
    const BOSS_DASH_CHARGE_MS = 1000;       // Charge de la ruée Phase 3
    const BOSS_DASH_LOCK_MS = 400;          // Verrouillage de la ruée
    const BOSS_DASH_SPEED = 12;             // Vitesse de la ruée
    const BOSS_STUN_MS = 1500;              // Étourdissement après ruée contre un mur
    const BOSS_COOLDOWN_MS = 2200;          // Répit Phases 1 & 2
    const BOSS_COOLDOWN_P3_MS = 1400;       // Répit Phase 3
    const MINI_TROLL_COUNT = 10;             // Nombre de mini-trolls en Phase 2
    const MINI_TROLL_STEP_MS = 750;         // Vitesse de déplacement des mini-trolls
    const MINI_TROLL_CHARGE_MS = 1000;      // Temps de charge de leur coup de massue
    const MINI_TROLL_PUSH_STEPS = 1;        // Cases de recul des cases grises

    const dt = Math.min((now - (currentLevel._lastTrollTick || now)) / 1000, 0.05);
    currentLevel._lastTrollTick = now;

    const player = currentLevel.player;
    if (!currentLevel.miniTrolls) currentLevel.miniTrolls = [];

    // Utilitaire : vérifie si une case (ex, ey) fait partie des 8 cases collées aux flancs du Boss 2x2
    const isOnBossFlank = (boss, ex, ey) => {
        const dx = Math.max(boss.x - ex, 0, ex - (boss.x + 1));
        const dy = Math.max(boss.y - ey, 0, ey - (boss.y + 1));
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    };

    // Utilitaire : repousse le joueur de N cases et applique la blessure murale
    const applyKnockbackWithWallHurt = (pushX, pushY, steps) => {
        let hitObstacle = false;
        for (let s = 0; s < steps; s++) {
            const nx = player.x + pushX;
            const ny = player.y + pushY;
            const tile = currentLevel.map[ny] && currentLevel.map[ny][nx];

            // Si la poussée traverse le corps du Boss (3), on continue pour éjecter le joueur hors du Boss
            if (tile === 3) {
                player.fromX = player.x;
                player.fromY = player.y;
                player.x = nx;
                player.y = ny;
                player.moveStartTime = now;
                continue;
            }

            const blockedByMini = currentLevel.miniTrolls.some(mt => mt.x === nx && mt.y === ny);
            if (tile === undefined || tile !== 0 || blockedByMini) {
                hitObstacle = true;
                break;
            }

            player.fromX = player.x;
            player.fromY = player.y;
            player.x = nx;
            player.y = ny;
            player.moveStartTime = now;
        }

        if (hitObstacle) {
            if (player.wallHurtEndTime && now < player.wallHurtEndTime) {
                triggerGameOver("Tu t'es fracassé contre le mur !", "troll");
                return true;
            } else {
                player.wallHurtEndTime = now + WALL_HURT_DURATION_MS;
                player.slowDebuffEndTime = now + WALL_SLOW_DURATION_MS;
            }
        }
        return false;
    };

    // Utilitaire : fait apparaître les Mini-Trolls uniquement sur les cases accessibles dans l'arène fermée 18x18 (BFS)
    const spawnMiniTrollHorde = (boss) => {
        const bossX = boss.x;
        const bossY = boss.y;
        const visited = new Set();
        const queue = [];

        // Initialise le BFS depuis toutes les cases libres (tile === 0) collées au bloc 2x2 du Boss
        for (let y = bossY - 1; y <= bossY + 2; y++) {
            for (let x = bossX - 1; x <= bossX + 2; x++) {
                if (x >= bossX && x <= bossX + 1 && y >= bossY && y <= bossY + 1) continue;
                if (Math.abs(x - bossX) > 8 || Math.abs(y - bossY) > 8) continue;
                if (currentLevel.map[y] && currentLevel.map[y][x] === 0) {
                    const key = `${x},${y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push({ x, y });
                    }
                }
            }
        }

        const dirs = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];
        const reachable = [];

        while (queue.length > 0) {
            const curr = queue.shift();
            reachable.push(curr);

            for (const d of dirs) {
                const nx = curr.x + d.dx;
                const ny = curr.y + d.dy;
                if (Math.abs(nx - bossX) > 8 || Math.abs(ny - bossY) > 8) continue;
                if (ny < 0 || ny >= currentLevel.rows || nx < 0 || nx >= currentLevel.cols) continue;
                if (currentLevel.map[ny][nx] !== 0) continue;

                const key = `${nx},${ny}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        const candidates = reachable.filter(pos =>
            Math.hypot(pos.x - player.x, pos.y - player.y) >= 2 &&
            !currentLevel.miniTrolls.some(mt => mt.x === pos.x && mt.y === pos.y)
        );

        candidates.sort(() => Math.random() - 0.5);
        const count = Math.min(MINI_TROLL_COUNT, candidates.length);
        for (let i = 0; i < count; i++) {
            const pos = candidates[i];
            currentLevel.miniTrolls.push({
                x: pos.x,
                y: pos.y,
                fromX: pos.x,
                fromY: pos.y,
                stepStartTime: 0,
                lastMoveTime: now + Math.floor(Math.random() * 400),
                chargeEnd: 0,
                aimDir: { dx: 0, dy: 1 },
                slamAnimStart: 0,
                slamAnimEnd: 0
            });
        }
    };

    // Utilitaire : calcule la visée du Tir Puissant (Phases 1 & 2)
    const computePowerfulShotAim = (t) => {
        const cx = t.x + 0.5;
        const cy = t.y + 0.5;
        const dist = Math.hypot(player.x - cx, player.y - cy) || 1;
        const dirX = (player.x - cx) / dist;
        const dirY = (player.y - cy) / dist;

        let endX = cx;
        let endY = cy;
        for (let step = 1; step <= 60; step++) {
            const sx = Math.round(cx + dirX * step * 0.5);
            const sy = Math.round(cy + dirY * step * 0.5);
            const tile = currentLevel.map[sy] && currentLevel.map[sy][sx];
            if (tile === undefined || tile === 1) break;
            endX = cx + dirX * step * 0.5;
            endY = cy + dirY * step * 0.5;
        }

        return { dirX, dirY, angle: Math.atan2(dirY, dirX), endX, endY };
    };

    // Utilitaire : calcule la trajectoire de la Charge Rectiligne (Phase 3)
    const computeChargeDashAim = (t) => {
        const cx = t.x + 0.5;
        const cy = t.y + 0.5;
        const dist = Math.hypot(player.x - cx, player.y - cy) || 1;
        const dirX = (player.x - cx) / dist;
        const dirY = (player.y - cy) / dist;

        let endX = cx;
        let endY = cy;
        const box = t.arenaBox;
        for (let step = 1; step <= 40; step++) {
            const nx = Math.round(t.x + dirX * step * 0.5);
            const ny = Math.round(t.y + dirY * step * 0.5);
            if (nx < box.minX || nx + 1 > box.maxX || ny < box.minY || ny + 1 > box.maxY) break;

            let hitWall = false;
            for (let oy = 0; oy < 2; oy++) {
                for (let ox = 0; ox < 2; ox++) {
                    const tile = currentLevel.map[ny + oy] && currentLevel.map[ny + oy][nx + ox];
                    if (tile === undefined || tile === 1) hitWall = true;
                }
            }
            if (hitWall) break;
            endX = nx + 0.5;
            endY = ny + 0.5;
        }

        return { dirX, dirY, angle: Math.atan2(dirY, dirX), endX, endY };
    };

    // --- A. GESTION DES ARCS 🏹 ---
    if (currentLevel.bows) {
        currentLevel.bows.forEach(bow => {
            if (bow.used) return;

            const hasAliveTroll = currentLevel.trolls && currentLevel.trolls.some(t => t.alive);
            if (!hasAliveTroll) {
                bow.chargeStartTime = null;
                return;
            }

            if (player.x === bow.x && player.y === bow.y) {
                if (!bow.chargeStartTime) {
                    bow.chargeStartTime = now;
                } else if (now - bow.chargeStartTime >= BOW_CHARGE_MS) {
                    bow.used = true;
                    bow.chargeStartTime = null;

                    let targetTroll = null;
                    let bestDist = Infinity;
                    currentLevel.trolls.forEach(t => {
                        if (!t.alive) return;
                        const d = Math.hypot((t.x + 0.5) - bow.x, (t.y + 0.5) - bow.y);
                        if (d < bestDist) {
                            bestDist = d;
                            targetTroll = t;
                        }
                    });

                    if (targetTroll) {
                        const tx = targetTroll.x + 0.5;
                        const ty = targetTroll.y + 0.5;
                        const dist = Math.hypot(tx - bow.x, ty - bow.y) || 1;
                        currentLevel.arrows.push({
                            x: bow.x,
                            y: bow.y,
                            dirX: (tx - bow.x) / dist,
                            dirY: (ty - bow.y) / dist,
                            angle: Math.atan2(ty - bow.y, tx - bow.x)
                        });
                    }
                }
            } else {
                bow.chargeStartTime = null;
            }
        });
    }

    // --- B. VOL DES FLÈCHES 🏹 & TRANSITIONS DE PHASES ---
    if (currentLevel.arrows) {
        const keptArrows = [];
        currentLevel.arrows.forEach(ar => {
            ar.x += ar.dirX * ARROW_SPEED * dt;
            ar.y += ar.dirY * ARROW_SPEED * dt;

            const gx = Math.round(ar.x);
            const gy = Math.round(ar.y);
            const tile = currentLevel.map[gy] && currentLevel.map[gy][gx];

            if (tile === undefined || tile === 1) return;

            const hitTroll = currentLevel.trolls && currentLevel.trolls.find(t =>
                t.alive && ar.x >= t.x - 0.3 && ar.x <= t.x + 1.3 && ar.y >= t.y - 0.3 && ar.y <= t.y + 1.3
            );

            if (hitTroll) {
                hitTroll.hp -= 1;

                if (hitTroll.hp === 2) {
                    // Phase 2 : apparition des Mini-Trolls dans l'arène fermée 18x18
                    spawnMiniTrollHorde(hitTroll);
                } else if (hitTroll.hp === 1) {
                    // Phase 3 : arrêt du tir puissant, passage à l'alternance Classique -> Charge
                    hitTroll.chargedEnd = 0;
                    hitTroll.chargedAim = null;
                    hitTroll.phase3Step = 'classic';
                } else if (hitTroll.hp <= 0) {
                    // Mort du Boss : libère le bloc 2x2, supprime tous les Mini-Trolls, lâche la clé 🔑
                    hitTroll.alive = false;
                    hitTroll.isDashing = false;
                    for (let oy = 0; oy < 2; oy++) {
                        for (let ox = 0; ox < 2; ox++) {
                            if (currentLevel.map[hitTroll.y + oy]) {
                                currentLevel.map[hitTroll.y + oy][hitTroll.x + ox] = 0;
                            }
                        }
                    }
                    currentLevel.miniTrolls = [];
                    currentLevel.keys.push({ x: hitTroll.x, y: hitTroll.y, collected: false });
                    updateStatsUI();
                }
                return;
            }
            keptArrows.push(ar);
        });
        currentLevel.arrows = keptArrows;
    }

    // --- C. IA DU BOSS TROLL 🧌 ---
    if (currentLevel.trolls) {
        currentLevel.trolls.forEach(t => {
            if (!t.alive) return;

            if (!t.arenaBox) {
                t.arenaBox = {
                    minX: Math.max(0, t.x - 8),
                    maxX: Math.min(currentLevel.cols - 1, t.x + 9),
                    minY: Math.max(0, t.y - 8),
                    maxY: Math.min(currentLevel.rows - 1, t.y + 9)
                };
            }

            const trollBox = { minX: t.x, maxX: t.x + 1, minY: t.y, maxY: t.y + 1 };
            const inArena18x18 = (
                player.x >= t.arenaBox.minX && player.x <= t.arenaBox.maxX &&
                player.y >= t.arenaBox.minY && player.y <= t.arenaBox.maxY
            );

            // Détection à travers les tombes (pour déclencher les attaques)
            const checkSight = () => {
                for (let oy = 0; oy < 2; oy++) {
                    for (let ox = 0; ox < 2; ox++) {
                        if (hasLineOfSight(t.x + ox, t.y + oy, player.x, player.y, trollBox)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            // Détection stricte bloquée par les murs (1) ET les Pierres Tombales (2)
            const checkStrictSight = () => {
                for (let oy = 0; oy < 2; oy++) {
                    for (let ox = 0; ox < 2; ox++) {
                        if (hasStrictSight(t.x + ox, t.y + oy, player.x, player.y, trollBox)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            const isBehindTombstone = () => {
                const cx = t.x + 0.5;
                const cy = t.y + 0.5;
                const d = Math.hypot(player.x - cx, player.y - cy);
                if (d === 0) return false;
                const steps = Math.ceil(d * 3);
                for (let i = 1; i < steps; i++) {
                    const sx = Math.round(cx + (player.x - cx) * (i / steps));
                    const sy = Math.round(cy + (player.y - cy) * (i / steps));
                    if (sx >= t.x && sx <= t.x + 1 && sy >= t.y && sy <= t.y + 1) continue;
                    if (currentLevel.map[sy] && currentLevel.map[sy][sx] === 2) return true;
                }
                return false;
            };

            // 0. État Étourdi après une Charge Rectiligne
            if (t.stunEnd > 0) {
                if (now >= t.stunEnd) {
                    t.stunEnd = 0;
                    t.cooldownEnd = now + 800;
                }
                return;
            }

            // 1. PHASE 3 : Ruée de la Charge Rectiligne
            if (t.isDashing) {
                t.fx += t.dashDirX * BOSS_DASH_SPEED * dt;
                t.fy += t.dashDirY * BOSS_DASH_SPEED * dt;

                const nx = Math.round(t.fx);
                const ny = Math.round(t.fy);

                if (nx !== t.x || ny !== t.y) {
                    const outOfArena = (
                        nx < t.arenaBox.minX || nx + 1 > t.arenaBox.maxX ||
                        ny < t.arenaBox.minY || ny + 1 > t.arenaBox.maxY
                    );

                    let hitWall = outOfArena;
                    if (!hitWall) {
                        for (let oy = 0; oy < 2; oy++) {
                            for (let ox = 0; ox < 2; ox++) {
                                const tile = currentLevel.map[ny + oy] && currentLevel.map[ny + oy][nx + ox];
                                if (tile === undefined || tile === 1) {
                                    hitWall = true;
                                }
                            }
                        }
                    }

                    if (hitWall) {
                        t.fx = t.x;
                        t.fy = t.y;
                        t.isDashing = false;
                        t.stunEnd = now + BOSS_STUN_MS;
                        t.phase3Step = 'classic';
                        return;
                    }

                    // Libère les anciennes cases 3 du Boss
                    for (let oy = 0; oy < 2; oy++) {
                        for (let ox = 0; ox < 2; ox++) {
                            if (currentLevel.map[t.y + oy] && currentLevel.map[t.y + oy][t.x + ox] === 3) {
                                currentLevel.map[t.y + oy][t.x + ox] = 0;
                            }
                        }
                    }

                    // Occupe les nouvelles cases 3 et pulvérise toute Pierre Tombale (2 -> 0) sur son chemin
                    for (let oy = 0; oy < 2; oy++) {
                        for (let ox = 0; ox < 2; ox++) {
                            const gx = nx + ox;
                            const gy = ny + oy;
                            if (currentLevel.map[gy][gx] === 2) {
                                currentLevel.map[gy][gx] = 0;
                                currentLevel.tombstones = currentLevel.tombstones.filter(tb => !(tb.x === gx && tb.y === gy));
                            }
                            currentLevel.map[gy][gx] = 3;
                        }
                    }

                    t.x = nx;
                    t.y = ny;
                }

                // Écrase et supprime instantanément tout Mini-Troll sur la trajectoire du Boss
                if (currentLevel.miniTrolls.length > 0) {
                    currentLevel.miniTrolls = currentLevel.miniTrolls.filter(mt => {
                        const onGridBox = (mt.x >= t.x && mt.x <= t.x + 1 && mt.y >= t.y && mt.y <= t.y + 1);
                        const closeToFloatBox = Math.hypot(mt.x - (t.fx + 0.5), mt.y - (t.fy + 0.5)) < 1.15;
                        return !onGridBox && !closeToFloatBox;
                    });
                }

                // Collision joueur sur la trajectoire -> Repousse + blessure murale
                const onBossBody = (
                    player.x >= t.x && player.x <= t.x + 1 &&
                    player.y >= t.y && player.y <= t.y + 1
                );
                const closeToBoss = Math.hypot(player.x - (t.fx + 0.5), player.y - (t.fy + 0.5)) < 1.15;

                if (!t.dashHitPlayer && (onBossBody || closeToBoss)) {
                    t.dashHitPlayer = true;
                    triggerGameOver("Tu as été piétiné par la charge du Troll 🧌 !", "troll");
                    return;
                }
                return;
            }

            // 2. PHASE 3 : Préparation de la Charge Rectiligne
            if (t.dashChargeEnd > 0) {
                const remaining = t.dashChargeEnd - now;
                if (remaining > 0) {
                    if (remaining > BOSS_DASH_LOCK_MS) {
                        t.dashAim = computeChargeDashAim(t);
                    }
                } else {
                    const aim = t.dashAim || computeChargeDashAim(t);
                    t.dashChargeEnd = 0;
                    t.dashAim = null;
                    t.isDashing = true;
                    t.dashHitPlayer = false;
                    t.fx = t.x;
                    t.fy = t.y;
                    t.dashDirX = aim.dirX;
                    t.dashDirY = aim.dirY;
                }
                return;
            }

            // 3. PHASES 1 & 2 : Préparation du Tir Puissant
            if (t.chargedEnd > 0) {
                const remaining = t.chargedEnd - now;
                if (remaining > 0) {
                    if (remaining > BOSS_POWER_LOCK_MS) {
                        t.chargedAim = computePowerfulShotAim(t);
                    }
                } else {
                    const aim = t.chargedAim;
                    t.chargedEnd = 0;
                    t.chargedAim = null;
                    t.cooldownEnd = now + BOSS_COOLDOWN_MS;
                    t.slamAnimStart = now;
                    t.slamAnimEnd = now + 350;
                    t.slamType = 'charged';

                    if (aim) {
                        currentLevel.shockwaves.push({
                            x: t.x + 0.5,
                            y: t.y + 0.5,
                            dirX: aim.dirX,
                            dirY: aim.dirY,
                            angle: aim.angle,
                            brokeTombstone: false
                        });
                    }
                }
                return;
            }

            // 4. ATTAQUE DE BASE : Coup de massue (zone mortelle 8 flancs + recul si à découvert)
            if (t.meleeChargeEnd > 0) {
                if (now >= t.meleeChargeEnd) {
                    t.meleeChargeEnd = 0;
                    t.cooldownEnd = now + (t.hp === 1 ? BOSS_COOLDOWN_P3_MS : BOSS_COOLDOWN_MS);
                    t.slamAnimStart = now;
                    t.slamAnimEnd = now + 350;
                    t.slamType = 'melee';
                    if (t.hp === 1) t.phase3Step = 'charge';

                    // Écrase et supprime tout Mini-Troll situé sur les 8 cases collées aux flancs du Boss
                    if (currentLevel.miniTrolls.length > 0) {
                        currentLevel.miniTrolls = currentLevel.miniTrolls.filter(
                            mt => !isOnBossFlank(t, mt.x, mt.y)
                        );
                    }

                    // Tue instantanément le joueur s'il est sur l'une des 8 cases collées aux flancs du Boss
                    if (isOnBossFlank(t, player.x, player.y)) {
                        triggerGameOver("Tu as été écrasé par la massue du Troll 🧌 !", "troll");
                        return;
                    }

                    // Applique le recul uniquement si aucune tombe (2) ni mur (1) ne protège le joueur
                    if (inArena18x18 && checkStrictSight()) {
                        const diffX = player.x - (t.x + 0.5);
                        const diffY = player.y - (t.y + 0.5);
                        let pushX = 0, pushY = 0;
                        if (Math.abs(diffX) >= Math.abs(diffY)) {
                            pushX = diffX >= 0 ? 1 : -1;
                        } else {
                            pushY = diffY >= 0 ? 1 : -1;
                        }
                        if (applyKnockbackWithWallHurt(pushX, pushY, BOSS_MELEE_PUSH_STEPS)) return;
                    }
                }
                return;
            }

            // 5. Temps de répit entre deux attaques
            if (now < (t.cooldownEnd || 0)) return;

            // Vérifie que le joueur est dans la zone 18x18 et visible
            if (!inArena18x18 || !checkSight()) {
                t.behindCoverSince = null;
                return;
            }

            // --- DÉCISION D'ATTAQUE SELON LA PHASE ---
            if (t.hp === 1) {
                if (!t.phase3Step) t.phase3Step = 'classic';

                if (t.phase3Step === 'classic') {
                    t.meleeChargeEnd = now + BOSS_MELEE_CHARGE_MS;
                } else {
                    t.dashChargeEnd = now + BOSS_DASH_CHARGE_MS;
                    t.dashAim = computeChargeDashAim(t);
                }
            } else {
                if (isBehindTombstone()) {
                    if (!t.behindCoverSince) t.behindCoverSince = now;
                } else {
                    t.behindCoverSince = null;
                }

                const stayedBehindCover = t.behindCoverSince && (now - t.behindCoverSince >= BOSS_COVER_TRIGGER_MS);
                t.attackCount = (t.attackCount || 0) + 1;

                if (stayedBehindCover || t.attackCount % BOSS_POWER_EVERY_N_ATTACKS === 0) {
                    t.behindCoverSince = null;
                    t.chargedEnd = now + BOSS_POWER_CHARGE_MS;
                    t.chargedAim = computePowerfulShotAim(t);
                } else {
                    t.meleeChargeEnd = now + BOSS_MELEE_CHARGE_MS;
                }
            }
        });
    }

    // --- D. DÉPLACEMENT DE L'ONDE DE CHOC DU TIR PUISSANT ---
    if (currentLevel.shockwaves) {
        const keptWaves = [];
        currentLevel.shockwaves.forEach(sw => {
            sw.x += sw.dirX * BOSS_SHOCKWAVE_SPEED * dt;
            sw.y += sw.dirY * BOSS_SHOCKWAVE_SPEED * dt;

            const gx = Math.round(sw.x);
            const gy = Math.round(sw.y);
            const tile = currentLevel.map[gy] && currentLevel.map[gy][gx];

            if (tile === undefined || tile === 1) return;

            if (tile === 2) {
                if (!sw.brokeTombstone) {
                    sw.brokeTombstone = true;
                    currentLevel.map[gy][gx] = 0;
                    currentLevel.tombstones = currentLevel.tombstones.filter(tb => !(tb.x === gx && tb.y === gy));
                } else {
                    return;
                }
            }

            if (currentLevel.miniTrolls.length > 0) {
                currentLevel.miniTrolls = currentLevel.miniTrolls.filter(
                    mt => Math.hypot(sw.x - mt.x, sw.y - mt.y) >= 0.7
                );
            }

            if (Math.hypot(sw.x - player.x, sw.y - player.y) < 0.6) {
                triggerGameOver("Tu as été pulvérisé par l'onde de choc du Troll 🧌 !", "troll");
                return;
            }

            keptWaves.push(sw);
        });
        currentLevel.shockwaves = keptWaves;
    }

    // --- E. IA DES MINI-TROLLS (1x1 — PHASE 2) ---
    if (currentLevel.miniTrolls && currentLevel.miniTrolls.length > 0) {
        const survivors = new Set(currentLevel.miniTrolls);

        currentLevel.miniTrolls.forEach(mt => {
            if (!survivors.has(mt)) return;

            // 1. Exécution du coup de massue après charge
            if (mt.chargeEnd > 0) {
                if (now >= mt.chargeEnd) {
                    mt.chargeEnd = 0;
                    mt.lastMoveTime = now;
                    mt.slamAnimStart = now;
                    mt.slamAnimEnd = now + 280;

                    const dx = mt.aimDir.dx;
                    const dy = mt.aimDir.dy;
                    const perpX = -dy;
                    const perpY = dx;

                    const redTiles = [
                        { x: mt.x + dx, y: mt.y + dy },
                        { x: mt.x + 2 * dx, y: mt.y + 2 * dy }
                    ];

                    const firstWall = currentLevel.map[redTiles[0].y] && currentLevel.map[redTiles[0].y][redTiles[0].x] === 1;
                    const activeRedTiles = firstWall ? [redTiles[0]] : redTiles;

                    if (activeRedTiles.some(rt => rt.x === player.x && rt.y === player.y)) {
                        triggerGameOver("Tu as été écrasé par la massue d'un Mini-Troll 🧌 !", "troll");
                        return;
                    }

                    survivors.forEach(other => {
                        if (other !== mt && activeRedTiles.some(rt => rt.x === other.x && rt.y === other.y)) {
                            survivors.delete(other);
                        }
                    });

                    const greyTiles = [
                        { x: mt.x + perpX, y: mt.y + perpY },
                        { x: mt.x + dx + perpX, y: mt.y + dy + perpY },
                        { x: mt.x - perpX, y: mt.y - perpY },
                        { x: mt.x + dx - perpX, y: mt.y + dy - perpY },
                        { x: mt.x + 3 * dx, y: mt.y + 3 * dy }
                    ];

                    if (greyTiles.some(gt => gt.x === player.x && gt.y === player.y)) {
                        if (applyKnockbackWithWallHurt(dx, dy, MINI_TROLL_PUSH_STEPS)) return;
                    }
                }
                return;
            }

            // 2. Déclenchement de la charge dès qu'il est adjacent au joueur (distance 1)
            const distToPlayer = Math.abs(player.x - mt.x) + Math.abs(player.y - mt.y);
            if (distToPlayer === 1) {
                mt.aimDir = {
                    dx: Math.sign(player.x - mt.x),
                    dy: Math.sign(player.y - mt.y)
                };
                mt.chargeEnd = now + MINI_TROLL_CHARGE_MS;
                return;
            }

            // 3. Déplacement pas à pas vers le joueur
            if (now - mt.lastMoveTime < MINI_TROLL_STEP_MS) return;
            mt.lastMoveTime = now;

            const canStep = (tx, ty) => {
                const tile = currentLevel.map[ty] && currentLevel.map[ty][tx];
                if (tile !== 0) return false;
                if (tx === player.x && ty === player.y) return false;
                for (const other of survivors) {
                    if (other !== mt && other.x === tx && other.y === ty) return false;
                }
                return true;
            };

            const candidates = [
                { x: mt.x + 1, y: mt.y },
                { x: mt.x - 1, y: mt.y },
                { x: mt.x, y: mt.y + 1 },
                { x: mt.x, y: mt.y - 1 }
            ].sort((a, b) => Math.hypot(player.x - a.x, player.y - a.y) - Math.hypot(player.x - b.x, player.y - b.y));

            for (const c of candidates) {
                if (canStep(c.x, c.y)) {
                    mt.fromX = mt.x;
                    mt.fromY = mt.y;
                    mt.x = c.x;
                    mt.y = c.y;
                    mt.stepStartTime = now;
                    break;
                }
            }
        });

        currentLevel.miniTrolls = Array.from(survivors);
    }
}

// Vérifie si une case est déjà occupée par un autre Vampire vivant ou un Zombie
function isTileOccupiedByUndead(x, y, selfEntity) {
    const hasVampire = currentLevel.vampires.some(v => v !== selfEntity && v.alive && v.x === x && v.y === y);
    const hasZombie = currentLevel.zombies.some(z => z !== selfEntity && z.x === x && z.y === y);
    return hasVampire || hasZombie;
}

// IA des Zombies : repos 3x3, traque 4s hors vue et retour 5 pas
function updateZombies(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon) return;

    const canMoveTo = (tx, ty, selfZombie) => {
        return currentLevel.map[ty] && currentLevel.map[ty][tx] === 0 && !isTileOccupiedByUndead(tx, ty, selfZombie);
    };

    currentLevel.zombies.forEach(z => {
        if (now - z.lastCheck < 550) return;
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
                z.returnSteps = 10;
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
                        if (canMoveTo(tx, ty, z)) {
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
                if (canMoveTo(z.x + stepX, z.y, z)) {
                    nextX = z.x + stepX;
                } else if (stepY !== 0 && canMoveTo(z.x, z.y + stepY, z)) {
                    nextY = z.y + stepY;
                }
            } else if (stepY !== 0) {
                if (canMoveTo(z.x, z.y + stepY, z)) {
                    nextY = z.y + stepY;
                } else if (stepX !== 0 && canMoveTo(z.x + stepX, z.y, z)) {
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

// IA DE L'ARAIGNÉE 🕷️ : SURVEILLANCE 3x3
function updateSpiders(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.spiders) return;

    const player = currentLevel.player;

    currentLevel.spiders.forEach(s => {
        if (s.x === player.x && s.y === player.y) {
            triggerGameOver("Une araignée 🕷️ t'a dévoré !", "spider");
            return;
        }

        const inNestZone = Math.abs(player.x - s.spawnX) <= 1 && Math.abs(player.y - s.spawnY) <= 1;
        if (s.state === 'idle' && inNestZone) {
            s.state = 'hunting';
        }

        if (s.state === 'waiting' && s.targetWebX !== null) {
            const inWebZone = Math.abs(player.x - s.targetWebX) <= 1 && Math.abs(player.y - s.targetWebY) <= 1;
            if (inWebZone) {
                s.state = 'hunting';
            }
        }

        if (s.state === 'hunting') {
            s.targetX = player.x;
            s.targetY = player.y;
        }

        if (s.state === 'investigating' && s.x === s.targetWebX && s.y === s.targetWebY) {
            s.state = 'waiting';
            s.waitEndTime = now +1200;
        }

        if (s.state === 'waiting') {
            if (now >= s.waitEndTime) {
                s.state = 'returning';
                s.targetX = s.spawnX;
                s.targetY = s.spawnY;
            } else {
                return;
            }
        }

        if (s.state === 'returning' && s.x === s.spawnX && s.y === s.spawnY) {
            s.state = 'idle';
            s.targetWebX = null;
            s.targetWebY = null;
        }

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
            const nextTile = currentLevel.map[nextY] && currentLevel.map[nextY][nextX];

            // Bloque uniquement sur le Boss Troll (3), escalade les murs (1) et les tombes (2)
            if (nextTile === 3) return;
            if (nextY >= 0 && nextY < currentLevel.rows && nextX >= 0 && nextX < currentLevel.cols) {
                const currTile = currentLevel.map[s.y] && currentLevel.map[s.y][s.x];
                const currentIsObstacle = (currTile === 1 || currTile === 2);
                const nextIsObstacle = (nextTile === 1 || nextTile === 2);

                const duration = (currentIsObstacle || nextIsObstacle) ? 450 : 125;

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

// IA DE LA SORCIÈRE 🧙‍♀️
function updateWitches(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.witches) return;

    const player = currentLevel.player;
    const isPlayerHidden = player.pumpkinPowerTime > 0;

    const WITCH_BURST_CHANCE = 0.05;
    const WITCH_STEP_DURATION = 1500; 
    const WITCH_STEP_PAUSE = 1500; 
    const WITCH_MIN_STEP_DELAY = WITCH_STEP_DURATION + WITCH_STEP_PAUSE; 
    const WITCH_COOLDOWN_MS = 2500; 
    const WITCH_CHANNEL_MS = 750; 
    const WITCH_PATROL_INTERVAL = 3000; 

    currentLevel.witches.forEach(w => {
        if (!w.lastPatrolTime) w.lastPatrolTime = now;
        if (!w.nextCastTime) w.nextCastTime = 0;

        if (w.x === player.x && w.y === player.y) {
            if (!w.isBurst && now >= (w.nextBurstTime || 0)) {
                w.state = 'channeling';
                w.isBurst = true;
                w.channelEndTime = now + WITCH_CHANNEL_MS;
                return;
            }
        }

        const dist = Math.hypot(player.x - w.x, player.y - w.y);
        const inBox12x12 = Math.abs(player.x - w.x) <= 6 && Math.abs(player.y - w.y) <= 6;
        const canSee = !isPlayerHidden && inBox12x12 && hasLineOfSight(w.x, w.y, player.x, player.y);

        if (w.state === 'channeling') {
            if (now >= w.channelEndTime) {
                w.state = 'idle';
                w.nextCastTime = now + WITCH_COOLDOWN_MS;
                w.lastPatrolTime = now;

                if (w.isBurst) {
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

        if (canSee && now >= w.nextCastTime) {
            w.state = 'channeling';
            w.channelEndTime = now + WITCH_CHANNEL_MS;
            w.isBurst = Math.random() < WITCH_BURST_CHANCE;
            return;
        }

        if (w.stepStartTime && (now - w.stepStartTime < WITCH_MIN_STEP_DELAY)) {
            return;
        }

        let didKite = false;
        if (!isPlayerHidden && dist < 4) {
            const candidates = [
                { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
            ].sort((a, b) => {
                const distA = Math.hypot(player.x - (w.x + a.dx), player.y - (w.y + a.dy));
                const distB = Math.hypot(player.x - (w.x + b.dx), player.y - (w.y + b.dy));
                return distB - distA;
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
                    w.stepStartTime = now;
                    didKite = true;
                    break;
                }
            }
        }

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
                    w.stepStartTime = now;
                    break;
                }
            }
        }
    });
}

// IA DE LA CHAUVE-SOURIS 🦇
function updateBats(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon || !currentLevel.bats) return;

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

        const canX = isFree(bat.x + dx, bat.y);
        const canY = isFree(bat.x, bat.y + dy);
        const canDiag = isFree(bat.x + dx, bat.y + dy);

        if (canDiag && (canX || canY)) {
            // Continue en diagonale
        } else if (!canX && canY && isFree(bat.x - dx, bat.y + dy)) {
            dx = -dx;
        } else if (canX && !canY && isFree(bat.x + dx, bat.y - dy)) {
            dy = -dy;
        } else {
            if (isFree(bat.x - dx, bat.y - dy)) {
                dx = -dx;
                dy = -dy;
            } else if (isFree(bat.x - dx, bat.y + dy)) {
                dx = -dx;
            } else if (isFree(bat.x + dx, bat.y - dy)) {
                dy = -dy;
            } else {
                return;
            }
        }

        bat.dirX = dx;
        bat.dirY = dy;
        bat.fromX = bat.x;
        bat.fromY = bat.y;
        bat.x += dx;
        bat.y += dy;
        bat.stepStartTime = now;

        if (bat.x === currentLevel.player.x && bat.y === currentLevel.player.y) {
            triggerGameOver("Une chauve-souris 🦇 t'a percuté en plein vol !", "bat");
        }
    });
}
// =========================================================================
// IA DU CRÂNE ERRANT 💀 & DE LA TÊTE DE MORT ☠️ (8 DIRECTIONS + COLLECTE D'OS)
// =========================================================================
function updateSkullsAndBones(now) {
    if (!currentLevel || !gameStarted || isGameOver || hasWon) return;

    // --- CONSTANTES D'ÉQUILIBRAGE ---
    const SKULL_WANDER_STEP_MS = 850;           // Vitesse d'errance du Crâne 💀
    const SKULL_HUNT_BONE_STEP_MS = 300;        // Vitesse accélérée vers un os activé 🦴
    const DEATH_HEAD_STEP_MS = 750;             // Vitesse de déplacement de la Tête de Mort ☠️
    const DEATH_HEAD_ATTACK_INTERVAL_MS = 1700; // Explosion d'os
    const DEATH_HEAD_CHARGE_MS = 350;           // Télégraphe visuel avant le tir en croix X
    const BONE_PROJECTILE_SPEED = 10;            // Vitesse des 4 os projetés en diagonale

    const dt = Math.min((now - (currentLevel._lastSkullTick || now)) / 1000, 0.05);
    currentLevel._lastSkullTick = now;

    const player = currentLevel.player;
    if (!currentLevel.skulls) currentLevel.skulls = [];
    if (!currentLevel.bones) currentLevel.bones = [];
    if (!currentLevel.boneProjectiles) currentLevel.boneProjectiles = [];

    const DIRS_8 = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
    ];

    // Vérifie si une case est praticable (ni mur 1, ni tombe 2, ni boss 3, ni porte, ni autre crâne)
    const isTileFreeForSkull = (tx, ty, selfSkull) => {
        if (ty < 0 || ty >= currentLevel.rows || tx < 0 || tx >= currentLevel.cols) return false;
        if (currentLevel.map[ty][tx] !== 0) return false;
        if (currentLevel.exit && tx === currentLevel.exit.x && ty === currentLevel.exit.y) return false;
        if (currentLevel.miniTrolls && currentLevel.miniTrolls.some(mt => mt.x === tx && mt.y === ty)) return false;
        if (currentLevel.skulls.some(other => other !== selfSkull && other.x === tx && other.y === ty)) return false;
        return true;
    };

    // Repousse le joueur d'1 case sans blessure murale ni Game Over (contact Crâne 💀)
    const pushPlayerOneTile = (fromX, fromY) => {
        let pushX = Math.sign(player.x - fromX);
        let pushY = Math.sign(player.y - fromY);
        if (pushX === 0 && pushY === 0) pushY = 1;

        const candidates = [
            { dx: pushX, dy: pushY },
            { dx: pushX, dy: 0 },
            { dx: 0, dy: pushY },
            { dx: -pushY, dy: pushX },
            { dx: pushY, dy: -pushX }
        ].filter(d => d.dx !== 0 || d.dy !== 0);

        for (const d of candidates) {
            const nx = player.x + d.dx;
            const ny = player.y + d.dy;
            const tile = currentLevel.map[ny] && currentLevel.map[ny][nx];
            const hasSkull = currentLevel.skulls.some(s => s.x === nx && s.y === ny);
            const hasMini = currentLevel.miniTrolls && currentLevel.miniTrolls.some(mt => mt.x === nx && mt.y === ny);

            if (tile === 0 && !hasSkull && !hasMini) {
                player.fromX = player.x;
                player.fromY = player.y;
                player.x = nx;
                player.y = ny;
                player.moveStartTime = now;

                // Alerte l'araignée la plus proche si le joueur atterrit sur une toile 🕸️
                const landedOnWeb = currentLevel.slowTiles && currentLevel.slowTiles.some(t => t.x === nx && t.y === ny);
                if (landedOnWeb && currentLevel.spiders && currentLevel.spiders.length > 0) {
                    let closestSpider = null;
                    let minDistance = Infinity;

                    currentLevel.spiders.forEach(sp => {
                        const dist = Math.hypot(sp.x - nx, sp.y - ny);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestSpider = sp;
                        }
                    });

                    if (closestSpider) {
                        closestSpider.state = 'investigating';
                        closestSpider.targetWebX = nx;
                        closestSpider.targetWebY = ny;
                        closestSpider.targetX = nx;
                        closestSpider.targetY = ny;
                    }
                }
                return;
            }
        }
    };

    // Vérifie par BFS si un crâne peut atteindre un os dans sa salle fermée
    const canSkullReachBone = (skull, bone) => {
        const visited = new Set([`${skull.x},${skull.y}`]);
        const queue = [{ x: skull.x, y: skull.y }];

        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr.x === bone.x && curr.y === bone.y) return true;

            for (const d of DIRS_8) {
                const nx = curr.x + d.dx;
                const ny = curr.y + d.dy;
                if (ny < 0 || ny >= currentLevel.rows || nx < 0 || nx >= currentLevel.cols) continue;
                if (currentLevel.map[ny][nx] !== 0) continue;

                const key = `${nx},${ny}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ x: nx, y: ny });
                }
            }
        }
        return false;
    };

    // --- A. DÉCLENCHEMENT DES OS AU SOL 🦴 PAR LE JOUEUR ---
    currentLevel.bones.forEach(bone => {
        if (bone.collected) return;

        if (!bone.triggered && player.x === bone.x && player.y === bone.y) {
            bone.triggered = true;

            // Assigne cet os en cible prioritaire au Crâne le plus proche dans la même salle
            let bestSkull = null;
            let bestDist = Infinity;

            currentLevel.skulls.forEach(s => {
                if (s.isTransformed) return;
                if (s.targetBone && !s.targetBone.collected) return;
                if (!canSkullReachBone(s, bone)) return;

                const d = Math.hypot(bone.x - s.x, bone.y - s.y);
                if (d < bestDist) {
                    bestDist = d;
                    bestSkull = s;
                }
            });

            if (bestSkull) {
                bestSkull.targetBone = bone;
            }
        }
    });

    // --- B. DÉPLACEMENT & COMPORTEMENT DES CRÂNES 💀 / TÊTES DE MORT ☠️ ---
    currentLevel.skulls.forEach(s => {
        // Collision permanente avec le joueur
        if (s.x === player.x && s.y === player.y) {
            if (s.isTransformed) {
                triggerGameOver("Tu as été foudroyé par la Tête de Mort ☠️ !", "skull");
                return;
            } else {
                pushPlayerOneTile(s.fromX, s.fromY);
            }
        }

        // Phase 2 : Gestion de la charge et du tir en croix diagonale (X) de la Tête de Mort ☠️
        if (s.isTransformed) {
            if (!s.lastAttackTime) s.lastAttackTime = now;

            if (s.chargeEnd > 0) {
                if (now >= s.chargeEnd) {
                    s.chargeEnd = 0;
                    s.lastAttackTime = now;

                    // Projette 4 os simultanément dans les 4 diagonales
                    const diags = [
                        { dx: -1, dy: -1 },
                        { dx: 1, dy: -1 },
                        { dx: -1, dy: 1 },
                        { dx: 1, dy: 1 }
                    ];
                    diags.forEach(d => {
                        const norm = Math.SQRT1_2;
                        currentLevel.boneProjectiles.push({
                            x: s.x,
                            y: s.y,
                            dirX: d.dx * norm,
                            dirY: d.dy * norm,
                            angle: Math.atan2(d.dy, d.dx)
                        });
                    });
                }
            } else if (now - s.lastAttackTime >= DEATH_HEAD_ATTACK_INTERVAL_MS) {
                // Déclenche le télégraphe de charge uniquement si le joueur est à portée dans la salle
                const distToPlayer = Math.hypot(player.x - s.x, player.y - s.y);
                if (distToPlayer <= 12 && hasLineOfSight(s.x, s.y, player.x, player.y)) {
                    s.chargeEnd = now + DEATH_HEAD_CHARGE_MS;
                } else {
                    s.lastAttackTime = now - DEATH_HEAD_ATTACK_INTERVAL_MS + 400;
                }
            }
        }

        // Cadence de déplacement selon l'état
        const hasActiveTarget = !s.isTransformed && s.targetBone && !s.targetBone.collected;
        const stepDelay = s.isTransformed
            ? DEATH_HEAD_STEP_MS
            : (hasActiveTarget ? SKULL_HUNT_BONE_STEP_MS : SKULL_WANDER_STEP_MS);

        if (!s.lastMoveTime) s.lastMoveTime = now - Math.floor(Math.random() * stepDelay);
        if (now - s.lastMoveTime < stepDelay) return;
        s.lastMoveTime = now;

        // Liste des cases voisines valides (Roi aux échecs — 8 directions)
        const validMoves = [];
        for (const d of DIRS_8) {
            const nx = s.x + d.dx;
            const ny = s.y + d.dy;
            if (isTileFreeForSkull(nx, ny, s)) {
                validMoves.push({ x: nx, y: ny });
            }
        }

        if (validMoves.length === 0) return;

        let chosen = null;

        if (!s.isTransformed && hasActiveTarget) {
            // Fonce en ligne droite/diagonale (distance de Chebyshev) vers l'os verrouillé
            validMoves.sort((a, b) => {
                const distA = Math.max(Math.abs(s.targetBone.x - a.x), Math.abs(s.targetBone.y - a.y));
                const distB = Math.max(Math.abs(s.targetBone.x - b.x), Math.abs(s.targetBone.y - b.y));
                return distA - distB;
            });
            chosen = validMoves[0];
        } else if (s.isTransformed && hasLineOfSight(s.x, s.y, player.x, player.y) && Math.random() < 0.65) {
            // Tête de Mort ☠️ : tend légèrement vers le joueur tout en gardant un déplacement erratique
            validMoves.sort((a, b) => {
                const distA = Math.hypot(player.x - a.x, player.y - a.y);
                const distB = Math.hypot(player.x - b.x, player.y - b.y);
                return distA - distB;
            });
            chosen = validMoves[0];
        } else {
            // Errance aléatoire dans les 8 directions
            chosen = validMoves[Math.floor(Math.random() * validMoves.length)];
        }

        if (chosen) {
            const prevX = s.x;
            const prevY = s.y;
            s.fromX = prevX;
            s.fromY = prevY;
            s.x = chosen.x;
            s.y = chosen.y;
            s.moveStartTime = now;

            // Vérifie le contact ou le croisement avec le joueur après le pas
            if (s.x === player.x && s.y === player.y) {
                if (s.isTransformed) {
                    triggerGameOver("Tu as été foudroyé par la Tête de Mort ☠️ !", "skull");
                    return;
                } else {
                    pushPlayerOneTile(prevX, prevY);
                }
            }

            // Phase 1 : Collecte d'un os au sol 🦴
            if (!s.isTransformed) {
                const steppedBone = currentLevel.bones.find(b => !b.collected && b.x === s.x && b.y === s.y);
                if (steppedBone) {
                    steppedBone.collected = true;
                    s.bonesCollected = (s.bonesCollected || 0) + 1;
                    if (s.targetBone === steppedBone) {
                        s.targetBone = null;
                    }

                    // Fusion définitive en Tête de Mort ☠️ dès 2 os collectés
                    if (s.bonesCollected >= 2) {
                        s.isTransformed = true;
                        s.targetBone = null;
                        s.lastAttackTime = now;
                    }
                }
            }
        }
    });

    // --- C. VOL DES PROJECTILES D'OS EN DIAGONALE 🦴 ---
    if (currentLevel.boneProjectiles.length > 0) {
        const keptProjectiles = [];
        currentLevel.boneProjectiles.forEach(bp => {
            bp.x += bp.dirX * BONE_PROJECTILE_SPEED * dt;
            bp.y += bp.dirY * BONE_PROJECTILE_SPEED * dt;
            bp.angle = (bp.angle || 0) + dt * 14;

            const gx = Math.round(bp.x);
            const gy = Math.round(bp.y);
            const tile = currentLevel.map[gy] && currentLevel.map[gy][gx];

            // Les Pierres Tombales (2) laissent passer les os ; seuls les murs (1) et le Boss (3) les bloquent
            if (tile === undefined || tile === 1 || tile === 3) return;

            if (Math.hypot(bp.x - player.x, bp.y - player.y) < 0.55) {
                triggerGameOver("Tu as été transpercé par un os maudit 🦴 !", "skull");
                return;
            }

            keptProjectiles.push(bp);
        });
        currentLevel.boneProjectiles = keptProjectiles;
    }
}