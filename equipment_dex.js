// =====================================================
// achievements.js
// 実績・バッジシステム。
// 新しく専用のFirebaseノードを持たず、既存の永続データ（ガッツファクトリーのランキング統計、
// エンドレスモードの自己ベスト連勝記録、モンスター使用率トラッキング）を毎回読み直して
// 「達成済みかどうか」をその場で判定するステートレスな仕組み。
// （＝バックエンド側の実績データを別途保存・同期する必要がなく、シンプルかつズレが起きない）
// =====================================================

const ACHIEVEMENT_DEFS = [
    { id: 'first_clear', emoji: '🏆', name: '初クリア', desc: 'ガッツファクトリーを1回クリアする', check: stats => !!stats.kin.bestCleared },
    { id: 'kin_streak_10', emoji: '🔥', name: '連勝10（ガッツファクトリー）', desc: 'ガッツファクトリーで10連勝する', check: stats => stats.kin.bestWins >= 10 },
    { id: 'kin_streak_25', emoji: '🔥', name: '連勝25（ガッツファクトリー）', desc: 'ガッツファクトリーで25連勝する', check: stats => stats.kin.bestWins >= 25 },
    { id: 'kin_streak_49', emoji: '👑', name: '完全制覇（ガッツファクトリー）', desc: 'ガッツファクトリーを49連勝（全セットクリア）する', check: stats => stats.kin.bestWins >= 49 },
    { id: 'endless_streak_10', emoji: '⭐', name: 'エンドレス10連勝', desc: 'エンドレスモードで10連勝する', check: stats => stats.endless.bestStreak >= 10 },
    { id: 'endless_streak_25', emoji: '🌟', name: 'エンドレス25連勝', desc: 'エンドレスモードで25連勝する', check: stats => stats.endless.bestStreak >= 25 },
    { id: 'endless_streak_50', emoji: '💫', name: 'エンドレス50連勝', desc: 'エンドレスモードで50連勝する', check: stats => stats.endless.bestStreak >= 50 },
    { id: 'endless_streak_100', emoji: '🌠', name: 'エンドレス100連勝', desc: 'エンドレスモードで100連勝する', check: stats => stats.endless.bestStreak >= 100 },
    { id: 'all_monsters_used', emoji: '📖', name: '図鑑コンプリート', desc: 'ガッツファクトリーで全種類のモンスターを1回以上パーティに加える', check: stats => stats.usedSpeciesCount >= KIN_NEJIKI_SPECIES_POOL.length }
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

    return {
        kin: {
            bestWins: (kinStats && kinStats.bestWins) || 0,
            bestCleared: !!(kinStats && kinStats.bestCleared)
        },
        endless: {
            bestStreak: (endlessStats && endlessStats.bestStreak) || 0
        },
        usedSpeciesCount: Object.keys(usageSnapVal || {}).length
    };
}

async function openAchievementsScreen() {
    changeScreen('screen-achievements');
    const container = document.getElementById('achievements-list');
    if (container) container.innerHTML = '<p class="text-gray-500 text-xs text-center py-8">読み込み中…</p>';

    const stats = await fetchAchievementStats();
    renderAchievementsList(stats);
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
            </div>
        </div>
    `).join('');
}
