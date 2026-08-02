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

// --- バージョン・最終更新日（タイトル画面左下に小さく表示。更新のたびにここを書き換える） ---
const GAME_VERSION_INFO = { version: 'ver1.0.4', updatedAt: '2026-07-31' };

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
// MONSTER_VISUAL_AURA_TINT_BLEND_MODE: CSSのmix-blend-mode。
//   'hue'は「色相だけを変える」モードだが、CSSの仕様上 SetSat(Cs, Sat(Cb)) という計算式になっており、
//   下地（モンスター画像）の彩度が低い部分（銀・白・灰色の甲冑など）では、どのオーラ色を重ねても
//   結果がほぼ無彩色になってしまい、赤・緑・黄・青の違いがほとんど見えないバグの原因になっていた。
//   'color'モードは SetLum(Cs, Lum(Cb)) で、重ねる色（オーラ色）の彩度をそのまま活かしつつ
//   下地の明暗（陰影）だけを保持するため、下地の彩度に左右されず、どんな絵柄でも色の違いがはっきり出る。
const MONSTER_VISUAL_AURA_TINT_STRENGTH = 0.6;
const MONSTER_VISUAL_AURA_TINT_BLEND_MODE = 'color';

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
    // 日本語ファイル名をそのままCSSのurl()に渡すと、環境によってはmask-image側の読み込みだけ
    // 不安定になることがあるため、URLとしてきちんとエンコードしたものを使う。
    const encodedImagePath = encodeURI(imagePath);

    containerEl.dataset.visualSrc = imagePath;
    // 絶対配置のオーラ着色オーバーレイを正しい位置に重ねるための基準にする
    if (!containerEl.style.position) containerEl.style.position = 'relative';
    // mix-blend-mode（オーラ着色）が、このアイコン自身の画像だけでなく背後にある
    // 画面全体の描画結果と混ざってしまわないよう、新しいスタッキングコンテキストを
    // 作って着色の影響範囲をこの要素内に閉じ込める。
    // （isolationが無いと、同じオーラ色でも背景に写っている技ボタン／ログ欄など
    //   その時々で「裏に写っているもの」が変わることで、控えモンスターの色の濃さが
    //   場面によって変わって見えてしまう不具合の原因になっていた）
    containerEl.style.isolation = 'isolate';

    const img = new Image();
    img.src = encodedImagePath;
    img.onload = () => {
        if (containerEl.dataset.visualSrc !== imagePath) return;
        const oldImgNow = containerEl.querySelector('img.monster-visual-img');
        if (oldImgNow) oldImgNow.remove();
        const oldTintNow = containerEl.querySelector('.monster-visual-aura-tint');
        if (oldTintNow) oldTintNow.remove();

        const flipClass = isPartner ? '' : ' -scale-x-100';

        const imgEl = document.createElement('img');
        imgEl.src = encodedImagePath;
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
            tintEl.style.webkitMaskImage = `url("${encodedImagePath}")`;
            tintEl.style.maskImage = `url("${encodedImagePath}")`;
            tintEl.style.webkitMaskMode = 'alpha';
            tintEl.style.maskMode = 'alpha';
            tintEl.style.webkitMaskSize = 'contain';
            tintEl.style.maskSize = 'contain';
            tintEl.style.webkitMaskRepeat = 'no-repeat';
            tintEl.style.maskRepeat = 'no-repeat';
            tintEl.style.webkitMaskPosition = 'center';
            tintEl.style.maskPosition = 'center';
            containerEl.insertBefore(tintEl, imgEl.nextSibling);

            // --- マスク画像の読み込み確認 ---
            // mask-image はブラウザ内部でCORSモードの通信を行うため、file:// で直接開いている場合など
            // クロスオリジン扱いになる環境では読み込みに失敗することがある。
            // その場合、マスクが効かず「着色した四角形がモンスター全体を覆ってしまう」壊れた見た目になるため、
            // 読み込み失敗を検知したら着色オーバーレイごと取り除き、通常表示にフォールバックする。
            const maskLoadProbe = new Image();
            maskLoadProbe.crossOrigin = 'anonymous';
            maskLoadProbe.onerror = () => {
                if (tintEl.isConnected) tintEl.remove();
                console.warn(`[renderMonsterVisual] オーラ着色用マスクの読み込みに失敗したため、着色なしで表示します: ${imagePath}（file:// で直接開いている場合は、ローカルサーバー経由での起動をお試しください）`);
            };
            maskLoadProbe.src = encodedImagePath;
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
    if (typeof checkEndlessModeUnlockAndUpdateHomeButton === 'function') checkEndlessModeUnlockAndUpdateHomeButton();
    const versionEl = document.getElementById('title-version-display');
    if (versionEl && typeof GAME_VERSION_INFO !== 'undefined') {
        const dateLabel = (GAME_VERSION_INFO.updatedAt || '').replace(/-/g, '/');
        versionEl.textContent = `${GAME_VERSION_INFO.version}（${dateLabel} 更新）`;
    }
    if (typeof refreshAchievementBadge === 'function') refreshAchievementBadge();
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
    if (typeof checkFirstLoginDiamondBonus === 'function') checkFirstLoginDiamondBonus();
    if (typeof checkDailyLoginBonus === 'function') checkDailyLoginBonus();
    if (typeof checkAndCelebrateNewAchievements === 'function') checkAndCelebrateNewAchievements();

    // 起動演出（①タイトルロゴ→②メニューボタンが重なった状態から1つずつスライド展開→③名前入力欄フェードイン）を
    // 「Now loading」画面のフェードアウトに合わせて再生する。
    // まずロード画面の進捗ゲージを100%まで埋めて「読み込み完了」を見せてから演出へ進む
    // （ゲージはあくまで演出用で実際の読み込み量そのものではないが、window.load＝実際に
    //  全アセットの読み込みが完了したタイミングで100%に到達させることで違和感なく繋げる）。
    if (typeof window.__completeAppLoadingGauge === 'function') {
        window.__completeAppLoadingGauge(playTitleBootIntro);
    } else {
        playTitleBootIntro();
    }
});

