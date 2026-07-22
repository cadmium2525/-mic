// =====================================================
// kinnejiki.js
// 「ガッツファクトリー」レンタルモンスターバトルモード
// ・育成モードを介さず、あらかじめ用意されたレンタルモンスターから
//   6体提示→3体選出でパーティを組み、7戦1セット×7セット＝49連勝を目指す
// ・1勝ごとに相手モンスター1体と手持ち1体を交換できる
// ・3セット目・7セット目のクリア後（＝各セットの7戦目）にレジェンドブリーダー・コルトが登場
// ・セットが進むほど相手のステータス・AIレベル・装備が強化される
// ・既存の masmon_battle.js の3vs3バトルエンジンをそのまま再利用する
//   （MASMON_BATTLE_STATE.kinNejiki フラグでガッツファクトリー実行中を識別）
// Firebase Realtime Database: kinnejiki_ranking/{playerId} = { name, bestWins, bestCleared, updatedAt }
// =====================================================

const KIN_NEJIKI_STATE = {
    active: false,
    set: 1,            // 1〜7
    battleInSet: 1,     // 1〜7（7戦目が各セットのボス戦）
    totalWins: 0,       // 0〜49
    playerParty: [],    // 選出した3体（レンタルモンスターオブジェクト）
    offer: [],          // 現在提示中の6体（パーティ選出画面用）
    selectedIdx: [],    // offer内で選択中のインデックス（最大3）
    pendingSwap: null,  // 直前の勝利で交換対象になる相手チーム情報
    // 「こちらが交換する前に相手のモンスターが決まる」仕様のため、次バトルの対戦相手は
    // 勝利直後（交換画面が開く前）の時点で先に生成し、ここに保持しておく。
    // { opponentTeam, floorLabel, isNejiki, aiLevel } または null
    nextBattlePrepared: null,
    // タスクキル（バトル中のアプリ強制終了）を検知した回数。3回で強制ゲームオーバーとする。
    taskKillCount: 0
};

// =====================================================
// 対戦相手ブリーダー名鑑（ボス戦を除く通常戦の相手に順番に割り当てる二つ名付きブリーダー）
// 通算バトル数（1〜49）に応じて、この配列を先頭からループしながら割り当てる。
// =====================================================
const KIN_NEJIKI_BREEDER_NAMES = [
    '白銀の騎士アルベルト',
    '飛燕のセシリア',
    '鉄腕ガルシア',
    '不敗のマキシム',
    'エリートブリーダークロウ',
    'ただのララ',
    '怪老ゲンジ',
    '幻惑のシルバ',
    '熱血ブリーダーダイゴ',
    'お嬢様カトリーヌ',
    'ミスターG',
    '迷子のトト',
    '神速のレオン',
    '冥府の門番ハデス',
    '大地の母エレーナ'
];

// --- 通算バトル数（1〜）からブリーダー名を1つ割り当てる（15名を順番にループ） ---
function getKinNejikiBreederName(totalBattleNumber) {
    const idx = (Math.max(1, totalBattleNumber) - 1) % KIN_NEJIKI_BREEDER_NAMES.length;
    return KIN_NEJIKI_BREEDER_NAMES[idx];
}

// =====================================================
// 途中セーブ（一時中断・再開専用。コンティニューとしては使えない）
// ・任意のタイミング（勝利後の交換画面）でセーブ可能
// ・再開後に敗北した場合は、そのセーブデータを削除する
// ・クリア（49勝達成）時も削除する
// =====================================================
const KIN_NEJIKI_SUSPEND_KEY = 'mfload_kinnejiki_suspend_v1';

// =====================================================
// タスクキル対策
// ・バトル画面に入っている間だけ「バトル中フラグ」をlocalStorageに立てる
// ・アプリ起動時にこのフラグが残っていた場合、直前の終了がバトル中の強制終了（タスクキル）
//   だったと判断し、一時セーブに記録された回数をカウントアップする
// ・3回検知した時点でその挑戦を強制的にゲームオーバー扱いとする
//   （負けそうになったらタスクキルして再開する、というやり直しを防ぐための仕様）
// =====================================================
const KIN_NEJIKI_BATTLE_FLAG_KEY = 'mfload_kinnejiki_battle_flag_v1';
const KIN_NEJIKI_MAX_TASK_KILLS = 3;

function markKinNejikiBattleStarted() {
    try {
        localStorage.setItem(KIN_NEJIKI_BATTLE_FLAG_KEY, '1');
    } catch (e) { /* ignore */ }
}

function clearKinNejikiBattleFlag() {
    try {
        localStorage.removeItem(KIN_NEJIKI_BATTLE_FLAG_KEY);
    } catch (e) { /* ignore */ }
}

