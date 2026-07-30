# 🎧 Hearing Self-Diagnosis Agent | 听力自我诊断 Agent

> 基于浏览器的纯音测听自我诊断工具，采用临床标准的 Hughson-Westlake 阈值测定法，在浏览器中完成完整的听力筛查。

A browser-based pure-tone audiometry self-diagnosis tool that implements the clinically standard Hughson-Westlake threshold method for comprehensive hearing screening — entirely in the browser, no backend required.

## ✨ 功能特性

- **纯音测听引擎** — Web Audio API 生成 250 / 500 / 1k / 2k / 4k / 8k Hz 标准频率正弦波，dB HL → 线性增益映射含频率校正因子
- **Hughson-Westlake 测试协议** — 临床标准阈值测定法：降 10 dB / 升 5 dB 阶梯法，连续 2 次响应确认阈值
- **左右耳分别测试** — StereoPannerNode 实现声道隔离，共 12 个频率点
- **测试前校准** — 播放校准音让用户确认设备音量合适后再开始正式测试
- **SVG 听力图** — 标准格式：对数频率轴、倒置 dB 轴，右耳红色 ○ / 左耳蓝色 ×，正常范围阴影区
- **智能诊断报告** — 听力损失分级（正常/轻度/中度/中重度/重度/极重度）、听力图形态分析、损失类型初步估计、双耳对称性对比
- **响应式设计** — 支持桌面和移动端浏览器
- **零依赖** — 纯原生 HTML/CSS/JS，无需 npm install，无需后端

## 🚀 快速开始

### 在线使用

直接用浏览器打开即可，无需安装任何东西。**请佩戴耳机在安静环境中使用。**

### 本地运行

```bash
# 方式一：Python
python -m http.server 8080

# 方式二：Node.js
npx serve .

# 然后在浏览器中打开 http://localhost:8080
```

### 使用步骤

1. 佩戴**有线耳机**，在**安静环境**中打开页面
2. 将设备音量调至 60%–80%
3. 完成校准步骤 — 确认能听到校准音
4. 按引导完成测试（约 8–15 分钟）
5. 听到声音按 `空格键` 或点击「我听到了」，听不到按 `↓` 或点击「没听到」
6. 查看自动生成的听力图和诊断报告，可打印保存

## 📐 技术架构

```
hearing-test/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式（医疗专业风格，浅色主题）
├── js/
│   ├── audio-engine.js     # Web Audio 音频引擎
│   ├── test-protocol.js    # Hughson-Westlake 测试协议
│   ├── audiogram.js        # SVG 听力图渲染
│   ├── diagnosis.js        # 智能诊断逻辑
│   └── app.js              # 主应用控制器
├── LICENSE
└── README.md
```

### 核心模块说明

| 模块 | 职责 |
|------|------|
| `audio-engine.js` | OscillatorNode 纯音生成、dB HL → 增益映射（分段策略）、StereoPannerNode 声道隔离、淡入淡出包络、AudioContext 状态管理 |
| `test-protocol.js` | Hughson-Westlake 状态机：30 dB 起始 → 降 10 dB 至听不见 → 升 5 dB 至听见 → 2 次确认阈值，安全阀防死循环 |
| `audiogram.js` | SVG 绘制标准听力图：对数频率轴、倒置 dB 轴、右耳 ○ / 左耳 × 符号、阈值连线、正常范围阴影 |
| `diagnosis.js` | 听力损失分级、听力图形态分析（平坦型/高频下降/低频下降/谷型/不规则）、类型估计、对称性分析、个性化建议 |
| `app.js` | 状态管理、屏幕切换、键盘快捷键、测试流程编排 |

## 🩺 测试原理

### Hughson-Westlake 阈值测定法

这是临床纯音测听的标准方法：

1. 从 30 dB HL 开始播放测试音
2. 如果能听到 → 降低 10 dB，再次播放
3. 如果听不到 → 升高 5 dB，再次播放
4. 连续 **2 次在同一音量级听到** → 确定为该频率的听力阈值
5. 对每个频率（250 / 500 / 1k / 2k / 4k / 8k Hz）重复，左右耳分别测试

### 听力损失分级标准（WHO）

| 级别 | 阈值（dB HL） | 描述 |
|------|---------------|------|
| 正常 | 0–25 | 听力正常 |
| 轻度 | 26–40 | 听不清轻声说话 |
| 中度 | 41–55 | 听不清正常说话 |
| 中重度 | 56–70 | 只能听到大声说话 |
| 重度 | 71–90 | 只能听到耳旁大喊 |
| 极重度 | >90 | 几乎听不到任何声音 |

## ⚠️ 重要声明

本工具仅供**初步筛查和健康教育参考**，不能替代专业医疗诊断。测试结果受以下因素影响：

- 耳机型号和频率响应
- 设备输出功率和音量设置
- 环境噪声水平
- 浏览器音频实现差异

如有听力问题，请及时到**耳鼻喉科**就诊，接受专业听力检测。

## 🛠️ 技术栈

- **Web Audio API** — 浏览器原生音频处理
- **SVG** — 听力图矢量渲染
- **Vanilla JavaScript** — 零依赖
- **CSS Custom Properties** — 主题管理

## 📄 License

[MIT](./LICENSE) © 2026 cnspica

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

- 发现 Bug → 提交 [Issue](../../issues)
- 有新功能想法 → 提交 [Issue](../../issues) 讨论
- 想贡献代码 → 提交 [Pull Request](../../pulls)