// --- 「Now loading」画面をフェードアウトさせて取り除く ---
function hideAppLoadingOverlay() {
    const overlay = document.getElementById('app-loading-overlay');
    if (!overlay) return;
    overlay.classList.add('app-loading-overlay-hide');
    setTimeout(() => overlay.remove(), 500);
}

// --- 起動時のタイトル演出 ---
//   ① タイトルロゴをフェードイン
//   ② メニューボタンを、最初の1つに重なった状態から1つずつ下へスライドさせながら展開
//   ③ ブリーダー名入力欄をフェードイン
//   「Now loading」画面がまだ覆っている間に演出前の状態（非表示・重なった状態）を作っておくので、
//   画面が切り替わる瞬間に一瞬チラつく、といったことは起きない。
// ホームメニュー（ボタン群・名前入力欄）の展開演出が完了したか。
// PRESS START待ちの間に解禁判定（例：エンドレスモード）でボタンが unhidden になっても、
// この演出が終わるまでは見た目上フェードインさせない（checkEndlessModeUnlockAndUpdateHomeButton参照）
window.HOME_INTRO_MENU_REVEALED = false;

function playTitleBootIntro() {
    const logoEl = document.querySelector('.title-logo-img');
    const buttonsContainer = document.getElementById('title-menu-buttons');
    const nameInputBox = document.getElementById('title-name-input-box');
    const pressStartEl = document.getElementById('title-press-start');

    if (logoEl) {
        logoEl.style.transition = 'none';
        logoEl.style.opacity = '0';
    }

    let items = [];
    if (buttonsContainer) {
        // 現時点で非表示（エンドレスモード解放前など）の項目は演出の対象から外す
        items = Array.from(buttonsContainer.children).filter(el => getComputedStyle(el).display !== 'none');
        if (items.length > 0) {
            const baseTop = items[0].offsetTop;
            items.forEach(el => {
                el.style.transition = 'none';
                el.style.opacity = '0';
                el.style.transform = `translateY(${baseTop - el.offsetTop}px)`; // 1つ目のボタンの位置に重なるよう引き上げておく
            });
        }
        buttonsContainer.style.pointerEvents = 'none';
    }

    if (nameInputBox) {
        nameInputBox.style.transition = 'none';
        nameInputBox.style.opacity = '0';
        nameInputBox.style.pointerEvents = 'none';
    }

    if (pressStartEl) {
        pressStartEl.style.transition = 'none';
        pressStartEl.style.opacity = '0';
        pressStartEl.classList.remove('press-start-blink');
    }

    // メニュー展開（②③）を実行する処理。「PRESS START」タップ/キー入力後に呼ばれる
    // instant=true の場合、ステップ①〜③の演出（スタガーアニメーション）を行わず、
    // 最終的な表示状態を即座に反映する（暗転ロード演出の裏で使う。演出は
    // ロード画面側で既に見せているため、隠れた状態で一気に組み立ててよい）。
    function revealHomeMenu(instant) {
        const MENU_STAGGER_MS = 110;
        window.HOME_INTRO_MENU_REVEALED = true;
        if (buttonsContainer) buttonsContainer.style.pointerEvents = '';
        if (nameInputBox) nameInputBox.style.pointerEvents = '';

        // PRESS START待ちの間に解禁判定が完了して新たに表示された項目（エンドレスモード等）も
        // 取りこぼさないよう、演出開始の直前に改めて表示中の項目を数え直す。
        // まだ非表示スタイル（opacity/transform）が設定されていない項目には、ここで即座に
        // 設定してから他の項目と同じタイミングでフェードインさせる。
        if (buttonsContainer) {
            const latestItems = Array.from(buttonsContainer.children).filter(el => getComputedStyle(el).display !== 'none');
            const baseTop = latestItems.length > 0 ? latestItems[0].offsetTop : 0;
            latestItems.forEach(el => {
                if (!items.includes(el)) {
                    el.style.transition = 'none';
                    el.style.opacity = '0';
                    el.style.transform = `translateY(${baseTop - el.offsetTop}px)`;
                }
            });
            items = latestItems;
        }

        if (instant) {
            items.forEach(el => {
                el.style.transition = 'none';
                el.style.transform = 'translateY(0)';
                el.style.opacity = '1';
                el.style.pointerEvents = '';
            });
            if (nameInputBox) {
                nameInputBox.style.transition = 'none';
                nameInputBox.style.opacity = '1';
            }
            return;
        }

        items.forEach((el, i) => {
            setTimeout(() => {
                el.style.transition = 'transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.35s ease-out';
                el.style.transform = 'translateY(0)';
                el.style.opacity = '1';
                // checkEndlessModeUnlockAndUpdateHomeButton() が演出完了前に解禁判定を終えた場合、
                // 該当ボタンに直接 pointer-events:none を設定して見た目上だけ隠す処理を行っている
                // （buttonsContainer側のpointer-eventsを戻すだけでは、子要素に直接設定された
                //   pointer-eventsは上書きされず残ってしまい、ボタンが押せなくなる不具合になっていた）。
                // ここで個々のボタンのpointer-eventsも明示的に解除する。
                el.style.pointerEvents = '';
            }, i * MENU_STAGGER_MS);
        });

        const menuRevealTotalMs = items.length * MENU_STAGGER_MS + 450;
        setTimeout(() => {
            if (nameInputBox) {
                nameInputBox.style.transition = 'opacity 0.5s ease-out';
                nameInputBox.style.opacity = '1';
            }
        }, menuRevealTotalMs);
    }

    // 上記の初期状態を確実に反映させてから、「Now loading」を消して演出を開始する
    requestAnimationFrame(() => {
        // ① ロード画面（ゲージ100%を見せ終えた状態）をフェードアウトし、背景を見せる
        //    （フェードアウトは0.45s＋removeまでの猶予0.5s。ロゴはまだ透明のまま）
        hideAppLoadingOverlay();

        // ② 背景だけが見えている状態で「ちょっと溜めてから」タイトルロゴをフェードインする。
        //    ロード画面のフェードアウトが完全に終わる(約0.5s)のを待ち、さらに間（タメ）を
        //    置いてからロゴを出すことで、「背景→（間）→ロゴ」という演出の区切りを作る。
        const BG_REVEAL_MS = 500;   // ロード画面フェードアウト＋removeまでの時間
        const LOGO_PAUSE_MS = 450;  // 背景が見えてからロゴが出るまでの「タメ」
        const LOGO_FADE_MS = 550;   // ロゴのフェードイン自体の時間
        const PRESS_START_PAUSE_MS = 200; // ロゴが出きってからPRESS STARTが出るまでの間

        setTimeout(() => {
            if (logoEl) {
                logoEl.style.transition = `opacity ${LOGO_FADE_MS}ms ease-out`;
                logoEl.style.opacity = '1';
            }
        }, BG_REVEAL_MS + LOGO_PAUSE_MS);

        // ③ ロゴのフェードインが終わったら、少し間を置いて「PRESS START」をゆっくり点滅表示する
        setTimeout(() => {
            if (pressStartEl) {
                pressStartEl.style.transition = 'opacity 0.6s ease-out';
                pressStartEl.style.opacity = '1';
                pressStartEl.classList.add('press-start-blink');
            }

            // タップ・クリック・キー入力のいずれかで「暗転→ロード演出→ホーム表示」へ進む
            let started = false;
            const proceed = () => {
                if (started) return;
                started = true;
                document.removeEventListener('pointerdown', proceed);
                document.removeEventListener('keydown', proceed);
                if (pressStartEl) {
                    pressStartEl.classList.remove('press-start-blink');
                    pressStartEl.style.transition = 'opacity 0.25s ease-out';
                    pressStartEl.style.opacity = '0';
                }
                if (window.AudioManager) AudioManager.playSE('decide');

                // 「PRESS START」のフェードアウトを待ってから、一度暗転してロード画面を挟み、
                // ロード画面をフェードアウトさせてホームへ「切り替わった」ように見せる
                // （単にボタンをフェードインさせるだけでなく、きちんと画面が切り替わる
                // 一連の遷移として扱う）。ロード画面明けの「ボタンが順番に表示され、最後に
                // ブリーダー名入力欄が出る」演出はここで初めて見せるため、revealHomeMenu()は
                // 通常（スタガーアニメーションあり）のまま呼び出す。
                setTimeout(() => {
                    showBootTransitionOverlay(() => {
                        revealHomeMenu();
                    });
                }, 260);
            };
            document.addEventListener('pointerdown', proceed);
            document.addEventListener('keydown', proceed);
        }, BG_REVEAL_MS + LOGO_PAUSE_MS + LOGO_FADE_MS + PRESS_START_PAUSE_MS);
    });
}

