/**
 * Diagnosis - 听力诊断逻辑
 *
 * 根据纯音测听结果进行：
 * 1. 听力损失程度分级（按频率和整体）
 * 2. 听力损失类型判断（传导性/感音神经性/混合性）
 * 3. 听力图形态分类（平坦型/高频下降型/低频下降型等）
 * 4. 个性化建议生成
 */

class Diagnosis {
    constructor() {
        // 听力损失程度分级标准（dB HL）
        this.severityLevels = [
            { max: 25, label: '正常听力', color: '#4caf50', desc: '听力在正常范围内，能听到各种日常声音。' },
            { max: 40, label: '轻度听力损失', color: '#8bc34a', desc: '可能难以听到轻柔的声音（如耳语、远距离交谈），在嘈杂环境中可能感到困难。' },
            { max: 55, label: '中度听力损失', color: '#ffc107', desc: '日常交谈需要提高音量，看电视/电话可能需要调大音量，嘈杂环境交流明显困难。' },
            { max: 70, label: '中重度听力损失', color: '#ff9800', desc: '正常音量的交谈难以听清，需要大声说话，可能需要助听器辅助。' },
            { max: 90, label: '重度听力损失', color: '#f44336', desc: '只有大声说话才能听到，电话交谈极度困难，强烈建议使用助听器。' },
            { max: 999, label: '极重度听力损失', color: '#b71c1c', desc: '几乎听不到任何声音，可能需要人工耳蜗等介入手段。' }
        ];

        // 频率分组
        this.freqGroups = {
            low: [250, 500],        // 低频
            mid: [1000, 2000],      // 中频（言语频率）
            high: [4000, 8000]      // 高频
        };

        // 言语频率（用于计算 PTA - Pure Tone Average）
        this.speechFreqs = [500, 1000, 2000];
    }

