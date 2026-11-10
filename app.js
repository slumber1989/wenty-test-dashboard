let raw = window.__WENTY_LOCAL_DASHBOARD_DATA__ || { source: {}, datasets: {} };
const fmt = new Intl.NumberFormat("zh-CN");
const fmt1 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
const reportPct = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const charts = [];
const localApiOrigins = [];
const fallbackDataStartDate = "2026-03-12";

const colors = {
  cyan: "#65ecff",
  blue: "#3b8dff",
  violet: "#8a78ff",
  purple: "#6949ff",
  pink: "#f46dff",
  mint: "#35f2ce",
  red: "#ff5b91",
};
const chartUIFont = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "Hiragino Sans GB", "Segoe UI", Arial, sans-serif';

let defaultRange = defaultDateRange(raw);
let selectableRange = selectableDateBounds(raw);
let currentRange = [...defaultRange];
let stickyAllDeployUsers = 0;
let animateNextCharts = true;
let dataSourceState = {
  mode: "静态快照",
  cacheStatus: raw.source?.cacheStatus || "snapshot",
  servedAt: raw.generatedAt || "",
  error: "",
};

function ds(key) {
  return raw.datasets?.[key]?.rows || [];
}

function payloadRange(payload) {
  const actual = sourceDateRange(payload, ["dateRange", "requestedDateRange"]);
  if (actual) return actual;
  return defaultRange;
}

function isYmdDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validDateRange(range) {
  return Array.isArray(range) && range.length === 2 && isYmdDate(range[0]) && isYmdDate(range[1]) && range[0] <= range[1];
}

function sourceDateRange(payload, keys = ["selectableDateRange", "availableDateRange", "dateRange", "requestedDateRange"]) {
  const source = payload?.source || {};
  for (const key of keys) {
    if (validDateRange(source[key])) return [source[key][0], source[key][1]];
  }
  return null;
}

function mergeDateRanges(...ranges) {
  const validRanges = ranges.filter(validDateRange);
  if (!validRanges.length) return null;
  return [
    validRanges.reduce((min, range) => (range[0] < min ? range[0] : min), validRanges[0][0]),
    validRanges.reduce((max, range) => (range[1] > max ? range[1] : max), validRanges[0][1]),
  ];
}

function datasetDateBounds(payload = raw) {
  const datasets = payload?.datasets || {};
  const dates = [];
  Object.values(datasets).forEach((dataset) => {
    (dataset?.rows || []).forEach((row) => {
      const value = row["日期"] || row.dt || row.ts_day;
      if (isYmdDate(value)) dates.push(String(value));
    });
  });
  dates.sort();
  if (dates.length) return [dates[0], dates[dates.length - 1]];
  return null;
}

function dataDateBounds(payload = raw) {
  const availableRange = sourceDateRange(payload, ["selectableDateRange", "availableDateRange"]);
  const datasetRange = datasetDateBounds(payload);
  const mergedRange = mergeDateRanges(availableRange, datasetRange);
  if (mergedRange) return mergedRange;
  const sourceRange = sourceDateRange(payload, ["dateRange", "requestedDateRange"]);
  if (sourceRange) return sourceRange;
  return [fallbackDataStartDate, yesterdayChinaDate()];
}

function todayChinaDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function yesterdayChinaDate() {
  return new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function defaultDateRange(payload = raw) {
  const bounds = dataDateBounds(payload);
  const sourceRange = sourceDateRange(payload, ["requestedDateRange", "dateRange"]);
  const clamp = (value, fallback) => {
    const candidate = isYmdDate(value) ? value : fallback;
    if (candidate < bounds[0]) return bounds[0];
    if (candidate > bounds[1]) return bounds[1];
    return candidate;
  };
  const start = clamp(sourceRange?.[0], bounds[0]);
  const end = clamp(sourceRange?.[1], bounds[1]);
  return start <= end ? [start, end] : [start, start];
}

function selectableDateBounds(payload = raw) {
  return dataDateBounds(payload);
}

function updateSelectableRange(payload = raw) {
  const [start, end] = selectableDateBounds(payload);
  selectableRange = [
    selectableRange?.[0] ? (start < selectableRange[0] ? start : selectableRange[0]) : start,
    selectableRange?.[1] ? (end > selectableRange[1] ? end : selectableRange[1]) : end,
  ];
}

function setDashboardPayload(payload, state = {}) {
  if (!payload?.datasets) return false;
  raw = payload;
  defaultRange = payloadRange(payload);
  updateSelectableRange(payload);
  dataSourceState = {
    mode: state.mode || (payload.source?.mode === "live-redash" ? "实时数据" : "服务端缓存"),
    cacheStatus: payload.source?.cacheStatus || state.cacheStatus || "snapshot",
    servedAt: payload.source?.servedAt || payload.generatedAt || state.servedAt || "",
    error: state.error || "",
  };
  return true;
}

function canUseDashboardApi() {
  return location.protocol === "http:" || location.protocol === "https:" || location.protocol === "file:";
}

function dataSourceLabel() {
  const map = {
    "live-redash": "LIVE DATA",
    "segmented-redash": "SEGMENTED DATA",
    cached: "CACHE DATA",
    "cached-slice": "CACHE SLICE",
    "cached-segments": "CACHE SEGMENTS",
    "latest-cache": "LATEST CACHE",
    "range-fallback": "FAST FILTER",
    loading: "LOADING",
    snapshot: "LOCAL SNAPSHOT",
    "simulated-dataset": "SIMULATED DATA (模拟测试数据)",
  };
  const label = map[dataSourceState.cacheStatus] || dataSourceState.mode || "LOCAL SNAPSHOT";
  return dataSourceState.error ? `${label} / FALLBACK` : label;
}

function shortDate(value) {
  return String(value || "").slice(5).replace("-", "/");
}

function updateSourceChrome() {
  const mode = document.getElementById("sourceMode");
  const date = document.getElementById("screenDate");
  if (mode) mode.textContent = `WENTY-TEST / ${dataSourceLabel()}`;
  if (date) {
    const refreshing = raw.source?.refreshing ? " · 刷新中" : "";
    const [, dataEnd] = dataDateBounds(raw);
    const dataCoverage = dataEnd && dataEnd < currentRange[1] ? ` · 数据至 ${shortDate(dataEnd)}` : "";
    date.textContent = `${shortDate(currentRange[0])} 至 ${shortDate(currentRange[1])}${dataCoverage}${refreshing}`;
    date.title = `${currentRange[0]} 至 ${currentRange[1]}；最早可选 ${selectableRange[0]}，最晚可选 ${selectableRange[1]}`;
  }
}

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function day(value) {
  return String(value || "").trim();
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + n(row[field]), 0);
}

function payloadDeployUsers(payload = raw) {
  return (payload.datasets?.opsDailyQuality?.rows || []).reduce((total, row) => total + n(row["部署人数"]), 0);
}

function payloadLifetimeDeployClaws(payload = raw) {
  const row = payload.datasets?.lifetimeDeployTotal?.rows?.[0] || {};
  return n(row["累计部署实例数"] ?? row["累计部署Claw数"] ?? row["累计部署 Claw 数"] ?? row["累计部署数"] ?? row["累计部署用户数"]);
}

function captureStickyMetrics(payload = raw, force = false) {
  const deployUsers = payloadLifetimeDeployClaws(payload) || payloadDeployUsers(payload);
  if (force || deployUsers > stickyAllDeployUsers || (!stickyAllDeployUsers && deployUsers)) stickyAllDeployUsers = deployUsers;
}

function avg(rows, field) {
  return rows.length ? sum(rows, field) / rows.length : 0;
}

function pctText(value) {
  if (typeof value === "string") {
    const match = value.match(/\(([-\d.]+)%\)/) || value.match(/([-\d.]+)%/);
    return match ? Number(match[1]) : n(value);
  }
  return n(value);
}

function countText(value) {
  if (typeof value === "string") {
    const match = value.match(/^([\d.]+)/);
    return match ? Number(match[1]) : 0;
  }
  return n(value);
}

function byDateMap(rows, key) {
  return new Map(rows.map((row) => [day(row[key]), row]));
}

function dateDiffFromEnd(dateString, endDate = defaultRange[1]) {
  const end = new Date(`${endDate}T00:00:00`);
  const current = new Date(`${day(dateString)}T00:00:00`);
  return Math.floor((end - current) / 86400000);
}

function inRange(dateString, range = defaultRange) {
  const value = day(dateString);
  return value >= range[0] && value <= range[1];
}

function weightedRetention(rows, field, matureDays, range = defaultRange) {
  const mature = rows.filter((row) => inRange(row.ts_day || row.dt, range) && dateDiffFromEnd(row.ts_day || row.dt, range[1]) >= matureDays && row[field] !== undefined);
  const denominator = mature.reduce((total, row) => total + n(row.regist_cnts), 0);
  if (!denominator) return 0;
  const numerator = mature.reduce((total, row) => total + countText(row[field]), 0);
  return (numerator / denominator) * 100;
}

function retentionCount(rows, field, matureDays, range = defaultRange) {
  return rows
    .filter((row) => {
      const date = row.ts_day || row.dt || row["日期"];
      return inRange(date, range) && dateDiffFromEnd(date, range[1]) >= matureDays && row[field] !== undefined;
    })
    .reduce((total, row) => total + countText(row[field]), 0);
}