// PRESS START後に挟む「暗転→ロード風演出→フェードアウト」の画面遷移オーバーレイ。
// 起動時の app-loading-overlay と同じ見た目（円盤石＋Now Loading＋ゲージ）を再現するが、
// あちらは既にDOMから remove() 済みのため、ここでは独立した要素として都度組み立てる。
// callback は、オーバーレイがまだ画面を覆っている（＝裏の変化が見えない）タイミングで
// 呼び出すので、ホームメニュー側の展開処理はアニメーションさせず即座に完了させてよい。
function showBootTransitionOverlay(callback) {
    const MIN_MS = 1800;
    const gameContainer = document.getElementById('game-container') || document.body;

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 z-[999] flex flex-col items-center justify-center bg-[#120b07]';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.35s ease';
    overlay.innerHTML = `
        <img src="images/gacha/円盤石.png" alt="" class="w-16 h-16 mb-4 app-loading-disc-appear">
        <p class="text-amber-200 font-bold text-sm tracking-wide pixel-font">Now loading<span class="boot-transition-dots">.</span></p>
        <div class="boot-transition-gauge-track mt-3">
            <div class="boot-transition-gauge-fill"></div>
        </div>
    `;
    gameContainer.appendChild(overlay);

    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    // 「Now loading」ドットのアニメーション
    const dotsEl = overlay.querySelector('.boot-transition-dots');
    let dotCount = 1;
    const dotsTimer = setInterval(() => {
        dotCount = (dotCount % 3) + 1;
        if (dotsEl) dotsEl.textContent = '.'.repeat(dotCount);
    }, 350);

    // 進捗ゲージ（あくまで演出用。MIN_MSかけて0→100%まで進める）
    const fillEl = overlay.querySelector('.boot-transition-gauge-fill');
    const startTime = performance.now();
    function tickGauge(ts) {
        const t = Math.min(1, (ts - startTime) / MIN_MS);
        if (fillEl) fillEl.style.width = `${t * 100}%`;
        if (t < 1) requestAnimationFrame(tickGauge);
    }
    requestAnimationFrame(tickGauge);

    setTimeout(() => {
        clearInterval(dotsTimer);
        if (typeof callback === 'function') callback(); // 裏側（ホーム画面）を隠れた状態のまま組み立てる
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 400);
    }, MIN_MS);
}

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
    // 高速モード時はBATTLE_STEP_DELAY側の「間」も全て半分になるため、この演出の表示時間も
    // 同じ比率で縮めないと、次の演出に上書きされる／表示が追いつかず混乱を招く原因になる。
    const hideDelay = typeof scaledBattleDelay === 'function' ? scaledBattleDelay(800) : 800;
    setTimeout(() => {
        overlay.classList.remove('scale-100');
        overlay.classList.add('scale-0');
    }, hideDelay);
}

