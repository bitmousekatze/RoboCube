// Kociemba 2-phase solver via the `cubejs` library.
// We mirror every animated move into a logical Cube instance so that,
// on Solve, we can ask the algorithm for a fresh ≤21-move solution.

import Cube from 'https://esm.sh/cubejs@1.3.2';

let initPromise = null;
let initialized = false;

// Build Kociemba's pruning tables. Heavy (~500 ms, ~80 MB transient).
// We schedule it after first paint so the UI shows up instantly.
export function initSolver() {
    if (initPromise) return initPromise;
    initPromise = new Promise(resolve => {
        // Yield to the event loop so the page can render first
        setTimeout(() => {
            Cube.initSolver();
            initialized = true;
            resolve();
        }, 50);
    });
    return initPromise;
}

export function isSolverInitialized() {
    return initialized;
}

export class LogicalCube {
    constructor() {
        this.cube = new Cube();
    }

    apply(move) {
        this.cube.move(move);
    }

    reset() {
        this.cube = new Cube();
    }

    isSolved() {
        return this.cube.isSolved();
    }

    /** Returns an array of move strings, e.g. ["R", "U'", "F2", ...]. */
    solve() {
        if (!initialized) throw new Error('Solver not initialized');
        const str = this.cube.solve();
        return str.trim().split(/\s+/).filter(Boolean);
    }
}