function aggregate(rows, nameField, valueField, limit = 6) {
  const map = new Map();
  for (const row of rows) {
    const name = String(row[nameField] || "未识别").trim();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + n(row[valueField]));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function getDailyRows() {
  const ret = byDateMap(ds("usageRetention"), "ts_day");
  const token = byDateMap(ds("tokenDaily"), "dt");
  const refunds = byDateMap(ds("refundDaily"), "dt");
  return ds("opsDailyQuality")
    .slice()
    .sort((a, b) => day(a["日期"]).localeCompare(day(b["日期"])))
    .map((row) => {
      const date = day(row["日期"]);
      const tokenRow = token.get(date) || {};
      const refundRow = refunds.get(date) || {};
      const retRow = ret.get(date) || {};
      return {
        date,
        activeUsers: n(row["使用人数"]),
        useCount: n(row["使用次数"]),
        usePer: n(row["人均使用次数"]),
        newUsers: n(row["新用户数"]),
        oldUsers: n(row["老用户数"]),
        oldShare: n(row["老用户占比"]),
        highFreqUsers: n(row["单日10次+用户"]),
        multiSessionUsers: n(row["多Session用户"]),
        deployUsers: n(row["部署人数"]),
        deployD0Users: n(row["部署当日使用人数"]),
        deployD0: n(row["部署D0使用率"]),
        paidUsers: n(row["付费人数"]),
        firstPaid: n(row["首次付费人数"]),
        revenue: n(row["付费金额"]),
        refundUsers: n(refundRow["总退款人数"]),
        refundAmount: n(refundRow["总退款金额"]),
        tokenBillions: n(tokenRow["消耗Tokens(亿)"]),
        tokenUsers: n(tokenRow["Tokens消耗-用户数"]),
        tokenPer: n(tokenRow["人均Tokens(万)"]),
        d1: pctText(retRow.the_next_day_uses),
        d3: pctText(retRow.the_three_day_uses),
        d7: pctText(retRow.the_seven_day_uses),
      };
    });
}

function modelAgg(range = defaultRange) {
  const map = new Map();
  for (const row of ds("modelUsage").filter((item) => inRange(item["日期"], range))) {
    const name = String(row["模型"] || "未知模型").trim();
    if (!map.has(name)) map.set(name, { name, tokens: 0, users: 0, tasks: 0 });
    const item = map.get(name);
    item.tokens += n(row["调用Tokens(亿)"]);
    item.users += n(row["使用人数"]);
    item.tasks += n(row["任务次数"]);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

function sceneAgg(range = defaultRange) {
  const daily = aggregate(ds("conversationScenesDaily").filter((row) => inRange(row["日期"], range)), "场景大类", "消息数", 6);
  if (daily.length) return daily;
  const summary = aggregate(ds("conversationScenes"), "场景大类", "消息数", 6);
  if (summary.length) return summary;
  return [
    { name: "轻量问答", value: 218880 },
    { name: "综合任务", value: 86919 },
    { name: "分析决策", value: 62362 },
  ];
}

function channelRetention3(range = currentRange) {
  const rows = ds("channelRetention").filter((row) => {
    const date = row["日期"] || row.dt || row.ts_day;
    return inRange(date, range) && dateDiffFromEnd(date, range[1]) >= 3;
  });
  const total = rows.reduce((sumCount, row) => sumCount + countText(row["3日"]), 0);
  if (total) return total;
  return rows.reduce((sumCount, row) => sumCount + countText(row["2日"]), 0);
}

function deploySourceAgg(range = currentRange) {
  const deploymentSources = aggregate(
    ds("deploySourceDaily").filter((row) => inRange(row.ts_day || row.dt, range)),
    "categories",
    "uidcnts",
    99,
  );
  if (deploymentSources.length) {
    return deploymentSources.map((row) => ({ ...row, deploy: row.value, sourceType: "部署来源" }));
  }
  return aggregate(ds("endpointDeployDaily").filter((row) => inRange(row.dt, range)), "client_types", "部署人数", 99)
    .map((row) => ({ ...row, deploy: row.value, sourceType: "端侧来源" }));
}

function channelAgg() {
  return ds("channelFunnel")
    .map((row) => ({
      name: row.channel_name_belong || "未知渠道",
      value: n(row["部署人数"]),
      use: n(row["使用人数"]),
      paid: n(row["付费人数"]),
      retain2: n(row["留存（使用2+天）"]),
      deploy: n(row["部署人数"]),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function tokenPool() {
  const tokenRows = ds("tokenDistribution")
    .map((row) => ({
      name: row["sum_tokens_type"],
      value: n(row["各分布用户累计消耗Tokens 单位(万)"]),
      users: n(row["用户数分布"]),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  if (tokenRows.length) return tokenRows;
  return ds("opsUserQualitySegments")
    .filter((row) => row["用户类型"] === "全部用户" && (row["分层"].includes("重度") || row["分层"].includes("高频") || row["分层"].includes("高粘")))
    .sort((a, b) => n(b["使用次数"]) - n(a["使用次数"]))
    .slice(0, 5)
    .map((row) => ({ name: row["分层"], value: n(row["使用次数"]), users: n(row["用户数"]) }));
}

function segmentRows(dimension, userType = "全部用户", limit = 4) {
  let rows = ds("opsUserQualitySegments")
    .filter((row) => row["维度"] === dimension && row["用户类型"] === userType)
    .sort((a, b) => n(a["排序"]) - n(b["排序"]));
  if (!rows.length && userType !== "全部用户") {
    rows = ds("opsUserQualitySegments")
      .filter((row) => row["维度"] === dimension && row["用户类型"] === "全部用户")
      .sort((a, b) => n(a["排序"]) - n(b["排序"]));
  }
  return rows.slice(0, limit);
}

function quality(range = currentRange) {
  const rows = getDailyRows().filter((row) => inRange(row.date, range));
  const activeUserDays = sum(rows, "activeUsers");
  const useCount = sum(rows, "useCount");
  const tokenBillions = sum(rows, "tokenBillions");
  const newUserDays = sum(rows, "newUsers");
  const oldUserDays = sum(rows, "oldUsers");
  const deployUsers = sum(rows, "deployUsers");
  const deployD0 = rows.reduce((total, row) => total + row.deployD0 * row.deployUsers, 0) / Math.max(deployUsers, 1);
  const revenue = sum(rows, "revenue");
  const paidUsers = sum(rows, "paidUsers");
  const d1 = weightedRetention(ds("usageRetention"), "the_next_day_uses", 1, range);
  const d3 = weightedRetention(ds("usageRetention"), "the_three_day_uses", 3, range);
  const d7 = weightedRetention(ds("usageRetention"), "the_seven_day_uses", 7, range);
  const highFreqShare = sum(rows, "highFreqUsers") / Math.max(activeUserDays, 1) * 100;
  const oldShare = oldUserDays / Math.max(activeUserDays, 1) * 100;
  const score = Math.round(
    Math.min(100, deployD0) * 0.26 +
      Math.min(100, d3 * 2.2 + d7 * 3.2) * 0.3 +
      Math.min(100, oldShare * 1.35) * 0.18 +
      Math.min(100, highFreqShare * 10) * 0.16 +
      Math.min(100, revenue / 220) * 0.1,
  );

  return {
    rows,
    activeUserDays,
    avgDailyActive: activeUserDays / Math.max(rows.length, 1),
    useCount,
    tokenBillions,
    avgDailyTokenBillions: tokenBillions / Math.max(rows.length, 1),
    newUserDays,
    oldUserDays,
    oldShare,
    deployUsers,
    allDeployUsers: stickyAllDeployUsers || payloadLifetimeDeployClaws(raw) || payloadDeployUsers(raw) || deployUsers,
    deployD0,
    revenue,
    paidUsers,
    d1,
    d3,
    d7,
    highFreqUsers: sum(rows, "highFreqUsers"),
    multiSessionUsers: sum(rows, "multiSessionUsers"),
    deployD0Users: sum(rows, "deployD0Users"),
    deployRetain3Count: retentionCount(ds("deploymentRetention"), "the_three_day_uses", 3, range),
    score,
    dateRange: range,
    models: modelAgg(range),
    scenes: sceneAgg(range),
    sourceChannels: deploySourceAgg(range),
    channels: channelAgg(),
    channelRetain3: channelRetention3(range),
    tokenPool: tokenPool(),
  };
}

function percent(value) {
  return `${pct.format(value)}%`;
}

function panel(slot, title, body, extra = "") {
  return `
    <section class="tech-panel slot-${slot} ${extra}">
      <div class="panel-title"><h2>${title}</h2><i></i></div>
      <div class="panel-body">${body}</div>
    </section>
  `;
}

function chart(type) {
  return `<div class="viz" data-chart="${type}"></div>`;
}

function kpis(q) {
  const items = [
    ["活跃用户规模", fmt.format(Math.round(q.activeUserDays)), `日均 ${fmt.format(Math.round(q.avgDailyActive))}`],
    ["总使用次数", fmt.format(Math.round(q.useCount)), `高频 ${fmt.format(q.highFreqUsers)}`],
    ["Token 消耗", `${fmt1.format(q.tokenBillions)} 亿`, `日均 ${fmt1.format(q.avgDailyTokenBillions)} 亿`],
    ["付费金额", `${fmt1.format(q.revenue / 10000)} 万元`, `付费人次 ${fmt.format(q.paidUsers)}`],
  ];
  return `<div class="kpi-grid">${items.map(([a, b, c]) => `<div class="kpi-card"><span>${a}</span><strong>${b}</strong><em>${c}</em></div>`).join("")}</div>`;
}

function metricTiles(q) {
  const items = [
    ["实例部署", fmt.format(Math.round(q.deployUsers)), "部署用户", `D0 ${percent(q.deployD0)}`],
    ["新用户", fmt.format(Math.round(q.newUserDays)), "新增用户", `日均 ${fmt.format(Math.round(q.newUserDays / Math.max(q.rows.length, 1)))}`],
    ["老用户", fmt.format(Math.round(q.oldUserDays)), "回访用户", `占比 ${percent(q.oldShare)}`],
    ["日均 Token", `${fmt1.format(q.avgDailyTokenBillions)} 亿`, "日总量均值", `累计 ${fmt1.format(q.tokenBillions)} 亿`],
  ];
  return items.map(([label, value, scope, meta]) => `
    <div class="metric-tile">
      <div class="metric-head"><span>${label}</span><i>${scope}</i></div>
      <strong>${value}</strong>
      <em>${meta}</em>
    </div>
  `).join("");
}

function rankList(rows, formatter = (row) => fmt.format(Math.round(row.value)), limit = 4) {
  const max = rows[0]?.value || 1;
  return `<div class="rank-list">${rows
    .slice(0, limit)
    .map((row, index) => `
      <div class="rank-item">
        <span class="rank-no">TOP${index + 1}</span>
        <span class="rank-name">${row.name}</span>
        <strong class="rank-value">${formatter(row)}</strong>
        <span class="rank-bar"><i style="width:${Math.max(8, row.value / max * 100)}%"></i></span>
      </div>
    `)
    .join("")}</div>`;
}

function userPool(q) {
  const rows = q.tokenPool;
  const max = rows[0]?.value || 1;
  const footer = [
    ["高频使用", fmt.format(q.highFreqUsers)],
    ["多对话", fmt.format(q.multiSessionUsers)],
  ];
  return `
    <div class="pool-suite">
      <div class="pool-list">${rows
    .map((row) => `
        <div class="pool-row">
          <span>${row.name}</span>
          <strong>${fmt.format(row.users)} 人</strong>
          <em>${fmt1.format(row.value / 10000)} 亿</em>
          <i><b style="width:${Math.max(8, row.value / max * 100)}%"></b></i>
        </div>
    `)
    .join("")}</div>
      <div class="pool-footer">${footer.map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("")}</div>
    </div>
  `;
}

function adviceItems(q) {
  const topModel = q.models[0] || { name: "主力模型", tokens: 0 };
  const tokenPeak = q.rows.reduce((best, row) => (row.tokenBillions > best.tokenBillions ? row : best), q.rows[0] || {});
  return [
    `3天留存约 ${percent(q.d3)}，建议把首问模板、渠道配置、技能安装合并成一条新手路径。`,
    `${topModel.name} 是当前消耗主力，累计约 ${fmt1.format(topModel.tokens)} 亿 Token；${tokenPeak.date} 出现全月峰值 ${fmt1.format(tokenPeak.tokenBillions)} 亿。`,
    `老用户占比约 ${percent(q.oldShare)}，适合沉淀高频场景案例并反向喂给智能问数入口。`,
  ];
}

function starSvg() {
  return `
    <svg class="soft-star" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="starFill" cx="45%" cy="34%" r="70%">
          <stop offset="0" stop-color="#f8fbff" />
          <stop offset="0.34" stop-color="#9beaff" />
          <stop offset="0.62" stop-color="#7778ff" />
          <stop offset="1" stop-color="#f16cff" />
        </radialGradient>
      </defs>
      <path d="M55.6 15.5C57.3 11.9 62.7 11.9 64.4 15.5L74.4 36.2C75.1 37.8 76.7 38.9 78.4 39.1L101.3 42.1C105.3 42.6 106.9 47.6 104 50.4L87.3 66C86 67.2 85.4 69 85.8 70.7L90 93.1C90.7 97.1 86.4 100.1 82.9 98.2L62.6 87.1C61 86.2 59 86.2 57.4 87.1L37.1 98.2C33.6 100.1 29.3 97.1 30 93.1L34.2 70.7C34.6 69 34 67.2 32.7 66L16 50.4C13.1 47.6 14.7 42.6 18.7 42.1L41.6 39.1C43.3 38.9 44.9 37.8 45.6 36.2L55.6 15.5Z" fill="url(#starFill)" />
    </svg>
  `;
}

function core(q) {
  const allDeployUsers = fmt.format(Math.round(q.allDeployUsers));
  return `
    <div class="core-board core-compact">
      <div class="mini-orbit"><div class="star-core">${starSvg()}</div></div>
      <div class="core-caption core-deploy-total">
        <span>累计部署实例数</span>
        <strong title="${allDeployUsers}">${allDeployUsers}</strong>
      </div>
      <div class="data-nodes">
        <div class="data-node"><span>用户</span><strong>${fmt.format(Math.round(q.avgDailyActive))}/日</strong></div>
        <div class="data-node"><span>模型</span><strong>${q.models.length} 类</strong></div>
        <div class="data-node"><span>质量</span><strong>${q.score}</strong></div>
        <div class="data-node"><span>Token</span><strong>${fmt1.format(q.tokenBillions)} 亿</strong></div>
        <div class="data-node"><span>渠道</span><strong>${q.channels.length} 路</strong></div>
        <div class="data-node"><span>场景</span><strong>${q.scenes.length} 类</strong></div>
      </div>
    </div>
  `;
}

function coreOverview(q) {
  const allDeployUsers = fmt.format(Math.round(q.allDeployUsers));
  return `
    <div class="core-overview core-overview-simple">
      <div class="core-mark">
        <div class="core-mini-star">${starSvg()}</div>
        <div class="core-caption core-deploy-total">
          <span>累计部署实例数</span>
          <strong title="${allDeployUsers}">${allDeployUsers}</strong>
        </div>
      </div>
      <div class="core-metrics">${metricTiles(q)}</div>
    </div>
  `;
}

function conversionSteps(q) {
  const wanted = new Set(["付费用户", "已部署", "已首次使用"]);
  const funnelRows = ds("opsActivationFunnel")
    .filter((row) => wanted.has(row["指标"]))
    .sort((a, b) => n(a["顺序"]) - n(b["顺序"]))
    .map((row) => ({
      name: row["指标"],
      stage: row["阶段"],
      value: n(row["占付费用户"]),
      count: n(row["人数"]),
    }));
  const paidBase = funnelRows.find((row) => row.name === "付费用户")?.count || Math.round(q.paidUsers || q.deployUsers || q.activeUserDays);
  const rows = funnelRows.filter((row) => row.name !== "付费用户");
  const deepConversationRows = segmentRows("Session深度", "付费用户", 4).filter((row) => n(row["排序"]) >= 3);
  const deepConversationUsers = deepConversationRows.reduce((total, row) => total + n(row["用户数"]), 0);
  const retainStep = {
    name: "次日留存",
    stage: "次日留存",
    value: q.d1,
    count: Math.round(paidBase * q.d1 / 100),
  };
  const deepStep = {
    name: "深度对话用户",
    stage: "深度",
    value: deepConversationUsers / Math.max(paidBase, 1) * 100,
    count: Math.round(deepConversationUsers),
  };
  if (rows.length) {
    rows.push(retainStep, deepStep);
    return rows.slice(0, 4);
  }
  return [
    { name: "已部署", stage: "部署", value: Math.min(100, q.deployUsers / Math.max(paidBase, 1) * 100), count: Math.round(q.deployUsers) },
    { name: "首次使用", stage: "激活", value: q.deployD0, count: Math.round(q.deployUsers * q.deployD0 / 100) },
    retainStep,
    deepStep,
  ];
}

function conversionPath(q) {
  const rows = conversionSteps(q);
  const palette = [colors.cyan, colors.blue, colors.violet, colors.pink];
  return `
    <div class="conversion-path" style="--steps:${rows.length}">
      ${rows
        .map((row, index) => {
          const value = Math.max(0, Math.min(100, row.value));
          return `
          <div class="conversion-step" style="--p:${Math.max(4, value)}%; --c:${palette[index % palette.length]}; --i:${index}">
            <div class="conversion-head">
              <span>0${index + 1}</span>
              <em>${row.stage}</em>
            </div>
            <strong class="conversion-name">${row.name}</strong>
            <div class="conversion-values">
              <b>${fmt.format(row.count)} 人</b>
              <i>${fmt1.format(row.value)}%</i>
            </div>
            <div class="conversion-track"><i></i></div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function displayConversationLabel(value) {
  return String(value || "").replace(/Session/g, "对话");
}

function frequencyRings() {
  const rows = profileSegmentData("使用次数", 5);
  const palette = [colors.cyan, colors.violet, colors.pink, colors.mint, colors.blue];
  return `
    <div class="frequency-orbits">
      ${rows.map((row, index) => `
        <div class="frequency-orbit" style="--p:${Math.max(2, row.share)}%; --c:${palette[index % palette.length]}">
          <i></i>
          <strong>${fmt1.format(row.share)}%</strong>
          <span>${row.name}</span>
          <em>${fmt.format(row.users)} 人</em>
        </div>
      `).join("")}
    </div>
  `;
}

function consumeBlocks(q) {
  const rows = profilePoolData(q).slice(0, 4);
  const max = Math.max(...rows.map((row) => row.value), 1);
  const palette = [colors.cyan, colors.pink, colors.mint, colors.violet, colors.blue];
  return `
    <div class="consume-cloud">
      ${rows.map((row, index) => `
        <div class="consume-tile" title="${row.name} · ${fmt.format(row.users)} 人 · ${fmt1.format(row.value / 10000)} 亿 Token" style="--c:${palette[index % palette.length]}; --p:${Math.max(4, row.value / max * 100)}%">
          <i></i>
          <span>${row.name}</span>
          <strong>${fmt.format(row.users)} 人</strong>
          <em>${fmt1.format(row.value / 10000)} 亿</em>
        </div>
      `).join("")}
    </div>
  `;
}

function conversationTiles(rows) {
  const palette = [colors.cyan, colors.violet, colors.pink, colors.mint];
  return `
    <div class="conversation-tiles">
      ${rows.map((row, index) => `
        <div class="conversation-tile" style="--c:${palette[index % palette.length]}; --p:${Math.max(4, n(row["用户占比"]))}%">
          <span>${displayConversationLabel(row["分层"])}</span>
          <strong>${fmt.format(n(row["用户数"]))} 人</strong>
          <em>${fmt1.format(n(row["用户占比"]))}%</em>
        </div>
      `).join("")}
    </div>
  `;
}

function sceneMosaic(rows) {
  const palette = [colors.cyan, colors.violet, colors.pink, colors.mint, colors.blue];
  return `
    <div class="scene-mosaic">
      ${rows.slice(0, 5).map((row, index) => `
        <div class="scene-tile" style="--c:${palette[index % palette.length]}">
          <em>TOP${index + 1}</em>
          <strong>${row.name}</strong>
          <span>${fmt.format(Math.round(row.value))} 条</span>
        </div>
      `).join("")}
    </div>
  `;
}

function profileRadarRows(q) {
  const active = Math.max(q.activeUserDays, 1);
  const newShare = q.newUserDays / active * 100;
  const highFreqShare = q.highFreqUsers / active * 100;
  const multiShare = q.multiSessionUsers / active * 100;
  const topPool = q.tokenPool[0] || { users: 0, value: 0, name: "高消耗池" };
  const consumeScore = Math.min(100, Math.max(18, Math.log10(Math.max(topPool.value, 10)) * 11.6));
  return [
    { name: "新客增长", value: Math.min(100, newShare * 1.38), display: percent(newShare), note: "新用户占比" },
    { name: "老用户黏性", value: Math.min(100, q.oldShare * 1.55), display: percent(q.oldShare), note: "老用户占比" },
    { name: "留存质量", value: Math.min(100, q.d3 * 9 + q.d7 * 12), display: `${percent(q.d3)} / ${percent(q.d7)}`, note: "3天 / 7天留存" },
    { name: "使用深度", value: Math.min(100, highFreqShare * 10.5), display: percent(highFreqShare), note: "单日10次+用户" },
    { name: "对话深度", value: Math.min(100, multiShare * 6.4), display: percent(multiShare), note: "多对话用户" },
    { name: "消耗潜力", value: consumeScore, display: `${fmt.format(topPool.users)} 人`, note: topPool.name },
  ];
}

function profileRadarSuite(q) {
  const rows = profileRadarRows(q);
  return `
    <div class="profile-radar-suite">
      <div class="profile-radar-main">${chart("profileRadar")}</div>
      <div class="profile-radar-readout">
        ${rows.map((row, index) => `
          <div class="radar-readout-item" style="--p:${Math.max(6, row.value)}%; --i:${index}">
            <span>${row.name}</span>
            <strong>${row.display}</strong>
            <em>${row.note}</em>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function profilePoolBubbles(q) {
  const rows = profilePoolData(q).slice(0, 4);
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `
    <div class="profile-bubble-grid">
      ${rows.map((row) => `
        <div class="profile-bubble" title="${row.name} · ${fmt.format(row.users)} 人 · ${fmt1.format(row.value / 10000)} 亿 Token" style="--p:${Math.max(6, row.value / max * 100)}%">
          <i></i>
          <span>${row.name}</span>
          <strong>${fmt.format(row.users)} 人</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function sceneBars(rows) {
  const max = rows[0]?.value || 1;
  return `
    <div class="profile-bars scene-bars">
      ${rows.slice(0, 5).map((row, index) => `
        <div class="profile-bar-row">
          <span><em>TOP${index + 1}</em>${row.name}</span>
          <strong>${fmt.format(Math.round(row.value))}</strong>
          <i><b style="width:${Math.max(7, row.value / max * 100)}%"></b></i>
        </div>
      `).join("")}
    </div>
  `;
}

function profileSuite(q) {
  const metrics = [
    ["新用户", fmt.format(Math.round(q.newUserDays))],
    ["老用户占比", percent(q.oldShare)],
    ["3天留存", percent(q.d3)],
    ["7天留存", percent(q.d7)],
  ];
  const sessionRows = segmentRows("Session深度", "全部用户", 4);
  return `
    <div class="profile-suite profile-suite-rich">
      <div class="profile-metrics">${metrics.map(([label, value]) => `<span>${label}<strong>${value}</strong></span>`).join("")}</div>
      <div class="profile-chart-grid">
        <div class="profile-card">
          <div class="profile-section-title">新老结构</div>
          <div class="profile-mini-chart">${chart("profileMix")}</div>
        </div>
        <div class="profile-card profile-days-card">
          <div class="profile-section-title">活跃天数</div>
          <div class="profile-mini-chart">${chart("profileDays")}</div>
        </div>
        <div class="profile-card">
          <div class="profile-section-title">使用频次</div>
          <div class="profile-mini-chart profile-frequency-radar">${chart("profileFrequency")}</div>
        </div>
        <div class="profile-card">
          <div class="profile-section-title">高消耗用户池</div>
          ${profilePoolBubbles(q)}
        </div>
        <div class="profile-card">
          <div class="profile-section-title">对话深度</div>
          ${conversationTiles(sessionRows)}
        </div>
        <div class="profile-card">
          <div class="profile-section-title">场景排行</div>
          ${sceneBars(q.scenes)}
        </div>
      </div>
    </div>
  `;
}

function askBox(q) {
  return `
    <div class="ask-box ask-box-simple">
      <label class="ask-input">
        <span class="ask-prefix">AI</span>
        <input id="askInput" value="本周活跃和 Token 变化说明了什么？" />
        <button id="askButton" type="button">问数</button>
      </label>
      <p id="askAnswer" class="ask-answer">${askResponse("token", q)}</p>
      <div class="ask-chips">
        <button class="ask-chip" type="button">本周活跃有什么变化？</button>
        <button class="ask-chip" type="button">Token 消耗最高的模型是谁？</button>
        <button class="ask-chip" type="button">新老用户结构说明了什么？</button>
      </div>
    </div>
  `;
}

function layoutHtml(q) {
  const panels = [
    panel("core", "运营总览", coreOverview(q)),
    panel("ask", "Wenty-test 智能问数", askBox(q)),
    panel("trend", "运营趋势", chart("trend")),
    panel("sankey", "渠道来源与留存", channelFlow(q)),
    panel("profile", "用户画像", profileSuite(q)),
    panel("conversion", "付费用户转化漏斗", conversionPath(q)),
    panel("model", "模型消耗", modelConsumption(q)),
  ];
  return `<div class="layout layout-01">${panels.join("")}</div>`;
}

function chartBase(el) {
  if (!window.echarts) return null;
  const chart = echarts.init(el, null, { renderer: "canvas" });
  charts.push(chart);
  return chart;
}

function chartOptions(type, q) {
  if (type === "trend") return trendOptions(q);
  if (type === "channelSankey") return channelSankeyOptions(q);
  if (type === "profileRadar") return profileRadarOptions(q);
  if (type === "profile" || type === "profileMix") return profileMixOptions(q);
  if (type === "profileDays") return profileDaysOptions(q);
  if (type === "profileFrequency") return profileFrequencyOptions(q);
  if (type === "profilePool") return profilePoolOptions(q);
  if (type === "modelMinor") return modelOptions(q, "minor");
  if (type === "model" || type === "modelWide") return modelOptions(q, type === "modelWide" ? "wide" : "major");
  if (type === "conversion") return conversionOptions(q);
  return {};
}

function withChartMotion(options, animate) {
  return {
    ...options,
    textStyle: {
      fontFamily: chartUIFont,
      ...(options.textStyle || {}),
    },
    animation: animate,
    animationDuration: animate ? 760 : 0,
    animationDurationUpdate: animate ? 520 : 0,
    animationEasing: "cubicOut",
    stateAnimation: { duration: 0 },
  };
}

function baseTooltip() {
  return {
    renderMode: "html",
    appendToBody: true,
    confine: true,
    backgroundColor: "rgba(4, 13, 36, 0.94)",
    borderColor: "rgba(101, 236, 255, 0.44)",
    textStyle: { color: "#edf8ff", fontFamily: chartUIFont },
    extraCssText: "z-index: 2147483647; pointer-events: none; max-width: 360px; white-space: normal; overflow: visible; box-shadow: 0 0 18px rgba(101,236,255,0.22);",
  };
}

function trendOptions(q) {
  const rows = q.rows;
  return {
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: {
        type: "cross",
        crossStyle: { color: "rgba(101,236,255,0.32)" },
      },
    },
    legend: {
      top: 2,
      right: 118,
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 12,
      icon: "roundRect",
      textStyle: { color: "rgba(222,240,255,0.68)", fontSize: 12 },
    },
    grid: { left: 42, right: 64, top: 40, bottom: 22 },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date.slice(5)),
      axisLine: { lineStyle: { color: "rgba(130, 210, 255, 0.25)" } },
      axisTick: { show: false },
      axisLabel: { color: "rgba(213,230,255,0.56)", fontSize: 12 },
    },
    yAxis: [
      {
        type: "value",
        name: "用户 / 部署",
        nameGap: 10,
        nameTextStyle: { color: "rgba(213,230,255,0.48)", fontSize: 12 },
        splitLine: { lineStyle: { color: "rgba(115,190,255,0.08)" } },
        axisLabel: { color: "rgba(213,230,255,0.52)", fontSize: 12 },
      },
      {
        type: "value",
        name: "Token(亿)",
        nameGap: 14,
        nameTextStyle: { color: "rgba(213,230,255,0.42)", fontSize: 12 },
        splitLine: { show: false },
        axisLabel: { color: "rgba(213,230,255,0.42)", fontSize: 12 },
      },
    ],
    series: [
      {
        name: "实例部署",
        type: "line",
        data: rows.map((row) => row.deployUsers),
        smooth: 0.3,
        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        z: 5,
        lineStyle: { width: 2.8, color: colors.blue, shadowColor: colors.blue, shadowBlur: 10 },
        itemStyle: { color: colors.blue, borderColor: "#effcff", borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(59,141,255,0.16)" },
            { offset: 1, color: "rgba(59,141,255,0)" },
          ]),
        },
      },
      {
        name: "新用户",
        type: "bar",
        stack: "用户结构",
        data: rows.map((row) => row.newUsers),
        barWidth: 8,
        z: 3,
        itemStyle: {
          borderRadius: [0, 0, 4, 4],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(101,236,255,0.92)" },
            { offset: 0.62, color: "rgba(59,141,255,0.72)" },
            { offset: 1, color: "rgba(59,141,255,0.1)" },
          ]),
        },
      },
      {
        name: "老用户",
        type: "bar",
        stack: "用户结构",
        data: rows.map((row) => row.oldUsers),
        barWidth: 8,
        z: 3,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: colors.pink },
            { offset: 0.58, color: "#a45cff" },
            { offset: 1, color: "rgba(244,109,255,0.08)" },
          ]),
        },
      },
      {
        name: "日均 Token",
        type: "line",
        yAxisIndex: 1,
        smooth: 0.32,
        showSymbol: false,
        symbolSize: 6,
        data: rows.map((row) => row.tokenBillions),
        z: 5,
        lineStyle: { width: 2.4, color: colors.mint, shadowColor: colors.mint, shadowBlur: 10 },
        itemStyle: { color: colors.mint, borderColor: "#effcff", borderWidth: 1 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(53,242,206,0.16)" },
            { offset: 1, color: "rgba(53,242,206,0)" },
          ]),
        },
      },
    ],
  };
}