// --- アプリ起動時に1度だけ呼ばれ、直前の終了がタスクキルだったかどうかを判定する ---
function checkKinNejikiTaskKillOnLoad() {
    let battleWasInProgress = false;
    try {
        battleWasInProgress = !!localStorage.getItem(KIN_NEJIKI_BATTLE_FLAG_KEY);
    } catch (e) {
        battleWasInProgress = false;
    }
    if (!battleWasInProgress) return;

    // バトル画面のまま終了された形跡があるので、フラグは一旦クリアする
    clearKinNejikiBattleFlag();

    let saved = null;
    try {
        const raw = localStorage.getItem(KIN_NEJIKI_SUSPEND_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch (e) {
        saved = null;
    }
    if (!saved) return; // 一時セーブが無ければ判定対象外

    const newCount = (saved.taskKillCount || 0) + 1;

    if (newCount >= KIN_NEJIKI_MAX_TASK_KILLS) {
        // 規定回数に達したので、その挑戦を強制的にゲームオーバー扱いにする
        const finalWins = saved.totalWins || 0;
        clearKinNejikiSuspendSave();
        try {
            if (typeof saveKinNejikiRanking === 'function') saveKinNejikiRanking(finalWins, false);
        } catch (e) { /* ignore */ }
        setTimeout(() => {
            if (typeof showToast === 'function') {
                showToast(`⚠️ タスクキルを${KIN_NEJIKI_MAX_TASK_KILLS}回検知したため、ガッツファクトリーの挑戦がゲームオーバーになりました（通算${finalWins}勝）`);
            }
        }, 600);
    } else {
        saved.taskKillCount = newCount;
        try {
            localStorage.setItem(KIN_NEJIKI_SUSPEND_KEY, JSON.stringify(saved));
        } catch (e) { /* ignore */ }
        setTimeout(() => {
            if (typeof showToast === 'function') {
                showToast(`⚠️ バトル中の強制終了を検知しました（${newCount}/${KIN_NEJIKI_MAX_TASK_KILLS}回。${KIN_NEJIKI_MAX_TASK_KILLS}回で挑戦は強制終了となります）`);
            }
        }, 600);
    }
}

window.addEventListener('load', checkKinNejikiTaskKillOnLoad);

function hasKinNejikiSuspendSave() {
    try {
        return !!localStorage.getItem(KIN_NEJIKI_SUSPEND_KEY);
    } catch (e) {
        return false;
    }
}

function saveKinNejikiSuspend() {
    if (!KIN_NEJIKI_STATE.active) {
        showToast('挑戦中のみ一時セーブできます。');
        return;
    }
    // 勝利後の交換画面から呼ばれた場合、この勝利分をまだカウンタ（battleInSet/set）へ
    // 反映していないことがあるので、その場合はここで先に反映してからセーブする。
    // （これをしないと再開時に直前に勝ったバトルをもう一度やり直すことになってしまう）
    if (KIN_NEJIKI_STATE.pendingSwap) {
        advanceKinNejikiCounters();
    }
    // セーブ時点ではバトル中ではないはずなので、念のためバトル中フラグをクリアしておく
    clearKinNejikiBattleFlag();
    try {
        const payload = {
            set: KIN_NEJIKI_STATE.set,
            battleInSet: KIN_NEJIKI_STATE.battleInSet,
            totalWins: KIN_NEJIKI_STATE.totalWins,
            playerParty: KIN_NEJIKI_STATE.playerParty,
            // 次バトルの対戦相手（事前生成済みのもの）も一緒に保存し、再開時にCPUの構成が
            // 変わらないようにする（保存せずに再開時その場で作り直すと、相手が毎回変わってしまう）
            nextBattlePrepared: KIN_NEJIKI_STATE.nextBattlePrepared || null,
            // タスクキル検知回数も保存し、再開後に別セッションへ引き継がれるようにする
            taskKillCount: KIN_NEJIKI_STATE.taskKillCount || 0,
            savedAt: Date.now()
        };
        localStorage.setItem(KIN_NEJIKI_SUSPEND_KEY, JSON.stringify(payload));
        KIN_NEJIKI_STATE.active = false;
        showToast('一時セーブしました。タイトルに戻ります。');
        setTimeout(() => changeScreen('screen-title'), 800);
    } catch (e) {
        console.error('[ガッツファクトリー] 一時セーブエラー:', e);
        showToast('一時セーブに失敗しました。');
    }
}

function clearKinNejikiSuspendSave() {
    try {
        localStorage.removeItem(KIN_NEJIKI_SUSPEND_KEY);
    } catch (e) { /* ignore */ }
}

// タイトル→説明画面に入るタイミングで「続きから再開する」ボタンの表示を切り替える
function updateKinNejikiResumeButtonVisibility() {
    const btn = document.getElementById('kinnejiki-resume-btn');
    if (btn) btn.classList.toggle('hidden', !hasKinNejikiSuspendSave());
}

function resumeKinNejikiRun() {
    let saved = null;
    try {
        const raw = localStorage.getItem(KIN_NEJIKI_SUSPEND_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch (e) {
        saved = null;
    }
    if (!saved) {
        showToast('一時セーブデータが見つかりませんでした。');
        return;
    }

    KIN_NEJIKI_STATE.active = true;
    KIN_NEJIKI_STATE.set = saved.set;
    KIN_NEJIKI_STATE.battleInSet = saved.battleInSet;
    KIN_NEJIKI_STATE.totalWins = saved.totalWins;
    KIN_NEJIKI_STATE.playerParty = saved.playerParty;
    KIN_NEJIKI_STATE.pendingSwap = null;
    // 保存しておいた次バトルの対戦相手をそのまま復元する（CPUの構成を再開のたびに
    // 変えないようにするため。無ければnullのままとなり、従来通りその場で生成される）
    KIN_NEJIKI_STATE.nextBattlePrepared = saved.nextBattlePrepared || null;
    KIN_NEJIKI_STATE.taskKillCount = saved.taskKillCount || 0;

    showToast(`セーブデータから再開します（通算${saved.totalWins}勝・第${saved.set}セット）`);
    advanceToNextKinNejikiBattle();
}

// --- セット番号からAIレベル（1〜4）を算出 ---
function kinNejikiAiLevelForSet(setNumber) {
    if (setNumber <= 2) return 1;
    if (setNumber <= 4) return 2;
    if (setNumber <= 6) return 3;
    return 4; // 7セット目（最終ボス含む）
}

// --- セット番号に応じた装備の段階的抽選 ---
// セット1〜2：ノーマル産ステータス装備中心 / セット3〜5：ハード産＋一部特殊効果 / セット6〜7：特殊効果中心
// excludeEquipIds: この配列に含まれる装備IDは抽選対象から除外する
//                  （除外しすぎて候補が0件になった場合は保険として除外を無視する）
function kinNejikiRollEquipmentForSet(setNumber, excludeEquipIds) {
    const excluded = excludeEquipIds || [];

    // 装備なし（未装備）の余地も一定確率で残す
    if (Math.random() < 0.15) return null;

    let pool;
    if (setNumber <= 2) {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.mode === 'normal' && e.type === 'stat');
    } else if (setNumber <= 5) {
        pool = (Math.random() < 0.3)
            ? Object.values(EQUIPMENT_DB).filter(e => e.type === 'special')
            : Object.values(EQUIPMENT_DB).filter(e => e.mode === 'hard' && e.type === 'stat');
    } else {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'special');
    }
    if (!pool || pool.length === 0) {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'stat');
    }

    let filteredPool = pool.filter(e => !excluded.includes(e.id));
    if (filteredPool.length === 0) filteredPool = pool; // 除外しすぎて候補が無くなった場合の保険

    const base = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    return buildEquipmentInstanceFromBase(base);
}

// --- 指定種族のレンタルモンスターを1体生成する ---
// ・技構成＋装備：MONSTER_MOLDS に定義された「型」から、セット数（周回数）に応じて
//   解放された範囲でランダムに1つ選ぶ（型データが無い種族は従来通りランダム抽選にフォールバック）
// ・ステータス：種族ベース値に個体差(±8%)とセット進行によるスケールを掛ける
// excludeEquipIds: 生成する装備から除外したい装備IDの配列（同じ道具を持ったモンスター同士が
//                  対面しないようにするための調整。省略可）
function generateKinNejikiRentalMonster(speciesId, setNumber, excludeEquipIds) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    if (!tmpl) return null;

    const unlockedMoldCount = (typeof getMoldUnlockCountForSet === 'function') ? getMoldUnlockCountForSet(setNumber) : 1;
    const mold = (typeof pickMonsterMold === 'function') ? pickMonsterMold(speciesId, unlockedMoldCount, excludeEquipIds) : null;

    let chosenSkills, equipInstance;
    if (mold) {
        chosenSkills = mold.skills;
        equipInstance = mold.equip;
    } else {
        // 型データが無い（未定義の）種族向けフォールバック：従来通りのランダム抽選
        const skillPool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
        const shuffledSkills = [...skillPool].sort(() => Math.random() - 0.5);
        chosenSkills = shuffledSkills.slice(0, Math.min(4, shuffledSkills.length));
        equipInstance = kinNejikiRollEquipmentForSet(setNumber, excludeEquipIds);
    }

    const individualVariance = () => 0.92 + Math.random() * 0.16; // ±8%の個体差
    const setScale = 1 + (Math.max(0, setNumber - 1) * 0.06); // セットが進むごとに約6%ずつ強化
    // ちから/かしこさ特化型（dualStatType種族）の場合、型ごとのstatModをpow/intに乗算する
    const powMod = (mold && mold.statMod && mold.statMod.pow) || 1;
    const intMod = (mold && mold.statMod && mold.statMod.int) || 1;

    const rawStats = {
        maxLife: Math.round(tmpl.stats.maxLife * individualVariance() * setScale),
        pow: Math.round(tmpl.stats.pow * powMod * individualVariance() * setScale),
        int: Math.round(tmpl.stats.int * intMod * individualVariance() * setScale),
        hit: Math.round(tmpl.stats.hit * individualVariance() * setScale),
        spd: Math.round(tmpl.stats.spd * individualVariance() * setScale),
        def: Math.round(tmpl.stats.def * individualVariance() * setScale),
        gutsSpeed: tmpl.stats.gutsSpeed
    };
    rawStats.life = rawStats.maxLife;

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: speciesId,
        aura: getRandomAuraKey(), // 全モンスターに必ずオーラを付与する
        isAwakened: false,
        statusEffect: null,
        difficulty: 'kinnejiki',
        stats: rawStats,
        skills: chosenSkills,
        skillEnhancements: {},
        equip: equipInstance,
        ownerName: 'レンタルモンスター'
    };
}

// --- 12種族プールから重複なく指定数（既定6体）のレンタル候補を生成 ---
// excludeSpeciesIds: 抽選対象から除外したい種族IDの配列（同じモンスター同士が対面しないための調整。省略可）
// excludeEquipIds:   各個体の装備から除外したい装備IDの配列（省略可）
// count:             生成する体数（既定6）
function generateKinNejikiOffer(setNumber, excludeSpeciesIds, excludeEquipIds, count) {
    const n = count || 6;
    const excludeSpecies = excludeSpeciesIds || [];

    let candidatePool = KIN_NEJIKI_SPECIES_POOL.filter(sp => !excludeSpecies.includes(sp));
    if (candidatePool.length < n) candidatePool = KIN_NEJIKI_SPECIES_POOL.slice(); // 除外しすぎて足りない場合の保険

    const shuffledSpecies = [...candidatePool].sort(() => Math.random() - 0.5);
    const chosenSpecies = shuffledSpecies.slice(0, n);
    return chosenSpecies.map(sp => generateKinNejikiRentalMonster(sp, setNumber, excludeEquipIds));
}

