/* ============================================================
   dice.js — 3D tumbling dice cube
   ============================================================ */
(function (global) {
    "use strict";

    const FACE = {
        1: "rotateX(0deg) rotateY(0deg)",
        2: "rotateX(-90deg) rotateY(0deg)",
        3: "rotateY(-90deg) rotateX(0deg)",
        4: "rotateY(90deg) rotateX(0deg)",
        5: "rotateX(90deg) rotateY(0deg)",
        6: "rotateY(180deg) rotateX(0deg)"
    };

    class Dice {
        constructor(el) {
            this.el = el;
            this.cube = el.querySelector(".dice-cube");
            this._buildPips();
        }
        _buildPips() {
            const c = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
            [1, 2, 3, 4, 5, 6].forEach(n => {
                const f = this.cube.querySelector(".f" + n);
                if (!f) return;
                for (let i = 0; i < c[n]; i++) {
                    const p = document.createElement("span");
                    p.className = "pip";
                    f.appendChild(p);
                }
            });
        }
        roll(value, done) {
            value = Math.max(1, Math.min(6, value | 0));
            this.el.classList.add("rolling");
            setTimeout(() => {
                this.el.classList.remove("rolling");
                this.cube.style.transform = FACE[value] || FACE[1];
                if (done) done();
            }, 920);
        }
        snap(value) {
            this.cube.style.transform = FACE[value] || FACE[1];
        }
    }

    global.Dice = Dice;
})(window);
