import { CubeRenderer }         from './renderer.js';
import { CubeState }            from './cube.js';
import { MoveEngine,
         generateScramble }     from './moves.js';
import { LogicalCube,
         initSolver,
         isSolverInitialized }  from './solver.js';

// ── Init ─────────────────────────────────────────────────────────────────────

const canvas    = document.getElementById('cube-canvas');
const cube      = new CubeState();
const logical   = new LogicalCube();
const renderer  = new CubeRenderer(canvas);
const engine    = new MoveEngine(renderer.getCubeGroup());

// ── UI element refs ───────────────────────────────────────────────────────────

const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const moveCountEl   = document.getElementById('move-count');
const solveTimeEl   = document.getElementById('solve-time');
const scrambleMoves = document.getElementById('scramble-moves');
const historyList   = document.getElementById('history-list');
const btnScramble   = document.getElementById('btn-scramble');
const btnReset      = document.getElementById('btn-reset');
const btnSolve      = document.getElementById('btn-solve');
const btnClear      = document.getElementById('btn-clear-history');
const speedSlider   = document.getElementById('speed-slider');
const phaseOverlay  = document.getElementById('phase-overlay');
const phaseTag      = document.getElementById('phase-tag');
const phaseDesc     = document.getElementById('phase-desc');
const phaseCallout  = document.getElementById('phase-callout');

const SCRAMBLE_BATCH = 25;
const SCRAMBLE_CAP   = 420;

// Short text for the in-viewport Kociemba teaching overlay.
const PHASE_INFO = {
    1: 'Orient corners & edges, place E-slice edges. Any face turn allowed.',
    2: 'Solve within ⟨U, D, L², R², F², B²⟩ — these moves preserve all orientation.',
};

