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
  /* 原站跨境政策快讯（参考同事站点 news.json）—— 与我的实时 RSS 资讯并列展示 */
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
      box.innerHTML = arr.map((n) => {
        const impact = n.impact === "high" ? '<span class="tag red">高影响</span>' : (n.impact === "medium" ? '<span class="tag amber">中影响</span>' : '<span class="tag">低影响</span>');
        const topics = (n.trendingTopics || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ");
        return `
        <div class="origin-news-item">
          <div class="on-head">
            <span class="tag blue">${esc(n.country || "—")}</span>
            <span class="tag">${esc(n.category || "—")}</span>
            ${impact}
            ${n.ecommerceImpact ? '<span class="tag green">电商相关</span>' : ""}
          </div>
          <div class="on-title">${esc(n.title)}</div>
          ${n.summary ? `<div class="on-summary">${esc(n.summary)}</div>` : ""}
          <div class="on-meta">
            <span>${esc(n.source || "")}</span>
            <span>${esc(n.publishedAt || "")}</span>
            ${topics}
          </div>
          ${n.url ? `<div class="on-foot"><a class="news-goto" href="${esc(n.url)}" target="_blank" rel="noopener">查看原文 ↗</a></div>` : ""}
        </div>`;
      }).join("");
      box.dataset.loaded = "1";
    } catch (e) {
      box.innerHTML = '<div class="empty">原站快讯加载失败，请检查网络</div>';
    }
  }

  function renderNews() {
    const newsRaw = read(LS.news, []);
    const news = Array.isArray(newsRaw) ? newsRaw : (newsRaw && Array.isArray(newsRaw.items) ? newsRaw.items : []);
    const topics = NEWS_SOURCES.map((s) => s.topic);
    const box = $("#newsAll");
    if (!news.length) {
      box.innerHTML = '<div class="empty"><div class="empty-ico">📰</div>暂无新闻，点右上角「刷新新闻」拉取真实头条</div>';
      return;
    }
    box.innerHTML = topics.map((t) => {
      const list = news.filter((n) => n.topic === t);
      if (!list.length) return "";
      return `
      <div class="card mt-16">
        <div class="card-head"><div class="card-title">${esc(t)}</div><span class="tag">${list.length} 条</span></div>
        ${list.map((n) => {
          const hasZh = !isMostlyChinese(n.title) && n.titleZh && n.titleZh !== n.title;
          const showOrig = newsOrigView.has(n.id);
          const title = showOrig ? n.title : (n.titleZh || n.title);
          const body = showOrig ? (n.body || "") : (n.bodyZh || n.body || "");
          return `
          <div class="news-item news-link" ${n.url ? `data-url="${esc(n.url)}"` : ""} style="cursor:${n.url ? "pointer" : "default"}">
            <div class="news-head">${impactTag(n.impact)}<span class="news-title">${esc(title)}</span>
              ${hasZh ? `<span class="news-toggle" data-toggle-orig="${n.id}">${showOrig ? "🌐 中文" : "🌐 原文"}</span>` : ""}
            </div>
            ${body ? `<div class="news-body">${esc(body)}</div>` : ""}
            ${showOrig && hasZh ? `<div class="news-lang">— 原文 —</div>` : ""}
            <div class="news-meta"><span>${esc(n.source || "")}</span><span>${esc(n.time || "")}</span>${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
            <div class="news-foot"><span class="news-goto">查看原文 ↗</span></div>
          </div>`;
        }).join("")}
      </div>`;
    }).join("");
  }

  /* ---------------- 真实新闻拉取（RSS2JSON，无后端） ---------------- */
  function stripHtml(s) { return (s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }
  function relTime(d) {
    if (!d) return "";
    const t = new Date(d).getTime();
    if (isNaN(t)) return "";
    const diff = (Date.now() - t) / 1000;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + " 分钟前";
    if (diff < 86400) return Math.round(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.round(diff / 86400) + " 天前";
    return new Date(t).toLocaleDateString("zh-CN");
  }
  function estimateImpact(text) {
    const t = (text || "").toLowerCase();
    if (/vat|税|关税|合规|法规|政策|ban|fine|罚款|海关|customs|制裁|监管/.test(t)) return "高影响";
    if (/增长|趋势|trend|growth|launch|发布|上线|expansion|rise|surge|boom/.test(t)) return "中影响";
    return "低影响";
  }
  /* ---------------- 新闻翻译（免费 MyMemory API，无需密钥） ---------------- */
  const newsOrigView = new Set();      // 当前选择查看原文的新闻 id
  const _trCache = new Map();
  function isMostlyChinese(s) { const m = (s || "").match(/[一-鿿]/g); return m && m.length / Math.max(1, (s || "").length) > 0.4; }
  async function translateText(text, to = "zh-CN") {
    text = (text || "").trim();
    if (!text) return text;
    if (isMostlyChinese(text)) return text;       // 已经是中文，跳过，省额度
    if (_trCache.has(text)) return _trCache.get(text);
    try {
      const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=" + encodeURIComponent("en|" + to);
      const r = await fetch(url);
      const d = await r.json();
      const t = d && d.responseData && d.responseData.translatedText;
      if (t && !/MYMEMORY WARNING/.test(t)) { _trCache.set(text, t); return t; }
    } catch (e) { /* 网络错误回退原文 */ }
    return text;
  }
  async function fetchNews(force = false) {
    const btn = $("#btnRefreshNews");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ 拉取中..."; }
    const u = $("#newsUpdated");
    const all = [];
    let lastErr = "";
    for (const group of NEWS_SOURCES) {
      for (const feed of group.feeds) {
        try {
          const res = await fetch(RSS2JSON + encodeURIComponent(feed), { cache: force ? "no-cache" : "default" });
          if (!res.ok) { lastErr = "网络错误 " + res.status; continue; }
          const data = await res.json();
          if (data.status !== "ok" || !data.items) { lastErr = data.message || "RSS 解析失败"; continue; }
          data.items.slice(0, 6).forEach((it) => {
            all.push({
              id: uid(),
              topic: group.topic,
              impact: estimateImpact(it.title + " " + (it.description || "")),
              title: stripHtml(it.title),
              body: stripHtml(it.description || "").slice(0, 140),
              tags: [],
              source: data.feed && data.feed.title ? data.feed.title : group.topic,
              url: it.link,
              time: relTime(it.pubDate),
              pubDate: it.pubDate,
            });
          });
        } catch (e) { lastErr = e.message || "请求失败"; }
      }
    }
    if (all.length) {
      all.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      if (btn) { btn.disabled = true; btn.textContent = "🔤 翻译中..."; }
      for (const it of all) {
        if (!isMostlyChinese(it.title)) { it.titleZh = await translateText(it.title); await wait(100); }
        if (!isMostlyChinese(it.body)) { it.bodyZh = await translateText(it.body); await wait(100); }
      }
      write(LS.news, { version: NEWS_CACHE_VERSION, items: all });
      renderNews();
      renderDashboard();
      if (u) u.textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN");
      toast("已拉取并翻译 " + all.length + " 条新闻");
    } else {
      const msg = "拉取失败" + (lastErr ? "：" + lastErr : "，可能网络受限或 API 限流");
      if (u) u.textContent = msg;
      toast(msg + "，已显示缓存/示例");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🔄 刷新新闻"; }
  }


  /* ---------------- 渲染：产品 / 工具 ---------------- */
  const compareSel = new Set();
  let productSelectMode = false;
  function renderProduct() {
    const items = read(LS.product, []);
    const grid = $("#productGrid");
    const btn = $("#btnSelectProduct");
    if (btn) {
      btn.textContent = productSelectMode ? "✓ 完成" : "☑️ 选择";
      btn.classList.toggle("btn-primary", productSelectMode);
    }
    grid.classList.toggle("select-mode", productSelectMode);
    if (!items.length) {
      grid.innerHTML = '<div class="empty"><div class="empty-ico">📦</div>还没有商品，点右上角「＋ 添加商品」粘贴链接</div>';
      updateCompareBar();
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
        <input type="checkbox" class="product-check" data-pid="${p.id}" ${compareSel.has(p.id) ? "checked" : ""} title="加入对比" />
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
    updateCompareBar();
  }
  function updateCompareBar() {
    const bar = $("#compareBar");
    if (!bar) return;
    const n = compareSel.size;
    $("#compareCount").textContent = n;
    bar.style.display = n >= 2 ? "flex" : "none";
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
    const rb = $("#btnRefreshNews"); if (rb) rb.addEventListener("click", fetchNews);

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

    /* ---- 产品分析：添加 / 删除 / 对比 ---- */
    $("#btnSelectProduct").addEventListener("click", () => {
      productSelectMode = !productSelectMode;
      renderProduct();
    });
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
    $("#productGrid").addEventListener("click", (e) => {
      const del = e.target.dataset.delProduct; if (del) {
        e.stopPropagation();
        if (confirm("确定删除这个商品吗？")) {
          write(LS.product, read(LS.product, []).filter((p) => p.id !== del));
          compareSel.delete(del); renderProduct();
        }
      }
    });
    $("#productGrid").addEventListener("change", (e) => {
      const pid = e.target.dataset.pid; if (!pid) return;
      if (e.target.checked) compareSel.add(pid); else compareSel.delete(pid);
      updateCompareBar();
    });
    $("#btnClearCompare").addEventListener("click", () => { compareSel.clear(); renderProduct(); });
    $("#btnDoCompare").addEventListener("click", () => {
      const all = read(LS.product, []);
      const sel = all.filter((p) => compareSel.has(p.id));
      if (sel.length < 2) { toast("至少选择 2 件商品再对比"); return; }
      const cols = sel.length + 1;
      const row = (label, fn) => `<div class="c-label">${label}</div>` + sel.map((p) => `<div>${fn(p)}</div>`).join("");
      $("#compareTable").innerHTML = `<div class="compare-wrap"><div class="compare-grid" style="grid-template-columns:repeat(${cols},minmax(150px,1fr))">
        <div class="c-head">对比维度</div>${sel.map((p) => `<div class="c-head">${esc(p.title)}</div>`).join("")}
        ${row("平台 / 来源", (p) => esc(p.platform || "—"))}
        ${row("类目", (p) => esc(p.category || "—"))}
        ${row("售价", (p) => esc(p.price || "—"))}
        ${row("1688采购价", (p) => p.alibabaPrice != null && p.alibabaPrice !== "" ? "$" + esc(p.alibabaPrice) : "—")}
        ${row("销量增长", (p) => p.salesGrowth != null && p.salesGrowth !== "" ? "+" + esc(p.salesGrowth) + "%" : "—")}
        ${row("评分", (p) => p.rating != null && p.rating !== "" ? esc(p.rating) + "⭐" : "—")}
        ${row("链接", (p) => { const u = productUrl(p); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">🔗 打开</a>` : "—"; })}
        ${row("备注", (p) => esc(p.note || "—"))}
      </div></div>`;
      $("#compareModal").classList.add("show");
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
    // 缓存结构升级时自动清掉旧本地新闻（避免显示过期示例）
    const newsRaw = read(LS.news, null);
    const newsVer = newsRaw && !Array.isArray(newsRaw) ? newsRaw.version : 0;
    if (!newsRaw || newsVer < NEWS_CACHE_VERSION) write(LS.news, seedNews());
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
    fetchNews(); // 启动时自动拉取真实新闻（失败则保留离线示例）
    const last = read("cbec_lastview", "dashboard");
    go(["dashboard","tasks","feishu","news","product","tools","notify","settings","user"].includes(last) ? last : "dashboard");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