// --- 対戦相手チーム（3体）を生成。ボス戦の場合は専用ボス＋帯同2体を返す ---
// excludeSpeciesIds / excludeEquipIds: 「同じモンスター・同じ装備同士が対面しない」仕様のための除外リスト（省略可）
function generateKinNejikiOpponentTeam(setNumber, isNejiki, excludeSpeciesIds, excludeEquipIds, totalBattleNumber) {
    const excludeSpecies = excludeSpeciesIds || [];
    const excludeEquip = excludeEquipIds || [];

    if (isNejiki) {
        const bossKey = (setNumber === 3) ? 'set3' : 'set7';
        const bossDef = KIN_NEJIKI_BOSSES[bossKey];
        // molds（複数の型）を持つボスは、バトルのたびにいずれか1つの型をランダムで選ぶ。
        // molds未定義のボスは従来通り固定のskills配列をそのまま使う。
        const bossSkills = (bossDef.molds && bossDef.molds.length > 0)
            ? bossDef.molds[Math.floor(Math.random() * bossDef.molds.length)]
            : bossDef.skills;
        const bossUnit = {
            name: bossDef.name,
            shortName: bossDef.shortName || null,
            monsterBaseName: bossDef.templateId ? (MONSTER_TEMPLATES[bossDef.templateId] || {}).name || bossDef.name : bossDef.name,
            // 専用イラストが用意されているボスは、モン類判定用のmonsterBaseNameとは別に
            // 表示イラスト名を上書きする（例：set3ボスはゴーレム種だが「ゴビ.png」、
            // set7ボスは特定種族に属さないが「モスト.png」を使用する）
            visualName: (bossKey === 'set3') ? 'ゴビ' : (bossKey === 'set7') ? 'モスト' : null,
            emoji: bossDef.emoji,
            speciesId: bossDef.templateId,
            aura: bossDef.aura || getRandomAuraKey(),
            isAwakened: false,
            statusEffect: null,
            difficulty: 'kinnejiki',
            stats: { ...bossDef.statsBase, life: bossDef.statsBase.maxLife },
            skills: [...bossSkills],
            skillEnhancements: {},
            equip: kinNejikiRollEquipmentForSet(7, excludeEquip),
            ownerName: bossDef.title
        };
        const escorts = generateKinNejikiOffer(7, excludeSpecies, excludeEquip, 2);
        escorts.forEach(m => { if (m) m.ownerName = bossDef.title; });
        return [bossUnit, ...escorts.filter(Boolean)];
    }

    const breederName = getKinNejikiBreederName(totalBattleNumber || 1);
    const team = generateKinNejikiOffer(setNumber, excludeSpecies, excludeEquip, 3);
    team.forEach(m => { if (m) m.ownerName = breederName; });
    return team;
}

// =====================================================
// 敵AIロジック（アイテムは使わず、技選択と交代のみガッツファクトリー専用に判定する）
// =====================================================

// --- 敵の技選択（アイテムAI runEnemyItemAI とは別に、ガッツファクトリー戦のみ masmon_battle.js から呼ばれる） ---
// --- 敵AIの「性格」をバトルごとにランダムで1つ割り当てる ---
// 同じ相手・同じAIレベルでも毎回立ち回りが変わるようにするための仕組み。
//   speedy   : 速攻型 … 確殺があれば当然狙うが、それ以外は常に最大火力の技を選ぶ
//   control  : 搦め手型 … 確殺が無ければガッツダウン値の高い技を優先し、じわじわ制圧してくる
//   sustain  : 粘り型 … 自身のライフが40%を切ると、回復技があれば最優先で使ってくる
//   balanced : バランス型 … 既存のレベル別ロジックそのまま（特別な偏りなし）
const KIN_NEJIKI_AI_PERSONALITIES = ['speedy', 'control', 'sustain', 'balanced'];
function pickKinNejikiAiPersonality() {
    return KIN_NEJIKI_AI_PERSONALITIES[Math.floor(Math.random() * KIN_NEJIKI_AI_PERSONALITIES.length)];
}

// --- 相手を弱体化・状態異常にする「妨害・デバフ技」の判定用（database.js のSKILLS_DBのeffectフィールドを参照） ---
const KIN_NEJIKI_DEBUFF_EFFECTS = new Set([
    'weaken_pow_int', 'evasion_def_down_20', 'def_down_15', 'def_down_15_perma',
    'blind_2', 'paralyze_25', 'confuse_30', 'sleep_2', 'burn', 'poison',
    'dot_mine', 'dot_mine_aura_bonus', 'guts_drain', 'stun_debuff_once'
]);
function kinNejikiIsDebuffSkill(skInfo) {
    return !!(skInfo && skInfo.effect && KIN_NEJIKI_DEBUFF_EFFECTS.has(skInfo.effect));
}

// --- 技の「命中率を加味した期待ダメージ」を見積もる（実際のダメージ計算式に準拠。乱数・クリティカル・装備効果等は考慮しない目安値）---
// 「期待ダメージ＝威力×命中率」で評価することで、当たれば大きいが外れやすい大技をAIが過信しないようにする。
// getBuffedAttackStat等（database.js）を使うため、自身の攻撃バフ／弱体化や相手の防御バフ・防御崩し、
// オーラ／モン類の有利不利も実戦と同じ形で反映される。
function kinNejikiEstimateExpectedDamage(attacker, defender, skInfo) {
    if (!skInfo || (skInfo.type !== 'pow' && skInfo.type !== 'int')) return 0;
    const dmgMultiplier = (typeof MASMON_BATTLE_DAMAGE_MULTIPLIER === 'number') ? MASMON_BATTLE_DAMAGE_MULTIPLIER : 0.2;

    const atk = skInfo.useDefAsAtk
        ? getBuffedDefenseStat(attacker, getDefDownStat(attacker, attacker.stats.def), defender)
        : getBuffedAttackStat(attacker, getWeakenedStat(attacker, skInfo.type === 'pow' ? attacker.stats.pow : attacker.stats.int), skInfo.type, defender);
    const def = getDefDownStat(defender, getBuffedDefenseStat(defender, defender.stats.def, attacker)) * 1.5;
    const rawDmg = Math.max(1, atk * skInfo.force - def * 0.35) * dmgMultiplier;

    const hitStatDiff = (getBuffedHitStat(attacker, attacker.stats.hit, defender) - getEvasionStat(defender, defender.stats.spd, attacker)) * 0.5;
    const hitChance = Math.max(10, Math.min(99, (skInfo.hitRate || 100) + hitStatDiff - getBlindHitPenalty(attacker)));

    return rawDmg * (hitChance / 100);
}

// --- 自身の攻撃力が今どれくらい強化／弱体化されているかの簡易指標（1.0が基準） ---
// atkUpStacks・サクラの舞・瞑想・妖狐の祈り等の自己バフと、わらわら等による弱体化（weakenStacks）を反映する。
function kinNejikiSelfOffenseModifier(unit) {
    const base = getWeakenedStat(unit, 100);
    const powMod = getBuffedAttackStat(unit, base, 'pow', null) / 100;
    const intMod = getBuffedAttackStat(unit, base, 'int', null) / 100;
    return Math.max(powMod, intMod);
}

// --- 相手が能力（攻撃・防御・回避・クリティカル率等）を複数積み重ねているかどうかの簡易判定 ---
function kinNejikiOpponentIsBuffedUp(opponent) {
    const buffScore = (opponent.atkUpStacks || 0) + (opponent.sakuraBuffStacks || 0) * 2
        + (opponent.defUpStacks || 0) + (opponent.nendoGatameStacks || 0)
        + (opponent.mysticGuardStacks || 0) + (opponent.meisoStacks || 0)
        + (opponent.youkoInoriStacks || 0) + (opponent.spdUpStacks || 0)
        + (opponent.critUpStacks || 0);
    return buffScore >= 2;
}

