# Wenty-test 数据大屏 (Wenty-test Operations Bigscreen Dashboard)

> 💡 **项目说明**：本仓库是专为 **Wenty-test** 智能化运营管理、功能测试验证、大屏大促演练打造的高沉浸感全屏数据可视化看板。项目采用纯前端无后端依赖架构设计，开箱即用。

---

## 📌 数据仿真与脱敏声明 (Simulated Data Notice)

- **数据性质**：本看板所加载和展示的所有数据（包括但不限于累计部署数、活跃用户规模、Token 消耗量、新老结构、留存漏斗、模型分布等）均为**内部合成的模拟仿真数据（Simulated Test Data）**。
- **安全与合规**：已彻底剔除所有内部生产网络拓扑、私有 IP（如内网地址）、内部数据仓库 SQL 路径及真实业务商业机密，专供内部研发、测试、演示与效果评估使用。

---

## 🌟 核心特性与功能板块

1. **驾驶舱顶部控制台 (Header Console)**
   - 空间感星空背景视差渲染；
   - 系统状态标识：`WENTY-TEST / SIMULATED DATA (模拟测试数据)`；
   - 实时时间段筛选器：支持自由选择任意历史起止日期，联动全屏图表重新计算与渲染。
2. **运营总览 KPI 矩阵 (Overview Metrics)**
   - **累计部署实例数**：全生命周期实例部署总量；
   - **当前周期指标**：部署用户数、活跃用户规模、总交互次数、Token 消耗总量（亿级）、新老用户占比、D0 首次活跃率。
3. **运营趋势复合可视化 (Trend Chart)**
   - 复合图表：每日新增部署折线 + 新老活跃用户堆积柱状图 + 每日 Token 消耗双 Y 轴折线。
   - 鼠标悬停 Tooltip 联动与数据高亮，具备初次加载呼吸感平滑动画。
4. **付费用户转化与质量漏斗 (Activation Funnel)**
   - 以获取付费用户为基准，展示「已部署实例」、「已首次使用」、「次日留存」、「深度对话用户」四大转化梯度。
5. **渠道来源与留存流向图 (Channel Sankey)**
   - 桑基图呈现直接流量、精准渠道、搜索引擎、生态协同到当日使用、3天留存与流失/待激活的完整全景流向。
6. **多维用户画像聚类 (User Profiling)**
   - **高消耗用户池**：基于 Token 消耗阶梯（千万级、百万级等）分层；
   - **AI 场景排行**：工程构建、轻量问答、内容创作、分析决策等业务场景的消息量聚类。
7. **基座大模型 Token 消耗矩形树图 (Model Usage Treemap)**
   - 面积直观呈现各基座大模型（Wenty-Core-v5, DeepSeek-V4, Spark-X2 等）的贡献占比；
   - 悬停展示各模型调用 Token 亿级总量与精确百分比。
8. **智能问数语义交互 (AI Natural Language Ask)**
   - 基于当前页面指标快照与本地内置语义规则引擎，无需外部服务端接口即可秒级识别并解答常见运营问题（如模型消耗峰值、留存建议、用户画像等）。
9. **自动化周报一键生成 (Weekly Report Generator)**
   - 动态聚合上个自然周的关键数据与环比变化，自动生成规范周报文案，支持一键复制到剪贴板。

---

## 🚀 快速使用 (Quick Start)

### 方式 1：通过 GitHub Pages 在线访问（推荐）
直接在现代浏览器中打开 GitHub Pages 链接即可体验完整功能。

### 方式 2：本地极速运行
由于本项目完全基于原生静态架构设计，无需复杂的 npm 构建或 node 服务：

```bash
# 克隆仓库
git clone https://github.com/slumber1989/wenty-test-dashboard.git
cd wenty-test-dashboard

# 使用 Python 启动轻量静态服务器（或直接双击 index.html 浏览器打开）
python3 -m http.server 8080
```
在浏览器打开 `http://localhost:8080` 即可查看。

---

## 📁 目录结构

```
wenty-test-dashboard/
├── index.html                  # 大屏主页面结构与弹窗口径说明
├── styles.css                  # 大屏深色科技风样式与星空动效
├── app.js                      # 大屏核心业务逻辑、图表渲染与数据计算
├── data/
│   └── dashboard-data-local.js # 内部测试模拟数据集 (Simulated Dataset)
├── vendor/
│   └── echarts/
│       └── echarts.min.js      # Apache ECharts 5 生产级离线包 (带 CDN 备用)
└── README.md                   # 项目工程与使用文档
```

---

## 🛠 技术栈

- **可视化渲染**：[Apache ECharts 5](https://echarts.apache.org/)
- **核心逻辑**：原生 ECMAScript 6+（无外部框架捆绑，轻量极致）
- **界面交互**：原生 HTML5 + CSS3 Flexbox / CSS Grid 弹性自适应布局
- **字体与自适应**：系统级等宽与无衬线字体，适配 1920x1080 标准大屏及 4K 宽屏显示

<!-- automated test -->