function profileSegmentData(dimension, limit = 5) {
  return segmentRows(dimension, "全部用户", limit).map((row) => ({
    name: row["分层"],
    users: n(row["用户数"]),
    share: n(row["用户占比"]),
    uses: n(row["使用次数"]),
  }));
}

function profilePoolData(q) {
  const fallback = segmentRows("使用次数", "全部用户", 5).map((row) => ({
    name: row["分层"],
    value: n(row["使用次数"]),
    users: n(row["用户数"]),
  }));
  const rows = q.tokenPool.slice(0, 5);
  for (const row of fallback) {
    if (rows.length >= 5) break;
    if (!rows.some((item) => item.name === row.name)) rows.push(row);
  }
  return rows;
}

function profileRadarOptions(q) {
  const rows = profileRadarRows(q);
  return {
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(),
      formatter: () => rows
        .map((row) => `${row.name}：${row.display}<br/><span style="color:rgba(204,226,255,.62)">${row.note}</span>`)
        .join("<br/>"),
    },
    radar: {
      center: ["50%", "50%"],
      radius: "68%",
      startAngle: 90,
      splitNumber: 4,
      shape: "polygon",
      indicator: rows.map((row) => ({ name: row.name, max: 100 })),
      axisName: {
        color: "rgba(229,245,255,0.82)",
        fontSize: 12,
        padding: [2, 4],
      },
      axisLine: { lineStyle: { color: "rgba(101,236,255,0.2)" } },
      splitLine: {
        lineStyle: {
          color: [
            "rgba(101,236,255,0.1)",
            "rgba(101,236,255,0.16)",
            "rgba(138,120,255,0.22)",
            "rgba(244,109,255,0.26)",
          ],
        },
      },
      splitArea: {
        areaStyle: {
          color: [
            "rgba(6,20,54,0.08)",
            "rgba(59,141,255,0.045)",
            "rgba(138,120,255,0.055)",
            "rgba(244,109,255,0.04)",
          ],
        },
      },
    },
    series: [
      {
        name: "用户画像雷达",
        type: "radar",
        symbol: "circle",
        symbolSize: 4,
        data: [
          {
            name: "画像强度",
            value: rows.map((row) => Number(row.value.toFixed(1))),
            lineStyle: {
              width: 2,
              color: colors.cyan,
              shadowColor: colors.cyan,
              shadowBlur: 10,
            },
            areaStyle: {
              color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.75, [
                { offset: 0, color: "rgba(101,236,255,0.3)" },
                { offset: 0.56, color: "rgba(138,120,255,0.18)" },
                { offset: 1, color: "rgba(244,109,255,0.1)" },
              ]),
            },
            itemStyle: {
              color: colors.pink,
              borderColor: "#f5fbff",
              borderWidth: 1,
              shadowBlur: 8,
              shadowColor: "rgba(244,109,255,0.55)",
            },
          },
        ],
      },
    ],
  };
}

