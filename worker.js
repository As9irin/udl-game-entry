// UDL 游戏反向代理逻辑，由 Netlify Edge Function wrapper 调用。
const ORIGINAL = {
  game: 'https://udl-colleague-play.ababyabyaby.chatgpt.site',
  slot: 'https://udl-slot-machine.ababyabyaby.chatgpt.site'
};
const VERSION = 'udl-entry-2026-10-03-netlify-v2';
const REQUEST_HEADERS = [
  'accept', 'accept-language', 'content-type', 'range',
  'cookie', 'user-agent', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'
];

function message(text, status) {
  return new Response(text, {status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-UDL-Entry': VERSION
  }});
}

function entryConfig(url) {
  if (url.protocol !== 'https:') return null;
  const role = url.hostname === 'playgameaby.netlify.app' ? 'game' :
    url.hostname === 'udl-slot-as9irin.netlify.app' ? 'slot' : null;
  if (!role) return null;
  return {role, entries: {
    game: 'https://playgameaby.netlify.app',
    slot: 'https://udl-slot-as9irin.netlify.app'
  }};
}

function rewriteOwnedOrigins(text, entries) {
  for (const role of ['game', 'slot']) {
    const old = ORIGINAL[role], next = entries[role];
    text = text.split(old).join(next);
    // JSON 中的转义斜杠，以及 HTML/CSS 中省略协议的完整网址。
    text = text.split(old.replaceAll('/', '\\/')).join(next.replaceAll('/', '\\/'));
    text = text.split(old.slice(6)).join(next.slice(6));
  }
  return text;
}

function cookies(headers) {
  // Deno Fetch Headers provides getSetCookie() and keeps each cookie separate.
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  return headers.has('Set-Cookie') ? [headers.get('Set-Cookie')] : [];
}

export async function handle(request) {
    const url = new URL(request.url), config = entryConfig(url);
    if (!config) return message('请访问正式的 Netlify 游戏入口域名。', 503);
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) return message('此入口不支持该请求。', 405);
    const upstream = new URL(ORIGINAL[config.role]);
    // 逐项赋值，任何输入路径或查询参数都不能替换固定的上游主机。
    upstream.pathname = url.pathname;
    upstream.search = url.search;

    const internal = /^\/api\/(shared(?:\/|$)|media-seed(?:\/|$))/.test(url.pathname);
    if (internal) return message('此路径不对外开放。', 404);
    const admin = /^\/admin(?:\/|\.|$)/.test(url.pathname) ||
      /^\/api\/admin(?:\/|$)/.test(url.pathname) || url.pathname === '/signin-with-chatgpt';
    if (admin) {
      if (request.method === 'POST') return message('请从原地址管理游戏。', 403);
      return new Response(null, {status: 302, headers: {
        Location: upstream.href, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer'
      }});
    }

    const incomingOrigin = request.headers.get('Origin');
    if (request.method === 'POST' &&
        (incomingOrigin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) {
      return message('请求来源不符，请重新打开游戏。', 403);
    }

    // 仅转发游戏请求所需的头；从客户端传来的所有 Sites 身份头都被排除。
    const headers = new Headers();
    for (const key of REQUEST_HEADERS) {
      const value = request.headers.get(key);
      if (value !== null) headers.set(key, value);
    }
    // Cloudflare 自己的浏览器验证 Cookie 不复制到另一个站点。
    if (headers.has('Cookie')) {
      const value = headers.get('Cookie').split(';').filter(item =>
        !/^\s*(?:__cf_|cf_clearance=)/i.test(item)).join(';');
      if (value.trim()) headers.set('Cookie', value); else headers.delete('Cookie');
    }
    if (incomingOrigin === url.origin) {
      headers.set('Origin', upstream.origin);
      headers.set('Sec-Fetch-Site', 'same-origin');
    }
    headers.set('Accept-Encoding', 'identity');
    headers.set('Cache-Control', 'no-store');

    let response;
    try {
      /** @type {RequestInit} */
      const init = {
        method: request.method, headers, redirect: 'manual', cache: 'no-store',
        signal: AbortSignal.timeout(20000)
      };
      if (request.method === 'POST') init.body = request.body;
      response = await fetch(upstream.href, init);
    } catch {
      return message('暂时无法连接原游戏，请稍后重试。', 502);
    }

    const output = new Headers(response.headers);
    output.delete('Set-Cookie');
    for (const value of cookies(response.headers)) {
      if (/^(?:__cf_|cf_clearance=)/i.test(value.trim())) continue;
      // 使用当前入口的主机；保留 HttpOnly、Secure、SameSite、有效期和删除指令。
      output.append('Set-Cookie', value.replace(/;\s*Domain=[^;]*/ig, ''));
    }
    for (const key of ['Location', 'Refresh', 'Link', 'Content-Security-Policy',
        'Content-Security-Policy-Report-Only', 'Access-Control-Allow-Origin']) {
      if (output.has(key)) output.set(key, rewriteOwnedOrigins(output.get(key), config.entries));
    }
    output.set('Cache-Control', 'private, no-store');
    output.set('Referrer-Policy', 'no-referrer');
    output.set('X-UDL-Entry', VERSION);
    // 不启用后台日志、分析、IP 记录或额外存储。
    output.delete('Report-To');
    output.delete('NEL');
    output.delete('Reporting-Endpoints');
    output.delete('ETag');

    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(response.status);
    const type = output.get('Content-Type') || '';
    const rewriteText = !noBody && response.status !== 206 &&
      /^(?:text\/(?:html|css|javascript)|application\/(?:javascript|json|manifest\+json))/i.test(type);
    if (rewriteText) {
      const body = rewriteOwnedOrigins(await response.text(), config.entries);
      output.delete('Content-Length');
      output.delete('Content-Encoding');
      return new Response(body, {status: response.status, statusText: response.statusText, headers: output});
    }
    return new Response(noBody ? null : response.body, {
      status: response.status, statusText: response.statusText, headers: output
    });
}
