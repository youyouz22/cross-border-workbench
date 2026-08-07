/* ============================================================
   跨境电商工作台 · 复刻版 逻辑
   纯原生 JS · 数据存于浏览器 localStorage · 支持导入/导出
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const newsOrigView = new Set(); // 保留兼容（已不再使用）
  const LS = {
    tasks: "cbec_tasks",
    docs: "cbec_docs",
    news: "cbec_news",
    origin: "cbec_origin",
    product: "cbec_product",
    productHidden: "cbec_product_hidden",
    tools: "cbec_tools",
    notify: "cbec_notify",
    settings: "cbec_settings",
  };

  const uid = () => Math.random().toString(36).slice(2, 9);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    refreshSync();
    scheduleAutoSync();
  }

  /* ---------------- 种子数据（离线兜底 / 原创示例内容） ---------------- */
  function seedNews() {
    return [
      { id: uid(), topic: "全球跨境电商", impact: "中影响", title: "（示例）全球跨境电商持续扩张，新兴市场成增长引擎",
        body: "这是离线示例数据。联网后点「刷新新闻」会拉取真实 RSS 头条。",
        tags: ["跨境电商", "示例"], source: "示例", url: "", time: "示例" },
      { id: uid(), topic: "政策与税务", impact: "高影响", title: "（示例）欧盟电商新规落地，VAT 合规要求升级",
        body: "这是离线示例数据。联网后点「刷新新闻」会拉取真实 RSS 头条。",
        tags: ["政策", "VAT", "示例"], source: "示例", url: "", time: "示例" },
    ];
  }

  const NEWS_CACHE_VERSION = 3; // 缓存数据结构升级时递增，自动清掉旧本地数据
  const ORIGIN_NEWS_URL = "./data/origin-news.json"; // 原站跨境政策快讯快照（同事站点的 news.json）
  const ORIGIN_RSS_ZH_URL = "./data/cross-border-news-zh.json"; // 预翻译好的中文跨境资讯（左列，无运行时翻译）
  // 实时拉取源：每次打开都从 GitHub 仓库拉最新新闻 JSON 并覆盖本地缓存（参考站做法）
  const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/youyouz22/cross-border-workbench/main";
  /* 原站产品数据结构（来自同事站点的 products.json），这里做兜底种子 */
  function seedProduct() {
    return [
      { id: uid(), title: "欧规智能取暖器 恒温节能 远红外", platform: "fastmoss", category: "家居电器",
        price: "39.99 USD", alibabaPrice: 28, salesGrowth: 320, rating: 4.5, reviewCount: 5200,
        pros: ["开机即热", "恒温节能省电"], cons: ["功率偏小适用小空间"], trending: true },
      { id: uid(), title: "USB暖手宝 三档便携充电", platform: "tiktok", category: "电子配件",
        price: "14.99 USD", alibabaPrice: 9, salesGrowth: 447, rating: 4.4, reviewCount: 12400,
        pros: ["三档控温", "Type-C快充"], cons: ["续航偏短"], trending: true },
      { id: uid(), title: "大容量智能空气炸锅", platform: "amazon", category: "厨房电器",
        price: "79.99 USD", alibabaPrice: 52, salesGrowth: 130, rating: 4.7, reviewCount: 25200,
        pros: ["无油健康", "大容量"], cons: ["噪音偏大"], trending: true },
    ];
  }
  /* 从站点自带的原站数据文件加载真实商品（参考同事站点 products.json）
     每次启动都同步：把原站 30 个商品 prepend 到列表前面；已存在的（按标题去重）不再重复添加，
     用户自己添加的商品保留在末尾。 */
  async function loadOriginProducts() {
    try {
      const r = await fetch("./data/origin-products.json");
      if (!r.ok) return false;
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) return false;
      const mapped = arr.map((p) => ({
        id: p.id != null ? String(p.id) : uid(),
        title: p.name || p.title || "未命名商品",
        platform: p.platform || "",
        category: p.category || "",
        price: (p.price != null ? p.price : "") + (p.currency ? " " + p.currency : ""),
        alibabaPrice: p.alibabaPrice != null ? p.alibabaPrice : "",
        salesGrowth: p.salesGrowth != null ? p.salesGrowth : "",
        rating: p.rating != null ? p.rating : "",
        reviewCount: p.reviewCount != null ? p.reviewCount : "",
        pros: p.pros || [],
        cons: p.cons || [],
        trending: !!p.trending,
        note: p.note || "",
        url: p.url || "",
      }));
      const hidden = new Set((read(LS.productHidden, []) || []).map(String));
      const existing = read(LS.product, []);
      const existingTitles = new Set(existing.map((p) => (p.title || "").toLowerCase().trim()));
      const missing = mapped.filter((p) => !hidden.has(String(p.id)) && !existingTitles.has((p.title || "").toLowerCase().trim()));
      if (missing.length) write(LS.product, [...missing, ...existing]);
      return true;
    } catch (e) { /* 离线或文件缺失时回退示例 */ }
    return false;
  }
  /* 商品跳转链接：原站未给外链，按名称生成 1688 采购搜索；用户自建商品用其填写的链接 */
  function productUrl(p) {
    if (p.url) return p.url;
    if (p.title) return "https://s.1688.com/selloffer/offer_search.htm?keywords=" + encodeURIComponent(p.title);
    return "";
  }
  function seedTools() {
    return [
      { icon: "🛒", title: "Amazon Seller Central", desc: "亚马逊卖家后台", url: "https://sellercentral.amazon.com" },
      { icon: "📦", title: "4PX 递四方", desc: "跨境物流与海外仓", url: "https://www.4px.com" },
      { icon: "🔍", title: "Google Trends", desc: "关键词趋势与选品洞察", url: "https://trends.google.com" },
      { icon: "📊", title: "Similarweb", desc: "竞品流量与渠道分析", url: "https://www.similarweb.com" },
      { icon: "💱", title: "XE Currency", desc: "实时汇率换算", url: "https://www.xe.com" },
      { icon: "✉️", title: "Mailchimp", desc: "邮件营销与再营销", url: "https://mailchimp.com" },
      { icon: "🎨", title: "Canva", desc: "主图与素材设计", url: "https://www.canva.com" },
      { icon: "🗂️", title: "飞书", desc: "协作文档与表格", url: "https://www.feishu.cn" },
    ];
  }

  /* ---------------- 工具函数 ---------------- */
  function impactTag(i) {
    if (i === "高影响") return '<span class="tag red">高影响</span>';
    if (i === "中影响") return '<span class="tag amber">中影响</span>';
    return '<span class="tag blue">低影响</span>';
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function fmtDate() {
    const d = new Date();
    const wk = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][d.getDay()];
    return `今天是${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日，${wk}`;
  }
  function refreshSync() {
    const dot = $("#syncDot"), txt = $("#syncText");
    if (dot && txt) { dot.classList.remove("off"); txt.textContent = "已存本机（设置里可导出备份）"; }
  }
  function setSyncStatus(text, ok) {
    const line = $("#syncStatusLine"); if (line) line.textContent = text;
    const dot = $("#syncDot"), txt = $("#syncText");
    if (dot && txt) {
      if (ok) { dot.classList.remove("off"); txt.textContent = "已同步云端（多设备共享）"; }
      else { dot.classList.add("off"); txt.textContent = text || "同步未连接"; }
    }
  }

  /* ---------------- 云端同步（git-as-backend：GitHub / Gitee） ---------------- */
  const SYNC = { enabled: false, backend: "github", repo: "", branch: "main", path: "data/workbench.json", token: "", giteeToken: "", proxy: "", sha: null, busy: false, timer: null };

  function loadSyncCfg() {
    const s = getSettings();
    SYNC.enabled = !!s.syncEnabled;
    SYNC.backend = (s.syncBackend || "github").trim().toLowerCase();
    if (SYNC.backend !== "github" && SYNC.backend !== "gitee") SYNC.backend = "github";
    SYNC.repo = (s.repo || "").trim();
    SYNC.branch = (s.branch || "main").trim();
    SYNC.path = (s.syncPath || "data/workbench.json").trim();
    SYNC.token = s.token || "";
    SYNC.giteeToken = s.giteeToken || "";
    SYNC.proxy = (s.proxy || "").trim();
  }
  const SHARE = { repo: "youyouz22/cross-border-workbench", branch: "main", path: "data/shared.json", token: "" };
  const SHARED_KEYS = ["tasks", "tools", "docs", "notify"];
  function loadShareCfg() { const s = getSettings(); SHARE.token = s.shareToken || ""; }
  function activeToken() { return SYNC.backend === "gitee" ? SYNC.giteeToken : SYNC.token; }
  function ghHeaders() {
    const h = { "Accept": "application/vnd.github+json" };
    if (SYNC.token) h["Authorization"] = "Bearer " + SYNC.token;
    return h;
  }
  // GitHub：无代理直连 api.github.com；有代理则 POST 到代理(避免跨域预检被公司网拦截)
  async function githubFetch(method, path, bodyObj) {
    if (!SYNC.proxy) {
      return fetch("https://api.github.com" + path, {
        method,
        headers: ghHeaders(),
        body: bodyObj ? JSON.stringify(bodyObj) : undefined,
      });
    }
    const r = await fetch(SYNC.proxy, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, path, token: SYNC.token, body: bodyObj || null }),
    });
    const data = await r.json().catch(() => null);
    const status = data && typeof data.status === "number" ? data.status : r.status;
    const body = data ? data.body : null;
    return {
      status,
      ok: status >= 200 && status < 300,
      async json() { return body; },
      async text() { return typeof body === "string" ? body : JSON.stringify(body); },
    };
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, "")))); }
  function parseRepo() {
    const parts = SYNC.repo.split("/").map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) throw new Error("仓库格式错误，应为 owner/repo");
    return parts;
  }

  async function githubPull() {
    if (!SYNC.enabled || !SYNC.repo || !SYNC.token) return false;
    const path = `/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}?ref=${encodeURIComponent(SYNC.branch)}`;
    let res;
    try {
      res = await githubFetch("GET", path);
    } catch (e) {
      throw new Error("无法连接同步服务（网络问题）：" + (e.message || "Failed to fetch"));
    }
    if (res.status === 404) {
      try {
        const repoRes = await githubFetch("GET", `/repos/${encodeURIComponent(SYNC.repo)}`);
        if (repoRes.status === 404) throw new Error(`仓库 ${SYNC.repo} 不存在，请先在 GitHub 创建该仓库（建议设为 Private）`);
        if (repoRes.status === 401) throw new Error("令牌无效或无权限(401)");
      } catch (e2) {
        if (e2.message.includes("仓库") || e2.message.includes("令牌")) throw e2;
      }
      SYNC.sha = null; return true;
    }
    if (res.status === 401) throw new Error("令牌无效或无权限(401)");
    if (!res.ok) throw new Error("拉取失败 HTTP " + res.status);
    const data = await res.json();
    SYNC.sha = data.sha;
    const payload = JSON.parse(b64dec(data.content));
    Object.values(LS).forEach((k) => { if (payload[k] !== undefined) localStorage.setItem(k, JSON.stringify(payload[k])); });
    return true;
  }
  async function githubPush() {
    if (!SYNC.enabled || !SYNC.repo || !SYNC.token || SYNC.busy) return;
    SYNC.busy = true;
    try {
      const payload = {};
      Object.values(LS).forEach((k) => { const v = localStorage.getItem(k); if (v != null) payload[k] = JSON.parse(v); });
      const body = b64enc(JSON.stringify(payload, null, 2));
      if (SYNC.sha == null) {
        const g = await githubFetch("GET", `/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}?ref=${encodeURIComponent(SYNC.branch)}`);
        if (g.ok) SYNC.sha = (await g.json()).sha;
        else if (g.status !== 404) throw new Error("获取文件失败 HTTP " + g.status);
      }
      const req = { message: "sync: workbench data " + new Date().toISOString(), content: body, branch: SYNC.branch };
      if (SYNC.sha) req.sha = SYNC.sha;
      const res = await githubFetch("PUT", `/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}`, req);
      if (!res.ok) throw new Error("推送失败 HTTP " + res.status);
      SYNC.sha = (await res.json()).content.sha;
      setSyncStatus("已同步云端（" + new Date().toLocaleTimeString() + "）", true);
    } catch (e) {
      const msg = (e && e.message && e.message.indexOf("Failed to fetch") >= 0)
        ? "无法连接同步服务（网络问题），请检查网络/代理或换网络后重试" : e.message;
      setSyncStatus("同步失败：" + msg, false);
    } finally { SYNC.busy = false; }
  }

  // Gitee（码云）：国内可直连，API 支持 CORS，且用 form-urlencoded 可避开预检
  async function giteePull() {
    const token = activeToken();
    if (!SYNC.enabled || !SYNC.repo || !token) return false;
    const [owner, repo] = parseRepo();
    const url = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(SYNC.path)}?access_token=${encodeURIComponent(token)}&ref=${encodeURIComponent(SYNC.branch)}`;
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error("无法连接同步服务（网络问题）：" + (e.message || "Failed to fetch"));
    }
    if (res.status === 404) {
      try {
        const repoRes = await fetch(`https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?access_token=${encodeURIComponent(token)}`);
        if (repoRes.status === 404) throw new Error(`仓库 ${SYNC.repo} 不存在，请先在 Gitee 创建该仓库`);
        if (repoRes.status === 401) throw new Error("Gitee 令牌无效或无权限(401)");
      } catch (e2) {
        if (e2.message.includes("仓库") || e2.message.includes("令牌")) throw e2;
      }
      SYNC.sha = null; return true;
    }
    if (res.status === 401) throw new Error("Gitee 令牌无效或无权限(401)");
    if (!res.ok) throw new Error("拉取失败 HTTP " + res.status);
    const data = await res.json();
    SYNC.sha = data.sha;
    const payload = JSON.parse(b64dec(data.content));
    Object.values(LS).forEach((k) => { if (payload[k] !== undefined) localStorage.setItem(k, JSON.stringify(payload[k])); });
    return true;
  }
  async function giteePush() {
    const token = activeToken();
    if (!SYNC.enabled || !SYNC.repo || !token || SYNC.busy) return;
    SYNC.busy = true;
    try {
      const payload = {};
      Object.values(LS).forEach((k) => { const v = localStorage.getItem(k); if (v != null) payload[k] = JSON.parse(v); });
      const body = b64enc(JSON.stringify(payload, null, 2));
      const [owner, repo] = parseRepo();
      const baseUrl = `https://gitee.com/api/v5/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(SYNC.path)}`;
      if (SYNC.sha == null) {
        const g = await fetch(`${baseUrl}?access_token=${encodeURIComponent(token)}&ref=${encodeURIComponent(SYNC.branch)}`);
        if (g.ok) SYNC.sha = (await g.json()).sha;
        else if (g.status !== 404) throw new Error("获取文件失败 HTTP " + g.status);
      }
      const params = new URLSearchParams();
      params.append("access_token", token);
      params.append("content", body);
      params.append("message", "sync: workbench data " + new Date().toISOString());
      params.append("branch", SYNC.branch);
      if (SYNC.sha) params.append("sha", SYNC.sha);
      const method = SYNC.sha ? "PUT" : "POST";
      const res = await fetch(baseUrl, {
        method,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) throw new Error("推送失败 HTTP " + res.status);
      const data = await res.json();
      SYNC.sha = (data.content && data.content.sha) ? data.content.sha : data.sha;
      setSyncStatus("已同步云端（" + new Date().toLocaleTimeString() + "）", true);
    } catch (e) {
      const msg = (e && e.message && e.message.indexOf("Failed to fetch") >= 0)
        ? "无法连接同步服务（网络问题），请检查网络后重试" : e.message;
      setSyncStatus("同步失败：" + msg, false);
    } finally { SYNC.busy = false; }
  }

  async function cloudPull() { return SYNC.backend === "gitee" ? giteePull() : githubPull(); }
  async function cloudPush() { return SYNC.backend === "gitee" ? giteePush() : githubPush(); }
  function scheduleAutoSync() {
    if (!SYNC.enabled) return;
    clearTimeout(SYNC.timer);
    SYNC.timer = setTimeout(() => cloudPush(), 1000);
  }

  /* ---------------- 共享发布（让任何人打开链接都看到你发布的内容） ---------------- */
  async function publishShared() {
    if (!SHARE.token) { toast("请先在下方填写「共享发布令牌」并点保存"); return false; }
    const payload = {};
    SHARED_KEYS.forEach((k) => { const v = localStorage.getItem(k); if (v != null) payload[k] = JSON.parse(v); });
    const body = b64enc(JSON.stringify(payload, null, 2));
    let sha = null;
    try {
      const g = await fetch("https://api.github.com/repos/" + SHARE.repo + "/contents/" + SHARE.path + "?ref=" + SHARE.branch, {
        headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + SHARE.token },
      });
      if (g.ok) sha = (await g.json()).sha;
      else if (g.status !== 404) { const e = await g.json().catch(() => ({})); throw new Error("读取失败 HTTP " + g.status + " " + (e.message || "")); }
    } catch (e) { if (!e.message || !e.message.includes("HTTP")) throw new Error("无法连接 GitHub（网络问题）"); }
    const req = { message: "publish shared workbench " + new Date().toISOString(), content: body, branch: SHARE.branch };
    if (sha) req.sha = sha;
    const res = await fetch("https://api.github.com/repos/" + SHARE.repo + "/contents/" + SHARE.path, {
      method: "PUT",
      headers: { "Accept": "application/vnd.github+json", "Authorization": "Bearer " + SHARE.token, "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error("发布失败 HTTP " + res.status + " " + (e.message || "")); }
    return true;
  }
  async function loadShared() {
    try {
      const res = await fetch(GITHUB_RAW_BASE + "/data/shared.json?t=" + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      let changed = false;
      SHARED_KEYS.forEach((k) => { if (data[k] !== undefined) { localStorage.setItem(k, JSON.stringify(data[k])); changed = true; } });
      if (changed) { renderTasks(); renderDocs(); renderTools(); renderNotify(); renderDashboard(); }
    } catch (e) { /* 离线或文件不存在，忽略 */ }
  }

  /* ---------------- 视图路由 ---------------- */
  const viewTitles = {
    dashboard: "工作台", tasks: "事项安排", feishu: "飞书表格", news: "新闻聚合",
    product: "产品分析", tools: "工具网站", notify: "通知", settings: "设置", user: "用户",
  };
  function go(view) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    const el = $("#view-" + view);
    if (el) el.classList.add("active");
    $$("#nav .nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    $("#topTitle").textContent = viewTitles[view] || "工作台";
    if (view === "dashboard") renderDashboard();
    if (view === "tasks") renderTasks();
    if (view === "feishu") renderDocs();
    if (view === "news") { renderNews(); }
    if (view === "product") renderProduct();
    if (view === "tools") renderTools();
    if (view === "notify") renderNotify();
    if (view === "user") renderUser();
    if (view === "settings") renderSettings();
    try { localStorage.setItem("cbec_lastview", view); } catch (e) {}
  }

  /* ---------------- 渲染：首页 ---------------- */
  function renderDashboard() {
    const s = read(LS.settings, {});
    const name = (s.name || "朋友");
    $("#dashName").textContent = name;
    $("#dashDate").textContent = fmtDate();
    const tasks = read(LS.tasks, []);
    $("#dashTaskCount").textContent = tasks.length;
    const box = $("#dashTasks");
    if (!tasks.length) {
      box.innerHTML = '<div class="empty"><div class="empty-ico">📋</div>暂无任务，点击下方"新建任务"添加。</div>';
    } else {
      box.innerHTML = tasks.slice(0, 4).map((t) => `
        <div class="row">
          <div class="row-main">
            <div class="row-title">${esc(t.title)}</div>
            <div class="progress mt-8"><span style="width:${t.progress || 0}%"></span></div>
            <div class="row-sub mt-8">进度 ${t.progress || 0}%</div>
          </div>
        </div>`).join("");
    }
    const newsRaw = read(LS.news, []);
    const news = Array.isArray(newsRaw) ? newsRaw : (newsRaw && Array.isArray(newsRaw.items) ? newsRaw.items : []);
    const nb = $("#dashNews");
    if (!news.length) {
      nb.innerHTML = '<div class="empty">暂无新闻</div>';
    } else {
      nb.innerHTML = news.slice(0, 4).map((n) => `
        <div class="news-item">
          <div class="news-head">${impactTag(n.impact)}<span class="tag">${esc(n.topic || "新闻")}</span>
            <span class="news-title">${esc(n.title)}</span></div>
          <div class="news-meta"><span>${esc(n.source || "")}</span><span>${esc(n.time || "")}</span></div>
        </div>`).join("");
    }
  }

  /* ---------------- 渲染：任务 ---------------- */
  function renderTasks() {
    const tasks = read(LS.tasks, []);
    $("#navTaskCount").textContent = tasks.length;
    const box = $("#taskList");
    if (!tasks.length) {
      box.innerHTML = '<div class="empty"><div class="empty-ico">✅</div>还没有任务，点击"新建任务"按钮添加你的第一个任务</div>';
      return;
    }
    box.innerHTML = tasks.map((t) => {
      const subs = (t.subs || []).map((s) =>
        `<div class="subtask"><input type="checkbox" ${s.done ? "checked" : ""} data-sub="${t.id}" data-sid="${s.id}"/> <span style="${s.done ? "text-decoration:line-through;color:#a1a1aa" : ""}">${esc(s.text)}</span></div>`
      ).join("");
      return `
      <div class="row" data-task="${t.id}">
        <div class="row-main">
          <div class="row-title">${esc(t.title)}</div>
          ${t.desc ? `<div class="row-sub">${esc(t.desc)}</div>` : ""}
          <div class="progress mt-8"><span style="width:${t.progress || 0}%"></span></div>
          <div class="row-sub mt-8">进度 ${t.progress || 0}%</div>
          ${subs ? `<div class="mt-8">${subs}</div>` : ""}
        </div>
        <div class="row-actions">
          <button class="btn btn-sm" data-edit="${t.id}">编辑</button>
          <button class="btn btn-sm btn-destructive" data-del="${t.id}">删除</button>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------------- 任务模态框 ---------------- */
  let editingId = null;
  let subtemp = [];
  function openTaskModal(task) {
    editingId = task ? task.id : null;
    $("#taskModalTitle").textContent = task ? "编辑任务" : "新建任务";
    $("#btnSaveTask").textContent = task ? "保存修改" : "添加任务";
    $("#tTitle").value = task ? task.title : "";
    $("#tDesc").value = task ? (task.desc || "") : "";
    const p = task ? (task.progress || 0) : 0;
    $("#tProg").value = p; $("#tProgLabel").textContent = p;
    subtemp = task ? (task.subs || []).map((s) => ({ ...s })) : [];
    renderSubtasks();
    $("#taskModal").classList.add("show");
    $("#tTitle").focus();
  }
  function renderSubtasks() {
    $("#subtaskBox").innerHTML = subtemp.map((s, i) =>
      `<div class="subtask"><input type="checkbox" ${s.done ? "checked" : ""} data-st="${i}"/> <input class="input" style="flex:1" value="${esc(s.text)}" data-stext="${i}"/></div>`
    ).join("");
  }

  /* ---------------- 渲染：飞书文档 ---------------- */
  function renderDocs() {
    const q = ($("#docSearch").value || "").trim().toLowerCase();
    let docs = read(LS.docs, []);
    if (q) docs = docs.filter((d) =>
      (d.title + d.desc + (d.tags || []).join("") + d.link).toLowerCase().includes(q));
    const box = $("#docList");
    if (!docs.length) {
      box.innerHTML = `<div class="empty"><div class="empty-ico">📄</div>${q ? "没有找到文档，尝试不同的搜索词" : '还没有文档，点击"添加飞书文档"按钮来添加你的第一个飞书文档'}</div>`;
      return;
    }
    box.innerHTML = docs.map((d) => {
      const tags = (d.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ");
      return `
      <div class="row" data-doc="${d.id}">
        <div class="row-main">
          <div class="row-title"><a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.title)} ↗</a></div>
          ${d.desc ? `<div class="row-sub">${esc(d.desc)}</div>` : ""}
          <div class="mt-8 flex items-center gap-8">${tags}</div>
          <div class="row-sub mt-8">类型：${esc(d.type || "文档")}　·　最后访问：${esc(d.access || "—")}</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm btn-destructive" data-deldoc="${d.id}">删除</button>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------------- 渲染：新闻 ---------------- */
  const COUNTRY_FLAG = { "美国":"🇺🇸","英国":"🇬🇧","西班牙":"🇪🇸","意大利":"🇮🇹","法国":"🇫🇷","德国":"🇩🇪" };
  const flagOf = (c) => COUNTRY_FLAG[c] || "🌍";
  /* 电商影响分析字典：按新闻类别给出可操作建议（参考同类成熟设计，便于选品/运营决策） */
  const EFFECT_ADVICE = {
    "政策": "直接影响选品合规与进口成本。建议提前核查目标国认证（如 CE/UKCA/能效/环保标准），避免因不合规被下架或罚款，必要时调整供应链与申报方式。",
    "经济": "宏观消费力与汇率波动会影响客单价和利润。建议动态调整定价与促销节奏，关注汇率对冲，避免成本上升侵蚀毛利。",
    "电商": "平台流量与促销变化是选品风向标。建议快速跟进热销品类、优化 Listing 关键词与广告投放，抢占流量红利。",
    "消费": "消费偏好变化指明需求方向。建议围绕该趋势补充相关 SKU，并在详情页强化对应卖点（如环保、智能、可持续）。",
    "物流": "物流成本/时效波动影响履约体验与利润。建议多渠道分散仓配、设置合理运费模板，并提前告知时效避免差评。",
    "支付": "本地化支付覆盖能显著提升转化。建议开通该市场主流支付方式（如分期、本地钱包），降低弃单率。",
    "税务": "税费变动直接吞噬利润。建议重新核算到手价、优化定价与供应链，必要时调整选品结构。",
    "科技": "新技术品类需求上升。建议评估供应链稳定性与上架节奏，抢占早期流量与口碑。",
    "旅游": "旅游旺季带动周边消费。建议提前备货旅游/户外/纪念品类，配合节点营销。",
    "商业": "中小企业数字化带来 B 端机会。可考虑面向卖家工具/服务类商品，拓展新客群。",
    "运动": "运动健康需求上升。建议补充相关装备，并强调功能卖点（如便携、耐用、轻量）。",
    "关税": "关税上调直接抬升到岸成本与售价。建议重新核算利润、优化申报方式，并评估转口或本地仓以降低税负。",
    "运费": "运费波动影响履约成本与时效。建议多渠道比价、设置动态运费模板，并在大促前锁定运力。",
  };
  const adviceFor = (n) => EFFECT_ADVICE[n.category] || EFFECT_ADVICE[n.topic] || "该新闻与你的选品/运营相关，建议结合所在品类评估潜在影响，并持续关注后续进展。";

  let newsCountry = "all";
  let newsExpanded = null;

  function impactBadge(imp) {
    const v = (imp || "").toLowerCase();
    if (v === "high" || v === "高影响") return '<span class="tag red">高影响</span>';
    if (v === "medium" || v === "中影响") return '<span class="tag amber">中影响</span>';
    if (imp) return '<span class="tag">低影响</span>';
    return "";
  }

  /* 合并左列资讯(LS.news) + 右列原站快讯(LS.origin)，按标题去重 */
  function allNews() {
    const a = read(LS.news, []) || [];
    const b = read(LS.origin, []) || [];
    const seen = new Set();
    return a.concat(b).filter((n) => {
      const k = (n.title || "").trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function renderCountryFilter(all) {
    const box = $("#newsCountryFilter");
    if (!box) return;
    const countries = ["all"].concat(Array.from(new Set(all.map((n) => n.country).filter(Boolean))));
    box.innerHTML = countries.map((c) => {
      const label = c === "all" ? "全部国家" : flagOf(c) + " " + c;
      return `<button class="chip ${newsCountry === c ? "active" : ""}" data-country="${esc(c)}">${label}</button>`;
    }).join("");
  }

  function renderNewsSidebar(all) {
    const high = all.filter((n) => {
      const v = (n.impact || "").toLowerCase();
      return v === "high" || v === "高影响" || n.ecommerceImpact;
    }).slice(0, 6);
    const hi = $("#newsHighImpact");
    if (hi) hi.innerHTML = high.length ? high.map((n) => `<li>${esc(n.title)}</li>`).join("") : '<li class="muted">暂无高影响新闻</li>';
    const kw = {};
    all.forEach((n) => (n.trendingTopics || []).forEach((t) => { kw[t] = (kw[t] || 0) + 1; }));
    const top = Object.entries(kw).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const kwBox = $("#newsKeywords");
    if (kwBox) kwBox.innerHTML = top.length
      ? top.map(([t, c]) => `<span class="tag">#${esc(t)} <b>${c}</b></span>`).join(" ")
      : '<span class="muted">暂无关键词</span>';
  }

  /* 统一新闻卡片：可点击展开看「对电商的具体影响」+ 相关关键词 */
  function renderNewsCard(n) {
    const id = n.id || n.title;
    const loc = n.country || "";
    const expanded = newsExpanded === id;
    const topics = (n.trendingTopics || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ");
    const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent(n.title || "");
    return `
    <div class="news-card ${expanded ? "open" : ""}" data-news-id="${esc(id)}">
      <div class="nc-head">
        ${loc ? `<span class="flag">${flagOf(loc)}</span><span class="tag blue">${esc(loc)}</span>` : ""}
        ${n.category ? `<span class="tag">${esc(n.category)}</span>` : ""}
        ${impactBadge(n.impact)}
        ${n.ecommerceImpact ? '<span class="tag green">电商影响</span>' : ""}
      </div>
      <div class="nc-title">${esc(n.title)}</div>
      ${n.summary ? `<div class="nc-summary">${esc(n.summary)}</div>` : ""}
      <div class="nc-meta">
        <span>${esc(n.source || "")}</span>
        <span>${esc(n.publishedAt || n.time || "")}</span>
        <span class="nc-toggle">${expanded ? "收起 ↑" : "点击展开详情 ↓"}</span>
      </div>
      ${expanded ? `
      <div class="nc-detail">
        <div class="nc-advice">
          <div class="nc-advice-h">📌 对电商的具体影响</div>
          <div class="nc-advice-b">${esc(adviceFor(n))}</div>
        </div>
        ${topics ? `<div class="nc-keywords"><div class="nc-advice-h">🔍 相关关键词</div><div class="nc-kw-list">${topics}</div></div>` : ""}
        <a class="nc-link" href="${esc(n.url || searchUrl)}" target="_blank" rel="noopener">${n.url ? "查看原文 ↗" : "搜索更多报道 ↗"}</a>
      </div>` : ""}
    </div>`;
  }

  function renderNews() {
    const all = allNews();
    const list = newsCountry === "all" ? all : all.filter((n) => (n.country || "") === newsCountry);
    const box = $("#newsAll");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>该国家暂无资讯</div>';
    } else {
      box.innerHTML = list.map((n) => renderNewsCard(n)).join("");
    }
    const cnt = $("#newsCount"); if (cnt) cnt.textContent = list.length;
    renderCountryFilter(all);
    renderNewsSidebar(all);
  }

  /* 右列原站政策快讯：加载进 LS.origin（与左列合并为统一流）；已加载则直接渲染 */
  async function renderOriginNews() {
    if (read(LS.origin, null)) { renderNews(); return; }
    try {
      const r = await fetch(ORIGIN_NEWS_URL);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) write(LS.origin, arr);
    } catch (e) {}
    renderNews();
  }

  /* 左列静态中文资讯：写入 LS.news；同时预载右列到 LS.origin（供统一流合并），无运行时翻译、秒开 */
  async function loadStaticNews() {
    if (!read(LS.news, null)) {
      try {
        const r = await fetch(ORIGIN_RSS_ZH_URL);
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr) && arr.length) {
            const mapped = arr.map((n) => ({
              id: n.id != null ? String(n.id) : uid(),
              title: n.title || "",
              source: n.source || "",
              impact: n.impact === "high" ? "高影响" : (n.impact === "medium" ? "中影响" : (n.impact || "")),
              topic: n.category || "新闻",
              time: n.publishedAt || "",
              country: n.country || "",
              category: n.category || "",
              summary: n.summary || "",
              url: n.url || "",
              trendingTopics: n.trendingTopics || [],
              ecommerceImpact: !!n.ecommerceImpact,
            }));
            write(LS.news, mapped);
          }
        }
      } catch (e) {}
    }
    if (!read(LS.origin, null)) {
      try {
        const r = await fetch(ORIGIN_NEWS_URL);
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr) && arr.length) write(LS.origin, arr);
        }
      } catch (e) {}
    }
  }

  /* 实时拉取 GitHub 上最新的新闻 JSON 并覆盖本地缓存（参考站做法：每次打开都拉，保证"推了就变"）
     左列 cross-border-news-zh.json + 右列 origin-news.json 一起更新；失败静默回退本地。 */
  /* 实时拉取 GitHub 上最新的新闻 JSON 并覆盖本地缓存（与每日 8 点自动任务产出同源）
     opts.loading=true 时显示加载动画（用于「刷新新闻」按钮）；opts.toast=true 时弹提示 */
  async function pullLiveNews(opts = {}) {
    const { loading = false, toast: doToast = false } = opts;
    const na = $("#newsAll");
    if (loading && na) na.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>正在拉取最新资讯…</div>';
    try {
      const cb = "?t=" + Date.now();
      const [zhR, orR] = await Promise.all([
        fetch(GITHUB_RAW_BASE + "/data/cross-border-news-zh.json" + cb),
        fetch(GITHUB_RAW_BASE + "/data/origin-news.json" + cb),
      ]);
      let count = 0;
      if (zhR.ok) {
        const arr = await zhR.json();
        if (Array.isArray(arr) && arr.length) {
          const mapped = arr.map((n) => ({
            id: n.id != null ? String(n.id) : uid(),
            title: n.title || "",
            source: n.source || "",
            impact: n.impact === "high" ? "高影响" : (n.impact === "medium" ? "中影响" : (n.impact || "")),
            topic: n.category || "新闻",
            time: n.publishedAt || "",
            country: n.country || "",
            category: n.category || "",
            summary: n.summary || "",
            url: n.url || "",
            trendingTopics: n.trendingTopics || [],
            ecommerceImpact: !!n.ecommerceImpact,
          }));
          write(LS.news, mapped);
          count = mapped.length;
        }
      }
      if (orR.ok) {
        const arr2 = await orR.json();
        if (Array.isArray(arr2) && arr2.length) write(LS.origin, arr2);
      }
      renderNews();
      const upd = $("#newsUpdated"); if (upd) upd.textContent = "更新于 " + new Date().toLocaleString();
      if (doToast) toast(count ? ("已拉取最新资讯（" + count + " 条）") : "已是最新资讯");
    } catch (e) {
      if (loading && na) na.innerHTML = '<div class="empty">拉取失败，请检查网络后重试</div>';
      if (doToast) toast("拉取最新资讯失败，请检查网络");
    }
  }


  /* ---------------- 渲染：产品 / 工具 ---------------- */
  function renderProduct() {
    const items = read(LS.product, []);
    const grid = $("#productGrid");
    if (!items.length) {
      grid.innerHTML = '<div class="empty"><div class="empty-ico">📦</div>还没有商品，点右上角「＋ 添加商品」粘贴链接</div>';
      return;
    }
    grid.innerHTML = items.map((p) => {
      const url = productUrl(p);
      const growth = (p.salesGrowth != null && p.salesGrowth !== "") ? `<span class="tag green">📈 +${esc(p.salesGrowth)}%</span>` : "";
      const rating = (p.rating != null && p.rating !== "") ? `<span class="tag amber">⭐ ${esc(p.rating)}</span>` : "";
      const ali = (p.alibabaPrice != null && p.alibabaPrice !== "") ? `<span class="tag">1688采购 $${esc(p.alibabaPrice)}</span>` : "";
      const pros = (p.pros || []).length ? `<div class="pc-list"><span class="pc-h">优点</span>${p.pros.map((x) => `<span class="pc-pro">+ ${esc(x)}</span>`).join("")}</div>` : "";
      const cons = (p.cons || []).length ? `<div class="pc-list"><span class="pc-h">注意</span>${p.cons.map((x) => `<span class="pc-con">- ${esc(x)}</span>`).join("")}</div>` : "";
      return `
      <div class="tool-card product-card">
        <button class="t-del" data-del-product="${p.id}" title="删除">✕</button>
        <div class="product-thumb emoji">📦</div>
        <div class="t-title" style="margin-top:6px">${esc(p.title)}</div>
        <div class="product-meta">
          ${p.platform ? `<span class="tag blue">${esc(p.platform)}</span>` : ""}
          ${p.price ? `<span class="tag">${esc(p.price)}</span>` : ""}
          ${ali}${growth}${rating}
        </div>
        ${pros}${cons}
        ${url ? `<a class="btn btn-sm btn-primary mt-8" href="${esc(url)}" target="_blank" rel="noopener" style="align-self:flex-start">🔗 ${p.url ? "打开商品" : "1688 找货源"}</a>` : ""}
      </div>`;
    }).join("");
  }
  function renderTools() {
    const items = read(LS.tools, []);
    const grid = $("#toolGrid");
    if (!items.length) {
      grid.innerHTML = '<div class="empty"><div class="empty-ico">🔗</div>还没有工具，点右上角「＋ 添加工具」添加你的网页</div>';
      return;
    }
    grid.innerHTML = items.map((t) => `
      <div class="tool-card">
        <button class="t-del" data-del-tool="${t.id}" title="删除">✕</button>
        <a href="${esc(t.url)}" target="_blank" rel="noopener" style="display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit">
          <div class="t-ico">${t.icon || "🔗"}</div>
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-desc">${esc(t.desc || "")}</div>
        </a>
      </div>`).join("");
  }

  /* ---------------- 渲染：通知 ---------------- */
  function renderNotify() {
    const list = read(LS.notify, []);
    $("#navNotifyCount").textContent = list.length;
    const box = $("#notifyList");
    if (!list.length) { box.innerHTML = '<div class="empty">暂无通知</div>'; return; }
    box.innerHTML = list.map((n) => `
      <div class="row">
        <div class="row-main">
          <div class="row-title">${esc(n.title)}</div>
          <div class="row-sub">${esc(n.time || "")}</div>
        </div>
      </div>`).join("");
  }

  /* ---------------- 渲染：设置 / 用户 ---------------- */
  function getSettings() { return read(LS.settings, {}); }
  function syncUiByBackend() {
    const backend = ($("#setBackend") ? $("#setBackend").value : "github") || "github";
    const ghOnly = $("#groupGitHubOnly"), giteeOnly = $("#groupGiteeOnly");
    if (ghOnly) ghOnly.style.display = backend === "github" ? "block" : "none";
    if (giteeOnly) giteeOnly.style.display = backend === "gitee" ? "block" : "none";
  }
  function renderSettings() {
    const s = getSettings();
    $("#setName").value = s.name || "";
    $("#setSyncOn").checked = !!s.syncEnabled;
    $("#setBackend").value = (s.syncBackend || "github").trim().toLowerCase();
    $("#setRepo").value = s.repo || "";
    $("#setBranch").value = s.branch || "main";
    $("#setPath").value = s.syncPath || "data/workbench.json";
    $("#setToken").value = s.token || "";
    $("#setShareToken").value = s.shareToken || "";
    $("#setGiteeToken").value = s.giteeToken || "";
    $("#setProxy").value = s.proxy || "";
    syncUiByBackend();
  }
  /* 设置访问密码：轻量防护（不依赖 crypto，本地 file:// 与部署环境结果一致） */
  function hashPwd(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return "h" + (h >>> 0).toString(16);
  }
  function openSettings() {
    const s = getSettings();
    if (!s.pwdHash) {
      go("settings");
      setTimeout(() => toast("提示：可在此设置「设置访问密码」，保护设置不被他人打开"), 400);
      return;
    }
    $("#pwdInput").value = "";
    $("#pwdError").textContent = "";
    $("#pwdModal").classList.add("show");
    setTimeout(() => { try { $("#pwdInput").focus(); } catch (e) {} }, 50);
  }
  function renderUser() {
    const s = getSettings();
    const name = s.name || "朋友";
    $("#userName").textContent = name;
    $("#userAvatar").textContent = name.slice(0, 1).toUpperCase();
    $("#topAvatar").textContent = name.slice(0, 1).toUpperCase();
    $("#userRepo").textContent = s.repo ? ("同步仓库：" + s.repo) : "未配置同步仓库";
  }

  /* ---------------- 导入 / 导出 ---------------- */
  function exportData() {
    const data = {};
    Object.values(LS).forEach((k) => (data[k] = read(k, null)));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "workbench-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出数据备份");
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        Object.entries(data).forEach(([k, v]) => { if (LS[k]) write(LS[k], v); });
        toast("导入成功，正在刷新");
        setTimeout(() => { renderAll(); go("dashboard"); }, 300);
      } catch (e) { toast("导入失败：文件格式错误"); }
    };
    r.readAsText(file);
  }

  function renderAll() { renderDashboard(); renderTasks(); renderDocs(); renderNews(); renderProduct(); renderTools(); renderNotify(); renderUser(); }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 导航
    $("#nav").addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item"); if (item) go(item.dataset.view);
    });
    document.addEventListener("click", (e) => {
      const dv = e.target.closest("[data-view]");
      if (dv && dv.id !== "nav") { go(dv.dataset.view); }
    });
    // 侧边栏折叠
    $("#toggleSidebar").addEventListener("click", () => $("#app").classList.toggle("collapsed"));
    // 新闻刷新：点击即强制从 GitHub 拉取最新新闻（与每日 8 点自动任务同源），覆盖本地缓存
    const rb = $("#btnRefreshNews");
    if (rb) rb.addEventListener("click", async () => {
      await pullLiveNews({ loading: true, toast: true });
    });

    // 任务
    $("#btnNewTask").addEventListener("click", () => openTaskModal(null));
    $("#btnSaveTask").addEventListener("click", () => {
      const title = $("#tTitle").value.trim();
      if (!title) { toast("请输入任务标题"); return; }
      const progress = +$("#tProg").value;
      const payload = {
        title, desc: $("#tDesc").value.trim(), progress,
        subs: subtemp.map((s) => ({ id: s.id || uid(), text: s.text, done: s.done })),
      };
      const tasks = read(LS.tasks, []);
      if (editingId) {
        const i = tasks.findIndex((t) => t.id === editingId);
        if (i >= 0) tasks[i] = { ...tasks[i], ...payload };
        toast("已保存修改");
      } else {
        tasks.unshift({ id: uid(), ...payload });
        pushNotify("新建任务：" + title);
        toast("已添加任务");
      }
      write(LS.tasks, tasks);
      $("#taskModal").classList.remove("show");
      renderTasks(); renderDashboard();
    });
    $("#tProg").addEventListener("input", (e) => ($("#tProgLabel").textContent = e.target.value));
    $("#btnAddSub").addEventListener("click", () => { subtemp.push({ id: uid(), text: "", done: false }); renderSubtasks(); });
    $("#subtaskBox").addEventListener("change", (e) => {
      const i = e.target.dataset.st; if (i == null) return;
      const cb = e.target.type === "checkbox";
      if (cb) subtemp[i].done = e.target.checked;
    });
    $("#subtaskBox").addEventListener("input", (e) => {
      const i = e.target.dataset.stext; if (i == null) return;
      subtemp[i].text = e.target.value;
    });
    $("#taskList").addEventListener("click", (e) => {
      const del = e.target.dataset.del, edit = e.target.dataset.edit;
      const tasks = read(LS.tasks, []);
      if (del) {
        if (confirm("确定要删除这个任务吗？")) { write(LS.tasks, tasks.filter((t) => t.id !== del)); renderTasks(); renderDashboard(); }
      } else if (edit) {
        openTaskModal(tasks.find((t) => t.id === edit));
      }
    });
    $("#taskList").addEventListener("change", (e) => {
      const sid = e.target.dataset.sub, sub = e.target.dataset.sid;
      if (!sid) return;
      const tasks = read(LS.tasks, []);
      const t = tasks.find((x) => x.id === sid);
      const s = t && t.subs.find((y) => y.id === sub);
      if (s) { s.done = e.target.checked; write(LS.tasks, tasks); renderTasks(); }
    });

    // 语音（仅 UI 演示）
    $("#btnVoice").addEventListener("click", () => {
      const b = $("#btnVoice");
      b.classList.toggle("recording");
      if (b.classList.contains("recording")) {
        b.textContent = "🎙️ 正在录音，请说话…"; toast("点击麦克风图标停止（演示功能）");
      } else { b.textContent = "🎤 语音快速添加"; }
    });

    // 飞书文档
    $("#btnNewDoc").addEventListener("click", () => $("#docModal").classList.add("show"));
    $("#btnSaveDoc").addEventListener("click", () => {
      const title = $("#dTitle").value.trim(), link = $("#dLink").value.trim();
      if (!title || !link) { toast("请填写标题与链接"); return; }
      const docs = read(LS.docs, []);
      docs.unshift({ id: uid(), title, link, desc: $("#dDesc").value.trim(),
        type: $("#dType").value, tags: $("#dTags").value.split(",").map((x) => x.trim()).filter(Boolean),
        access: new Date().toLocaleDateString() });
      write(LS.docs, docs);
      $("#docModal").classList.remove("show");
      $("#dTitle").value = $("#dLink").value = $("#dDesc").value = $("#dTags").value = "";
      renderDocs(); toast("已添加文档");
    });
    $("#docSearch").addEventListener("input", renderDocs);
    $("#docList").addEventListener("click", (e) => {
      const id = e.target.dataset.deldoc; if (!id) return;
      if (confirm("确定删除这个文档吗？")) { write(LS.docs, read(LS.docs, []).filter((d) => d.id !== id)); renderDocs(); }
    });

    /* ---- 工具网站：添加 / 删除 ---- */
    $("#btnNewTool").addEventListener("click", () => {
      $("#toolTitle").value = $("#toolUrl").value = $("#toolDesc").value = $("#toolIcon").value = "";
      $("#toolModal").classList.add("show");
    });
    $("#btnSaveTool").addEventListener("click", () => {
      const title = $("#toolTitle").value.trim(), url = $("#toolUrl").value.trim();
      if (!title || !url) { toast("请填写名称和链接"); return; }
      const tools = read(LS.tools, []);
      tools.push({ id: uid(), title, url, desc: $("#toolDesc").value.trim(), icon: $("#toolIcon").value.trim() || "🔗" });
      write(LS.tools, tools);
      $("#toolModal").classList.remove("show");
      renderTools(); toast("已添加工具");
    });
    $("#toolGrid").addEventListener("click", (e) => {
      const id = e.target.dataset.delTool; if (!id) return;
      e.stopPropagation();
      if (confirm("确定删除这个工具吗？")) { write(LS.tools, read(LS.tools, []).filter((t) => t.id !== id)); renderTools(); }
    });

    /* ---- 产品分析：添加商品 ---- */
    $("#btnNewProduct").addEventListener("click", () => {
      ["pTitle", "pUrl", "pImg", "pPlatform", "pPrice", "pNote", "pAli", "pGrowth", "pRating", "pTrend", "pPros", "pCons"].forEach((id) => ($("#" + id).value = ""));
      $("#productModal").classList.add("show");
    });
    $("#btnSaveProduct").addEventListener("click", () => {
      const title = $("#pTitle").value.trim(), url = $("#pUrl").value.trim();
      if (!title) { toast("请填写商品名称"); return; }
      const products = read(LS.product, []);
      const trendRaw = $("#pTrend").value.trim().toLowerCase();
      products.push({
        id: uid(), title, url, img: $("#pImg").value.trim(),
        platform: $("#pPlatform").value.trim(), price: $("#pPrice").value.trim(), note: $("#pNote").value.trim(),
        alibabaPrice: $("#pAli").value.trim(),
        salesGrowth: $("#pGrowth").value.trim(),
        rating: $("#pRating").value.trim(),
        trending: trendRaw === "1" || trendRaw === "yes" || trendRaw === "y" || trendRaw === "是",
        pros: $("#pPros").value.split(",").map((x) => x.trim()).filter(Boolean),
        cons: $("#pCons").value.split(",").map((x) => x.trim()).filter(Boolean),
      });
      write(LS.product, products);
      $("#productModal").classList.remove("show");
      renderProduct(); toast("已添加商品");
    });
    $("#productGrid").addEventListener("click", (e) => {
      const del = e.target.dataset.delProduct; if (!del) return;
      e.stopPropagation();
      if (confirm("确定删除这个商品吗？")) {
        write(LS.product, read(LS.product, []).filter((p) => p.id !== del));
        // 记录被删除的原站商品，避免下次启动自动补回
        const hidden = new Set((read(LS.productHidden, []) || []).map(String));
        hidden.add(String(del));
        write(LS.productHidden, Array.from(hidden));
        renderProduct();
      }
    });

    /* ---- 新闻：展开/收起卡片、国家筛选、打开原文 ---- */
    $("#newsAll").addEventListener("click", (e) => {
      const card = e.target.closest(".news-card");
      if (!card) return;
      if (e.target.closest(".nc-link")) return; // 链接自行跳转，不触发展开
      const id = card.dataset.newsId;
      newsExpanded = (newsExpanded === id) ? null : id;
      renderNews();
    });
    const ncf = $("#newsCountryFilter");
    if (ncf) ncf.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-country]");
      if (!chip) return;
      newsCountry = chip.dataset.country;
      newsExpanded = null;
      renderNews();
    });

    // 通知
    $("#btnClearNotify").addEventListener("click", () => {
      if (confirm("确定清空所有通知吗？此操作不可恢复")) { write(LS.notify, []); renderNotify(); }
    });

    // 设置
    $("#setBackend").addEventListener("change", syncUiByBackend);
    $("#btnSaveSettings").addEventListener("click", () => {
      const s = getSettings();
      s.name = $("#setName").value.trim();
      s.syncEnabled = $("#setSyncOn").checked;
      s.syncBackend = ($("#setBackend").value || "github").trim().toLowerCase();
      s.repo = $("#setRepo").value.trim();
      s.branch = $("#setBranch").value.trim() || "main";
      s.syncPath = $("#setPath").value.trim() || "data/workbench.json";
      s.token = $("#setToken").value;
      s.giteeToken = $("#setGiteeToken").value;
      s.proxy = $("#setProxy").value.trim();
      s.shareToken = $("#setShareToken").value;
      write(LS.settings, s);
      loadSyncCfg();
      loadShareCfg();
      const tok = activeToken();
      if (SYNC.enabled && SYNC.repo && tok) {
        setSyncStatus("正在从云端拉取…", false);
        cloudPull().then(() => { setSyncStatus("已从云端同步", true); renderAll(); renderUser(); renderDashboard(); })
                  .catch((e) => setSyncStatus("云端拉取失败：" + e.message, false));
      } else {
        setSyncStatus("未启用", false);
      }
      renderUser(); renderDashboard();
      toast("设置已保存");
    });

    $("#btnSyncNow").addEventListener("click", () => {
      if (!SYNC.enabled || !SYNC.repo || !activeToken()) { toast("请先在上方开启并填写同步信息"); return; }
      setSyncStatus("正在上传到云端…", false);
      cloudPush();
    });

    $("#btnPublishShare").addEventListener("click", async () => {
      const line = $("#shareStatusLine"); if (!line) return;
      line.textContent = "正在发布…";
      try {
        const ok = await publishShared();
        if (ok) { line.textContent = "已发布（" + new Date().toLocaleTimeString() + "）朋友打开链接即可看到"; toast("发布成功！朋友打开链接就能看到你加的网址/任务"); }
      } catch (e) { line.textContent = "发布失败：" + e.message; toast("发布失败：" + e.message); }
    });

    // 右上角：设置（密码保护）/ 用户
    $("#btnTopSettings").addEventListener("click", openSettings);
    $("#topAvatar").addEventListener("click", () => go("user"));

    // 设置访问密码
    $("#btnSetPwd").addEventListener("click", () => {
      const v = $("#setPwd").value;
      if (!v || v.length < 4) { toast("密码至少 4 位"); return; }
      const s = getSettings();
      s.pwdHash = hashPwd(v);
      write(LS.settings, s);
      $("#setPwd").value = "";
      toast("访问密码已设置");
    });
    $("#btnPwdOff").addEventListener("click", () => {
      if (!confirm("确定关闭密码保护？之后任何人都能直接打开设置。")) return;
      const s = getSettings(); delete s.pwdHash; write(LS.settings, s);
      toast("已关闭密码保护");
    });
    $("#btnPwdOk").addEventListener("click", () => {
      const s = getSettings();
      const h = hashPwd($("#pwdInput").value);
      if (h === s.pwdHash) { $("#pwdModal").classList.remove("show"); go("settings"); }
      else $("#pwdError").textContent = "密码错误，请重试";
    });
    $("#pwdInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnPwdOk").click(); });
    $("#btnPwdForget").addEventListener("click", () => {
      if (!confirm("清除密码保护（仅清除密码，不影响其他数据）。确定继续？")) return;
      const s = getSettings(); delete s.pwdHash; write(LS.settings, s);
      $("#pwdModal").classList.remove("show");
      toast("已清除密码保护");
    });

    // 导入导出
    $("#btnExport").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });
    $("#btnExportBackup").addEventListener("click", exportData);
    $("#btnImportBackup").addEventListener("click", () => $("#importBackupFile").click());
    $("#importBackupFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });

    // 清除本地缓存
    $("#btnClearCache").addEventListener("click", () => {
      if (!confirm("确定清除本地缓存？这会重置新闻、任务、设置等本地数据（不影响已推送到云端的数据）。")) return;
      Object.values(LS).forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("cbec_lastview");
      location.reload();
    });

    // 模态框关闭
    $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal-mask").classList.remove("show")));
    $$(".modal-mask").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("show"); }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal-mask").forEach((m) => m.classList.remove("show")); });
  }

  function pushNotify(title) {
    const list = read(LS.notify, []);
    list.unshift({ id: uid(), title, time: new Date().toLocaleString() });
    write(LS.notify, list.slice(0, 50));
    renderNotify();
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    // 新闻由下方 loadStaticNews 加载预翻译的中文内容（无运行时翻译）
    const ok = await loadOriginProducts();
    if (!ok && !read(LS.product, null)) write(LS.product, seedProduct());
    if (!read(LS.tools, null)) write(LS.tools, seedTools());
    bind();
    loadSyncCfg();
    loadShareCfg();
    if (SYNC.enabled && SYNC.repo && activeToken()) {
      setSyncStatus("正在从云端拉取…", false);
      try { await cloudPull(); setSyncStatus("已从云端同步", true); }
      catch (e) { setSyncStatus("云端拉取失败：" + e.message, false); }
    }
    renderAll();
    await loadStaticNews();   // 加载预翻译中文资讯（无运行时翻译，秒开）
    renderNews();
    renderDashboard();        // 刷新首页「今日新闻」
    pullLiveNews();           // 后台实时拉取 GitHub 最新新闻并覆盖缓存（推了就变，不阻塞首屏）
    loadShared();             // 自动加载已发布的共享内容（任何人打开链接即可看到）
    const last = read("cbec_lastview", "dashboard");
    const allowed = ["dashboard","tasks","feishu","news","product","tools","notify","settings","user"];
    if (last === "settings") openSettings();
    else go(allowed.includes(last) ? last : "dashboard");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