    /**
     * 完整诊断
     */
    diagnose(results) {
        const rightEar = this.diagnoseEar(results.right || {}, 'right');
        const leftEar = this.diagnoseEar(results.left || {}, 'left');

        // 双耳对比分析
        const bilateral = this.compareEars(rightEar, leftEar);

        // 生成总结
        const summary = this.generateSummary(rightEar, leftEar, bilateral);

        return {
            rightEar,
            leftEar,
            bilateral,
            summary,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 单耳诊断
     */
    diagnoseEar(earData, earName) {
        const freqResults = {};
        let allFreqs = [];

        for (const freq of [250, 500, 1000, 2000, 4000, 8000]) {
            const db = earData[freq];
            if (db !== undefined && db !== null) {
                const severity = this.getSeverity(db);
                freqResults[freq] = {
                    db: db,
                    severity: severity.label,
                    color: severity.color,
                    description: severity.desc
                };
                allFreqs.push(db);
            }
        }

        // 计算 PTA（言语频率平均听阈）
        const ptaFreqs = this.speechFreqs.filter(f => earData[f] !== undefined);
        const pta = ptaFreqs.length > 0
            ? Math.round(ptaFreqs.reduce((sum, f) => sum + earData[f], 0) / ptaFreqs.length)
            : null;

        // 整体严重程度（基于 PTA）
        const overallSeverity = pta !== null ? this.getSeverity(pta) : this.severityLevels[0];

        // 听力图形态
        const pattern = this.analyzePattern(earData);

        // 听力损失类型估计
        const lossType = this.estimateLossType(earData);

        return {
            ear: earName,
            earLabel: earName === 'right' ? '右耳' : '左耳',
            frequencies: freqResults,
            pta: pta,
            overallSeverity: overallSeverity,
            pattern: pattern,
            lossType: lossType,
            allFreqs: allFreqs
        };
    }

    /**
     * 根据 dB HL 获取严重程度
     */
    getSeverity(db) {
        for (const level of this.severityLevels) {
            if (db <= level.max) return level;
        }
        return this.severityLevels[this.severityLevels.length - 1];
    }

    /**
     * 分析听力图形态
     */
    analyzePattern(earData) {
        const freqs = [250, 500, 1000, 2000, 4000, 8000];
        const values = freqs.map(f => earData[f]).filter(v => v !== undefined);

        if (values.length < 3) {
            return { name: '数据不足', description: '频率数据不完整，无法分析形态。' };
        }

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const lowAvg = this.avgGroup(earData, this.freqGroups.low);
        const midAvg = this.avgGroup(earData, this.freqGroups.mid);
        const highAvg = this.avgGroup(earData, this.freqGroups.high);

        const range = Math.max(...values) - Math.min(...values);

        // 平坦型：各频率差异 < 15 dB
        if (range < 15) {
            return {
                name: '平坦型',
                description: '各频率听力损失程度相近，整体均匀下降。',
                icon: '▬'
            };
        }

        // 高频下降型：高频比低频差 > 15 dB
        if (highAvg !== null && lowAvg !== null && (highAvg - lowAvg) > 15) {
            // 进一步区分陡降型
            if (earData[2000] !== undefined && earData[4000] !== undefined) {
                const drop = earData[4000] - earData[2000];
                if (drop > 20) {
                    return {
                        name: '陡降型高频损失',
                        description: '高频听力急剧下降，低频基本正常。常见于噪声性听力损伤或老年性听力损失早期。',
                        icon: '↘'
                    };
                }
            }
            return {
                name: '高频下降型',
                description: '高频听力损失比低频更严重。常见于老年性听力损失、噪声性听力损伤。',
                icon: '↘'
            };
        }

        // 低频下降型：低频比高频差 > 15 dB
        if (lowAvg !== null && highAvg !== null && (lowAvg - highAvg) > 15) {
            return {
                name: '低频下降型',
                description: '低频听力损失比高频更严重。可能见于梅尼埃病早期等。',
                icon: '↙'
            };
        }

        // 山型/谷型：中频最差
        if (midAvg !== null && lowAvg !== null && highAvg !== null) {
            if (midAvg > lowAvg + 10 && midAvg > highAvg + 10) {
                return {
                    name: '谷型（U型）',
                    description: '中频听力损失最严重。可能见于某些先天性或遗传性听力损失。',
                    icon: '∪'
                };
            }
        }

        // 默认：不规则型
        return {
            name: '不规则型',
            description: '各频率听力损失程度不一，无明显规律。',
            icon: '〰'
        };
    }

    /**
     * 计算频率组的平均值
     */
    avgGroup(earData, group) {
        const values = group.filter(f => earData[f] !== undefined).map(f => earData[f]);
        if (values.length === 0) return null;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * 估计听力损失类型
     * 注意：纯音测听无法确定气骨导差，此处仅基于形态做初步估计
     */
    estimateLossType(earData) {
        const values = Object.values(earData).filter(v => v !== undefined);
        if (values.length === 0) {
            return {
                type: '未知',
                description: '数据不足，无法判断听力损失类型。',
                note: '准确的听力损失类型判断需要气导和骨导测听对比。'
            };
        }

        const maxLoss = Math.max(...values);
        const minLoss = Math.min(...values);

        // 如果所有频率都在正常范围内
        if (maxLoss <= 25) {
            return {
                type: '正常',
                description: '听力在正常范围内，无听力损失。',
                note: ''
            };
        }

        // 基于形态的初步估计（需要骨导测试才能确诊）
        const lowAvg = this.avgGroup(earData, this.freqGroups.low);
        const highAvg = this.avgGroup(earData, this.freqGroups.high);

        if (lowAvg !== null && highAvg !== null) {
            // 低频损失为主 → 可能传导性
            if (lowAvg > highAvg + 10 && maxLoss < 60) {
                return {
                    type: '可能传导性听力损失',
                    description: '低频损失为主的模式提示可能存在传导性问题（如中耳炎、耳硬化症）。',
                    note: '⚠️ 此为初步估计。确诊需要骨导测听。建议到耳鼻喉科进行专业检查。'
                };
            }

            // 高频损失为主 → 可能感音神经性
            if (highAvg > lowAvg + 10) {
                return {
                    type: '可能感音神经性听力损失',
                    description: '高频损失为主的模式常见于内耳或听神经损伤（如老年性、噪声性）。',
                    note: '⚠️ 此为初步估计。确诊需要骨导测听。建议到耳鼻喉科进行专业检查。'
                };
            }
        }

        // 平坦型损失 → 无法区分
        return {
            type: '需进一步检查',
            description: '听力损失形态较均匀，无法仅凭气导测试区分传导性或感音神经性。',
            note: '⚠️ 确诊听力损失类型需要骨导测听。建议到耳鼻喉科进行专业检查。'
        };
    }

    /**
     * 双耳对比
     */
    compareEars(rightEar, leftEar) {
        const comparison = {
            symmetry: 'unknown',
            asymmetry: null,
            worseEar: null
        };

        if (rightEar.pta !== null && leftEar.pta !== null) {
            const diff = Math.abs(rightEar.pta - leftEar.pta);

            if (diff <= 10) {
                comparison.symmetry = 'symmetric';
                comparison.description = '双耳听力基本对称。';
            } else if (diff <= 20) {
                comparison.symmetry = 'mild-asymmetric';
                comparison.description = '双耳听力有轻度不对称。';
                comparison.worseEar = rightEar.pta > leftEar.pta ? 'right' : 'left';
            } else {
                comparison.symmetry = 'asymmetric';
                comparison.description = '双耳听力存在明显不对称，建议进一步检查排除单侧病变。';
                comparison.worseEar = rightEar.pta > leftEar.pta ? 'right' : 'left';
                comparison.asymmetry = diff;
            }
        }

        return comparison;
    }

    /**
     * 生成诊断总结
     */
    generateSummary(rightEar, leftEar, bilateral) {
        const parts = [];

        // 整体结论
        const worsePTA = Math.max(
            rightEar.pta || 0,
            leftEar.pta || 0
        );
        const overallSeverity = this.getSeverity(worsePTA);

        parts.push({
            title: '总体评估',
            content: `根据纯音测听结果，您的听力状况为「${overallSeverity.label}」。${overallSeverity.desc}`,
            severity: overallSeverity
        });

        // 双耳对称性
        if (bilateral.symmetry !== 'unknown') {
            parts.push({
                title: '双耳对比',
                content: bilateral.description
            });
        }

        // 听力图形态
        if (rightEar.pattern.name !== '数据不足') {
            parts.push({
                title: `右耳听力图形态：${rightEar.pattern.name}`,
                content: rightEar.pattern.description
            });
        }
        if (leftEar.pattern.name !== '数据不足') {
            parts.push({
                title: `左耳听力图形态：${leftEar.pattern.name}`,
                content: leftEar.pattern.description
            });
        }

        // 损失类型
        if (rightEar.lossType.type !== '正常' && rightEar.lossType.type !== '未知') {
            parts.push({
                title: `右耳损失类型：${rightEar.lossType.type}`,
                content: rightEar.lossType.description + (rightEar.lossType.note ? '\n' + rightEar.lossType.note : '')
            });
        }
        if (leftEar.lossType.type !== '正常' && leftEar.lossType.type !== '未知') {
            parts.push({
                title: `左耳损失类型：${leftEar.lossType.type}`,
                content: leftEar.lossType.description + (leftEar.lossType.note ? '\n' + leftEar.lossType.note : '')
            });
        }

        // 建议
        parts.push({
            title: '建议',
            content: this.generateRecommendations(overallSeverity, bilateral)
        });

        // 免责声明
        parts.push({
            title: '⚠️ 重要提示',
            content: '本工具仅供初步自我筛查参考，不能替代专业医疗诊断。测试结果受耳机类型、环境噪声、设备音量等因素影响。如有听力困扰，请及时到耳鼻喉科就诊，进行专业的纯音测听（含骨导）、声导抗等检查。',
            isWarning: true
        });

        return parts;
    }

    /**
     * 生成个性化建议
     */
    generateRecommendations(severity, bilateral) {
        const recs = [];

        if (severity.label === '正常听力') {
            recs.push('听力状况良好，建议保持良好的用耳习惯。');
            recs.push('避免长时间暴露在高噪声环境中（>85 dB）。');
            recs.push('使用耳机时遵循「60-60原则」：音量不超过 60%，连续使用不超过 60 分钟。');
            recs.push('建议每年进行一次听力检查。');
        } else if (severity.label === '轻度听力损失') {
            recs.push('存在轻度听力损失，建议到耳鼻喉科进行专业检查以明确原因。');
            recs.push('在嘈杂环境中尽量选择安静的位置交谈。');
            recs.push('使用耳机时注意控制音量和时间。');
            recs.push('建议每 6-12 个月复查听力。');
        } else if (severity.label === '中度听力损失') {
            recs.push('存在中度听力损失，强烈建议尽快到耳鼻喉科就诊。');
            recs.push('医生可能会建议使用助听器改善生活质量。');
            recs.push('与人交谈时可利用读唇辅助理解。');
            recs.push('避免长时间处于嘈杂环境，保护残余听力。');
        } else if (severity.label === '中重度听力损失') {
            recs.push('存在中重度听力损失，请尽快到耳鼻喉科就诊。');
            recs.push('助听器可能对改善交流能力有显著帮助。');
            recs.push('在日常生活中告知家人和朋友您的听力情况，请他们放慢语速、面对面交流。');
            recs.push('注意居家安全，确保能听到门铃、电话、警报等声音。');
        } else if (severity.label === '重度听力损失') {
            recs.push('存在重度听力损失，请立即到耳鼻喉科就诊。');
            recs.push('助听器是重要的辅助工具，可能需要考虑人工耳蜗等手术方案。');
            recs.push('考虑学习唇读或手语作为辅助交流手段。');
            recs.push('在家中安装视觉提示装置（如闪光门铃、振动闹钟）。');
        } else {
            recs.push('存在极重度听力损失，请立即到耳鼻喉科就诊。');
            recs.push('可能需要评估人工耳蜗植入的适应症。');
            recs.push('寻求专业的听力康复服务。');
            recs.push('建立辅助交流方式，提高生活质量。');
        }

        // 不对称警告
        if (bilateral.symmetry === 'asymmetric') {
            recs.push('⚠️ 双耳听力明显不对称，建议进行影像学检查（如 MRI）排除听神经瘤等病变。');
        }

        return recs.join('\n');
    }
}

// 导出
window.Diagnosis = Diagnosis;
