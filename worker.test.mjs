import test from 'node:test';
import assert from 'node:assert/strict';
import edgeFunction from './netlify/edge-functions/entry.js';

const GAME = 'https://udl-game-as9irin.netlify.app';
const SLOT = 'https://udl-slot-as9irin.netlify.app';
const HUB = 'https://udl-colleague-play.ababyabyaby.chatgpt.site';
const ORIGINAL_SLOT = 'https://udl-slot-machine.ababyabyaby.chatgpt.site';
const realFetch = globalThis.fetch;

async function mockFetch(implementation, check) {
  globalThis.fetch = implementation;
  try { await check(); } finally { globalThis.fetch = realFetch; }
}

test('入口仅转发固定游戏主机；文本链接及跳转使用同一账户的入口', async () => {
  await mockFetch(async (url, init) => {
    assert.equal(new URL(url).origin, HUB);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    return new Response(`<a href="${ORIGINAL_SLOT}/auth/start">老虎机</a><script>const hub=${JSON.stringify(HUB)};</script>`, {
      headers: {'Content-Type': 'text/html; charset=utf-8', 'ETag': 'old'}
    });
  }, async () => {
    const response = await edgeFunction(new Request(GAME + '//unrelated.example/?url=https://unrelated.example'));
    const html = await response.text();
    assert.ok(html.includes(SLOT + '/auth/start'));
    assert.ok(html.includes(GAME));
    assert.ok(!html.includes('.chatgpt.site'));
    assert.equal(response.headers.get('ETag'), null);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-UDL-Entry'), 'udl-entry-2026-10-03-netlify-v1');
  });
});

