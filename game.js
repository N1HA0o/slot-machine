/**
 * 主游戏逻辑
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // 设置画布尺寸
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 游戏状态
        this.isRunning = false;
        this.isPaused = false;
        this.lastTime = 0;

        // 游戏对象
        this.character = null;
        this.lightingSystem = null;
        this.gestureController = null;

        // 场景元素
        this.chair = {
            x: 0,
            y: 0,
            width: 80,
            height: 100
        };

        this.window = {
            x: 0,
            y: 0,
            width: 200,
            height: 300
        };

        // UI元素
        this.loadingScreen = document.getElementById('loading-screen');
        this.startButton = document.getElementById('startButton');
        this.statusText = document.getElementById('status');
        this.gestureIndicator = document.getElementById('gesture-indicator');
        this.indicatorLeft = document.querySelector('.indicator-left');
        this.indicatorRight = document.querySelector('.indicator-right');

        // 绑定事件
        this.startButton.addEventListener('click', () => this.start());

        // 键盘控制（调试用）
        this.keyboardEnabled = true;
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // 更新场景元素位置
        this.updateSceneLayout();
    }

    updateSceneLayout() {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 窗口位置（右侧中上）
        this.window.x = w * 0.75;
        this.window.y = h * 0.2;

        // 椅子位置（左侧下方）
        this.chair.x = w * 0.25;
        this.chair.y = h * 0.65;

        // 更新光源位置
        if (this.lightingSystem) {
            this.lightingSystem.setLightSource(
                this.window.x,
                this.window.y,
                this.window.width,
                this.window.height
            );
        }

        // 角色初始位置
        if (this.character) {
            this.character.groundY = this.chair.y + 20;
        }
    }

    async initialize() {
        this.statusText.textContent = '正在初始化...';

        // 初始化游戏系统
        this.lightingSystem = new LightingSystem();
        this.character = new Character(
            this.canvas.width * 0.25,
            this.canvas.height * 0.65 + 20
        );

        this.updateSceneLayout();

        // 初始化手势控制
        this.statusText.textContent = '正在启动摄像头...';
        this.gestureController = new GestureController();

        const success = await this.gestureController.initialize();

        if (!success) {
            this.statusText.textContent = '摄像头启动失败，将使用键盘控制（方向键）';
            this.gestureController = null;
        } else {
            this.statusText.textContent = '请允许摄像头访问';

            // 设置手势回调
            this.gestureController.onGestureChange = (state) => {
                this.onGestureChange(state);
            };
        }

        // 显示开始按钮
        this.startButton.style.display = 'block';
        this.statusText.textContent = success ?
            '准备就绪！使用手势控制角色移动' :
            '使用左右方向键控制角色移动';
    }

    start() {
        // 隐藏加载屏幕
        this.loadingScreen.classList.add('hidden');

        // 显示手势指示器
        if (this.gestureController) {
            this.gestureIndicator.classList.remove('hidden');
            this.gestureController.start();
        }

        // 开始游戏循环
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);

        console.log('游戏开始！');
    }

    gameLoop(currentTime) {
        if (!this.isRunning) return;

        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // 更新
        this.update(deltaTime);

        // 渲染
        this.render();

        // 继续循环
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        // 处理键盘输入（调试用）
        if (this.keyboardEnabled && !this.gestureController) {
            let moveDir = 0;
            if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) moveDir -= 1;
            if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) moveDir += 1;
            this.character.setMoveDirection(moveDir);
        }

        // 更新游戏系统
        this.lightingSystem.update(deltaTime);
        this.character.update(deltaTime);

        // 更新角色光照效果
        this.character.updateLightIllumination(this.lightingSystem, this.window);
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 清空画布（纯黑背景）
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        // 绘制地面线（微弱的灰色线）
        const groundY = h * 0.7;
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(w, groundY);
        ctx.stroke();

        // 绘制椅子（剪影风格）
        this.drawChair(ctx);

        // 绘制窗口
        this.drawWindow(ctx);

        // 绘制角色
        this.character.draw(ctx);

        // 绘制粒子效果
        this.drawParticles(ctx);

        // 绘制调试信息
        if (window.location.hash === '#debug') {
            this.drawDebugInfo(ctx);
        }
    }

    drawChair(ctx) {
        const c = this.chair;

        ctx.fillStyle = '#0a0a0a';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;

        // 椅子座位
        ctx.fillRect(c.x - c.width / 2, c.y, c.width, 15);
        ctx.strokeRect(c.x - c.width / 2, c.y, c.width, 15);

        // 椅背
        ctx.fillRect(c.x - c.width / 2, c.y - c.height * 0.6, 10, c.height * 0.6);
        ctx.strokeRect(c.x - c.width / 2, c.y - c.height * 0.6, 10, c.height * 0.6);

        // 椅腿
        const legWidth = 8;
        ctx.fillRect(c.x - c.width / 2 + 5, c.y + 15, legWidth, c.height * 0.3);
        ctx.fillRect(c.x + c.width / 2 - 15, c.y + 15, legWidth, c.height * 0.3);
    }

    drawWindow(ctx) {
        const win = this.window;
        const intensity = this.lightingSystem.getIntensity();

        // 窗框（黑色剪影）
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 8;
        ctx.strokeRect(win.x, win.y, win.width, win.height);

        // 窗口内部（根据光强度变化）
        if (intensity > 0) {
            // 创建径向渐变光
            const gradient = ctx.createRadialGradient(
                win.x + win.width / 2,
                win.y + win.height / 2,
                0,
                win.x + win.width / 2,
                win.y + win.height / 2,
                win.width
            );

            const brightness = Math.floor(intensity * 255);
            gradient.addColorStop(0, `rgba(${brightness}, ${brightness}, ${brightness}, ${intensity})`);
            gradient.addColorStop(0.7, `rgba(${Math.floor(brightness * 0.6)}, ${Math.floor(brightness * 0.6)}, ${Math.floor(brightness * 0.6)}, ${intensity * 0.5})`);
            gradient.addColorStop(1, `rgba(${Math.floor(brightness * 0.3)}, ${Math.floor(brightness * 0.3)}, ${Math.floor(brightness * 0.3)}, 0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(win.x, win.y, win.width, win.height);

            // 光柱效果（向外扩散）
            if (intensity > 0.5) {
                ctx.save();
                ctx.globalAlpha = (intensity - 0.5) * 0.4;

                const beamGradient = ctx.createLinearGradient(
                    win.x + win.width,
                    win.y + win.height / 2,
                    this.canvas.width * 0.3,
                    this.canvas.height * 0.7
                );

                beamGradient.addColorStop(0, `rgba(${brightness}, ${brightness}, ${brightness}, 0.3)`);
                beamGradient.addColorStop(1, 'rgba(50, 50, 50, 0)');

                ctx.fillStyle = beamGradient;
                ctx.beginPath();
                ctx.moveTo(win.x, win.y);
                ctx.lineTo(this.canvas.width * 0.2, this.canvas.height * 0.6);
                ctx.lineTo(this.canvas.width * 0.2, this.canvas.height * 0.8);
                ctx.lineTo(win.x, win.y + win.height);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        } else {
            // 无光时，窗口是深灰色
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(win.x, win.y, win.width, win.height);
        }

        // 窗格分隔线
        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(win.x + win.width / 2, win.y);
        ctx.lineTo(win.x + win.width / 2, win.y + win.height);
        ctx.stroke();
    }

    drawParticles(ctx) {
        const particles = this.lightingSystem.getParticles();

        ctx.save();

        particles.forEach(p => {
            ctx.fillStyle = `rgba(200, 200, 200, ${p.opacity * p.life})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    drawDebugInfo(ctx) {
        ctx.fillStyle = '#00ff00';
        ctx.font = '14px monospace';
        ctx.fillText(`Light Intensity: ${this.lightingSystem.getIntensity().toFixed(2)}`, 10, 20);
        ctx.fillText(`Light Phase: ${this.lightingSystem.phase}`, 10, 40);
        ctx.fillText(`Character Illumination: ${this.character.lightIllumination.toFixed(2)}`, 10, 60);
        ctx.fillText(`Character Pos: (${Math.floor(this.character.x)}, ${Math.floor(this.character.y)})`, 10, 80);
        ctx.fillText(`Velocity: ${Math.floor(this.character.velocityX)}`, 10, 100);
        ctx.fillText(`Particles: ${this.lightingSystem.particles.length}`, 10, 120);

        if (this.gestureController) {
            const state = this.gestureController.getGestureState();
            ctx.fillText(`Gesture Left: ${state.left} (${state.leftConfidence.toFixed(2)})`, 10, 140);
            ctx.fillText(`Gesture Right: ${state.right} (${state.rightConfidence.toFixed(2)})`, 10, 160);
        }
    }

    onGestureChange(state) {
        // 更新角色移动方向
        let moveDir = 0;
        if (state.left) moveDir -= 1;
        if (state.right) moveDir += 1;

        this.character.setMoveDirection(moveDir);

        // 更新UI指示器
        if (state.left) {
            this.indicatorLeft.classList.add('active');
        } else {
            this.indicatorLeft.classList.remove('active');
        }

        if (state.right) {
            this.indicatorRight.classList.add('active');
        } else {
            this.indicatorRight.classList.remove('active');
        }
    }

    stop() {
        this.isRunning = false;
        if (this.gestureController) {
            this.gestureController.stop();
        }
    }

    destroy() {
        this.stop();
        if (this.gestureController) {
            this.gestureController.destroy();
        }
    }
}

// 启动游戏
let game;

window.addEventListener('DOMContentLoaded', () => {
    game = new Game();
    game.initialize();
});

// 清理
window.addEventListener('beforeunload', () => {
    if (game) {
        game.destroy();
    }
});
