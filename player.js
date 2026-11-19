/* ==========================================================================
   3. PLAYER.JS — DÉPLACEMENTS, INTERACTIONS, CHECKPOINT & FIN DE PARTIE
   ========================================================================== */

function movePlayer(dx, dy) {
    if (!gameStarted || isGameOver || hasWon || !currentLevel) return;
    const now = Date.now();

    const onSlowTile = currentLevel.slowTiles && currentLevel.slowTiles.some(t => t.x === currentLevel.player.x && t.y === currentLevel.player.y);
    const isKnockbackSlowed = (currentLevel.player.slowDebuffEndTime || 0) > now;
    const requiredDelay = isKnockbackSlowed ? 650 : (onSlowTile ? 500 : (currentLevel.player.pumpkinPowerTime > 0 ? 333 : 0));

    if (requiredDelay > 0 && (now - currentLevel.player.moveStartTime < requiredDelay)) {
        return;
    }

    currentLevel.player.fromX = currentLevel.player.x;
    currentLevel.player.fromY = currentLevel.player.y;
    currentLevel.player.moveStartTime = now;

    const newX = currentLevel.player.x + dx;
    const newY = currentLevel.player.y + dy;

    // Bloque si Mur (1), Pierre Tombale (2) ou Troll (3)
    if (currentLevel.map[newY] === undefined || currentLevel.map[newY][newX] !== 0) return;

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
                    map: JSON.parse(JSON.stringify(currentLevel.map)),
                    coins: JSON.parse(JSON.stringify(currentLevel.coins || [])),
                    keys: JSON.parse(JSON.stringify(currentLevel.keys || [])),
                    garlics: JSON.parse(JSON.stringify(currentLevel.garlics || [])),
                    pumpkins: JSON.parse(JSON.stringify(currentLevel.pumpkins || [])),
                    garlicPowerTime: currentLevel.player.garlicPowerTime || 0,
                    pumpkinPowerTime: currentLevel.player.pumpkinPowerTime || 0,
                    vampires: JSON.parse(JSON.stringify(currentLevel.vampires || [])),
                    zombies: JSON.parse(JSON.stringify(currentLevel.zombies || [])),
                    witches: JSON.parse(JSON.stringify(currentLevel.witches || [])),
                    spiders: JSON.parse(JSON.stringify(currentLevel.spiders || [])),
                    bats: JSON.parse(JSON.stringify(currentLevel.bats || [])),
                    trolls: JSON.parse(JSON.stringify(currentLevel.trolls || [])),
                    tombstones: JSON.parse(JSON.stringify(currentLevel.tombstones || [])),
                    bows: JSON.parse(JSON.stringify(currentLevel.bows || [])),
                    skulls: JSON.parse(JSON.stringify(currentLevel.skulls || [])),
                    bones: JSON.parse(JSON.stringify(currentLevel.bones || []))
                };
            }
        });
    }

    // 1. Alerte UNIQUEMENT l'araignée la plus proche de la toile 🕸️
    const steppedOnWeb = currentLevel.slowTiles && currentLevel.slowTiles.some(t => t.x === newX && t.y === newY);
    if (steppedOnWeb && currentLevel.spiders && currentLevel.spiders.length > 0) {
        let closestSpider = null;
        let minDistance = Infinity;

        currentLevel.spiders.forEach(s => {
            const dist = Math.hypot(s.x - newX, s.y - newY);
            if (dist < minDistance) {
                minDistance = dist;
                closestSpider = s;
            }
        });

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

    // Bloque le passage si la case visée est un émetteur laser
    const hitCannon = currentLevel.cannons && currentLevel.cannons.some(c => c.x === newX && c.y === newY);
    if (hitCannon) return;

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
    // Collision Crânes Errants 💀 & Têtes de Mort ☠️
    if (currentLevel.skulls) {
        const hitSkull = currentLevel.skulls.find(s => s.x === newX && s.y === newY);
        if (hitSkull) {
            if (hitSkull.isTransformed) {
                triggerGameOver("Tu as été foudroyé par la Tête de Mort ☠️ !", "skull");
                render();
                return;
            } else {
                // Repousse le joueur d'1 case en arrière s'il fonce sur un Crâne inoffensif
                const backX = currentLevel.player.fromX;
                const backY = currentLevel.player.fromY;
                if (currentLevel.map[backY] && currentLevel.map[backY][backX] === 0) {
                    currentLevel.player.x = backX;
                    currentLevel.player.y = backY;
                }
            }
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

    // Arrivée Porte 🚪 (verrouillée tant qu'il reste des clés OU un Troll vivant)
    if (newX === currentLevel.exit.x && newY === currentLevel.exit.y) {
        const remainingKeys = currentLevel.keys.filter(k => !k.collected).length;
        const aliveTroll = currentLevel.trolls && currentLevel.trolls.some(t => t.alive);

        if (remainingKeys > 0 || aliveTroll) {
            if (aliveTroll && remainingKeys > 0) {
                overlayMsg.textContent = `La porte est verrouillée ! Élimine d'abord le Troll 🧌 et trouve les ${remainingKeys} clé(s) manquante(s) 🔑 !`;
            } else if (aliveTroll) {
                overlayMsg.textContent = "La porte est verrouillée ! Tu dois d'abord vaincre le Troll 🧌 !";
            } else {
                overlayMsg.textContent = `La porte est verrouillée ! Trouve d'abord les ${remainingKeys} clé(s) manquante(s) 🔑 !`;
            }
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

function respawnAtCheckpoint() {
    if (!currentLevel || !currentLevel.lastCheckpoint) return;
    const snap = currentLevel.lastCheckpoint;
    const now = Date.now();

    // 1. Replacer le joueur et réinitialiser ses malus/bonus
    currentLevel.player.x = snap.x;
    currentLevel.player.y = snap.y;
    currentLevel.player.fromX = snap.x;
    currentLevel.player.fromY = snap.y;
    currentLevel.player.moveStartTime = now;
    currentLevel.player.garlicPowerTime = snap.garlicPowerTime || 0;
    currentLevel.player.pumpkinPowerTime = snap.pumpkinPowerTime || 0;
    currentLevel.player.slowDebuffEndTime = 0;
    currentLevel.player.wallHurtEndTime = 0;

    // 2. Restaurer la matrice et les objets
    if (snap.map) currentLevel.map = JSON.parse(JSON.stringify(snap.map));
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

    // 3. Restaurer les monstres
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

    if (snap.trolls) {
        currentLevel.trolls = JSON.parse(JSON.stringify(snap.trolls));
        currentLevel.trolls.forEach(t => {
            t.meleeChargeEnd = 0;
            t.chargedEnd = 0;
            t.chargedAim = null;
            t.dashChargeEnd = 0;
            t.dashAim = null;
            t.isDashing = false;
            t.stunEnd = 0;
            t.cooldownEnd = now + 1000;
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

    // 4. Nettoyer tous les projectiles et effets en cours
    currentLevel.potions = [];
    currentLevel.potionSplashes = [];
    currentLevel.acidPuddles = [];
    currentLevel.bombs = [];
    currentLevel.arrows = [];
    currentLevel.shockwaves = [];
    currentLevel.miniTrolls = [];
    currentLevel.boneProjectiles = [];
    currentLevel.tpEffect = null;

    // 5. Relancer la partie
    isGameOver = false;
    hasWon = false;

    updateStatsUI();
    if (overlay) overlay.style.display = "none";
    render();
}