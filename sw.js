// 산성 서비스 워커. tools/build-web.mjs 가 __VERSION__ 을 바꿔 넣는다.
// 규칙: 게임 파일(index.html)은 이 판 저장본(설치 때 받음), 아이콘·manifest·글꼴은 '저장본 먼저'.
// 새 판은 바로 바꾸지 않고 기다리다가(waiting), 게임 안 '새 판으로 열기'를 누르면 skipWaiting 한다(판 중간에 바뀌지 않게).
const VERSION = "20261122-2b47ebfbbc";
const CACHE = "sanseong-" + VERSION;
const FONT_CACHE = "sanseong-fonts-v1";
const CORE = ["./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

// 설치: 받은 index.html 에 이 워커와 같은 판 표시(meta app-version)가 있어야 한다. 배포 도중이라 옛 index.html 이 오면
// 설치를 실패시켜(저장본도 지움) 다음 갱신 확인 때 다시 받는다 → 새 워커가 옛 게임 파일을 붙들고 있는 일이 없다.
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    try {
      const res = await fetch(new Request("./index.html", {cache: "reload"}));
      if (!res.ok) throw new Error("index.html " + res.status);
      const txt = await res.clone().text();
      if (!txt.includes('<meta name="app-version" content="' + VERSION + '">')) throw new Error("판이 안 맞음");
      const c = await caches.open(CACHE);
      await c.addAll(CORE.filter(u => u !== "./index.html").map(u => new Request(u, {cache: "reload"})));
      await c.put("./index.html", res);
    } catch (err) { await caches.delete(CACHE); throw err; }
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("sanseong-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "skipWaiting") self.skipWaiting();
  else if (d.type === "version" && e.ports && e.ports[0]) e.ports[0].postMessage({version: VERSION}); // 화면 판과 비교용
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 글꼴(구글 폰트): 저장본 먼저, 없으면 받아서 저장
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const res = await fetch(req); if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
  if (isPage) {
    // 게임 파일: 이 서비스 워커 판에 맞는 저장본만 낸다(설치 때 받아 둠). 새 판은 새 서비스 워커가 설치되며 따로 받고,
    // 사용자가 '새 판으로 열기'를 누르거나 모든 창이 닫힌 뒤 바뀐다 → 온라인/오프라인에 따라 판이 오락가락하지 않는다.
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match("./index.html"); if (hit) return hit;
      try { return await fetch(req); } catch (err) { return Response.error(); }
    })());
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req)));
});


