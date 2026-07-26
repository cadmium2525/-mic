// =====================================================
// achievements.js
// 実績・バッジシステム。
// 新しく専用のFirebaseノードを持たず、既存の永続データ（ガッツファクトリーのランキング統計、
// エンドレスモードの自己ベスト連勝記録、モンスター使用率トラッキング）を毎回読み直して
// 「達成済みかどうか」をその場で判定するステートレスな仕組み。
// （＝バックエンド側の実績データを別途保存・同期する必要がなく、シンプルかつズレが起きない）
// =====================================================

const ACHIEVEMENT_DEFS = [
    // --- ガッツファクトリー：勝利数マイルストーン ---
    { id: 'kin_win_1', emoji: '🔰', name: '初勝利（ガッツファクトリー）', desc: 'ガッツファクトリーで1勝する', check: stats => stats.kin.bestWins >= 1, diamondReward: 1500 },
    { id: 'kin_win_3', emoji: '🔥', name: '連勝3（ガッツファクトリー）', desc: 'ガッツファクトリーで3連勝する', check: stats => stats.kin.bestWins >= 3, diamondReward: 100 },
    { id: 'kin_win_5', emoji: '🔥', name: '連勝5（ガッツファクトリー）', desc: 'ガッツファクトリーで5連勝する', check: stats => stats.kin.bestWins >= 5, diamondReward: 150 },
    { id: 'kin_streak_10', emoji: '🔥', name: '連勝10（ガッツファクトリー）', desc: 'ガッツファクトリーで10連勝する', check: stats => stats.kin.bestWins >= 10, diamondReward: 500 },
    { id: 'kin_win_15', emoji: '🔥', name: '連勝15（ガッツファクトリー）', desc: 'ガッツファクトリーで15連勝する', check: stats => stats.kin.bestWins >= 15, diamondReward: 650 },
    { id: 'kin_win_20', emoji: '🔥', name: '連勝20（ガッツファクトリー）', desc: 'ガッツファクトリーで20連勝する', check: stats => stats.kin.bestWins >= 20, diamondReward: 800 },
    { id: 'kin_streak_25', emoji: '🔥', name: '連勝25（ガッツファクトリー）', desc: 'ガッツファクトリーで25連勝する', check: stats => stats.kin.bestWins >= 25, diamondReward: 1000 },
    { id: 'kin_win_30', emoji: '🔥', name: '連勝30（ガッツファクトリー）', desc: 'ガッツファクトリーで30連勝する', check: stats => stats.kin.bestWins >= 30, diamondReward: 1300 },
    { id: 'kin_win_35', emoji: '🔥', name: '連勝35（ガッツファクトリー）', desc: 'ガッツファクトリーで35連勝する', check: stats => stats.kin.bestWins >= 35, diamondReward: 1600 },
    { id: 'kin_win_40', emoji: '🔥', name: '連勝40（ガッツファクトリー）', desc: 'ガッツファクトリーで40連勝する', check: stats => stats.kin.bestWins >= 40, diamondReward: 2000 },
    { id: 'kin_win_45', emoji: '🔥', name: '連勝45（ガッツファクトリー）', desc: 'ガッツファクトリーで45連勝する', check: stats => stats.kin.bestWins >= 45, diamondReward: 2500 },
    { id: 'kin_streak_49', emoji: '👑', name: '完全制覇（ガッツファクトリー）', desc: 'ガッツファクトリーを49連勝（全セットクリア）する', check: stats => stats.kin.bestWins >= 49, diamondReward: 3000 },

    // --- ガッツファクトリー：総プレイ回数マイルストーン ---
    { id: 'kin_plays_10', emoji: '🎮', name: '挑戦10回（ガッツファクトリー）', desc: 'ガッツファクトリーに合計10回挑戦する', check: stats => stats.kin.totalRuns >= 10, diamondReward: 150 },
    { id: 'kin_plays_20', emoji: '🎮', name: '挑戦20回（ガッツファクトリー）', desc: 'ガッツファクトリーに合計20回挑戦する', check: stats => stats.kin.totalRuns >= 20, diamondReward: 300 },
    { id: 'kin_plays_30', emoji: '🎮', name: '挑戦30回（ガッツファクトリー）', desc: 'ガッツファクトリーに合計30回挑戦する', check: stats => stats.kin.totalRuns >= 30, diamondReward: 450 },
    { id: 'kin_plays_40', emoji: '🎮', name: '挑戦40回（ガッツファクトリー）', desc: 'ガッツファクトリーに合計40回挑戦する', check: stats => stats.kin.totalRuns >= 40, diamondReward: 600 },
    { id: 'kin_plays_50', emoji: '🎮', name: '挑戦50回（ガッツファクトリー）', desc: 'ガッツファクトリーに合計50回挑戦する', check: stats => stats.kin.totalRuns >= 50, diamondReward: 750 },

    // --- エンドレスモード ---
    { id: 'endless_streak_10', emoji: '⭐', name: 'エンドレス10連勝', desc: 'エンドレスモードで10連勝する', check: stats => stats.endless.bestStreak >= 10, diamondReward: 300 },
    { id: 'endless_streak_25', emoji: '🌟', name: 'エンドレス25連勝', desc: 'エンドレスモードで25連勝する', check: stats => stats.endless.bestStreak >= 25, diamondReward: 600 },
    { id: 'endless_streak_50', emoji: '💫', name: 'エンドレス50連勝', desc: 'エンドレスモードで50連勝する', check: stats => stats.endless.bestStreak >= 50, diamondReward: 1200 },
    { id: 'endless_streak_100', emoji: '🌠', name: 'エンドレス100連勝', desc: 'エンドレスモードで100連勝する', check: stats => stats.endless.bestStreak >= 100, diamondReward: 2500 },

    // --- モンスター使用（図鑑コンプリート） ---
    { id: 'all_monsters_used', emoji: '📖', name: '図鑑コンプリート', desc: 'ガッツファクトリーで全種類のモンスターを1回以上パーティに加える', check: stats => stats.usedSpeciesCount >= KIN_NEJIKI_SPECIES_POOL.length, diamondReward: 800 },

    // --- モン類別 使用回数マイルストーン（ガッツファクトリーでパーティに加えた回数の累計） ---
    { id: 'monclass_beast_10', emoji: '🐾', name: '獣族使いの証（10回）', desc: 'ガッツファクトリーで獣族のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.beast >= 10, diamondReward: 100 },
    { id: 'monclass_beast_20', emoji: '🐾', name: '獣族使いの証（20回）', desc: 'ガッツファクトリーで獣族のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.beast >= 20, diamondReward: 200 },
    { id: 'monclass_monster_10', emoji: '👹', name: '怪物使いの証（10回）', desc: 'ガッツファクトリーで怪物のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.monster >= 10, diamondReward: 100 },
    { id: 'monclass_monster_20', emoji: '👹', name: '怪物使いの証（20回）', desc: 'ガッツファクトリーで怪物のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.monster >= 20, diamondReward: 200 },
    { id: 'monclass_inorganic_10', emoji: '⚙️', name: '無機使いの証（10回）', desc: 'ガッツファクトリーで無機のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.inorganic >= 10, diamondReward: 100 },
    { id: 'monclass_inorganic_20', emoji: '⚙️', name: '無機使いの証（20回）', desc: 'ガッツファクトリーで無機のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.inorganic >= 20, diamondReward: 200 },
    { id: 'monclass_creation_10', emoji: '✨', name: '創造使いの証（10回）', desc: 'ガッツファクトリーで創造のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.creation >= 10, diamondReward: 100 },
    { id: 'monclass_creation_20', emoji: '✨', name: '創造使いの証（20回）', desc: 'ガッツファクトリーで創造のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.creation >= 20, diamondReward: 200 },
    { id: 'monclass_spirit_10', emoji: '🪽', name: '幻霊使いの証（10回）', desc: 'ガッツファクトリーで幻霊のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.spirit >= 10, diamondReward: 100 },
    { id: 'monclass_spirit_20', emoji: '🪽', name: '幻霊使いの証（20回）', desc: 'ガッツファクトリーで幻霊のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.spirit >= 20, diamondReward: 200 },
    { id: 'monclass_demon_10', emoji: '😈', name: '魔族使いの証（10回）', desc: 'ガッツファクトリーで魔族のモンスターを合計10回パーティに加える', check: stats => stats.monClassUsage.demon >= 10, diamondReward: 100 },
    { id: 'monclass_demon_20', emoji: '😈', name: '魔族使いの証（20回）', desc: 'ガッツファクトリーで魔族のモンスターを合計20回パーティに加える', check: stats => stats.monClassUsage.demon >= 20, diamondReward: 200 }
];

// --- 実績判定に必要な統計情報をまとめて取得する ---
async function fetchAchievementStats() {
    const [kinStats, endlessStats, usageSnapVal] = await Promise.all([
        (typeof fetchMyKinNejikiStats === 'function') ? fetchMyKinNejikiStats() : Promise.resolve(null),
        (typeof fetchMyEndlessStats === 'function') ? fetchMyEndlessStats() : Promise.resolve(null),
        (async () => {
            if (typeof initFirebase !== 'function' || !initFirebase()) return {};
            try {
                const pid = getMyPlayerId();
                const snap = await firebaseDb.ref(`kinnejiki_monster_usage/${pid}`).once('value');
                return snap.val() || {};
            } catch (e) {
                console.error('[実績] モンスター使用率の取得エラー:', e);
                return {};
            }
        })()
    ]);

    // モン類（獣族／怪物／無機／創造／幻霊／魔族）ごとの使用回数を、種族別の使用回数から集計する
    const monClassUsage = { beast: 0, monster: 0, inorganic: 0, creation: 0, spirit: 0, demon: 0 };
    Object.keys(usageSnapVal || {}).forEach(speciesId => {
        const tmpl = (typeof MONSTER_TEMPLATES !== 'undefined') ? MONSTER_TEMPLATES[speciesId] : null;
        if (!tmpl) return;
        const classKey = (typeof getMonClassKeyForName === 'function') ? getMonClassKeyForName(tmpl.name) : null;
        if (classKey && classKey in monClassUsage) monClassUsage[classKey] += usageSnapVal[speciesId] || 0;
    });

    return {
        kin: {
            bestWins: (kinStats && kinStats.bestWins) || 0,
            bestCleared: !!(kinStats && kinStats.bestCleared),
            totalRuns: (kinStats && kinStats.totalRuns) || 0
        },
        endless: {
            bestStreak: (endlessStats && endlessStats.bestStreak) || 0
        },
        usedSpeciesCount: Object.keys(usageSnapVal || {}).length,
        monClassUsage
    };
}

async function openAchievementsScreen() {
    changeScreen('screen-achievements');
    const container = document.getElementById('achievements-list');
    if (container) container.innerHTML = '<p class="text-gray-500 text-xs text-center py-8">読み込み中…</p>';

    const stats = await fetchAchievementStats();
    renderAchievementsList(stats);

    // この画面を開いた時点で解除済みの実績はすべて「確認済み」として扱い、
    // バッジを消し、以後の演出の重複対象からも外す
    // （演出を見逃した状態でここに来た場合も、ここで確認したものとみなす）
    const unlockedIds = ACHIEVEMENT_DEFS.filter(def => def.check(stats)).map(def => def.id);
    const viewed = _loadAchvIdSet(ACHV_VIEWED_KEY);
    const notified = _loadAchvIdSet(ACHV_NOTIFIED_KEY);
    unlockedIds.forEach(id => { viewed.add(id); notified.add(id); });
    _saveAchvIdSet(ACHV_VIEWED_KEY, viewed);
    _saveAchvIdSet(ACHV_NOTIFIED_KEY, notified);
    refreshAchievementBadge();
}

function returnFromAchievementsScreen() {
    changeScreen('screen-title');
    openAccountModal();
}

function renderAchievementsList(stats) {
    const container = document.getElementById('achievements-list');
    if (!container) return;

    const results = ACHIEVEMENT_DEFS.map(def => ({ def, unlocked: !!def.check(stats) }));
    const unlockedCount = results.filter(r => r.unlocked).length;

    const summaryEl = document.getElementById('achievements-summary');
    if (summaryEl) summaryEl.textContent = `達成 ${unlockedCount} / ${ACHIEVEMENT_DEFS.length}`;

    container.innerHTML = results.map(({ def, unlocked }) => `
        <div class="bg-[#2a1b15] border rounded-xl p-3 flex items-center gap-3 ${unlocked ? 'border-amber-500' : 'border-gray-800 opacity-60'}">
            <div class="w-10 h-10 flex-shrink-0 flex items-center justify-center text-2xl rounded-full ${unlocked ? 'bg-amber-900/40' : 'bg-[#1a120b] grayscale'}">${def.emoji}</div>
            <div class="min-w-0 flex-1">
                <div class="text-xs font-bold ${unlocked ? 'text-amber-200' : 'text-gray-400'}">${def.name}${unlocked ? ' <span class="text-[9px] text-amber-400">✔ 達成済み</span>' : ''}</div>
                <div class="text-[9px] text-gray-500 mt-0.5">${def.desc}</div>
                ${def.diamondReward ? `<div class="text-[9px] font-bold mt-0.5 ${unlocked ? 'text-cyan-400' : 'text-cyan-600'}">💎 ${unlocked ? '獲得済み' : '報酬'}：${def.diamondReward.toLocaleString()}個</div>` : ''}
            </div>
        </div>
    `).join('');
}

// =====================================================
// 実績の「新規解除」通知まわり
// ・解除済みかどうか自体はステートレスに毎回判定するが、
//   「もう演出を見せたか」「もう一覧画面で確認したか」の2つだけは
//   端末のlocalStorageに保存し、演出の重複表示とバッジの表示要否を管理する。
// =====================================================
const ACHV_NOTIFIED_KEY = 'mfload_achv_notified'; // 演出を表示済みの実績ID一覧（演出の重複防止）
const ACHV_VIEWED_KEY = 'mfload_achv_viewed';     // 実績画面で確認済みの実績ID一覧（バッジの表示要否）

function _loadAchvIdSet(key) {
    try {
        const raw = localStorage.getItem(key);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
        return new Set();
    }
}
function _saveAchvIdSet(key, idSet) {
    try {
        localStorage.setItem(key, JSON.stringify([...idSet]));
    } catch (e) { /* 保存に失敗しても致命的ではないので無視する */ }
}

// --- ガッツファクトリー／エンドレスモードの「ゲームオーバー or クリア」直後、およびアプリ起動時に呼び出す ---
// 新規に解除された実績があれば、特別演出（ポップアップ）をキューに積んで表示する。
// また、ダイヤ報酬がまだ受け取られていない達成済み実績（今回の更新前から達成していたものも含む）
// があれば、演出とは独立してまとめて静かに付与する（サーバー側フラグで管理するため、
// 端末を変えても二重付与されない）。
async function checkAndCelebrateNewAchievements() {
    try {
        const stats = await fetchAchievementStats();
        const unlocked = ACHIEVEMENT_DEFS.filter(def => def.check(stats));
        const notified = _loadAchvIdSet(ACHV_NOTIFIED_KEY);
        const newlyUnlocked = unlocked.filter(def => !notified.has(def.id));

        // バッジは「解除済みだが未確認」全体で判定するため、演出の有無に関わらず毎回更新する
        refreshAchievementBadge(stats);

        // --- ダイヤ報酬の付与（新規解除・既存達成済みの遡及分の両方をまとめて対象にする） ---
        const claimedMap = (typeof fetchClaimedAchievementDiamondIds === 'function') ? await fetchClaimedAchievementDiamondIds() : {};
        const unclaimedDefs = unlocked.filter(def => def.diamondReward && !claimedMap[def.id]);
        if (unclaimedDefs.length > 0) {
            const totalReward = unclaimedDefs.reduce((sum, def) => sum + def.diamondReward, 0);
            if (typeof awardDiamonds === 'function') await awardDiamonds(totalReward);
            if (typeof markAchievementDiamondsClaimed === 'function') await markAchievementDiamondsClaimed(unclaimedDefs.map(def => def.id));
            if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();

            // 既に演出確認済みだった実績（＝今回の更新より前から達成していたもの）は、
            // 大きな演出は出さず、まとめてトーストでダイヤ受領だけ知らせる（遡及配布）
            const silentDefs = unclaimedDefs.filter(def => notified.has(def.id));
            if (silentDefs.length > 0 && typeof showToast === 'function') {
                const silentTotal = silentDefs.reduce((sum, def) => sum + def.diamondReward, 0);
                showToast(`💎 達成済みの実績報酬として、ダイヤ${silentTotal.toLocaleString()}個を追加で受け取りました！`);
            }
        }

        if (newlyUnlocked.length === 0) return;
        newlyUnlocked.forEach(def => notified.add(def.id));
        _saveAchvIdSet(ACHV_NOTIFIED_KEY, notified);
        queueAchievementCelebrations(newlyUnlocked);
    } catch (e) {
        console.error('[実績] 新規解除チェックエラー:', e);
    }
}

// --- タイトル画面・アカウント管理内のボタンに「未確認の実績あり」の赤バッジを表示する ---
async function refreshAchievementBadge(statsArg) {
    const badgeEls = [
        document.getElementById('account-achv-badge'),
        document.getElementById('stats-tab-achv-badge')
    ].filter(Boolean);
    if (badgeEls.length === 0) return;

    const stats = statsArg || await fetchAchievementStats();
    const unlockedIds = ACHIEVEMENT_DEFS.filter(def => def.check(stats)).map(def => def.id);
    const viewed = _loadAchvIdSet(ACHV_VIEWED_KEY);
    const hasUnseen = unlockedIds.some(id => !viewed.has(id));
    badgeEls.forEach(el => el.classList.toggle('hidden', !hasUnseen));
}

// --- 実績解除の演出を1件ずつ順番に表示するキュー ---
let _achvCelebrationQueue = [];
function queueAchievementCelebrations(defs) {
    const wasEmpty = _achvCelebrationQueue.length === 0;
    _achvCelebrationQueue.push(...defs);
    if (wasEmpty) showNextAchievementCelebration();
}

function showNextAchievementCelebration() {
    if (_achvCelebrationQueue.length === 0) return;
    const def = _achvCelebrationQueue.shift();
    const overlay = document.getElementById('achievement-celebration-overlay');
    const card = overlay ? overlay.querySelector('.achievement-celebration-card') : null;
    if (!overlay || !card) return;

    document.getElementById('achievement-celebration-emoji').textContent = def.emoji;
    document.getElementById('achievement-celebration-name').textContent = def.name;
    document.getElementById('achievement-celebration-desc').textContent = def.desc;
    const rewardEl = document.getElementById('achievement-celebration-reward');
    if (rewardEl) {
        rewardEl.textContent = def.diamondReward ? `💎 ダイヤ${def.diamondReward.toLocaleString()}個獲得！` : '';
    }
    overlay.classList.remove('hidden');

    // 複数連続表示の際もポップイン・アニメーションを毎回頭から再生させる
    card.style.animation = 'none';
    void card.offsetWidth; // 強制リフローでアニメーションをリセットする
    card.style.animation = '';

    if (typeof AudioManager !== 'undefined' && AudioManager.playSE) AudioManager.playSE('win');
}

// --- 演出を閉じる。キューに次があれば少し間を置いて続けて表示する ---
function closeAchievementCelebration() {
    const overlay = document.getElementById('achievement-celebration-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (_achvCelebrationQueue.length > 0) {
        setTimeout(showNextAchievementCelebration, 300);
    }
}
