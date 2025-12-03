// 3D场景设置
let scene, camera, renderer, cube, wireframe, controls;
let audioContext, analyser, dataArray, audioElement;
let bassLevel = 0;

// BPM检测（仅用于显示）
let detectedBPM = 0;
let beatHistory = [];
let energyHistory = [];

// 固定128 BPM节拍控制
const FIXED_BPM = 128;
const BEAT_INTERVAL = 60000 / FIXED_BPM; // 468.75ms
let lastFixedBeatTime = 0;
let beatCount = 0; // 用于强弱交替
let onBeat = false;

// 镜头伸缩控制
const originalCameraX = 2;
const originalCameraY = 2;
const originalCameraZ = 5;
const originalFOV = 75;
let currentBeatStrength = 0;

function init() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // 创建摄像机
    camera = new THREE.PerspectiveCamera(
        75, // 视角
        window.innerWidth / window.innerHeight, // 宽高比
        0.1, // 近裁剪面
        1000 // 远裁剪面
    );
    camera.position.z = 5;
    camera.position.y = 2;
    camera.position.x = 2;

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 创建长方体 - 直接创建竖直的（宽2, 高3, 深1）
    const geometry = new THREE.BoxGeometry(2, 3, 1);
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff, // 白色
        shininess: 100,
        specular: 0x444444
    });
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 1.5, 0); // y = 高度的一半，底部在y=0
    scene.add(cube);

    // 添加黑色描边
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.set(0, 1.5, 0); // 与立方体位置相同
    scene.add(wireframe);

    // 创建完全平面的网格地面
    const gridSize = 50;
    const gridDivisions = 80;
    const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize, gridDivisions, gridDivisions);

    // 创建着色器材质实现渐变消失效果（完全平面，无弯曲）
    const gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0x00ff88) },
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
            uniform vec3 color;
            uniform float maxDistance;
            varying vec3 vPosition;
            void main() {
                // 计算距离中心的距离来实现径向渐变
                float dist = length(vPosition.xy) / maxDistance;
                float alpha = 1.0 - smoothstep(0.3, 1.0, dist);
                alpha *= 0.5; // 整体透明度
                gl_FragColor = vec4(color, alpha);
            }
        `,
        wireframe: true,
        transparent: true,
        side: THREE.DoubleSide
    });

    const gridPlane = new THREE.Mesh(planeGeometry, gridMaterial);
    gridPlane.rotation.x = -Math.PI / 2; // 旋转使其水平
    gridPlane.position.y = 0; // 放在y=0，与立方体底部对齐
    scene.add(gridPlane);

    // 添加环境光 - 增强亮度
    const ambientLight = new THREE.AmbientLight(0x808080, 2);
    scene.add(ambientLight);

    // 添加方向光 - 增强亮度
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // 添加点光源 - 增强亮度
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(-5, 5, 5);
    scene.add(pointLight);

    // 添加轨道控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 3;
    controls.maxDistance = 20;

    // 初始化音频分析器
    setupAudioAnalyser();

    // 监听窗口大小变化
    window.addEventListener('resize', onWindowResize, false);
}

// 设置音频分析器
function setupAudioAnalyser() {
    audioElement = document.getElementById('bgMusic');

    // 当音频开始播放时初始化分析器
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

// 分析音频获取鼓点强度
function getBasslevel() {
    if (!analyser || !dataArray) return 0;

    analyser.getByteFrequencyData(dataArray);

    // 获取低频部分（鼓点通常在低频）
    let sum = 0;
    const lowFreqCount = Math.floor(dataArray.length * 0.15); // 前15%的频率

    for (let i = 0; i < lowFreqCount; i++) {
        sum += dataArray[i];
    }

    const average = sum / lowFreqCount;
    return average / 255; // 归一化到0-1
}

// BPM检测（仅用于显示）
function detectBPM() {
    if (!analyser || !dataArray) return;

    const currentEnergy = getBasslevel();
    const currentTime = Date.now();

    // 保存能量历史（最近100帧）
    energyHistory.push(currentEnergy);
    if (energyHistory.length > 100) {
        energyHistory.shift();
    }

    // 计算能量平均值和阈值
    const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    const threshold = avgEnergy * 1.3;

    // 检测节拍用于BPM计算（不用于触发zoom）
    if (currentEnergy > threshold && currentEnergy > 0.4) {
        const lastBeatTime = beatHistory.length > 0 ? beatHistory[beatHistory.length - 1].time : 0;
        if (currentTime - lastBeatTime > 200) {
            beatHistory.push({ time: currentTime, energy: currentEnergy });

            // 保留最近8个节拍
            if (beatHistory.length > 8) {
                beatHistory.shift();
            }

            // 计算BPM
            if (beatHistory.length >= 4) {
                let totalInterval = 0;
                for (let i = 1; i < beatHistory.length; i++) {
                    totalInterval += beatHistory[i].time - beatHistory[i - 1].time;
                }
                const avgInterval = totalInterval / (beatHistory.length - 1);
                detectedBPM = Math.round(60000 / avgInterval);
            }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // 检测BPM（仅用于显示）
    detectBPM();

    // 固定128 BPM节拍触发
    const currentTime = Date.now();
    if (currentTime - lastFixedBeatTime >= BEAT_INTERVAL) {
        onBeat = true;
        lastFixedBeatTime = currentTime;
        beatCount++;

        // 获取当前音频能量作为强度调节
        const currentEnergy = getBasslevel();
        // 强弱交替：偶数拍为强拍，奇数拍为弱拍
        const isStrongBeat = beatCount % 2 === 0;
        const beatMultiplier = isStrongBeat ? 1.0 : 0.5; // 强拍100%，弱拍50%

        // 最终强度 = 音频能量 × 强弱系数
        currentBeatStrength = Math.min(currentEnergy, 1.0) * beatMultiplier;
    } else {
        onBeat = false;
    }

    // 更新BPM显示（显示检测到的BPM和固定BPM）
    const bpmDisplay = document.getElementById('bpmValue');
    const beatIndicator = document.getElementById('beatIndicator');
    if (bpmDisplay) {
        const displayText = detectedBPM > 0 ? `${detectedBPM} (固定${FIXED_BPM})` : FIXED_BPM;
        bpmDisplay.textContent = displayText;
    }

    // 更新节拍指示器
    if (beatIndicator) {
        if (onBeat) {
            beatIndicator.classList.add('active');
        } else {
            beatIndicator.classList.remove('active');
        }
    }

    // 镜头伸缩效果 - 干脆的伸缩 + 轻微抖动 + 快速复位
    if (onBeat) {
        // 根据节拍强度计算镜头拉近距离（鼓点越强，镜头拉得越近）
        const zoomIntensity = currentBeatStrength * 1.5; // 最大拉近1.5个单位
        const fovChange = currentBeatStrength * 8; // FOV最大减少8度

        // 轻微随机抖动
        const shakeAmount = currentBeatStrength * 0.15; // 抖动幅度随鼓点强度变化
        const shakeX = (Math.random() - 0.5) * shakeAmount;
        const shakeY = (Math.random() - 0.5) * shakeAmount;

        // 立即应用伸缩和抖动（干脆的效果）
        camera.position.z = originalCameraZ - zoomIntensity;
        camera.position.x = originalCameraX + shakeX;
        camera.position.y = originalCameraY + shakeY;
        camera.fov = originalFOV - fovChange;
        camera.updateProjectionMatrix();

        // 立方体缩放效果
        const scaleIncrease = 1.0 + currentBeatStrength * 0.12;
        cube.scale.set(scaleIncrease, scaleIncrease, scaleIncrease);
        wireframe.scale.copy(cube.scale);
    } else {
        // 快速复位到原始状态
        const resetSpeed = 0.3; // 更快的复位速度
        camera.position.x += (originalCameraX - camera.position.x) * resetSpeed;
        camera.position.y += (originalCameraY - camera.position.y) * resetSpeed;
        camera.position.z += (originalCameraZ - camera.position.z) * resetSpeed;
        camera.fov += (originalFOV - camera.fov) * resetSpeed;
        camera.updateProjectionMatrix();

        // 快速回归立方体缩放
        const scaleReset = 0.25;
        cube.scale.x += (1.0 - cube.scale.x) * scaleReset;
        cube.scale.y += (1.0 - cube.scale.y) * scaleReset;
        cube.scale.z += (1.0 - cube.scale.z) * scaleReset;
        wireframe.scale.copy(cube.scale);
    }

    // 更新控制器
    controls.update();

    // 渲染场景
    renderer.render(scene, camera);
}

// 初始化并开始动画
init();
animate();
