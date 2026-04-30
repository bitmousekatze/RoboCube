import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STICKER_COLORS } from './cube.js';

// Dimensions are slightly under one grid unit so the black cubie gaps remain visible.
const CUBIE_SIZE   = 0.91;
const STICKER_SIZE = 0.76;
const UNIT         = 1.0;   // center-to-center spacing
const STICKER_LIFT = CUBIE_SIZE / 2 + 0.003;

// Shared black body material
const BODY_MAT = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.75,
    metalness: 0.3,
});

export class CubeRenderer {
    constructor(canvas) {
        this.canvas  = canvas;
        this.autoSpin = true;
        this._userInteracting = false;
        this._idleTimer = null;

        this._initScene();
        this._initLights();
        this._buildCube();
        this._initControls();
        this._initResize();
        this._startLoop();
    }

    _initScene() {
        const w = this.canvas.clientWidth  || this.canvas.parentElement.clientWidth;
        const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x07071a, 0.045);

        this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 60);
        this.camera.position.set(4.8, 3.6, 5.2);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
    }

    _initLights() {
        // Soft ambient
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

        // Key light
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(6, 10, 8);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        this.scene.add(key);

        // Fill light (cool blue tint from behind)
        const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
        fill.position.set(-6, -2, -6);
        this.scene.add(fill);

        // Rim light (warm)
        const rim = new THREE.PointLight(0xffa04a, 0.4, 20);
        rim.position.set(-4, 4, -4);
        this.scene.add(rim);
    }

    _buildCube() {
        this.cubeGroup = new THREE.Group();
        this.scene.add(this.cubeGroup);

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    this._buildCubie(x, y, z);
                }
            }
        }
    }

    _buildCubie(gx, gy, gz) {
        const cubie = new THREE.Group();
        cubie.position.set(gx * UNIT, gy * UNIT, gz * UNIT);
        cubie.userData.isCubie = true;
        // Reset uses the home transform instead of solving the visual cube backward.
        cubie.userData.home = {
            position: cubie.position.clone(),
            quaternion: cubie.quaternion.clone(),
        };

        // Black body
        const bodyGeo = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
        const body = new THREE.Mesh(bodyGeo, BODY_MAT);
        body.receiveShadow = true;
        body.castShadow = true;
        cubie.add(body);

        // Stickers — only on outer-facing sides
        if (gx ===  1) this._addSticker(cubie, 'R');
        if (gx === -1) this._addSticker(cubie, 'L');
        if (gy ===  1) this._addSticker(cubie, 'U');
        if (gy === -1) this._addSticker(cubie, 'D');
        if (gz ===  1) this._addSticker(cubie, 'F');
        if (gz === -1) this._addSticker(cubie, 'B');

        this.cubeGroup.add(cubie);
    }

    getCubeGroup() {
        return this.cubeGroup;
    }

    setAutoSpin(enabled) {
        this._autoSpinDisabled = !enabled;
    }

    resetCubies() {
        // Snap every cubie back to its home position/orientation. Re-parent any
        // strays still attached to a leftover pivot.
        const strays = [];
        this.cubeGroup.traverse(o => {
            if (o.userData?.isCubie && o.parent !== this.cubeGroup) strays.push(o);
        });
        strays.forEach(c => this.cubeGroup.attach(c));

        // Remove any leftover pivots
        const pivots = this.cubeGroup.children.filter(c => c.userData?.isPivot);
        pivots.forEach(p => this.cubeGroup.remove(p));

        for (const c of this.cubeGroup.children) {
            if (!c.userData?.isCubie) continue;
            c.position.copy(c.userData.home.position);
            c.quaternion.copy(c.userData.home.quaternion);
        }
    }

    _addSticker(cubie, face) {
        const mat = new THREE.MeshStandardMaterial({
            color: STICKER_COLORS[face],
            roughness: 0.12,
            metalness: 0.0,
        });
        const geo = new THREE.PlaneGeometry(STICKER_SIZE, STICKER_SIZE);
        const sticker = new THREE.Mesh(geo, mat);

        const L = STICKER_LIFT;
        // Sticker planes start facing +Z, then rotate onto each exposed cubie side.
        switch (face) {
            case 'R': sticker.position.set( L,  0,  0); sticker.rotation.y =  Math.PI / 2; break;
            case 'L': sticker.position.set(-L,  0,  0); sticker.rotation.y = -Math.PI / 2; break;
            case 'U': sticker.position.set( 0,  L,  0); sticker.rotation.x = -Math.PI / 2; break;
            case 'D': sticker.position.set( 0, -L,  0); sticker.rotation.x =  Math.PI / 2; break;
            case 'F': sticker.position.set( 0,  0,  L);                                     break;
            case 'B': sticker.position.set( 0,  0, -L); sticker.rotation.y =  Math.PI;     break;
        }

        cubie.add(sticker);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping  = true;
        this.controls.dampingFactor  = 0.07;
        this.controls.minDistance    = 4;
        this.controls.maxDistance    = 14;
        this.controls.enablePan      = false;
        this.controls.rotateSpeed    = 0.8;

        // Pause auto-spin on user interaction; resume after 4 s of idle
        const dom = this.renderer.domElement;
        dom.addEventListener('pointerdown', () => {
            this._userInteracting = true;
            clearTimeout(this._idleTimer);
        });
        dom.addEventListener('pointerup', () => {
            this._idleTimer = setTimeout(() => {
                this._userInteracting = false;
            }, 4000);
        });
    }

    _initResize() {
        const parent = this.canvas.parentElement;
        new ResizeObserver(() => {
            const w = parent.clientWidth;
            const h = parent.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h, false);
        }).observe(parent);
    }

    _startLoop() {
        const clock = new THREE.Clock();

        const tick = () => {
            requestAnimationFrame(tick);
            const dt = clock.getDelta();

            if (!this._userInteracting && !this._autoSpinDisabled) {
                this.cubeGroup.rotation.y += dt * 0.38;
                this.cubeGroup.rotation.x = Math.sin(clock.getElapsedTime() * 0.2) * 0.06;
            }

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };

        tick();
    }
}
