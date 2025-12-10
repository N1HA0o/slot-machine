/**
 * 光照系统 - 处理地铁经过时的动态光照效果
 */
class LightingSystem {
    constructor() {
        this.isActive = false;
        this.intensity = 0; // 0-1
        this.phase = 'idle'; // idle, approaching, full, fading
        this.nextTrainTime = 0;
        this.phaseTimer = 0;

        // 光照配置
        this.config = {
            minInterval: 14000, // 14秒
            maxInterval: 20000, // 20秒
            totalDuration: 5000, // 总持续5秒
            approachDuration: 1000, // 接近阶段1秒
            fullDuration: 2500, // 全亮阶段2.5秒
            fadeDuration: 1500, // 衰减阶段1.5秒
        };

        // 光源位置（窗口位置）
        this.lightSource = {
            x: 0,
            y: 0,
            width: 200,
            height: 300
        };

        // 粒子系统
        this.particles = [];
        this.maxParticles = 50;

        this.scheduleNextTrain();
    }

    scheduleNextTrain() {
        const interval = this.config.minInterval +
            Math.random() * (this.config.maxInterval - this.config.minInterval);
        this.nextTrainTime = Date.now() + interval;
    }

    update(deltaTime) {
        const now = Date.now();

        // 检查是否需要触发新的地铁事件
        if (this.phase === 'idle' && now >= this.nextTrainTime) {
            this.startTrainEvent();
        }

        // 更新当前光照阶段
        if (this.phase !== 'idle') {
            this.phaseTimer += deltaTime;
            this.updateLightPhase();
        }

        // 更新粒子
        this.updateParticles(deltaTime);
    }

    startTrainEvent() {
        this.phase = 'approaching';
        this.phaseTimer = 0;
        this.intensity = 0;
        console.log('地铁接近中...');
    }

    updateLightPhase() {
        switch (this.phase) {
            case 'approaching':
                // 光线逐渐增强（缓入）
                const approachProgress = this.phaseTimer / this.config.approachDuration;
                this.intensity = this.easeInQuad(Math.min(approachProgress, 1));

                if (this.phaseTimer >= this.config.approachDuration) {
                    this.phase = 'full';
                    this.phaseTimer = 0;
                    this.spawnParticles();
                }
                break;

            case 'full':
                // 保持全亮
                this.intensity = 1.0;

                if (this.phaseTimer >= this.config.fullDuration) {
                    this.phase = 'fading';
                    this.phaseTimer = 0;
                }
                break;

            case 'fading':
                // 光线逐渐减弱（缓出）
                const fadeProgress = this.phaseTimer / this.config.fadeDuration;
                this.intensity = 1 - this.easeOutQuad(Math.min(fadeProgress, 1));

                if (this.phaseTimer >= this.config.fadeDuration) {
                    this.phase = 'idle';
                    this.intensity = 0;
                    this.particles = [];
                    this.scheduleNextTrain();
                    console.log('地铁已离开');
                }
                break;
        }
    }

    spawnParticles() {
        // 在光线中生成灰尘粒子
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                x: this.lightSource.x + Math.random() * this.lightSource.width,
                y: this.lightSource.y + Math.random() * this.lightSource.height,
                speedX: (Math.random() - 0.5) * 0.2,
                speedY: (Math.random() - 0.5) * 0.2,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.3,
                life: 1.0
            });
        }
    }

    updateParticles(deltaTime) {
        if (this.phase === 'idle') return;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.speedX * deltaTime;
            p.y += p.speedY * deltaTime;
            p.life -= deltaTime * 0.0003;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    // 缓动函数
    easeInQuad(t) {
        return t * t;
    }

    easeOutQuad(t) {
        return t * (2 - t);
    }

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    setLightSource(x, y, width, height) {
        this.lightSource = { x, y, width, height };
    }

    getIntensity() {
        return this.intensity;
    }

    isLightActive() {
        return this.phase !== 'idle';
    }

    getParticles() {
        return this.particles;
    }
}
