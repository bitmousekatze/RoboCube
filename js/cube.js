// Cube state - 6 faces × 9 stickers each
// Sticker values represent face labels (U/D/L/R/F/B)

export const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];

export const STICKER_COLORS = {
    U: 0xffffff,  // White  - Up
    D: 0xffd500,  // Yellow - Down
    R: 0xc41e3a,  // Red    - Right
    L: 0xff5800,  // Orange - Left
    F: 0x009b48,  // Green  - Front
    B: 0x0045ad,  // Blue   - Back
};

// UI-facing state only. The solver's authoritative cube state lives in solver.js.
export class CubeState {
    constructor() {
        this.moveHistory = [];
        this.reset();
    }

    reset() {
        this.faces = {};
        for (const f of FACES) {
            this.faces[f] = Array(9).fill(f);
        }
        this.moveHistory = [];
    }

    isSolved() {
        return FACES.every(f => this.faces[f].every(s => s === f));
    }

    addMove(move) {
        this.moveHistory.push(move);
    }
}