function chooseKinNejikiEnemySkill(e, p, affordableSkills, aiLevel, personality) {
    if (!affordableSkills || affordableSkills.length === 0) return null;

    if (aiLevel <= 1) {
        return affordableSkills[Math.floor(Math.random() * affordableSkills.length)].key;
    }

    // 命中率を加味した期待ダメージ（実際の計算式に準拠）で技を評価する
    const withEstimate = affordableSkills.map(s => ({ ...s, estDmg: kinNejikiEstimateExpectedDamage(e, p, s.info) }));
    const lethalNow = withEstimate.filter(s => s.estDmg >= p.stats.life);

    // --- 性格によるバイアス（レベル2以上にのみ適用。レベル1は完全ランダムのまま） ---
    if (personality === 'sustain') {
        const lifeRatio = e.stats.life / e.stats.maxLife;
        if (lifeRatio < 0.4) {
            const healOptions = affordableSkills.filter(s => s.info.type === 'heal');
            if (healOptions.length > 0) {
                return healOptions[Math.floor(Math.random() * healOptions.length)].key;
            }
        }
    }

    // 確殺が無く、相手が能力を積んでいるなら妨害・デバフ技を優先する
    // （速攻型「speedy」は常に最大火力を狙う性格のため、ここでは対象外とする）
    if (personality !== 'speedy' && lethalNow.length === 0 && kinNejikiOpponentIsBuffedUp(p)) {
        const debuffOptions = withEstimate.filter(s => kinNejikiIsDebuffSkill(s.info));
        if (debuffOptions.length > 0) {
            debuffOptions.sort((a, b) => b.estDmg - a.estDmg);
            return debuffOptions[0].key;
        }
    }

    if (personality === 'control') {
        if (lethalNow.length === 0) {
            const control = withEstimate.filter(s => (s.info.gutsDown || 0) >= 15);
            if (control.length > 0) {
                control.sort((a, b) => (b.info.gutsDown || 0) - (a.info.gutsDown || 0));
                return control[0].key;
            }
        }
    }
    if (personality === 'speedy') {
        if (lethalNow.length > 0) {
            const sorted = lethalNow.slice().sort((a, b) => b.estDmg - a.estDmg);
            return sorted[0].key;
        }
        const sorted = withEstimate.slice().sort((a, b) => b.estDmg - a.estDmg);
        return sorted[0].key;
    }

    // 自身の攻撃バフが十分に整っている場合は、迷わず最大期待ダメージの技で押し切る
    if (lethalNow.length === 0 && kinNejikiSelfOffenseModifier(e) >= 1.3) {
        const attackOptions = withEstimate.filter(s => s.info.type === 'pow' || s.info.type === 'int');
        if (attackOptions.length > 0) {
            const sorted = attackOptions.slice().sort((a, b) => b.estDmg - a.estDmg);
            return sorted[0].key;
        }
    }

    // ここから下は「バランス型」、および性格による分岐に該当しなかった場合の
    // 通常ロジック（従来通りのレベル別の判断基準。estDmgは命中率込みの見積りに更新済み）。

    // レベル4（ボス級）：確殺が狙えるなら最大火力、そうでなければ制圧（ガッツダウン／状態異常）を優先
    if (aiLevel >= 4) {
        if (lethalNow.length > 0) {
            const sorted = lethalNow.slice().sort((a, b) => b.estDmg - a.estDmg);
            return sorted[0].key;
        }
        if (p.guts >= 55) {
            const control = withEstimate.filter(s => (s.info.gutsDown || 0) >= 20);
            if (control.length > 0) {
                control.sort((a, b) => (b.info.gutsDown || 0) - (a.info.gutsDown || 0));
                return control[0].key;
            }
        }
        const sorted = withEstimate.slice().sort((a, b) => b.estDmg - a.estDmg);
        return sorted[0].key;
    }

    // レベル3：確殺があれば最大火力、なければ上位技からランダム（読み合いの余地を残す）
    if (aiLevel >= 3) {
        if (lethalNow.length > 0) {
            const sorted = lethalNow.slice().sort((a, b) => b.estDmg - a.estDmg);
            return sorted[0].key;
        }
        const sorted = withEstimate.slice().sort((a, b) => b.estDmg - a.estDmg);
        const top = sorted.slice(0, Math.min(2, sorted.length));
        return top[Math.floor(Math.random() * top.length)].key;
    }

    // レベル2：ガッツが十分溜まっていれば大技、そうでなければ低コスト技で手数を稼ぐ
    if (e.guts >= 70) {
        const sorted = withEstimate.slice().sort((a, b) => b.estDmg - a.estDmg);
        return sorted[0].key;
    }
    const sorted = withEstimate.slice().sort((a, b) => a.info.cost - b.info.cost);
    return sorted[0].key;
}

// --- 交代候補（または現状維持中の自分自身）のオーラ／モン類相性スコアを算出する ---
// 有利なら加点・不利なら減点し、残りライフ割合分も加点する。
// 控えにオーラ・モン類で有利な一体がいれば、その分だけ交代の優先度が上がる仕組み。
function kinNejikiMatchupScore(unit, opponent) {
    let score = (unit.stats.life / unit.stats.maxLife) * 40;
    if (isAuraAdvantageous(unit.aura, opponent.aura)) score += 25;
    if (isAuraAdvantageous(opponent.aura, unit.aura)) score -= 20;
    if (isMonClassAdvantageous(unit.monsterBaseName, opponent.monsterBaseName)) score += 35;
    if (isMonClassAdvantageous(opponent.monsterBaseName, unit.monsterBaseName)) score -= 30;
    return score;
}

// --- 現在の相手に対して「まともな有効打」があるかどうかを判定する ---
// 攻撃技が１つも無い、または命中率を加味した期待ダメージがどれも相手の最大ライフのごく一部
// （目安：4%未満）にしか届かない場合、「今の相手には手詰まり」とみなして交代の検討対象にする。
function kinNejikiHasViableAttack(unit, opponent, affordableSkills) {
    const attackOptions = affordableSkills.filter(s => s.info.type === 'pow' || s.info.type === 'int');
    if (attackOptions.length === 0) return false;
    const best = Math.max(...attackOptions.map(s => kinNejikiEstimateExpectedDamage(unit, opponent, s.info)));
    return best >= opponent.stats.maxLife * 0.04;
}

