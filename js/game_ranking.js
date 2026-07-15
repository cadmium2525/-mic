// =====================================================
// game_ranking.js
// Firebase 設定・共通ID管理：
//   ・Firebase初期化
//   ・プレイヤー固有ID（getMyPlayerId）
//   ・サーバー時刻取得（マッチング等の経過時間判定に使用）
// ガッツファクトリー（kinnejiki.js）・PvPレーティング（masmon_rating.js）・
// リアルタイム対戦（masmon_realtime.js / masmon_realtime_battle.js）
// のすべてがこのファイルの関数に依存する。
// =====================================================

const firebaseConfig = {
    apiKey: "AIzaSyDtOE8k_ul09KKWRH0AqUBkc86OYeFS3ls",
    authDomain: "mfload2525.firebaseapp.com",
    databaseURL: "https://mfload2525-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mfload2525",
    storageBucket: "mfload2525.firebasestorage.app",
    messagingSenderId: "829047750322",
    appId: "1:829047750322:web:336b112f4d841e619d93ab"
};

let firebaseDb = null;
let firebaseServerTimeOffset = 0; // サーバー時刻 - 自端末時刻（各端末の時計のズレを補正するため）
let firebaseServerTimeOffsetReady = false;

function initFirebase() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        firebaseDb = firebase.database();
        if (!firebaseServerTimeOffsetReady) {
            firebaseServerTimeOffsetReady = true;
            // 端末の時計がずれていても、マッチング等の「経過時間」判定を
            // 全端末共通のサーバー時刻基準で行えるようにする。
            firebaseDb.ref('.info/serverTimeOffset').on('value', snap => {
                firebaseServerTimeOffset = snap.val() || 0;
            });
        }
        return true;
    } catch (e) {
        console.error('[Firebase]', e);
        return false;
    }
}

// サーバー時刻を基準とした現在時刻（ミリ秒）。端末間の時計のズレの影響を受けない。
function getFirebaseServerNow() {
    return Date.now() + firebaseServerTimeOffset;
}

// --- プレイヤー固有IDの取得（初回はランダム生成してlocalStorageへ保存） ---
// ガッツファクトリーのランキング保存・PvPのレーティング／マッチングなど、全モードで共通のID。
function getMyPlayerId() {
    let pid = localStorage.getItem('mfload_player_id');
    if (!pid) {
        pid = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('mfload_player_id', pid);
    }
    return pid;
}
