/**
 * 手势控制系统 - 使用MediaPipe Hands进行手势识别
 */
class GestureController {
    constructor() {
        this.hands = null;
        this.camera = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasCtx = null;

        this.isInitialized = false;
        this.isActive = false;

        // 手势状态
        this.gestureState = {
            left: false,
            right: false,
            leftConfidence: 0,
            rightConfidence: 0
        };

        // 手势持续时间（防止误触）
        this.gestureThreshold = 200; // 毫秒
        this.leftGestureStartTime = 0;
        this.rightGestureStartTime = 0;

        // 回调函数
        this.onGestureChange = null;
    }

    async initialize() {
        try {
            // 获取视频元素
            this.videoElement = document.getElementById('webcam');
            this.canvasElement = document.getElementById('gestureCanvas');
            this.canvasCtx = this.canvasElement.getContext('2d');

            // 初始化MediaPipe Hands
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults((results) => this.onResults(results));

            // 初始化摄像头
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 1280,
                    height: 720,
                    facingMode: 'user'
                }
            });

            this.videoElement.srcObject = stream;

            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    resolve();
                };
            });

            // 设置画布尺寸
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;

            // 启动摄像头处理
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    if (this.isActive) {
                        await this.hands.send({ image: this.videoElement });
                    }
                },
                width: 1280,
                height: 720
            });

            await this.camera.start();

            this.isInitialized = true;
            console.log('手势控制系统初始化成功');
            return true;

        } catch (error) {
            console.error('手势控制初始化失败:', error);
            return false;
        }
    }

    onResults(results) {
        if (!this.isActive) return;

        // 清空画布（用于调试）
        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

        let leftDetected = false;
        let rightDetected = false;
        let leftConfidence = 0;
        let rightConfidence = 0;

        if (results.multiHandLandmarks && results.multiHandedness) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i];

                // 绘制手部关键点（调试用）
                drawConnectors(this.canvasCtx, landmarks, HAND_CONNECTIONS, {
                    color: '#00FF00',
                    lineWidth: 2
                });
                drawLandmarks(this.canvasCtx, landmarks, {
                    color: '#FF0000',
                    lineWidth: 1
                });

                // 分析手势
                const gesture = this.analyzeGesture(landmarks);
                const isLeft = handedness.label === 'Left'; // 注意：摄像头镜像，Left实际是右手

                if (gesture.isPointing) {
                    if (gesture.direction === 'left') {
                        leftDetected = true;
                        leftConfidence = gesture.confidence;
                    } else if (gesture.direction === 'right') {
                        rightDetected = true;
                        rightConfidence = gesture.confidence;
                    }
                }
            }
        }

        // 更新手势状态（带时间阈值）
        const now = Date.now();

        // 左手势检测
        if (leftDetected && leftConfidence > 0.6) {
            if (this.leftGestureStartTime === 0) {
                this.leftGestureStartTime = now;
            } else if (now - this.leftGestureStartTime >= this.gestureThreshold) {
                if (!this.gestureState.left) {
                    this.gestureState.left = true;
                    this.notifyGestureChange();
                }
            }
            this.gestureState.leftConfidence = leftConfidence;
        } else {
            this.leftGestureStartTime = 0;
            if (this.gestureState.left) {
                this.gestureState.left = false;
                this.notifyGestureChange();
            }
            this.gestureState.leftConfidence = 0;
        }

        // 右手势检测
        if (rightDetected && rightConfidence > 0.6) {
            if (this.rightGestureStartTime === 0) {
                this.rightGestureStartTime = now;
            } else if (now - this.rightGestureStartTime >= this.gestureThreshold) {
                if (!this.gestureState.right) {
                    this.gestureState.right = true;
                    this.notifyGestureChange();
                }
            }
            this.gestureState.rightConfidence = rightConfidence;
        } else {
            this.rightGestureStartTime = 0;
            if (this.gestureState.right) {
                this.gestureState.right = false;
                this.notifyGestureChange();
            }
            this.gestureState.rightConfidence = 0;
        }

        this.canvasCtx.restore();
    }

    analyzeGesture(landmarks) {
        // 获取关键点
        const wrist = landmarks[0];
        const indexTip = landmarks[8];
        const indexMCP = landmarks[5];
        const middleTip = landmarks[12];
        const thumbTip = landmarks[4];

        // 计算食指指向方向
        const dx = indexTip.x - wrist.x;
        const dy = indexTip.y - wrist.y;

        // 检测是否为指向手势（食指伸直）
        const indexLength = Math.sqrt(dx * dx + dy * dy);
        const middleLength = Math.sqrt(
            Math.pow(middleTip.x - wrist.x, 2) +
            Math.pow(middleTip.y - wrist.y, 2)
        );

        const isPointing = indexLength > middleLength * 0.9; // 食指比中指伸直更多

        // 确定指向方向
        let direction = null;
        let confidence = 0;

        if (isPointing) {
            const angle = Math.atan2(dy, dx);
            const angleDeg = angle * 180 / Math.PI;

            // 左指（-180 到 -30度）
            if ((angleDeg >= -180 && angleDeg <= -150) || (angleDeg >= 150 && angleDeg <= 180)) {
                direction = 'left';
                confidence = Math.min(1.0, indexLength * 2);
            }
            // 右指（-30 到 30度）
            else if (angleDeg >= -30 && angleDeg <= 30) {
                direction = 'right';
                confidence = Math.min(1.0, indexLength * 2);
            }
        }

        return {
            isPointing,
            direction,
            confidence
        };
    }

    notifyGestureChange() {
        if (this.onGestureChange) {
            this.onGestureChange(this.gestureState);
        }
    }

    start() {
        this.isActive = true;
    }

    stop() {
        this.isActive = false;
    }

    getGestureState() {
        return { ...this.gestureState };
    }

    destroy() {
        this.isActive = false;
        if (this.camera) {
            this.camera.stop();
        }
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
    }
}