function profileMixOptions(q) {
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => `${params.name}<br/>${fmt.format(Math.round(params.value))}`,
    },
    series: [
      {
        name: "新老结构",
        type: "pie",
        radius: ["48%", "74%"],
        center: ["50%", "52%"],
        avoidLabelOverlap: true,
        label: { color: "rgba(237,248,255,0.78)", fontSize: 11, formatter: "{b}\n{d}%" },
        labelLine: { length: 6, length2: 4, lineStyle: { color: "rgba(101,236,255,0.32)" } },
        data: [
          { name: "新用户", value: Math.round(q.newUserDays), itemStyle: { color: colors.violet } },
          { name: "老用户", value: Math.round(q.oldUserDays), itemStyle: { color: colors.cyan } },
        ],
      },
    ],
  };
}

function profileDaysOptions() {
  const rows = ds("opsUserQualitySegments")
    .filter((row) => row["维度"] === "活跃天数" && row["用户类型"] === "全部用户")
    .sort((a, b) => n(a["排序"]) - n(b["排序"]));
  const compactRows = rows.slice(0, 6);
  return {
    tooltip: baseTooltip(),
    grid: { left: 4, right: 10, top: 0, bottom: 0, containLabel: true },
    xAxis: {
      type: "value",
      show: false,
      splitLine: { lineStyle: { color: "rgba(115,190,255,0.08)" } },
      axisLabel: { color: "rgba(213,230,255,0.46)", fontSize: 12 },
    },
    yAxis: {
      type: "category",
      data: compactRows.map((row) => row["分层"].replace("活跃", "")),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "rgba(229,245,255,0.72)", fontSize: 11, lineHeight: 15, margin: 7 },
    },
    series: [
      {
        name: "活跃天数",
        type: "bar",
        data: compactRows.map((row) => n(row["用户数"])),
        barWidth: 6,
        barCategoryGap: "64%",
        itemStyle: {
          borderRadius: [0, 5, 5, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: "rgba(59,141,255,0.18)" },
            { offset: 0.62, color: colors.violet },
            { offset: 1, color: colors.pink },
          ]),
        },
      },
    ],
  };
}

