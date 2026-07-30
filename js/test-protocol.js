/**
 * TestProtocol - Hughson-Westlake 纯音测听协议
 *
 * 这是临床纯音测听的标准阈值测定方法（简化版）：
 *
 * 1. 从 30 dB HL 开始播放
 * 2. 若听到 → 降 10 dB，重复直到听不见
 * 3. 若听不见 → 升 5 dB，直到听见
 * 4. 在同一音量连续 2 次听到 → 确定为阈值
 * 5. 若初始 30 dB 听不见 → 升 10 dB 直到听见，再降 10 dB 进入步骤 2
 *
 * 状态机：
 *   STARTING → DESCENDING → WAITING_NO_RESPONSE → ASCENDING → THRESHOLD_FOUND
 */

class TestProtocol {
    constructor() {
        // 测试频率（Hz）- 标准纯音测听频率
        this.frequencies = [250, 500, 1000, 2000, 4000, 8000];

        // 测试顺序：先右耳后左耳（临床惯例）
        this.ears = ['right', 'left'];

        // 测试状态
        this.reset();

        // 协议参数
        this.params = {
            startLevel: 30,       // 起始听力级
            descendStep: 10,      // 下降步长
            ascendStep: 5,        // 上升步长
            minLevel: -10,        // 最低听力级
            maxLevel: 120,        // 最高听力级
            maxTrials: 30,        // 单频率最大试听次数（安全阀）
            thresholdRepeat: 2    // 阈值确认重复次数
        };
    }

    /**
     * 重置测试状态
     */
    reset() {
        this.state = 'STARTING';
        this.currentEarIndex = 0;
        this.currentFreqIndex = 0;
        this.currentLevel = 30;
        this.trialCount = 0;
        this.ascendingResponses = []; // 上升阶段的响应记录
        this.lastNoResponseLevel = null;

        // 结果存储
        this.results = {
            right: {}, // { 250: 20, 500: 15, ... }
            left: {}
        };

        // 测试历史（用于调试和报告）
        this.history = [];
    }

    /**
     * 获取当前测试位置信息
     */
    getCurrentPosition() {
        return {
            ear: this.ears[this.currentEarIndex],
            frequency: this.frequencies[this.currentFreqIndex],
            level: this.currentLevel,
            earIndex: this.currentEarIndex,
            freqIndex: this.currentFreqIndex,
            totalFreqs: this.frequencies.length,
            totalEars: this.ears.length,
            trialCount: this.trialCount
        };
    }

    /**
     * 获取总体进度（0-100）
     */
    getProgress() {
        const totalSteps = this.frequencies.length * this.ears.length;
        const completedSteps = this.currentEarIndex * this.frequencies.length + this.currentFreqIndex;
        return Math.round((completedSteps / totalSteps) * 100);
    }

    /**
     * 处理用户响应，返回下一步指令
     *
     * @param {boolean} heard - 用户是否听到
     * @returns {object} { action: 'play'|'next'|'done', level, frequency, ear, message }
     */
    handleResponse(heard) {
        const pos = this.getCurrentPosition();
        this.trialCount++;
        this.history.push({
            ear: pos.ear,
            frequency: pos.frequency,
            level: pos.currentLevel,
            heard: heard,
            state: this.state,
            trial: this.trialCount
        });

        // 安全阀
        if (this.trialCount >= this.params.maxTrials) {
            this.results[pos.ear][pos.frequency] = pos.level;
            return this.advance();
        }

        switch (this.state) {
            case 'STARTING':
                return this.handleStarting(heard, pos);

            case 'DESCENDING':
                return this.handleDescending(heard, pos);

            case 'ASCENDING':
                return this.handleAscending(heard, pos);

            default:
                return this.advance();
        }
    }

