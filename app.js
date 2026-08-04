/* ============================================================
   跨境电商工作台 · 复刻版 逻辑
   纯原生 JS · 数据存于浏览器 localStorage · 支持导入/导出
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LS = {
    tasks: "cbec_tasks",
    docs: "cbec_docs",
    news: "cbec_news",
    product: "cbec_product",
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

  /* 真实新闻源：聚焦跨境物流/清关/关税/运费/出口政策（经 RSS2JSON 免费 API 拉取，无需后端） */
  const NEWS_SOURCES = [
    { topic: "包裹关税与清关", feeds: [
      "https://www.postandparcel.info/feed/",
      "https://www.parcelandpostaltechnologyinternational.com/feed/",
    ]},
    { topic: "运费与跨境物流", feeds: [
      "https://theloadstar.com/feed/",
      "https://www.freightwaves.com/news/feed",
      "https://www.stattimes.com/feed/",
    ]},
    { topic: "出口与贸易政策", feeds: [
      "https://www.supplychaindive.com/feeds/news/",
    ]},
  ];
  const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
  const NEWS_CACHE_VERSION = 3; // 缓存数据结构升级时递增，自动清掉旧本地数据
  const ORIGIN_NEWS_URL = "./data/origin-news.json"; // 原站跨境政策快讯快照（同事站点的 news.json）
  const ORIGIN_RSS_ZH_URL = "./data/cross-border-news-zh.json"; // 预翻译好的中文跨境资讯（左列，无运行时翻译）
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
  /* 从站点自带的原站数据文件加载真实商品（参考同事站点 products.json） */
  async function loadOriginProducts() {
    try {
      const r = await fetch("./data/origin-products.json");
      if (!r.ok) return false;
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
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
        write(LS.product, mapped);
        return true;
      }
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

  /* ---------------- GitHub 云端同步（git-as-backend） ---------------- */
  const SYNC = { enabled: false, repo: "", branch: "main", path: "data/workbench.json", token: "", sha: null, busy: false, timer: null };

  function loadSyncCfg() {
    const s = getSettings();
    SYNC.enabled = !!s.syncEnabled;
    SYNC.repo = (s.repo || "").trim();
    SYNC.branch = (s.branch || "main").trim();
    SYNC.path = (s.syncPath || "data/workbench.json").trim();
    SYNC.token = s.token || "";
  }
  function ghHeaders() {
    const h = { "Accept": "application/vnd.github+json" };
    if (SYNC.token) h["Authorization"] = "Bearer " + SYNC.token;
    return h;
  }
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(b64) { return decodeURIComponent(escape(atob(b64.replace(/\s/g, "")))); }

  async function ghPull() {
    if (!SYNC.enabled || !SYNC.repo || !SYNC.token) return false;
    const url = `https://api.github.com/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}?ref=${encodeURIComponent(SYNC.branch)}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.status === 404) { SYNC.sha = null; return true; }      // 云端还没有数据文件，正常
    if (res.status === 401) throw new Error("令牌无效或无权限(401)");
    if (!res.ok) throw new Error("拉取失败 HTTP " + res.status);
    const data = await res.json();
    SYNC.sha = data.sha;
    const payload = JSON.parse(b64dec(data.content));
    Object.values(LS).forEach((k) => { if (payload[k] !== undefined) localStorage.setItem(k, JSON.stringify(payload[k])); });
    return true;
  }
  async function ghPush() {
    if (!SYNC.enabled || !SYNC.repo || !SYNC.token || SYNC.busy) return;
    SYNC.busy = true;
    try {
      const payload = {};
      Object.values(LS).forEach((k) => { const v = localStorage.getItem(k); if (v != null) payload[k] = JSON.parse(v); });
      const body = b64enc(JSON.stringify(payload, null, 2));
      if (SYNC.sha == null) {
        const g = await fetch(`https://api.github.com/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}?ref=${encodeURIComponent(SYNC.branch)}`, { headers: ghHeaders() });
        if (g.ok) SYNC.sha = (await g.json()).sha;
        else if (g.status !== 404) throw new Error("获取文件失败 HTTP " + g.status);
      }
      const url = `https://api.github.com/repos/${encodeURIComponent(SYNC.repo)}/contents/${encodeURIComponent(SYNC.path)}`;
      const req = { message: "sync: workbench data " + new Date().toISOString(), content: body, branch: SYNC.branch };
      if (SYNC.sha) req.sha = SYNC.sha;
      const res = await fetch(url, { method: "PUT", headers: ghHeaders(), body: JSON.stringify(req) });
      if (!res.ok) throw new Error("推送失败 HTTP " + res.status);
      SYNC.sha = (await res.json()).content.sha;
      setSyncStatus("已同步云端（" + new Date().toLocaleTimeString() + "）", true);
    } catch (e) {
      setSyncStatus("同步失败：" + e.message, false);
    } finally { SYNC.busy = false; }
  }
  function scheduleAutoSync() {
    if (!SYNC.enabled) return;
    clearTimeout(SYNC.timer);
    SYNC.timer = setTimeout(() => ghPush(), 1000);
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
    if (view === "news") { renderNews(); renderOriginNews(); }
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
  function renderNews() {
    const newsRaw = read(LS.news, []);
    const news = Array.isArray(newsRaw) ? newsRaw : (newsRaw && Array.isArray(newsRaw.items) ? newsRaw.items : []);
    const box = $("#newsAll");
    if (!news.length) {
      box.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>暂无资讯</div>';
      return;
    }
    box.innerHTML = news.map((n) => renderNewsCard(n)).join("");
  }

  /* 通用中文新闻卡片（左列静态资讯 / 右列原站快讯共用） */
  function renderNewsCard(n) {
    const imp = (n.impact || "").toLowerCase();
    const impact = (imp === "high" || imp === "高影响") ? '<span class="tag red">高影响</span>' : ((imp === "medium" || imp === "中影响") ? '<span class="tag amber">中影响</span>' : (n.impact ? '<span class="tag">低影响</span>' : ""));
    const topics = (n.trendingTopics || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ");
    const loc = n.country || n.category || "";
    return `
    <div class="origin-news-item">
      <div class="on-head">
        ${loc ? `<span class="tag blue">${esc(loc)}</span>` : ""}
        ${n.category ? `<span class="tag">${esc(n.category)}</span>` : ""}
        ${impact}
        ${n.ecommerceImpact ? '<span class="tag green">电商相关</span>' : ""}
      </div>
      <div class="on-title">${esc(n.title)}</div>
      ${n.summary || n.body ? `<div class="on-summary">${esc(n.summary || n.body)}</div>` : ""}
      <div class="on-meta">
        <span>${esc(n.source || "")}</span>
        <span>${esc(n.publishedAt || n.time || "")}</span>
        ${topics}
      </div>
      ${n.url ? `<div class="on-foot"><a class="news-goto" href="${esc(n.url)}" target="_blank" rel="noopener">查看原文 ↗</a></div>` : ""}
    </div>`;
  }

  /* 右列：原站政策快讯（中文快照），与左列共用卡片样式 */
  async function renderOriginNews() {
    const box = $("#newsOrigin");
    if (!box) return;
    if (box.dataset.loaded) return;
    box.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>加载原站政策快讯…</div>';
    try {
      const r = await fetch(ORIGIN_NEWS_URL);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) { box.innerHTML = '<div class="empty">暂无原站快讯</div>'; return; }
      box.innerHTML = arr.map((n) => renderNewsCard(n)).join("");
      box.dataset.loaded = "1";
    } catch (e) {
      box.innerHTML = '<div class="empty">原站快讯加载失败，请检查网络</div>';
    }
  }

  /* 左列静态中文资讯：加载并写入 LS.news 供首页仪表盘复用，无运行时翻译 */
  async function loadStaticNews() {
    if (read(LS.news, null)) return;
    try {
      const r = await fetch(ORIGIN_RSS_ZH_URL);
      if (!r.ok) return;
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
    } catch (e) {}
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
  function renderSettings() {
    const s = getSettings();
    $("#setName").value = s.name || "";
    $("#setSyncOn").checked = !!s.syncEnabled;
    $("#setRepo").value = s.repo || "";
    $("#setBranch").value = s.branch || "main";
    $("#setPath").value = s.syncPath || "data/workbench.json";
    $("#setToken").value = s.token || "";
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
    // 新闻刷新
    const rb = $("#btnRefreshNews");
    if (rb) rb.addEventListener("click", async () => {
      const na = $("#newsAll"), no = $("#newsOrigin");
      if (na) { na.dataset.loaded = ""; na.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>加载中…</div>'; }
      if (no) { no.dataset.loaded = ""; no.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>加载原站政策快讯…</div>'; }
      localStorage.removeItem(LS.news);
      await loadStaticNews();
      renderNews();
      renderOriginNews();
      toast("已刷新资讯");
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
      ["pTitle", "pUrl", "pImg", "pPlatform", "pPrice", "pNote"].forEach((id) => ($("#" + id).value = ""));
      $("#productModal").classList.add("show");
    });
    $("#btnSaveProduct").addEventListener("click", () => {
      const title = $("#pTitle").value.trim(), url = $("#pUrl").value.trim();
      if (!title) { toast("请填写商品名称"); return; }
      const products = read(LS.product, []);
      products.push({ id: uid(), title, url, img: $("#pImg").value.trim(),
        platform: $("#pPlatform").value.trim(), price: $("#pPrice").value.trim(), note: $("#pNote").value.trim() });
      write(LS.product, products);
      $("#productModal").classList.remove("show");
      renderProduct(); toast("已添加商品");
    });

    /* ---- 新闻：点击打开原文 / 切换中英文 ---- */
    $("#newsAll").addEventListener("click", (e) => {
      const tog = e.target.closest("[data-toggle-orig]");
      if (tog) {
        e.preventDefault(); e.stopPropagation();
        const id = tog.dataset.toggleOrig;
        if (newsOrigView.has(id)) newsOrigView.delete(id); else newsOrigView.add(id);
        renderNews();
        return;
      }
      const item = e.target.closest(".news-link[data-url]");
      if (item && item.dataset.url) { e.preventDefault(); window.open(item.dataset.url, "_blank", "noopener"); }
    });

    // 通知
    $("#btnClearNotify").addEventListener("click", () => {
      if (confirm("确定清空所有通知吗？此操作不可恢复")) { write(LS.notify, []); renderNotify(); }
    });

    // 设置
    $("#btnSaveSettings").addEventListener("click", () => {
      const s = getSettings();
      s.name = $("#setName").value.trim();
      s.syncEnabled = $("#setSyncOn").checked;
      s.repo = $("#setRepo").value.trim();
      s.branch = $("#setBranch").value.trim() || "main";
      s.syncPath = $("#setPath").value.trim() || "data/workbench.json";
      s.token = $("#setToken").value;
      write(LS.settings, s);
      loadSyncCfg();
      if (SYNC.enabled && SYNC.repo && SYNC.token) {
        setSyncStatus("正在从云端拉取…", false);
        ghPull().then(() => { setSyncStatus("已从云端同步", true); renderAll(); renderUser(); renderDashboard(); })
                .catch((e) => setSyncStatus("云端拉取失败：" + e.message, false));
      } else {
        setSyncStatus("未启用", false);
      }
      renderUser(); renderDashboard();
      toast("设置已保存");
    });

    $("#btnSyncNow").addEventListener("click", () => {
      if (!SYNC.enabled || !SYNC.repo || !SYNC.token) { toast("请先在上方开启并填写同步信息"); return; }
      setSyncStatus("正在上传到云端…", false);
      ghPush();
    });

    // 导入导出
    $("#btnExport").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });

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
    if (!read(LS.product, null)) {
      const ok = await loadOriginProducts();
      if (!ok) write(LS.product, seedProduct());
    }
    if (!read(LS.tools, null)) write(LS.tools, seedTools());
    bind();
    loadSyncCfg();
    if (SYNC.enabled && SYNC.repo && SYNC.token) {
      setSyncStatus("正在从云端拉取…", false);
      try { await ghPull(); setSyncStatus("已从云端同步", true); }
      catch (e) { setSyncStatus("云端拉取失败：" + e.message, false); }
    }
    renderAll();
    await loadStaticNews();   // 加载预翻译中文资讯（无运行时翻译，秒开）
    renderNews();
    renderDashboard();        // 刷新首页「今日新闻」
    const last = read("cbec_lastview", "dashboard");
    go(["dashboard","tasks","feishu","news","product","tools","notify","settings","user"].includes(last) ? last : "dashboard");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
