/* ==========================================================================
   4. RENDER.JS — MOTEUR GRAPHIQUE CANVAS & EFFETS VISUELS
   ========================================================================== */

function render() {
    if (!ctx || !currentLevel || cellSize <= 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderNow = Date.now();
    const dyingBoss = currentLevel.trolls && currentLevel.trolls.find(t => t.alive && t.dyingEndTime > renderNow);
    if (dyingBoss) {
        const totalDeathMs = (dyingBoss.dyingEndTime - dyingBoss.dyingStartTime) || 1500;
        const deathProgress = Math.min(1, Math.max(0, (renderNow - dyingBoss.dyingStartTime) / totalDeathMs));
        const shakeAmp = 5 * (1 - deathProgress);
        const shakeX = (Math.random() * 2 - 1) * shakeAmp;
        const shakeY = (Math.random() * 2 - 1) * shakeAmp;
        ctx.save();
        ctx.translate(shakeX, shakeY);
    }
    // --- PARAMÈTRE MODIFIABLE DE LA VUE ARÈNE BOSS ---
    const BOSS_ARENA_VIEW_SIZE = 20; // Zone affichée : 20×20 cases (colonnes 0 à 19, lignes 0 à 19)

    // 1. Détection actuelle du Boss Troll actif et verrouillage dans son arène
    const activeBoss = currentLevel.trolls && currentLevel.trolls.find(t => t.alive);
    let lockBossArena = false;

    if (activeBoss) {
        const bx = activeBoss.spawnX !== undefined ? activeBoss.spawnX : activeBoss.x;
        const by = activeBoss.spawnY !== undefined ? activeBoss.spawnY : activeBoss.y;
        const inArena = Math.abs(currentLevel.player.x - (bx + 0.5)) <= 9 &&
                        Math.abs(currentLevel.player.y - (by + 0.5)) <= 9 ;

        if (inArena) activeBoss.cameraLocked = true;
        if (activeBoss.cameraLocked || (currentLevel.cols <= 22 && currentLevel.rows <= 22)) {
            lockBossArena = true;
        }
    }

    const isLarge = currentLevel.cols >= 18 || currentLevel.rows >= 18;
    const useCamera = isLarge || lockBossArena;

    let minX = 0, maxX = currentLevel.cols - 1;
    let minY = 0, maxY = currentLevel.rows - 1;

    if (useCamera) {
        ctx.save();

        if (typeof window.cameraScale !== 'number') window.cameraScale = 1;

        let targetCamX = 0;
        let targetCamY = 0;
        let targetScale = 1;
        let camLerp = 0.12;

        if (lockBossArena && activeBoss) {
            // Origine fixée en haut à gauche de la matrice (0, 0) sur BOSS_ARENA_VIEW_SIZE × BOSS_ARENA_VIEW_SIZE cases
            targetCamX = 0;
            targetCamY = 0;
            targetScale = Math.min(
                canvas.width / (BOSS_ARENA_VIEW_SIZE * cellSize),
                canvas.height / (BOSS_ARENA_VIEW_SIZE * cellSize)
            );
            camLerp = 0.05; // Transition fluide vers la vue fixe de l'arène
        } else {
            // Caméra libre centrée sur le joueur
            const playerScreenTargetX = currentLevel.player.x * cellSize + cellSize / 2;
            const playerScreenTargetY = currentLevel.player.y * cellSize + cellSize / 2;
            targetCamX = Math.min(0, Math.max(canvas.width - currentLevel.cols * cellSize, canvas.width / 2 - playerScreenTargetX));
            targetCamY = Math.min(0, Math.max(canvas.height - currentLevel.rows * cellSize, canvas.height / 2 - playerScreenTargetY));
            targetScale = 1;

            const isJustTeleported = (Date.now() - (currentLevel.lastTpTime || 0)) < 600;
            camLerp = isJustTeleported ? 0.35 : 0.12;
        }

        // Interpolation fluide de la position et du zoom
        cameraX += (targetCamX - cameraX) * camLerp;
        cameraY += (targetCamY - cameraY) * camLerp;
        window.cameraScale += (targetScale - window.cameraScale) * camLerp;

        ctx.scale(window.cameraScale, window.cameraScale);
        ctx.translate(cameraX, cameraY);

        const viewW = canvas.width / window.cameraScale;
        const viewH = canvas.height / window.cameraScale;
        const MARGIN = 1;

        minX = Math.max(0, Math.floor((-cameraX) / cellSize) - MARGIN);
        maxX = Math.min(currentLevel.cols - 1, Math.ceil((-cameraX + viewW) / cellSize) + MARGIN);
        minY = Math.max(0, Math.floor((-cameraY) / cellSize) - MARGIN);
        maxY = Math.min(currentLevel.rows - 1, Math.ceil((-cameraY + viewH) / cellSize) + MARGIN);

        // Une fois la transition stabilisée en mode Boss, borne strictement l'affichage de 0 à BOSS_ARENA_VIEW_SIZE - 1
        if (lockBossArena && Math.abs(window.cameraScale - targetScale) < 0.01) {
            minX = 0;
            minY = 0;
            maxX = Math.min(currentLevel.cols - 1, BOSS_ARENA_VIEW_SIZE - 1);
            maxY = Math.min(currentLevel.rows - 1, BOSS_ARENA_VIEW_SIZE - 1);
        }
    }


    // Mémorise les bornes exactes de la caméra pour drawEmoji et drawPortal
    currentLevel.viewBounds = { minX, maxX, minY, maxY };

    // Fonction rapide pour savoir si un objet/monstre est dans le champ de la caméra
    const isVisible = (x, y) => (x >= minX && x <= maxX && y >= minY && y <= maxY);

    // 1. Fond et Murs
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
        if (!isVisible(c.x, c.y)) return;
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
        if (!isVisible(t.x, t.y)) return;
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
        if (!c.collected) drawEmoji(c.x, c.y, "🪙", 0.68);
    });

    // 6. Clés 🔑
    currentLevel.keys.forEach(k => {
        if (!k.collected) drawEmoji(k.x, k.y, "🔑", 0.75);
    });

    // 7. Ail 🧄
    currentLevel.garlics.forEach(g => {
        if (!g.collected) drawEmoji(g.x, g.y, "🧄", 0.75);
    });

    // 8. Citrouilles 🎃 (au sol)
    const now = Date.now();
    const pumpkinFloat = Math.sin(now / 220) * (cellSize * 0.08);
    currentLevel.pumpkins.forEach(p => {
        if (!p.collected && isVisible(p.x, p.y)) {
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
    const hasAliveTroll = currentLevel.trolls && currentLevel.trolls.some(t => t.alive);
    const isDoorLocked = hasRemainingKeys || hasAliveTroll;
    drawEmoji(currentLevel.exit.x, currentLevel.exit.y, isDoorLocked ? "🔒" : "🚪", 0.78);

    // 10. Rayons Lasers en vol ➖
    currentLevel.bombs.forEach(b => {
        if (!isVisible(b.x, b.y)) return;
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
        if (!isVisible(m.x, m.y)) return;
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
        if (m.dirX === -1) ctx.scale(-1, 1);

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

            let angle = 0;
            if (b.dirX === -1 && b.dirY === -1) angle = 0;
            else if (b.dirX === 1 && b.dirY === -1) angle = Math.PI / 2;
            else if (b.dirX === 1 && b.dirY === 1) angle = Math.PI;
            else if (b.dirX === -1 && b.dirY === 1) angle = -Math.PI / 2;

            ctx.rotate(angle);

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

    // Araignées 🕷️
    if (currentLevel.spiders) {
        currentLevel.spiders.forEach(s => {
            if (!isVisible(s.x, s.y)) return;
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
                    sx = s.fromX + dirX * moveProgress;
                    sy = s.fromY + dirY * moveProgress;
                }
            }

            let px = sx * cellSize + cellSize / 2;
            let py = sy * cellSize + cellSize / 2;
            const isOnWall = currentLevel.map[Math.round(sy)] && currentLevel.map[Math.round(sy)][Math.round(sx)] === 1;

            ctx.save();
            ctx.translate(px, py);

            let angle = 0;
            if (dirX > 0) angle = Math.PI / 2;
            else if (dirX < 0) angle = -Math.PI / 2;
            else if (dirY > 0) angle = Math.PI;
            else if (dirY < 0) angle = 0;

            ctx.rotate(angle);

            if (isMoving) {
                const stepWiggle = Math.sin(moveProgress * Math.PI * 6) * 0.15;
                const sideShift = Math.cos(moveProgress * Math.PI * 6) * (cellSize * 0.04);
                ctx.translate(sideShift, 0);
                ctx.rotate(stepWiggle);
            }

            let scaleMultiplier = 1;
            if (s.state === 'waiting') scaleMultiplier = 1 + Math.sin(now / 110) * 0.14;
            else if (isOnWall) scaleMultiplier = 1.18;

            const spiderSize = Math.floor(cellSize * 0.82 * scaleMultiplier);
            ctx.font = `${spiderSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🕷️", 0, 0);
            ctx.restore();
        });
    }

    // 14. Sorcières 🧙‍♀️ & Canalisation magique
    if (currentLevel.witches) {
        currentLevel.witches.forEach(w => {
            if (!isVisible(w.x, w.y)) return;
            let wx = w.x;
            let wy = w.y;

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

            if (w.state === 'channeling') {
                const chargeProgress = 1 - Math.max(0, (w.channelEndTime - now) / 750);
                const pulseR = (cellSize * 0.45) + Math.sin(now / 40) * (cellSize * 0.08);
                const isRed = w.isBurst;
                const fillColor = isRed 
                    ? `rgba(239, 35, 60, ${0.30 + chargeProgress * 0.50})`
                    : `rgba(168, 85, 247, ${0.25 + chargeProgress * 0.45})`;
                const strokeColor = isRed ? "#ff1a40" : "#00f9e0";
                const particleColor = isRed ? "#eeff00" : "#0069fd";

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

    // Flaques d'acide 🫟
    if (currentLevel.acidPuddles) {
        currentLevel.acidPuddles.forEach(pdl => {
            if (!isVisible(pdl.x, pdl.y)) return;
            const px = pdl.x * cellSize + cellSize / 2;
            const py = pdl.y * cellSize + cellSize / 2;
            const timeLeft = pdl.expireTime - now;
            const lifeRatio = Math.max(0, timeLeft / 3000);

            if (lifeRatio <= 0) return;

            ctx.save();
            const boil = Math.sin(now / 80) * (cellSize * 0.06);
            const r = (cellSize * 0.38 + boil) * Math.min(1, lifeRatio * 1.4);

            ctx.fillStyle = `rgba(57, 255, 20, ${0.6 * lifeRatio})`;
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(168, 85, 247, ${0.9 * lifeRatio})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = `${Math.floor(cellSize * 0.95)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.globalAlpha = Math.min(1, lifeRatio * 1.5);
            ctx.fillText("🫟", px, py);
            ctx.restore();
        });
    }

    // 15. Fioles en vol 🧪
    if (currentLevel.potions) {
        currentLevel.potions.forEach(p => {
            if (!isVisible(p.x, p.y)) return;
            const px = p.x * cellSize + cellSize / 2;
            const py = p.y * cellSize + cellSize / 2;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(p.angle || 0);
            ctx.font = `${Math.floor(cellSize * 0.85)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧪", 0, 0);
            ctx.restore();
        });
    }

    // 16. Éclaboussures de fioles
    if (currentLevel.potionSplashes) {
        currentLevel.potionSplashes.forEach(sp => {
            if (!isVisible(sp.x, sp.y)) return;
            const elapsed = now - sp.startTime;
            const progress = elapsed / sp.duration;
            const alpha = 1 - progress;
            const radius = (cellSize * 0.25) + (progress * cellSize * 0.65);

            const sx = sp.x * cellSize + cellSize / 2;
            const sy = sp.y * cellSize + cellSize / 2;

            ctx.save();
            ctx.fillStyle = `rgba(57, 255, 20, ${alpha * 0.7})`;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    // --- OS AU SOL 🦴 ---
    if (currentLevel.bones) {
        currentLevel.bones.forEach(b => {
            if (b.collected || !isVisible(b.x, b.y)) return;

            const bx = b.x * cellSize + cellSize / 2;
            const by = b.y * cellSize + cellSize / 2;

            // Halo rouge/jaune pulsant si le joueur a piétiné l'os (triggered)
            if (b.triggered) {
                const pulseR = cellSize * (0.36 + Math.sin(now / 90) * 0.07);
                ctx.save();
                ctx.fillStyle = "rgba(255, 190, 11, 0.35)";
                ctx.beginPath();
                ctx.arc(bx, by, pulseR, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "#ff4d00";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }

            drawEmoji(b.x, b.y, "🦴", 0.72);
        });
    }

    // --- CRÂNES ERRANTS 💀 & TÊTES DE MORT ☠️ ---
    if (currentLevel.skulls) {
        currentLevel.skulls.forEach(s => {
            let sx = s.x;
            let sy = s.y;
            if (s.moveStartTime) {
                const elapsed = now - s.moveStartTime;
                if (elapsed < 220) {
                    const t = elapsed / 220;
                    sx = s.fromX + (s.x - s.fromX) * t;
                    sy = s.fromY + (s.y - s.fromY) * t;
                }
            }

            if (!isVisible(Math.round(sx), Math.round(sy))) return;

            const cx = sx * cellSize + cellSize / 2;
            const cy = sy * cellSize + cellSize / 2;

            if (s.isTransformed) {
                // Télégraphe de charge avant l'explosion en croix diagonale (X)
                if (s.chargeEnd > now) {
                    const p = 1 - Math.max(0, (s.chargeEnd - now) / 350);
                    ctx.save();
                    ctx.fillStyle = `rgba(180, 20, 60, ${0.25 + p * 0.45})`;
                    ctx.beginPath();
                    ctx.arc(cx, cy, cellSize * (0.48 + p * 0.15), 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = "#ff2a55";
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                    ctx.restore();
                }

                drawEmoji(sx, sy, "☠️", 0.84);
            } else {
                drawEmoji(sx, sy, "💀", 0.80);

                // Si 1/2 os collecté : affiche un petit os en orbite + badge 1/2
                if (s.bonesCollected === 1) {
                    const orbitAng = now / 240;
                    const ox = cx + Math.cos(orbitAng) * (cellSize * 0.34);
                    const oy = cy + Math.sin(orbitAng) * (cellSize * 0.34);

                    ctx.save();
                    ctx.font = `${Math.floor(cellSize * 0.42)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("🦴", ox, oy);

                    ctx.font = `bold ${Math.max(9, Math.floor(cellSize * 0.28))}px sans-serif`;
                    ctx.fillStyle = "#ffbe0b";
                    ctx.strokeStyle = "#111827";
                    ctx.lineWidth = 2.5;
                    ctx.strokeText("1/2", cx, cy - cellSize * 0.42);
                    ctx.fillText("1/2", cx, cy - cellSize * 0.42);
                    ctx.restore();
                }
            }
        });
    }

    // --- PROJECTILES D'OS EN VOL DIAGONAL 🦴 ---
    if (currentLevel.boneProjectiles) {
        currentLevel.boneProjectiles.forEach(bp => {
            if (!isVisible(Math.round(bp.x), Math.round(bp.y))) return;
            const px = bp.x * cellSize + cellSize / 2;
            const py = bp.y * cellSize + cellSize / 2;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(bp.angle || 0);
            ctx.font = `${Math.floor(cellSize * 0.68)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🦴", 0, 0);
            ctx.restore();
        });
    }

    // Checkpoints 🏴 / 🏳️
    if (currentLevel.checkpoints) {
        currentLevel.checkpoints.forEach(cp => {
            drawEmoji(cp.x, cp.y, cp.activated ? "🏳️" : "🏴", 0.78);
        });
    }
    // --- PIERRES TOMBALES 🪦 ---
    if (currentLevel.tombstones) {
        currentLevel.tombstones.forEach(tb => {
            if (!isVisible(tb.x, tb.y)) return;
            drawEmoji(tb.x, tb.y, "🪦", 0.95);
        });
    }

    // --- ARCS 🏹 & CERCLE DE CHARGEMENT (1.5s) ---
    if (currentLevel.bows) {
        currentLevel.bows.forEach(bow => {
            if (bow.used || !isVisible(bow.x, bow.y)) return;
            drawEmoji(bow.x, bow.y, "🏹", 0.78);

            if (bow.chargeStartTime) {
                const progress = Math.min(1, (now - bow.chargeStartTime) / 1500);
                const cx = bow.x * cellSize + cellSize / 2;
                const cy = bow.y * cellSize + cellSize / 2;
                ctx.save();
                ctx.strokeStyle = "#00f5d4";
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(cx, cy, cellSize * 0.46, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        });
    }

    // --- BOSS TROLL 🧌 (BLOC 2x2, CHARGE PHASE 3, MASSUE) ---
    if (currentLevel.trolls) {
        currentLevel.trolls.forEach(t => {
            if (!t.alive) return;
            // --- ANIMATION DE MORT SPECTACULAIRE DU BOSS (1500 MS) ---
            if (t.dyingEndTime && t.dyingEndTime > now) {
                const totalMs = (t.dyingEndTime - t.dyingStartTime) || 1500;
                const progress = Math.min(1, Math.max(0, (now - t.dyingStartTime) / totalMs));
                const cx = (t.x + 1) * cellSize;
                const cy = (t.y + 1) * cellSize;

                // Tremblement horizontal de plus en plus rapide
                const freq = 0.04 + progress * 0.14;
                const amp = cellSize * 0.16 * (1 - progress * 0.35);
                const vibX = Math.sin(now * freq) * amp;

                // Alternance de flashs blanc lumineux / rouge ardent
                const isWhiteFlash = Math.floor(now / 65) % 2 === 0;
                const flashColor = isWhiteFlash ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 35, 55, 0.9)";

                // Explosion finale sur les derniers 40 % (progress > 0.6)
                const isExploding = progress > 0.6;
                const explodeProgress = isExploding ? Math.min(1, (progress - 0.6) / 0.4) : 0;
                const bossScale = isExploding ? Math.max(0, 1 - explodeProgress) : (1 + Math.sin(progress * Math.PI) * 0.12);
                const bossAlpha = isExploding ? Math.max(0, 1 - explodeProgress) : 1;

                // 1. Halo lumineux pulsant sous le Boss
                ctx.save();
                const auraR = cellSize * (1.25 + (isExploding ? explodeProgress * 1.1 : Math.sin(now / 45) * 0.15));
                const grad = ctx.createRadialGradient(cx, cy, cellSize * 0.1, cx, cy, auraR);
                grad.addColorStop(0, flashColor);
                grad.addColorStop(0.6, isWhiteFlash ? "rgba(255, 215, 100, 0.45)" : "rgba(220, 20, 45, 0.45)");
                grad.addColorStop(1, "rgba(0, 0, 0, 0)");
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // 2. Sprite du Boss qui vibre, flash, rétrécit et s'estompe
                if (bossAlpha > 0.01 && bossScale > 0.01) {
                    ctx.save();
                    ctx.translate(cx + vibX, cy);
                    ctx.scale(bossScale, bossScale);
                    ctx.globalAlpha = bossAlpha;
                    ctx.shadowColor = isWhiteFlash ? "#ffffff" : "#ff1e38";
                    ctx.shadowBlur = 18 + progress * 14;

                    ctx.font = `${Math.floor(cellSize * 1.65)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("🧌", 0, 0);

                    // Flash coloré superposé sur le Boss
                    ctx.globalCompositeOperation = "source-atop";
                    ctx.fillStyle = isWhiteFlash ? "rgba(255, 255, 255, 0.55)" : "rgba(255, 30, 50, 0.55)";
                    ctx.fillRect(-cellSize, -cellSize, cellSize * 2, cellSize * 2);
                    ctx.restore();
                }

                // 3. Explosion finale : 18 particules (poussière grise, étincelles dorées, fumée violette) + révélation de la clé 🔑
                if (isExploding) {
                    // Onde de choc d'explosion
                    ctx.save();
                    ctx.strokeStyle = `rgba(255, 215, 80, ${(1 - explodeProgress) * 0.85})`;
                    ctx.lineWidth = Math.max(1.5, 5 * (1 - explodeProgress));
                    ctx.beginPath();
                    ctx.arc(cx, cy, cellSize * (0.4 + explodeProgress * 2.1), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();

                    // 18 particules jaillissant depuis le centre du bloc 2×2
                    const PARTICLE_COUNT = 18;
                    const palette = ["#94a3b8", "#ffd166", "#a855f7", "#cbd5e1", "#ffbe0b", "#7e22ce"];
                    ctx.save();
                    for (let i = 0; i < PARTICLE_COUNT; i++) {
                        const angle = (i * 2 * Math.PI) / PARTICLE_COUNT + (i % 3) * 0.18;
                        const speedFactor = 0.75 + (i % 4) * 0.22;
                        const dist = cellSize * (0.2 + explodeProgress * 2.2 * speedFactor);
                        const px = cx + Math.cos(angle) * dist;
                        const py = cy + Math.sin(angle) * dist - (explodeProgress * cellSize * 0.15);
                        const radius = Math.max(1.5, cellSize * (0.14 - (i % 3) * 0.025) * (1 - explodeProgress * 0.75));

                        ctx.globalAlpha = Math.max(0, 1 - explodeProgress * 0.9);
                        ctx.fillStyle = palette[i % palette.length];
                        ctx.beginPath();
                        ctx.arc(px, py, radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();

                    // Révélation progressive de la clé dorée 🔑 au centre de l'explosion
                    const keyX = t.x * cellSize + cellSize / 2;
                    const keyY = t.y * cellSize + cellSize / 2;
                    const keyScale = Math.min(1, explodeProgress * 1.35);
                    ctx.save();
                    ctx.translate(keyX, keyY);
                    ctx.scale(keyScale, keyScale);
                    ctx.globalAlpha = Math.min(1, explodeProgress * 1.4);
                    ctx.shadowColor = "#ffd166";
                    ctx.shadowBlur = 12;
                    ctx.font = `${Math.floor(cellSize * 0.75)}px sans-serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("🔑", 0, 0);
                    ctx.restore();
                }

                return;
            }

            const drawX = t.isDashing ? t.fx : t.x;
            const drawY = t.isDashing ? t.fy : t.y;
            const centerX = (drawX + 1) * cellSize;
            const centerY = (drawY + 1) * cellSize;
            const dirSign = (currentLevel.player.x >= drawX + 0.5) ? 1 : -1;

            const isChargingMelee = t.meleeChargeEnd > 0 && now < t.meleeChargeEnd;
            const isChargingUlt = t.chargedEnd > 0 && now < t.chargedEnd;
            const isChargingDash = t.dashChargeEnd > 0 && now < t.dashChargeEnd;
            const isSlamming = (t.slamAnimEnd || 0) > now;
            const isStunned = (t.stunEnd || 0) > now;

            // 1. Télégraphe Tir Puissant (Phases 1 & 2) : aura rouge + ligne de mire
            if (isChargingUlt && t.chargedAim) {
                const chargeRatio = 1 - Math.max(0, (t.chargedEnd - now) / 1500);
                const pulseRadius = cellSize * (1.1 + Math.sin(now / 50) * 0.12);

                ctx.save();
                ctx.fillStyle = `rgba(255, 25, 45, ${0.25 + chargeRatio * 0.45})`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "#ff1a35";
                ctx.lineWidth = 2.5 + chargeRatio * 3;
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 40, 40, ${0.45 + chargeRatio * 0.55})`;
                ctx.lineWidth = 2 + chargeRatio * 4;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo((t.chargedAim.endX + 0.5) * cellSize, (t.chargedAim.endY + 0.5) * cellSize);
                ctx.stroke();
                ctx.restore();
            }

            // 2. Télégraphe Charge Rectiligne (Phase 3) : aura orange/rouge + flèche directionnelle
            if (isChargingDash && t.dashAim) {
                const chargeRatio = 1 - Math.max(0, (t.dashChargeEnd - now) / 1200);
                const pulseRadius = cellSize * (1.15 + Math.sin(now / 45) * 0.14);
                const endPx = (t.dashAim.endX + 0.5) * cellSize;
                const endPy = (t.dashAim.endY + 0.5) * cellSize;

                ctx.save();
                ctx.fillStyle = `rgba(255, 95, 20, ${0.28 + chargeRatio * 0.42})`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "#ff5500";
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 110, 20, ${0.55 + chargeRatio * 0.45})`;
                ctx.lineWidth = cellSize * 0.45;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(endPx, endPy);
                ctx.stroke();

                const headLen = cellSize * 0.55;
                const ang = t.dashAim.angle;
                ctx.fillStyle = "#ff3b1f";
                ctx.beginPath();
                ctx.moveTo(endPx + Math.cos(ang) * headLen * 0.5, endPy + Math.sin(ang) * headLen * 0.5);
                ctx.lineTo(endPx - Math.cos(ang - Math.PI / 6) * headLen, endPy - Math.sin(ang - Math.PI / 6) * headLen);
                ctx.lineTo(endPx - Math.cos(ang + Math.PI / 6) * headLen, endPy - Math.sin(ang + Math.PI / 6) * headLen);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // 3. Onde de choc circulaire orange à l'impact de massue
            if (isSlamming) {
                const slamDuration = (t.slamAnimEnd - (t.slamAnimStart || (t.slamAnimEnd - 350))) || 350;
                const slamProgress = Math.min(1, Math.max(0, 1 - (t.slamAnimEnd - now) / slamDuration));
                const alpha = 1 - slamProgress;
                const maxRadius = (t.slamType === 'charged') ? cellSize * 3.2 : cellSize * 2.3;
                const ringRadius = cellSize * 0.35 + slamProgress * maxRadius;

                const impactX = centerX + dirSign * cellSize * 0.45;
                const impactY = centerY + cellSize * 0.35;

                ctx.save();
                ctx.strokeStyle = `rgba(255, 115, 0, ${alpha * 0.95})`;
                ctx.lineWidth = Math.max(2, (1 - slamProgress * 0.5) * 6);
                ctx.beginPath();
                ctx.arc(impactX, impactY, ringRadius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = `rgba(255, 200, 40, ${alpha * 0.8})`;
                ctx.lineWidth = Math.max(1.5, (1 - slamProgress * 0.5) * 3.5);
                ctx.beginPath();
                ctx.arc(impactX, impactY, ringRadius * 0.68, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // 4. Posture du Boss et de sa massue
            let bodyScale = 1;
            let bodyTilt = 0;
            let clubAngle = dirSign * 0.35;

            if (isChargingMelee || isChargingUlt || isChargingDash) {
                const totalCharge = isChargingUlt ? 1500 : (isChargingDash ? 1200 : 600);
                const rem = isChargingUlt ? (t.chargedEnd - now) : (isChargingDash ? (t.dashChargeEnd - now) : (t.meleeChargeEnd - now));
                const p = Math.min(1, Math.max(0, 1 - rem / totalCharge));

                bodyScale = 1 + p * (isChargingUlt || isChargingDash ? 0.22 : 0.14);
                bodyTilt = -dirSign * (0.10 + p * 0.20);
                clubAngle = -dirSign * (0.85 + p * 0.55);
            } else if (t.isDashing) {
                bodyScale = 1.16;
                bodyTilt = (t.dashDirX >= 0 ? 1 : -1) * 0.24;
                clubAngle = (t.dashDirX >= 0 ? 1 : -1) * 1.35;
            } else if (isSlamming) {
                const slamDuration = (t.slamAnimEnd - (t.slamAnimStart || (t.slamAnimEnd - 350))) || 350;
                const p = Math.min(1, Math.max(0, 1 - (t.slamAnimEnd - now) / slamDuration));

                bodyScale = 1.15 - p * 0.15;
                bodyTilt = dirSign * 0.28 * (1 - p * 0.35);
                clubAngle = dirSign * 1.55;
            }

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(bodyTilt);
            ctx.scale(bodyScale, bodyScale);

            ctx.font = `${Math.floor(cellSize * 1.65)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧌", 0, 0);

            // Massue du Boss
            ctx.save();
            ctx.translate(dirSign * cellSize * 0.38, cellSize * 0.08);
            ctx.rotate(clubAngle);

            const handleLen = cellSize * 0.45;
            const headLen = cellSize * 0.58;

            ctx.fillStyle = "#5c3a21";
            ctx.strokeStyle = "#2b180a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-cellSize * 0.06, -handleLen, cellSize * 0.12, handleLen, 3);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#7c4d2b";
            ctx.beginPath();
            ctx.moveTo(-cellSize * 0.08, -handleLen);
            ctx.lineTo(-cellSize * 0.20, -handleLen - headLen * 0.75);
            ctx.quadraticCurveTo(0, -handleLen - headLen * 1.15, cellSize * 0.20, -handleLen - headLen * 0.75);
            ctx.lineTo(cellSize * 0.08, -handleLen);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#cbd5e1";
            ctx.beginPath();
            ctx.arc(-cellSize * 0.11, -handleLen - headLen * 0.65, Math.max(1.5, cellSize * 0.045), 0, Math.PI * 2);
            ctx.arc(cellSize * 0.11, -handleLen - headLen * 0.50, Math.max(1.5, cellSize * 0.045), 0, Math.PI * 2);
            ctx.arc(0, -handleLen - headLen * 0.82, Math.max(1.5, cellSize * 0.045), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            ctx.restore();

            if (isStunned) {
                const dizzyBob = Math.sin(now / 110) * (cellSize * 0.08);
                ctx.font = `${Math.floor(cellSize * 0.75)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("💫", centerX, drawY * cellSize - cellSize * 0.45 + dizzyBob);
            }

            const hearts = "❤️".repeat(t.hp) + "🖤".repeat(t.maxHp - t.hp);
            ctx.font = `${Math.max(10, Math.floor(cellSize * 0.34))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(hearts, centerX, drawY * cellSize - 6);
        });
    }

    // --- MINI-TROLLS 🧌 (1x1 — PHASE 2 : CHARGE 1000 MS, ZONES ROUGE/GRISE & PETITE MASSUE) ---
    if (currentLevel.miniTrolls && currentLevel.miniTrolls.length > 0) {
        currentLevel.miniTrolls.forEach(mt => {
            let mx = mt.x;
            let my = mt.y;
            if (mt.stepStartTime) {
                const elapsed = now - mt.stepStartTime;
                if (elapsed < 220) {
                    const t = elapsed / 220;
                    mx = mt.fromX + (mt.x - mt.fromX) * t;
                    my = mt.fromY + (mt.y - mt.fromY) * t;
                }
            }

            if (!isVisible(Math.round(mx), Math.round(my))) return;

            const isCharging = mt.chargeEnd > 0 && now < mt.chargeEnd;
            const isSlamming = (mt.slamAnimEnd || 0) > now;
            const dx = mt.aimDir ? mt.aimDir.dx : 0;
            const dy = mt.aimDir ? mt.aimDir.dy : 1;
            const perpX = -dy;
            const perpY = dx;

            // 1. Télégraphe des 2 cases rouges mortelles et 5 cases grises de recul pendant les 1000 ms de charge
            if (isCharging) {
                const p = 1 - Math.max(0, (mt.chargeEnd - now) / 1000);
                const redTiles = [
                    { x: mt.x + dx, y: mt.y + dy },
                    { x: mt.x + 2 * dx, y: mt.y + 2 * dy }
                ];
                const greyTiles = [
                    { x: mt.x + perpX, y: mt.y + perpY },
                    { x: mt.x + dx + perpX, y: mt.y + dy + perpY },
                    { x: mt.x - perpX, y: mt.y - perpY },
                    { x: mt.x + dx - perpX, y: mt.y + dy - perpY },
                    { x: mt.x + 3 * dx, y: mt.y + 3 * dy }
                ];

                ctx.save();
                ctx.fillStyle = `rgba(148, 163, 184, ${0.26 + p * 0.24})`;
                ctx.strokeStyle = `rgba(148, 163, 184, ${0.55 + p * 0.35})`;
                ctx.lineWidth = 1.2;
                greyTiles.forEach(gt => {
                    if (gt.y >= 0 && gt.y < currentLevel.rows && gt.x >= 0 && gt.x < currentLevel.cols && currentLevel.map[gt.y][gt.x] !== 1) {
                        ctx.fillRect(gt.x * cellSize + 1, gt.y * cellSize + 1, cellSize - 2, cellSize - 2);
                        ctx.strokeRect(gt.x * cellSize + 1, gt.y * cellSize + 1, cellSize - 2, cellSize - 2);
                    }
                });

                ctx.fillStyle = `rgba(255, 30, 50, ${0.30 + p * 0.35})`;
                ctx.strokeStyle = `rgba(255, 60, 80, ${0.70 + p * 0.30})`;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < redTiles.length; i++) {
                    const rt = redTiles[i];
                    if (rt.y < 0 || rt.y >= currentLevel.rows || rt.x < 0 || rt.x >= currentLevel.cols) break;
                    if (currentLevel.map[rt.y][rt.x] === 1) break;
                    ctx.fillRect(rt.x * cellSize + 1, rt.y * cellSize + 1, cellSize - 2, cellSize - 2);
                    ctx.strokeRect(rt.x * cellSize + 1, rt.y * cellSize + 1, cellSize - 2, cellSize - 2);
                }
                ctx.restore();
            }

            // 2. Corps du Mini-Troll (1x1) + petite massue animée
            const cx = mx * cellSize + cellSize / 2;
            const cy = my * cellSize + cellSize / 2;
            const dirSign = (dx !== 0) ? dx : ((currentLevel.player.x >= mx) ? 1 : -1);

            let scale = 1;
            let tilt = 0;
            let clubAngle = dirSign * 0.35;

            if (isCharging) {
                const p = 1 - Math.max(0, (mt.chargeEnd - now) / 1000);
                scale = 1 + p * 0.16;
                tilt = -dirSign * (0.12 + p * 0.22);
                clubAngle = -dirSign * (0.9 + p * 0.55);
            } else if (isSlamming) {
                scale = 1.1;
                tilt = dirSign * 0.28;
                clubAngle = dirSign * 1.55;
            }

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(tilt);
            ctx.scale(scale, scale);

            ctx.font = `${Math.floor(cellSize * 0.78)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🧌", 0, 0);

            ctx.save();
            ctx.translate(dirSign * cellSize * 0.22, cellSize * 0.05);
            ctx.rotate(clubAngle);

            const mHandle = cellSize * 0.24;
            const mHead = cellSize * 0.30;

            ctx.fillStyle = "#5c3a21";
            ctx.strokeStyle = "#2b180a";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(-cellSize * 0.035, -mHandle, cellSize * 0.07, mHandle, 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#7c4d2b";
            ctx.beginPath();
            ctx.moveTo(-cellSize * 0.045, -mHandle);
            ctx.lineTo(-cellSize * 0.11, -mHandle - mHead * 0.75);
            ctx.quadraticCurveTo(0, -mHandle - mHead * 1.15, cellSize * 0.11, -mHandle - mHead * 0.75);
            ctx.lineTo(cellSize * 0.045, -mHandle);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
            ctx.restore();
        });
    }

    // --- FLÈCHES EN VOL ---
    if (currentLevel.arrows) {
        currentLevel.arrows.forEach(ar => {
            const ax = ar.x * cellSize + cellSize / 2;
            const ay = ar.y * cellSize + cellSize / 2;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(ar.angle + Math.PI / 4);
            ctx.font = `${Math.floor(cellSize * 0.72)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🏹", 0, 0);
            ctx.restore();
        });
    }

    // --- ONDES DE CHOC DU TROLL ---
    if (currentLevel.shockwaves) {
        currentLevel.shockwaves.forEach(sw => {
            const sx = sw.x * cellSize + cellSize / 2;
            const sy = sw.y * cellSize + cellSize / 2;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(sw.angle);
            ctx.strokeStyle = "#ff2a2a";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, cellSize * 0.45, -Math.PI / 2.2, Math.PI / 2.2);
            ctx.stroke();
            ctx.restore();
        });
    }

    // 17. Joueur
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
    // Indicateur de malus de vitesse 💫 après un coup du Troll
    if (currentLevel.player.slowDebuffEndTime && now < currentLevel.player.slowDebuffEndTime) {
        const dizzyBob = Math.sin(now / 120) * (cellSize * 0.06);
        ctx.font = `${Math.floor(cellSize * 0.52)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💫", playerScreenX, playerScreenY - cellSize * 0.52 + dizzyBob);
    }

    // 18. Animation de téléportation 🌀
    if (currentLevel.tpEffect) {
        const tp = currentLevel.tpEffect;
        const elapsed = now - tp.startTime;

        if (elapsed < tp.duration) {
            const progress = elapsed / tp.duration;
            const alpha = 1 - progress;

            const departX = tp.fromX * cellSize + cellSize / 2;
            const departY = tp.fromY * cellSize + cellSize / 2;
            ctx.save();
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 0.8})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(departX, departY, cellSize * 0.65 * (1 - progress), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            const beamGrad = ctx.createLinearGradient(playerScreenX, playerScreenY - cellSize * 1.4, playerScreenX, playerScreenY + cellSize * 0.4);
            beamGrad.addColorStop(0, "rgba(0, 245, 212, 0)");
            beamGrad.addColorStop(0.5, `rgba(0, 245, 212, ${alpha * 0.45})`);
            beamGrad.addColorStop(1, "rgba(0, 245, 212, 0)");
            ctx.fillStyle = beamGrad;
            ctx.fillRect(playerScreenX - cellSize * 0.35, playerScreenY - cellSize * 1.4, cellSize * 0.7, cellSize * 1.8);

            const outerRadius = cellSize * (0.3 + progress * 1.6);
            ctx.strokeStyle = `rgba(0, 245, 212, ${alpha})`;
            ctx.lineWidth = Math.max(1.5, 4 * alpha);
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, outerRadius, 0, Math.PI * 2);
            ctx.stroke();

            const innerRadius = cellSize * (0.2 + progress * 0.95);
            ctx.strokeStyle = `rgba(255, 158, 0, ${alpha})`;
            ctx.lineWidth = Math.max(1, 3 * alpha);
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, innerRadius, 0, Math.PI * 2);
            ctx.stroke();

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

    if (useCamera) {
        ctx.restore();
    }
    // --- FILTRE VIGNETTE ROUGE PULSANT ÉPAIS (BLESSURE CONTRE UN MUR — 5 SECONDES) ---
    if (currentLevel.player.wallHurtEndTime && now < currentLevel.player.wallHurtEndTime) {
        const remaining = currentLevel.player.wallHurtEndTime - now;
        const lifeRatio = Math.min(1, remaining / 5000);
        const pulse = 0.82 + Math.sin(now / 120) * 0.18;
        const edgeAlpha = (0.58 + lifeRatio * 0.32) * pulse;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const innerR = Math.min(canvas.width, canvas.height) * 0.16;
        const outerR = Math.hypot(cx, cy);

        const vignette = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        vignette.addColorStop(0, "rgba(220, 15, 35, 0)");
        vignette.addColorStop(0.38, `rgba(220, 15, 35, ${edgeAlpha * 0.38})`);
        vignette.addColorStop(0.70, `rgba(210, 10, 30, ${edgeAlpha * 0.75})`);
        vignette.addColorStop(1, `rgba(185, 0, 20, ${edgeAlpha})`);

        ctx.save();
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = `rgba(255, 30, 50, ${edgeAlpha * 0.9})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
        ctx.restore();
    }
    if (dyingBoss) {
        ctx.restore();
    }
}

function drawEmoji(gx, gy, emoji, scale) {
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