    /**
     * 初始状态：判断起始音量是否可听
     */
    handleStarting(heard, pos) {
        if (heard) {
            // 起始音量可听，进入下降阶段
            this.state = 'DESCENDING';
            this.currentLevel = Math.max(
                this.params.minLevel,
                pos.level - this.params.descendStep
            );
            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '听到了，正在降低音量继续测试...'
            };
        } else {
            // 起始音量听不见，升高 10 dB
            this.currentLevel = Math.min(
                this.params.maxLevel,
                pos.level + this.params.descendStep
            );
            if (this.currentLevel >= this.params.maxLevel) {
                // 达到最大音量仍听不见
                this.results[pos.ear][pos.frequency] = this.params.maxLevel;
                return this.advance();
            }
            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '没听到，正在升高音量...'
            };
        }
    }

    /**
     * 下降阶段：逐步降低音量直到听不见
     */
    handleDescending(heard, pos) {
        if (heard) {
            // 继续下降
            this.currentLevel = Math.max(
                this.params.minLevel,
                pos.level - this.params.descendStep
            );

            if (this.currentLevel <= this.params.minLevel) {
                // 已到最低音量仍能听到 → 阈值为最低值
                this.results[pos.ear][pos.frequency] = this.params.minLevel;
                return this.advance();
            }

            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '听到了，继续降低音量...'
            };
        } else {
            // 听不见了 → 记录无响应音量，进入上升阶段
            this.lastNoResponseLevel = pos.level;
            this.ascendingResponses = [];
            this.state = 'ASCENDING';
            this.currentLevel = Math.min(
                this.params.maxLevel,
                pos.level + this.params.ascendStep
            );
            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '听不到了，正在升高音量确认阈值...'
            };
        }
    }

    /**
     * 上升阶段：逐步升高直到听到，确认阈值
     */
    handleAscending(heard, pos) {
        if (heard) {
            // 记录响应
            this.ascendingResponses.push(pos.level);

            // 检查是否达到确认次数
            if (this.ascendingResponses.length >= this.params.thresholdRepeat) {
                // 确认阈值
                this.results[pos.ear][pos.frequency] = pos.level;
                return this.advance();
            }

            // 再降回去确认
            this.currentLevel = Math.max(
                this.params.minLevel,
                pos.level - this.params.descendStep
            );
            if (this.currentLevel <= this.lastNoResponseLevel) {
                // 已经确认过了，直接记录阈值
                this.results[pos.ear][pos.frequency] = pos.level;
                return this.advance();
            }

            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '听到了，正在再次确认...'
            };
        } else {
            // 没听到，继续升高
            this.lastNoResponseLevel = pos.level;
            this.currentLevel = Math.min(
                this.params.maxLevel,
                pos.level + this.params.ascendStep
            );

            if (this.currentLevel >= this.params.maxLevel) {
                this.results[pos.ear][pos.frequency] = this.params.maxLevel;
                return this.advance();
            }

            return {
                action: 'play',
                level: this.currentLevel,
                frequency: pos.frequency,
                ear: pos.ear,
                message: '没听到，继续升高音量...'
            };
        }
    }

    /**
     * 前进到下一个频率或耳朵
     */
    advance() {
        this.currentFreqIndex++;
        this.trialCount = 0;
        this.ascendingResponses = [];
        this.state = 'STARTING';
        this.currentLevel = this.params.startLevel;

        // 检查是否完成当前耳朵的所有频率
        if (this.currentFreqIndex >= this.frequencies.length) {
            this.currentFreqIndex = 0;
            this.currentEarIndex++;

            // 检查是否完成所有耳朵
            if (this.currentEarIndex >= this.ears.length) {
                return {
                    action: 'done',
                    message: '测试完成！正在生成报告...'
                };
            }

            return {
                action: 'next',
                message: `${this.ears[this.currentEarIndex] === 'left' ? '左' : '右'}耳测试完成，请切换到另一只耳朵`
            };
        }

        return {
            action: 'play',
            level: this.currentLevel,
            frequency: this.frequencies[this.currentFreqIndex],
            ear: this.ears[this.currentEarIndex],
            message: '进入下一个频率测试...'
        };
    }

    /**
     * 获取初始播放指令
     */
    getInitialAction() {
        return {
            action: 'play',
            level: this.currentLevel,
            frequency: this.frequencies[0],
            ear: this.ears[0],
            message: '测试开始，请仔细听...'
        };
    }

    /**
     * 获取所有结果
     */
    getResults() {
        return this.results;
    }

    /**
     * 获取测试历史
     */
    getHistory() {
        return this.history;
    }
}

// 导出
window.TestProtocol = TestProtocol;
