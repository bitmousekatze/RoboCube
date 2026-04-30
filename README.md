# ClaudeCube

ClaudeCube is a browser-based 3D Rubik's Cube scrambler and solver. It renders an interactive cube with Three.js, lets you build up scrambles in batches, and solves the current cube state with a Kociemba two-phase solver through `cubejs`.

The project is intentionally simple to run: vanilla HTML, CSS, and JavaScript with ES modules loaded from CDNs. There is no build step.

## Features

- Interactive 3D Rubik's Cube rendered with Three.js
- Drag to rotate the camera and scroll to zoom
- Smooth animated face turns
- Scramble button that appends 25 random moves at a time
- Scramble cap of 420 moves
- Reset button that restores the solved cube instantly
- Solve button powered by the Kociemba two-phase algorithm
- Educational solve overlay showing Phase 1 and Phase 2 progress
- Move history with active move highlighting
- Animation speed slider
- Status badge and basic solve stats

## Running Locally

The app must be served over HTTP because browser ES module imports do not work reliably from `file://`.

From the project directory:

```powershell
npx serve -p 8765 .
```

Then open:

```text
http://localhost:8765/
```

If something is already running on port `8765`, either use that existing server or choose another port:

```powershell
npx serve -p 8766 .
```

## Project Structure

```text
ClaudeCube/
├── index.html       # Main app layout and import map
├── css/
│   └── styles.css   # Dark glass UI, layout, controls, phase overlay
├── js/
│   ├── cube.js      # Lightweight UI-facing cube state and sticker colors
│   ├── main.js      # App controller, buttons, state, solver flow
│   ├── moves.js     # Move parsing, scramble generation, animation queue
│   ├── renderer.js  # Three.js scene, cubies, camera controls
│   └── solver.js    # cubejs wrapper and logical cube state
└── DESIGN.html      # Original design document
```

## How It Works

ClaudeCube keeps two cube representations in sync:

- The **visual cube** is made of 27 cubies in a Three.js scene. Face turns are animated by attaching the affected cubies to a temporary pivot group, rotating that group, then snapping the cubies back to the grid.
- The **logical cube** is a `cubejs` cube instance. Every animated move is mirrored into it so the solver always knows the real puzzle state.

When you click **Scramble**, the app generates another batch of random moves and animates them. It passes the previous two move faces into the scramble generator so the next batch does not join with an immediate repeated or cancelling pattern.

When you click **Solve**, the app asks `cubejs` for a Kociemba solution, clears the visible move history, then animates the returned solution moves. After the animation finishes, the logical cube is checked with `isSolved()`. If that check passes, the UI reports the cube as solved.

## Kociemba Phase Overlay

Kociemba's algorithm solves the cube in two broad phases:

- **Phase 1:** orient corners and edges, and place E-slice edges. Any face turn may appear.
- **Phase 2:** finish solving using moves that preserve orientation: `U`, `U'`, `U2`, `D`, `D'`, `D2`, `L2`, `R2`, `F2`, and `B2`.

ClaudeCube detects the Phase 2 boundary by scanning the returned solution for the first suffix where every remaining move belongs to that Phase 2 move set. During solving, the overlay shows the active phase and current move progress.

## Correctness Checks

You do not need to know Rubik's Cube theory to tell whether the app is working. The main correctness signal is the logical cube:

1. Every animated scramble and solve move is applied to the visual cube.
2. The same move is also applied to the logical `cubejs` cube.
3. After solving, the app calls `logical.isSolved()`.
4. The success status appears only when that solved check passes.

If the solver or move mirroring fails, the app reports `Solve mismatch` instead of claiming success.

## Dependencies

Loaded in the browser through the import map:

- [Three.js](https://threejs.org/) `0.162.0`
- [cubejs](https://www.npmjs.com/package/cubejs) `1.3.2`

## Development Notes

- Keep the visual cube and logical cube mirrored through `engine.onMoveStart`.
- Use `renderer.resetCubies()`, `cube.reset()`, and `logical.reset()` together when resetting.
- `MoveEngine` uses Three.js `attach()` for rotating face layers. Keep that pattern for future move animation work.
- There is no bundler or test runner yet. Browser smoke testing is currently the quickest validation path.
