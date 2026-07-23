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

// --- モンスター画像のオーラ着色設定（調整しやすいようにここで定数化） ---
// MONSTER_VISUAL_AURA_TINT_STRENGTH: 色の重ねる強さ（0〜1）。0にすると着色オフになる。
// MONSTER_VISUAL_AURA_TINT_BLEND_MODE: CSSのmix-blend-mode。'hue'（色相のみ変更・陰影を保持）を採用。
//   他の候補: 'color'（hueよりくっきり）/ 'multiply'（濃く暗めに色付け）/ 'soft-light'（淡く色付け）
const MONSTER_VISUAL_AURA_TINT_STRENGTH = 0.6;
const MONSTER_VISUAL_AURA_TINT_BLEND_MODE = 'hue';

// --- モンスター画像読み込みヘルパー関数 ---
// isPartner: プレイヤー側（自分のパーティ）のモンスターを描画する場合はtrue。
//   画像素材は基本的に右向きで用意されているため、敵側（isPartner=false）表示時のみ
//   CSSで左右反転して、プレイヤーと向き合っているように見せる。
// auraKey: 指定された場合（'red'/'green'/'yellow'/'blue'）、AURA_TYPESの色を画像に重ねて着色する。
//   透明な背景部分には色が乗らないよう、同じ画像をCSSマスクとして使い、モンスターの絵柄部分にのみ重ねる。
function renderMonsterVisual(containerEl, name, emoji, isAwakened = false, isPartner = false, auraKey = null) {
    if (!containerEl) return;

    const oldImg = containerEl.querySelector('img.monster-visual-img');
    if (oldImg) oldImg.remove();
    const oldTint = containerEl.querySelector('.monster-visual-aura-tint');
    if (oldTint) oldTint.remove();

    Array.from(containerEl.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
    });

    let cleanName = name.replace("中ボス：", "").replace("伝説の邪神：", "").split(" ")[0];
    cleanName = cleanName.replace(/\s*\(強敵\)\s*/g, "");

    const prefix = isAwakened ? "覚醒" : "";
    const imagePath = `images/${prefix}${cleanName}.png`;

    containerEl.dataset.visualSrc = imagePath;
    // 絶対配置のオーラ着色オーバーレイを正しい位置に重ねるための基準にする
    if (!containerEl.style.position) containerEl.style.position = 'relative';

    const img = new Image();
    img.src = imagePath;
    img.onload = () => {
        if (containerEl.dataset.visualSrc !== imagePath) return;
        const oldImgNow = containerEl.querySelector('img.monster-visual-img');
        if (oldImgNow) oldImgNow.remove();
        const oldTintNow = containerEl.querySelector('.monster-visual-aura-tint');
        if (oldTintNow) oldTintNow.remove();

        const flipClass = isPartner ? '' : ' -scale-x-100';

        const imgEl = document.createElement('img');
        imgEl.src = imagePath;
        imgEl.alt = name;
        // 画像は右向きが基本のため、敵側（isPartner=false）のみ左右反転して表示する
        imgEl.className = `monster-visual-img w-full h-full object-contain max-h-24 max-w-24 mx-auto drop-shadow-lg${flipClass}`;
        containerEl.insertBefore(imgEl, containerEl.firstChild);

        // オーラ着色オーバーレイ（同じ画像をマスクにして、絵柄部分だけに色を重ねる）
        const aura = auraKey ? AURA_TYPES[auraKey] : null;
        if (aura && aura.hex && MONSTER_VISUAL_AURA_TINT_STRENGTH > 0) {
            const tintEl = document.createElement('div');
            tintEl.className = `monster-visual-aura-tint w-full h-full max-h-24 max-w-24 mx-auto${flipClass}`;
            tintEl.style.position = 'absolute';
            tintEl.style.inset = '0';
            tintEl.style.margin = 'auto';
            tintEl.style.pointerEvents = 'none';
            tintEl.style.backgroundColor = aura.hex;
            tintEl.style.opacity = String(MONSTER_VISUAL_AURA_TINT_STRENGTH);
            tintEl.style.mixBlendMode = MONSTER_VISUAL_AURA_TINT_BLEND_MODE;
            tintEl.style.webkitMaskImage = `url(${imagePath})`;
            tintEl.style.maskImage = `url(${imagePath})`;
            tintEl.style.webkitMaskMode = 'alpha';
            tintEl.style.maskMode = 'alpha';
            tintEl.style.webkitMaskSize = 'contain';
            tintEl.style.maskSize = 'contain';
            tintEl.style.webkitMaskRepeat = 'no-repeat';
            tintEl.style.maskRepeat = 'no-repeat';
            tintEl.style.webkitMaskPosition = 'center';
            tintEl.style.maskPosition = 'center';
            containerEl.insertBefore(tintEl, imgEl.nextSibling);
        }
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

// --- みがわり（身代わり）画像を陣営アイコン枠に表示する ---
// renderMonsterVisualと同じ見た目・フォールバック規則（画像が無ければ🌸で代替）に揃えている。
// isPartner: 自分側（プレイヤー側）ならtrue。敵側の画像は左右反転して表示する規則もrenderMonsterVisualに合わせる。
function renderSubstituteVisual(containerEl, isPartner) {
    if (!containerEl) return;
    const imagePath = 'images/みがわり.png';
    containerEl.innerHTML = '';
    containerEl.dataset.visualSrc = imagePath;
    if (!containerEl.style.position) containerEl.style.position = 'relative';

    const img = new Image();
    img.src = imagePath;
    img.onload = () => {
        if (containerEl.dataset.visualSrc !== imagePath) return;
        containerEl.innerHTML = '';
        const flipClass = isPartner ? '' : ' -scale-x-100';
        const imgEl = document.createElement('img');
        imgEl.src = imagePath;
        imgEl.alt = 'みがわり';
        imgEl.className = `monster-visual-img w-full h-full object-contain max-h-24 max-w-24 mx-auto drop-shadow-lg${flipClass}`;
        containerEl.appendChild(imgEl);
    };
    img.onerror = () => {
        console.warn(`[renderSubstituteVisual] 画像が見つかりません: ${imagePath}`);
        if (containerEl.dataset.visualSrc !== imagePath) return;
        containerEl.textContent = '🌸';
    };
}


// --- オーラバッジ表示ヘルパー（バトル画面の名前横に色付きバッジを表示する） ---
function renderAuraBadge(elId, auraKey, monsterRawName) {
    const el = document.getElementById(elId);
    if (!el) return;
    const aura = AURA_TYPES[auraKey];
    if (!aura) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    const monClassKey = typeof getMonClassKeyForName === 'function' ? getMonClassKeyForName(monsterRawName) : null;
    const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
    el.textContent = monClassInfo ? `${aura.emoji}${monClassInfo.emoji}` : aura.emoji;
    el.className = `px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}`;
}

// --- 状態異常バッジ表示ヘルパー（マヒ⚡／混乱＝意味不明❔／出血🩸をオーラバッジの右側に表示する） ---
function renderStatusAilmentBadge(elId, unit) {
    const el = document.getElementById(elId);
    if (!el) return;
    const text = getStatusAilmentBadgeText(unit);
    if (text) {
        el.textContent = text;
        el.classList.remove('hidden');
    } else {
        el.textContent = '';
        el.classList.add('hidden');
    }
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
// --- バトルログの記録管理 ---
// バトル開始からの全ログを BATTLE_LOG_ENTRIES に貯めておき、
// 表示モード（BATTLE_LOG_VIEW_MODE）に応じて #battle-log に描画する内容を切り替える。
//   'turn' … 直近の行動（技・防御・アイテム・交代）を選んだ地点からのログのみ表示（簡略文）
//   'full' … バトル開始からの全ログを表示（「ログ確認」ボタン用。詳細文）
let BATTLE_LOG_ENTRIES = [];
let BATTLE_LOG_TURN_START = 0;
let BATTLE_LOG_VIEW_MODE = 'turn';

// short: 通常表示（技を打った直後などに見えるログ）用の簡略な文言
// detail: 「ログ確認」ボタンで開く全履歴用の詳細な文言（省略時はshortと同じ文言を使う）
function addLog(short, detail) {
    BATTLE_LOG_ENTRIES.push({ text: short, detailText: (detail !== undefined ? detail : short), cls: null });
    renderBattleLog();
}

// バトル開始時にログ履歴をリセットして初期メッセージを表示する。
// entries: 文字列、または { text, detailText, cls } の配列
function initBattleLog(entries) {
    BATTLE_LOG_ENTRIES = (entries || []).map(e => (typeof e === 'string') ? { text: e, detailText: e, cls: null } : { detailText: e.text, ...e });
    BATTLE_LOG_TURN_START = 0;
    BATTLE_LOG_VIEW_MODE = 'turn';
    renderBattleLog();
}

// 現在の BATTLE_LOG_VIEW_MODE に従って #battle-log の中身を再描画する。
function renderBattleLog() {
    const log = document.getElementById('battle-log');
    if (!log) return;
    const isFull = (BATTLE_LOG_VIEW_MODE === 'full');
    const startIdx = isFull ? 0 : BATTLE_LOG_TURN_START;
    log.innerHTML = '';
    for (let i = startIdx; i < BATTLE_LOG_ENTRIES.length; i++) {
        const entry = BATTLE_LOG_ENTRIES[i];
        const div = document.createElement('div');
        if (entry.cls) div.className = entry.cls;
        div.textContent = isFull ? (entry.detailText !== undefined ? entry.detailText : entry.text) : entry.text;
        log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
}

// --- バトルログ表示切り替え ---
// バトル中は基本的に技選択エリアを表示し、ログはその場所に切り替えて表示する。
// ・行動（技・防御・アイテム・交代）を選んだ直後 → beginActionLog()
//   （その行動を起こした時点からのログのみを表示するモードに切り替える）
// ・相手のターンが終わり自分のターンになった直後 → hideBattleLog()
// ・自分のターン中でもログを見たい場合 → toggleBattleLogView()（ログ確認ボタン。バトル全体のログを表示する）
// ※ class="hidden" の付け外しだけに頼らず、style.display も直接操作することで
//   他のCSSクラス（grid/flex等）との兼ね合いによる表示崩れを確実に防ぐ。
function showBattleLog() {
    const skillsWrap = document.getElementById('battle-skills-container');
    const logEl = document.getElementById('battle-log');
    if (skillsWrap) {
        skillsWrap.classList.add('hidden');
        skillsWrap.style.display = 'none';
    }
    if (logEl) {
        logEl.classList.remove('hidden');
        logEl.style.display = 'block';
        logEl.scrollTop = logEl.scrollHeight;
    }
    updateBattleLogToggleBtnLabel();
}

// 行動（技・防御・アイテム・交代）を選択した直後に呼ぶ。
// ここから先に追加されるログだけを表示する「直近ログ表示」モードに切り替えてから表示する。
function beginActionLog() {
    BATTLE_LOG_TURN_START = BATTLE_LOG_ENTRIES.length;
    BATTLE_LOG_VIEW_MODE = 'turn';
    renderBattleLog();
    showBattleLog();
}

function hideBattleLog() {
    const skillsWrap = document.getElementById('battle-skills-container');
    const logEl = document.getElementById('battle-log');
    if (logEl) {
        logEl.classList.add('hidden');
        logEl.style.display = 'none';
    }
    if (skillsWrap) {
        skillsWrap.classList.remove('hidden');
        skillsWrap.style.display = 'grid';
    }
    updateBattleLogToggleBtnLabel();
}

function toggleBattleLogView() {
    const logEl = document.getElementById('battle-log');
    if (!logEl) return;
    const isLogShown = logEl.style.display === 'block' && !logEl.classList.contains('hidden');
    if (isLogShown) {
        hideBattleLog();
    } else {
        // 「ログ確認」ボタンから開く場合は、バトル開始からの全ログを表示する
        BATTLE_LOG_VIEW_MODE = 'full';
        renderBattleLog();
        showBattleLog();
    }
}

function updateBattleLogToggleBtnLabel() {
    const btn = document.getElementById('battle-log-toggle-btn');
    if (!btn) return;
    const logEl = document.getElementById('battle-log');
    const isLogShown = logEl && !logEl.classList.contains('hidden');
    btn.innerHTML = isLogShown
        ? '<i class="fa-solid fa-arrow-left"></i><span>技に戻る</span>'
        : '<i class="fa-solid fa-scroll"></i><span>ログ確認</span>';
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