// --- 敵の自動交代判定（AIレベル3以上のみ、decideMasmonEnemyAction冒頭から呼ばれる） ---
function maybeExecuteKinNejikiEnemySwitch() {
    if (MASMON_BATTLE_STATE.mode !== 'cpu_team') return false;
    const team = MASMON_BATTLE_STATE.enemyTeam;
    const idx = MASMON_BATTLE_STATE.enemyActiveIdx;
    const active = team[idx];
    if (!active || active.stats.life <= 0) return false;

    const opponent = getPlayerActive();
    if (!opponent || opponent.stats.life <= 0) return false;

    const candidates = team
        .map((unit, i) => ({ i, unit }))
        .filter(({ i, unit }) => i !== idx && unit.stats.life > 0);
    if (candidates.length === 0) return false;

    const lifeRatio = active.stats.life / active.stats.maxLife;

    // 現在の相手に有効打があるか（無ければ手詰まりとみなし交代を検討する）
    const affordableSkills = active.skills
        .map(skKey => ({ key: skKey, info: getMasmonEffectiveSkill(active, skKey) }))
        .filter(skObj => skObj.info && active.guts >= skObj.info.cost && !isSkillUseLimitReached(active, skObj.key));
    const noViableAttack = affordableSkills.length > 0 && !kinNejikiHasViableAttack(active, opponent, affordableSkills);

    // 自身の攻撃力が大きく下がっている場合も交代（＝デバフ解除。交代で状態異常以外のバフ・デバフは解除される）の検討対象にする
    const isSelfWeakened = kinNejikiSelfOffenseModifier(active) <= 0.8;

    // ライフが3割より多く残っており、有効打もあり、弱体化もしていなければ交代は検討しない
    if (lifeRatio > 0.3 && !noViableAttack && !isSelfWeakened) return false;

    // 温存判断が外れることもある（毎回必ず交代すると読みやすくなりすぎるため）
    if (Math.random() > 0.8) return false;

    // 控え候補をオーラ／モン類相性＋残りライフでスコアリングし、現状維持のスコアと比較する
    // （控えにオーラ・モン類有利な一体がいれば、そちらが優先的に選ばれるようになる）
    const scored = candidates.map(c => ({ ...c, score: kinNejikiMatchupScore(c.unit, opponent) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const stayScore = kinNejikiMatchupScore(active, opponent)
        - (noViableAttack ? 20 : 0) - (isSelfWeakened ? 15 : 0);

    // 控えのスコアが現状維持を明確に上回らない限り、無理に交代はしない
    if (best.score <= stayScore + 5) return false;

    const chosen = best;

    clearBattleStatModifiersOnSwitch(active);
    MASMON_BATTLE_STATE.enemyActiveIdx = chosen.i;
    // オーラ／モン類有利ボーナスをライフにも反映する（今まさに対面する相手との相性で判定）
    applyAuraMonClassLifeBonus(chosen.unit, opponent);
    const ownerLabel = MASMON_BATTLE_STATE.opponentOwnerName || '相手';
    addLog(`💦 ${active.name} は苦しい状況と判断し、${ownerLabel}は【${chosen.unit.name}】に交代した！`);
    showEffect('🔄 相手交代！ 🔄');

    const newUnit = chosen.unit;
    document.getElementById('enemy-name').textContent = newUnit.shortName || newUnit.name;
    renderMonsterVisual(document.getElementById('battle-enemy-icon'), newUnit.visualName || newUnit.monsterBaseName, newUnit.emoji, newUnit.isAwakened, false, newUnit.aura);
    document.getElementById('battle-enemy-type').textContent = newUnit.shortName || newUnit.name;
    renderAuraBadge('enemy-aura-badge', newUnit.aura, newUnit.monsterBaseName);

    // ステルスロックが設置されている場合、場に出た瞬間にダメージを受ける
    // （このタイミングでの戦闘不能はターン開始処理側の生死チェックに委ねる）
    if (typeof applyStealthRockDamageOnSwitchIn === 'function') {
        applyStealthRockDamageOnSwitchIn('enemy', newUnit);
    }
    return true;
}

// =====================================================
// 画面遷移・進行制御
// =====================================================

// --- タイトルから「ガッツファクトリー」の説明画面へ ---
function startKinNejikiEntry() {
    updateKinNejikiResumeButtonVisibility();
    changeScreen('screen-kinnejiki-title');
}

// --- ランを開始し、最初の6体提示を生成 ---
function beginKinNejikiRun() {
    clearKinNejikiSuspendSave(); // 新規に挑戦を始める場合、古い一時セーブは破棄する
    clearKinNejikiBattleFlag(); // 前回の挑戦から残っているかもしれないバトル中フラグもクリアする
    KIN_NEJIKI_STATE.active = true;
    KIN_NEJIKI_STATE.set = 1;
    KIN_NEJIKI_STATE.battleInSet = 1;
    KIN_NEJIKI_STATE.totalWins = 0;
    KIN_NEJIKI_STATE.playerParty = [];
    KIN_NEJIKI_STATE.selectedIdx = [];
    KIN_NEJIKI_STATE.pendingSwap = null;
    KIN_NEJIKI_STATE.nextBattlePrepared = null;
    KIN_NEJIKI_STATE.taskKillCount = 0;
    KIN_NEJIKI_STATE.offer = generateKinNejikiOffer(1);
    renderKinNejikiSelectScreen();
    changeScreen('screen-kinnejiki-select');
}

// --- パーティ選出画面（6体提示→タップで最大3体選択）の描画 ---
function renderKinNejikiSelectScreen() {
    const container = document.getElementById('kinnejiki-offer-container');
    if (!container) return;
    container.innerHTML = '';

    KIN_NEJIKI_STATE.offer.forEach((m, idx) => {
        if (!m) return;
        const isSelected = KIN_NEJIKI_STATE.selectedIdx.includes(idx);
        const card = document.createElement('div');
        card.className = `bg-[#2a1b15] border rounded-xl p-2.5 cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'border-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.4)]' : 'border-amber-900/50'}`;
        card.onclick = () => toggleKinNejikiSelect(idx);

        const skillNames = buildSkillListWithAuraText(m.skills);
        const equipText = m.equip ? getEquipmentDisplayName(m.equip) : '未装備';
        const aura = AURA_TYPES[m.aura];
        const monClassKey = getMonClassKeyForName(m.monsterBaseName);
        const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
        const auraBadge = aura ? `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${monClassInfo ? monClassInfo.emoji : ''}</span>` : '';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0 bg-[#1a120b] rounded-full border border-amber-900/40 overflow-hidden';
        renderMonsterVisual(iconWrap, m.visualName || m.monsterBaseName, m.emoji, false, true, m.aura);

        card.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-amber-200">${m.name} ${auraBadge} ${isSelected ? '✅' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                    <div class="text-[9px] text-purple-300 mt-0.5">装備: ${equipText}</div>
                </div>
            </div>
        `;
        card.querySelector('.flex.items-center').prepend(iconWrap);
        container.appendChild(card);
    });

    const confirmBtn = document.getElementById('kinnejiki-confirm-party-btn');
    if (confirmBtn) {
        const count = KIN_NEJIKI_STATE.selectedIdx.length;
        confirmBtn.disabled = count !== 3;
        confirmBtn.textContent = count === 3 ? 'このパーティで挑戦開始！' : `パーティを選択中 (${count}/3)`;
        confirmBtn.classList.toggle('opacity-50', count !== 3);
    }
}

function toggleKinNejikiSelect(idx) {
    const pos = KIN_NEJIKI_STATE.selectedIdx.indexOf(idx);
    if (pos >= 0) {
        KIN_NEJIKI_STATE.selectedIdx.splice(pos, 1);
    } else {
        if (KIN_NEJIKI_STATE.selectedIdx.length >= 3) {
            showToast('パーティは3体までです。');
            return;
        }
        KIN_NEJIKI_STATE.selectedIdx.push(idx);
    }
    renderKinNejikiSelectScreen();
}

function confirmKinNejikiParty() {
    if (KIN_NEJIKI_STATE.selectedIdx.length !== 3) return;
    KIN_NEJIKI_STATE.playerParty = KIN_NEJIKI_STATE.selectedIdx.map(idx => JSON.parse(JSON.stringify(KIN_NEJIKI_STATE.offer[idx])));
    advanceToNextKinNejikiBattle();
}

// --- 次バトルの set / battleInSet / ボス戦判定を、カウンタを実際に進めずに先読みする ---
function peekNextKinNejikiBattleMeta() {
    let nextSet = KIN_NEJIKI_STATE.set;
    let nextBattleInSet = KIN_NEJIKI_STATE.battleInSet;
    if (nextBattleInSet >= 7) {
        nextBattleInSet = 1;
        nextSet++;
    } else {
        nextBattleInSet++;
    }
    const isNejiki = nextBattleInSet === 7 && (nextSet === 3 || nextSet === 7);
    return { set: nextSet, battleInSet: nextBattleInSet, isNejiki };
}

// --- 「同じモンスター・同じ装備同士が対面しない」ための除外リストを組み立てる ---
// own: 現在の手持ちパーティ（交換前）／opponent: 直前に戦った（今まさに倒した）相手チーム
function buildKinNejikiExclusions(ownParty, opponentParty) {
    const ownSpecies = (ownParty || []).map(m => m && m.speciesId).filter(Boolean);
    const oppSpecies = (opponentParty || []).map(m => m && m.speciesId).filter(Boolean);
    const ownEquip = (ownParty || []).map(m => m && m.equip && m.equip.equipId).filter(Boolean);
    const oppEquip = (opponentParty || []).map(m => m && m.equip && m.equip.equipId).filter(Boolean);
    return {
        species: [...new Set([...ownSpecies, ...oppSpecies])],
        equip: [...new Set([...ownEquip, ...oppEquip])]
    };
}

// --- 指定した set/battleInSet/isNejiki に対応するバトル情報一式（相手チーム・表示ラベル等）を組み立てる ---
function buildKinNejikiBattlePackage(set, battleInSet, isNejiki, excludeSpecies, excludeEquip) {
    const aiLevel = kinNejikiAiLevelForSet(set);
    const totalBattleNumber = (set - 1) * 7 + battleInSet;
    const opponentTeam = generateKinNejikiOpponentTeam(set, isNejiki, excludeSpecies, excludeEquip, totalBattleNumber);
    const floorLabel = isNejiki
        ? `⚔️ 第${set}セット・ボス戦（通算${totalBattleNumber}戦目）`
        : `⚔️ 第${set}セット ${battleInSet}戦目（通算${totalBattleNumber}戦目）`;
    return { opponentTeam, floorLabel, isNejiki, aiLevel };
}

// --- 次のバトル（現在の set / battleInSet に対応する相手）を組み立てて開始 ---
// 通常は kinNejikiHandleBattleEnd で事前生成された nextBattlePrepared をそのまま使う。
// （初戦や、一時セーブからの再開など事前生成が無い場合のみ、その場で生成する）
function advanceToNextKinNejikiBattle() {
    if (KIN_NEJIKI_STATE.nextBattlePrepared) {
        const prepared = KIN_NEJIKI_STATE.nextBattlePrepared;
        KIN_NEJIKI_STATE.nextBattlePrepared = null;
        startKinNejikiBattleEngine(prepared.opponentTeam, prepared.floorLabel, prepared.isNejiki, prepared.aiLevel);
        return;
    }

    // 事前生成が無い場合の保険：現在の手持ちパーティの種族・装備だけを除外して生成する
    // （直前の対戦相手の情報は無いため、その分の除外はできない）
    const set = KIN_NEJIKI_STATE.set;
    const battleInSet = KIN_NEJIKI_STATE.battleInSet;
    const isNejiki = battleInSet === 7 && (set === 3 || set === 7);
    const exclusions = buildKinNejikiExclusions(KIN_NEJIKI_STATE.playerParty, null);
    const battlePackage = buildKinNejikiBattlePackage(set, battleInSet, isNejiki, exclusions.species, exclusions.equip);

    startKinNejikiBattleEngine(battlePackage.opponentTeam, battlePackage.floorLabel, battlePackage.isNejiki, battlePackage.aiLevel);
}

// --- 既存の masmon_battle.js エンジン（3vs3対応）へ状態をセットしてバトル画面へ ---
// バトル開始前に「対戦相手ブリーダーと対峙する」演出画面を挟み、ボタンタップで実際のバトルへ進む。
let KIN_NEJIKI_PENDING_BATTLE = null; // { opponentTeamRaw, floorText, isNejiki, aiLevel }

function startKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel) {
    KIN_NEJIKI_PENDING_BATTLE = { opponentTeamRaw, floorText, isNejiki, aiLevel };
    const breederName = (opponentTeamRaw[0] || {}).ownerName || 'レンタル使い';
    showKinNejikiEncounterScreen(breederName, isNejiki);
}

// --- 対戦相手ブリーダーの顔グラフィック名鑑 ---
// KIN_NEJIKI_BREEDER_NAMES（二つ名付きのフルネーム）→ images/フォルダの実ファイル名（二つ名を除いた名前）。
// ※ 「ミスターG」のみ二つ名部分が無いため、フルネームがそのままファイル名になる。
const KIN_NEJIKI_BREEDER_VISUAL_NAME = {
    '白銀の騎士アルベルト': 'アルベルト',
    '飛燕のセシリア': 'セシリア',
    '鉄腕ガルシア': 'ガルシア',
    '不敗のマキシム': 'マキシム',
    'エリートブリーダークロウ': 'クロウ',
    'ただのララ': 'ララ',
    '怪老ゲンジ': 'ゲンジ',
    '幻惑のシルバ': 'シルバ',
    '熱血ブリーダーダイゴ': 'ダイゴ',
    'お嬢様カトリーヌ': 'カトリーヌ',
    'ミスターG': 'ミスターG',
    '迷子のトト': 'トト',
    '神速のレオン': 'レオン',
    '冥府の門番ハデス': 'ハデス',
    '大地の母エレーナ': 'エレーナ',
    'レジェンドブリーダー・コルト': 'コルト',
    'レジェンドブリーダー・コルト（最終決戦）': 'コルト'
};

// --- ブリーダー顔グラフィックのコンテナ見た目（デフォルト：丸型の顔グラフィック） ---
const KIN_NEJIKI_BREEDER_VISUAL_DEFAULT_CLASS = 'w-32 h-32 rounded-full overflow-hidden border-4 border-amber-600/70 bg-[#1a120b] flex items-center justify-center text-6xl shadow-lg mb-5';
// --- コルト専用：サイズが大きい全身一枚絵のため、丸型トリミングにはせず、縦長の枠にそのまま表示する ---
const KIN_NEJIKI_BREEDER_VISUAL_COLT_CLASS = 'w-56 h-72 rounded-2xl overflow-hidden border-4 border-amber-600/70 bg-[#1a120b] flex items-center justify-center text-6xl shadow-lg mb-5';

// --- ブリーダーの顔グラフィックを描画する ---
// 対応する画像が無い相手や、画像の読み込みに失敗した場合はフォールバックの絵文字をそのまま表示する
// （renderMonsterVisualと同様の考え方）。
// コルトのみ画像が大きい全身一枚絵のため、丸型トリミング（object-cover）ではなく、
// 専用の縦長の枠に全体をそのまま収める（object-contain）表示にする。
function renderKinNejikiBreederVisual(containerEl, breederName, fallbackEmoji) {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const visualName = KIN_NEJIKI_BREEDER_VISUAL_NAME[breederName];
    if (!visualName) {
        containerEl.className = KIN_NEJIKI_BREEDER_VISUAL_DEFAULT_CLASS;
        containerEl.textContent = fallbackEmoji || '🥊';
        return;
    }

    const isColt = visualName === 'コルト';
    containerEl.className = isColt ? KIN_NEJIKI_BREEDER_VISUAL_COLT_CLASS : KIN_NEJIKI_BREEDER_VISUAL_DEFAULT_CLASS;

    const imagePath = `images/${visualName}.png`;
    containerEl.dataset.visualSrc = imagePath;
    containerEl.textContent = ''; // 画像読み込み完了までは空表示（フォールバック絵文字とのちらつきを防ぐ）

    const img = new Image();
    img.src = imagePath;
    img.onload = () => {
        if (containerEl.dataset.visualSrc !== imagePath) return;
        containerEl.innerHTML = '';
        const imgEl = document.createElement('img');
        imgEl.src = imagePath;
        imgEl.alt = breederName;
        // コルトのみ：トリミングせず全身をそのまま収める。他のブリーダーは従来通り顔部分を丸くトリミング表示。
        imgEl.className = isColt ? 'w-full h-full object-contain drop-shadow-lg' : 'w-full h-full object-cover';
        containerEl.appendChild(imgEl);
    };
    img.onerror = () => {
        console.warn(`[renderKinNejikiBreederVisual] 画像が見つかりません: ${imagePath}`);
        if (containerEl.dataset.visualSrc !== imagePath) return;
        containerEl.className = KIN_NEJIKI_BREEDER_VISUAL_DEFAULT_CLASS;
        containerEl.textContent = fallbackEmoji || '🥊';
    };
}

// --- 「○○が勝負を仕掛けてきた！」演出画面を表示する ---
function showKinNejikiEncounterScreen(breederName, isNejiki) {
    const msgEl = document.getElementById('kinnejiki-encounter-message');
    if (msgEl) msgEl.textContent = `${breederName}が勝負を仕掛けてきた！`;
    const iconEl = document.getElementById('kinnejiki-encounter-icon');
    renderKinNejikiBreederVisual(iconEl, breederName, isNejiki ? '👑' : '🥊');
    changeScreen('screen-kinnejiki-encounter');
}

// --- 演出画面の「バトル開始！」ボタンから呼ばれ、保留していたバトルを実際に開始する ---
function confirmKinNejikiEncounter() {
    if (!KIN_NEJIKI_PENDING_BATTLE) return;
    const { opponentTeamRaw, floorText, isNejiki, aiLevel } = KIN_NEJIKI_PENDING_BATTLE;
    KIN_NEJIKI_PENDING_BATTLE = null;
    launchKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel);
}

function launchKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel) {
    // ここから勝敗が決まるまでの間にアプリが強制終了された場合、タスクキルとして検知する
    markKinNejikiBattleStarted();
    MASMON_BATTLE_STATE.mode = 'cpu_team';
    MASMON_BATTLE_STATE.isDebugBattle = false;
    MASMON_BATTLE_STATE.playerTeam = KIN_NEJIKI_STATE.playerParty.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.enemyTeam = opponentTeamRaw.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.playerMeta = [...KIN_NEJIKI_STATE.playerParty];
    MASMON_BATTLE_STATE.enemyMeta = [...opponentTeamRaw];
    MASMON_BATTLE_STATE.playerActiveIdx = 0;
    MASMON_BATTLE_STATE.enemyActiveIdx = 0;
    // ガッツファクトリーはレンタル制のため対戦アイテムの持ち込みは無し
    MASMON_BATTLE_STATE.playerItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.playerItemsInitial = { ...MASMON_BATTLE_STATE.playerItems };
    MASMON_BATTLE_STATE.enemyItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.opponentOwnerName = (opponentTeamRaw[0] || {}).ownerName || 'レンタル使い';
    // 陣営（フィールド）単位で持続する効果は、新しいバトルの開始時に必ずリセットする
    MASMON_BATTLE_STATE.playerSubstituteHits = 0;
    MASMON_BATTLE_STATE.enemySubstituteHits = 0;
    MASMON_BATTLE_STATE.playerFieldStealthRock = false;
    MASMON_BATTLE_STATE.enemyFieldStealthRock = false;
    MASMON_BATTLE_STATE.kinNejiki = {
        inRun: true,
        set: KIN_NEJIKI_STATE.set,
        battleIndex: KIN_NEJIKI_STATE.battleInSet,
        isNejiki: !!isNejiki,
        aiLevel: aiLevel,
        aiPersonality: pickKinNejikiAiPersonality()
    };

    startMasmonBattleCommon(floorText);
}

// --- バトル終了後の分岐（masmon_battle.js の handleMasmonBattleWin/Lose から呼ばれる） ---
function kinNejikiHandleBattleEnd(isWin) {
    // 勝敗が決まったので、タスクキル検知用のバトル中フラグを解除する
    clearKinNejikiBattleFlag();
    if (!isWin) {
        kinNejikiFinishRun(false);
        return;
    }

    KIN_NEJIKI_STATE.totalWins++;
    const defeatedTeam = [...MASMON_BATTLE_STATE.enemyMeta];
    KIN_NEJIKI_STATE.pendingSwap = {
        defeatedTeam,
        wasNejiki: !!(MASMON_BATTLE_STATE.kinNejiki && MASMON_BATTLE_STATE.kinNejiki.isNejiki)
    };

    if (KIN_NEJIKI_STATE.totalWins >= 49) {
        kinNejikiFinishRun(true);
        return;
    }

    // 「こちらが交換する前に相手のモンスターが決まる」仕様のため、次バトルの対戦相手は
    // 交換画面（手持ち変更）が開く前＝このタイミングで確定させる。
    // 除外対象：現在の手持ち（交換前のパーティ）＋今まさに倒した相手チーム、それぞれの種族と装備。
    const next = peekNextKinNejikiBattleMeta();
    const exclusions = buildKinNejikiExclusions(KIN_NEJIKI_STATE.playerParty, defeatedTeam);
    KIN_NEJIKI_STATE.nextBattlePrepared = buildKinNejikiBattlePackage(
        next.set, next.battleInSet, next.isNejiki, exclusions.species, exclusions.equip
    );

    renderKinNejikiSwapScreen();
    changeScreen('screen-kinnejiki-swap');
}

// =====================================================
// 勝利後の交換画面（1勝ごとに相手モンスター1体と手持ち1体を交換できる）
// =====================================================
let kinNejikiSwapMineIdx = null;
let kinNejikiSwapTheirsIdx = null;

function renderKinNejikiSwapScreen() {
    kinNejikiSwapMineIdx = null;
    kinNejikiSwapTheirsIdx = null;
    const selectStep = document.getElementById('kinnejiki-swap-step-select');
    const orderStep = document.getElementById('kinnejiki-swap-step-order');
    const nextStep = document.getElementById('kinnejiki-swap-step-next');
    if (selectStep) { selectStep.classList.remove('hidden'); selectStep.style.display = 'flex'; }
    if (orderStep) { orderStep.classList.add('hidden'); orderStep.style.display = 'none'; }
    if (nextStep) { nextStep.classList.add('hidden'); nextStep.style.display = 'none'; }
    renderKinNejikiSwapLists();
}

function renderKinNejikiSwapLists() {
    const mineContainer = document.getElementById('kinnejiki-swap-mine-container');
    const theirsContainer = document.getElementById('kinnejiki-swap-theirs-container');
    if (!mineContainer || !theirsContainer) return;

    const renderList = (container, list, selectedIdx, onClick, keyPrefix) => {
        container.innerHTML = '';
        list.forEach((m, idx) => {
            if (!m) return;
            const isSelected = idx === selectedIdx;
            const card = document.createElement('div');
            card.className = `bg-[#2a1b15] border rounded-xl p-2 cursor-pointer active:scale-[0.98] transition-all flex items-center space-x-2 ${isSelected ? 'border-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]' : 'border-amber-900/50'}`;
            card.onclick = () => onClick(idx);
            const skillNames = (m.skills || []).map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
            const visualId = `kinnejiki-swap-visual-${keyPrefix}-${idx}`;

            const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
            const monClassKeySwap = getMonClassKeyForName(m.monsterBaseName);
            const monClassInfoSwap = monClassKeySwap ? MON_CLASS_TYPES[monClassKeySwap] : null;
            const auraText = (auraInfo ? auraInfo.emoji : '') + (monClassInfoSwap ? monClassInfoSwap.emoji : '');

            const equipText = m.equip
                ? `${(EQUIPMENT_DB[m.equip.equipId] || {}).icon || '⚙️'} ${getEquipmentDisplayName(m.equip)}（${getEquipmentDisplayDesc(m.equip)}）`
                : '装備なし';

            card.innerHTML = `
                <div id="${visualId}" class="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl"></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="text-xs font-bold text-amber-200">${m.name}</div>
                        <div class="text-[8px] text-purple-300 font-bold flex-shrink-0 ml-1">${auraText}</div>
                    </div>
                    <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                    <div class="text-[9px] text-sky-300 mt-0.5 leading-relaxed">🎽 ${equipText}</div>
                </div>
            `;
            container.appendChild(card);
            const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
            renderMonsterVisual(visualEl, m.visualName || m.monsterBaseName || m.name, m.emoji, !!m.isAwakened, keyPrefix === 'mine', m.aura);
        });
    };

    renderList(mineContainer, KIN_NEJIKI_STATE.playerParty, kinNejikiSwapMineIdx, (idx) => { kinNejikiSwapMineIdx = idx; renderKinNejikiSwapLists(); }, 'mine');
    renderList(theirsContainer, KIN_NEJIKI_STATE.pendingSwap.defeatedTeam, kinNejikiSwapTheirsIdx, (idx) => { kinNejikiSwapTheirsIdx = idx; renderKinNejikiSwapLists(); }, 'theirs');

    const btn = document.getElementById('kinnejiki-confirm-swap-btn');
    if (btn) btn.disabled = (kinNejikiSwapMineIdx === null || kinNejikiSwapTheirsIdx === null);
}

function confirmKinNejikiSwap() {
    if (kinNejikiSwapMineIdx === null || kinNejikiSwapTheirsIdx === null) return;
    const theirs = KIN_NEJIKI_STATE.pendingSwap.defeatedTeam[kinNejikiSwapTheirsIdx];
    const cloned = JSON.parse(JSON.stringify(theirs));
    cloned.stats.life = cloned.stats.maxLife; // 交換直後は全回復した状態で仲間になる
    cloned.ownerName = 'あなた';
    KIN_NEJIKI_STATE.playerParty[kinNejikiSwapMineIdx] = cloned;
    showToast(`【${cloned.name}】を仲間に迎え入れた！`);
    showKinNejikiOrderStep();
}

function skipKinNejikiSwap() {
    showKinNejikiOrderStep();
}

// =====================================================
// 交換の可否を決めた後：次の相手のヒントを見ながら、出す順番（先頭に出すモンスター）を選ぶ
// =====================================================

// --- 交換ステップ→出す順番ステップへ切り替える ---
function showKinNejikiOrderStep() {
    const selectStep = document.getElementById('kinnejiki-swap-step-select');
    const orderStep = document.getElementById('kinnejiki-swap-step-order');
    if (selectStep) { selectStep.classList.add('hidden'); selectStep.style.display = 'none'; }
    if (orderStep) { orderStep.classList.remove('hidden'); orderStep.style.display = 'flex'; }
    renderKinNejikiOrderStep();
}

// --- 次の相手の1体目のヒント表示＋自パーティの出す順番（先頭）選択UIを描画する ---
// 次のバトルの対戦相手（nextBattlePrepared.opponentTeam）は、この交換画面が開く前に
// 既に確定しているため、その1体目をそのままヒントとして見せることができる。
function renderKinNejikiOrderStep() {
    const hintContainer = document.getElementById('kinnejiki-next-opponent-hint');
    const orderContainer = document.getElementById('kinnejiki-order-container');
    if (!hintContainer || !orderContainer) return;

    // --- 次の相手の1体目のヒント（技・装備までは見せず、姿・ステータス・オーラ／モン類のみ） ---
    hintContainer.innerHTML = '';
    const nextLead = (KIN_NEJIKI_STATE.nextBattlePrepared && KIN_NEJIKI_STATE.nextBattlePrepared.opponentTeam)
        ? KIN_NEJIKI_STATE.nextBattlePrepared.opponentTeam[0]
        : null;
    if (nextLead) {
        const auraInfo = nextLead.aura ? AURA_TYPES[nextLead.aura] : null;
        const monClassKey = getMonClassKeyForName(nextLead.monsterBaseName);
        const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
        const auraBadge = auraInfo ? `<span class="px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${auraInfo.colorClass}">${auraInfo.emoji}${auraInfo.name}</span>` : '';
        const monClassBadge = monClassInfo ? `<span class="px-1 py-0.5 rounded text-[8px] font-bold bg-slate-700 text-slate-200">${monClassInfo.emoji}${monClassInfo.name}</span>` : '';

        const card = document.createElement('div');
        card.className = 'bg-[#2a1b15] border border-red-900/50 rounded-xl p-2 flex items-center space-x-2';
        const visualId = 'kinnejiki-next-opponent-hint-visual';
        card.innerHTML = `
            <div id="${visualId}" class="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl"></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                    <div class="text-xs font-bold text-red-200">${nextLead.name}</div>
                    <div class="flex gap-1 flex-shrink-0 ml-1">${auraBadge}${monClassBadge}</div>
                </div>
                <div class="text-[9px] text-gray-400 mt-0.5">HP${nextLead.stats.maxLife} / ちから${nextLead.stats.pow} / かしこさ${nextLead.stats.int} / 命中${nextLead.stats.hit} / 回避${nextLead.stats.spd} / 丈夫さ${nextLead.stats.def}</div>
            </div>
        `;
        hintContainer.appendChild(card);
        const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
        renderMonsterVisual(visualEl, nextLead.visualName || nextLead.monsterBaseName || nextLead.name, nextLead.emoji, false, false, nextLead.aura);
    } else {
        hintContainer.innerHTML = `<p class="text-[10px] text-gray-500 p-2">（次の相手の情報を取得できませんでした）</p>`;
    }

    // --- 自パーティの出す順番選択（タップで先頭＝インデックス0と入れ替える） ---
    orderContainer.innerHTML = '';
    KIN_NEJIKI_STATE.playerParty.forEach((m, idx) => {
        if (!m) return;
        const isLeader = idx === 0;
        const card = document.createElement('div');
        card.className = `bg-[#2a1b15] border rounded-xl p-2 cursor-pointer active:scale-[0.98] transition-all flex items-center space-x-2 ${isLeader ? 'border-sky-400 shadow-[0_0_6px_2px_rgba(56,189,248,0.4)]' : 'border-amber-900/50'}`;
        card.onclick = () => swapKinNejikiPartyToLead(idx);
        const visualId = `kinnejiki-order-visual-${idx}`;
        const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
        const monClassKey = getMonClassKeyForName(m.monsterBaseName);
        const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
        const auraText = (auraInfo ? auraInfo.emoji : '') + (monClassInfo ? monClassInfo.emoji : '');

        card.innerHTML = `
            <div id="${visualId}" class="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl"></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                    <div class="text-xs font-bold text-amber-200">${isLeader ? '👑 ' : ''}${m.name}</div>
                    <div class="text-[8px] text-purple-300 font-bold flex-shrink-0 ml-1">${auraText}</div>
                </div>
                <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                <div class="text-[9px] ${isLeader ? 'text-sky-300' : 'text-gray-600'} mt-0.5">${isLeader ? '→ このモンスターが先頭に出ます' : 'タップして先頭に出す'}</div>
            </div>
        `;
        orderContainer.appendChild(card);
        const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
        renderMonsterVisual(visualEl, m.visualName || m.monsterBaseName || m.name, m.emoji, !!m.isAwakened, true, m.aura);
    });
}

// --- タップされたモンスターを先頭（インデックス0＝次のバトルで最初に繰り出す位置）に入れ替える ---
function swapKinNejikiPartyToLead(idx) {
    if (idx === 0) return;
    const party = KIN_NEJIKI_STATE.playerParty;
    const tmp = party[0];
    party[0] = party[idx];
    party[idx] = tmp;
    renderKinNejikiOrderStep();
}

// --- 出す順番を決めたら、次のバトルへ進むか／セーブして終了するかの選択ステップへ ---
function proceedFromKinNejikiOrderStep() {
    const orderStep = document.getElementById('kinnejiki-swap-step-order');
    if (orderStep) { orderStep.classList.add('hidden'); orderStep.style.display = 'none'; }
    showKinNejikiSwapNextStep();
}

// --- 交換する/しないを決めた後、「次のバトルへ進む」か「セーブして終了する」かを選ぶ画面に切り替える ---
function showKinNejikiSwapNextStep() {
    const selectStep = document.getElementById('kinnejiki-swap-step-select');
    const nextStep = document.getElementById('kinnejiki-swap-step-next');
    if (selectStep) { selectStep.classList.add('hidden'); selectStep.style.display = 'none'; }
    if (nextStep) { nextStep.classList.remove('hidden'); nextStep.style.display = 'flex'; }
}

// --- 手持ちの全回復と、セット・バトル数カウンタの進行をまとめて行う ---
// 「次のバトルへ進む」時だけでなく、「セーブして終了する」時にもこの勝利分を必ず反映させる
// （反映せずにセーブすると、再開時に直前に勝ったバトルをもう一度戦うことになってしまうため）
function advanceKinNejikiCounters() {
    KIN_NEJIKI_STATE.playerParty.forEach(m => { m.stats.life = m.stats.maxLife; });
    KIN_NEJIKI_STATE.pendingSwap = null;

    if (KIN_NEJIKI_STATE.battleInSet >= 7) {
        KIN_NEJIKI_STATE.battleInSet = 1;
        KIN_NEJIKI_STATE.set++;
    } else {
        KIN_NEJIKI_STATE.battleInSet++;
    }
}

function proceedAfterKinNejikiSwap() {
    advanceKinNejikiCounters();
    advanceToNextKinNejikiBattle();
}

// =====================================================
// ラン終了・ランキング
// =====================================================
async function kinNejikiFinishRun(cleared) {
    KIN_NEJIKI_STATE.active = false;
    clearKinNejikiSuspendSave(); // 敗北時・クリア時のいずれも一時セーブは削除する（コンティニュー用途ではないため）
    const finalWins = KIN_NEJIKI_STATE.totalWins;
    // 保存が終わる前に結果画面へ進んでしまうと、プレイヤーがすぐタブを閉じた場合に
    // ランキングへの書き込みが完了しないまま消えてしまう（特に早期敗退時に起きやすい）。
    // そのため画面遷移の前に保存の完了を待つ。
    await saveKinNejikiRanking(finalWins, cleared);
    renderKinNejikiResultScreen(finalWins, cleared);
    changeScreen('screen-kinnejiki-result');
}

// ランキング保存はtransaction()を使い、サーバー側の最新値を基準に「自己ベストを更新する
// 場合のみ上書きする」処理を完全にアトミックに行う。
// 以前は ref.once('value') で現在の記録を読んでからクライアント側で比較し ref.set() する
// 実装だったが、この方式は読み取りと書き込みの間に別の書き込みが挟まったり、
// 直前の書き込みが完了する前にアプリが閉じられたりすると、既存の高い記録が
// 後から来た低い記録で上書きされてしまう不具合があった
// （例：自己ベスト23勝の後にアプリを閉じ、続けて友人が7勝で終えたところ、
// 23勝の記録が消えて7勝だけが残ってしまった、という報告があった）。
// transaction()はサーバー側の最新値を基準に再試行してくれるため、この種の競合が起きない。
async function saveKinNejikiRanking(wins, cleared) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    const name = (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー';
    try {
        const ref = firebaseDb.ref(`kinnejiki_ranking/${pid}`);
        await ref.transaction(current => {
            const best = (current && current.bestWins) || 0;
            if (current && wins <= best) {
                // 自己ベストを更新しない場合でも、名前やクリア済みフラグは最新化する
                // （winsは既存の自己ベストのまま維持し、絶対に下げない）
                return {
                    name,
                    bestWins: best,
                    bestCleared: !!(current.bestCleared || cleared),
                    updatedAt: current.updatedAt || Date.now()
                };
            }
            return {
                name,
                bestWins: wins,
                bestCleared: !!(cleared || (current && current.bestCleared)),
                updatedAt: Date.now()
            };
        });
    } catch (e) {
        console.error('[ガッツファクトリー] ランキング保存エラー:', e);
    }
}

async function fetchKinNejikiRanking(limit = 100) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return [];
    try {
        // orderByChild('bestWins').limitToLast(limit) だと、bestWinsが存在しない/型が
        // 揃っていないデータが混ざった場合に正しく並び替えられず、結果的にほぼ1件しか
        // 表示されない不具合が起きていた。
        // そのため、kinnejiki_ranking配下のデータを一旦すべて取得し、
        // クライアント側で確実にソート・件数制限をかける方式に変更する。
        const snap = await firebaseDb.ref('kinnejiki_ranking').once('value');
        const list = [];
        snap.forEach(child => {
            list.push({ id: child.key, ...child.val() });
        });
        list.sort((a, b) => (b.bestWins || 0) - (a.bestWins || 0));
        return list.slice(0, limit);
    } catch (e) {
        console.error('[ガッツファクトリー] ランキング取得エラー:', e);
        return [];
    }
}

function renderKinNejikiResultScreen(wins, cleared) {
    const badge = document.getElementById('kinnejiki-result-badge');
    const title = document.getElementById('kinnejiki-result-title');
    const detail = document.getElementById('kinnejiki-result-detail');
    if (!badge || !title || !detail) return;

    if (cleared) {
        badge.textContent = '👑';
        title.textContent = 'ガッツファクトリー制覇！';
        title.className = 'text-2xl font-black text-amber-400 pixel-font';
    } else {
        badge.textContent = '🏳️';
        title.textContent = 'CHALLENGE OVER';
        title.className = 'text-2xl font-black text-gray-300 pixel-font';
    }

    const setsCleared = Math.floor(wins / 7);
    detail.innerHTML = `
        <div class="text-xs text-purple-300 font-bold border-b border-purple-800 pb-1 mb-1">挑戦結果</div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">通算勝利数:</span><span class="text-white font-bold">${wins} / 49</span></div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">突破セット数:</span><span class="text-white font-bold">${setsCleared} / 7</span></div>
    `;
}

async function showKinNejikiRankingScreen() {
    changeScreen('screen-kinnejiki-ranking');
    const listEl = document.getElementById('kinnejiki-ranking-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">読み込み中...</div>';

    if (typeof initFirebase !== 'function' || !initFirebase()) {
        listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8 leading-relaxed">Firebase未設定のため<br>ランキングを表示できません。</div>';
        return;
    }

    const ranking = await fetchKinNejikiRanking(100);
    if (ranking.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">まだ挑戦記録がありません。</div>';
        return;
    }
    const myId = getMyPlayerId();
    const rankIcons = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    listEl.innerHTML = ranking.map((entry, i) => {
        const rankIcon = rankIcons[i] !== undefined ? rankIcons[i] : ((i + 1) + '位');
        const isMe = entry.id === myId;
        const safeName = (entry.name || 'ブリーダー').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
            <div class="bg-[#2a1b15] border ${isMe ? 'border-amber-500' : 'border-amber-900/50'} rounded-xl p-2.5 flex items-center space-x-2">
                <div class="text-sm w-9 text-center flex-shrink-0 font-bold">${rankIcon}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold ${isMe ? 'text-amber-300' : 'text-white'} truncate">${safeName}${isMe ? '（あなた）' : ''}</div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-sm font-black text-amber-400 pixel-font">${entry.bestWins || 0}勝${entry.bestCleared ? ' 👑' : ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

function returnToTitleFromKinNejiki() {
    changeScreen('screen-title');
}
