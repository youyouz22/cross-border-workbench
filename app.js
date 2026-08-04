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

  /* 真实新闻源：通过 RSS2JSON 免费 API 拉取（无需后端） */
  const NEWS_SOURCES = [
    { topic: "全球跨境电商", feeds: [
      "https://www.practicalecommerce.com/feed",
      "https://www.digitalcommerce360.com/feed/",
      "https://www.modernretail.co/feed/",
    ]},
    { topic: "政策与税务", feeds: [
      "https://www.theguardian.com/world/eu/rss",
      "http://feeds.bbci.co.uk/news/business/rss.xml",
    ]},
  ];
  const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";
  function seedProduct() {
    return [
      { icon: "📈", title: "欧洲市场冬季取暖器销售数据", desc: "含英国、德国、法国等市场的销售数据统计", tag: "销售数据" },
      { icon: "📝", title: "产品调研报告模板", desc: "产品调研的标准报告模板，可直接复制使用", tag: "调研" },
      { icon: "📁", title: "竞品分析文件夹", desc: "存放所有竞品分析文档的文件夹", tag: "竞品分析" },
      { icon: "🧪", title: "选品测试看板", desc: "新选品 AB 测试与转化追踪", tag: "选品" },
      { icon: "💡", title: "爆款复盘库", desc: "历史爆款的上架节奏与推广打法", tag: "复盘" },
      { icon: "🌍", title: "多国合规清单", desc: "英德法西意五国合规与认证要求汇总", tag: "合规" },
    ];
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
    if (view === "news") renderNews();
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
    const news = read(LS.news, []);
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
    const news = read(LS.news, []);
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
        ${list.map((n) => `
          <a class="news-item news-link" ${n.url ? `href="${esc(n.url)}" target="_blank" rel="noopener"` : ""}>
            <div class="news-head">${impactTag(n.impact)}<span class="news-title">${esc(n.title)}</span></div>
            ${n.body ? `<div class="news-body">${esc(n.body)}</div>` : ""}
            <div class="news-meta"><span>${esc(n.source || "")}</span><span>${esc(n.time || "")}</span>${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
            <div class="news-foot"><span class="news-goto">查看原文 ↗</span></div>
          </a>`).join("")}
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
  async function fetchNews() {
    const btn = $("#btnRefreshNews");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ 拉取中..."; }
    const all = [];
    for (const group of NEWS_SOURCES) {
      for (const feed of group.feeds) {
        try {
          const res = await fetch(RSS2JSON + encodeURIComponent(feed));
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status !== "ok" || !data.items) continue;
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
        } catch (e) { /* 单个源失败忽略，继续其他源 */ }
      }
    }
    if (all.length) {
      all.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      write(LS.news, all);
      renderNews();
      renderDashboard();
      const u = $("#newsUpdated");
      if (u) u.textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN");
      toast("已拉取 " + all.length + " 条真实新闻");
    } else {
      toast("拉取失败，可能网络受限或 API 限流，已显示缓存");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🔄 刷新新闻"; }
  }


  /* ---------------- 渲染：产品 / 工具 ---------------- */
  function renderProduct() {
    const items = read(LS.product, []);
    $("#productGrid").innerHTML = items.map((p) => `
      <div class="tool-card">
        <div class="t-ico">${p.icon || "📊"}</div>
        <div class="t-title">${esc(p.title)}</div>
        <div class="t-desc">${esc(p.desc)}</div>
        <span class="tag blue" style="align-self:flex-start">${esc(p.tag || "")}</span>
      </div>`).join("");
  }
  function renderTools() {
    const items = read(LS.tools, []);
    $("#toolGrid").innerHTML = items.map((t) => `
      <a class="tool-card" href="${esc(t.url)}" target="_blank" rel="noopener">
        <div class="t-ico">${t.icon || "🔗"}</div>
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-desc">${esc(t.desc)}</div>
      </a>`).join("");
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
    if (!read(LS.news, null)) write(LS.news, seedNews());
    if (!read(LS.product, null)) write(LS.product, seedProduct());
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
