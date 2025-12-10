// 3D scene setup
let scene, camera, renderer, cube, wireframe, controls;
let audioContext, analyser, dataArray, audioElement;
let bassLevel = 0;

// Fixed 128 BPM beat control
const FIXED_BPM = 128;
const BEAT_INTERVAL = 60000 / FIXED_BPM; // 468.75ms
let lastFixedBeatTime = 0;
let beatCount = 0; // For strong-weak alternation
let onBeat = false;

// Camera zoom control (using offsets instead of absolute positions)
const originalFOV = 75;
let currentBeatStrength = 0;
let cameraOffsetX = 0;
let cameraOffsetY = 0;
let cameraOffsetZ = 0;
let fovOffset = 0;

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Create camera
    camera = new THREE.PerspectiveCamera(
        75, // Field of view
        window.innerWidth / window.innerHeight, // Aspect ratio
        0.1, // Near clipping plane
        1000 // Far clipping plane
    );
    camera.position.z = 5;
    camera.position.y = 2;
    camera.position.x = 2;

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Create rectangular box - vertical (width 2, height 3, depth 1)
    const geometry = new THREE.BoxGeometry(2, 3, 1);
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff, // White
        shininess: 100,
        specular: 0x444444
    });
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.5, 0); // y = half of height, bottom at y=0
    scene.add(cube);

    // Add black outline
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.set(0, 1.5, 0); // Same position as cube
    scene.add(wireframe);

    // Create flat grid floor
    const gridSize = 50;
    const gridDivisions = 80;
    const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize, gridDivisions, gridDivisions);

    // Create shader material for radial gradient effect (green center, fading outward)
    const gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            centerColor: { value: new THREE.Color(0x00ff88) }, // Bright green center
            maxDistance: { value: gridSize / 2 }
        },
        vertexShader: `
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 centerColor;
            uniform float maxDistance;
            varying vec3 vPosition;
            void main() {
                // Calculate distance from center
                float dist = length(vPosition.xy) / maxDistance;

                // Brightest at center, fading outward
                float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
                intensity = pow(intensity, 1.5); // Gradient curve

                // Color intensity fades from bright green to nearly transparent
                vec3 finalColor = centerColor * intensity;
                float alpha = intensity * 0.6; // Transparency also decreases

                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        wireframe: true,
        transparent: true,
        side: THREE.DoubleSide
    });

    const gridPlane = new THREE.Mesh(planeGeometry, gridMaterial);
    gridPlane.rotation.x = -Math.PI / 2; // Rotate to horizontal
    gridPlane.position.y = 0; // Place at y=0, aligned with cube bottom
    scene.add(gridPlane);

    // Create lever - on the right side of the box
    const leverGroup = new THREE.Group();

    // Lever handle (sphere)
    const handleGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const handleMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000, // Red handle
        shininess: 100
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(0, 0.8, 0); // At the top of the rod
    leverGroup.add(handle);

    // Lever rod (cylinder)
    const rodGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 16);
    const rodMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888, // Gray rod
        shininess: 50
    });
    const rod = new THREE.Mesh(rodGeometry, rodMaterial);
    rod.position.set(0, 0.4, 0);
    leverGroup.add(rod);

    // Lever base (cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({
        color: 0x444444, // Dark gray base
        shininess: 30
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.05, 0);
    leverGroup.add(base);

    // Lever position: right side of box (x = 1, half of box width)
    leverGroup.position.set(1.3, 1.5, 0); // On right side of box, bottom aligned
    leverGroup.rotation.y = -Math.PI / 2; // Rotate left 90 degrees
    scene.add(leverGroup);

    // Lever interaction variables
    let isDragging = false;
    let leverAngle = 0; // Current angle
    const maxLeverAngle = Math.PI / 3; // Maximum pull angle (60 degrees)
    let isHovering = false; // Whether hovering over lever

    // Mouse/touch event listeners
    let mouse = new THREE.Vector2();
    let raycaster = new THREE.Raycaster();

    function onMouseMove(event) {
        // Update mouse position
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(handle);

        // Hover effect
        if (intersects.length > 0 && !isDragging) {
            if (!isHovering) {
                isHovering = true;
                // Add glow effect
                handleMaterial.emissive.setHex(0xff3333);
                handleMaterial.emissiveIntensity = 0.5;
                document.body.style.cursor = 'pointer';
            }
        } else if (!isDragging) {
            if (isHovering) {
                isHovering = false;
                // Remove glow effect
                handleMaterial.emissive.setHex(0x000000);
                handleMaterial.emissiveIntensity = 0;
                document.body.style.cursor = 'default';
            }
        }

        // Dragging logic
        if (isDragging) {
            event.preventDefault(); // Prevent text selection

            // Adjust lever angle based on mouse Y position (mouse down = lever down)
            const normalizedY = event.clientY / window.innerHeight;
            leverAngle = THREE.MathUtils.clamp(
                (normalizedY - 0.5) * maxLeverAngle * 2,
                -maxLeverAngle,
                maxLeverAngle
            );

            // Apply rotation (X-axis rotation, pull toward screen)
            leverGroup.rotation.x = -leverAngle;
        }
    }

    function onMouseDown(event) {
        // Calculate mouse position
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(handle);

        if (intersects.length > 0) {
            event.preventDefault(); // Prevent text selection
            isDragging = true;
            // Camera controls are permanently disabled
        }
    }

    function onMouseUp(event) {
        if (isDragging) {
            event.preventDefault(); // Prevent text selection
            isDragging = false;
            // Camera controls are permanently disabled

            // Spring rebound after release
            const startAngle = leverAngle;
            const startTime = Date.now();
            const duration = 800; // Total duration 800ms
            const frequency = 12; // Oscillation frequency
            const damping = 4; // Damping coefficient

            const springInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const t = elapsed / duration;

                if (t >= 1) {
                    // Rebound complete
                    leverAngle = 0;
                    leverGroup.rotation.x = 0;
                    clearInterval(springInterval);
                } else {
                    // Spring oscillation effect: damped oscillation
                    const decay = Math.exp(-damping * t); // Exponential decay
                    const oscillation = Math.cos(frequency * t * Math.PI); // Cosine oscillation
                    leverAngle = startAngle * decay * oscillation;
                    leverGroup.rotation.x = -leverAngle;
                }
            }, 16); // Approx 60fps
        }
    }

    // Add CSS to prevent text selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onMouseDown);
    window.addEventListener('touchmove', onMouseMove);
    window.addEventListener('touchend', onMouseUp);


    // Add ambient light - enhanced brightness
    const ambientLight = new THREE.AmbientLight(0x808080, 2);
    scene.add(ambientLight);

    // Add directional light - enhanced brightness
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add point light - enhanced brightness
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // Add orbit controls (completely disabled)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = false; // Completely disable left and right mouse camera movement
    controls.enableRotate = false; // Disable rotation
    controls.enablePan = false; // Disable panning
    controls.enableZoom = false; // Disable zoom

    // Initialize audio analyser
    setupAudioAnalyser();

    // Listen for window resize
    window.addEventListener('resize', onWindowResize, false);
}

// Setup audio analyser
function setupAudioAnalyser() {
    audioElement = document.getElementById('bgMusic');

    // Initialize analyser when audio starts playing
    audioElement.addEventListener('play', function() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            const source = audioContext.createMediaElementSource(audioElement);
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }
    });
}

// Analyze audio to get bass intensity
function getBasslevel() {
    if (!analyser || !dataArray) return 0;

    analyser.getByteFrequencyData(dataArray);

    // Get low frequency portion (drums are usually in low frequencies)
    let sum = 0;
    const lowFreqCount = Math.floor(dataArray.length * 0.15); // First 15% of frequencies

    for (let i = 0; i < lowFreqCount; i++) {
        sum += dataArray[i];
    }

    const average = sum / lowFreqCount;
    return average / 255; // Normalize to 0-1
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Fixed 128 BPM beat trigger
    const currentTime = Date.now();
    if (currentTime - lastFixedBeatTime >= BEAT_INTERVAL) {
        onBeat = true;
        lastFixedBeatTime = currentTime;
        beatCount++;

        // Get current audio energy for intensity adjustment
        const currentEnergy = getBasslevel();
        // Strong-weak alternation: even beats are strong, odd beats are weak
        const isStrongBeat = beatCount % 2 === 0;
        const beatMultiplier = isStrongBeat ? 1.0 : 0.5; // Strong beat 100%, weak beat 50%

        // Final intensity = audio energy × strong-weak coefficient
        currentBeatStrength = Math.min(currentEnergy, 1.0) * beatMultiplier;
    } else {
        onBeat = false;
    }

    // Update BPM display (only show fixed 128)
    const bpmDisplay = document.getElementById('bpmValue');
    const beatIndicator = document.getElementById('beatIndicator');
    if (bpmDisplay) {
        bpmDisplay.textContent = FIXED_BPM;
    }

    // Update beat indicator
    if (beatIndicator) {
        if (onBeat) {
            beatIndicator.classList.add('active');
        } else {
            beatIndicator.classList.remove('active');
        }
    }

    // Update controls (allows user to freely operate camera)
    controls.update();

    // Camera zoom effect - use offsets, doesn't affect OrbitControls
    if (onBeat) {
        // Calculate offsets based on beat intensity (reduced amplitude)
        const zoomIntensity = currentBeatStrength * 0.3; // Max zoom in 0.3 units
        const fovChange = currentBeatStrength * 2; // FOV max decrease 2 degrees

        // Slight random shake
        const shakeAmount = currentBeatStrength * 0.05; // Shake amplitude

        // Set offsets
        cameraOffsetZ = -zoomIntensity;
        cameraOffsetX = (Math.random() - 0.5) * shakeAmount;
        cameraOffsetY = (Math.random() - 0.5) * shakeAmount;
        fovOffset = -fovChange;

        // Cube scaling effect
        const scaleIncrease = 1.0 + currentBeatStrength * 0.03;
        cube.scale.set(scaleIncrease, scaleIncrease, scaleIncrease);
        wireframe.scale.copy(cube.scale);
    } else {
        // Fast decay of offsets
        const decay = 0.7;
        cameraOffsetX *= decay;
        cameraOffsetY *= decay;
        cameraOffsetZ *= decay;
        fovOffset *= decay;

        // Fast reset of cube scaling
        const scaleReset = 0.25;
        cube.scale.x += (1.0 - cube.scale.x) * scaleReset;
        cube.scale.y += (1.0 - cube.scale.y) * scaleReset;
        cube.scale.z += (1.0 - cube.scale.z) * scaleReset;
        wireframe.scale.copy(cube.scale);
    }

    // Apply temporary offsets (doesn't affect OrbitControls base position)
    const tempPosX = camera.position.x;
    const tempPosY = camera.position.y;
    const tempPosZ = camera.position.z;
    const tempFOV = camera.fov;

    camera.position.x += cameraOffsetX;
    camera.position.y += cameraOffsetY;
    camera.position.z += cameraOffsetZ;
    camera.fov = originalFOV + fovOffset;
    camera.updateProjectionMatrix();

    // Render scene
    renderer.render(scene, camera);

    // Restore camera position (allows OrbitControls to work normally next frame)
    camera.position.x = tempPosX;
    camera.position.y = tempPosY;
    camera.position.z = tempPosZ;
    camera.fov = tempFOV;
    camera.updateProjectionMatrix();
}

// Initialize and start animation
init();
animate();