function profileFrequencyOptions() {
  const rows = profileSegmentData("使用次数", 5);
  const compact = (value) => String(value)
    .replace("1次试用", "1次")
    .replace("2-4次轻度", "2-4次")
    .replace("5-9次探索", "5-9次")
    .replace("10-29次高频", "10-29次")
    .replace("30次+重度", "30次+");
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: () => rows.map((row) => `${row.name}<br/>用户 ${fmt.format(row.users)} 人 · 占比 ${fmt1.format(row.share)}%`).join("<br/>"),
    },
    radar: {
      center: ["50%", "55%"],
      radius: "58%",
      splitNumber: 3,
      shape: "polygon",
      indicator: rows.map((row) => ({ name: compact(row.name), max: Math.max(45, Math.ceil(Math.max(...rows.map((item) => item.share), 1) / 10) * 10) })),
      axisName: { color: "rgba(229,245,255,0.76)", fontSize: 10, padding: [1, 2] },
      axisLine: { lineStyle: { color: "rgba(101,236,255,0.18)" } },
      splitLine: { lineStyle: { color: ["rgba(101,236,255,0.12)", "rgba(138,120,255,0.18)", "rgba(244,109,255,0.22)"] } },
      splitArea: { areaStyle: { color: ["rgba(59,141,255,0.05)", "rgba(138,120,255,0.055)", "rgba(244,109,255,0.035)"] } },
    },
    series: [
      {
        name: "使用频次",
        type: "radar",
        symbol: "circle",
        symbolSize: 3,
        data: [{ value: rows.map((row) => row.share), name: "用户占比" }],
        lineStyle: { width: 2, color: colors.mint, shadowBlur: 8, shadowColor: colors.mint },
        areaStyle: {
          color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.8, [
            { offset: 0, color: "rgba(53,242,206,0.28)" },
            { offset: 0.55, color: "rgba(59,141,255,0.16)" },
            { offset: 1, color: "rgba(244,109,255,0.08)" },
          ]),
        },
        itemStyle: {
          color: colors.pink,
          borderColor: "#effcff",
          borderWidth: 1,
        },
      },
    ],
  };
}

function profilePoolOptions(q) {
  const rows = profilePoolData(q);
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => `${params.name}<br/>用户 ${fmt.format(params.data.users)} 人<br/>Token/强度 ${fmt1.format(params.value)}`,
    },
    series: [
      {
        type: "graph",
        layout: "force",
        roam: false,
        draggable: false,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        force: { repulsion: 58, gravity: 0.16, edgeLength: 18 },
        label: {
          show: true,
          color: "#effcff",
          fontSize: 11,
          formatter: (params) => params.name.length > 5 ? `${params.name.slice(0, 5)}…` : params.name,
        },
        data: rows.map((row, index) => ({
          name: row.name,
          value: row.value,
          users: row.users,
          symbolSize: Math.max(28, Math.min(56, 22 + Math.sqrt(Math.max(row.value, 1)) / 12)),
          itemStyle: {
            color: [colors.cyan, colors.violet, colors.pink, colors.blue, colors.mint][index % 5],
            shadowBlur: 16,
            shadowColor: [colors.cyan, colors.violet, colors.pink, colors.blue, colors.mint][index % 5],
          },
        })),
      },
    ],
  };
}

function modelConsumption(q) {
  return `
    <div class="model-suite model-suite-single">
      <div class="model-treemap-cell model-treemap-main model-treemap-all">
        <span>模型消耗占比</span>
        ${chart("model")}
      </div>
    </div>
  `;
}

function modelOptions(q, mode = "major") {
  const models = q.models;
  const palette = ["#65ecff", "#3b8dff", "#5b6dff", "#8a78ff", "#35f2ce", "#f46dff"];
  const localTotal = Math.max(models.reduce((total, item) => total + Math.max(item.tokens, 0), 0), 1);
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => `${params.name}<br/>Token ${fmt1.format(params.data.realValue || 0)} 亿<br/>占比 ${fmt1.format(params.data.share || 0)}%`,
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        left: 6,
        right: 6,
        top: 20,
        bottom: 5,
        squareRatio: 1.22,
        label: {
          color: "#effcff",
          fontSize: 10,
          lineHeight: 12,
          overflow: "truncate",
          width: 70,
          formatter: (params) => `${params.name}\n${fmt1.format(params.data.realValue || 0)} 亿`,
        },
        upperLabel: { show: false },
        itemStyle: {
          borderColor: "rgba(3,12,35,0.96)",
          borderWidth: 2,
          gapWidth: 2,
          borderRadius: 4,
        },
        levels: [
          {
            color: palette,
            colorMappingBy: "value",
            itemStyle: {
              borderColor: "rgba(7,20,52,0.96)",
              borderWidth: 2,
              gapWidth: 2,
              borderRadius: 4,
            },
          },
        ],
        data: models.map((item, index) => {
          const color = palette[index % palette.length];
          const realValue = Number(item.tokens.toFixed(2));
          const localShare = item.tokens / localTotal * 100;
          const showLabel = localShare >= 4.8 && realValue > 0.04;
          return {
            name: item.name,
            value: realValue > 0 ? realValue : 0.04,
            realValue,
            share: q.tokenBillions ? item.tokens / q.tokenBillions * 100 : 0,
            label: {
              show: showLabel,
              formatter: `${item.name}\n${fmt1.format(realValue)} 亿`,
            },
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
                { offset: 0, color: color },
                { offset: 0.58, color: "rgba(59,141,255,0.72)" },
                { offset: 1, color: "rgba(7,18,48,0.92)" },
              ]),
              shadowColor: color,
              shadowBlur: 6,
            },
          };
        }),
      },
    ],
  };
}

function compactChannelLabel(name) {
  const text = String(name || "");
  if (text.length <= 7) return text;
  return `${text.slice(0, 6)}…`;
}

function channelSankeyStats(q) {
  const sourceRows = q.sourceChannels?.length ? q.sourceChannels : q.channels;
  const topChannels = sourceRows.slice(0, 5);
  const otherValue = sourceRows.slice(5).reduce((total, row) => total + (row.deploy || row.value || 0), 0);
  const channels = otherValue > 0
    ? [...topChannels, { name: "其他来源", value: otherValue, deploy: otherValue }]
    : topChannels;
  const deployTotal = Math.max(channels.reduce((total, row) => total + (row.deploy || row.value || 0), 0), 1);
  const d0Total = Math.min(q.deployD0Users || deployTotal * q.deployD0 / 100, deployTotal);
  const retainedTotal = Math.min(q.deployRetain3Count || q.channelRetain3 || d0Total * q.d3 / 100, d0Total);
  const lostTotal = Math.max(d0Total - retainedTotal, 0);
  const pendingTotal = Math.max(deployTotal - d0Total, 0);
  return { channels, deployTotal, d0Total, retainedTotal, lostTotal, pendingTotal };
}

function channelFlow(q) {
  return `
    <div class="sankey-suite">
      ${chart("channelSankey")}
    </div>
  `;
}

function channelSankeyOptions(q) {
  const { channels, d0Total, retainedTotal, lostTotal, pendingTotal } = channelSankeyStats(q);
  const palette = [colors.cyan, colors.blue, colors.violet, colors.purple, colors.mint, colors.red];
  const nodes = [
    ...channels.map((row, index) => ({ name: row.name, itemStyle: { color: palette[index % palette.length] } })),
    { name: "部署用户", itemStyle: { color: colors.blue } },
    { name: "当日使用", itemStyle: { color: colors.cyan } },
    { name: "3天留存", itemStyle: { color: colors.mint } },
    { name: "流失用户", itemStyle: { color: colors.red } },
    { name: "待激活", itemStyle: { color: "rgba(138,120,255,0.72)" } },
  ];
  const links = [
    ...channels.map((row) => ({
      source: row.name,
      target: "部署用户",
      value: Math.max(row.deploy || row.value || 0, 1),
    })),
    { source: "部署用户", target: "当日使用", value: d0Total },
    { source: "部署用户", target: "待激活", value: pendingTotal },
    { source: "当日使用", target: "3天留存", value: retainedTotal },
    { source: "当日使用", target: "流失用户", value: lostTotal },
  ].filter((link) => link.value > 0);
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => {
        if (params.dataType === "edge") return `${params.data.source} → ${params.data.target}<br/>${fmt.format(params.data.value)} 人`;
        return `${params.name}`;
      },
    },
    series: [
      {
        type: "sankey",
        left: 40,
        right: 68,
        top: 14,
        bottom: 14,
        nodeWidth: 12,
        nodeGap: 10,
        nodeAlign: "justify",
        layoutIterations: 64,
        draggable: false,
        emphasis: { focus: "adjacency" },
        lineStyle: { color: "source", curveness: 0.5, opacity: 0.32 },
        label: {
          color: "rgba(238,249,255,0.88)",
          fontSize: 11,
          width: 58,
          distance: 4,
          overflow: "truncate",
          formatter: (params) => compactChannelLabel(params.name),
        },
        data: nodes,
        links,
      },
    ],
  };
}

