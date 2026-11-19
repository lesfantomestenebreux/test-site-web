window.GuideModule = {
    currentPage: 0,
    wasGameRunning: false,
    firstStartPending: false,
    introOnlyMode: false,

    // Détecte automatiquement dans quels niveaux de window.LEVELS un élément (token) est présent
    getLevelsFor(tokens) {
        if (!window.LEVELS || !Array.isArray(window.LEVELS)) return "Tous les niveaux";
        const found = [];

        window.LEVELS.forEach((lvl, idx) => {
            if (!lvl.matrix) return;
            const hasToken = lvl.matrix.some(line => {
                const trimmed = line.trim();
                const cellTokens = trimmed.includes(' ')
                    ? trimmed.split(/\s+/)
                    : (trimmed.match(/(T\d+|E\d+|S\d+|.)/g) || []);

                return cellTokens.some(cell =>
                    tokens.some(t => (t.endsWith('*') ? cell.startsWith(t.slice(0, -1)) : cell === t))
                );
            });
            if (hasToken) found.push(idx + 1);
        });

        if (found.length === 0) return "Aucun niveau";
        if (found.length === window.LEVELS.length) return "Tous les niveaux";
        return (found.length === 1 ? "Niveau " : "Niveaux ") + found.join(', ');
    },

    buildPages() {
        this.pages = [
            // PAGE 0 : Écran de lancement uniquement (sans flèches ni numéro de page)
            {
                tabIcon: "📜",
                title: "📜 Règles du Manoir",
                icon: "🚪",
                subtitle: "Bienvenue dans le Manoir",
                content: `
                    <p class="mb-2"><strong>Ton but :</strong> Tu as été enfermé dans ce manoir. Atteins la porte de sortie <strong>🚪</strong> en vie à travers les salles piégées !</p>
                    <div class="guide-box mb-2">
                        <div>🔓 <strong>Portes verrouillées (🔒) :</strong> Ramasse toutes les clés <strong>🔑</strong> du niveau pour ouvrir la sortie.</div>
                        <div class="mt-2">🪙 <strong>Pièces :</strong> Collecte un maximum de pièces sur ton passage pour faire grimper ton score total.</div>
                    </div>
                    <div class="guide-tip">
                        💡 <strong>Astuce :</strong> Observe les ennemis et leurs mouvements pour trouver le bon moment pour passer. Clique sur <strong>❓</strong> une fois la partie lancée pour consulter les fiches des monstres et objets !
                    </div>
                `
            },

            // PAGE 1 : Portes, Portes cadenassées, Clés, Pièces
            {
                tabIcon: "🚪",
                title: "1. Portes, Clés & Pièces",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🚪</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Porte & Porte cadenassée (🔒)</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['D'])}</span>
                                </div>
                                Rejoins la porte 🚪 pour terminer le niveau ! Si elle affiche un cadenas <strong>🔒</strong>, elle est fermée à clé.
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🔑</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Clé du Manoir</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['K'])}</span>
                                </div>
                                Ramasse <strong>toutes les clés</strong> présentes dans la salle pour déverrouiller la porte cadenassée 🔒.
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🪙</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Pièce d'Or</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['P'])}</span>
                                </div>
                                Bonus de score : les pièces ramassées s'additionnent d'un niveau à l'autre sur ton compteur général.
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 2 : Fantômes & Flammes
            {
                tabIcon: "👻",
                title: "2. Fantômes & Flammes",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>👻</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Le Fantôme</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['H', 'V'])}</span>
                                </div>
                                Patrouille en ligne droite (horizontalement ou verticalement) à raison d'une case par seconde. Ils font demi-tour face aux murs.
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🔥</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Piège de Flammes</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['X'])}</span>
                                </div>
                                Alterne toutes les secondes entre braises éteintes (grises) et flammes mortelles 🔥. Traverse uniquement quand le feu est éteint !
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 3 : Téléporteurs & Checkpoints
            {
                tabIcon: "🌀",
                title: "3. Téléporteurs & Checkpoints",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🌀</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Téléporteur</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['T*', 'E*', 'S*'])}</span>
                                </div>
                                Marche sur un vortex magique pour être transporté instantanément vers le portail relié à un autre endroit de la carte. Attention : certains téléporteurs sont à sens unique !
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🏴</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Checkpoint (🏴 ➔ 🏳️)</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['M'])}</span>
                                </div>
                                Le drapeau noir passe au blanc <strong>🏳️</strong> quand tu marches dessus. Si tu meurs, tu réapparais à cet endroit précis avec l'état exact de la partie !
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 4 : Vampires & Ail
            {
                tabIcon: "🧛",
                title: "4. Vampires & Ail",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🧛</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Le Vampire</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['R'])}</span>
                                </div>
                                Immobile au départ, il te prend en chasse dès qu'il voit de la chaire fraiche ! Cache-toi pendant <strong>4 secondes</strong> pour le semer.
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🧄</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Gousse d'Ail (6 secondes)</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['G'])}</span>
                                </div>
                                Déploie une aura verte protectrice qui fait fuir les vampires 🧛 et te permet de les éliminer définitivement en leur marchant dessus ! Attention : L'ail à une durée limité !
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 5 : Lasers & Pierre Tombale
            {
                tabIcon: "➕",
                title: "5. Lasers & Obstacles",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>➕</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Les Lasers (➕ & ➖)</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['L'])}</span>
                                </div>
                                Les blocs à croix rouge <strong>➕</strong> tirent simultanément des rayons lasers <strong>➖</strong> dans les 4 directions toutes les <strong>4 secondes</strong>. Reste décalé de leur axe avant la salve !
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🪦</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Pierre Tombale 🪦</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['Q'])}</span>
                                </div>
                                Obstacle solide qui bloque ton passage et celui des monstres, mais <strong>laisse passer les projectiles</strong> (rayons lasers, fioles) ainsi que la ligne de vue des ennemis.
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 6 : Zombies & Citrouilles
            {
                tabIcon: "🧟‍♂️",
                title: "6. Zombies & Citrouilles",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🧟‍♂️</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Le Zombie</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['Z'])}</span>
                                </div>
                                Fait sa ronde dans une zone de 3x3. S'il te voit, il te poursuit rapidement (2 pas/s). Seme-le derrière un mur pendant 4 secondes pour qu'il abandonne.
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🎃</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Citrouille Furtive (10 secondes)</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['C'])}</span>
                                </div>
                                Te déguise en citrouille ! Les zombies 🧟‍♂️ ne peuvent plus te voir, mais tes pas sont légèrement ralentis. Attention à ne pas foncer dans un zombie !
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 7 : Toile d'araignée & Araignée
            {
                tabIcon: "🕷️",
                title: "7. Toiles & Araignées",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🕸️</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Toile d'Araignée</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['B'])}</span>
                                </div>
                                Ralentit fortement tes déplacements à auteur de 0.5 seconde par case. Prévoit tes déplacements pour ne pas te faire surprendre !
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🕷️</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">L'Araignée</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['A'])}</span>
                                </div>
                                Lorsqu'une toile est touchée, elle vient verifier ce qui se passe. Tant qu'elle attend (au nid ou sur la toile), n'entre jamais dans son <strong>carré de 3x3</strong> sinon elle te fonce dessus !
                            </div>
                        </div>
                    </div>
                `
            },

            // PAGE 8 : Sorcière & ses Potions
            {
                tabIcon: "🧙‍♀️",
                title: "8. Sorcière & Chauve-souris",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🧙‍♀️</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">La Sorcière</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['W'])}</span>
                                </div>
                                Patrouille en 3x3, Tire 1 fiole vers toi qui explose en laissant une flaque d'acide 🫟 mortelle au sol pendant 2,5 secondes.. Pendant qu'elle charge son tir pendant 0.7 seconde, une aura se forme autour d'elle. 
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🦇</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">La Chauve-souris</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['Y'])}</span>
                                </div>
                                Se déplace uniquement en <strong>diagonale</strong> et rebondit à 90° dès qu'elle percute un mur ou un coin.
                            </div>
                        </div>
                    </div>
                
                    `
            },
            // PAGE 9 : La Chauve-souris
            {
                tabIcon: "💀",
                title: "9. Le squelette",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>💀</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Le squelette errant</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['N'])}</span>
                                </div> Le squelette se déplace sur l'une des 8 cases adjacentes aléatoirement. dès que le squelette ou le joueur marche sur un os, il le récupère. une fois qu'il as récupéré 2 os, il se transforme en "☠️". </div>
                        </div>
                        <div class="guide-item">
                            <span>☠️</span>
                            <div class="w-100">
                                <div class="guide-item-title">Le squelette transformé</div>
                                Le squelette transformé va sur le joueur en ligne droite et le poursuit. Il tir des os mortels toutes les 1,7 secondes en diagonale. 
                            </div>
                        </div>
                    </div>
                `
            },
            // PAGE 10 : Boss Troll & Arbalette
            {
                tabIcon: "🧌",
                title: "10. Le Boss Troll & L'Arbalette",
                content: `
                    <div class="guide-list">
                        <div class="guide-item">
                            <span>🧌</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">Le Troll Géant</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['U'])}</span>
                                </div>
                                <div>Ses coups de massue écrasent les imprudents et projettent violemment ses adversaires contre les parois.</div>
                                <div>Sa puissance dévastatrice peut pulvériser les Pierres Tombales, et sa rage s'intensifie à mesure qu'il subit des dégâts. Il détient la clé nécessaire pour déverrouiller la porte finale.</div>
                            </div>
                        </div>
                        <div class="guide-item">
                            <span>🏹</span>
                            <div class="w-100">
                                <div class="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1">
                                    <span class="guide-item-title">L'Arbalette</span>
                                    <span class="level-tag">📍 ${this.getLevelsFor(['O'])}</span>
                                </div>
                                L'arbalette est la seul arme capable de toucher le Troll. Reste immobile pendant <strong>1,5 seconde</strong> pour décocher une flèche qui retire <strong>1 ❤️</strong> au Troll (usage unique par arbalette).
                            </div>
                        </div>
                    </div>
                `
            }
        ];
    },

    init() {
        this.buildPages();
        this.injectStyles();
        this.injectHTML();
        this.hijackStartButton();
        this.bindHelpButton();
    },

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #guide-overlay {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(10, 12, 16, 0.98);
                border-radius: 10px;
                display: none;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                z-index: 40;
                padding: 10px 12px;
                color: #e5e7eb;
                text-align: left;
                backdrop-filter: blur(6px);
                overflow: hidden;
            }
            .guide-tabs {
                display: flex;
                gap: 4px;
                justify-content: center;
                flex-wrap: nowrap;
                overflow-x: auto;
                width: 100%;
                margin-bottom: 4px;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                flex-shrink: 0;
                scrollbar-width: none;
            }
            .guide-tabs::-webkit-scrollbar {
                display: none;
            }
            .guide-tab-btn {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 6px;
                padding: 2px 6px;
                font-size: 0.95rem;
                color: #fff;
                cursor: pointer;
                transition: all 0.15s ease;
                line-height: 1.2;
                flex-shrink: 0;
            }
            .guide-tab-btn.active {
                background: rgba(255, 102, 0, 0.32);
                border-color: #ff6600;
                box-shadow: 0 0 6px rgba(255, 102, 0, 0.45);
            }
            .guide-header {
                text-align: center;
                width: 100%;
                border-bottom: 1px solid rgba(255, 102, 0, 0.3);
                padding-bottom: 4px;
                flex-shrink: 0;
            }
            .guide-icon-badge {
                font-size: 1.6rem;
                line-height: 1;
                margin-bottom: 2px;
            }
            .guide-body {
                width: 100%;
                flex: 1 1 auto;
                min-height: 0; /* Indispensable sur mobile pour que la zone centrale scrolle sans être écrasée */
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                touch-action: pan-y;
                padding: 8px 2px;
                font-size: 0.85rem;
                line-height: 1.38;
            }
            .guide-box {
                background: rgba(255, 102, 0, 0.08);
                border: 1px solid rgba(255, 102, 0, 0.3);
                border-radius: 8px;
                padding: 8px 10px;
            }
            .guide-tip {
                background: rgba(56, 189, 248, 0.1);
                border: 1px solid rgba(56, 189, 248, 0.35);
                border-radius: 8px;
                padding: 6px 8px;
                font-size: 0.8rem;
                color: #bae6fd;
            }
            .guide-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .guide-item {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 6px 8px;
            }
            .guide-item > span {
                font-size: 1.35rem;
                line-height: 1;
                flex-shrink: 0;
                margin-top: 2px;
            }
            .guide-item-title {
                font-weight: 700;
                color: #ffaa44;
                font-size: 0.88rem;
            }
            .level-tag {
                font-size: 0.68rem;
                font-weight: 600;
                background: rgba(255, 102, 0, 0.18);
                color: #ffd166;
                border: 1px solid rgba(255, 102, 0, 0.4);
                padding: 1px 6px;
                border-radius: 10px;
                white-space: normal;
            }
            .guide-footer {
                width: 100%;
                border-top: 1px solid rgba(255, 102, 0, 0.35);
                padding-top: 6px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                flex-shrink: 0;
            }

            /* Adaptation spéciale petits écrans / téléphones */
            @media (max-width: 576px) {
                #guide-overlay {
                    padding: 6px 8px;
                }
                .guide-icon-badge {
                    display: none; /* Cache la grosse icône du haut sur mobile pour gagner 40px de lecture */
                }
                #guide-title {
                    font-size: 1.2rem !important;
                }
                #guide-subtitle {
                    font-size: 0.72rem !important;
                }
                .guide-tab-btn {
                    padding: 2px 5px;
                    font-size: 0.82rem;
                }
                .guide-body {
                    font-size: 0.78rem;
                    padding: 6px 2px;
                }
                .guide-footer {
                    padding-top: 4px;
                    gap: 4px;
                }
                #guide-close-btn {
                    padding: 4px 8px !important;
                    font-size: 0.85rem !important;
                }
            }
        `;
        document.head.appendChild(style);
    },

    injectHTML() {
        const card = document.getElementById('canvas-card');
        if (!card) return;

        const overlay = document.createElement('div');
        overlay.id = 'guide-overlay';
        overlay.innerHTML = `
            <div id="guide-tabs" class="guide-tabs"></div>
            <div class="guide-header">
                <div id="guide-icon" class="guide-icon-badge">📖</div>
                <h3 id="guide-title" class="creepster-font text-warning m-0" style="font-size: 1.5rem; color: #ff6600 !important;"></h3>
                <div id="guide-subtitle" class="text-secondary small"></div>
            </div>
            <div id="guide-body" class="guide-body"></div>
            <div class="guide-footer">
                <div id="guide-nav-row" class="justify-content-between align-items-center w-100" style="display: none;">
                    <button id="guide-prev" class="btn btn-sm btn-outline-secondary px-3">⬅️ Préc.</button>
                    <span id="guide-page-indicator" class="small text-warning fw-bold">1 / 10</span>
                    <button id="guide-next" class="btn btn-sm btn-outline-warning px-3">Suiv. ➡️</button>
                </div>
                <button id="guide-close-btn" class="btn btn-warning fw-bold w-100 shadow-sm" style="background-color: #ff6600; border: none; color: #111;">
                    J'ai compris, jouer ! 🎮
                </button>
            </div>
        `;
        card.appendChild(overlay);

        // Génère les 10 onglets rapides pour le mode "?" (Pages 1 à 10)
        const tabsContainer = document.getElementById('guide-tabs');
        for (let idx = 1; idx <= 10; idx++) {
            const btn = document.createElement('button');
            btn.className = 'guide-tab-btn';
            btn.setAttribute('data-page', idx);
            btn.textContent = `${idx}${this.pages[idx].tabIcon}`;
            btn.title = this.pages[idx].title;
            btn.addEventListener('click', () => {
                this.currentPage = idx;
                this.renderPage();
            });
            tabsContainer.appendChild(btn);
        }

        document.getElementById('guide-prev').addEventListener('click', () => this.changePage(-1));
        document.getElementById('guide-next').addEventListener('click', () => this.changePage(1));
        document.getElementById('guide-close-btn').addEventListener('click', () => this.close());
    },

    hijackStartButton() {
        const startBtn = document.getElementById('start-btn');
        if (!startBtn) return;

        const newStartBtn = startBtn.cloneNode(true);
        startBtn.parentNode.replaceChild(newStartBtn, startBtn);

        newStartBtn.addEventListener('click', () => {
            const startOverlay = document.getElementById('start-overlay');
            if (startOverlay) startOverlay.style.display = 'none';
            this.firstStartPending = true;
            this.openIntroOnly();
        });
    },

    bindHelpButton() {
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.setAttribute('onclick', 'window.GuideModule.open(1)');
        }
    },

    // Au démarrage : ouvre UNIQUEMENT la page d'accueil sans onglets, sans flèches et sans n° de page
    openIntroOnly() {
        this.introOnlyMode = true;
        this.currentPage = 0;
        this.renderPage();

        const closeBtn = document.getElementById('guide-close-btn');
        if (closeBtn) closeBtn.textContent = "Entrer dans le Manoir 🚀";

        const overlay = document.getElementById('guide-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    // En cliquant sur "?" : ouvre le livre sur les pages 1 à 8
    open(pageIndex = 1) {
        this.introOnlyMode = false;
        const maxPage = this.pages.length - 1;
        this.currentPage = (pageIndex < 1 || pageIndex > maxPage) ? 1 : pageIndex;
        this.renderPage();

        if (typeof gameStarted !== 'undefined' && gameStarted && !this.firstStartPending) {
            this.wasGameRunning = true;
            gameStarted = false;
            if (typeof gameTimer !== 'undefined' && gameTimer) clearInterval(gameTimer);
        }

        const closeBtn = document.getElementById('guide-close-btn');
        if (closeBtn) {
            closeBtn.textContent = this.firstStartPending ? "Entrer dans le Manoir 🚀" : "Reprendre la partie 🎮";
        }

        const overlay = document.getElementById('guide-overlay');
        if (overlay) overlay.style.display = 'flex';
    },

    close() {
        const overlay = document.getElementById('guide-overlay');
        if (overlay) overlay.style.display = 'none';

        if (this.firstStartPending) {
            this.firstStartPending = false;
            if (typeof startGame === 'function') startGame();
        } else if (this.wasGameRunning) {
            this.wasGameRunning = false;
            gameStarted = true;
            if (typeof startGameCycle === 'function') startGameCycle();
        }
    },

    changePage(delta) {
        if (this.introOnlyMode) return;

        const maxPage = this.pages.length - 1;
        const next = this.currentPage + delta;
        if (next >= 1 && next <= maxPage) {
            this.currentPage = next;
            this.renderPage();
        }
    },

    renderPage() {
        const p = this.pages[this.currentPage];
        document.getElementById('guide-icon').textContent = p.icon;
        document.getElementById('guide-title').textContent = p.title;
        document.getElementById('guide-subtitle').textContent = p.subtitle;
        document.getElementById('guide-body').innerHTML = p.content;

        const tabsRow = document.getElementById('guide-tabs');
        const navRow = document.getElementById('guide-nav-row');

        if (this.introOnlyMode) {
            // Masque impérativement les onglets, les flèches et le n° de page au lancement
            if (tabsRow) tabsRow.style.display = 'none';
            if (navRow) navRow.style.display = 'none';
        } else {
            // Affiche les 8 onglets et la navigation en mode "?"
            if (tabsRow) tabsRow.style.display = 'flex';
            if (navRow) navRow.style.display = 'flex';

            document.querySelectorAll('.guide-tab-btn').forEach(btn => {
                const idx = parseInt(btn.getAttribute('data-page'), 10);
                btn.classList.toggle('active', idx === this.currentPage);
            });

            const maxPage = this.pages.length - 1;
            document.getElementById('guide-page-indicator').textContent = `Page ${this.currentPage} / ${maxPage}`;
            document.getElementById('guide-prev').disabled = (this.currentPage <= 1);
            document.getElementById('guide-next').disabled = (this.currentPage >= maxPage);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.GuideModule.init();
});