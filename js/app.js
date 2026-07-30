/**
 * App - 听力自我诊断 Agent 主控制器
 *
 * 管理：
 * - 屏幕切换（欢迎→准备→测试→结果）
 * - 用户交互响应
 * - AudioEngine / TestProtocol / Audiogram / Diagnosis 协调
 * - 测试流程引导和消息反馈
 */

class HearingTestApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.protocol = new TestProtocol();
        this.audiogram = new Audiogram('audiogram-container');
        this.diagnosis = new Diagnosis();

        this.currentScreen = 'welcome';
        this.isTonePlaying = false;
        this.isPlayingSequence = false;
        this.testResults = null;

        this.bindEvents();
    }

    /**
     * 绑定所有 UI 事件
     */
    bindEvents() {
        // 欢迎页 → 准备页
        document.getElementById('btn-start').addEventListener('click', () => {
            this.showScreen('prep');
        });

        // 准备页 → 校准页
        document.getElementById('btn-begin-calibration').addEventListener('click', async () => {
            await this.audioEngine.init();
            this.showScreen('calibration');
        });

        // 校准页 - 返回准备页
        document.getElementById('btn-back-prep').addEventListener('click', () => {
            this.showScreen('prep');
        });

        // 校准页 - 播放校准音
        document.getElementById('btn-play-calibration').addEventListener('click', async () => {
            await this.playCalibrationTone();
        });

        // 校准页 - 开始正式测试
        document.getElementById('btn-start-actual-test').addEventListener('click', async () => {
            // 确保音频上下文活跃
            await this.audioEngine.ensureRunning();
            this.audioEngine.playBeep(880, 0.2);
            this.startTest();
        });

        // 返回欢迎页
        document.getElementById('btn-back-welcome').addEventListener('click', () => {
            this.showScreen('welcome');
        });

        // 测试交互按钮
        document.getElementById('btn-heard').addEventListener('click', () => {
            this.handleUserResponse(true);
        });

        document.getElementById('btn-not-heard').addEventListener('click', () => {
            this.handleUserResponse(false);
        });

        // 重新播放当前音
        document.getElementById('btn-replay').addEventListener('click', () => {
            this.replayCurrentTone();
        });

        // 中止测试
        document.getElementById('btn-abort').addEventListener('click', () => {
            if (confirm('确定要中止测试吗？已完成的频率结果将保留。')) {
                this.finishTest(true);
            }
        });

        // 结果页按钮
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.restart();
        });

        document.getElementById('btn-print').addEventListener('click', () => {
            window.print();
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (this.currentScreen !== 'testing') return;
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                e.preventDefault();
                this.handleUserResponse(true);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                this.handleUserResponse(false);
            } else if (e.code === 'KeyR') {
                e.preventDefault();
                this.replayCurrentTone();
            }
        });
    }

    /**
     * 播放校准音
     */
    async playCalibrationTone() {
        const btn = document.getElementById('btn-play-calibration');
        const icon = document.getElementById('calib-icon');
        const status = document.getElementById('calib-status');

        btn.disabled = true;
        icon.textContent = '🔊';
        icon.classList.add('pulsing');
        status.textContent = '正在播放校准音...';
        status.style.color = '#1976d2';

        try {
            await this.audioEngine.playCalibrationTone(2);
            icon.classList.remove('pulsing');
            icon.textContent = '✅';
            status.textContent = '播放完毕。您能听到吗？如果能听到，请点击下方「开始测试」。如果听不到，请调高设备音量后重新播放。';
            status.style.color = '#333';
        } catch (error) {
            icon.classList.remove('pulsing');
            icon.textContent = '⚠️';
            status.textContent = '播放失败：' + error.message + '。请检查浏览器是否支持音频播放。';
            status.style.color = '#f44336';
        }

        btn.disabled = false;
    }

    /**
     * 屏幕切换
     */
    showScreen(screenName) {
        this.currentScreen = screenName;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(`screen-${screenName}`);
        if (screen) screen.classList.add('active');

        // 滚动到顶部
        window.scrollTo(0, 0);
    }

    /**
     * 开始测试
     */
    startTest() {
        this.protocol.reset();
        this.showScreen('testing');
        this.updateTestUI();
        this.playCurrentTone();
    }

    /**
     * 播放当前测试音
     */
    async playCurrentTone() {
        if (this.isTonePlaying || this.isPlayingSequence) return;

        const pos = this.protocol.getCurrentPosition();
        const earLabel = pos.ear === 'right' ? '右耳' : '左耳';
        const freqLabel = this.formatFrequency(pos.frequency);

        // 更新状态显示
        this.updateTestStatus(earLabel, freqLabel, '正在播放...', '#1976d2');

        // 播放提示
        this.isTonePlaying = true;
        this.disableResponseButtons(true);

        try {
            await this.audioEngine.playTone(pos.frequency, pos.level, pos.ear, 1.5);
        } catch (error) {
            console.error('播放测试音失败:', error);
            this.showTestMessage('⚠️ 播放失败，请检查音频设备', 'neutral');
        }

        this.isTonePlaying = false;
        this.disableResponseButtons(false);

        // 更新状态
        this.updateTestStatus(earLabel, freqLabel, '请选择：听到了 / 没听到', '#333');
    }

    /**
     * 重新播放当前音
     */
    async replayCurrentTone() {
        if (this.isTonePlaying) return;
        await this.playCurrentTone();
    }

    /**
     * 处理用户响应
     */
    handleUserResponse(heard) {
        if (this.isTonePlaying) return;

        const result = this.protocol.handleResponse(heard);

        // 显示反馈消息
        this.showTestMessage(result.message, heard ? 'positive' : 'neutral');

        if (result.action === 'done') {
            this.finishTest(false);
            return;
        }

        if (result.action === 'next') {
            // 切换耳朵
            this.showEarSwitchNotice(result.message);
            return;
        }

        if (result.action === 'play') {
            this.updateTestUI();
            // 短暂延迟后播放下一个音
            setTimeout(() => {
                this.playCurrentTone();
            }, 800);
        }
    }

    /**
     * 显示耳朵切换提示
     */
    showEarSwitchNotice(message) {
        const pos = this.protocol.getCurrentPosition();
        const earLabel = pos.ear === 'right' ? '右耳' : '左耳';

        const overlay = document.getElementById('ear-switch-overlay');
        const text = document.getElementById('ear-switch-text');
        text.textContent = `${message}\n\n请将耳机切换到${earLabel}，准备好后点击继续。`;
        overlay.classList.add('active');

        // 绑定继续按钮（只绑定一次）
        const btn = document.getElementById('btn-continue-switch');
        btn.onclick = () => {
            overlay.classList.remove('active');
            this.updateTestUI();
            setTimeout(() => {
                this.playCurrentTone();
            }, 500);
        };
    }

    /**
     * 更新测试界面
     */
    updateTestUI() {
        const pos = this.protocol.getCurrentPosition();
        const earLabel = pos.ear === 'right' ? '右耳' : '左耳';
        const freqLabel = this.formatFrequency(pos.frequency);

        // 更新进度条
        const progress = this.protocol.getProgress();
        document.getElementById('progress-bar-fill').style.width = `${progress}%`;
        document.getElementById('progress-text').textContent = `${progress}%`;

        // 更新频率和耳朵显示
        document.getElementById('current-ear').textContent = earLabel;
        document.getElementById('current-ear').className = `ear-badge ${pos.ear}`;
        document.getElementById('current-freq').textContent = freqLabel;

        // 更新步骤指示
        const totalSteps = pos.totalFreqs * pos.totalEars;
        const currentStep = pos.earIndex * pos.totalFreqs + pos.freqIndex + 1;
        document.getElementById('step-indicator').textContent = `步骤 ${currentStep} / ${totalSteps}`;

        // 更新频率位置指示器
        this.updateFreqIndicator(pos);
    }

    /**
     * 更新频率位置指示器
     */
    updateFreqIndicator(pos) {
        const container = document.getElementById('freq-indicator');
        const freqs = [250, 500, 1000, 2000, 4000, 8000];
        const currentEar = pos.ear;

        container.innerHTML = freqs.map((f, i) => {
            const isActive = i === pos.freqIndex && pos.ear === currentEar;
            const isDone = this.protocol.results[pos.ear][f] !== undefined;
            const label = f >= 1000 ? `${f / 1000}k` : f;
            let className = 'freq-dot';
            if (isActive) className += ' active';
            if (isDone) className += ' done';

            return `<div class="${className}">${label}</div>`;
        }).join('');
    }

    /**
     * 更新测试状态
     */
    updateTestStatus(ear, freq, status, color) {
        document.getElementById('test-status').textContent = status;
        document.getElementById('test-status').style.color = color;
    }

    /**
     * 显示测试消息
     */
    showTestMessage(message, type) {
        const msgEl = document.getElementById('test-message');
        msgEl.textContent = message;
        msgEl.className = `test-message ${type}`;
        msgEl.classList.add('show');

        // 3秒后隐藏
        clearTimeout(this.messageTimer);
        this.messageTimer = setTimeout(() => {
            msgEl.classList.remove('show');
        }, 3000);
    }

    /**
     * 禁用/启用响应按钮
     */
    disableResponseButtons(disabled) {
        document.getElementById('btn-heard').disabled = disabled;
        document.getElementById('btn-not-heard').disabled = disabled;
    }

    /**
     * 格式化频率显示
     */
    formatFrequency(freq) {
        if (freq >= 1000) {
            return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)} kHz`;
        }
        return `${freq} Hz`;
    }

    /**
     * 完成测试
     */
    finishTest(aborted) {
        this.audioEngine.stopTone();
        this.testResults = this.protocol.getResults();
        this.showResults(aborted);
    }

    /**
     * 显示结果
     */
    showResults(aborted) {
        this.showScreen('results');

        // 渲染听力图
        this.audiogram.render(this.testResults);

        // 执行诊断
        const diagnosis = this.diagnosis.diagnose(this.testResults);
        this.diagnosisResult = diagnosis;

        // 渲染诊断报告
        this.renderDiagnosisReport(diagnosis, aborted);

        // 渲染频率详情表
        this.renderFrequencyTable(diagnosis);

        // 渲染测试历史
        this.renderTestHistory();
    }

    /**
     * 渲染诊断报告
     */
    renderDiagnosisReport(diagnosis, aborted) {
        const container = document.getElementById('diagnosis-report');

        let html = '';

        if (aborted) {
            html += `<div class="warning-banner">⚠️ 测试已被中止，以下结果仅基于已完成的部分频率，可能不完整。</div>`;
        }

        // 总体评估卡片
        const summary = diagnosis.summary;
        for (const section of summary) {
            const severityColor = section.severity ? section.severity.color : null;
            const warningClass = section.isWarning ? 'warning-section' : '';

            html += `<div class="report-section ${warningClass}">`;
            html += `<h3>${section.title}</h3>`;

            if (severityColor) {
                html += `<div class="severity-badge" style="background:${severityColor}20;color:${severityColor};border-color:${severityColor}">${section.severity.label}</div>`;
            }

            // 将 \n 分段
            const paragraphs = section.content.split('\n');
            for (const p of paragraphs) {
                if (p.trim()) {
                    html += `<p>${p}</p>`;
                }
            }

            html += `</div>`;
        }

        container.innerHTML = html;
    }

    /**
     * 渲染频率详情表
     */
    renderFrequencyTable(diagnosis) {
        const container = document.getElementById('frequency-table');
        const freqs = [250, 500, 1000, 2000, 4000, 8000];

        let html = '<table class="freq-table"><thead><tr><th>频率</th><th>右耳 (dB HL)</th><th>右耳程度</th><th>左耳 (dB HL)</th><th>左耳程度</th></tr></thead><tbody>';

        for (const freq of freqs) {
            const rightDb = diagnosis.rightEar.frequencies[freq];
            const leftDb = diagnosis.leftEar.frequencies[freq];

            html += '<tr>';
            html += `<td class="freq-cell">${this.formatFrequency(freq)}</td>`;

            if (rightDb) {
                html += `<td style="color:${rightDb.color};font-weight:600">${rightDb.db}</td>`;
                html += `<td style="color:${rightDb.color}">${rightDb.severity}</td>`;
            } else {
                html += '<td>-</td><td>-</td>';
            }

            if (leftDb) {
                html += `<td style="color:${leftDb.color};font-weight:600">${leftDb.db}</td>`;
                html += `<td style="color:${leftDb.color}">${leftDb.severity}</td>`;
            } else {
                html += '<td>-</td><td>-</td>';
            }

            html += '</tr>';
        }

        // PTA 行
        html += '<tr class="pta-row">';
        html += '<td><strong>PTA</strong><br><small>言语频率均值</small></td>';
        if (diagnosis.rightEar.pta !== null) {
            const s = diagnosis.rightEar.overallSeverity;
            html += `<td style="color:${s.color};font-weight:700">${diagnosis.rightEar.pta}</td>`;
            html += `<td style="color:${s.color};font-weight:600">${s.label}</td>`;
        } else {
            html += '<td>-</td><td>-</td>';
        }
        if (diagnosis.leftEar.pta !== null) {
            const s = diagnosis.leftEar.overallSeverity;
            html += `<td style="color:${s.color};font-weight:700">${diagnosis.leftEar.pta}</td>`;
            html += `<td style="color:${s.color};font-weight:600">${s.label}</td>`;
        } else {
            html += '<td>-</td><td>-</td>';
        }
        html += '</tr>';

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    /**
     * 渲染测试历史
     */
    renderTestHistory() {
        const container = document.getElementById('test-history');
        const history = this.protocol.getHistory();

        if (history.length === 0) {
            container.innerHTML = '<p class="muted">无测试记录</p>';
            return;
        }

        let html = '<div class="history-list">';
        const recent = history.slice(-20); // 显示最近 20 条

        for (const entry of recent) {
            const earLabel = entry.ear === 'right' ? 'R' : 'L';
            const freqLabel = entry.frequency >= 1000 ? `${entry.frequency / 1000}k` : entry.frequency;
            const responseIcon = entry.heard ? '✓' : '✗';
            const responseClass = entry.heard ? 'heard' : 'not-heard';

            html += `<div class="history-item ${responseClass}">`;
            html += `<span class="hist-ear ${entry.ear}">${earLabel}</span>`;
            html += `<span class="hist-freq">${freqLabel}Hz</span>`;
            html += `<span class="hist-level">${entry.level}dB</span>`;
            html += `<span class="hist-response">${responseIcon}</span>`;
            html += `</div>`;
        }

        html += '</div>';
        if (history.length > 20) {
            html += `<p class="muted small">共 ${history.length} 次测试响应</p>`;
        }
        container.innerHTML = html;
    }

    /**
     * 重新开始
     */
    restart() {
        this.protocol.reset();
        this.testResults = null;
        this.diagnosisResult = null;
        this.showScreen('welcome');
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HearingTestApp();
});