function conversionOptions(q) {
  const data = conversionSteps(q);
  return {
    tooltip: {
      ...baseTooltip(),
      formatter: (params) => `${params.data.stage} / ${params.name}<br/>${fmt1.format(params.value)}% · ${fmt.format(params.data.count)} 人`,
    },
    series: [
      {
        name: "付费用户转化漏斗",
        type: "funnel",
        orient: "horizontal",
        left: 6,
        right: 6,
        top: 6,
        bottom: 6,
        min: 0,
        max: 100,
        minSize: "18%",
        maxSize: "96%",
        sort: "none",
        gap: 2,
        data: data.map((row, index) => ({
          ...row,
          itemStyle: {
            color: [
              colors.cyan,
              colors.blue,
              colors.violet,
              colors.pink,
              colors.mint,
            ][index % 5],
            borderColor: "rgba(5,15,39,0.92)",
            borderWidth: 1,
            shadowBlur: 10,
            shadowColor: "rgba(101,236,255,0.18)",
          },
        })),
        label: {
          show: true,
          position: "inside",
          color: "#effcff",
          fontSize: 11,
          formatter: (params) => `${params.name}\n${fmt1.format(params.value)}%`,
        },
      },
    ],
  };
}

function askResponse(question, q) {
  const text = String(question || "").toLowerCase();
  const topModel = q.models[0] || { name: "主力模型", tokens: 0 };
  const peak = q.rows.reduce((best, row) => (row.tokenBillions > best.tokenBillions ? row : best), q.rows[0] || {});
  if (text.includes("模型") || text.includes("token") || text.includes("消耗")) {
    return `【Wenty-test 模拟分析】${topModel.name} 的累计 Token 消耗贡献最高，约 ${fmt1.format(topModel.tokens)} 亿；周期内 Token 峰值出现在 ${peak.date}，单日约 ${fmt1.format(peak.tokenBillions)} 亿。`;
  }
  if (text.includes("留存") || text.includes("转化")) {
    return `【Wenty-test 模拟分析】周期内加权 3天留存约 ${percent(q.d3)}，7天留存约 ${percent(q.d7)}。已部署实例向首次活跃转化的 D0 率达 ${percent(q.deployD0)}。`;
  }
  if (text.includes("用户") || text.includes("画像")) {
    return `【Wenty-test 模拟分析】周期活跃用户总规模约 ${fmt.format(Math.round(q.activeUserDays))} 人次，老用户占比约 ${percent(q.oldShare)}，单日高频使用用户约 ${fmt.format(q.highFreqUsers)} 人。`;
  }
  return `【Wenty-test 模拟分析】已按模拟数据集生成快照概览：周期累计交互 ${fmt.format(Math.round(q.useCount))} 次，消耗 Token ${fmt1.format(q.tokenBillions)} 亿，累计部署实例 ${fmt.format(Math.round(q.allDeployUsers))} 个。`;
}

function compactNumber(value, digits = 1) {
  const number = n(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : 0;
}

function askSnapshot(q) {
  const tokenPeak = q.rows.reduce((best, row) => (row.tokenBillions > best.tokenBillions ? row : best), q.rows[0] || {});
  return {
    product: "Wenty-test",
    page: "ops-bigscreen",
    dateRange: {
      start: q.dateRange?.[0],
      end: q.dateRange?.[1],
    },
    dataSource: {
      mode: dataSourceState.mode,
      cacheStatus: dataSourceState.cacheStatus,
      servedAt: dataSourceState.servedAt,
    },
    metrics: {
      cumulativeDeployClaws: Math.round(q.allDeployUsers),
      currentRangeDeployUsers: Math.round(q.deployUsers),
      activeUserDays: Math.round(q.activeUserDays),
      avgDailyActive: Math.round(q.avgDailyActive),
      useCount: Math.round(q.useCount),
      tokenBillions: compactNumber(q.tokenBillions),
      avgDailyTokenBillions: compactNumber(q.avgDailyTokenBillions),
      newUserDays: Math.round(q.newUserDays),
      oldUserDays: Math.round(q.oldUserDays),
      oldUserSharePct: compactNumber(q.oldShare),
      deployD0Pct: compactNumber(q.deployD0),
      paidUsers: Math.round(q.paidUsers),
      revenueYuan: Math.round(q.revenue),
      d1RetentionPct: compactNumber(q.d1),
      d3RetentionPct: compactNumber(q.d3),
      d7RetentionPct: compactNumber(q.d7),
      highFrequencyUsers: Math.round(q.highFreqUsers),
      multiSessionUsers: Math.round(q.multiSessionUsers),
      deployRetain3Count: Math.round(q.deployRetain3Count),
      qualityScore: q.score,
      teamModeNote: "Team 模式为新功能，当前大屏周报已作为观察项提示，待独立埋点补齐后再量化趋势。",
    },
    peak: {
      tokenDate: tokenPeak.date,
      tokenBillions: compactNumber(tokenPeak.tokenBillions),
    },
    topModels: q.models.slice(0, 4).map((row) => ({
      model: row.name,
      tokenBillions: compactNumber(row.tokens),
    })),
    topScenes: q.scenes.slice(0, 4).map((row) => ({
      scene: row.name,
      messageCount: Math.round(row.value),
    })),
    sourceChannels: q.sourceChannels.slice(0, 4).map((row) => ({
      channel: row.name,
      deployUsers: Math.round(row.deploy || row.value),
      sourceType: row.sourceType,
    })),
    tokenSegments: q.tokenPool.slice(0, 3).map((row) => ({
      segment: row.name,
      users: Math.round(row.users),
      tokenWan: Math.round(row.value),
    })),
    recentDaily: q.rows.slice(-10).map((row) => ({
      date: row.date,
      activeUsers: Math.round(row.activeUsers),
      useCount: Math.round(row.useCount),
      deployUsers: Math.round(row.deployUsers),
      newUsers: Math.round(row.newUsers),
      oldUsers: Math.round(row.oldUsers),
      tokenBillions: compactNumber(row.tokenBillions),
      highFrequencyUsers: Math.round(row.highFreqUsers),
      multiSessionUsers: Math.round(row.multiSessionUsers),
    })),
  };
}

function aiSummaryApiUrls() {
  const origins = [];
  if (location.protocol === "http:" || location.protocol === "https:") origins.push(location.origin);
  origins.push(...localApiOrigins);
  return [...new Set(origins)].map((origin) => new URL("/api/ai-summary", origin).toString());
}

function formatAiSummary(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.、]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("\n");
}

async function requestAskSummary(question, q) {
  const body = JSON.stringify({
    question: question || "请分析当前 Wenty-test 运营数据。",
    snapshot: askSnapshot(q),
  });
  const errors = [];
  for (const url of aiSummaryApiUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.summary || payload.error || `HTTP ${response.status}`);
      }
      const summary = formatAiSummary(payload.summary);
      if (!summary) throw new Error("模型未返回可展示内容");
      return {
        summary,
        model: payload.model || "deepseek-v4-pro",
      };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors[errors.length - 1] || "ai-summary-unavailable");
}

function initAsk(q) {
  const input = document.getElementById("askInput");
  const answer = document.getElementById("askAnswer");
  const button = document.getElementById("askButton");
  if (!input || !answer || !button) return;
  let requestId = 0;
  const setBusy = (busy) => {
    button.disabled = busy;
    input.disabled = busy;
    button.textContent = busy ? "分析中" : "问数";
    answer.classList.toggle("is-loading", busy);
  };
  const render = async () => {
    const question = input.value.trim();
    const currentRequestId = requestId + 1;
    requestId = currentRequestId;
    setBusy(true);
    answer.textContent = "正在调用 deepseekv4pro 识别自然语言问题，并基于当前页面数据生成分析...";
    try {
      const result = await requestAskSummary(question, q);
      if (currentRequestId !== requestId) return;
      answer.textContent = result.summary;
      answer.title = `AI 实时分析 · ${result.model}`;
    } catch (error) {
      if (currentRequestId !== requestId) return;
      answer.textContent = `${askResponse(question, q)}\n\n(注：本问答基于 Wenty-test 本地模拟指标快照生成)`;
      answer.title = error.message || "ai-summary-unavailable";
    } finally {
      if (currentRequestId === requestId) setBusy(false);
    }
  };
  button.addEventListener("click", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") render();
  });
  document.querySelectorAll(".ask-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.textContent;
      render();
    });
  });
}

function renderCharts(q) {
  const animate = animateNextCharts;
  animateNextCharts = false;
  charts.splice(0).forEach((chart) => chart.dispose());
  document.querySelectorAll("[data-chart]").forEach((el) => {
    const chart = chartBase(el);
    if (chart) chart.setOption(withChartMotion(chartOptions(el.dataset.chart, q), animate), true);
  });
}

function renderDashboard(q) {
  const stage = document.getElementById("versionStage");
  stage.innerHTML = layoutHtml(q);
  renderCharts(q);
  initAsk(q);
  updateSourceChrome();
  window.__bigscreenReady = true;
}

function normalizeRange(start, end) {
  const clamp = (value) => {
    const fallback = value || defaultRange[0];
    if (fallback < selectableRange[0]) return selectableRange[0];
    if (fallback > selectableRange[1]) return selectableRange[1];
    return fallback;
  };
  const safeStart = clamp(start || defaultRange[0]);
  const safeEnd = clamp(end || defaultRange[1]);
  return safeStart <= safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];
}

function dashboardApiUrl(range, options = {}, origin = location.origin) {
  const url = new URL("/api/dashboard-data", origin);
  const useServerDefault = options.useServerDefault || range == null;
  if (!useServerDefault) {
    if (!validDateRange(range)) throw new Error("invalid date range");
    url.searchParams.set("start", range[0]);
    url.searchParams.set("end", range[1]);
  }
  url.searchParams.set("view", "bigscreen");
  if (options.refresh) url.searchParams.set("refresh", "1");
  if (options.wait) url.searchParams.set("wait", "1");
  return url.toString();
}

