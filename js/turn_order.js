// =====================================================
// 行動順決定エンジン (js/turn_order.js)
//
// 「両者が同時に行動を選択し、①技優先度 → ②移動速度 → ③ランダム(同値時)
//  の順で行動順を決定する」ロジックを独立したモジュールとして実装したもの。
//
// ガッツファクトリー（js/masmon_battle.js）・PvP（js/masmon_realtime_battle.js）
// の両方から共通で呼び出される想定。
//
// 今後、「素早さ上昇」「先制技」「後攻時に威力アップ」「反撃技」等を追加する場合は、
// 基本的にこのファイルの ACTION_TIER_PRIORITY と TurnOrderResolver.resolve() だけを
// 触れば対応できるように設計している（他のバトルロジックへの影響を最小限にするため）。
// =====================================================

// 行動タイプ別の基本優先度階層（数値が大きいほど先に行動する）。
// 技個別の priority（SKILLS_DB[key].priority、未指定は0）は 'skill' 階層に加算される。
const ACTION_TIER_PRIORITY = {
    switchOut: 6,   // 交代（既存仕様通り、行動順に関わらず必ず先に処理する）
    item: 6,        // 対戦アイテム使用（既存仕様通り、必ず先に処理する）
    defend: 4,      // 防御（技優先度に関わらず、必ず通常の技より先攻する）
    skill: 0,       // 通常の技（技ごとの priority がここに加算される）
    none: -99       // 行動不能（ガッツ不足・混乱・戦闘不能など）
};

/**
 * ランク文字列（S/A/B/C/D/E/F）を数値に変換する。
 * database.js 側に同名の定義がある場合はそちらを優先して使う（二重定義防止）。
 */
function getMoveSpeedValueFromRankSafe(rank) {
    if (typeof getMoveSpeedValueFromRank === 'function') {
        return getMoveSpeedValueFromRank(rank);
    }
    const table = { S: 110, A: 95, B: 80, C: 65, D: 50, E: 35, F: 20 };
    return (table[rank] !== undefined) ? table[rank] : table.D;
}

/**
 * 1体分の「今ターンの行動」を表すオブジェクトを作成する。
 * @param {'switchOut'|'item'|'defend'|'skill'|'none'} actionType
 * @param {number} skillPriority 技固有の優先度（未指定は0。数値が大きいほど先攻）
 * @param {number} speed 実効移動速度（装備・バフ等を加味した最終値）
 * @returns {{actionType:string, priority:number, speed:number}}
 */
function createTurnAction(actionType, skillPriority, speed) {
    const tierValue = (ACTION_TIER_PRIORITY[actionType] !== undefined) ? ACTION_TIER_PRIORITY[actionType] : 0;
    return {
        actionType: actionType,
        priority: tierValue + (actionType === 'skill' ? (skillPriority || 0) : 0),
        speed: speed || 0
    };
}

// =====================================================
// 行動順決定クラス
// 判定順: ① 技優先度 → ② 移動速度 → ③ ランダム（同値時は50%）
// =====================================================
class TurnOrderResolver {
    /**
     * @param {{actionType:string, priority:number, speed:number}} actionA A側の行動情報
     * @param {{actionType:string, priority:number, speed:number}} actionB B側の行動情報
     * @returns {{order: ('A'|'B')[], reason: string}} order[0] が先攻
     */
    static resolve(actionA, actionB) {
        // 行動不能（ガッツ不足・混乱・戦闘不能等）は必ず後回しにする
        if (actionA.actionType === 'none' && actionB.actionType !== 'none') {
            return { order: ['B', 'A'], reason: 'A行動不能' };
        }
        if (actionB.actionType === 'none' && actionA.actionType !== 'none') {
            return { order: ['A', 'B'], reason: 'B行動不能' };
        }

        // ① 技優先度（行動タイプ階層 ＋ 技固有優先度）
        if (actionA.priority !== actionB.priority) {
            return (actionA.priority > actionB.priority)
                ? { order: ['A', 'B'], reason: '優先度' }
                : { order: ['B', 'A'], reason: '優先度' };
        }

        // ② 移動速度
        if (actionA.speed !== actionB.speed) {
            return (actionA.speed > actionB.speed)
                ? { order: ['A', 'B'], reason: '速度' }
                : { order: ['B', 'A'], reason: '速度' };
        }

        // ③ ランダム（同値時は50%の確率で先攻）
        return (Math.random() < 0.5)
            ? { order: ['A', 'B'], reason: 'ランダム' }
            : { order: ['B', 'A'], reason: 'ランダム' };
    }
}