function showDamagePopup(elId, val, isCrit) {
    const el = document.getElementById(elId);
    el.textContent = val;
    if (isCrit) {
        el.className = "absolute -top-10 text-xl font-black text-red-500 opacity-100 scale-125 transition-all duration-500 pointer-events-none";
    } else {
        el.className = "absolute -top-8 text-base font-bold text-white opacity-100 scale-100 transition-all duration-500 pointer-events-none";
    }
    // showEffect同様、高速モード時は表示時間も比例して縮める（次のダメージ表示等に埋もれないように）
    const fadeDelay = typeof scaledBattleDelay === 'function' ? scaledBattleDelay(800) : 800;
    setTimeout(() => {
        el.classList.replace('opacity-100', 'opacity-0');
    }, fadeDelay);
}

function animateSprite(containerId, animClass) {
    const el = document.getElementById(containerId);
    const scale = (ms) => typeof scaledBattleDelay === 'function' ? scaledBattleDelay(ms) : ms;
    if (animClass === 'shake') {
        el.classList.add('animate-ping');
        setTimeout(() => el.classList.remove('animate-ping'), scale(250));
    } else {
        el.classList.add(animClass);
        setTimeout(() => el.classList.remove(animClass), scale(200));
    }
}

// タイトルに戻る（各種リザルト画面・ランキング画面の「タイトルに戻る」ボタンから使用）
function restartGame() {
    changeScreen('screen-title');
}
