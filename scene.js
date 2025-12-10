// 3D场景设置
let scene, camera, renderer, cube, wireframe, controls;
let audioContext, analyser, dataArray, audioElement;
let bassLevel = 0;

// 固定128 BPM节拍控制
const FIXED_BPM = 128;
const BEAT_INTERVAL = 60000 / FIXED_BPM; // 468.75ms
let lastFixedBeatTime = 0;
let beatCount = 0; // 用于强弱交替
let onBeat = false;

// 镜头伸缩控制（使用偏移量而非绝对位置）
const originalFOV = 75;
let currentBeatStrength = 0;
let cameraOffsetX = 0;
let cameraOffsetY = 0;
let cameraOffsetZ = 0;
let fovOffset = 0;

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

    // 创建着色器材质实现径向渐变效果（中心绿色，向外变浅）
    const gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            centerColor: { value: new THREE.Color(0x00ff88) }, // 中心亮绿色
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
                // 计算距离中心的距离
                float dist = length(vPosition.xy) / maxDistance;

                // 中心最亮，向外渐变变浅
                float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
                intensity = pow(intensity, 1.5); // 渐变曲线

                // 颜色强度从亮绿色渐变到接近透明
                vec3 finalColor = centerColor * intensity;
                float alpha = intensity * 0.6; // 透明度也随之减弱

                gl_FragColor = vec4(finalColor, alpha);
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

    // 创建拉杆 - 在长方体右侧
    const leverGroup = new THREE.Group();

    // 拉杆手柄（球形）
    const handleGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const handleMaterial = new THREE.MeshPhongMaterial({
        color: 0xff0000, // 红色手柄
        shininess: 100
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(0, 0.8, 0); // 在杆的顶部
    leverGroup.add(handle);

    // 拉杆杆身（圆柱）
    const rodGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 16);
    const rodMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888, // 灰色杆身
        shininess: 50
    });
    const rod = new THREE.Mesh(rodGeometry, rodMaterial);
    rod.position.set(0, 0.4, 0);
    leverGroup.add(rod);

    // 拉杆底座（圆柱）
    const baseGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({
        color: 0x444444, // 深灰色底座
        shininess: 30
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.set(0, 0.05, 0);
    leverGroup.add(base);

    // 拉杆位置：长方体右侧（x = 1，长方体宽度的一半）
    leverGroup.position.set(1.3, 1.5, 0); // 在长方体右侧，底部对齐
    scene.add(leverGroup);

    // 拉杆交互变量
    let isDragging = false;
    let leverAngle = 0; // 当前角度
    const maxLeverAngle = Math.PI / 3; // 最大拉下角度（60度）
    let isHovering = false; // 是否悬停在拉杆上

    // 鼠标/触摸事件监听
    let mouse = new THREE.Vector2();
    let raycaster = new THREE.Raycaster();

    function onMouseMove(event) {
        // 更新鼠标位置
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(handle);

        // 悬停效果
        if (intersects.length > 0 && !isDragging) {
            if (!isHovering) {
                isHovering = true;
                // 添加发光效果
                handleMaterial.emissive.setHex(0xff3333);
                handleMaterial.emissiveIntensity = 0.5;
                document.body.style.cursor = 'pointer';
            }
        } else if (!isDragging) {
            if (isHovering) {
                isHovering = false;
                // 移除发光效果
                handleMaterial.emissive.setHex(0x000000);
                handleMaterial.emissiveIntensity = 0;
                document.body.style.cursor = 'default';
            }
        }

        // 拉动逻辑
        if (isDragging) {
            event.preventDefault(); // 防止选中文本

            // 根据鼠标Y位置调整拉杆角度
            const normalizedY = 1 - (event.clientY / window.innerHeight);
            leverAngle = THREE.MathUtils.clamp(
                (normalizedY - 0.5) * maxLeverAngle * 2,
                0,
                maxLeverAngle
            );

            // 应用旋转（X轴旋转，向左拉动）
            leverGroup.rotation.x = -leverAngle;
        }
    }

    function onMouseDown(event) {
        // 计算鼠标位置
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(handle);

        if (intersects.length > 0) {
            event.preventDefault(); // 防止选中文本
            isDragging = true;
            // 视角已永久禁用，无需切换
        }
    }

    function onMouseUp(event) {
        if (isDragging) {
            event.preventDefault(); // 防止选中文本
            isDragging = false;
            // 视角已永久禁用，无需恢复

            // 松手后弹簧振动回弹
            const startAngle = leverAngle;
            const startTime = Date.now();
            const duration = 800; // 总持续时间800ms
            const frequency = 12; // 振荡频率
            const damping = 4; // 阻尼系数

            const springInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const t = elapsed / duration;

                if (t >= 1) {
                    // 回弹完成
                    leverAngle = 0;
                    leverGroup.rotation.x = 0;
                    clearInterval(springInterval);
                } else {
                    // 弹簧振荡效果：衰减振荡
                    const decay = Math.exp(-damping * t); // 指数衰减
                    const oscillation = Math.cos(frequency * t * Math.PI); // 余弦振荡
                    leverAngle = startAngle * decay * oscillation;
                    leverGroup.rotation.x = -leverAngle;
                }
            }, 16); // 约60fps
        }
    }

    // 添加CSS防止选中
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchstart', onMouseDown);
    window.addEventListener('touchmove', onMouseMove);
    window.addEventListener('touchend', onMouseUp);


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

    // 添加轨道控制器（完全禁用）
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = false; // 完全禁用左键和右键视角移动
    controls.enableRotate = false; // 禁用旋转
    controls.enablePan = false; // 禁用平移
    controls.enableZoom = false; // 禁用缩放

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

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

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

    // 更新BPM显示（仅显示固定128）
    const bpmDisplay = document.getElementById('bpmValue');
    const beatIndicator = document.getElementById('beatIndicator');
    if (bpmDisplay) {
        bpmDisplay.textContent = FIXED_BPM;
    }

    // 更新节拍指示器
    if (beatIndicator) {
        if (onBeat) {
            beatIndicator.classList.add('active');
        } else {
            beatIndicator.classList.remove('active');
        }
    }

    // 更新控制器（让用户可以自由操作视角）
    controls.update();

    // 镜头伸缩效果 - 使用偏移量，不影响OrbitControls
    if (onBeat) {
        // 根据节拍强度计算偏移量（减弱幅度）
        const zoomIntensity = currentBeatStrength * 0.3; // 最大拉近0.3个单位
        const fovChange = currentBeatStrength * 2; // FOV最大减少2度

        // 轻微随机抖动
        const shakeAmount = currentBeatStrength * 0.05; // 抖动幅度

        // 设置偏移量
        cameraOffsetZ = -zoomIntensity;
        cameraOffsetX = (Math.random() - 0.5) * shakeAmount;
        cameraOffsetY = (Math.random() - 0.5) * shakeAmount;
        fovOffset = -fovChange;

        // 立方体缩放效果
        const scaleIncrease = 1.0 + currentBeatStrength * 0.03;
        cube.scale.set(scaleIncrease, scaleIncrease, scaleIncrease);
        wireframe.scale.copy(cube.scale);
    } else {
        // 快速衰减偏移量
        const decay = 0.7;
        cameraOffsetX *= decay;
        cameraOffsetY *= decay;
        cameraOffsetZ *= decay;
        fovOffset *= decay;

        // 快速回归立方体缩放
        const scaleReset = 0.25;
        cube.scale.x += (1.0 - cube.scale.x) * scaleReset;
        cube.scale.y += (1.0 - cube.scale.y) * scaleReset;
        cube.scale.z += (1.0 - cube.scale.z) * scaleReset;
        wireframe.scale.copy(cube.scale);
    }

    // 应用临时偏移（不影响OrbitControls的基础位置）
    const tempPosX = camera.position.x;
    const tempPosY = camera.position.y;
    const tempPosZ = camera.position.z;
    const tempFOV = camera.fov;

    camera.position.x += cameraOffsetX;
    camera.position.y += cameraOffsetY;
    camera.position.z += cameraOffsetZ;
    camera.fov = originalFOV + fovOffset;
    camera.updateProjectionMatrix();

    // 渲染场景
    renderer.render(scene, camera);

    // 恢复相机位置（让OrbitControls在下一帧正常工作）
    camera.position.x = tempPosX;
    camera.position.y = tempPosY;
    camera.position.z = tempPosZ;
    camera.fov = tempFOV;
    camera.updateProjectionMatrix();
}

// 初始化并开始动画
init();
animate();
