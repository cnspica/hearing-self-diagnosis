/**
 * AudioEngine - Web Audio API 纯音测听引擎
 *
 * 功能：
 * - 生成指定频率的纯音（正弦波）
 * - 精确控制音量（dB HL → 线性增益映射）
 * - 左右耳声道隔离测试
 * - 淡入淡出消除爆音
 *
 * 注意：本引擎用于自我筛查，无法替代临床校准设备。
 * 实际听力级取决于耳机型号和播放设备，结果仅供参考。
 */

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.currentOscillator = null;
        this.currentGain = null;
        this.currentPanner = null;
        this.isPlaying = false;
        this.initialized = false;

        // 主音量系数（校准后可调整）
        this.masterVolume = 1.0;
    }

    /**
     * 初始化 AudioContext（必须在用户交互后调用）
     */
    async init() {
        if (this.initialized && this.audioCtx && this.audioCtx.state === 'running') return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('当前浏览器不支持 Web Audio API');
        }

        if (!this.audioCtx) {
            this.audioCtx = new AudioContextClass();
        }

        // 某些浏览器需要 resume（每次调用都检查）
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
            } catch (e) {
                console.warn('AudioContext resume 失败:', e);
            }
        }

        this.initialized = true;
    }

    /**
     * 确保 AudioContext 处于运行状态
     */
    async ensureRunning() {
        if (!this.audioCtx) {
            await this.init();
            return;
        }
        if (this.audioCtx.state !== 'running') {
            try {
                await this.audioCtx.resume();
            } catch (e) {
                console.warn('AudioContext resume 失败:', e);
            }
        }
    }

    /**
     * dB HL → 线性增益转换
     *
     * 使用指数映射 + 分段策略，确保测试范围内各音量级均可被听到：
     * - 0-50 dB HL：指数映射（baseGain * 10^(dB/20)），保证低音量分辨率
     * - 50-120 dB HL：线性插值到最大值，保证高音量可达
     *
     * @param {number} dbHL - 听力级（0-120 dB HL）
     * @param {number} frequency - 频率（Hz）
     * @returns {number} 线性增益值（0-1）
     */
    dbHLToGain(dbHL, frequency) {
        // 频率校正（近似 RETSPL，使低频需要更多增益）
        const freqCorrection = {
            250: -8,
            500: -3,
            1000: 0,
            2000: 1,
            4000: 0,
            8000: -3
        };
        const correction = freqCorrection[frequency] || 0;

        // 基础增益：对应 0 dB HL 的极低音量
        // 0.003 保证 30 dB HL 起始音量约 0.095（约 -20 dBFS），可被清晰听到
        const baseGain = 0.003;

        const effectiveDB = dbHL + correction;
        let gain;

        if (effectiveDB <= 50) {
            // 指数映射阶段
            gain = baseGain * Math.pow(10, effectiveDB / 20);
        } else {
            // 线性插值阶段：50 dB HL 处的增益 → 1.0（120 dB HL）
            const gainAt50 = baseGain * Math.pow(10, 50 / 20); // 0.3
            const ratio = (effectiveDB - 50) / (120 - 50);
            gain = gainAt50 + (1.0 - gainAt50) * ratio;
        }

        // 应用主音量系数
        gain *= this.masterVolume;

        // 限制在 0-1 范围内，避免削波
        gain = Math.min(gain, 1.0);
        gain = Math.max(gain, 0);

        return gain;
    }

    /**
     * 播放纯音
     *
     * @param {number} frequency - 频率（Hz）
     * @param {number} dbHL - 听力级（dB HL）
     * @param {string} ear - 'left' | 'right' | 'both'
     * @param {number} duration - 持续时间（秒），默认 1.5 秒
     * @returns {Promise} 播放完成时 resolve
     */
    async playTone(frequency, dbHL, ear = 'right', duration = 1.5) {
        if (!this.initialized) {
            await this.init();
        }

        // 每次播放前确保 AudioContext 处于运行状态
        await this.ensureRunning();

        // 如果正在播放，先停止
        if (this.isPlaying) {
            this.stopTone();
            // 等待短暂时间确保清理完成
            await new Promise(r => setTimeout(r, 50));
        }

        try {
            const now = this.audioCtx.currentTime;
            const gainValue = this.dbHLToGain(dbHL, frequency);
            const fadeTime = 0.08; // 淡入淡出时间

            // 创建节点
            this.currentOscillator = this.audioCtx.createOscillator();
            this.currentGain = this.audioCtx.createGain();

            // 配置振荡器
            this.currentOscillator.type = 'sine';
            this.currentOscillator.frequency.value = frequency;

            // 连接节点链：oscillator → gain → [panner] → destination
            if (this.audioCtx.createStereoPanner) {
                this.currentPanner = this.audioCtx.createStereoPanner();

                // 配置声道
                if (ear === 'left') {
                    this.currentPanner.pan.value = -1;
                } else if (ear === 'right') {
                    this.currentPanner.pan.value = 1;
                } else {
                    this.currentPanner.pan.value = 0;
                }

                this.currentOscillator.connect(this.currentGain);
                this.currentGain.connect(this.currentPanner);
                this.currentPanner.connect(this.audioCtx.destination);
            } else {
                // 不支持 StereoPanner 时的降级方案：双声道分别控制
                this.currentOscillator.connect(this.currentGain);
                this.currentGain.connect(this.audioCtx.destination);
                console.warn('StereoPanner 不可用，将使用双耳播放');
            }

            // 淡入淡出包络（避免爆音）
            this.currentGain.gain.setValueAtTime(0, now);
            this.currentGain.gain.linearRampToValueAtTime(gainValue, now + fadeTime);
            this.currentGain.gain.setValueAtTime(gainValue, now + duration - fadeTime);
            this.currentGain.gain.linearRampToValueAtTime(0, now + duration);

            // 播放
            this.currentOscillator.start(now);
            this.currentOscillator.stop(now + duration);
            this.isPlaying = true;

            // 播放结束清理
            this.currentOscillator.onended = () => {
                this.isPlaying = false;
                try {
                    this.currentOscillator.disconnect();
                    this.currentGain.disconnect();
                    if (this.currentPanner) this.currentPanner.disconnect();
                } catch (e) { /* 节点可能已清理 */ }
                this.currentOscillator = null;
                this.currentGain = null;
                this.currentPanner = null;
            };

            // 返回 Promise（在音频实际结束时 resolve）
            return new Promise((resolve) => {
                const checkEnd = () => {
                    if (!this.isPlaying) {
                        resolve();
                    } else {
                        setTimeout(checkEnd, 50);
                    }
                };
                setTimeout(checkEnd, duration * 1000);
            });

        } catch (error) {
            console.error('播放纯音失败:', error);
            this.isPlaying = false;
            throw error;
        }
    }

    /**
     * 停止当前播放
     */
    stopTone() {
        if (this.currentOscillator && this.isPlaying) {
            const now = this.audioCtx.currentTime;
            // 快速淡出避免爆音
            try {
                this.currentGain.gain.cancelScheduledValues(now);
                this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
                this.currentGain.gain.linearRampToValueAtTime(0, now + 0.05);
                this.currentOscillator.stop(now + 0.06);
            } catch (e) {
                // 节点可能已被清理
            }
        }
        this.isPlaying = false;
    }

    /**
     * 播放短促提示音（用于 UI 反馈）
     */
    playBeep(frequency = 880, duration = 0.15) {
        if (!this.initialized || !this.audioCtx) return;
        this.ensureRunning().then(() => {
            try {
                const now = this.audioCtx.currentTime;
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.value = frequency;
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
                gain.gain.setValueAtTime(0.2, now + duration - 0.02);
                gain.gain.linearRampToValueAtTime(0, now + duration);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(now);
                osc.stop(now + duration);
            } catch (e) {
                console.error('播放提示音失败:', e);
            }
        });
    }

    /**
     * 播放校准音（固定舒适音量，用于测试前确认设备正常）
     * 播放 1000 Hz 纯音，约 40 dB HL，双耳
     */
    async playCalibrationTone(duration = 2) {
        return this.playTone(1000, 40, 'both', duration);
    }

    /**
     * 播放可听性测试音（用于校准页让用户确认能听到）
     */
    async playAudibleTone(frequency = 1000, dbHL = 35, ear = 'both', duration = 1.5) {
        return this.playTone(frequency, dbHL, ear, duration);
    }

    /**
     * 销毁引擎
     */
    destroy() {
        this.stopTone();
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.initialized = false;
    }
}

// 导出单例
window.AudioEngine = AudioEngine;
