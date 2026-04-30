import * as THREE from 'three';

// Each face → which axis to spin around, which layer (-1/0/+1), and the
// signed angle for a clockwise quarter-turn (looking AT the face from outside).
const MOVE_CONFIG = {
    U: { axis: 'y', layer:  1, angle: -Math.PI / 2 },
    D: { axis: 'y', layer: -1, angle:  Math.PI / 2 },
    R: { axis: 'x', layer:  1, angle: -Math.PI / 2 },
    L: { axis: 'x', layer: -1, angle:  Math.PI / 2 },
    F: { axis: 'z', layer:  1, angle: -Math.PI / 2 },
    B: { axis: 'z', layer: -1, angle:  Math.PI / 2 },
};

export function parseMove(move) {
    const cfg = MOVE_CONFIG[move[0]];
    if (!cfg) throw new Error(`Invalid move: ${move}`);
    let angle = cfg.angle;
    const variant = move.slice(1);
    if (variant === "'") angle = -angle;
    else if (variant === '2') angle *= 2;
    return { axis: cfg.axis, layer: cfg.layer, angle };
}

export function inverseMove(move) {
    if (move.endsWith('2')) return move;
    if (move.endsWith("'")) return move[0];
    return move + "'";
}

export function inverseSequence(moves) {
    return [...moves].reverse().map(inverseMove);
}

export function generateScramble(length = 25, prevLastFace = '', prevSecondLastFace = '') {
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const variants = ['', "'", '2'];
    const out = [];
    let lastFace = prevLastFace;
    let secondLastFace = prevSecondLastFace;
    for (let i = 0; i < length; i++) {
        let f;
        do { f = faces[Math.floor(Math.random() * 6)]; }
        while (f === lastFace || (f === secondLastFace && areOpposite(f, lastFace)));
        secondLastFace = lastFace;
        lastFace = f;
        out.push(f + variants[Math.floor(Math.random() * 3)]);
    }
    return out;
}

function areOpposite(a, b) {
    const pairs = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
    return pairs[a] === b;
}

// Snap a quaternion to the nearest of the 24 cube-aligned orientations.
// After a clean 90° turn the matrix entries are already ~0 or ~±1, so
// rounding each element is safe and fast.
function snapOrientation(obj) {
    const m = new THREE.Matrix4().makeRotationFromQuaternion(obj.quaternion);
    for (let i = 0; i < 16; i++) m.elements[i] = Math.round(m.elements[i]);
    obj.quaternion.setFromRotationMatrix(m);
}

export class MoveEngine {
    constructor(cubeGroup) {
        this.cubeGroup = cubeGroup;
        this.queue = [];
        this.busy = false;
        this.duration = 220;     // ms per quarter-turn
        this.onMoveStart = null; // (move) => void
        this.onIdle      = null; // () => void
    }

    setSpeed(level) {
        // 1 (slow) → 5 (fast)
        const speeds = { 1: 520, 2: 340, 3: 220, 4: 130, 5: 70 };
        this.duration = speeds[level] ?? 220;
    }

    enqueue(moves) {
        if (Array.isArray(moves)) this.queue.push(...moves);
        else this.queue.push(moves);
        this._next();
    }

    clear() {
        this.queue.length = 0;
    }

    isIdle() { return !this.busy && this.queue.length === 0; }

    _next() {
        if (this.busy) return;
        if (this.queue.length === 0) {
            if (this.onIdle) this.onIdle();
            return;
        }
        this._animate(this.queue.shift());
    }

    _animate(move) {
        this.busy = true;
        if (this.onMoveStart) this.onMoveStart(move);

        const { axis, layer, angle } = parseMove(move);
        const duration = Math.abs(angle) === Math.PI ? this.duration * 1.7 : this.duration;

        // Pick the 9 cubies in this layer. Use a tolerance to handle drift.
        const cubies = this.cubeGroup.children.filter(
            c => c.userData?.isCubie && Math.abs(c.position[axis] - layer) < 0.4
        );

        // Create pivot at cube origin
        const pivot = new THREE.Group();
        pivot.userData.isPivot = true;
        this.cubeGroup.add(pivot);
        for (const c of cubies) pivot.attach(c);

        const start = performance.now();
        const ease  = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;

        const step = () => {
            const t = Math.min((performance.now() - start) / duration, 1);
            pivot.rotation[axis] = angle * ease(t);

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                pivot.rotation[axis] = angle;
                pivot.updateMatrixWorld(true);

                // Detach cubies back to the cube group, snap to grid.
                while (pivot.children.length > 0) {
                    const c = pivot.children[0];
                    this.cubeGroup.attach(c);
                    c.position.x = Math.round(c.position.x);
                    c.position.y = Math.round(c.position.y);
                    c.position.z = Math.round(c.position.z);
                    snapOrientation(c);
                }

                this.cubeGroup.remove(pivot);
                this.busy = false;
                this._next();
            }
        };
        requestAnimationFrame(step);
    }
}
