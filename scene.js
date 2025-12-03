// 3D场景设置
let scene, camera, renderer, cube, controls;

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

    // 创建长方体
    const geometry = new THREE.BoxGeometry(2, 1, 3); // 宽度, 高度, 深度
    const material = new THREE.MeshPhongMaterial({
        color: 0xffffff, // 白色
        shininess: 100,
        specular: 0x444444
    });
    cube = new THREE.Mesh(geometry, material);
    cube.rotation.x = Math.PI / 2; // 旋转90度使其竖直站立
    cube.position.set(0, 1.5, 0); // 放置在地面上（y = 旋转后高度的一半 = 3/2）
    scene.add(cube);

    // 添加黑色描边
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.rotation.x = Math.PI / 2; // 与立方体相同的旋转
    wireframe.position.set(0, 1.5, 0); // 与立方体位置相同
    scene.add(wireframe);

    // 创建球形网格地面
    // 使用球体几何创建弧形地面
    const sphereRadius = 30;
    const sphereGeometry = new THREE.SphereGeometry(
        sphereRadius, // 半径
        64, // 水平分段
        32, // 垂直分段
        0, // phiStart
        Math.PI * 2, // phiLength (完整圆周)
        0, // thetaStart
        Math.PI / 2.5 // thetaLength (只显示上半部分的一部分)
    );

    // 创建顶点着色器和片段着色器来实现渐变效果
    const gridMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0x00ff88) },
            radius: { value: sphereRadius }
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
            uniform float radius;
            varying vec3 vPosition;
            void main() {
                // 计算距离中心的距离来实现渐变
                float dist = length(vPosition.xz) / radius;
                float alpha = 1.0 - smoothstep(0.2, 1.0, dist);
                alpha *= 0.4; // 整体透明度
                gl_FragColor = vec4(color, alpha);
            }
        `,
        wireframe: true,
        transparent: true,
        side: THREE.DoubleSide
    });

    const gridSphere = new THREE.Mesh(sphereGeometry, gridMaterial);
    gridSphere.rotation.x = 0;
    gridSphere.position.y = -sphereRadius + 0.5; // 调整位置使顶部在y=0
    scene.add(gridSphere);

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

    // 监听窗口大小变化
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // 更新控制器
    controls.update();

    // 渲染场景
    renderer.render(scene, camera);
}

// 初始化并开始动画
init();
animate();
