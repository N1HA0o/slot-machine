/**
 * 角色类 - 处理角色的移动、动画和渲染
 */
class Character {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.velocityX = 0;
        this.velocityY = 0;

        // 角色尺寸
        this.width = 30;
        this.height = 60;

        // 移动参数
        this.moveSpeed = 150; // 像素/秒
        this.acceleration = 800;
        this.deceleration = 600;
        this.maxSpeed = 200;

        // 动画状态
        this.state = 'idle'; // idle, walking_left, walking_right
        this.animationFrame = 0;
        this.animationTimer = 0;
        this.animationSpeed = 0.15; // 动画帧切换速度

        // 移动方向输入
        this.moveDirection = 0; // -1 = 左, 0 = 无, 1 = 右

        // 地面Y坐标
        this.groundY = y;

        // 光照影响
        this.lightIllumination = 0; // 0-1, 受光照影响的程度
    }

    setMoveDirection(direction) {
        this.moveDirection = Math.max(-1, Math.min(1, direction));
    }

    update(deltaTime) {
        const dt = deltaTime / 1000; // 转换为秒

        // 根据输入方向更新速度
        if (this.moveDirection !== 0) {
            this.velocityX += this.moveDirection * this.acceleration * dt;
            this.velocityX = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.velocityX));
        } else {
            // 应用减速
            if (Math.abs(this.velocityX) > 0.1) {
                const decel = this.deceleration * dt;
                if (this.velocityX > 0) {
                    this.velocityX = Math.max(0, this.velocityX - decel);
                } else {
                    this.velocityX = Math.min(0, this.velocityX + decel);
                }
            } else {
                this.velocityX = 0;
            }
        }

        // 更新位置
        this.x += this.velocityX * dt;

        // 边界限制
        this.x = Math.max(50, Math.min(window.innerWidth - 50, this.x));

        // 更新动画状态
        this.updateAnimation(deltaTime);
    }

    updateAnimation(deltaTime) {
        const prevState = this.state;

        // 确定当前状态
        if (Math.abs(this.velocityX) < 5) {
            this.state = 'idle';
        } else if (this.velocityX < 0) {
            this.state = 'walking_left';
        } else {
            this.state = 'walking_right';
        }

        // 如果状态改变，重置动画
        if (prevState !== this.state) {
            this.animationFrame = 0;
            this.animationTimer = 0;
        }

        // 更新动画帧
        if (this.state !== 'idle') {
            this.animationTimer += deltaTime / 1000;
            if (this.animationTimer >= this.animationSpeed) {
                this.animationTimer = 0;
                this.animationFrame = (this.animationFrame + 1) % 4; // 4帧动画循环
            }
        }
    }

    updateLightIllumination(lightSystem, lightSourceBounds) {
        const intensity = lightSystem.getIntensity();

        if (intensity <= 0) {
            this.lightIllumination = 0;
            return;
        }

        // 计算角色是否在光照范围内
        const charCenterX = this.x;
        const charCenterY = this.y;

        const lightCenterX = lightSourceBounds.x + lightSourceBounds.width / 2;
        const lightCenterY = lightSourceBounds.y + lightSourceBounds.height / 2;

        // 计算距离光源的距离
        const dx = charCenterX - lightCenterX;
        const dy = charCenterY - lightCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 光照衰减（距离越远，光照越弱）
        const maxDistance = 400;
        const distanceFactor = Math.max(0, 1 - distance / maxDistance);

        // 最终光照强度
        this.lightIllumination = intensity * distanceFactor;
    }

    draw(ctx) {
        // 保存上下文
        ctx.save();

        // 基础颜色（深黑色剪影）
        let baseColor = '#0a0a0a';
        let outlineColor = '#000000';

        // 受光照影响时的颜色变化
        if (this.lightIllumination > 0) {
            const brightness = Math.floor(this.lightIllumination * 150);
            baseColor = `rgb(${brightness}, ${brightness}, ${brightness})`;
            outlineColor = `rgb(${Math.floor(brightness * 0.6)}, ${Math.floor(brightness * 0.6)}, ${Math.floor(brightness * 0.6)})`;
        }

        // 绘制角色剪影（简化的人形）
        ctx.fillStyle = baseColor;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = 2;

        // 身体（主矩形）
        const bodyWidth = this.width;
        const bodyHeight = this.height * 0.6;
        const bodyX = this.x - bodyWidth / 2;
        const bodyY = this.y - this.height;

        // 头部（圆形）
        const headRadius = this.width * 0.35;
        const headX = this.x;
        const headY = bodyY - headRadius;

        // 绘制头部
        ctx.beginPath();
        ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 绘制身体
        ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
        ctx.strokeRect(bodyX, bodyY, bodyWidth, bodyHeight);

        // 绘制腿部（带走路动画）
        const legWidth = this.width * 0.3;
        const legHeight = this.height * 0.4;
        let legOffset = 0;

        if (this.state !== 'idle') {
            // 腿部摆动动画
            legOffset = Math.sin(this.animationFrame * Math.PI / 2) * 8;
        }

        // 左腿
        ctx.fillRect(
            bodyX + 2,
            bodyY + bodyHeight,
            legWidth,
            legHeight + legOffset
        );

        // 右腿
        ctx.fillRect(
            bodyX + bodyWidth - legWidth - 2,
            bodyY + bodyHeight,
            legWidth,
            legHeight - legOffset
        );

        // 绘制手臂（带走路动画）
        if (this.state !== 'idle') {
            const armSwing = Math.sin(this.animationFrame * Math.PI / 2) * 10;

            // 左臂
            ctx.fillRect(
                bodyX - 5,
                bodyY + 10 + armSwing,
                5,
                bodyHeight * 0.5
            );

            // 右臂
            ctx.fillRect(
                bodyX + bodyWidth,
                bodyY + 10 - armSwing,
                5,
                bodyHeight * 0.5
            );
        }

        // 如果有光照，绘制地面阴影
        if (this.lightIllumination > 0.3) {
            ctx.fillStyle = `rgba(0, 0, 0, ${this.lightIllumination * 0.4})`;
            ctx.beginPath();
            ctx.ellipse(
                this.x,
                this.y + 5,
                bodyWidth * 0.6,
                10,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        ctx.restore();
    }

    getPosition() {
        return { x: this.x, y: this.y };
    }

    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height,
            width: this.width,
            height: this.height
        };
    }
}
