/**
 * GitHub 同步代理 Worker（Cloudflare）
 * --------------------------------------------------
 * 用途：公司网可能拦截浏览器对 api.github.com 的跨域预检请求（带 Authorization 的 OPTIONS），
 *       导致前端直连 GitHub API 报 Failed to fetch。本 Worker 部署在 Cloudflare，
 *       由 Worker 服务端转发请求到 GitHub，绕开本地网络限制。
 *
 * 部署步骤：
 *   1. 打开 https://dash.cloudflare.com/  →  Workers & Pages  →  创建 Worker（免费）。
 *   2. 把本文件内容粘贴替换默认代码，保存并部署，得到形如 https://cbec-sync.xxx.workers.dev 的地址。
 *   3. 网站「设置」页 → 填入「同步代理地址」→ 保存 → 立即同步。
 *
 * 工作原理：
 *   前端把 { method, path, token, body } 用 POST 发到本 Worker（简单请求，不触发预检）。
 *   Worker 在云端用对应 method 转发到 https://api.github.com{path}，带上 token，
 *   并把 GitHub 的 { status, body } 原样返回。前端与 GitHub 之间不再有浏览器跨域限制。
 */
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed. POST only.", { status: 405 });
    }
    let msg;
    try {
      msg = await request.json();
    } catch (e) {
      return new Response("Bad Request: invalid JSON", { status: 400 });
    }
    const { method, path, token, body } = msg || {};
    if (!method || !path || !token) {
      return new Response("Bad Request: need method, path, token", { status: 400 });
    }
    if (!path.startsWith("/")) {
      return new Response("Bad Request: path must start with /", { status: 400 });
    }

    const ghRes = await fetch("https://api.github.com" + path, {
      method,
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json",
        "User-Agent": "cbec-sync-proxy",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body !== null && body !== undefined ? JSON.stringify(body) : undefined,
    });

    let parsed = null;
    try { parsed = await ghRes.json(); } catch (e) { /* 非 JSON 响应忽略 */ }

    return new Response(JSON.stringify({ status: ghRes.status, body: parsed }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