// Phase 2 = the suffix of the solution where every remaining move keeps
// orientation invariant: U/U'/U2, D/D'/D2, and L2/R2/F2/B2.
const PHASE2_RE = /^(?:[UD][2']?|[LRFB]2)$/;
function findPhase2Start(solution) {
    for (let i = 0; i < solution.length; i++) {
        if (solution.slice(i).every(m => PHASE2_RE.test(m))) return i;
    }
    return solution.length;
}

function showPhase(phase, move, idx, total) {
    phaseOverlay.hidden = false;
    phaseTag.textContent = `Phase ${phase}`;
    phaseDesc.textContent = PHASE_INFO[phase];
    phaseCallout.innerHTML = move
        ? `<strong>${move}</strong> ${idx + 1} / ${total}`
        : '';
}

function hidePhaseOverlay() {
    phaseOverlay.hidden = true;
    phaseCallout.textContent = '';
}

// ── State ─────────────────────────────────────────────────────────────────────

let mode = 'idle';          // 'idle' | 'scrambling' | 'solving' | 'computing'
let solveStartTime = null;

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(label, state = 'ready') {
    statusText.textContent = label;
    statusDot.className = 'status-dot';
    if (state !== 'ready') statusDot.classList.add(state);
}

function setButtonsDisabled(flag) {
    [btnScramble, btnReset, btnSolve].forEach(b => b.disabled = flag);
}

// ── History UI ────────────────────────────────────────────────────────────────

function renderHistory(highlightIdx = -1) {
    const moves = cube.moveHistory;
    moveCountEl.textContent = moves.length;

    if (moves.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No moves yet</p>';
        return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'history-moves';
    moves.forEach((m, i) => {
        const chip = document.createElement('span');
        chip.className = 'move-chip';
        if (i === highlightIdx) chip.classList.add('active');
        chip.textContent = m;
        wrap.appendChild(chip);
    });

    historyList.innerHTML = '';
    historyList.appendChild(wrap);
    historyList.scrollTop = historyList.scrollHeight;
}

// ── Boot solver in the background; reflect state in the status bar ───────────

setStatus('Loading solver…', 'solving');
const solverReadyPromise = initSolver().then(() => {
    if (mode === 'idle') setStatus('Ready');
});

// ── Scramble ──────────────────────────────────────────────────────────────────

btnScramble.addEventListener('click', () => {
    if (mode !== 'idle') return;

    const existing = cube.moveHistory.length;
    if (existing >= SCRAMBLE_CAP) {
        setStatus(`Scramble cap reached (${SCRAMBLE_CAP})`, 'error');
        return;
    }

    mode = 'scrambling';
    renderer.setAutoSpin(false);
    hidePhaseOverlay();

    setStatus('Scrambling…', 'scrambling');
    setButtonsDisabled(true);
    solveTimeEl.textContent = '—';

    const remaining = SCRAMBLE_CAP - existing;
    const batch     = Math.min(SCRAMBLE_BATCH, remaining);

    // Seed generation with the existing tail so appended batches avoid bad joins.
    const last       = existing > 0 ? cube.moveHistory[existing - 1][0] : '';
    const secondLast = existing > 1 ? cube.moveHistory[existing - 2][0] : '';
    const sequence = generateScramble(batch, last, secondLast);

    scrambleMoves.textContent = existing + sequence.length;

    // MoveEngine is the sync point: every visual turn is mirrored logically.
    engine.onMoveStart = (move) => {
        cube.addMove(move);
        logical.apply(move);
        renderHistory(cube.moveHistory.length - 1);
    };
    engine.onIdle = () => {
        engine.onMoveStart = null;
        engine.onIdle = null;
        renderHistory();
        setStatus(`Scrambled (${cube.moveHistory.length})`, 'scrambling');
        setButtonsDisabled(false);
        mode = 'idle';
    };

    engine.enqueue(sequence);
});

// ── Reset ─────────────────────────────────────────────────────────────────────

btnReset.addEventListener('click', () => {
    engine.clear();
    engine.onMoveStart = null;
    engine.onIdle = null;
    renderer.setAutoSpin(false);
    hidePhaseOverlay();
    renderer.resetCubies();
    cube.reset();
    logical.reset();

    scrambleMoves.textContent = '—';
    solveTimeEl.textContent   = '—';
    renderHistory();

    setStatus('Ready');
    setButtonsDisabled(false);
    mode = 'idle';
});

// ── Solve (Kociemba 2-phase) ──────────────────────────────────────────────────

btnSolve.addEventListener('click', async () => {
    if (mode !== 'idle') return;
    if (logical.isSolved()) {
        setStatus('Already solved!');
        return;
    }

    mode = 'computing';
    setButtonsDisabled(true);

    // Wait for pruning tables if user was fast on the trigger
    if (!isSolverInitialized()) {
        setStatus('Loading solver…', 'solving');
        await solverReadyPromise;
    }

    setStatus('Computing solution…', 'solving');
    // Yield one frame so the status update paints before we block
    await new Promise(r => requestAnimationFrame(r));

    let solution;
    try {
        solution = logical.solve();
    } catch (err) {
        console.error(err);
        setStatus('Solver error', 'error');
        setButtonsDisabled(false);
        mode = 'idle';
        return;
    }

    if (solution.length === 0) {
        setStatus('Already solved!');
        setButtonsDisabled(false);
        mode = 'idle';
        return;
    }

    // Replace the scramble history with the solution moves so the user can
    // see exactly what Kociemba returned.
    cube.moveHistory = [];
    renderHistory();

    mode = 'solving';
    renderer.setAutoSpin(false);
    setStatus(`Solving in ${solution.length} moves…`, 'solving');
    solveStartTime = performance.now();
    const phase2Start = findPhase2Start(solution);

    // During solve, the visible history is the solver's answer, not the scramble.
    engine.onMoveStart = (move) => {
        const moveIdx = cube.moveHistory.length;
        const phase = moveIdx >= phase2Start ? 2 : 1;
        showPhase(phase, move, moveIdx, solution.length);
        cube.addMove(move);
        logical.apply(move);
        renderHistory(cube.moveHistory.length - 1);
    };
    engine.onIdle = () => {
        engine.onMoveStart = null;
        engine.onIdle = null;

        const seconds = ((performance.now() - solveStartTime) / 1000).toFixed(1);
        solveTimeEl.textContent = `${seconds}s`;

        renderHistory();
        const solved = logical.isSolved();
        setStatus(
            solved ? `Solved in ${solution.length} moves!` : 'Solve mismatch',
            solved ? 'solving' : 'error'
        );
        setButtonsDisabled(false);
        mode = 'idle';
    };

    engine.enqueue(solution);
});

// ── Clear history ─────────────────────────────────────────────────────────────

btnClear.addEventListener('click', () => {
    if (mode !== 'idle') return;
    cube.moveHistory = [];
    renderHistory();
});

// ── Speed slider ──────────────────────────────────────────────────────────────

speedSlider.addEventListener('input', (e) => {
    engine.setSpeed(parseInt(e.target.value, 10));
});
engine.setSpeed(parseInt(speedSlider.value, 10));

// ── Initial state ─────────────────────────────────────────────────────────────

renderHistory();
