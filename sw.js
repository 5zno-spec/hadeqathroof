/* يعمل التطبيق بلا إنترنت: تُخزَّن الملفات عند أول زيارة ثم تُقدَّم من الجهاز */
const VERSION = 'v10';
const CACHE = 'harfi-' + VERSION;
/* تسجيلات الحروف الـ 28 (تُحفظ عند التثبيت فتعمل دون إنترنت من أول مرة) */
const LETTERS = ['01_Alef', '02_baa', '03_taa', '04_thaa', '05_geem', '06_haa', '07_khaa', '08_dal', '09_zal', '10_raa', '11_zay', '12_seen', '13_sheen', '14_sad', '15_dad', '16_taaa', '17_zaa', '18_ayn', '19_ghyn', '20_faa', '21_qaf', '22_kaf', '23_lam', '24_mem', '25_noon', '26_haa', '27_waw', '28_yaa'];
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'audio/praise/a7sant.mp3', 'audio/praise/rae3.mp3', 'audio/praise/barak-allah-feek.mp3', 'audio/praise/batal.mp3', 'audio/praise/3zeem.mp3', 'audio/praise/mmtaz.mp3',
  ...LETTERS.map(n => 'audio/' + n + '.mp3'),
  ...['01_Alef','01_Alef_2','02_baa','02_baa_2','03_taa','03_taa_2','04_thaa','04_thaa_2','05_geem','05_geem_2','06_haa','06_haa_2','07_khaa','07_khaa_2','08_dal','08_dal_2','09_zal','09_zal_2','10_raa','10_raa_2','11_zay','11_zay_2','12_seen','12_seen_2','13_sheen','13_sheen_2','14_sad','14_sad_2','15_dad','15_dad_2','16_taaa','16_taaa_2','17_zaa','17_zaa_2','18_ayn','18_ayn_2','19_ghyn','19_ghyn_2','20_faa','20_faa_2','21_qaf','21_qaf_2','22_kaf','22_kaf_2','23_lam','23_lam_2','24_mem','24_mem_2','25_noon','25_noon_2','26_haa','26_haa_2','27_waw','27_waw_2','28_yaa','28_yaa_2'].map(n => 'audio/words/' + n + '.mp3'),
  ...['01_Alef','01_Alef_2','02_baa','02_baa_2','03_taa','03_taa_2','04_thaa','04_thaa_2','05_geem','05_geem_2','06_haa','06_haa_2','07_khaa','07_khaa_2','08_dal','08_dal_2','09_zal','09_zal_2','10_raa','10_raa_2','11_zay','11_zay_2','12_seen','12_seen_2','13_sheen','13_sheen_2','14_sad','14_sad_2','15_dad','15_dad_2','16_taaa','16_taaa_2','17_zaa','17_zaa_2','18_ayn','18_ayn_2','19_ghyn','19_ghyn_2','20_faa','20_faa_2','21_qaf','21_qaf_2','22_kaf','22_kaf_2','23_lam','23_lam_2','24_mem','24_mem_2','25_noon','25_noon_2','26_haa','26_haa_2','27_waw','27_waw_2','28_yaa','28_yaa_2'].map(n => 'img/words/' + n + '.webp'),
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
