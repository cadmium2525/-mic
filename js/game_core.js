// =====================================================
// game_core.js
// アプリ全体で共有する基盤部分：
//   ・GAME_STATE（現在の画面・ブリーダー名）
//   ・画面遷移、モンスター画像描画、トースト通知
//   ・addLog / showEffect / showDamagePopup / animateSprite
//     （ガッツファクトリーCPU対戦・PvPリアルタイム対戦の両方から
//       共通で呼び出されるバトル演出ヘルパー）
// 他の js ファイルより先に読み込まれる前提。
// =====================================================

// --- ブリーダー名の永続化（LocalStorage） ---
function loadStoredPlayerName() {
    try {
        return localStorage.getItem('mfload_player_name') || 'ブリーダー';
    } catch (e) {
        return 'ブリーダー';
    }
}

function saveStoredPlayerName(name) {
    try {
        localStorage.setItem('mfload_player_name', name);
    } catch (e) { /* ignore（プライベートブラウズ等でlocalStorage不可の場合は無視） */ }
}

// --- プレイヤー名入力欄の変更をそのままLocalStorageへ反映する ---
function updatePlayerNameFromInput() {
    const nameInputEl = document.getElementById('player-name-input');
    if (!nameInputEl) return;
    const entered = (nameInputEl.value || '').trim();
    GAME_STATE.playerName = entered || GAME_STATE.playerName || 'ブリーダー';
    saveStoredPlayerName(GAME_STATE.playerName);
}

// --- ゲーム状態管理（ガッツファクトリー／PvPで共通して参照する最小限の情報のみ保持） ---
const GAME_STATE = {
    currentScreen: 'screen-title',
    playerName: loadStoredPlayerName() // プレイヤー名（LocalStorageから復元。無ければ既定値）
};

// --- モンスター画像読み込みヘルパー関数 ---
// isPartner: プレイヤー側（自分のパーティ）のモンスターを描画する場合はtrue。
//   画像素材は基本的に右向きで用意されているため、敵側（isPartner=false）表示時のみ
//   CSSで左右反転して、プレイヤーと向き合っているように見せる。
function renderMonsterVisual(containerEl, name, emoji, isAwakened = false, isPartner = false) {
    if (!containerEl) return;

    const oldImg = containerEl.querySelector('img.monster-visual-img');
    if (oldImg) oldImg.remove();

    Array.from(containerEl.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
    });

    let cleanName = name.replace("中ボス：", "").replace("伝説の邪神：", "").split(" ")[0];
    cleanName = cleanName.replace(/\s*\(強敵\)\s*/g, "");

    const prefix = isAwakened ? "覚醒" : "";
    const imagePath = `images/${prefix}${cleanName}.png`;

    containerEl.dataset.visualSrc = imagePath;

    const img = new Image();
    img.src = imagePath;
    img.onload = () => {
        if (containerEl.dataset.visualSrc !== imagePath) return;
        const oldImgNow = containerEl.querySelector('img.monster-visual-img');
        if (oldImgNow) oldImgNow.remove();
        const imgEl = document.createElement('img');
        imgEl.src = imagePath;
        imgEl.alt = name;
        // 画像は右向きが基本のため、敵側（isPartner=false）のみ左右反転して表示する
        imgEl.className = `monster-visual-img w-full h-full object-contain max-h-24 max-w-24 mx-auto drop-shadow-lg${isPartner ? '' : ' -scale-x-100'}`;
        containerEl.insertBefore(imgEl, containerEl.firstChild);
    };
    img.onerror = () => {
        console.warn(`[renderMonsterVisual] 画像が見つかりません: ${imagePath}`);
        if (containerEl.dataset.visualSrc !== imagePath) return;
        // 画像が用意されていない場合は絵文字で代替表示する
        if (!containerEl.querySelector('img.monster-visual-img') && !containerEl.textContent.trim()) {
            containerEl.textContent = emoji || '';
        }
    };
}


// --- オーラバッジ表示ヘルパー（バトル画面の名前横に色付きバッジを表示する） ---
function renderAuraBadge(elId, auraKey) {
    const el = document.getElementById(elId);
    if (!el) return;
    const aura = AURA_TYPES[auraKey];
    if (!aura) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = `${aura.emoji}${aura.name}`;
    el.className = `px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}`;
}

// --- お知らせトースト関数 ---
function showToast(message) {
    const toast = document.getElementById('custom-toast');
    toast.textContent = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');

    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 3000);
}

// --- スマホブラウザのアドレスバー変動対策（100dvh未対応端末向けフォールバック） ---
function setRealViewportHeight() {
    const vh = window.innerHeight;
    document.documentElement.style.setProperty('--real-vh', `${vh}px`);
    const gameContainer = document.getElementById('game-container');
    const body = document.body;
    if (body) body.style.height = `${vh}px`;
    if (gameContainer) gameContainer.style.height = `${vh}px`;
}
window.addEventListener('resize', setRealViewportHeight);
window.addEventListener('orientationchange', setRealViewportHeight);

// --- 初期化処理 ---
window.addEventListener('load', () => {
    setRealViewportHeight();
    const nameInputEl = document.getElementById('player-name-input');
    if (nameInputEl && GAME_STATE.playerName && GAME_STATE.playerName !== 'ブリーダー') {
        nameInputEl.value = GAME_STATE.playerName;
    }
    if (typeof initFirebase === 'function') initFirebase();
});

// 画面遷移
function changeScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    GAME_STATE.currentScreen = screenId;
}

// 技詳細モーダルを閉じる（内容の描画は openMasmonSkillModal / openRealtimeSkillModal 側が担当する）
function closeSkillModal() {
    document.getElementById('skill-modal').classList.add('hidden');
}

// バトル用アニメーション/エフェクト演出関数
function addLog(text) {
    const log = document.getElementById('battle-log');
    const div = document.createElement('div');
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function showEffect(text) {
    const overlay = document.getElementById('battle-effect-overlay');
    overlay.textContent = text;
    overlay.classList.remove('scale-0');
    overlay.classList.add('scale-100');
    setTimeout(() => {
        overlay.classList.remove('scale-100');
        overlay.classList.add('scale-0');
    }, 800);
}

function showDamagePopup(elId, val, isCrit) {
    const el = document.getElementById(elId);
    el.textContent = val;
    if (isCrit) {
        el.className = "absolute -top-10 text-xl font-black text-red-500 opacity-100 scale-125 transition-all duration-500 pointer-events-none";
    } else {
        el.className = "absolute -top-8 text-base font-bold text-white opacity-100 scale-100 transition-all duration-500 pointer-events-none";
    }
    setTimeout(() => {
        el.classList.replace('opacity-100', 'opacity-0');
    }, 800);
}

function animateSprite(containerId, animClass) {
    const el = document.getElementById(containerId);
    if (animClass === 'shake') {
        el.classList.add('animate-ping');
        setTimeout(() => el.classList.remove('animate-ping'), 250);
    } else {
        el.classList.add(animClass);
        setTimeout(() => el.classList.remove(animClass), 200);
    }
}

// タイトルに戻る（各種リザルト画面・ランキング画面の「タイトルに戻る」ボタンから使用）
function restartGame() {
    changeScreen('screen-title');
}
