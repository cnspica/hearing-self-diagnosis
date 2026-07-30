/**
 * Audiogram - 标准听力图 SVG 渲染
 *
 * 听力图规范：
 * - X 轴：频率（250-8000 Hz），对数刻度
 * - Y 轴：听力级（-10 到 120 dB HL），倒置（0 dB 在顶部）
 * - 右耳：红色 O 符号，实线连接
 * - 左耳：蓝色 X 符号，实线连接
 * - 正常范围（0-25 dB HL）：绿色阴影区
 */

class Audiogram {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.frequencies = [250, 500, 1000, 2000, 4000, 8000];
        this.minDB = -10;
        this.maxDB = 120;

        // SVG 尺寸
        this.width = 680;
        this.height = 480;
        this.padding = { top: 50, right: 50, bottom: 60, left: 70 };

        // 计算绘图区域
        this.plotWidth = this.width - this.padding.left - this.padding.right;
        this.plotHeight = this.height - this.padding.top - this.padding.bottom;
    }

    /**
     * 频率 → X 坐标（对数刻度）
     */
    freqToX(freq) {
        const minLog = Math.log10(125);
        const maxLog = Math.log10(8000);
        const ratio = (Math.log10(freq) - minLog) / (maxLog - minLog);
        return this.padding.left + ratio * this.plotWidth;
    }

    /**
     * dB HL → Y 坐标（倒置）
     */
    dbToY(db) {
        const ratio = (db - this.minDB) / (this.maxDB - this.minDB);
        return this.padding.top + (1 - ratio) * this.plotHeight;
    }

    /**
     * 渲染完整听力图
     */
    render(results) {
        const svg = this.buildSVG(results);
        this.container.innerHTML = svg;
    }

    /**
     * 构建 SVG 字符串
     */
    buildSVG(results) {
        const parts = [];

        // SVG 根元素
        parts.push(`<svg viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:680px;height:auto;">`);

        // 背景
        parts.push(`<rect x="0" y="0" width="${this.width}" height="${this.height}" fill="#fafbfc"/>`);

        // 正常范围阴影区（0-25 dB HL）
        const normalTop = this.dbToY(0);
        const normalBottom = this.dbToY(25);
        parts.push(`<rect x="${this.padding.left}" y="${normalTop}" width="${this.plotWidth}" height="${normalBottom - normalTop}" fill="#e8f5e9" opacity="0.6"/>`);
        parts.push(`<text x="${this.padding.left + this.plotWidth - 5}" y="${normalTop + 15}" text-anchor="end" font-size="11" fill="#4caf50" font-weight="600">正常范围</text>`);

        // 网格 - 水平线（dB HL 刻度）
        const dbLines = [-10, 0, 10, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
        for (const db of dbLines) {
            const y = this.dbToY(db);
            const isMajor = db % 20 === 0 || db === 0;
            const isNormal = db === 25;

            if (isNormal) {
                parts.push(`<line x1="${this.padding.left}" y1="${y}" x2="${this.padding.left + this.plotWidth}" y2="${y}" stroke="#4caf50" stroke-width="1.5" stroke-dasharray="6,3"/>`);
            } else if (isMajor) {
                parts.push(`<line x1="${this.padding.left}" y1="${y}" x2="${this.padding.left + this.plotWidth}" y2="${y}" stroke="#e0e0e0" stroke-width="1"/>`);
            } else {
                parts.push(`<line x1="${this.padding.left}" y1="${y}" x2="${this.padding.left + this.plotWidth}" y2="${y}" stroke="#f0f0f0" stroke-width="0.5"/>`);
            }

            // Y 轴标签
            parts.push(`<text x="${this.padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${db}</text>`);
        }

        // Y 轴标题
        parts.push(`<text x="20" y="${this.padding.top + this.plotHeight / 2}" text-anchor="middle" font-size="12" fill="#333" font-weight="600" transform="rotate(-90, 20, ${this.padding.top + this.plotHeight / 2})">听力级 (dB HL)</text>`);

        // 网格 - 垂直线（频率刻度）
        const freqLabels = {
            250: '250',
            500: '500',
            1000: '1k',
            2000: '2k',
            4000: '4k',
            8000: '8k'
        };

        // 额外的垂直线（倍频程中间值）
        const extraFreqs = [750, 1500, 3000, 6000];
        for (const freq of extraFreqs) {
            const x = this.freqToX(freq);
            parts.push(`<line x1="${x}" y1="${this.padding.top}" x2="${x}" y2="${this.padding.top + this.plotHeight}" stroke="#f5f5f5" stroke-width="0.5"/>`);
        }

        for (const freq of this.frequencies) {
            const x = this.freqToX(freq);
            parts.push(`<line x1="${x}" y1="${this.padding.top}" x2="${x}" y2="${this.padding.top + this.plotHeight}" stroke="#d0d0d0" stroke-width="1"/>`);
            parts.push(`<text x="${x}" y="${this.padding.top + this.plotHeight + 20}" text-anchor="middle" font-size="12" fill="#333">${freqLabels[freq]}</text>`);
        }

        // X 轴标题
        parts.push(`<text x="${this.padding.left + this.plotWidth / 2}" y="${this.height - 15}" text-anchor="middle" font-size="12" fill="#333" font-weight="600">频率 (Hz)</text>`);

        // 边框
        parts.push(`<rect x="${this.padding.left}" y="${this.padding.top}" width="${this.plotWidth}" height="${this.plotHeight}" fill="none" stroke="#999" stroke-width="1.5"/>`);

        // 绘制右耳数据（红色 O）
        if (results.right) {
            this.drawEarData(parts, results.right, 'right', '#d32f2f', 'O');
        }

        // 绘制左耳数据（蓝色 X）
        if (results.left) {
            this.drawEarData(parts, results.left, 'left', '#1565c0', 'X');
        }

        // 图例
        this.drawLegend(parts);

        parts.push('</svg>');

        return parts.join('');
    }

    /**
     * 绘制单耳数据点和连线
     */
    drawEarData(parts, earData, ear, color, symbol) {
        const points = [];

        for (const freq of this.frequencies) {
            const db = earData[freq];
            if (db === undefined || db === null) continue;

            const x = this.freqToX(freq);
            const y = this.dbToY(db);
            points.push({ x, y, freq, db });

            // 绘制符号
            if (symbol === 'O') {
                // 右耳：红色圆圈
                parts.push(`<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${color}" stroke-width="2"/>`);
                // 无响应标记（>90 dB）
                if (db >= 100) {
                    parts.push(`<line x1="${x - 8}" y1="${y - 8}" x2="${x + 8}" y2="${y + 8}" stroke="${color}" stroke-width="2"/>`);
                    parts.push(`<line x1="${x - 8}" y1="${y + 8}" x2="${x + 8}" y2="${y - 8}" stroke="${color}" stroke-width="2"/>`);
                }
            } else {
                // 左耳：蓝色叉
                const s = 5;
                parts.push(`<line x1="${x - s}" y1="${y - s}" x2="${x + s}" y2="${y + s}" stroke="${color}" stroke-width="2"/>`);
                parts.push(`<line x1="${x - s}" y1="${y + s}" x2="${x + s}" y2="${y - s}" stroke="${color}" stroke-width="2"/>`);
                // 无响应标记
                if (db >= 100) {
                    parts.push(`<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="none" stroke="${color}" stroke-width="1.5"/>`);
                }
            }

            // 数值标签
            parts.push(`<text x="${x}" y="${y - 12}" text-anchor="middle" font-size="10" fill="${color}" font-weight="600">${db}</text>`);
        }

        // 连线
        if (points.length > 1) {
            const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            parts.push(`<path d="${pathData}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>`);
        }
    }

    /**
     * 绘制图例
     */
    drawLegend(parts) {
        const lx = this.padding.left + 10;
        const ly = this.padding.top + 10;

        // 右耳
        parts.push(`<circle cx="${lx + 8}" cy="${ly}" r="6" fill="none" stroke="#d32f2f" stroke-width="2"/>`);
        parts.push(`<text x="${lx + 20}" y="${ly + 4}" font-size="12" fill="#333">右耳 (R)</text>`);

        // 左耳
        parts.push(`<line x1="${lx + 4}" y1="${ly + 20 - 4}" x2="${lx + 12}" y2="${ly + 20 + 4}" stroke="#1565c0" stroke-width="2"/>`);
        parts.push(`<line x1="${lx + 4}" y1="${ly + 20 + 4}" x2="${lx + 12}" y2="${ly + 20 - 4}" stroke="#1565c0" stroke-width="2"/>`);
        parts.push(`<text x="${lx + 20}" y="${ly + 24}" font-size="12" fill="#333">左耳 (L)</text>`);
    }
}

// 导出
window.Audiogram = Audiogram;