function dashboardApiUrls(range, options = {}) {
  const origins = [];
  if (location.protocol === "http:" || location.protocol === "https:") origins.push(location.origin);
  origins.push(...localApiOrigins);
  return [...new Set(origins)].map((origin) => dashboardApiUrl(range, options, origin));
}

async function fetchDashboardPayload(range, options = {}) {
  if (!canUseDashboardApi()) throw new Error("api-unavailable");
  const errors = [];
  for (const url of dashboardApiUrls(range, options)) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload?.datasets) throw new Error("invalid dashboard payload");
      return payload;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors[errors.length - 1] || "api-unavailable");
}

function weeklyReportApiUrl(range, origin = location.origin) {
  const url = new URL("/api/weekly-report", origin);
  url.searchParams.set("start", range[0]);
  url.searchParams.set("end", range[1]);
  return url.toString();
}

function weeklyReportApiUrls(range) {
  const origins = [];
  if (location.protocol === "http:" || location.protocol === "https:") origins.push(location.origin);
  origins.push(...localApiOrigins);
  return [...new Set(origins)].map((origin) => weeklyReportApiUrl(range, origin));
}

const weeklyReportMemoryCache = new Map();

async function fetchWeeklyReportPayload(range, options = {}) {
  if (!canUseDashboardApi()) throw new Error("api-unavailable");
  const cacheKey = `${range[0]}:${range[1]}`;
  if (!options.force && weeklyReportMemoryCache.has(cacheKey)) {
    return weeklyReportMemoryCache.get(cacheKey);
  }
  const errors = [];
  for (const url of weeklyReportApiUrls(range)) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || typeof payload.text !== "string") throw new Error("invalid weekly report payload");
      if (payload.status === "ok") weeklyReportMemoryCache.set(cacheKey, payload);
      return payload;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors[errors.length - 1] || "api-unavailable");
}

async function loadDashboardPayload(range, options = {}) {
  try {
    const payload = await fetchDashboardPayload(range, options);
    if (!setDashboardPayload(payload, { mode: "实时数据" })) throw new Error("invalid dashboard payload");
    return true;
  } catch (error) {
    dataSourceState = {
      ...dataSourceState,
      mode: "静态快照",
      error: error.message || "api-unavailable",
    };
    updateSourceChrome();
    return false;
  }
}

let refreshPollTimer = null;
let periodApplyTimer = null;
let weeklyReportPollTimer = null;
let rangeRequestId = 0;

function setPeriodLoading(loading) {
  const button = document.getElementById("periodApply");
  const stage = document.getElementById("versionStage");
  if (button) {
    button.disabled = Boolean(loading);
    button.textContent = loading ? "加载中" : "应用";
    button.title = loading ? "正在拉取所选时间段数据" : "应用所选时间段";
  }
  if (stage) stage.classList.toggle("is-range-loading", Boolean(loading));
}

function scheduleRefreshPoll(range) {
  window.clearTimeout(refreshPollTimer);
  if (!raw.source?.refreshing) return;
  refreshPollTimer = window.setTimeout(async () => {
    const loaded = await loadDashboardPayload(range, { refresh: false });
    if (loaded) {
      renderDashboard(quality(currentRange));
      scheduleRefreshPoll(range);
    }
  }, 3500);
}

function syncPeriodInputs() {
  const startInput = document.getElementById("periodStart");
  const endInput = document.getElementById("periodEnd");
  if (!startInput || !endInput) return;
  startInput.min = selectableRange[0];
  startInput.max = selectableRange[1];
  endInput.min = selectableRange[0];
  endInput.max = selectableRange[1];
  startInput.value = currentRange[0];
  endInput.value = currentRange[1];
  startInput.title = `最早可选日期：${selectableRange[0]}`;
  endInput.title = `最晚可选日期：${selectableRange[1]}`;
}

function clampDateInputValue(value) {
  const fallback = value || selectableRange[0];
  if (fallback < selectableRange[0]) return selectableRange[0];
  if (fallback > selectableRange[1]) return selectableRange[1];
  return fallback;
}

function syncPeriodBoundsFromInputs(event) {
  const startInput = document.getElementById("periodStart");
  const endInput = document.getElementById("periodEnd");
  if (!startInput || !endInput) return;
  let start = clampDateInputValue(startInput.value);
  let end = clampDateInputValue(endInput.value);
  if (start > end) {
    if (event?.target?.id === "periodStart") end = start;
    else start = end;
  }
  startInput.value = start;
  endInput.value = end;
}

async function applyRange(range, options = { refresh: false }) {
  const previousRange = [...currentRange];
  currentRange = normalizeRange(range[0], range[1]);
  syncPeriodInputs();
  const requestId = ++rangeRequestId;
  dataSourceState = {
    ...dataSourceState,
    mode: "数据加载中",
    cacheStatus: "loading",
    error: "",
  };
  updateSourceChrome();
  animateNextCharts = true;
  const requestedRange = [...currentRange];
  setPeriodLoading(true);
  let loaded = false;
  try {
    loaded = await loadDashboardPayload(requestedRange, options);
  } finally {
    if (requestId === rangeRequestId) setPeriodLoading(false);
  }
  if (requestId !== rangeRequestId) return;
  if (loaded && currentRange[0] === requestedRange[0] && currentRange[1] === requestedRange[1]) {
    renderDashboard(quality(currentRange));
    syncPeriodInputs();
    scheduleRefreshPoll(currentRange);
  } else if (!loaded) {
    currentRange = previousRange;
    syncPeriodInputs();
    updateSourceChrome();
  }
}

function queueRangeApply(options = { refresh: false }) {
  const startInput = document.getElementById("periodStart");
  const endInput = document.getElementById("periodEnd");
  if (!startInput || !endInput) return;
  if (!validDateRange([startInput.value, endInput.value])) return;
  window.clearTimeout(periodApplyTimer);
  periodApplyTimer = window.setTimeout(() => {
    applyRange([startInput.value, endInput.value], options);
  }, 260);
}

function applyPeriodInputs(options = { refresh: false }) {
  const startInput = document.getElementById("periodStart");
  const endInput = document.getElementById("periodEnd");
  if (!startInput || !endInput) return;
  window.clearTimeout(periodApplyTimer);
  applyRange([startInput.value, endInput.value], options);
}

function initPeriodControls() {
  const startInput = document.getElementById("periodStart");
  const endInput = document.getElementById("periodEnd");
  const button = document.getElementById("periodApply");
  if (!startInput || !endInput || !button) return;
  syncPeriodInputs();
  const handleDateEdit = (event) => {
    syncPeriodBoundsFromInputs(event);
    queueRangeApply({ refresh: false });
  };
  const handleDateInput = () => {
    queueRangeApply({ refresh: false });
  };
  button.addEventListener("click", () => applyPeriodInputs({ refresh: false }));
  startInput.addEventListener("change", handleDateEdit);
  endInput.addEventListener("change", handleDateEdit);
  startInput.addEventListener("input", handleDateInput);
  endInput.addEventListener("input", handleDateInput);
  startInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyPeriodInputs({ refresh: false });
  });
  endInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyPeriodInputs({ refresh: false });
  });
}

function dateKey(value) {
  return String(value || "").trim().slice(0, 10);
}