test('保留手机号登录的请求体和会话 Cookie；不转发伪造身份或后台授权', async () => {
  await mockFetch(async (url, init) => {
    assert.equal(url, HUB + '/api/login');
    assert.equal(init.headers.get('Origin'), HUB);
    assert.equal(init.headers.get('Sec-Fetch-Site'), 'same-origin');
    assert.equal(init.headers.get('oai-authenticated-user-id'), null);
    assert.equal(init.headers.get('oai-authenticated-user-email'), null);
    assert.equal(init.headers.get('Authorization'), null);
    assert.equal(init.headers.get('Cookie'), 'udl_player=synthetic-only');
    assert.equal(await new Response(init.body).text(), '{"phone_last4":"0000"}');
    const headers = new Headers({'Content-Type': 'application/json'});
    headers.append('Set-Cookie', 'udl_player=synthetic-new; Domain=chatgpt.site; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800');
    headers.append('Set-Cookie', 'udl_theme=dark; Domain=chatgpt.site; Path=/; Secure; SameSite=Lax');
    headers.append('Set-Cookie', '__cf_bm=synthetic-bot; Domain=chatgpt.site; Path=/; Secure');
    return new Response('{"ok":true}', {headers});
  }, async () => {
    const response = await edgeFunction(new Request(GAME + '/api/login', {
      method: 'POST', headers: {
        'Content-Type': 'application/json', Origin: GAME, 'Sec-Fetch-Site': 'same-origin',
        Cookie: 'udl_player=synthetic-only; __cf_bm=synthetic-bot',
        'oai-authenticated-user-id': 'synthetic-owner',
        'oai-authenticated-user-email': 'synthetic@example.invalid',
        Authorization: 'Bearer synthetic-only'
      }, body: '{"phone_last4":"0000"}'
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {ok: true});
    const values = response.headers.getSetCookie();
    assert.equal(values.length, 2);
    assert.ok(values[0].includes('udl_player=synthetic-new'));
    assert.ok(values[0].includes('HttpOnly; Secure; SameSite=Lax'));
    assert.ok(!values[0].includes('Domain='));
    assert.ok(values[1].includes('udl_theme=dark'));
    assert.ok(!values[1].includes('Domain='));
  });
});

test('外站请求及缺失来源的 POST 在触及原游戏前被拒绝', async () => {
  let count = 0;
  await mockFetch(async () => { count++; throw Error('must not fetch'); }, async () => {
    for (const headers of [{}, {Origin: 'https://unrelated.example'},
      {Origin: GAME, 'Sec-Fetch-Site': 'cross-site'}]) {
      const response = await edgeFunction(new Request(GAME + '/api/login', {
        method: 'POST', headers, body: '{}'
      }));
      assert.equal(response.status, 403);
    }
    assert.equal(count, 0);
  });
});

test('老虎机开始、主站票据、老虎机回调保持独立主机并保留原参数', async () => {
  await mockFetch(async (url, init) => {
    const target = new URL(url);
    assert.equal(init.redirect, 'manual');
    const headers = new Headers();
    if (target.origin === ORIGINAL_SLOT && target.pathname === '/auth/start') {
      headers.set('Location', HUB + '/games/slot?state=synthetic-state');
      headers.append('Set-Cookie', 'slot_login_state=synthetic-only; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=120');
    } else if (target.origin === HUB && target.pathname === '/games/slot') {
      assert.equal(target.searchParams.get('state'), 'synthetic-state');
      headers.set('Location', ORIGINAL_SLOT + '/auth/callback?state=synthetic-state&code=synthetic-code');
    } else {
      assert.equal(target.origin, ORIGINAL_SLOT);
      assert.equal(target.pathname, '/auth/callback');
      assert.equal(target.searchParams.get('state'), 'synthetic-state');
      assert.equal(target.searchParams.get('code'), 'synthetic-code');
      assert.equal(init.headers.get('Cookie'), 'slot_login_state=synthetic-only');
      headers.set('Location', '/');
      headers.append('Set-Cookie', 'slot_session=synthetic-only; Path=/; HttpOnly; Secure; SameSite=Lax');
    }
    return new Response(null, {status: 302, headers});
  }, async () => {
    const start = await edgeFunction(new Request(SLOT + '/auth/start'));
    assert.equal(start.status, 302);
    assert.equal(start.headers.get('Location'), GAME + '/games/slot?state=synthetic-state');
    assert.equal(start.headers.getSetCookie().length, 1);
    const ticket = await edgeFunction(new Request(start.headers.get('Location')));
    assert.equal(ticket.headers.get('Location'), SLOT + '/auth/callback?state=synthetic-state&code=synthetic-code');
    const callback = await edgeFunction(new Request(ticket.headers.get('Location'), {
      headers: {Cookie: 'slot_login_state=synthetic-only'}
    }));
    assert.equal(callback.headers.get('Location'), '/');
    assert.ok(callback.headers.getSetCookie()[0].includes('slot_session='));
  });
});

test('私有头像和失败状态不被解锁、缓存或改成测试成功；二进制保持原字节', async () => {
  const bytes = new Uint8Array([0, 255, 1, 128, 42]);
  await mockFetch(async (url, init) => {
    if (!init.headers.get('Cookie')) return new Response(null, {status: 401});
    return new Response(bytes, {headers: {'Content-Type': 'image/png'}});
  }, async () => {
    const denied = await edgeFunction(new Request(GAME + '/avatars/private.png'));
    assert.equal(denied.status, 401);
    const allowed = await edgeFunction(new Request(GAME + '/avatars/private.png', {
      headers: {Cookie: 'udl_player=synthetic-only'}
    }));
    assert.deepEqual(new Uint8Array(await allowed.arrayBuffer()), bytes);
    assert.equal(allowed.headers.get('Cache-Control'), 'private, no-store');
  });
  await mockFetch(async () => new Response('upstream blocked', {status: 403}), async () => {
    const blocked = await edgeFunction(new Request(GAME + '/login'));
    assert.equal(blocked.status, 403);
    assert.equal(await blocked.text(), 'upstream blocked');
  });
});

test('内部共享接口不可从新入口访问；管理界面转回原地址并保留权限流程', async () => {
  let count = 0;
  await mockFetch(async () => { count++; throw Error('must not fetch'); }, async () => {
    for (const path of ['/api/shared/redeem', '/api/shared/check', '/api/media-seed']) {
      assert.equal((await edgeFunction(new Request(GAME + path))).status, 404);
    }
    const admin = await edgeFunction(new Request(GAME + '/admin'));
    assert.equal(admin.status, 302);
    assert.equal(admin.headers.get('Location'), HUB + '/admin');
    const write = await edgeFunction(new Request(GAME + '/api/admin/players', {
      method: 'POST', headers: {Origin: GAME}, body: '{}'
    }));
    assert.equal(write.status, 403);
    assert.equal(count, 0);
  });
});

test('JSON 转义网址和 CSP 同步替换，根目录资源路径保持不变', async () => {
  await mockFetch(async () => new Response(JSON.stringify({
    hub: HUB, path: '/api/me'
  }).replaceAll('/', '\\/'), {headers: {
    'Content-Type': 'application/json',
    'Content-Security-Policy': `default-src 'self'; connect-src ${HUB} ${ORIGINAL_SLOT}`,
    'Content-Encoding': 'identity', 'Content-Length': '999'
  }}), async () => {
    const result = await edgeFunction(new Request(GAME + '/metadata.json'));
    const body = await result.json();
    assert.equal(body.hub, GAME);
    assert.equal(body.path, '/api/me');
    assert.equal(result.headers.get('Content-Length'), null);
    assert.equal(result.headers.get('Content-Encoding'), null);
    assert.equal(result.headers.get('Content-Security-Policy'), `default-src 'self'; connect-src ${GAME} ${SLOT}`);
  });
});

test('无效部署名称、错误方法和原站网络失败均明确失败', async () => {
  assert.equal((await edgeFunction(new Request('https://udl-game-as9irin--deploy-preview-123.netlify.app/login'))).status, 503);
  assert.equal((await edgeFunction(new Request('https://udl-game-other.netlify.app/login'))).status, 503);
  assert.equal((await edgeFunction(new Request('https://udl-game-as9irin.netlify.app.attacker.invalid/login'))).status, 503);
  assert.equal((await edgeFunction(new Request('http://udl-game-as9irin.netlify.app/login'))).status, 503);
  assert.equal((await edgeFunction(new Request(GAME + '/login', {method: 'DELETE'}))).status, 405);
  await mockFetch(async () => { throw Error('synthetic network failure'); }, async () => {
    assert.equal((await edgeFunction(new Request(GAME + '/login'))).status, 502);
  });
});

test('HEAD 请求转发到固定上游并保持无响应体', async () => {
  await mockFetch(async (url, init) => {
    assert.equal(url, HUB + '/login?return=%2F');
    assert.equal(init.method, 'HEAD');
    assert.equal(init.body, undefined);
    return new Response(null, {status: 200, headers: {'Content-Type': 'text/html'}});
  }, async () => {
    const response = await edgeFunction(new Request(GAME + '/login?return=%2F', {method: 'HEAD'}), {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });
});
