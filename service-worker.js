// service-worker.js
// モンスターファーム ガッツロード - PWA用サービスワーカー
//
// キャッシュのバージョンを上げると、ユーザー環境の古いキャッシュが破棄され、
// 新しいファイル一式が再取得されます。js/images 等を更新した場合は
// 必ず CACHE_VERSION の値を変更してください（変更しないと更新が反映されません）。
const CACHE_VERSION = 'v61';
const CACHE_NAME = `guts-road-cache-${CACHE_VERSION}`;

// 同一オリジンの静的アセット（アプリ本体）。ここに列挙したファイルは
// インストール時に事前キャッシュされ、オフラインでも起動できるようになります。
// ※ 育成（ダンジョン探索）・マスモン（保存モンスター）関連機能は廃止済みのため、
//    それらに関連していたJSファイルは事前キャッシュ対象から除外しています。
const PRECACHE_URLS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/database.js',
  'js/game_core.js',
  'js/game_ranking.js',
  'js/friends.js',
  'js/turn_order.js',
  'js/masmon_battle.js',
  'js/masmon_rating.js',
  'js/masmon_realtime.js',
  'js/masmon_realtime_battle.js',
  'js/kinnejiki.js',
  'js/endless_mode.js',
  'js/pvp_rental.js',
  'js/pvp_preset.js',
  'js/monster_dex.js',
  'js/equipment_dex.js',
  'js/skill_effects.js',
  'js/monster_motion_mochi.js',
  'js/monster_motion_suezo.js',
  'js/monster_motion_dino.js',
  'js/monster_motion_durahan.js',
  'js/monster_motion_zan.js',
  'js/monster_motion_monolith.js',
  'js/monster_motion_plant.js',
  'js/monster_motion_ham.js',
  'js/monster_motion_golem.js',
  'js/monster_motion_pixie.js',
  'js/monster_motion_nendoro.js',
  'js/monster_motion_henger.js',
  'js/monster_motion_arrowhead.js',
  'js/monster_motion_kijin.js',
  'js/monster_motion_ghost.js',
  'js/monster_motion_gel.js',
  'js/monster_motion_ark.js',
  'js/monster_motion_illumine.js',
  'js/monster_motion_liger.js',
  'js/monster_motion_kawazumo.js',
  'js/monster_motion_hinotori.js',
  'js/monster_motion_gari.js',
  'js/monster_motion_metalner.js',
  'js/monster_motion_kyubi.js',
  'js/strategy_hub.js',
  'js/achievements.js',
  'js/debug_mode.js',
  'js/audio.js',
  'audio/home.mp3',
  'audio/douchu.mp3',
  'images/branding/title.png',
  'images/アローヘッド.png',
  'images/キュービ.png',
  'images/ゴビ.png',
  'images/ゴーレム.png',
  'images/スエゾー.png',
  'images/ディノ.png',
  'images/デュラハン.png',
  'images/myroom/デュラハン_歩行.png',
  'images/myroom/ザン_歩行.png',
  'images/ネンドロ.png',
  'images/ハム.png',
  'images/プラント.png',
  'images/ヘンガー.png',
  'images/モスト.png',
  'images/モッチー.png',
  'images/モッチーroll.png',
  'images/モノリス.png',
];

// --- インストール: アプリ本体を事前キャッシュ ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 1つでも取得失敗すると install 全体が失敗するため、
      // 個別に addAll を試みつつ失敗を握りつぶす（画像1枚の404等で全体を壊さない）
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Precache failed for', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// --- 有効化: 古いバージョンのキャッシュを削除 ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('guts-road-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --- フェッチ: 同一オリジンの静的アセットのみキャッシュ制御する ---
// Firebase (Realtime Database / SDK) や Tailwind CDN, FontAwesome CDN など
// 外部オリジンへのリクエストは一切横取りせず、そのままネットワークに流す。
// (Firebase Realtime Database は WebSocket/独自プロトコルを使うため fetch では
//  そもそも扱われないが、念のためクロスオリジンは完全にスルーする)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML(ナビゲーション)は「まずネットワーク、失敗したらキャッシュ」
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('index.html')))
    );
    return;
  }

  // JS/CSSは頻繁に更新されるため「まずネットワーク、オフライン時のみキャッシュ」にする。
  // （cache-firstだと、CACHE_VERSIONを上げ忘れたり、ブラウザ側のハード再読み込みだけでは
  //   サービスワーカー自身のCache Storageまでは必ずしも消えなかったりする関係で、
  //   何度更新してもユーザー環境に古いコードが残り続けてしまう問題があったため）
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // それ以外（画像等、更新頻度が低い静的アセット）は従来通り「まずキャッシュ、なければネットワーク」
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      });
    })
  );
});
