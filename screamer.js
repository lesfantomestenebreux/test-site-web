window.ScreamerModule = {
    // Stockage permanent en RAM pour éviter que le navigateur ne vide le cache
    cache: {},
    hideTimeout: null,

    // Images par défaut aléatoires
    defaultImages: [
        "screamer1.jpg",
    ],

    // Screamers dédiés par type de mort
    deaths: {
        spider:  { img: "screamer_spider.jpg", sound: "screamer.mp3" },
        witch:   { img: "screamer_witch.jpg",  sound: "screamer.mp3" },
        ghost:   { img: "screamer_ghost.jpg",  sound: "screamer.mp3" },
        zombie:  { img: "screamer_zombie.jpg", sound: "screamer.mp3" },
        vampire: { img: "screamer_vampire.jpg",sound: "screamer.mp3" },
        skull: { img: "screamer_squelette.jpg",sound: "screamer.mp3" },
        troll: { img: "screamer_troll.jpg",sound: "screamer.mp3" },
        bat: { img: "screamer_bat.jpg",sound: "screamer.mp3" },
        //laser:   { img: "screamer_laser.jpg",  sound: "screamer.mp3" }
    },

    preloadImage(src) {
        if (!src || this.cache[src]) return;
        const preImg = new Image();
        preImg.src = src;
        // Force le décodage en avance dans la mémoire graphique si supporté
        if (preImg.decode) {
            preImg.decode().catch(() => {});
        }
        this.cache[src] = preImg;
    },

    init() {
        this.defaultImages.forEach(src => this.preloadImage(src));
        Object.values(this.deaths).forEach(d => {
            if (d.img) this.preloadImage(d.img);
        });
    },

    trigger(deathType = 'default', durationMs = 1000) {
        const box = document.getElementById('screamer-box');
        const img = document.getElementById('screamer-img');
        const audio = document.getElementById('screamer-audio');

        if (!box || !img) return;

        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
        }

        // 1. Sélection de l'image et du son cibles
        const custom = this.deaths[deathType];
        let targetImg = "screamer1.jpg";
        let targetSound = "screamer.mp3";

        if (custom && custom.img) {
            targetImg = custom.img;
            if (custom.sound) targetSound = custom.sound;
        } else if (this.defaultImages.length > 0) {
            targetImg = this.defaultImages[Math.floor(Math.random() * this.defaultImages.length)];
        }

        // 2. Cache immédiatement l'ancienne image pour rendre tout flash impossible
        img.style.visibility = 'hidden';

        const showNow = () => {
            // Relance l'animation CSS de zoom/tremblement proprement
            img.style.animation = 'none';
            void img.offsetWidth; // Force le recalcul CSS
            img.style.animation = '';

            img.style.visibility = 'visible';
            box.classList.remove('screamer-hidden');

            // 3. Déclenchement sonore synchronisé avec l'apparition de l'image
            if (audio) {
                // Ne change le src que si le fichier audio est différent (évite de recharger le MP3)
                if (!audio.getAttribute('src') || !audio.getAttribute('src').endsWith(targetSound)) {
                    audio.src = targetSound;
                }
                audio.currentTime = 0;
                audio.volume = 0.4;
                audio.play().catch(() => {});
            }

            // 4. Masquage après la durée
            this.hideTimeout = setTimeout(() => {
                box.classList.add('screamer-hidden');
                img.style.visibility = 'hidden';
                img.removeAttribute('src'); // Vide l'image à la fin pour qu'elle ne réapparaisse jamais
                if (audio) {
                    audio.pause();
                    audio.currentTime = 0;
                }
            }, durationMs);
        };

        // Assigne la nouvelle image
        img.src = targetImg;

        // Attend que la nouvelle texture soit 100% prête avant d'afficher
        if (img.decode) {
            img.decode().then(showNow).catch(showNow);
        } else if (img.complete) {
            showNow();
        } else {
            img.onload = showNow;
            img.onerror = showNow;
        }
    }
};

window.ScreamerModule.init();