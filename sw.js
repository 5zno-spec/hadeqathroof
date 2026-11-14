/* يعمل التطبيق بلا إنترنت: تُخزَّن الملفات عند أول زيارة ثم تُقدَّم من الجهاز */
const VERSION = 'v5';
const CACHE = 'harfi-' + VERSION;
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'audio/praise/a7sant.mp3', 'audio/praise/rae3.mp3', 'audio/praise/barak-allah-feek.mp3', 'audio/praise/batal.mp3', 'audio/praise/3zeem.mp3', 'audio/praise/mmtaz.mp3',
  'img/logo.webp', 'img/favicon-32.png', 'img/apple-touch-icon.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-192.png', 'img/icon-maskable-512.png'
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('harfi-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Safari يطلب الصوت على أجزاء (Range)، فنقتطع الجزء المطلوب من الملف المخزَّن */
async function rangeResponse(req, res){
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if(!m || !res || res.status !== 200) return res;
  const buf = await res.arrayBuffer();
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + buf.byteLength,
      'Content-Length': String(end - start + 1)
    }
  });
}

/* مفتاح التخزين: الرابط دون الاستعلام (?...) حتى لا تتكرر نسخ الملف نفسه */
const keyOf = url => new Request(url.origin + url.pathname);

/* الصفحة: من الشبكة أولًا (فيرى المستخدم آخر نسخة فورًا)، ومن الجهاز عند انقطاع الإنترنت أو بطئه */
async function page(req, url, cache){
  const fromCache = async () =>
    (await cache.match(keyOf(url))) || (await cache.match('./')) || (await cache.match('index.html'));
  try{
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))
    ]);
    if(res && res.status === 200) cache.put(keyOf(url), res.clone()).catch(() => {});
    return res;
  }catch(err){
    return (await fromCache()) || new Response('', {status: 504, statusText: 'Offline'});
  }
}

/* بقية الملفات: من الجهاز أولًا ولا يُعاد تنزيلها ما دامت محفوظة (تتجدد عند تغيير VERSION).
   عند أول طلب يُنزَّل الملف كاملًا (لا جزءًا) ليُحفظ، ثم يُقتطع منه ما طلبه Safari */
async function asset(req, url, sameOrigin, cache){
  const key = sameOrigin ? keyOf(url) : req;
  let res = await cache.match(key, {ignoreVary: true});
  if(!res){
    try{
      res = await fetch(sameOrigin ? url.origin + url.pathname : req);
    }catch(err){
      return new Response('', {status: 504, statusText: 'Offline'});
    }
    if(res && (res.status === 200 || res.type === 'opaque')) cache.put(key, res.clone()).catch(() => {});
  }
  return req.headers.get('range') ? rangeResponse(req, res) : res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if(!sameOrigin && !FONT_HOSTS.includes(url.hostname)) return;
  e.respondWith(caches.open(CACHE).then(cache =>
    req.mode === 'navigate' ? page(req, url, cache) : asset(req, url, sameOrigin, cache)
  ));
});