function dateFromYmd(value) {
  const [year, month, date] = dateKey(value).split("-").map(Number);
  return new Date(year, month - 1, date);
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function addDaysYmd(value, amount) {
  const date = dateFromYmd(value);
  date.setDate(date.getDate() + amount);
  return ymd(date);
}

function previousNaturalWeekRange(reference = new Date()) {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  const currentMonday = new Date(date);
  currentMonday.setDate(date.getDate() - mondayOffset);
  const start = new Date(currentMonday);
  start.setDate(currentMonday.getDate() - 7);
  const end = new Date(currentMonday);
  end.setDate(currentMonday.getDate() - 1);
  return [ymd(start), ymd(end)];
}

function shiftRange(range, days) {
  return [addDaysYmd(range[0], days), addDaysYmd(range[1], days)];
}

function zhDate(value) {
  const date = dateFromYmd(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function zhWeekRange(range) {
  return `${zhDate(range[0])}-${zhDate(range[1])}`;
}

function payloadRows(payload, key) {
  return payload?.datasets?.[key]?.rows || [];
}

function payloadDateSpan(payload) {
  const dates = [];
  Object.values(payload?.datasets || {}).forEach((dataset) => {
    (dataset?.rows || []).forEach((row) => {
      const value = dateKey(row["日期"] || row.dt || row.ts_day);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) dates.push(value);
    });
  });
  dates.sort();
  return [dates[0] || "", dates[dates.length - 1] || ""];
}

function payloadCoversWeek(payload, range) {
  const [start, end] = payloadDateSpan(payload);
  return start <= range[0] && end >= range[1];
}

function payloadHasExactAggregates(payload, range) {
  const sourceRange = payload?.source?.dateRange;
  return Array.isArray(sourceRange)
    && sourceRange[0] === range[0]
    && sourceRange[1] === range[1]
    && !["range-fallback", "cached-slice", "cached-segments", "segmented-redash"].includes(payload?.source?.cacheStatus);
}

function lifetimeDeployForPayload(payload) {
  const row = payloadRows(payload, "lifetimeDeployTotal")[0] || {};
  return n(row["累计部署实例数"] ?? row["累计部署Claw数"] ?? row["累计部署 Claw 数"] ?? row["累计部署数"] ?? row["累计部署用户数"]);
}

function funnelValue(payload, type) {
  const row = payloadRows(payload, "overallFunnel").find((item) => item.type === type);
  return n(row?.["人数"]);
}

function isWorkdayYmd(value) {
  const dayOfWeek = dateFromYmd(value).getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function weeklyMetrics(payload, range) {
  const tokenByDay = new Map(payloadRows(payload, "tokenDaily").map((row) => [dateKey(row.dt), row]));
  const daily = payloadRows(payload, "opsDailyQuality")
    .map((row) => {
      const date = dateKey(row["日期"]);
      const tokenRow = tokenByDay.get(date) || {};
      return {
        date,
        activeUsers: n(row["使用人数"]),
        useCount: n(row["使用次数"]),
        newUsers: n(row["新用户数"]),
        oldUsers: n(row["老用户数"]),
        deployCount: n(row["部署数"]) || n(row["部署人数"]),
        tokenBillions: n(tokenRow["消耗Tokens(亿)"]),
        highFreqUsers: n(row["单日10次+用户"]),
        multiSessionUsers: n(row["多Session用户"]),
      };
    })
    .filter((row) => row.date >= range[0] && row.date <= range[1])
    .sort((a, b) => a.date.localeCompare(b.date));
  const workdays = daily.filter((row) => isWorkdayYmd(row.date));
  const deployCount = daily.reduce((total, row) => total + row.deployCount, 0);
  const tokenBillions = daily.reduce((total, row) => total + row.tokenBillions, 0);
  const workdayDau = workdays.reduce((total, row) => total + row.activeUsers, 0) / Math.max(workdays.length, 1);
  return {
    range,
    daily,
    deployCount,
    workdayDau,
    wau: funnelValue(payload, "使用人数"),
    active2Days: funnelValue(payload, "留存（使用2+天）"),
    tokenBillions,
    highFreqUsers: daily.reduce((total, row) => total + row.highFreqUsers, 0),
    multiSessionUsers: daily.reduce((total, row) => total + row.multiSessionUsers, 0),
    lifetimeDeploy: lifetimeDeployForPayload(payload),
  };
}

function resolveWeeklyLifetimeDeploy(current, previous, range, previousRange) {
  if (current.lifetimeDeploy) return current.lifetimeDeploy;
  if (previous?.lifetimeDeploy && addDaysYmd(previousRange[1], 1) === range[0]) {
    return previous.lifetimeDeploy + current.deployCount;
  }
  const sourceRange = raw.source?.dateRange;
  const fallbackLifetime = payloadLifetimeDeployClaws(raw);
  if (fallbackLifetime && Array.isArray(sourceRange) && sourceRange[1] === addDaysYmd(range[0], -1)) {
    return fallbackLifetime + current.deployCount;
  }
  return 0;
}

function wowValue(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function wowText(current, previous) {
  const value = wowValue(current, previous);
  if (value === null) return "环比暂无";
  if (Math.abs(value) < 0.05) return "环比持平";
  return `环比${value > 0 ? "增长" : "下降"}${reportPct.format(Math.abs(value))}%`;
}

function rateText(value) {
  return Number.isFinite(value) && value > 0 ? `${reportPct.format(value)}%` : "暂无";
}

function integerText(value) {
  return Number.isFinite(value) && value > 0 ? fmt.format(Math.round(value)) : "暂无";
}

function buildWeeklyFindings(current, previous) {
  const items = [];
  if (previous) {
    const deployWow = wowValue(current.deployCount, previous.deployCount);
    const wauWow = wowValue(current.wau, previous.wau);
    const tokenWow = wowValue(current.tokenBillions, previous.tokenBillions);
    const active2Wow = wowValue(current.active2Days, previous.active2Days);

    if ((deployWow || 0) > 0 && (wauWow || 0) > 0) {
      items.push(`部署和活跃同步修复：新增部署${wowText(current.deployCount, previous.deployCount)}，周活${wowText(current.wau, previous.wau)}，规模侧较前一周明显回升。`);
    } else if ((wauWow || 0) < 0) {
      items.push(`活跃规模仍在承压：周活${wowText(current.wau, previous.wau)}，需要继续关注新增供给、入口曝光和老用户回访。`);
    } else {
      items.push(`活跃规模基本稳定：周活${wowText(current.wau, previous.wau)}，新增部署${wowText(current.deployCount, previous.deployCount)}。`);
    }

    if ((tokenWow || 0) < 0 && (wauWow || 0) > 0) {
      items.push(`Token 消耗与活跃方向分化：Token ${wowText(current.tokenBillions, previous.tokenBillions)}但周活回升，说明本周更多使用集中在轻量场景，深度任务承接仍需提升。`);
    } else if ((tokenWow || 0) > 0) {
      items.push(`Token 消耗随使用规模增长，后续需同步观察高消耗模型、重度用户和成本效率。`);
    } else {
      items.push(`Token 消耗变化不大，建议继续按模型和场景拆分观察成本效率。`);
    }

    if (active2Wow !== null && active2Wow > 0) {
      items.push(`2天及以上活跃用户${wowText(current.active2Days, previous.active2Days)}，留下来的用户质量改善，可继续强化高频场景案例和复用引导。`);
    } else {
      items.push(`2天及以上活跃用户改善有限，建议把首用后的二次触达和可复用模板作为下周重点。`);
    }
  } else {
    items.push("本周报已按上个自然周生成，环比数据暂未取到，建议优先看部署、活跃和 Token 三项趋势。");
    items.push("用户质量建议继续围绕 2天及以上活跃、高频使用和多 Session 用户做复用引导。");
  }
  items.push("Team 模式作为新功能已出现使用，建议后续补充独立埋点，持续观察协作场景留存与任务完成质量。");
  return items.slice(0, 4);
}

function buildWeeklyReportText(currentPayload, previousPayload, range, previousRange) {
  const current = weeklyMetrics(currentPayload, range);
  const previous = previousPayload ? weeklyMetrics(previousPayload, previousRange) : null;
  const lifetimeDeploy = resolveWeeklyLifetimeDeploy(current, previous, range, previousRange);
  const dauRate = lifetimeDeploy ? (current.workdayDau / lifetimeDeploy) * 100 : 0;
  const wauRate = lifetimeDeploy ? (current.wau / lifetimeDeploy) * 100 : 0;
  const findings = buildWeeklyFindings(current, previous);
  const lines = [
    "#Wenty-test 每周活跃数据 (模拟)：",
    zhWeekRange(range),
    "👉 累计部署",
    ` ${integerText(lifetimeDeploy)}个，上周新增部署 ${integerText(current.deployCount)}个（${previous ? wowText(current.deployCount, previous.deployCount) : "环比暂无"}）`,
    "",
    "👉 用户活跃",
    `- 工作日日活 ${integerText(current.workdayDau)} 人（${previous ? wowText(current.workdayDau, previous.workdayDau) : "环比暂无"}），日活跃率 ${rateText(dauRate)}`,
    `- 周活用户 ${integerText(current.wau)} 人（${previous ? wowText(current.wau, previous.wau) : "环比暂无"}），周活跃率 ${rateText(wauRate)}`,
    "",
    "👉 Token 消耗",
    `${fmt1.format(current.tokenBillions)}亿（${previous ? wowText(current.tokenBillions, previous.tokenBillions) : "环比暂无"}）`,
    "",
    "#关注信息：",
    ...findings.map((item, index) => `${index + 1}、${item}`),
  ];
  return {
    text: lines.join("\n"),
    current,
    previous,
    lifetimeDeploy,
  };
}

function setWeeklyReportMessage(message, rangeText = "生成中") {
  const range = document.getElementById("weeklyReportRange");
  const content = document.getElementById("weeklyReportContent");
  if (range) range.textContent = rangeText;
  if (content) content.textContent = message;
}

async function renderWeeklyReport(options = {}) {
  const range = previousNaturalWeekRange();
  window.clearTimeout(weeklyReportPollTimer);
  setWeeklyReportMessage("正在读取上个自然周报...", `${range[0]} 至 ${range[1]}`);
  try {
    const payload = await fetchWeeklyReportPayload(range, options);
    const reportRange = Array.isArray(payload.range) && payload.range.length === 2 ? payload.range : range;
    if (payload.refreshing || payload.status === "running") {
      setWeeklyReportMessage(payload.text || "周报缓存正在生成，请稍后刷新。", `${reportRange[0]} 至 ${reportRange[1]} · 生成中`);
      weeklyReportPollTimer = window.setTimeout(() => renderWeeklyReport({ force: true }), 2500);
      return;
    }
    const statusLabel = payload.status === "ok" ? "周报缓存" : "周报生成中";
    const generatedLabel = payload.generatedAt ? ` · 生成于 ${payload.generatedAt.slice(0, 16).replace("T", " ")}` : "";
    setWeeklyReportMessage(payload.text, `${reportRange[0]} 至 ${reportRange[1]} · ${statusLabel}${generatedLabel}`);
  } catch (error) {
    try {
      const bounds = selectableDateBounds(raw);
      const reportWeek = bounds && bounds[1] ? previousNaturalWeekRange(new Date(`${bounds[1]}T00:00:00`)) : range;
      const prevWeek = shiftRange(reportWeek, -7);
      const generated = buildWeeklyReportText(raw, raw, reportWeek, prevWeek);
      setWeeklyReportMessage(generated.text, `${reportWeek[0]} 至 ${reportWeek[1]} · 模拟数据周报已生成`);
    } catch (fallbackErr) {
      setWeeklyReportMessage(`周报生成提示：${fallbackErr.message || "使用模拟快照中"}`, `${range[0]} 至 ${range[1]} · 模拟数据`);
    }
  }
}

function initWeeklyReportPanel() {
  const button = document.getElementById("weeklyReportButton");
  const overlay = document.getElementById("weeklyReportOverlay");
  const close = document.getElementById("weeklyReportClose");
  const copy = document.getElementById("weeklyReportCopy");
  const content = document.getElementById("weeklyReportContent");
  if (!button || !overlay || !close || !copy || !content) return;

  const open = () => {
    overlay.hidden = false;
    close.focus();
    renderWeeklyReport();
  };
  const hide = () => {
    window.clearTimeout(weeklyReportPollTimer);
    overlay.hidden = true;
    button.focus();
  };

  button.addEventListener("click", open);
  close.addEventListener("click", hide);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hide();
  });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(content.textContent || "");
      copy.textContent = "已复制";
    } catch (error) {
      copy.textContent = "复制失败";
    }
    window.setTimeout(() => {
      copy.textContent = "复制";
    }, 1200);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) hide();
  });
}

function initMethodPanel() {
  const button = document.getElementById("methodButton");
  const overlay = document.getElementById("methodOverlay");
  const close = document.getElementById("methodClose");
  if (!button || !overlay || !close) return;

  const open = () => {
    overlay.hidden = false;
    close.focus();
  };
  const hide = () => {
    overlay.hidden = true;
    button.focus();
  };

  button.addEventListener("click", open);
  close.addEventListener("click", hide);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) hide();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) hide();
  });
}

async function boot() {
  captureStickyMetrics(raw, true);
  updateSelectableRange(raw);
  currentRange = normalizeRange(currentRange[0], currentRange[1]);
  initMethodPanel();
  initWeeklyReportPanel();
  initPeriodControls();
  renderDashboard(quality(currentRange));
  const loaded = await loadDashboardPayload(null, { refresh: false, useServerDefault: true });
  if (loaded) {
    captureStickyMetrics(raw);
    currentRange = normalizeRange(defaultRange[0], defaultRange[1]);
    syncPeriodInputs();
    animateNextCharts = true;
    renderDashboard(quality(currentRange));
    scheduleRefreshPoll(currentRange);
  }
}

boot();

window.addEventListener("resize", () => {
  charts.forEach((chart) => chart.resize());
});
