// =====================================================
// オーラ属性データベース（新要素）
// 育成開始時の「オーラの儀式」でプレイヤーのモンスターに付与し、
// 育成中バトル(game_battle.js)の敵にはランダムで付与する。
// 相性: 赤→緑→黄→青→赤 の順に有利（beatsで示す色に対して有利＝下記「オーラ／モン類／技オーラ 相性ボーナス設定」を参照）
// =====================================================
const AURA_TYPES = {
    red:    { key: 'red',    name: '赤',  emoji: '🔴', colorClass: 'bg-red-500',    textClass: 'text-red-400',    beats: 'green',  hex: '#ef4444' },
    green:  { key: 'green',  name: '緑',  emoji: '🟢', colorClass: 'bg-green-500',  textClass: 'text-green-400',  beats: 'yellow', hex: '#22c55e' },
    yellow: { key: 'yellow', name: '黄',  emoji: '🟡', colorClass: 'bg-yellow-400', textClass: 'text-yellow-300', beats: 'blue',   hex: '#facc15' },
    blue:   { key: 'blue',   name: '青',  emoji: '🔵', colorClass: 'bg-blue-500',   textClass: 'text-blue-400',   beats: 'red',    hex: '#3b82f6' },
    // 「白」はモスト専用の特別なオーラ。赤緑黄青の三竦みには参加しない（有利・不利どちらにもならない）ため beats は null。
    // getRandomAuraKey() の通常抽選や、PvP編成でのオーラ選択には出てこないよう exclusive:true で除外している。
    white:  { key: 'white',  name: '白',  emoji: '⚪', colorClass: 'bg-gray-200',   textClass: 'text-gray-200',   beats: null,     hex: '#e5e7eb', exclusive: true }
};

// --- 技名の一覧を、各技のオーラ色が一目でわかる形式（オーラ絵文字＋技名）の文字列で返す共通ヘルパー ---
// レンタルモンスターの選出画面・交代候補一覧など、技のオーラを一目で確認したい場面で使う。
// オーラ無しの技には▫️（無地の四角）を付け、「オーラが無いこと」自体も分かるようにする。
function buildSkillListWithAuraText(skillKeys) {
    if (!skillKeys || skillKeys.length === 0) return '';
    return skillKeys.map(skKey => {
        const sk = SKILLS_DB[skKey];
        const name = sk ? sk.name : skKey;
        const aura = sk ? AURA_TYPES[sk.aura] : null;
        const auraMark = aura ? aura.emoji : '▫️';
        return `${auraMark}${name}`;
    }).join('、');
}

// --- 攻撃側オーラが防御側オーラに対して有利かどうかを判定する ---
function isAuraAdvantageous(attackerAuraKey, defenderAuraKey) {
    if (!attackerAuraKey || !defenderAuraKey) return false;
    const attackerAura = AURA_TYPES[attackerAuraKey];
    return !!attackerAura && attackerAura.beats === defenderAuraKey;
}

// --- 4色からランダムに1つオーラを選ぶ（敵モンスターへの付与用） ---
// exclusive指定のオーラ（モスト専用の「白」等）は通常抽選の対象外とする。
function getRandomAuraKey() {
    const keys = Object.keys(AURA_TYPES).filter(k => !AURA_TYPES[k].exclusive);
    return keys[Math.floor(Math.random() * keys.length)];
}

// =====================================================
// モン類データベース（新要素）
// モンスターの種族ごとに固定で割り振られる分類。オーラとは異なり、
// 育成中の付与や抽選ではなく、種族固有の性質として常に決まっている。
// 相性: 獣族→怪物→無機→創造→幻霊→魔族→獣族 の順に有利（beatsで示すモン類に対して有利＝下記「オーラ／モン類／技オーラ 相性ボーナス設定」を参照）
// =====================================================
const MON_CLASS_TYPES = {
    beast:     { key: 'beast',     name: '獣族', emoji: '🐾', beats: 'monster' },
    monster:   { key: 'monster',   name: '怪物', emoji: '👹', beats: 'inorganic' },
    inorganic: { key: 'inorganic', name: '無機', emoji: '⚙️', beats: 'creation' },
    creation:  { key: 'creation',  name: '創造', emoji: '✨', beats: 'spirit' },
    spirit:    { key: 'spirit',    name: '幻霊', emoji: '🪽', beats: 'demon' },
    demon:     { key: 'demon',     name: '魔族', emoji: '😈', beats: 'beast' }
};

// --- モンスター名（種族名）の表記ゆれを取り除き、MON_CLASS_BY_SPECIES照合用の素の種族名にする ---
// 例: "中ボス：ゴビ" → "ゴビ"、"モッチー種" → "モッチー"、"モッチー (強敵)" → "モッチー"
function cleanMonsterSpeciesName(rawName) {
    if (!rawName) return '';
    return String(rawName)
        .replace('中ボス：', '')
        .replace('伝説の邪神：', '')
        .split(' ')[0]
        .replace(/\s*\(強敵\)\s*/g, '')
        .replace(/種$/, '');
}

// --- 種族名からモン類キー（beast/monster/inorganic/creation/spirit/demon）を取得 ---
// MON_CLASS_BY_SPECIES は MONSTER_TEMPLATES 定義後に構築される（このファイル下部を参照）
function getMonClassKeyForName(rawName) {
    const cleanName = cleanMonsterSpeciesName(rawName);
    return (typeof MON_CLASS_BY_SPECIES !== 'undefined' && MON_CLASS_BY_SPECIES[cleanName]) || null;
}

// --- 攻撃側の種族が防御側の種族に対してモン類的に有利かどうかを判定する ---
function isMonClassAdvantageous(attackerRawName, defenderRawName) {
    const atkClass = getMonClassKeyForName(attackerRawName);
    const defClass = getMonClassKeyForName(defenderRawName);
    if (!atkClass || !defClass) return false;
    return MON_CLASS_TYPES[atkClass].beats === defClass;
}

// =====================================================================
// 【オーラ／モン類／技オーラ 相性ボーナス設定】
// -----------------------------------------------------------------------
// このゲームには「モンスター本体が持つオーラ／モン類」と「技（スキル）が
// 持つ技オーラ（database.js内 SKILLS_DB の aura フィールド）」の
// 2種類の相性システムがある。バランス調整はすべてこのブロック内の
// 数値・関数を書き換えるだけで完結するようにまとめてある。
//
// ①②：モンスター本体のオーラ／モン類の相性 → 「自身の全ステータス」が倍率アップ
//      （与ダメージ／被ダメージの直接補正ではなく、pow/int/hit/spd/defを底上げする形。
//        getBuffedAttackStat/getBuffedDefenseStat/getBuffedHitStat/getEvasionStat
//        の内部で getAuraMonClassStatMultiplier() 経由で自動的に反映される）
// ③④⑤：技オーラ（技そのものが持つ属性）の相性 → その技の「与ダメージ」が倍率アップ／ダウン
//      （getSkillAuraDamageBonus() が返す倍率を、実際のダメージ計算箇所で掛ける）
// =====================================================================

// ①自身のオーラが相手のオーラに対して有利な場合、自身の全ステータスに掛かる倍率
const AURA_ADVANTAGE_STAT_MULTIPLIER = 1.1;
// ②自身のモン類が相手のモン類に対して有利な場合、自身の全ステータスに掛かる倍率
const MONCLASS_ADVANTAGE_STAT_MULTIPLIER = 1.5;
// ③技オーラが自身のオーラと一致する技を使った場合の与ダメージ倍率
const SKILL_AURA_SELF_MATCH_DAMAGE_MULTIPLIER = 1.5;
// ④技オーラが相手のオーラに対して有利な場合の与ダメージ倍率
const SKILL_AURA_ADVANTAGE_DAMAGE_MULTIPLIER = 2.0;
// ⑤技オーラが相手のオーラに対して不利な場合の与ダメージ倍率
const SKILL_AURA_DISADVANTAGE_DAMAGE_MULTIPLIER = 0.5;

// --- ①②：自身(self)から見て相手(opponent)に対するオーラ／モン類の有利判定を元に、
//     「自身の全ステータス」に掛ける倍率をまとめて返す（該当なしなら1、両方該当なら乗算で重複適用）。
//     getBuffedAttackStat/getBuffedDefenseStat/getBuffedHitStat/getEvasionStat が
//     第3引数(または第4引数)に opponent を受け取った時、内部でこの関数を呼んで自動的に反映する。
function getAuraMonClassStatMultiplier(self, opponent) {
    if (!self || !opponent) return 1;
    let mult = 1;
    if (isAuraAdvantageous(self.aura, opponent.aura)) {
        mult *= AURA_ADVANTAGE_STAT_MULTIPLIER;
    }
    if (isMonClassAdvantageous(self.monsterBaseName, opponent.monsterBaseName)) {
        mult *= MONCLASS_ADVANTAGE_STAT_MULTIPLIER;
    }
    return mult;
}

// --- ③④⑤：技オーラに基づく与ダメージ倍率とログ用メッセージ断片をまとめて返す。
//     attacker: 技を使うユニット / defender: 受けるユニット / sk: SKILLS_DB のエフェクティブ技オブジェクト（auraフィールドを参照）
//     戻り値: { multiplier: 倍率(該当なしなら1), messages: ['(...)' 形式のログ断片の配列] }
function getSkillAuraDamageBonus(attacker, defender, sk) {
    const result = { multiplier: 1, messages: [], selfMatch: false, advantage: false, disadvantage: false };
    const skillAura = sk && sk.aura;
    if (!skillAura) return result; // 技が無属性（aura未設定）の場合は補正なし

    // ③自身のオーラと技オーラが一致
    if (attacker.aura === skillAura) {
        result.multiplier *= SKILL_AURA_SELF_MATCH_DAMAGE_MULTIPLIER;
        result.messages.push(` (技オーラ一致${AURA_TYPES[skillAura].emoji}×${SKILL_AURA_SELF_MATCH_DAMAGE_MULTIPLIER})`);
        result.selfMatch = true;
    }

    // ④⑤技オーラ vs 相手オーラの相性（相手が無属性技なら判定しない相手側モンスターのオーラとは別物なので注意）
    if (defender.aura) {
        if (isAuraAdvantageous(skillAura, defender.aura)) {
            result.multiplier *= SKILL_AURA_ADVANTAGE_DAMAGE_MULTIPLIER;
            result.messages.push(` (技オーラ相性${AURA_TYPES[skillAura].emoji}→${AURA_TYPES[defender.aura].emoji}×${SKILL_AURA_ADVANTAGE_DAMAGE_MULTIPLIER})`);
            result.advantage = true;
        } else if (isAuraAdvantageous(defender.aura, skillAura)) {
            result.multiplier *= SKILL_AURA_DISADVANTAGE_DAMAGE_MULTIPLIER;
            result.messages.push(` (技オーラ相性${AURA_TYPES[defender.aura].emoji}→${AURA_TYPES[skillAura].emoji}被ダメージ${SKILL_AURA_DISADVANTAGE_DAMAGE_MULTIPLIER}倍)`);
            result.disadvantage = true;
        }
    }

    return result;
}

// --- モンスターデータベース ---
const MONSTER_TEMPLATES = {
    mochi: {
        id: 'mochi',
        monClass: 'spirit',
        name: 'モッチー',
        emoji: '🍪',
        desc: '丸くて愛らしいが、バランスの取れた優秀な能力と強力なガッツ回復力を持つ。',
        stats: { maxLife: 220, life: 220, pow: 71, int: 61, hit: 55, spd: 45, def: 40, gutsSpeed: 16 },
        dualStatType: true // ちから特化型／かしこさ特化型の2系統を型ごとに持つ種族（詳細はMONSTER_MOLDSのコメント参照）
    },
    suezo: {
        id: 'suezo',
        monClass: 'demon',
        name: 'スエゾー',
        emoji: '👁️',
        desc: '単眼の奇妙なモンスター。かしこさと命中が非常に高く、トリッキーな技が得意。',
        stats: { maxLife: 180, life: 180, pow: 35, int: 102, hit: 65, spd: 40, def: 30, gutsSpeed: 14 }
    },
    dino: {
        id: 'dino',
        monClass: 'beast',
        name: 'ディノ',
        emoji: '🦖',
        desc: '恐竜のような獰猛な外見。ちからと丈夫さに優れ、大ダメージを与える大技を放つ。',
        stats: { maxLife: 250, life: 250, pow: 102, int: 35, hit: 45, spd: 35, def: 50, gutsSpeed: 12 }
    },
    monolith: {
        id: 'monolith',
        monClass: 'inorganic',
        name: 'モノリス',
        emoji: '🗿',
        desc: '古代より佇む謎の岩石生命体。動きは鈍く回避は苦手だが、岩の肉体は並外れた丈夫さを誇り、ちから・かしこさ両面の技を使いこなす。',
        stats: { maxLife: 235, life: 235, pow: 74, int: 70, hit: 42, spd: 26, def: 62, gutsSpeed: 13 },
        dualStatType: true // ちから特化型／かしこさ特化型の2系統を型ごとに持つ種族（詳細はMONSTER_MOLDSのコメント参照）
    },
    plant: {
        id: 'plant',
        monClass: 'spirit',
        name: 'プラント',
        emoji: '🌸',
        desc: '花を戴く植物系のモンスター。ちからはやや低めだが、驚異的な生命力を持ち、多彩なかしこさ技で相手を翻弄する。',
        stats: { maxLife: 260, life: 260, pow: 42, int: 94, hit: 46, spd: 32, def: 46, gutsSpeed: 14 }
    },
    kyubi: {
        id: 'kyubi',
        monClass: 'beast',
        name: 'キュービ',
        emoji: '🦊',
        desc: '妖しい九尾を操る霊獣。ライフと丈夫さは低めだが、卓越したかしこさと俊敏さを併せ持ち、幻惑と防御術で戦況を操る。',
        stats: { maxLife: 190, life: 190, pow: 38, int: 104, hit: 50, spd: 55, def: 28, gutsSpeed: 15 }
    },
    // =====================================================
    // 「ガッツファクトリー」レンタルバトル用に新規プレイアブル化した種族
    // （旧・育成モードの敵専用モンスターから技構成を実装）
    // =====================================================
    ham: {
        id: 'ham',
        monClass: 'beast',
        name: 'ハム',
        emoji: '🐇',
        desc: '素早い身のこなしのウサギ型モンスター。命中と回避に優れ、格闘技主体の接近戦を得意とするが、ライフと丈夫さはやや低め。',
        stats: { maxLife: 175, life: 175, pow: 90, int: 40, hit: 58, spd: 58, def: 26, gutsSpeed: 15 }
    },
    arrowhead: {
        id: 'arrowhead',
        monClass: 'monster',
        name: 'アローヘッド',
        emoji: '🦀',
        desc: '硬い甲殻を持つ蟹型モンスター。丈夫さと回避に優れ、ガッツ回復もそこそこ速いが、命中はやや低め。',
        stats: { maxLife: 215, life: 215, pow: 92, int: 40, hit: 32, spd: 40, def: 56, gutsSpeed: 14 }
    },
    nendoro: {
        id: 'nendoro',
        monClass: 'demon',
        name: 'ネンドロ',
        emoji: '👤',
        desc: 'プロレスラーのような屈強な粘土質モンスター。ライフ・ちから・回避のすべてが高水準で、格闘技の連打で押し切る。かしこさは低い。',
        stats: { maxLife: 250, life: 250, pow: 100, int: 18, hit: 44, spd: 52, def: 42, gutsSpeed: 13 }
    },
    henger: {
        id: 'henger',
        monClass: 'inorganic',
        name: 'ヘンガー',
        emoji: '🤖',
        desc: '機械仕掛けの人造モンスター。ちから・かしこさ・命中のバランスに優れ、レーザーや光線技を得意とするが丈夫さはやや低め。',
        stats: { maxLife: 195, life: 195, pow: 80, int: 76, hit: 48, spd: 38, def: 30, gutsSpeed: 14 }
    },
    durahan: {
        id: 'durahan',
        monClass: 'demon',
        name: 'デュラハン',
        emoji: '🛡️',
        desc: '甲冑を纏う騎士型モンスター。ちからと丈夫さが非常に高く重厚な一撃を得意とするが、ガッツ回復と回避に難がある。',
        stats: { maxLife: 235, life: 235, pow: 104, int: 46, hit: 40, spd: 18, def: 60, gutsSpeed: 11 }
    },
    golem: {
        id: 'golem',
        monClass: 'inorganic',
        name: 'ゴーレム',
        emoji: '🗿',
        desc: '岩石の巨体を持つゴーレム型モンスター。ちからと丈夫さは最高クラスだが、命中と回避が低く動きは非常に鈍い。',
        stats: { maxLife: 230, life: 230, pow: 108, int: 16, hit: 32, spd: 14, def: 58, gutsSpeed: 11 }
    },
    kawazumo: {
        id: 'kawazumo',
        monClass: 'monster',
        name: 'カワズモー',
        emoji: '🐸',
        desc: '力士のような体躯を持つ蛙型モンスター。がっちりとした重い体と怪力を武器に、張り手や投げ技を得意とするが、見た目に反して舌や鳴き声を使ったかしこさ技も巧みに操る。動きはやや鈍重。',
        stats: { maxLife: 240, life: 240, pow: 94, int: 58, hit: 48, spd: 34, def: 56, gutsSpeed: 13 }
    },
    hinotori: {
        id: 'hinotori',
        monClass: 'creation',
        name: 'ヒノトリ',
        emoji: '🐦‍🔥',
        desc: '身を炎に包んだ伝説の不死鳥。ちから・かしこさの両面で高い水準を誇り、多彩な炎の技を操って相手を焼き尽くすが、丈夫さはやや低い。',
        stats: { maxLife: 200, life: 200, pow: 78, int: 88, hit: 52, spd: 50, def: 34, gutsSpeed: 14 }
    },
    gari: {
        id: 'gari',
        monClass: 'creation',
        name: 'ガリ',
        emoji: '👊',
        desc: '厳しい修行の末に神聖な力を会得した孤高の武闘家モンスター。ちから・かしこさともに高水準で、拳打と神聖魔法を織り交ぜた多彩な技を操るが、丈夫さはやや薄い。',
        stats: { maxLife: 210, life: 210, pow: 92, int: 84, hit: 58, spd: 44, def: 30, gutsSpeed: 15 }
    },
    metalner: {
        id: 'metalner',
        monClass: 'creation',
        name: 'メタルナー',
        emoji: '🤖',
        desc: '全身を鋼のような金属質の肉体で覆った拳法家モンスター。ちからと丈夫さに優れ、変幻自在の掌打で相手を翻弄するが、かしこさはやや低め。',
        stats: { maxLife: 225, life: 225, pow: 90, int: 46, hit: 56, spd: 36, def: 58, gutsSpeed: 13 }
    },
    kijin: {
        id: 'kijin',
        monClass: 'monster',
        name: 'キジン',
        emoji: '👹',
        desc: '鬼神の名を冠する怒りの戦鬼。並外れたちからと丈夫さを誇り、鬼気迫る技の数々で相手を圧倒するが、かしこさはほとんど持ち合わせていない。',
        stats: { maxLife: 220, life: 220, pow: 102, int: 20, hit: 55, spd: 42, def: 52, gutsSpeed: 15 }
    },
    ghost: {
        id: 'ghost',
        monClass: 'monster',
        name: 'ゴースト',
        emoji: '👻',
        desc: '悪戯好きな幽霊モンスター。かしこさに優れ、驚かしや呪いを絡めた多彩な技で相手を翻弄するが、丈夫さは低め。',
        stats: { maxLife: 170, life: 170, pow: 65, int: 80, hit: 60, spd: 58, def: 24, gutsSpeed: 16 }
    },
    gel: {
        id: 'gel',
        monClass: 'spirit',
        name: 'ゲル',
        emoji: '🍮',
        desc: 'ぷるぷると波打つ半透明の粘性生命体。ちから・かしこさともに高水準で、突き刺しから熱線・砲撃まで多彩な技を繰り出すが、重く粘つく体のため動きは非常に鈍い。',
        stats: { maxLife: 245, life: 245, pow: 90, int: 88, hit: 46, spd: 22, def: 58, gutsSpeed: 13 }
    },
    ark: {
        id: 'ark',
        monClass: 'spirit',
        name: 'アーク',
        emoji: '😇',
        desc: '天より遣わされたと伝わる裁きの天使モンスター。かしこさが桁外れに高く、光と裁きを纏った荘厳な詠唱技の数々で相手を圧倒するが、ちから・丈夫さはかなり低い。',
        stats: { maxLife: 195, life: 195, pow: 45, int: 108, hit: 52, spd: 36, def: 28, gutsSpeed: 14 }
    },
    illumine: {
        id: 'illumine',
        monClass: 'inorganic',
        name: 'イルミネ',
        emoji: '⚔️',
        desc: '光り輝く無数の武器を自在に操る戦士型モンスター。ちからに優れ、剣・盾・弓・爪など多彩な得物を使い分ける万能の戦闘スタイルを誇るが、かしこさはかなり低い。',
        stats: { maxLife: 215, life: 215, pow: 96, int: 30, hit: 58, spd: 44, def: 40, gutsSpeed: 14 }
    },
    liger: {
        id: 'liger',
        monClass: 'beast',
        name: 'ライガー',
        emoji: '🐯',
        desc: 'ライオンと虎の力を併せ持つ俊敏な猛獣モンスター。ちからに優れ、鋭い爪と牙による接近戦に加え、雷や冷気を操る技も操る。動きは非常に俊敏だが、丈夫さはやや低め。',
        stats: { maxLife: 200, life: 200, pow: 92, int: 70, hit: 50, spd: 62, def: 36, gutsSpeed: 15 }
    },
    pixie: {
        id: 'pixie',
        monClass: 'demon',
        name: 'ピクシー',
        emoji: '🧚',
        desc: '小さな羽で宙を舞う妖精モンスター。かしこさが非常に高く、光や雷を操る多彩な技とすばしっこさを持ち味とするが、ちからと丈夫さは低め。',
        stats: { maxLife: 185, life: 185, pow: 40, int: 100, hit: 62, spd: 54, def: 30, gutsSpeed: 15 }
    },
    zan: {
        id: 'zan',
        monClass: 'creation',
        name: 'ザン',
        emoji: '🥷',
        desc: '全身に闘気を纏う凄腕の剣士型モンスター。ちからに極めて優れ、繰り出す斬撃のほとんどに強力な継続ダメージを付与する。かしこさはやや低め。',
        stats: { maxLife: 210, life: 210, pow: 100, int: 45, hit: 60, spd: 56, def: 38, gutsSpeed: 15 }
    }
};

// --- 種族名（例: 'モッチー'）→ モン類キー（例: 'spirit'）の対応表。MONSTER_TEMPLATESから自動生成 ---
const MON_CLASS_BY_SPECIES = {};
Object.keys(MONSTER_TEMPLATES).forEach(templateId => {
    const tmpl = MONSTER_TEMPLATES[templateId];
    if (tmpl && tmpl.name && tmpl.monClass) {
        MON_CLASS_BY_SPECIES[tmpl.name] = tmpl.monClass;
    }
});

// =====================================================
// 移動速度（Speed）ステータス
// バトルの行動順（先攻/後攻）を決定するために使用する、種族固有のステータス。
// ランク（S/A/B/C/D/E/F）で管理し、実際の比較には数値換算した値を使う。
// 今後モンスターを追加する場合は MOVE_SPEED_RANK_BY_TEMPLATE にランクを追記するだけでよい。
// =====================================================
const MOVE_SPEED_RANK_VALUE = { S: 110, A: 95, B: 80, C: 65, D: 50, E: 35, F: 20 };

function getMoveSpeedValueFromRank(rank) {
    return (MOVE_SPEED_RANK_VALUE[rank] !== undefined) ? MOVE_SPEED_RANK_VALUE[rank] : MOVE_SPEED_RANK_VALUE.D;
}

const MOVE_SPEED_RANK_BY_TEMPLATE = {
    mochi: 'D', suezo: 'F', dino: 'D', monolith: 'F', plant: 'F', kyubi: 'B',
    ham: 'D', arrowhead: 'C', nendoro: 'F', henger: 'D', durahan: 'D', golem: 'F',
    kawazumo: 'F', hinotori: 'B', gari: 'D', metalner: 'B', kijin: 'C', ghost: 'A',
    gel: 'D', ark: 'A', illumine: 'A', liger: 'B', pixie: 'A', zan: 'A'
};

// 各テンプレートの stats に moveSpeedRank / moveSpeed（数値）を書き込む
Object.keys(MONSTER_TEMPLATES).forEach(templateId => {
    const tmpl = MONSTER_TEMPLATES[templateId];
    if (tmpl && tmpl.stats) {
        const rank = MOVE_SPEED_RANK_BY_TEMPLATE[templateId] || 'D';
        tmpl.stats.moveSpeedRank = rank;
        tmpl.stats.moveSpeed = getMoveSpeedValueFromRank(rank);
    }
});

// --- 種族名からの移動速度取得（旧セーブデータ互換）---
// masmonData.stats.moveSpeed が無い（＝この機能追加前に作成されたマスモン）場合でも、
// 種族名からテンプレートを逆引きして正しい移動速度を返す。
function getMoveSpeedForMasmon(masmonData) {
    if (masmonData && masmonData.stats && typeof masmonData.stats.moveSpeed === 'number') {
        return masmonData.stats.moveSpeed;
    }
    const speciesName = (masmonData && (masmonData.monsterBaseName || masmonData.name)) || '';
    const templateId = Object.keys(MONSTER_TEMPLATES).find(id => MONSTER_TEMPLATES[id].name === speciesName);
    const tmpl = templateId ? MONSTER_TEMPLATES[templateId] : null;
    return (tmpl && typeof tmpl.stats.moveSpeed === 'number') ? tmpl.stats.moveSpeed : MOVE_SPEED_RANK_VALUE.D;
}

// --- 種族名からの移動速度ランク取得（旧セーブデータ互換）--- マヒによるランク低下の計算に使用する
function getMoveSpeedRankForMasmon(masmonData) {
    if (masmonData && masmonData.stats && typeof masmonData.stats.moveSpeedRank === 'string') {
        return masmonData.stats.moveSpeedRank;
    }
    const speciesName = (masmonData && (masmonData.monsterBaseName || masmonData.name)) || '';
    const templateId = Object.keys(MONSTER_TEMPLATES).find(id => MONSTER_TEMPLATES[id].name === speciesName);
    const tmpl = templateId ? MONSTER_TEMPLATES[templateId] : null;
    return (tmpl && tmpl.stats.moveSpeedRank) ? tmpl.stats.moveSpeedRank : 'D';
}

// =====================================================
// マヒ状態による移動速度低下
// マヒのモンスターは移動速度が3段階分下がる。
// 「段階」はS/A/B/C/D/E/Fのランク間の刻み幅（15）を基準にした数値換算で扱い、
// Fランクより下（名前のない領域）まで下がりうる。これによりFランクの相手に対しても
// 確実に後攻になる（同値によるランダム抽選に落ちない）。
// =====================================================
const MOVE_SPEED_RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

function shiftMoveSpeedRank(rank, shift) {
    const idx = MOVE_SPEED_RANK_ORDER.indexOf(rank);
    const baseIdx = (idx === -1) ? MOVE_SPEED_RANK_ORDER.indexOf('D') : idx;
    const newIdx = Math.max(0, Math.min(MOVE_SPEED_RANK_ORDER.length - 1, baseIdx + shift));
    return MOVE_SPEED_RANK_ORDER[newIdx];
}

// ランク間の刻み幅（S/A/B/C/D/E/F は等間隔=15）。MOVE_SPEED_RANK_VALUEからずれても追従するよう動的に算出する。
const MOVE_SPEED_RANK_STEP = (function () {
    const sSpeed = MOVE_SPEED_RANK_VALUE.S;
    const fSpeed = MOVE_SPEED_RANK_VALUE.F;
    return (sSpeed - fSpeed) / (MOVE_SPEED_RANK_ORDER.length - 1);
})();

// --- マヒ状態を加味した実効移動速度（数値）を返す ---
// unit は stats.moveSpeed/moveSpeedRank を持つ構造（CPU戦）／moveSpeed・moveSpeedRankを直接持つ構造（PvP）の両対応
//
// 注意：Fランクより下（G相当）の「名前付きランク」はゲーム上存在しないが、
// マヒによる「3段階低下」は数値としてはFの下まで貫通するべき仕様。
// shiftMoveSpeedRank()のようにランク配列のindexをクランプしてしまうと、
// 例えばD（idx2）は-3で本来idx=-1（Fより下）になるべきところがidx=0（F）に丸められてしまい、
// 「マヒしたDランクのモンスター」と「素のFランクのモンスター」の実効速度が同値になって、
// 本来先攻するはずのFランク側が①優先度②速度で決着がつかず③ランダム抽選に落ちてしまう不具合があった。
// これを避けるため、ランク文字ではなく数値をそのまま3段階分（15×3）減算し、
// Fランクより確実に低い値になるようにする（0未満にはしない）。
function getEffectiveMoveSpeed(unit) {
    if (!unit) return 0;
    const baseSpeed = (unit.stats ? unit.stats.moveSpeed : unit.moveSpeed) || 0;
    if (!unit.isParalyzed) return baseSpeed;
    return Math.max(0, baseSpeed - MOVE_SPEED_RANK_STEP * 3);
}

// =====================================================
// 交代時のステータスバフ・デバフ解除
// 「ステータスに対してのバフ・デバフ」は交代することにより解除される。
// 一方、状態異常（マヒ isParalyzed／混乱 isConfused・isConfusedThisTurn／
// 出血 dotTurns・dotPct）は控えに戻っても引き継がれるため、ここではリセットしない。
// =====================================================
function clearBattleStatModifiersOnSwitch(unit) {
    if (!unit) return;
    unit.isWeakened = false;
    unit.weakenStacks = 0;
    unit.defDownTurns = 0;
    unit.defDownPct = 0;
    unit.blindTurns = 0;
    unit.hitDownTempTurns = 0;
    unit.hitDownTempPct = 0;
    unit.hitDownStacks = 0;
    unit.permaHitDownPct = 0;
    unit.permaDefDownPct = 0;
    unit.defDown15Stacks = 0;
    unit.evasionDefDownStacks = 0;
    unit.stunnerDebuffApplied = false;
    unit.atkUpStacks = 0;
    unit.defUpStacks = 0;
    unit.nendoGatameStacks = 0;
    unit.sakuraBuffStacks = 0;
    unit.meisoStacks = 0;
    unit.kenbuStacks = 0;
    unit.arsMagnaBuffActive = false;
    unit.mysticGuardStacks = 0;
    unit.youkoInoriStacks = 0;
    unit.gutsRecoveryDownNext = 0;
    unit.critBonusTurns = 0;
    unit.critUpStacks = 0;
    unit.doubleHitNext = false;
    unit.michizureActive = false;
    unit.forceBoost = 0;
    unit.permaForceBoostActive = false;
    unit.dodgeNextGuaranteed = false;
    unit.flinchTurns = 0;
    unit.isFlinchedThisTurn = false;
    unit.isSokojikaraActive = false;
    unit.isSokojikaraFired = false;
    unit.isShuchuActive = false;
    unit.isGyakujoActive = false;
    unit.shieldValue = 0;
    unit.shieldUsedThisBattle = false;
    unit.isDefending = false;
    unit.gobiStepActive = false;
    unit.spdUpStacks = 0;
    unit.spdDownStacks = 0;
    // 猛毒（isPoisoned）はバトル終了まで治らないため、ここでは解除しない。
    // ただし交代すると蓄積したダメージ量はリセットされ、次に受けるダメージは1/16からやり直しになる。
    // （やけど isBurned／ねむり sleepTurns も他の状態異常と同様、控えに戻っても引き継がれるためリセットしない）
    if (unit.isPoisoned) {
        unit.poisonCounter = 0;
    }
}

// --- 状態異常（マヒ／混乱＝意味不明／出血／やけど／ねむり／猛毒）のバッジ表示用テキストを返す（無ければ空文字） ---
// 控えにいるユニットでも状態異常は引き継がれるため、アクティブ/控え問わず同じ関数で判定できる。
function getStatusAilmentBadgeText(unit) {
    if (!unit) return '';
    let text = '';
    if (unit.isParalyzed) text += '⚡';
    if (unit.isConfused) text += '❔';
    if (unit.dotTurns > 0) text += '🩸';
    if (unit.isBurned) text += '🔥';
    if (unit.sleepTurns > 0) text += '💤';
    if (unit.yawnTurns > 0) text += '🥱';
    if (unit.isPoisoned) text += '☠️';
    return text;
}

// --- 技データベース (ダメージランク対応) ---
const SKILLS_DB = {
    // --- モッチー系統 ---
    sakuranomai: { name: '桜の舞', aura: null, cost: 25, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'self_pow_int_up50_stack3', desc: '桜の力を体内で増幅させる。自身のちからとかしこさを50%上昇させる。3回まで重複可。' },
    migawarimochi: { name: 'みがわり餅', aura: null, cost: 40, type: 'substitute', hitRate: 100, force: 0, gutsDown: 0, selfDamagePct: 0.2, desc: '自身と同じ大きさの桜餅を設置し、自身への攻撃を2回防ぐ。発動時、自身も最大ライフの20%のダメージを受ける。モンスターを交換しても身代わりの桜餅は場に残り続ける。' },
    gaccho: { name: 'ガッチョ', aura: null, cost: 30, type: 'pow', hitRate: 80, force: 1.5, gutsDown: 12, effect: 'hitdown_stack_3', desc: '突っ張りによる連続攻撃。相手GUTS-12。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積）' },
    sakurafubuki: { name: 'さくら吹雪', aura: 'red', cost: 25, type: 'int', hitRate: 85, force: 1.3, gutsDown: 10, effect: 'guts_recovery_down_10', desc: '桜の花びらを舞い散らせる。相手GUTS-10。さらに命中した場合、相手の次のガッツ回復量を10減らす。' },
    cho_rollinmochi: { name: '超ローリンモッチ', aura: 'yellow', cost: 40, type: 'pow', hitRate: 65, force: 2.3, gutsDown: 20, effect: 'def_down_15_perma', desc: '大回転して激突する。相手GUTS-20。さらに命中した場合、相手が交代するまでの間、丈夫さを15%低下させる' },
    cho_mochihou: { name: '超もっち砲', aura: 'red', cost: 45, type: 'int', hitRate: 70, force: 2.5, gutsDown: 15, effect: 'dot_mine', desc: '最大出力のエネルギー弾。相手GUTS-15。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える。' },
    mossama: { name: 'もっさま', aura: 'green', cost: 35, type: 'pow', hitRate: 75, force: 1.8, gutsDown: 25, effect: 'selfcrit_up_3', desc: '強烈な威圧を伴う打撃。相手GUTS-25。さらに命中した場合、自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    yaezakura: { name: '八重ざくら', aura: null, cost: 30, type: 'heal', hitRate: 100, force: 0, gutsDown: 0, effect: 'heal_hp', maxUses: 5, desc: '桜の結界でライフを大幅回復する。（1バトルにつき5回まで使用可能）' },

    // --- スエゾー系統 ---
    meiso: { name: '瞑想', aura: null, cost: 25, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'meiso', desc: '瞑想による集中力上昇により、自身のかしこさと命中を30%上昇させる。丈夫さは10%下がる。3回まで重複可。25%の確率でねむり状態になってしまう。' },
    nameru: { name: 'なめる', aura: 'yellow', cost: 15, type: 'int', hitRate: 100, force: 0.4, gutsDown: 15, effect: null, desc: '不快な舌舐め攻撃。回避を完全に無視して【必中】する！相手GUTS-15' },
    kamitsuki: { name: 'かみつき', aura: null, cost: 20, type: 'pow', hitRate: 75, force: 1.2, gutsDown: 10, effect: 'def_down_15', desc: '大きな口で噛みつく基本技。相手GUTS-10。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    kuu: { name: '食う', aura: 'green', cost: 35, type: 'pow', hitRate: 70, force: 1.8, gutsDown: 20, effect: 'self_heal_15pct', desc: '丸呑みして締め付ける。相手GUTS-20。さらに命中した場合、丸呑みで英気を養い自身のライフを15%回復する' },
    psychokinesis: { name: 'サイコキネシス', aura: 'blue', cost: 45, type: 'int', hitRate: 75, force: 2.2, gutsDown: 30, effect: 'paralyze_25', desc: '強力な念動力攻撃。相手GUTS-30。さらに技命中時25%の確率で念動力で締め付けられマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    cho_netsushisen: { name: '超熱視線', aura: 'red', cost: 40, type: 'int', hitRate: 80, force: 2.0, gutsDown: 20, effect: 'burn_30', desc: '眼から放つ熱線攻撃。相手GUTS-20。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    utau: { name: '歌う', aura: 'yellow', cost: 30, type: 'int', hitRate: 95, force: 0.2, gutsDown: 45, effect: 'confuse_30', desc: '音痴な歌声で相手を悶絶させる。相手GUTS-45。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    berobinta: { name: 'ベロビンタ', aura: 'yellow', cost: 25, type: 'pow', hitRate: 80, force: 1.4, gutsDown: 15, effect: 'blind_2', desc: '長い舌で叩きつける。相手GUTS-15。さらに命中した場合、2ターンの間相手の目を眩ませ命中率を下げる' },

    // --- ディノ系統 ---
    shippo: { name: 'しっぽ', aura: 'green', cost: 15, type: 'pow', hitRate: 85, force: 0.9, gutsDown: 5, effect: null, desc: '力強いしっぽの叩きつけ。相手GUTS-5' },
    kamitsuki_dino: { name: 'かみつき', aura: 'yellow', cost: 20, type: 'pow', hitRate: 75, force: 1.3, gutsDown: 5, effect: null, desc: '鋭いキバで噛みつく基本技。相手GUTS-5' },
    sunakake: { name: '砂かけ', aura: 'yellow', cost: 15, type: 'int', hitRate: 90, force: 0.6, gutsDown: 20, effect: 'hitdown_stack_3', desc: '砂をかけて視界と闘志を奪う。相手GUTS-20。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    kamitsukinage: { name: 'かみつき投げ', aura: 'yellow', cost: 35, type: 'pow', hitRate: 70, force: 1.9, gutsDown: 10, effect: 'def_down_15', desc: '噛みついたまま投げ飛ばす。相手GUTS-10。さらに命中した場合、投げの衝撃で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    honoo_taiatari: { name: '炎のたいあたり', aura: 'red', cost: 40, type: 'pow', hitRate: 65, force: 2.4, gutsDown: 15, effect: 'burn_30', desc: '燃え盛る炎を纏って突進する。相手GUTS-15。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    hizageri: { name: 'ひざげり', aura: 'green', cost: 25, type: 'pow', hitRate: 80, force: 1.5, gutsDown: 10, effect: 'selfcrit_up_3', desc: '鋭い跳び膝蹴りを叩き込む。相手GUTS-10。さらに命中した場合、自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    kurohizacombo: { name: '黒ひざコンボ', aura: null, cost: 50, type: 'pow', hitRate: 75, force: 2.8, gutsDown: 15, effect: 'flinch_50_1t', desc: '連続で膝蹴りを叩き込む破壊技。相手GUTS-15。さらに命中した場合、強烈な衝撃で次のターン相手は50%の確率で怯んで行動に失敗する' },
    stealth_rock: { name: 'ステルスロック', aura: null, cost: 20, type: 'hazard', hitRate: 100, force: 0, gutsDown: 0, noDamage: true, effect: 'stealth_rock', logVerb: '尖った岩をまきちらした', desc: '相手フィールド上に鋭い岩をばら撒く。相手はモンスターを交代して繰り出すたびに、最大ライフの1/8のダメージを受けるようになる（一度設置すると、バトルが終わるまでずっと効果が持続する）。' },

    // --- モノリス系統 ---
    monotaore: { name: 'たおれこみ', aura: 'blue', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 10, effect: null, desc: '巨体を活かした体当たり基本技。相手GUTS-10' },
    warawara: { name: 'わらわら', aura: 'green', cost: 25, type: 'pow', hitRate: 80, force: 1.1, gutsDown: 15, effect: 'weaken_pow_int', desc: '奇妙な唸り声で相手を威圧する。相手GUTS-15。さらに相手の「ちから」「かしこさ」を10%低下させる（3回まで重複可・交代するまで持続）' },
    cho_monotaore: { name: '超たおれこみ', aura: 'blue', cost: 40, type: 'pow', hitRate: 70, force: 1.8, gutsDown: 20, useDefAsAtk: true, effect: null, desc: '全体重を乗せた渾身の体当たり。相手GUTS-20。自身の丈夫さの値が高いほど大ダメージを与える（ダメージ計算時、丈夫さの数値を攻撃の値として扱う）' },
    sanren_attack: { name: '3連アタック', aura: 'blue', cost: 50, type: 'pow', hitRate: 70, force: 2.8, gutsDown: 25, effect: 'def_down_15', desc: '硬い岩の腕を叩きつける三段攻撃。相手GUTS-25。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    sakebigoe: { name: 'サケビ声', aura: 'yellow', cost: 20, type: 'int', hitRate: 95, force: 0.75, gutsDown: 15, effect: 'confuse_30', desc: '甲高い叫び声で相手の精神を揺さぶる高命中技。相手GUTS-15。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    aurora_gate: { name: 'オーロラゲート', aura: 'blue', cost: 30, type: 'int', hitRate: 80, force: 1.7, gutsDown: 15, effect: 'next_force_up', desc: '虹色の門を展開し力を収束させる。相手GUTS-15。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    trio_beam_z: { name: 'トリオビームZ', aura: 'red', cost: 55, type: 'int', hitRate: 65, force: 2.8, gutsDown: 30, effect: null, useEffect: 'self_def_up_stack3', desc: '三条の破壊光線を放つ最大出力の切り札。相手GUTS-30。技を繰り出すたびに自身の丈夫さが15%上昇する（3回まで重複可）' },
    shinpi_no_mamori: { name: '神秘の守り', aura: null, cost: 30, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'mystic_guard_stack3', desc: '神秘の力で自身を守護する。ダメージは無く、相手のガッツも減少させない。自身の丈夫さを50%上昇させ、毎ターンのガッツ回復量を+10する。3回まで重複可。' },
    choonpa: { name: '超音波', aura: 'yellow', cost: 20, type: 'int', hitRate: 82, force: 0.85, gutsDown: 15, effect: 'paralyze_25', desc: '超音波を浴びせて相手の平衡感覚を狂わせる。相手GUTS-15。さらに技命中時25%の確率で相手をマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },

    // --- プラント系統 ---
    renkon: { name: '連続根っこ', aura: 'green', cost: 20, type: 'pow', hitRate: 100, force: 0.8, gutsDown: 10, effect: null, desc: '地中の根っこを操り連続で打ちすえる。回避を完全に無視して【必中】する！相手GUTS-10' },
    combination_plant: { name: 'コンビネーション', aura: 'yellow', cost: 35, type: 'pow', hitRate: 78, force: 1.8, gutsDown: 15, effect: null, desc: '枝と根を使った連続コンビネーション攻撃。相手GUTS-15' },
    face_drill: { name: 'フェイスドリル', aura: 'yellow', cost: 45, type: 'pow', hitRate: 68, force: 2.3, gutsDown: 20, effect: 'def_down_15', desc: '顔面の突起を高速回転させ突き刺す大技。相手GUTS-20。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    tane_gun: { name: '種ガン', aura: 'green', cost: 20, type: 'int', hitRate: 82, force: 1.1, gutsDown: 10, effect: 'hitdown_stack_3', desc: '硬い種を弾丸のように撃ち出す基本技。相手GUTS-10。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tane_machinegun: { name: '種マシンガン', aura: 'green', cost: 32, type: 'int', hitRate: 78, force: 1.4, gutsDown: 15, effect: 'hitdown_stack_3', desc: '種を連射して相手を蜂の巣にする。相手GUTS-15。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    kafun: { name: '花粉', aura: 'yellow', cost: 25, type: 'int', hitRate: 90, force: 0.2, gutsDown: 40, effect: null, desc: '大量の花粉をまき散らし、相手の闘志を大きく削ぐ。相手GUTS-40' },
    flower_beam: { name: 'フラワービーム', aura: 'green', cost: 45, type: 'int', hitRate: 70, force: 2.2, gutsDown: 20, effect: 'dot_mine', desc: '花の中心から極大の光線を放つ切り札。相手GUTS-20。さらに命中した場合、花粉の後遺症で3ターンの間継続ダメージを与える' },
    drain: { name: 'ドレイン', aura: 'blue', cost: 35, type: 'int', hitRate: 68, force: 1.4, gutsDown: 30, effect: 'drain_heal', drainPct: 1.0, desc: '相手の生命力を吸い取る。命中率はやや低めだが、与えたダメージ分だけ自身のライフを回復する。相手GUTS-30' },
    doku_no_kona: { name: 'どくのこな', aura: null, cost: 30, type: 'int', hitRate: 90, force: 0, gutsDown: 0, noDamage: true, effect: 'poison', desc: '毒の粉を撒き散らす。ダメージは無いが、命中した場合相手を猛毒状態にする（バトル終了まで治らず、ターンが経過するごとに受けるダメージが最大ライフの1/16ずつ増えていく。交代すると1/16からやり直しになる）' },

    // --- キュービ系統 ---
    hikkaki: { name: 'ひっかき', aura: 'yellow', cost: 15, type: 'pow', hitRate: 85, force: 0.5, gutsDown: 10, effect: null, desc: '鋭い爪で引っかく基本技。相手GUTS-10' },
    kagerou: { name: '陽炎', aura: 'red', cost: 45, type: 'pow', hitRate: 75, force: 1.4, gutsDown: 15, effect: 'guaranteed_dodge_next', desc: '陽炎に姿を紛れ込ませて攻撃する。相手GUTS-15。さらに命中した場合、次に受ける敵の攻撃を確実に回避する' },
    kitsunebi: { name: '狐火', aura: 'red', cost: 15, type: 'int', hitRate: 95, force: 0.5, gutsDown: 10, effect: null, desc: '青白い狐火を飛ばす高命中の基本技。相手GUTS-10' },
    cho_kitsunebi: { name: '超狐火', aura: 'red', cost: 32, type: 'int', hitRate: 88, force: 1.4, gutsDown: 15, effect: 'burn_30', desc: '巨大化させた狐火をぶつける高命中技。相手GUTS-15。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    yuuwaku: { name: 'ゆうわく', aura: 'blue', cost: 25, type: 'int', hitRate: 85, force: 0.85, gutsDown: 40, effect: 'confuse_30', desc: '妖しい魅力で相手の闘志を大きく削ぐ。相手GUTS-40。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    kokonoe_shingan: { name: '九重神眼', aura: null, cost: 40, type: 'int', hitRate: 75, force: 1.8, gutsDown: 15, effect: 'shield_self_20pct', desc: '九尾の瞳で相手を見据えて攻撃する。相手GUTS-15。さらに命中した場合、自身の最大ライフの20%に相当するシールドを展開する' },
    tenga_tensho: { name: '天河天翔', aura: 'yellow', cost: 55, type: 'int', hitRate: 60, force: 2.6, gutsDown: 20, effect: 'perma_dmg_up_20', desc: '天空を駆け巡る霊力の奔流を叩き込む最大の切り札。相手GUTS-20。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },
    akubi: { name: 'あくび', aura: null, cost: 25, type: 'int', hitRate: 90, force: 0, gutsDown: 20, noDamage: true, effect: 'yawn_2', desc: '大きなあくびをして眠気を誘う。ダメージは無い。相手GUTS-20。さらに技命中時、2ターン後に相手がねむり状態になる（2ターンの間、眠り続けて行動不能になる）。' },
    youko_no_inori: { name: '妖狐の祈り', aura: null, cost: 30, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'self_int_up50_stack3', desc: '妖狐の力を借りて自らに祈りを捧げる。ダメージは無く、相手のガッツも減少させない。自身のかしこさを50%上昇させる。3回まで重複可。' },

    // --- 敵・ボス共用 ---
    boss_bite: { name: 'かみつき', cost: 20, type: 'pow', hitRate: 75, force: 1.2, gutsDown: 10, effect: null, desc: '鋭い牙でガッツを奪う攻撃' },
    boss_roll: { name: 'ローリング激突', cost: 40, type: 'pow', hitRate: 65, force: 2.4, gutsDown: 20, effect: null, desc: '大回転で激突してガッツを奪う' },
    boss_focus: { name: 'きあい', cost: 10, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, effect: 'pow_up', desc: '攻撃力を上昇させる' },
    boss_laser: { name: 'サイコブラスト', aura: 'white', cost: 45, type: 'int', hitRate: 70, force: 2.6, gutsDown: 30, effect: 'confuse_30', desc: '精神力を収束させた衝撃波。さらに技命中時、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    boss_meteor: { name: 'メテオバースト', aura: 'white', cost: 55, type: 'int', hitRate: 70, force: 1.05, gutsDown: 12, effect: null, hitCount: 4, useEffect: 'meteor_spd_up', desc: '巨大な隕石を4連続で放つ大技（4回攻撃・1発ごとに相手GUTS-12）。さらに自身の回避ステータスが1段階上昇する（1回につき10%アップ、最大3回まで累積）' },

    // --- ハム系統 ---
    one_two_punch: { name: 'ワンツーパンチ', aura: 'green', cost: 15, type: 'pow', hitRate: 90, force: 0.7, gutsDown: 8, effect: null, desc: '素早い連続パンチの基本技。相手GUTS-8' },
    sobat: { name: 'ソバット', aura: 'green', cost: 16, type: 'pow', hitRate: 82, force: 0.9, gutsDown: 8, effect: 'selfcrit_up_3', desc: '回転しながら蹴りを放つ基本技。相手GUTS-8。さらに命中した場合、自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    atamatsuki: { name: '頭つき', aura: 'yellow', cost: 22, type: 'pow', hitRate: 88, force: 1.2, gutsDown: 12, effect: null, desc: '勢いよく頭突きを叩き込む命中重視技。相手GUTS-12' },
    seoinage: { name: '背負い投げ', aura: 'yellow', cost: 32, type: 'pow', hitRate: 68, force: 2.0, gutsDown: 20, effect: 'def_down_15', desc: '相手を担ぎ上げて叩きつける大技。相手GUTS-20。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    cho_atamatsuki: { name: '超頭つき', aura: 'yellow', cost: 38, type: 'pow', hitRate: 85, force: 1.7, gutsDown: 15, effect: null, desc: '頭突きを強化した高命中の一撃。相手GUTS-15' },
    machinegun_punch: { name: 'マシンガンパンチ', aura: 'green', cost: 42, type: 'pow', hitRate: 70, force: 2.3, gutsDown: 18, effect: null, desc: '連射式の高速パンチの雨あられ。相手GUTS-18' },
    onara: { name: 'おなら', aura: 'yellow', cost: 35, type: 'int', hitRate: 78, force: 1.0, gutsDown: 35, effect: 'blind_2', desc: '強烈な臭気で相手の闘志を大きく削ぐ。相手GUTS-35。さらに命中した場合、2ターンの間相手の目を眩ませ命中率を下げる' },
    cho_ogoe: { name: '超大声', aura: 'yellow', cost: 45, type: 'int', hitRate: 65, force: 2.6, gutsDown: 20, effect: 'confuse_30', desc: '遠方まで届く必殺の大絶叫。相手GUTS-20。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）'},

    // --- アローヘッド系統 ---
    tail_attack: { name: 'テイルアタック', aura: 'red', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 8, effect: null, desc: '硬い尾を叩きつける基本技。相手GUTS-8' },
    zoom_punch: { name: 'ズームパンチ', aura: 'yellow', cost: 20, type: 'pow', hitRate: 88, force: 1.1, gutsDown: 10, effect: null, desc: 'コスパに優れる標準的な打撃技。相手GUTS-10' },
    rocket_punch: { name: 'ロケットパンチ', aura: 'yellow', cost: 40, type: 'pow', hitRate: 68, force: 2.2, gutsDown: 18, effect: 'def_down_15', desc: '拳を撃ち出す大ダメージ技。相手GUTS-18。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    needle_turn: { name: 'ニードルターン', aura: 'yellow', cost: 25, type: 'pow', hitRate: 78, force: 1.4, gutsDown: 12, effect: null, desc: '回転しながら針を突き刺す連続技。相手GUTS-12' },
    w_needle_turn: { name: 'Wニードルターン', aura: 'yellow', cost: 35, type: 'pow', hitRate: 72, force: 1.8, gutsDown: 15, effect: null, desc: '針の連続突きを2連続で放つ。相手GUTS-15' },
    tornado_attack: { name: '竜巻アタック', aura: 'green', cost: 45, type: 'pow', hitRate: 65, force: 3.0, gutsDown: 20, effect: 'hitdown_stack_3', desc: '体を回転させ竜巻を起こす豪快な大技。相手GUTS-20。さらに命中した場合、砂塵が舞い相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tail_blade: { name: 'テイルブレード', aura: 'red', cost: 28, type: 'pow', hitRate: 75, force: 1.3, gutsDown: 30, effect: 'def_down_15', desc: '鋭い尾で斬りつけ闘志を大きく削ぐ。相手GUTS-30。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    jiraibari: { name: '地雷針', aura: 'yellow', cost: 30, type: 'int', hitRate: 90, force: 1.2, gutsDown: 12, effect: 'dot_mine', desc: '地中の針を遠隔操作する高命中の遠距離技。相手GUTS-12。さらに命中した場合、3ターンの間毎ターン継続ダメージを与える' },

    // --- ネンドロ系統 ---
    zoom_punch_nendoro: { name: 'ズームパンチ', aura: 'green', cost: 18, type: 'pow', hitRate: 100, force: 1.0, gutsDown: 10, effect: null, desc: '踏み込んで放つ正確な一撃。相手GUTS-10。必中' },
    mach_punch: { name: 'マッハパンチ', aura: 'green', cost: 30, type: 'pow', hitRate: 80, force: 1.8, gutsDown: 15, priority: 1, effect: null, desc: '目にも留まらぬ速さの高速連打。相手GUTS-15。素早さに関わらず、必ず先制して行動できる（先制攻撃）' },
    michizure: { name: 'みちづれ', aura: null, cost: 30, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, priority: 1, useEffect: 'michizure_wait', desc: '相手を道連れにする覚悟を決める特殊技。ダメージ・ガッツダウンともに無し。素早さに関わらず必ず先制して行動できる（先制技）。みちづれ待機状態になり、このターン中に相手の攻撃や状態異常で自分のライフが0になった場合、相手のモンスターのライフも0にする。' },
    meido_no_miyage: { name: 'めいどのみやげ', aura: 'red', cost: 50, type: 'pow', hitRate: 62, force: 2.9, gutsDown: 25, effect: 'dot_mine', desc: '渾身の力を込めた極悪の一撃。相手GUTS-25。さらに命中した場合、強烈な後遺症で3ターンの間継続ダメージを与える' },
    ganduke: { name: 'がん飛ばし', aura: 'green', cost: 14, type: 'pow', hitRate: 92, force: 0.6, gutsDown: 6, effect: 'evasion_def_down_20', desc: '威圧するような軽い張り手の基本技。相手GUTS-6。さらに命中した場合、相手の回避と丈夫さを20%下げる（3回まで重複可・交代するまで持続）' },
    body_press_nendoro: { name: 'ボディプレス', aura: 'red', cost: 33, type: 'pow', hitRate: 74, force: 1.9, gutsDown: 18, useDefAsAtk: true, effect: null, desc: '全体重を乗せた押しつぶし。相手GUTS-18。自身の丈夫さの値が高いほど大ダメージを与える（ダメージ計算時、丈夫さの数値を攻撃の値として扱う）' },
    nagekiss_nendoro: { name: '投げキッス', aura: null, cost: 20, type: 'int', hitRate: 82, force: 0.85, gutsDown: 30, effect: 'confuse_30', desc: '茶目っ気たっぷりに投げキッスを送りつける。相手GUTS-30。さらに技命中時30%の確率で相手を混乱状態にする（毎ターン40%の確率で意味不明になり行動できなくなる。30%の確率で混乱が解除される）' },
    nendo_gatame: { name: 'ねんどがため', aura: null, cost: 25, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'nendo_gatame', desc: '粘土質の体を大きく硬化させ守りを固める。自身の丈夫さを80%上昇させ、回避を10%低下させる。3回まで重複可。' },
    youkaieki: { name: 'ようかい液', aura: 'green', cost: 32, type: 'int', hitRate: 75, force: 1.4, gutsDown: 30, effect: 'poison_50', desc: '粘土から滲み出る妖しい液体を浴びせる。相手GUTS-30。さらに技命中時50%の確率で相手を猛毒状態にする（バトル終了まで治らず、ターンが経過するごとに受けるダメージが最大ライフの1/16ずつ増えていく。交代すると1/16からやり直しになる）' },

    // --- ヘンガー系統 ---
    w_kick: { name: 'Wキック', aura: null, cost: 20, type: 'pow', hitRate: 78, force: 1.3, gutsDown: 10, effect: null, desc: '命中はやや低いが威力の高い二段蹴り。相手GUTS-10' },
    laser_blade: { name: 'レーザーブレード', aura: 'red', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 8, effect: null, desc: '腕から放つ小型の光刃による基本技。相手GUTS-8' },
    laser_cutter: { name: 'レーザーカッター', aura: 'yellow', cost: 32, type: 'int', hitRate: 78, force: 1.6, gutsDown: 15, effect: 'dot_mine', desc: '収束させた光線で斬り裂く。相手GUTS-15。さらに命中した場合、レーザーの傷跡により3ターンの間継続ダメージを与える' },
    w_laser_sword: { name: 'Wレーザーソード', aura: 'red', cost: 26, type: 'int', hitRate: 88, force: 1.3, gutsDown: 12, effect: null, desc: '2連続の光刃による命中重視技。相手GUTS-12' },
    drill_rocket: { name: 'ドリルロケット', aura: 'blue', cost: 38, type: 'pow', hitRate: 72, force: 2.1, gutsDown: 15, effect: null, desc: '回転するドリルを撃ち出す。相手GUTS-15' },
    w_drill_rocket: { name: 'Wドリルロケット', aura: 'blue', cost: 48, type: 'pow', hitRate: 68, force: 2.5, gutsDown: 18, effect: 'def_down_15', desc: '2発同時に放つドリルロケットの強化版。相手GUTS-18。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    napalm_cannon: { name: 'ナパームキャノン', aura: 'red', cost: 50, type: 'int', hitRate: 70, force: 2.0, gutsDown: 22, effect: 'burn', desc: '内蔵砲門から放つ火炎の砲撃。相手GUTS-22。さらに技命中時、相手をやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },

    // --- デュラハン系統 ---
    cho_dash_giri: { name: '超ダッシュ斬り', aura: null, cost: 20, type: 'pow', hitRate: 85, force: 1.1, gutsDown: 10, priority: 1, effect: null, desc: '踏み込みながら剣を振るう基本技。相手GUTS-10。素早さに関わらず、必ず先制して行動できる（先制攻撃）' },
    kenbu: { name: '剣舞', aura: null, cost: 30, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'kenbu', desc: '剣を舞わせて心身を研ぎ澄ます。ダメージは無く、相手のガッツも減少させない。自身のちからと命中を25%上昇させる。3回まで重複可。' },
    midaretsuki: { name: '乱れ突き', aura: null, cost: 28, type: 'pow', hitRate: 82, force: 1.5, gutsDown: 12, effect: null, desc: '剣による素早い連続突き。相手GUTS-12' },
    mappufutatsu: { name: 'まっぷたつ', aura: 'red', cost: 42, type: 'pow', hitRate: 68, force: 2.3, gutsDown: 18, effect: 'dot_mine', desc: '巨大な剣で真っ二つに斬り裂く大技。相手GUTS-18。さらに命中した場合、深い傷跡が3ターンの間継続ダメージとなる' },
    combo_punch: { name: 'コンボパンチ', aura: null, cost: 48, type: 'pow', hitRate: 70, force: 2.5, gutsDown: 20, effect: 'selfcrit_up_3', desc: '拳と剣を織り交ぜた渾身の連続攻撃。相手GUTS-20。さらに命中した場合、自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    daisharin: { name: '大車輪', aura: 'green', cost: 40, type: 'pow', hitRate: 65, force: 2.2, gutsDown: 15, effect: 'hitdown_stack_3', desc: '剣を大きく振り回す遠距離の大技。相手GUTS-15。さらに命中した場合、目眩ましとなり相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    fujinken: { name: '風神剣', aura: 'green', cost: 25, type: 'int', hitRate: 88, force: 1.2, gutsDown: 25, effect: 'paralyze_25', desc: '風を纏った剣閃で相手の闘志を削ぐ。相手GUTS-25。さらに技命中時25%の確率で風圧で怯みマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    raijinken: { name: '雷神剣', aura: 'yellow', cost: 45, type: 'int', hitRate: 66, force: 2.6, gutsDown: 20, effect: 'paralyze_25', desc: '雷を纏わせた渾身の一閃。相手GUTS-20。さらに技命中時25%の確率で感電によりマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },

    // --- ゴーレム系統 ---
    dekopin: { name: 'でこぴん', aura: null, cost: 12, type: 'pow', hitRate: 90, force: 0.5, gutsDown: 6, effect: null, desc: '軽く弾き飛ばす基本技。相手GUTS-6' },
    shoda: { name: '掌打', aura: 'blue', cost: 16, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 10, effect: null, desc: '手のひらで打ちつける基本技。相手GUTS-10' },
    claw_nage: { name: 'クロー投げ', aura: null, cost: 30, type: 'pow', hitRate: 80, force: 1.6, gutsDown: 15, effect: 'def_down_15', desc: '鋭い爪で捉えて投げ飛ばす命中重視技。相手GUTS-15。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    double_chop: { name: 'ダブルチョップ', aura: 'blue', cost: 24, type: 'pow', hitRate: 78, force: 1.3, gutsDown: 12, effect: null, desc: '両腕を交互に振り下ろす連続技。相手GUTS-12' },
    guruguru_attack: { name: 'ぐるぐるアタック', aura: 'green', cost: 45, type: 'pow', hitRate: 66, force: 2.4, gutsDown: 20, effect: 'self_dizzy', desc: '巨体を回転させる遠距離の大技。相手GUTS-20。ただし勢い余って自身も目を回し、次の1ターン自身の命中率が低下する' },
    nobiru_punch: { name: 'のびーるパンチ', aura: 'blue', cost: 36, type: 'pow', hitRate: 70, force: 2.0, gutsDown: 15, effect: 'hitdown_stack_3', desc: '腕を伸ばして遠くまで殴りつける。相手GUTS-15。さらに命中した場合、相手の視界を乱し命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    jishin: { name: '地震', aura: 'yellow', cost: 30, type: 'int', hitRate: 82, force: 0.9, gutsDown: 35, effect: 'def_down_15', desc: '大地を揺るがし相手の闘志を大きく削ぐ。相手GUTS-35。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    gobi_step: { name: 'ゴビステップ', cost: 25, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, useEffect: 'gobi_step', desc: '巨体に似合わぬ軽やかなステップを踏む。自身の回避を150%上昇させる。' },

    // --- カワズモー系統 ---
    harite: { name: 'はり手', aura: null, cost: 15, type: 'pow', hitRate: 74, force: 1.05, gutsDown: 6, critBonus: 0, effect: null, desc: '素早い張り手で相手の頬を打つ基本技。相手GUTS-6' },
    gappuri_yotsu: { name: 'がっぷりよつ', aura: null, cost: 28, type: 'pow', hitRate: 78, force: 1.5, gutsDown: 15, critBonus: 0.10, effect: 'def_down_15', desc: 'がっちりと組み合い、渾身の力で相手の体勢を崩す。相手GUTS-15。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    uwatenage: { name: '上手投げ', aura: 'yellow', cost: 28, type: 'pow', hitRate: 64, force: 1.75, gutsDown: 18, critBonus: 0.17, effect: null, desc: '渾身の力を込めて相手を豪快に投げ飛ばす。命中率は低いが会心の一撃になりやすい。相手GUTS-18' },
    kawazutsuki: { name: 'かわずつき', aura: 'green', cost: 21, type: 'pow', hitRate: 66, force: 0.85, gutsDown: 9, critBonus: 0.17, effect: 'selfcrit_up_3', desc: '蛙のように鋭く跳びかかって突く。相手GUTS-9。さらに命中した場合、闘志が高まり自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    renzoku_harite: { name: '連続はり手', aura: null, cost: 27, type: 'pow', hitRate: 90, force: 1.35, gutsDown: 6, critBonus: 0.05, effect: 'hitdown_stack_3', desc: '両手による高速の張り手を連続で叩き込む高命中技。相手GUTS-6。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tobi_harite: { name: '飛びはり手', aura: null, cost: 19, type: 'pow', hitRate: 86, force: 0.75, gutsDown: 5, critBonus: 0.05, effect: null, desc: '飛び上がりながら繰り出す張り手。命中率が高い基本技。相手GUTS-5' },
    kaeru_no_shita: { name: 'かえるのした', aura: 'green', cost: 16, type: 'int', hitRate: 72, force: 0.85, gutsDown: 25, critBonus: 0.17, effect: 'paralyze_25', desc: '長い舌を伸ばして絡めとる。相手GUTS-25。さらに技命中時25%の確率で舌に絡め取られマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    dai_kaiten_otoshi: { name: '大回転落とし', aura: 'green', cost: 50, type: 'pow', hitRate: 70, force: 2.8, gutsDown: 18, critBonus: 0, effect: 'def_down_15', desc: '巨体で大きく回転し、渾身の力で相手を叩き落とす切り札。相手GUTS-18。さらに命中した場合、衝撃で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    kaeru_no_uta: { name: 'かえるのうた', aura: 'green', cost: 40, type: 'int', hitRate: 90, force: 0.2, gutsDown: 42, critBonus: 0.10, effect: 'confuse_30', desc: '独特な鳴き声の合唱で相手の闘志を大きく削ぐ高命中技。相手GUTS-42。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    bakudan_nage: { name: 'ばくだん投げ', aura: 'red', cost: 28, type: 'int', hitRate: 73, force: 2.05, gutsDown: 30, critBonus: 0.03, effect: 'burn_30', desc: '爆弾を模した重い物体を放り投げる大技。相手GUTS-30。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    nen_eki: { name: '粘液', aura: 'green', cost: 30, type: 'int', hitRate: 80, force: 1.1, gutsDown: 20, effect: 'spd_down_stage1', desc: '粘り気の強い体液を吹きかける。相手GUTS-20。さらに命中した場合、相手の移動速度を1段階下げる（1回につき10%低下・最大3段階・相手が交代するまでの間持続）' },

    // --- ヒノトリ系統 ---
    kuchibashi: { name: 'くちばし', aura: null, cost: 16, type: 'pow', hitRate: 70, force: 0.5, gutsDown: 4, critBonus: 0, effect: null, desc: '鋭いくちばしで相手を鋭くつつく基本技。相手GUTS-4' },
    renzoku_kagizume: { name: '連続かぎづめ', aura: 'red', cost: 25, type: 'pow', hitRate: 72, force: 1.2, gutsDown: 26, critBonus: 0.08, effect: 'hitdown_stack_3', desc: '鋭い鉤爪で相手を連続して切り裂く。相手GUTS-26。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    flame_typhoon: { name: 'フレイムタイフーン', aura: 'red', cost: 30, type: 'int', hitRate: 82, force: 1.85, gutsDown: 12, critBonus: 0.25, effect: 'burn_30', desc: '燃え盛る炎の竜巻を巻き起こし相手を包み込む。相手GUTS-12。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    otakebi: { name: '雄叫び', aura: null, cost: 20, type: 'int', hitRate: 65, force: 1.05, gutsDown: 27, critBonus: 0.03, effect: 'weaken_pow_int', desc: '大地を震わせる猛々しい咆哮で相手を威圧する。相手GUTS-27。さらに命中した場合、相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    bakuretsu_otoshi: { name: '爆裂落とし', aura: 'red', cost: 38, type: 'pow', hitRate: 58, force: 1.65, gutsDown: 7, critBonus: 0.15, effect: 'dot_mine', desc: '爆炎を纏った巨体で相手に叩き落とす豪快な一撃。相手GUTS-7。さらに命中した場合、火傷の後遺症で3ターンの間継続ダメージを与える' },
    flame_line: { name: 'フレイムライン', aura: 'red', cost: 25, type: 'int', hitRate: 95, force: 1.1, gutsDown: 16, critBonus: 0.25, effect: 'burn_30', desc: '一直線に炎を放つ回避困難な高命中技。相手GUTS-16。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    flame_beam: { name: 'フレイムビーム', aura: 'red', cost: 25, type: 'int', hitRate: 70, force: 2.1, gutsDown: 4, critBonus: 0, effect: 'burn_30', desc: '収束させた炎のエネルギーを一直線に放つ。相手GUTS-4。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    fire_bird: { name: 'ファイヤーバード', aura: 'red', cost: 40, type: 'pow', hitRate: 88, force: 1.7, gutsDown: 11, critBonus: 0.08, effect: 'burn_30', desc: '炎をまとった火の鳥と化して急降下する。相手GUTS-11。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    fire_wave: { name: 'ファイアウェーブ', aura: 'red', cost: 43, type: 'int', hitRate: 87, force: 2.6, gutsDown: 18, critBonus: 0.12, effect: 'burn_30', desc: '灼熱の炎を大波のようにぶつける豪快な大技。相手GUTS-18。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    ebony_nova: { name: 'エボニーノヴァ', aura: 'yellow', cost: 54, type: 'int', hitRate: 82, force: 3.2, gutsDown: 3, critBonus: 0.16, effect: 'perma_dmg_up_20', desc: '漆黒の炎を極限まで凝縮し解き放つ、この上ない最大の切り札。相手GUTS-3。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ガリ系統 ---
    knuckle: { name: 'ナックル', aura: null, cost: 18, type: 'pow', hitRate: 77, force: 0.85, gutsDown: 4, critBonus: 0, effect: null, desc: '拳を握り込んで叩きつける基本技。相手GUTS-4' },
    holy_fire: { name: 'ホーリーファイヤー', aura: 'red', cost: 31, type: 'int', hitRate: 64, force: 2.15, gutsDown: 12, critBonus: 0.10, effect: 'burn_30', desc: '神聖な炎を呼び出し相手を焼き尽くす。相手GUTS-12。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },
    god_bless: { name: 'ゴッドブレス', aura: null, cost: 36, type: 'int', hitRate: 89, force: 1.7, gutsDown: 13, critBonus: 0.14, effect: 'next_force_up', desc: '天よりの祝福を身にまとい相手を打つ高命中技。相手GUTS-13。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    press: { name: 'プレス', aura: null, cost: 25, type: 'pow', hitRate: 57, force: 1.65, gutsDown: 8, critBonus: 0.03, effect: 'def_down_15', desc: '全体重を乗せて相手を押し潰す。相手GUTS-8。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    hurricane: { name: 'ハリケーン', aura: 'blue', cost: 19, type: 'int', hitRate: 63, force: 1.4, gutsDown: 11, critBonus: 0.04, effect: 'blind_2', desc: '暴風を巻き起こし相手に叩きつける。相手GUTS-11。さらに命中した場合、砂塵で2ターンの間相手の目を眩ませ命中率を下げる' },
    holy_earth: { name: 'ホーリーアース', aura: 'yellow', cost: 28, type: 'int', hitRate: 66, force: 1.35, gutsDown: 27, critBonus: 0.25, effect: 'def_down_15', desc: '大地の聖なる力を呼び覚まし激しく揺るがす。相手GUTS-27。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    spin_cutter: { name: 'スピンカッター', aura: 'yellow', cost: 22, type: 'pow', hitRate: 71, force: 0.9, gutsDown: 3, critBonus: 0.12, effect: 'hitdown_stack_3', desc: '身を回転させ鋭い一撃を叩き込む。相手GUTS-3。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    straight: { name: 'ストレート', aura: null, cost: 15, type: 'pow', hitRate: 74, force: 0.75, gutsDown: 6, critBonus: 0.08, effect: null, desc: '基本に忠実な真っ直ぐな一撃。相手GUTS-6' },
    holy_icicle: { name: 'ホーリーアイシクル', aura: 'blue', cost: 27, type: 'int', hitRate: 78, force: 1.5, gutsDown: 17, critBonus: 0.17, effect: 'paralyze_25', desc: '神聖な氷柱を呼び出し相手を貫く。相手GUTS-17。さらに技命中時25%の確率で凍りつきマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    big_spin_cutter: { name: '大スピンカッター', aura: 'yellow', cost: 26, type: 'pow', hitRate: 62, force: 1.15, gutsDown: 18, critBonus: 0.26, effect: 'selfcrit_up_3', desc: '大きく回転しながら渾身の一撃を叩き込む。相手GUTS-18。さらに命中した場合、闘志が高まり自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    god_final: { name: 'ゴッドファイナル', aura: 'green', cost: 40, type: 'pow', hitRate: 69, force: 2.7, gutsDown: 2, critBonus: 0.14, effect: 'perma_dmg_up_20', desc: '神の力を宿した拳を叩き込む、この上ない最大の切り札。相手GUTS-2。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- メタルナー系統 ---
    ponken: { name: 'ポン拳', aura: 'blue', cost: 14, type: 'pow', hitRate: 71, force: 0.5, gutsDown: 4, critBonus: 0, effect: null, desc: '素早く突き出す基本の拳打。相手GUTS-4' },
    hidarite: { name: '左掌', aura: null, cost: 20, type: 'pow', hitRate: 77, force: 1.05, gutsDown: 7, critBonus: 0.05, effect: null, desc: '左手の掌底で相手を打つ。相手GUTS-7' },
    sunkei: { name: 'すんけい', aura: null, cost: 30, type: 'pow', hitRate: 58, force: 1.2, gutsDown: 22, critBonus: 0.08, effect: 'def_down_15', desc: 'わずかな間合いから内部に浸透する衝撃を叩き込む。相手GUTS-22。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    senkousho: { name: '閃光掌', aura: 'yellow', cost: 33, type: 'pow', hitRate: 91, force: 1.15, gutsDown: 37, critBonus: 0.06, effect: 'blind_2', desc: '目にも留まらぬ閃光の如き掌打を繰り出す高命中技。相手GUTS-37。さらに命中した場合、閃光で2ターンの間相手の目を眩ませ命中率を下げる' },
    tetsuzankou: { name: 'テツざんこう', aura: 'blue', cost: 18, type: 'pow', hitRate: 70, force: 0.85, gutsDown: 6, critBonus: 0.12, effect: 'paralyze_25', desc: '鋼の体躯を鉄山の如くぶつける渾身の一撃。相手GUTS-6。さらに技命中時25%の確率で衝撃で痺れが走りマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    double_shoda: { name: 'ダブル掌打', aura: 'blue', cost: 24, type: 'pow', hitRate: 73, force: 1.4, gutsDown: 13, critBonus: 0.09, effect: 'hitdown_stack_3', desc: '両手の掌底を連続で叩き込む。相手GUTS-13。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    twin_shoda: { name: 'ツイン掌打', aura: 'blue', cost: 28, type: 'pow', hitRate: 87, force: 1.7, gutsDown: 17, critBonus: 0.13, effect: 'selfcrit_up_3', desc: '両の掌を同時に打ち込む高命中の連撃。相手GUTS-17。さらに命中した場合、闘志が高まり自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    meta_beam: { name: 'メタビーム', aura: 'green', cost: 22, type: 'int', hitRate: 78, force: 1.5, gutsDown: 11, critBonus: 0.03, effect: null, desc: '金属質の体内で収束させたエネルギーを放つ。相手GUTS-11' },
    sho_henka: { name: '小変化', aura: 'green', cost: 25, type: 'pow', hitRate: 69, force: 1.1, gutsDown: 12, critBonus: 0.04, effect: 'next_force_up', desc: '体の一部を金属質に変化させ力を溜める。相手GUTS-12。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    taikyoku_henka: { name: '太極変化', aura: 'green', cost: 38, type: 'pow', hitRate: 72, force: 2.6, gutsDown: 23, critBonus: 0.17, effect: 'perma_dmg_up_20', desc: '全身を極限まで金属化させ渾身の一撃を放つ、この上ない最大の切り札。相手GUTS-23。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- キジン系統 ---
    zutsuki: { name: '頭突き', aura: null, cost: 16, type: 'pow', hitRate: 70, force: 0.85, gutsDown: 4, critBonus: 0, effect: null, desc: '角を生やした頭で相手に突きかかる基本技。相手GUTS-4' },
    onite: { name: '鬼手', aura: 'yellow', cost: 24, type: 'pow', hitRate: 64, force: 1.35, gutsDown: 12, critBonus: 0.12, effect: 'def_down_15', desc: '鬼の如き巨大な手で相手を鷲掴みにする。相手GUTS-12。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    nagetobashi: { name: '投げ飛ばし', aura: null, cost: 30, type: 'pow', hitRate: 72, force: 1.65, gutsDown: 22, critBonus: 0.09, effect: 'paralyze_25', desc: '相手を掴み上げ力任せに投げ飛ばす。相手GUTS-22。さらに技命中時25%の確率で強い衝撃でマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    onitsume: { name: '鬼爪', aura: 'yellow', cost: 20, type: 'pow', hitRate: 69, force: 1.1, gutsDown: 7, critBonus: 0.13, effect: 'hitdown_stack_3', desc: '鋭く伸びた鬼の爪で相手を切り裂く。相手GUTS-7。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    kijin_ranbu: { name: '鬼神乱舞', aura: 'yellow', cost: 32, type: 'pow', hitRate: 78, force: 1.75, gutsDown: 18, critBonus: 0.17, effect: 'selfcrit_up_3', desc: '鬼神の如く舞い乱れながら連続で斬りつける。相手GUTS-18。さらに命中した場合、闘志が高まり自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    chiretsuzan: { name: '地裂斬', aura: 'yellow', cost: 22, type: 'pow', hitRate: 76, force: 1.2, gutsDown: 11, critBonus: 0.10, effect: 'dot_mine', desc: '大地を切り裂くほどの一閃を放つ。相手GUTS-11。さらに命中した場合、深い傷跡から3ターンの間継続ダメージを与える' },
    onikokushou: { name: '鬼哭衝', aura: 'yellow', cost: 28, type: 'pow', hitRate: 71, force: 1.5, gutsDown: 23, critBonus: 0.16, effect: 'weaken_pow_int', desc: '鬼が哭くような咆哮とともに突きを繰り出す。相手GUTS-23。さらに命中した場合、相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    ashura: { name: '阿修羅', aura: 'red', cost: 34, type: 'pow', hitRate: 79, force: 2.2, gutsDown: 16, critBonus: 0.12, effect: 'next_force_up', desc: '阿修羅の如き形相で幾多の拳を叩き込む。相手GUTS-16。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    rasetsu: { name: '羅刹', aura: 'red', cost: 25, type: 'pow', hitRate: 59, force: 1.6, gutsDown: 3, critBonus: 0, effect: 'blind_2', desc: '羅刹の恐ろしい形相で相手を威圧しながら斬りつける。相手GUTS-3。さらに命中した場合、恐怖で2ターンの間相手の目を眩ませ命中率を下げる' },
    rashomon: { name: '羅生門', aura: 'yellow', cost: 42, type: 'pow', hitRate: 77, force: 2.8, gutsDown: 21, critBonus: 0.17, effect: 'perma_dmg_up_20', desc: '羅生門の鬼の如く渾身の一刀を振り下ろす、この上ない最大の切り札。相手GUTS-21。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ゴースト系統 ---
    piko_hammer: { name: 'ピコピコハンマー', aura: 'yellow', cost: 13, type: 'pow', hitRate: 58, force: 1.1, gutsDown: 3, critBonus: 0.03, effect: null, desc: 'おもちゃのハンマーで相手をポカポカ叩く基本技。相手GUTS-3' },
    taiatari: { name: '体当たり', aura: 'green', cost: 15, type: 'pow', hitRate: 82, force: 1.25, gutsDown: 4, critBonus: 0, effect: null, desc: '体ごとぶつかっていく基本技。相手GUTS-4' },
    ohpunch: { name: '大パンチ', aura: 'yellow', cost: 37, type: 'pow', hitRate: 71, force: 2.2, gutsDown: 23, critBonus: 0.06, effect: 'def_down_15', desc: '大きく振りかぶった拳を叩き込む。相手GUTS-23。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    combination: { name: 'コンビネーション', aura: 'yellow', cost: 55, type: 'pow', hitRate: 94, force: 1.28, gutsDown: 24, critBonus: 0.04, effect: 'hitdown_stack_3', desc: '緩急をつけた連続攻撃で相手を翻弄する高命中の大技。相手GUTS-24。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    odokasu: { name: 'おどかす', aura: 'green', cost: 17, type: 'int', hitRate: 69, force: 0.85, gutsDown: 26, critBonus: 0.09, effect: 'weaken_pow_int', desc: '不気味な姿で相手を脅かす。相手GUTS-26。さらに命中した場合、相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    dokuro_beam: { name: 'ドクロビーム', aura: 'blue', cost: 28, type: 'int', hitRate: 76, force: 1.4, gutsDown: 17, critBonus: 0.13, effect: 'blind_2', desc: '口から放つ髑髏形の怪光線。相手GUTS-17。さらに命中した場合、不気味な光で2ターンの間相手の目を眩ませ命中率を下げる' },
    bikkuri_dokuro: { name: 'びっくりドクロ', aura: 'blue', cost: 40, type: 'int', hitRate: 87, force: 2.3, gutsDown: 37, critBonus: 0.25, effect: 'paralyze_25', desc: '突如出現する巨大な髑髏で相手を心底驚かせる。相手GUTS-37。さらに技命中時25%の確率で恐怖のあまりマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    card: { name: 'カード', aura: 'yellow', cost: 24, type: 'int', hitRate: 72, force: 1.15, gutsDown: 16, critBonus: 0.12, effect: 'dot_mine', desc: '呪いを込めた一枚のカードを相手に投げつける。相手GUTS-16。さらに命中した場合、呪いの効果で3ターンの間継続ダメージを与える' },
    ohki_otoshimono: { name: '大きなおとしもの', aura: 'yellow', cost: 33, type: 'int', hitRate: 78, force: 1.7, gutsDown: 21, critBonus: 0.17, effect: 'paralyze_25', desc: '頭上から巨大な物体を落として相手を直撃する。相手GUTS-21。さらに技命中時25%の確率で強い衝撃でマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    ghost_flash: { name: 'ゴーストフラッシュ', aura: 'yellow', cost: 48, type: 'int', hitRate: 70, force: 2.75, gutsDown: 28, critBonus: 0.13, effect: 'perma_dmg_up_20', desc: '無数の霊が一斉に光り輝く、この上ない最大の切り札。相手GUTS-28。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ゲル系統 ---
    tsukisashi: { name: '突き刺し', aura: 'blue', cost: 16, type: 'pow', hitRate: 50, force: 1.1, gutsDown: 3, critBonus: 0.10, effect: null, desc: 'ゲル状の体の一部を尖らせて突き刺す基本技。相手GUTS-3' },
    kushizashi: { name: 'くし刺し', aura: 'blue', cost: 17, type: 'pow', hitRate: 70, force: 1.25, gutsDown: 4, critBonus: 0.15, effect: 'dot_mine', desc: '体の複数箇所を尖らせ次々と串刺しにする連続攻撃。相手GUTS-4。さらに命中した場合、深く刺さった傷跡により3ターンの間継続ダメージを与える' },
    mana_drain: { name: 'マナドレイン', aura: 'blue', cost: 21, type: 'int', hitRate: 60, force: 1.7, gutsDown: 38, critBonus: 0.10, effect: 'guts_drain', desc: '相手の闘志を根こそぎ吸い取る。相手GUTS-38。さらに奪ったガッツ分だけ自身のガッツが回復する' },
    muchi: { name: 'ムチ', aura: 'blue', cost: 16, type: 'pow', hitRate: 80, force: 0.5, gutsDown: 3, critBonus: 0, effect: 'hitdown_stack_3', desc: '体を鞭のようにしならせて打ちつける高命中の基本技。相手GUTS-3。さらに命中した場合、鋭い一撃で相手の視界が乱れ命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    g_cube: { name: 'G・キューブ', aura: 'green', cost: 22, type: 'pow', hitRate: 58, force: 1.65, gutsDown: 12, critBonus: 0.10, effect: 'def_down_15', desc: '体の一部を硬いキューブ状に変形させ叩きつける。相手GUTS-12。さらに命中した場合、強烈な圧迫で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    gel_press: { name: 'ゲルプレス', aura: null, cost: 40, type: 'pow', hitRate: 88, force: 2.6, gutsDown: 11, critBonus: 0.10, effect: 'self_heal_15pct', desc: '全身を押しつぶすように叩きつける必殺の一撃。相手GUTS-11。さらに命中した場合、押しつぶした相手の養分を吸収し自身のライフを15%回復する' },
    hae_tataki: { name: 'ハエタタキ', aura: 'green', cost: 17, type: 'pow', hitRate: 60, force: 0.8, gutsDown: 25, critBonus: 0, effect: 'selfcrit_up_3', desc: '狙いを定め一撃で仕留めるスワット攻撃。相手GUTS-25。さらに命中した場合、会心の一撃で自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    parabola_beam: { name: 'パラボラビーム', aura: 'blue', cost: 20, type: 'int', hitRate: 90, force: 0.75, gutsDown: 12, critBonus: 0.15, effect: 'blind_2', desc: '体表の反射板でエネルギーを収束させ放つ高命中のビーム。相手GUTS-12。さらに命中した場合、まばゆい反射光で2ターンの間相手の目を眩ませ命中率を下げる' },
    cho_parabola_beam: { name: '超パラボラビーム', aura: 'blue', cost: 38, type: 'int', hitRate: 92, force: 1.75, gutsDown: 20, critBonus: 0.24, effect: 'def_down_15', desc: '反射板を最大出力で展開し放つ強化ビーム。相手GUTS-20。さらに命中した場合、防御ごと貫く衝撃で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    koma_attack: { name: 'コマアタック', aura: null, cost: 20, type: 'pow', hitRate: 90, force: 0.85, gutsDown: 8, critBonus: 0.03, effect: 'self_dizzy', desc: '高速回転しながら体当たりする高命中技。相手GUTS-8。ただし勢い余って自身も目を回し、次の1ターン自身の命中率が低下する' },
    taihou: { name: '大砲', aura: 'red', cost: 33, type: 'int', hitRate: 58, force: 2.7, gutsDown: 7, critBonus: 0.06, effect: 'dot_mine', desc: '体内に溜めたガスを砲弾のように撃ち出す最大出力の一撃。相手GUTS-7。さらに命中した場合、炸裂の破片が突き刺さり3ターンの間継続ダメージを与える' },
    gel_copter: { name: 'ゲルコプター', aura: 'blue', cost: 50, type: 'int', hitRate: 88, force: 1.7, gutsDown: 16, critBonus: 0.06, effect: 'perma_dmg_up_20', desc: '体の一部を高速回転させ空高くから急襲する、この上ない最大の切り札。相手GUTS-16。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- アーク系統 ---
    waga_hitomi: { name: '我が瞳の真理を見よ', aura: null, cost: 16, type: 'int', hitRate: 80, force: 0.15, gutsDown: 3, critBonus: 0, effect: 'next_force_up', desc: '瞳に宿す真理の力で相手の弱点を見抜く。相手GUTS-3。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    sekai_wo_yurase: { name: '世界を揺らせ', aura: 'green', cost: 18, type: 'pow', hitRate: 66, force: 1.25, gutsDown: 3, critBonus: 0.11, effect: 'def_down_15', desc: '大地そのものを揺るがす渾身の一撃。相手GUTS-3。さらに命中した場合、衝撃で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    tobe_shinritsu_no_yaiba: { name: '翔べ震律の刃よ', aura: 'yellow', cost: 21, type: 'int', hitRate: 72, force: 0.5, gutsDown: 16, critBonus: 0.07, effect: 'hitdown_stack_3', desc: '震える法則を纏った不可視の刃を飛ばす。相手GUTS-16。さらに命中した場合、感覚を乱され相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    shinkou_yo_kegare_wo_harae: { name: '神光よ汚れを祓え', aura: null, cost: 22, type: 'int', hitRate: 80, force: 1.1, gutsDown: 7, critBonus: 0.11, effect: 'weaken_pow_int', desc: '清浄な光で相手に宿る穢れを祓い清める。相手GUTS-7。さらに命中した場合、力を封じられ相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    ima_koso_shin_naru_mezame: { name: '今こそ真なる目醒め', aura: null, cost: 26, type: 'int', hitRate: 72, force: 1.45, gutsDown: 16, critBonus: 0.11, effect: 'selfcrit_up_3', desc: '眠っていた真なる力を解き放つ覚醒の一撃。相手GUTS-16。さらに命中した場合、研ぎ澄まされた感覚で自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    aoki_ibara_yo_toga_wo_ugate: { name: '蒼き荊よ咎を穿て', aura: 'blue', cost: 29, type: 'int', hitRate: 72, force: 1.7, gutsDown: 16, critBonus: 0.11, effect: 'dot_mine', desc: '蒼く輝く荊の鎖で相手の罪を貫く。相手GUTS-16。さらに命中した場合、突き刺さった荊により3ターンの間継続ダメージを与える' },
    sabaki_no_hikari_yo_kudare: { name: '裁きの光よ下れ', aura: 'yellow', cost: 31, type: 'int', hitRate: 60, force: 2.2, gutsDown: 20, critBonus: 0.07, effect: 'paralyze_25', desc: '天より降り注ぐ裁きの光で相手を打ち据える。相手GUTS-20。さらに技命中時25%の確率で光に貫かれマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    shuuen_ni_sukui_wo_ataeyo: { name: '終焉に救いを与えよ', aura: null, cost: 35, type: 'int', hitRate: 80, force: 2.3, gutsDown: 16, critBonus: 0.04, effect: 'self_heal_15pct', desc: '終わりゆく者にすら救済を与える圧倒的な一撃。相手GUTS-16。さらに命中した場合、救済の奇跡により自身のライフを15%回復する' },
    shiten_no_tsurugi_yo_oritate: { name: '熾天の剣よ降り立て', aura: 'red', cost: 42, type: 'int', hitRate: 80, force: 1.75, gutsDown: 25, critBonus: 0.11, effect: 'def_down_15', desc: '天より舞い降りる熾天使の剣を叩きつける。相手GUTS-25。さらに命中した場合、聖剣の衝撃で30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    seiya_no_kane_yo_narihibike: { name: '聖夜の鐘よ鳴響け', aura: 'green', cost: 43, type: 'int', hitRate: 72, force: 2.35, gutsDown: 20, critBonus: 0.11, effect: 'confuse_30', desc: '荘厳な鐘の音を鳴り響かせ精神を揺さぶる。相手GUTS-20。さらに命中した場合、30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    inore_rinne_no_wa_yo: { name: '祈れ輪廻の環よ', aura: 'blue', cost: 45, type: 'int', hitRate: 90, force: 2.6, gutsDown: 20, critBonus: 0.11, effect: 'shield_self_20pct', desc: '輪廻転生の環を呼び覚まし絶大な力を叩きつける。相手GUTS-20。さらに命中した場合、自身の最大ライフの20%に相当するシールドを展開する' },
    ten_no_jihi_yo_shimesareyo: { name: '天の慈悲よ示されよ', aura: 'blue', cost: 50, type: 'int', hitRate: 92, force: 2.7, gutsDown: 20, critBonus: 0.07, effect: 'perma_dmg_up_20', desc: '天の慈悲そのものを解き放つ、この上ない最大の切り札。相手GUTS-20。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- イルミネ系統 ---
    plasma: { name: 'プラズマ', aura: null, cost: 13, type: 'pow', hitRate: 100, force: 0.15, gutsDown: 3, critBonus: 0.06, effect: 'grant_double_hit_next', desc: '体内で生成した電光を放つ、回避を完全に無視して【必中】する基本技。相手GUTS-3。さらに命中した場合、自身が次に繰り出す技を2回攻撃扱いにする（命中判定は1回のみだが、命中時のダメージ・追加効果の抽選を2回分まとめて処理する）' },
    shield_bash: { name: 'シールドバッシュ', aura: 'red', cost: 20, type: 'pow', hitRate: 58, force: 1.1, gutsDown: 3, critBonus: 0.10, effect: 'def_down_15', desc: '盾を叩きつけて相手の体勢を崩す。相手GUTS-3。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    straight_punch: { name: 'ストレート', aura: 'yellow', cost: 24, type: 'pow', hitRate: 87, force: 1.45, gutsDown: 16, critBonus: 0, effect: null, desc: '基本に忠実な高命中の一直線の拳。相手GUTS-16' },
    venom_edge: { name: 'ヴェノムエッジ', aura: 'red', cost: 17, type: 'pow', hitRate: 70, force: 0.2, gutsDown: 3, critBonus: 0.10, effect: 'poison_50', desc: '毒を纏った刃で斬りつける。相手GUTS-3。さらに技命中時50%の確率で相手を猛毒状態にする（バトル終了まで治らず、ターンが経過するごとに受けるダメージが最大ライフの1/16ずつ増えていく。交代すると1/16からやり直しになる）' },
    assassin_claw: { name: 'アサシンクロウ', aura: 'red', cost: 28, type: 'pow', hitRate: 80, force: 1.5, gutsDown: 20, critBonus: 0.16, effect: 'selfcrit_up_3', desc: '暗殺者の如く急所を狙う鋭い爪撃。相手GUTS-20。さらに命中した場合、研ぎ澄まされた殺気で自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    morning_star: { name: 'モーニングスター', aura: 'red', cost: 27, type: 'pow', hitRate: 58, force: 1.65, gutsDown: 4, critBonus: 0.06, effect: 'def_down_15', desc: '棘のついた鉄球を叩きつける豪快な一撃。相手GUTS-4。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    arcana_flare: { name: 'アルカナフレア', aura: 'red', cost: 29, type: 'int', hitRate: 60, force: 1.4, gutsDown: 30, critBonus: 0.06, effect: 'blind_2', desc: '神秘の紋章から閃光を放つ唯一の魔法技。相手GUTS-30。さらに命中した場合、まばゆい光で2ターンの間相手の目を眩ませ命中率を下げる' },
    assault_arrow: { name: 'アサルトアロー', aura: 'yellow', cost: 33, type: 'pow', hitRate: 75, force: 1.75, gutsDown: 7, critBonus: 0.16, effect: 'hitdown_stack_3', desc: '矢の連射で相手を蜂の巣にする。相手GUTS-7。さらに命中した場合、視界を乱され相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    buster_sword: { name: 'バスターソード', aura: 'green', cost: 41, type: 'pow', hitRate: 80, force: 1.15, gutsDown: 16, critBonus: 0.22, effect: 'next_force_up', desc: '巨大な剣を振りかぶり力を溜めて叩きつける。相手GUTS-16。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    ars_magna: { name: 'アルスマグナ', aura: 'red', cost: 35, type: 'pow', hitRate: 92, force: 1.7, gutsDown: 3, critBonus: 0.06, effect: 'ars_magna_self_up', desc: '大いなる業を体現する高命中の一撃。相手GUTS-3。さらに命中した場合、大いなる業が己を満たし、自身のライフ以外の全ステータス（ちから・かしこさ・命中・丈夫さ・回避）が20%上昇する（1回のみ・交代するまで持続）' },
    blade_dance: { name: 'ブレードダンス', aura: null, cost: 38, type: 'pow', hitRate: 92, force: 1.35, gutsDown: 30, critBonus: 0.13, effect: 'selfcrit_up_3', desc: '舞うように剣を振るう高命中の連続攻撃。相手GUTS-30。さらに命中した場合、研ぎ澄まされた集中力で自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    requiem_end: { name: 'レクイエムエンド', aura: null, cost: 46, type: 'pow', hitRate: 75, force: 2.6, gutsDown: 20, critBonus: 0.19, effect: 'perma_dmg_up_20', desc: '全てを終わらせる鎮魂の一撃、この上ない最大の切り札。相手GUTS-20。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },
    mirage_claw: { name: 'ミラージュクロウ', aura: 'blue', cost: 45, type: 'pow', hitRate: 97, force: 1.85, gutsDown: 30, critBonus: 0.16, effect: 'guaranteed_dodge_next', desc: '陽炎の如き残像を纏った高命中の爪撃。相手GUTS-30。さらに命中した場合、残像に紛れ次に受ける敵の攻撃を確実に回避する' },
    crimson_nova: { name: 'クリムゾンノヴァ', aura: 'red', cost: 43, type: 'pow', hitRate: 80, force: 1.58, gutsDown: 16, critBonus: 0.10, effect: 'burn_30', desc: '深紅の爆光を解き放つ大爆発。相手GUTS-16。さらに技命中時30%の確率でやけど状態にする（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）' },

    // --- ライガー系統 ---
    liger_hikkaki: { name: 'ひっかき', aura: null, cost: 10, type: 'pow', hitRate: 80, force: 0.5, gutsDown: 3, critBonus: 0, effect: null, desc: '鋭い爪で素早く引っかく基本技。相手GUTS-3' },
    liger_kamitsuki: { name: 'かみつき', aura: 'yellow', cost: 16, type: 'pow', hitRate: 70, force: 0.85, gutsDown: 3, critBonus: 0.02, effect: 'dot_mine', desc: '鋭い牙で深く噛みつく。相手GUTS-3。さらに命中した場合、噛み傷から3ターンの間継続ダメージを与える' },
    body_slam: { name: '体当たり', aura: null, cost: 17, type: 'pow', hitRate: 92, force: 1.1, gutsDown: 3, critBonus: 0.04, effect: null, desc: '全体重を乗せて突撃する高命中の基本技。相手GUTS-3' },
    raigeki: { name: '雷撃', aura: 'yellow', cost: 18, type: 'int', hitRate: 70, force: 0.8, gutsDown: 25, critBonus: 0.06, effect: 'paralyze_25', desc: '全身に纏った電気を撃ち放つ。相手GUTS-25。さらに技命中時25%の確率で感電によりマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    one_two: { name: 'ワンツー', aura: null, cost: 19, type: 'pow', hitRate: 58, force: 1.45, gutsDown: 3, critBonus: 0.04, effect: 'hitdown_stack_3', desc: '素早い両前脚の連続攻撃。相手GUTS-3。さらに命中した場合、目にもとまらぬ連撃で相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    reikidan: { name: '冷気弾', aura: 'blue', cost: 24, type: 'int', hitRate: 48, force: 1.05, gutsDown: 7, critBonus: 0.15, effect: 'def_down_15', desc: '極寒の冷気を凝縮した弾を放つ。相手GUTS-7。さらに命中した場合、体が凍りつき30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    kagegeki: { name: '影撃', aura: 'yellow', cost: 23, type: 'pow', hitRate: 80, force: 0.75, gutsDown: 4, critBonus: 0.15, effect: 'blind_2', desc: '影に紛れ死角から繰り出す一撃。相手GUTS-4。さらに命中した場合、闇に紛れた一撃で2ターンの間相手の目を眩ませ命中率を下げる' },
    cho_raigeki: { name: '超雷撃', aura: 'yellow', cost: 27, type: 'int', hitRate: 70, force: 1.35, gutsDown: 30, critBonus: 0.04, effect: 'confuse_30', desc: '全身全霊で放つ強化された雷撃。相手GUTS-30。さらに命中した場合、神経を焼かれ30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    kuuchu_kaiten_attack: { name: '空中回転アタック', aura: null, cost: 26, type: 'pow', hitRate: 100, force: 1.58, gutsDown: 7, critBonus: 0.10, effect: 'self_dizzy', desc: '空高く跳躍し回転しながら急襲する【必中】技。相手GUTS-7。ただし勢い余って自身も目を回し、次の1ターン自身の命中率が低下する' },
    combination_liger: { name: 'コンビネーション', aura: null, cost: 30, type: 'pow', hitRate: 60, force: 1.7, gutsDown: 4, critBonus: 0.10, effect: 'def_down_15', desc: '爪と牙を織り交ぜた連続コンビネーション攻撃。相手GUTS-4。さらに命中した場合、削られた守りにより30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    liger_raijinken: { name: '雷神剣', aura: 'yellow', cost: 35, type: 'int', hitRate: 70, force: 2.2, gutsDown: 20, critBonus: 0.15, effect: 'weaken_pow_int', desc: '雷神の力を宿した爪牙による渾身の一撃。相手GUTS-20。さらに命中した場合、力を封じられ相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    rakurai_kyoumei: { name: '落雷共鳴', aura: 'yellow', cost: 50, type: 'int', hitRate: 80, force: 2.6, gutsDown: 4, critBonus: 0.15, effect: 'perma_dmg_up_20', desc: '大地に落雷を呼び、その衝撃を全身で共鳴させ叩き込む、この上ない最大の切り札。相手GUTS-4。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ピクシー系統 ---
    pixie_harite: { name: 'はり手', aura: null, cost: 16, type: 'pow', hitRate: 82, force: 0.85, gutsDown: 5, critBonus: 0, effect: null, desc: '素早い手のひらで頬を軽やかに打つ基本技。相手GUTS-5' },
    pixie_thunder: { name: 'サンダー', aura: 'yellow', cost: 17, type: 'int', hitRate: 82, force: 0.85, gutsDown: 9, critBonus: 0, effect: 'paralyze_25', desc: '手のひらから小さな雷を放つ基本技。相手GUTS-9。さらに技命中時25%の確率で感電によりマヒ状態にする（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）' },
    pixie_ray: { name: 'レイ', aura: null, cost: 22, type: 'int', hitRate: 66, force: 1.15, gutsDown: 5, critBonus: 0.20, effect: null, desc: '収束させた光の粒子を撃ち出す。相手GUTS-5' },
    pixie_lightning: { name: 'ライトニング', aura: 'yellow', cost: 23, type: 'int', hitRate: 90, force: 1.15, gutsDown: 5, critBonus: 0.08, effect: 'blind_2', desc: '鋭い雷光を鞭のように打ち出す高命中技。相手GUTS-5。さらに命中した場合、閃光で2ターンの間相手の目を眩ませ命中率を下げる' },
    pixie_megaray: { name: 'メガレイ', aura: null, cost: 26, type: 'int', hitRate: 66, force: 1.5, gutsDown: 5, critBonus: 0.20, effect: 'def_down_15', desc: 'レイを強化した貫通力の高い光線。相手GUTS-5。さらに命中した場合、30%の確率で相手の丈夫さを15%低下させる（最大3回まで累積・交代するまで持続）' },
    pixie_nagekiss: { name: 'なげキッス', aura: 'red', cost: 21, type: 'int', hitRate: 82, force: 0.5, gutsDown: 40, critBonus: 0.04, effect: 'confuse_30', desc: '投げキッスに込めた魅了の力で相手の闘志を大きく削ぐ。相手GUTS-40。さらに命中した場合、うっとりと心を奪われ30%の確率で相手を混乱状態にする（混乱中は毎ターン40%の確率で意味不明になり行動できなくなり、30%の確率で混乱が解除される）' },
    pixie_highkick: { name: 'ハイキック', aura: null, cost: 20, type: 'pow', hitRate: 66, force: 1.5, gutsDown: 9, critBonus: 0, effect: 'selfcrit_up_3', desc: '高く跳び上がり繰り出す鋭い蹴り技。相手GUTS-9。さらに命中した場合、闘志が高まり自身のクリティカル率が25%アップする（3回まで重複可・交代するまで持続）' },
    pixie_van: { name: 'バン', aura: 'red', cost: 34, type: 'int', hitRate: 66, force: 2.3, gutsDown: 25, critBonus: 0.16, effect: 'hitdown_stack_3', desc: '気合の声とともに放つ強烈な衝撃波。相手GUTS-25。さらに命中した場合、衝撃波の余波で相手の視界が乱れ命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    pixie_gigaray: { name: 'ギガレイ', aura: null, cost: 30, type: 'int', hitRate: 66, force: 1.9, gutsDown: 14, critBonus: 0.24, effect: 'next_force_up', desc: 'レイをさらに巨大化させた極大の光線。相手GUTS-14。さらに命中した場合、収束させた力が残り、自身が次に繰り出す技の威力が50%アップする' },
    pixie_healraid: { name: 'ヒールレイド', aura: 'red', cost: 30, type: 'pow', hitRate: 58, force: 2.3, gutsDown: 32, critBonus: 0.08, effect: 'self_heal_15pct', desc: '回復の光をまとった体当たりで相手に迫る。相手GUTS-32。さらに命中した場合、癒しの波動で自身のライフを15%回復する' },
    pixie_bigbang: { name: 'ビッグバン', aura: 'red', cost: 38, type: 'int', hitRate: 66, force: 2.7, gutsDown: 32, critBonus: 0.20, effect: 'weaken_pow_int', desc: '全エネルギーを解き放つ大爆発。相手GUTS-32。さらに命中した場合、爆風により相手の「ちから」「かしこさ」が10%低下する（3回まで重複可・交代するまで持続）' },
    pixie_astralray: { name: 'アストラルレイ', aura: null, cost: 52, type: 'int', hitRate: 74, force: 3.2, gutsDown: 5, critBonus: 0.24, effect: 'perma_dmg_up_20', desc: '星々の力を凝縮し解き放つ、この上ない最大の切り札。相手GUTS-5。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ザン系統 ---
    zan_mirage_shift: { name: 'ミラージュシフト', aura: 'yellow', cost: 21, type: 'pow', hitRate: 82, force: 1.5, gutsDown: 5, critBonus: 0.14, effect: null, desc: '残像を残すほどの速さで間合いを詰め斬りつける基本技。相手GUTS-5' },
    zan_single_shot: { name: 'シングルショット', aura: null, cost: 20, type: 'pow', hitRate: 82, force: 1.9, gutsDown: 5, critBonus: 0.08, effect: null, desc: '一撃必殺を狙って放つ鋭い斬撃。相手GUTS-5' },
    zan_leg_arc: { name: 'レッグアーク', aura: null, cost: 23, type: 'pow', hitRate: 70, force: 1.15, gutsDown: 25, critBonus: 0.12, effect: 'dot_mine', desc: '低く沈み込み脚を薙ぎ払う斬撃。相手GUTS-25。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える' },
    zan_stunner_blitz: { name: 'スタナーブリッツ', aura: 'yellow', cost: 26, type: 'int', hitRate: 82, force: 1.9, gutsDown: 25, critBonus: 0.08, effect: 'stun_debuff_once', desc: '電光のような一閃で相手の体勢を崩す。相手GUTS-25。さらに命中した場合、相手の命中率を10%、丈夫さを15%下げる（バトル終了まで持続・重複不可）' },
    zan_ohzantou: { name: '王惨刀', aura: 'green', cost: 19, type: 'pow', hitRate: 86, force: 1.5, gutsDown: 5, critBonus: 0.24, effect: 'dot_mine', desc: '王の名を冠する惨たらしい一刀。相手GUTS-5。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える' },
    zan_double_summer: { name: 'ダブルサマー', aura: null, cost: 28, type: 'pow', hitRate: 74, force: 2.1, gutsDown: 5, critBonus: 0.16, effect: 'dot_mine', desc: '二段構えで振り抜く豪快な斬撃。相手GUTS-5。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える' },
    zan_meteor_drive: { name: 'メテオドライブ', aura: 'red', cost: 35, type: 'pow', hitRate: 74, force: 1.9, gutsDown: 14, critBonus: 0.24, effect: 'dot_mine_hitdown10_3t', desc: '隕石の如く撃ち込む渾身の突進斬り。相手GUTS-14。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与え、さらに3ターンの間相手の命中率を10%下げる' },
    zan_assault_dance: { name: 'アサルトダンス', aura: 'red', cost: 27, type: 'pow', hitRate: 82, force: 1.7, gutsDown: 9, critBonus: 0.14, effect: null, useEffect: 'self_atk_up_stack3', desc: '舞うように連続で斬りかかりながら闘気を練り上げる。相手GUTS-9。技を繰り出すたびに自身の攻撃ステータスが10%上昇する（3回まで重複可）' },
    zan_assault_raid: { name: 'アサルトレイド', aura: null, cost: 44, type: 'pow', hitRate: 90, force: 2.5, gutsDown: 14, critBonus: 0.16, effect: 'dot_mine', desc: '怒涛の連続斬撃で相手を切り刻む。相手GUTS-14。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える' },
    zan_rising_rave: { name: 'ライジングレイヴ', aura: 'yellow', cost: 42, type: 'pow', hitRate: 82, force: 2.7, gutsDown: 40, critBonus: 0.24, effect: 'dot_mine_aura_bonus', desc: '闘気を纏いながら斬り上げる渾身の一撃。相手GUTS-40。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与える。オーラ相性が有利な場合、継続ダメージがさらに8%上乗せされる' },
    zan_axis_bullet: { name: 'アクシズバレット', aura: 'red', cost: 50, type: 'pow', hitRate: 66, force: 2.3, gutsDown: 9, critBonus: 0.28, effect: 'dot_mine_def_down10', desc: '回転を加えて撃ち込む貫通力の高い斬撃。相手GUTS-9。さらに命中した場合、3ターンの間相手の最大ライフ8%の継続ダメージを与え、さらに3ターンの間相手の丈夫さを10%低下させる' },
    zan_dark_haunt: { name: 'ダークホウスト', aura: null, cost: 48, type: 'pow', hitRate: 95, force: 2.7, gutsDown: 5, critBonus: 0.22, effect: 'dot_mine', dotPct: 0.14, desc: '闇の力を宿した渾身の一刀両断。相手GUTS-5。さらに命中した場合、3ターンの間相手の最大ライフ14%の継続ダメージを与える' },
    zan_makibishi: { name: 'まきびし', aura: null, cost: 20, type: 'hazard', hitRate: 100, force: 0, gutsDown: 0, noDamage: true, effect: 'stealth_rock', logVerb: 'まきびしを設置した', desc: '相手フィールド上に鋭いまきびしをばら撒く。相手はモンスターを交代して繰り出すたびに、最大ライフの1/8のダメージを受けるようになる（一度設置すると、バトルが終わるまでずっと効果が持続する）。' },
    zan_migawari_no_jutsu: { name: 'みがわりの術', aura: null, cost: 40, type: 'substitute', hitRate: 100, force: 0, gutsDown: 0, selfDamagePct: 0.2, desc: '自身の身代わりとなる分身を作り出し、自身への攻撃を2回防ぐ。発動時、自身も最大ライフの20%のダメージを受ける。モンスターを交換しても身代わりの分身は場に残り続ける。' }
};

// --- ステータス獲得逓減システム (Diminishing Returns) ---
function getDiminishedVal(currentVal, baseVal) {
    let result = baseVal;
    if (currentVal >= 250) {
        result = Math.ceil(baseVal * 0.25); // 250以上は成長量25%に激減
    } else if (currentVal >= 180) {
        result = Math.ceil(baseVal * 0.5);  // 180以上は成長量50%に半減
    } else if (currentVal >= 120) {
        result = Math.ceil(baseVal * 0.75); // 120以上は成長量75%
    }
    return Math.max(1, result); // 最低でも必ず1は成長する
}

// --- ガッツ補正計算ヘルパー ---
// --- ガッツによる命中率補正の強さ（調整しやすいようにここで定数化） ---
// ガッツ50を基準(0)として、ガッツが上下すると命中率が ±(このぶん)%まで変動する。
// 例: 0.3なら ガッツ0で-15%〜ガッツ100で+15%、0.15ならガッツ0で-7.5%〜ガッツ100で+7.5%（変動が緩やかになる）
const GUTS_HIT_RATE_MOD_COEFFICIENT = 0.15;

function getGutsModifiers(guts) {
    // 攻撃側のガッツが50を基準(1.0)とする
    // ガッツ0で最低補正(ダメージ0.5倍)、ガッツ100で最高補正(ダメージ1.5倍)
    // 命中率補正は GUTS_HIT_RATE_MOD_COEFFICIENT の強さで変動（上記コメント参照）
    const base = 50;
    const diff = guts - base;
    
    const dmgMod = 1.0 + (diff * 0.01); // 0.5倍 〜 1.5倍
    const hitMod = diff * GUTS_HIT_RATE_MOD_COEFFICIENT;
    
    return { dmgMod, hitMod };
}

// --- ガッツ防御（被ダメージ軽減）計算ヘルパー (本家再現) ---
function getGutsDefenseModifier(guts) {
    // 防御側のガッツ量に応じた被ダメージ倍率を算出
    // ガッツ100（最大値）：受けるダメージを50%軽減（0.5倍）
    // ガッツ50（通常）：受けるダメージは等倍（1.0倍）
    // ガッツ0（枯渇）：受けるダメージが1.5倍に激増
    const base = 50;
    const diff = guts - base;
    return 1.0 - (diff * 0.01); // 0.5倍（ガッツ100）〜 1.5倍（ガッツ0）
}

// --- 丈夫さによるガッツダウン軽減計算ヘルパー ---
// 丈夫さ(def)が高いほど、受けるガッツダウン量を逓減方式で軽減する（下限は無し＝完全ゼロにはならない）。
// def=0 で軽減なし(倍率1.0)、defが増えるほど倍率が緩やかに1.0未満へ近づいていく。
// 例: def=40 → 約0.83倍(-17%) / def=65 → 約0.75倍(-25%) / def=150 → 約0.57倍(-43%)
function getGutsDownMitigation(defStat) {
    const def = Math.max(0, defStat || 0);
    return 100 / (100 + def * 0.5);
}

// --- ダメージランク判定ヘルパー ---
function getDamageRank(force, type) {
    if (type === 'heal' || type === 'buff_guts' || type === 'buff_pow' || type === 'hazard') return 'G';
    if (force >= 3.0) return 'S+';
    if (force >= 2.5) return 'S';
    if (force >= 2.0) return 'A';
    if (force >= 1.8) return 'B+';
    if (force >= 1.6) return 'B';
    if (force >= 1.3) return 'C';
    if (force >= 1.21) return 'D+';
    if (force >= 1.0) return 'D';
    if (force >= 0.7) return 'E';
    if (force >= 0.3) return 'F';
    return 'G';
}

// --- 技の種別に応じたボタン配色を返す共通ヘルパー ---
// masmon_battle.js / masmon_realtime_battle.js の技一覧ボタン描画から呼び出される。
function getSkillStyle(sk) {
    const type = (sk && sk.type) || '';
    if (type === 'int') {
        return {
            bgClass: 'bg-blue-950/40 hover:bg-blue-900/60',
            borderClass: 'border-blue-700',
            textClass: 'text-blue-200',
            textIntensity: 'text-blue-300'
        };
    }
    if (type === 'heal') {
        return {
            bgClass: 'bg-green-950/40 hover:bg-green-900/60',
            borderClass: 'border-green-700',
            textClass: 'text-green-200',
            textIntensity: 'text-green-300'
        };
    }
    if (type.startsWith('buff')) {
        return {
            bgClass: 'bg-yellow-950/40 hover:bg-yellow-900/60',
            borderClass: 'border-yellow-700',
            textClass: 'text-yellow-200',
            textIntensity: 'text-yellow-300'
        };
    }
    if (type === 'substitute') {
        return {
            bgClass: 'bg-pink-950/40 hover:bg-pink-900/60',
            borderClass: 'border-pink-700',
            textClass: 'text-pink-200',
            textIntensity: 'text-pink-300'
        };
    }
    if (type === 'hazard') {
        return {
            bgClass: 'bg-stone-800/60 hover:bg-stone-700/70',
            borderClass: 'border-stone-500',
            textClass: 'text-stone-200',
            textIntensity: 'text-stone-300'
        };
    }
    // 'pow'（ちから技）およびそれ以外はデフォルトで赤系
    return {
        bgClass: 'bg-red-950/40 hover:bg-red-900/60',
        borderClass: 'border-red-700',
        textClass: 'text-red-200',
        textIntensity: 'text-red-300'
    };
}

// --- ドレイン系技の自己回復量を計算する共通ヘルパー（与えたダメージの20%）---
// 育成中バトル／マスモンCPU対戦／リアルタイム対戦の3系統から共通で呼び出す。
// ライフフィールドの構造（stats.life か life か）が系統ごとに異なるため、
// 回復量の計算のみ共通化し、実際にライフへ加算する処理は各呼び出し側で行う。
function getDrainHealAmount(sk, damageDealt) {
    if (!sk || sk.effect !== 'drain_heal' || !damageDealt || damageDealt <= 0) return 0;
    const pct = (typeof sk.drainPct === 'number') ? sk.drainPct : 0.2;
    return Math.max(1, Math.floor(damageDealt * pct));
}

// --- ゲルの「マナドレイン」用ヘルパー：相手から実際に奪ったガッツ量分だけ自身のガッツを回復する ---
function getGutsDrainAmount(sk, actualGutsDown) {
    if (!sk || sk.effect !== 'guts_drain' || !actualGutsDown || actualGutsDown <= 0) return 0;
    return actualGutsDown;
}

// =====================================================
// 新規状態効果ヘルパー（モノリスの技「わらわら」「サケビ声」「オーロラゲート」用）
// 育成中バトル(game.js)／マスモンCPU対戦(masmon_battle.js)／
// リアルタイム対戦(masmon_realtime_battle.js) の3系統から共通で利用する。
// 対象ユニットは isWeakened / isConfused / forceBoost の3フィールドを持つ前提。
// =====================================================

// --- 技が命中した際の追加効果（衰弱／混乱／次技威力アップ）を適用する ---
// caster: 技を撃った側のユニット, target: 技を受けた側のユニット, sk: 実効技データ（force/hitRate反映済み）
// 戻り値: 追加効果のログメッセージ配列
function applySkillOnHitEffect(caster, target, sk) {
    const logs = [];
    if (!sk || !sk.effect) return logs;

    if (sk.effect === 'ars_magna_self_up') {
        // アルスマグナ専用：命中時、自身のライフ以外の全ステータス（ちから・かしこさ・命中・丈夫さ・回避）を
        // 20%上昇させる（1回のみ・重複せず・交代するまで持続）
        if (caster.arsMagnaBuffActive) {
            logs.push({ short: `（${caster.name} には追加効果なし）`, detail: `（${caster.name} はすでにアルスマグナの効果を得ているため、追加の効果は発生しなかった）` });
        } else {
            caster.arsMagnaBuffActive = true;
            logs.push({ short: `✨ ${caster.name} の全ステータスが上昇した！`, detail: `✨ ${caster.name} は大いなる業に満たされた！（ライフ以外の全ステータスが20%上昇・交代するまで持続）` });
        }
    } else if (sk.effect === 'weaken_pow_int') {
        // 衰弱：命中時に「ちから」「かしこさ」を10%低下させる。1体につき3回まで重複可（交代するまで持続）。
        target.isWeakened = true;
        if ((target.weakenStacks || 0) >= 3) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに衰弱の効果が上限（3重複）に達しているため、追加の効果は発生しなかった）` });
        } else {
            target.weakenStacks = Math.min(3, (target.weakenStacks || 0) + 1);
            logs.push({ short: `💢 ${target.name} のちから・かしこさが低下した！`, detail: `💢 ${target.name} の「ちから」「かしこさ」が10%低下した！（累積${target.weakenStacks}/3・交代するまで持続）` });
        }
    } else if (sk.effect === 'confuse_30') {
        // 命中しても必ず混乱するわけではなく、30%の確率でのみ混乱状態になる。
        // 混乱状態は固定ターン数ではなく、毎ターン30%の確率で解除されるまで持続する。
        if (Math.random() < 0.3) {
            target.isConfused = true;
            logs.push({ short: `❓ ${target.name} は混乱状態になった！`, detail: `❓ ${target.name} は混乱状態になった！（毎ターン40%の確率で意味不明になり行動できなくなる。30%の確率で混乱が解除される）` });
        }
    } else if (sk.effect === 'next_force_up') {
        caster.forceBoost = 0.5;
        logs.push({ short: `✨ ${caster.name} の次の技の威力が上昇した！`, detail: `✨ ${caster.name} の次の技の威力が50%アップした！` });
    } else if (sk.effect === 'perma_dmg_up_20') {
        if (caster.permaForceBoostActive) {
            logs.push({ short: `（${caster.name} には追加効果なし）`, detail: `（${caster.name} はすでに永続ダメージアップの効果を得ているため、追加のダメージアップは発生しなかった）` });
        } else {
            caster.permaForceBoostActive = true;
            logs.push({ short: `✨ ${caster.name} の与えるダメージが上昇した！`, detail: `✨ ${caster.name} の全身に霊力が満ち、今後与えるダメージが1.2倍になった！（交代するまで持続）` });
        }
    } else if (sk.effect === 'grant_double_hit_next') {
        caster.doubleHitNext = true;
        logs.push({ short: `⚡ ${caster.name} は次の技が2回攻撃になる！`, detail: `⚡ ${caster.name} の体内に電光が満ち、次に繰り出す技が2回攻撃扱いになった！` });
    } else if (sk.effect === 'guaranteed_dodge_next') {
        caster.dodgeNextGuaranteed = true;
        logs.push({ short: `🌫️ ${caster.name} は次の攻撃を確実に回避する！`, detail: `🌫️ ${caster.name} は陽炎に包まれ、次の敵の攻撃を確実に回避する構えを取った！` });
    } else if (sk.effect === 'shield_self_20pct') {
        if (caster.shieldUsedThisBattle) {
            logs.push({ short: `（${caster.name} には追加効果なし）`, detail: `（${caster.name} の九重神眼はすでに使用済みのため、シールドは展開されなかった）` });
        } else {
            // ライフ構造の違い（stats.maxLife か maxLife か）を吸収して両対応させる
            const maxLifeVal = caster.stats ? caster.stats.maxLife : caster.maxLife;
            caster.shieldValue = Math.floor(maxLifeVal * 0.2);
            caster.shieldUsedThisBattle = true;
            logs.push({ short: `🛡️ ${caster.name} はシールドを展開した！`, detail: `🛡️ ${caster.name} は自身の最大ライフの20%（${caster.shieldValue}）に相当するシールドを展開した！（交代するまで再展開不可）` });
        }
    // ---------- 「ガッツファクトリー」新規種族技用の追加効果 ----------
    } else if (sk.effect === 'blind_2') {
        target.blindTurns = 2;
        logs.push({ short: `💨 ${target.name} の命中率が下がった！`, detail: `💨 ${target.name} は強烈な臭気で目が眩んだ！（2ターンの間、命中率が低下する）` });
    } else if (sk.effect === 'def_down_15') {
        // 以前は「命中すれば必ず3ターンの間-15%」だったが、
        // 「命中時30%の確率で発動・発動すれば交代するまで持続」という仕様に変更。
        // さらに、1体につき3回まで重複可能（1回につき丈夫さ-15%、最大45%まで累積）。
        if (Math.random() < 0.3) {
            if ((target.defDown15Stacks || 0) >= 3) {
                logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに防御崩しの効果が上限（3重複）に達しているため、追加の効果は発生しなかった）` });
            } else {
                target.defDown15Stacks = Math.min(3, (target.defDown15Stacks || 0) + 1);
                logs.push({ short: `💥 ${target.name} の丈夫さが低下した！`, detail: `💥 ${target.name} の防御が崩れた！（累積${target.defDown15Stacks}/3・1回につき丈夫さ15%低下、相手が交代するまでの間持続）` });
            }
        } else {
            logs.push({ short: `（${target.name} は堪えた！）`, detail: `（${target.name} は堪えて防御崩しを免れた）` });
        }
    } else if (sk.effect === 'def_down_15_perma') {
        // 超ローリンモッチ専用：def_down_15とは異なり、ターン経過で解除されず交代するまで持続する
        target.permaDefDownPct = Math.max(target.permaDefDownPct || 0, 15);
        logs.push({ short: `💥 ${target.name} の丈夫さが低下した！`, detail: `💥 ${target.name} の防御が崩れた！（相手が交代するまでの間、丈夫さが15%低下する）` });
    } else if (sk.effect === 'evasion_def_down_20') {
        // がん飛ばし専用：命中すれば必ず発動し、相手の回避と丈夫さを1回につき20%低下させる（3回まで重複可・交代するまで持続）
        if ((target.evasionDefDownStacks || 0) >= 3) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに回避・丈夫さ低下の効果が上限（3重複）に達しているため、追加の効果は発生しなかった）` });
        } else {
            target.evasionDefDownStacks = Math.min(3, (target.evasionDefDownStacks || 0) + 1);
            logs.push({ short: `💥 ${target.name} の回避・丈夫さが低下した！`, detail: `💥 ${target.name} の回避と丈夫さが下がった！（累積${target.evasionDefDownStacks}/3・1回につき回避・丈夫さがそれぞれ20%低下、相手が交代するまでの間持続）` });
        }
    } else if (sk.effect === 'spd_down_stage1') {
        // 粘液専用：命中すれば必ず発動し、相手の移動速度（回避）を1段階（1回につき10%）低下させる（3回まで重複可・交代するまで持続）
        if ((target.spdDownStacks || 0) >= 3) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに移動速度低下の効果が上限（3段階）に達しているため、追加の効果は発生しなかった）` });
        } else {
            target.spdDownStacks = Math.min(3, (target.spdDownStacks || 0) + 1);
            logs.push({ short: `🐌 ${target.name} の移動速度が下がった！`, detail: `🐌 ${target.name} の粘液にまみれ、移動速度が1段階下がった！（累積${target.spdDownStacks}/3段階・相手が交代するまでの間持続）` });
        }
    } else if (sk.effect === 'dot_mine') {
        target.dotTurns = (typeof sk.dotTurns === 'number') ? sk.dotTurns : 3;
        target.dotPct = (typeof sk.dotPct === 'number') ? sk.dotPct : 0.08;
        logs.push({ short: `🩸 ${target.name} は出血状態になった！`, detail: `🩸 ${target.name} は出血状態になった！（${target.dotTurns}ターンの間、毎ターン最大ライフの${Math.round(target.dotPct * 100)}%の継続ダメージを受ける）` });
    } else if (sk.effect === 'paralyze_25') {
        // 命中した時、25%の確率で相手をマヒさせる（発動すればバトル終了まで治らず、行動時に25%の確率で行動不能になり、移動速度が3段階低下する）
        if (Math.random() < 0.25) {
            if (target.isParalyzed) {
                logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでにマヒ状態のため、追加の効果は発生しなかった）` });
            } else {
                target.isParalyzed = true;
                logs.push({ short: `⚡ ${target.name} はマヒ状態になった！`, detail: `⚡ ${target.name} は感電しマヒ状態になった！（バトル終了まで治らず、25%の確率で行動不能になり、移動速度が3段階低下する）` });
            }
        } else {
            logs.push({ short: `（${target.name} は堪えた！）`, detail: `（${target.name} は堪えてマヒを免れた）` });
        }
    } else if (sk.effect === 'burn') {
        // やけど：バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受け続ける
        if (target.isBurned) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでにやけど状態のため、追加の効果は発生しなかった）` });
        } else {
            target.isBurned = true;
            logs.push({ short: `🔥 ${target.name} はやけど状態になった！`, detail: `🔥 ${target.name} はやけど状態になった！（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）` });
        }
    } else if (sk.effect === 'burn_30') {
        // やけど（命中時30%の確率で発動）：バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受け続ける
        if (Math.random() < 0.3) {
            if (target.isBurned) {
                logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでにやけど状態のため、追加の効果は発生しなかった）` });
            } else {
                target.isBurned = true;
                logs.push({ short: `🔥 ${target.name} はやけど状態になった！`, detail: `🔥 ${target.name} はやけど状態になった！（バトル終了まで治らず、毎ターン終了時に最大ライフの1/16のダメージを受ける）` });
            }
        } else {
            logs.push({ short: `（${target.name} は堪えた！）`, detail: `（${target.name} は堪えてやけどを免れた）` });
        }
    } else if (sk.effect === 'sleep_2') {
        // ねむり：2ターンの間、確率判定なしで必ず行動不能になる
        target.sleepTurns = 2;
        logs.push({ short: `💤 ${target.name} はねむり状態になった！`, detail: `💤 ${target.name} はねむり状態になった！（2ターンの間、眠り続けて行動不能になる）` });
    } else if (sk.effect === 'yawn_2') {
        // あくび：命中した時点では何も起こらず、対象が自身の行動ターンを2回消化した後に自動でねむり状態になる
        if (target.sleepTurns > 0 || target.yawnTurns > 0) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに眠気の予兆があるため、追加の効果は発生しなかった）` });
        } else {
            target.yawnTurns = 2;
            logs.push({ short: `🥱 ${target.name} は眠気を誘われた！`, detail: `🥱 ${target.name} は大きなあくびを見せられ、眠気を誘われた！（2ターン後にねむり状態になる）` });
        }
    } else if (sk.effect === 'poison') {
        // 猛毒：バトル終了まで治らず、ターン経過ごとに受けるダメージが最大ライフの1/16, 2/16…と増えていく（最大15/16）。
        // 交代するとダメージ量は1/16からやり直しになる（clearBattleStatModifiersOnSwitchで処理）。
        if (target.isPoisoned) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに猛毒状態のため、追加の効果は発生しなかった）` });
        } else {
            target.isPoisoned = true;
            target.poisonCounter = 0;
            logs.push({ short: `☠️ ${target.name} は猛毒状態になった！`, detail: `☠️ ${target.name} は猛毒状態になった！（バトル終了まで治らず、ターンが経過するごとに受けるダメージが最大ライフの1/16ずつ増えていく。交代すると1/16からやり直しになる）` });
        }
    } else if (sk.effect === 'poison_50') {
        // 猛毒（命中時50%の確率で発動）：バトル終了まで治らず、ターン経過ごとに受けるダメージが最大ライフの1/16, 2/16…と増えていく（最大15/16）。
        if (Math.random() < 0.5) {
            if (target.isPoisoned) {
                logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでに猛毒状態のため、追加の効果は発生しなかった）` });
            } else {
                target.isPoisoned = true;
                target.poisonCounter = 0;
                logs.push({ short: `☠️ ${target.name} は猛毒状態になった！`, detail: `☠️ ${target.name} は猛毒状態になった！（バトル終了まで治らず、ターンが経過するごとに受けるダメージが最大ライフの1/16ずつ増えていく。交代すると1/16からやり直しになる）` });
            }
        } else {
            logs.push({ short: `（${target.name} は堪えた！）`, detail: `（${target.name} は堪えて猛毒を免れた）` });
        }
    } else if (sk.effect === 'self_dizzy') {
        caster.blindTurns = Math.max(caster.blindTurns || 0, 1);
        logs.push({ short: `😵 ${caster.name} は目を回してしまった！`, detail: `😵 ${caster.name} は勢い余って目を回してしまった！（1ターンの間、自身の命中率が低下する）` });
    } else if (sk.effect === 'hitdown_stack_3') {
        target.hitDownStacks = Math.min(3, (target.hitDownStacks || 0) + 1);
        logs.push({ short: `🏜️ ${target.name} の命中率が低下した！`, detail: `🏜️ ${target.name} の命中率が低下した！（累積 ${target.hitDownStacks}/3 ・ 1回につき10%低下、交代するまで持続）` });
    } else if (sk.effect === 'selfcrit_up_3') {
        // 以前は「命中すれば必ず3ターンの間クリティカル率+25%」だったが、
        // ターン数による制限を撤廃し、1体につき3回まで重複可能な永続バフ（交代するまで持続）に変更。
        // （1回につきクリティカル率25%アップ、最大75%まで累積）
        if ((caster.critUpStacks || 0) >= 3) {
            logs.push({ short: `（${caster.name} には追加効果なし）`, detail: `（${caster.name} はすでにクリティカル率上昇の効果が上限（3重複）に達しているため、追加の効果は発生しなかった）` });
        } else {
            caster.critUpStacks = Math.min(3, (caster.critUpStacks || 0) + 1);
            logs.push({ short: `🔥 ${caster.name} のクリティカル率が上昇した！`, detail: `🔥 ${caster.name} は闘志を燃やした！（累積${caster.critUpStacks}/3・1回につきクリティカル率25%アップ、交代するまで持続）` });
        }
    } else if (sk.effect === 'self_heal_15pct') {
        const maxLifeVal = caster.stats ? caster.stats.maxLife : caster.maxLife;
        const healAmount = Math.floor(maxLifeVal * 0.15);
        caster.stats.life = Math.min(caster.stats.maxLife, caster.stats.life + healAmount);
        logs.push({ short: `💚 ${caster.name} のライフが回復した！`, detail: `💚 ${caster.name} は自身のライフを ${healAmount} 回復した！(現在: ${Math.floor(caster.stats.life)})` });
    // ---------- ザン専用の追加効果 ----------
    } else if (sk.effect === 'stun_debuff_once') {
        // スタナーブリッツ：命中率-10%・丈夫さ-15%をバトル終了まで付与する（1回のみ・重複不可）
        if (target.stunnerDebuffApplied) {
            logs.push({ short: `（${target.name} には追加効果なし）`, detail: `（${target.name} はすでにスタナーブリッツの効果を受けているため、追加の効果は発生しなかった）` });
        } else {
            target.stunnerDebuffApplied = true;
            target.permaHitDownPct = (target.permaHitDownPct || 0) + 10;
            target.permaDefDownPct = (target.permaDefDownPct || 0) + 15;
            logs.push({ short: `⚡ ${target.name} の体勢が崩れた！`, detail: `⚡ ${target.name} は体勢を大きく崩された！（交代するまで、命中率が10%・丈夫さが15%低下する）` });
        }
    } else if (sk.effect === 'dot_mine_hitdown10_3t') {
        // メテオドライブ：継続ダメージ＋3ターンの命中率-10%
        target.dotTurns = (typeof sk.dotTurns === 'number') ? sk.dotTurns : 3;
        target.dotPct = (typeof sk.dotPct === 'number') ? sk.dotPct : 0.08;
        target.hitDownTempTurns = 3;
        target.hitDownTempPct = 10;
        logs.push({ short: `☄️ ${target.name} は出血状態になった！`, detail: `☄️ ${target.name} は出血状態になった！（${target.dotTurns}ターンの間、毎ターン最大ライフの${Math.round(target.dotPct * 100)}%の継続ダメージを受け、さらに3ターンの間命中率が10%低下する）` });
    } else if (sk.effect === 'dot_mine_aura_bonus') {
        // ライジングレイヴ：継続ダメージ。オーラ有利時はさらに+8%上乗せ
        target.dotTurns = (typeof sk.dotTurns === 'number') ? sk.dotTurns : 3;
        let pct = (typeof sk.dotPct === 'number') ? sk.dotPct : 0.08;
        let auraMsg = '';
        if (isAuraAdvantageous(caster.aura, target.aura)) {
            pct += 0.08;
            auraMsg = '（オーラ相性が有利だったため、継続ダメージがさらに8%上乗せされた！）';
        }
        target.dotPct = pct;
        logs.push({ short: `🔥 ${target.name} は出血状態になった！`, detail: `🔥 ${target.name} は出血状態になった！（${target.dotTurns}ターンの間、毎ターン最大ライフの${Math.round(pct * 100)}%の継続ダメージを受ける）${auraMsg}` });
    } else if (sk.effect === 'flinch_50_1t') {
        // 黒ひざコンボ：命中した場合、次のターン相手は50%の確率で怯み行動に失敗する
        target.flinchTurns = Math.max(target.flinchTurns || 0, 1);
        logs.push({ short: `😨 ${target.name} は怯んでしまった！`, detail: `😨 ${target.name} は強烈な一撃に怯んでしまった！（次のターン、50%の確率で行動に失敗する）` });
    } else if (sk.effect === 'guts_recovery_down_10') {
        // さくら吹雪：命中した場合、相手の次のガッツ回復量を10減らす（次の回復1回分のみ）
        target.gutsRecoveryDownNext = (target.gutsRecoveryDownNext || 0) + 10;
        logs.push({ short: `🌸 ${target.name} の次のガッツ回復量が減少する！`, detail: `🌸 ${target.name} は次のガッツ回復量が10減少する状態になった！` });
    } else if (sk.effect === 'dot_mine_def_down10') {
        // アクシズバレット：継続ダメージ＋3ターンの丈夫さ-10%
        target.dotTurns = (typeof sk.dotTurns === 'number') ? sk.dotTurns : 3;
        target.dotPct = (typeof sk.dotPct === 'number') ? sk.dotPct : 0.08;
        target.defDownTurns = 3;
        target.defDownPct = 10;
        logs.push({ short: `🎯 ${target.name} は出血状態になった！`, detail: `🎯 ${target.name} は出血状態になった！（${target.dotTurns}ターンの間、毎ターン最大ライフの${Math.round(target.dotPct * 100)}%の継続ダメージを受け、さらに3ターンの間丈夫さが10%低下する）` });
    }
    return logs;
}

// --- 技を発動した時点（命中判定に関わらず）で即座に適用される自己強化効果 ---
// caster: 技を撃った側のユニット, sk: 実効技データ
// 現状は「アサルトダンス」（自身の攻撃ステータスが10%上昇、3回まで重複可）のみ対応
// 戻り値: 追加効果のログメッセージ配列
function applySkillOnUseEffect(caster, sk) {
    const logs = [];
    if (!sk || !sk.useEffect || !caster) return logs;

    if (sk.useEffect === 'self_atk_up_stack3') {
        caster.atkUpStacks = Math.min(3, (caster.atkUpStacks || 0) + 1);
        logs.push({ short: `💪 ${caster.name} の攻撃ステータスが上昇した！`, detail: `💪 ${caster.name} の攻撃ステータスが上昇した！（累積 ${caster.atkUpStacks}/3 ・ 1回につき10%アップ）` });
    } else if (sk.useEffect === 'self_def_up_stack3') {
        // トリオビームZ：技を繰り出すたびに自身の丈夫さが15%上昇する（3回まで重複可）
        caster.defUpStacks = Math.min(3, (caster.defUpStacks || 0) + 1);
        logs.push({ short: `🛡️ ${caster.name} の丈夫さが上昇した！`, detail: `🛡️ ${caster.name} の丈夫さが上昇した！（累積 ${caster.defUpStacks}/3 ・ 1回につき15%アップ）` });
    } else if (sk.useEffect === 'self_pow_int_up50_stack3') {
        // 桜の舞：技を繰り出すたびに自身のちから・かしこさが50%上昇する（3回まで重複可）
        caster.sakuraBuffStacks = Math.min(3, (caster.sakuraBuffStacks || 0) + 1);
        logs.push({ short: `🌸 ${caster.name} のちから・かしこさが上昇した！`, detail: `🌸 ${caster.name} のちから・かしこさが上昇した！（累積 ${caster.sakuraBuffStacks}/3 ・ 1回につき50%アップ）` });
    } else if (sk.useEffect === 'mystic_guard_stack3') {
        // 神秘の守り：技を繰り出すたびに自身の丈夫さが50%上昇し、毎ターンのガッツ回復量が+10される（3回まで重複可）
        caster.mysticGuardStacks = Math.min(3, (caster.mysticGuardStacks || 0) + 1);
        logs.push({ short: `✨ ${caster.name} は神秘の守りに包まれた！`, detail: `✨ ${caster.name} は神秘の守りに包まれた！（累積 ${caster.mysticGuardStacks}/3 ・ 1回につき丈夫さ50%アップ・ガッツ回復量+10）` });
    } else if (sk.useEffect === 'meiso') {
        // 瞑想：技を繰り出すたびに自身のかしこさ・命中が30%上昇し、丈夫さが10%低下する（3回まで重複可）。
        // さらに25%の確率で集中しすぎて自身がねむり状態になってしまう（2ターンの間行動不能）。
        caster.meisoStacks = Math.min(3, (caster.meisoStacks || 0) + 1);
        logs.push({ short: `🧘 ${caster.name} のかしこさ・命中が上昇した！`, detail: `🧘 ${caster.name} は瞑想して集中力を高めた！（累積 ${caster.meisoStacks}/3 ・ 1回につきかしこさ・命中30%アップ、丈夫さ10%ダウン）` });
        if (Math.random() < 0.25) {
            caster.sleepTurns = 2;
            logs.push({ short: `💤 ${caster.name} はねむり状態になった！`, detail: `💤 ${caster.name} は集中しすぎて、そのままねむり状態になってしまった！（2ターンの間、行動不能になる）` });
        }
    } else if (sk.useEffect === 'self_int_up50_stack3') {
        // 妖狐の祈り：技を繰り出すたびに自身のかしこさが50%上昇する（3回まで重複可）
        caster.youkoInoriStacks = Math.min(3, (caster.youkoInoriStacks || 0) + 1);
        logs.push({ short: `🦊 ${caster.name} のかしこさが上昇した！`, detail: `🦊 ${caster.name} のかしこさが上昇した！（累積 ${caster.youkoInoriStacks}/3 ・ 1回につき50%アップ）` });
    } else if (sk.useEffect === 'kenbu') {
        // 剣舞：技を繰り出すたびに自身のちから・命中が25%上昇する（3回まで重複可）
        caster.kenbuStacks = Math.min(3, (caster.kenbuStacks || 0) + 1);
        logs.push({ short: `💃 ${caster.name} のちから・命中が上昇した！`, detail: `💃 ${caster.name} は剣舞を舞い、心身を研ぎ澄ました！（累積 ${caster.kenbuStacks}/3 ・ 1回につきちから・命中25%アップ）` });
    } else if (sk.useEffect === 'nendo_gatame') {
        // ねんどがため：技を繰り出すたびに自身の丈夫さが80%上昇し、回避が10%低下する（3回まで重複可）
        caster.nendoGatameStacks = Math.min(3, (caster.nendoGatameStacks || 0) + 1);
        logs.push({ short: `🟤 ${caster.name} の丈夫さが上昇した！`, detail: `🟤 ${caster.name} は体を粘土のように硬化させた！（累積 ${caster.nendoGatameStacks}/3 ・ 1回につき丈夫さ80%アップ、回避10%ダウン）` });
    } else if (sk.useEffect === 'gobi_step') {
        // ゴビステップ：自身の回避を150%上昇させる
        caster.gobiStepActive = true;
        logs.push({ short: `💨 ${caster.name} の回避が上昇した！`, detail: `💨 ${caster.name} は軽やかなステップを踏んだ！回避が150%アップした！` });
    } else if (sk.useEffect === 'meteor_spd_up') {
        // メテオバースト：技を繰り出すたびに自身の回避（移動速度）ステータスが1段階上昇する（3回まで重複可）
        caster.spdUpStacks = Math.min(3, (caster.spdUpStacks || 0) + 1);
        logs.push({ short: `💫 ${caster.name} の回避ステータスが上昇した！`, detail: `💫 ${caster.name} の回避ステータスが上昇した！（累積 ${caster.spdUpStacks}/3 ・ 1回につき10%アップ）` });
    } else if (sk.useEffect === 'michizure_wait') {
        // みちづれ：このターンに相手の攻撃や状態異常で自身のライフが0になった場合、相手のライフも0にする
        caster.michizureActive = true;
        logs.push({ short: `💀 ${caster.name} はみちづれの構えを取った！`, detail: `💀 ${caster.name} はみちづれの構えを取った！（このターン、相手の攻撃や状態異常でライフが0になった場合、相手のライフも0になる）` });
    }
    return logs;
}

// --- シールド（九重神眼等）による被ダメージ吸収を適用する共通ヘルパー ---
// defender: shieldValueフィールドを持つユニット, damage: 吸収前のダメージ量
// 戻り値: { finalDamage: シールド適用後のダメージ, absorbed: 吸収された量 }
function applyShieldAbsorption(defender, damage) {
    if (!defender || !defender.shieldValue || defender.shieldValue <= 0 || damage <= 0) {
        return { finalDamage: damage, absorbed: 0 };
    }
    const absorbed = Math.min(defender.shieldValue, damage);
    defender.shieldValue -= absorbed;
    return { finalDamage: damage - absorbed, absorbed };
}

// --- そのユニットの行動ターン開始時に呼び出す：各種状態異常の残ターン消化と行動失敗判定 ---
// 戻り値: {
//   confused: true/false,
//   failReason: 'sleep'|'confuse'|'paralyze'|'flinch'|null,
//   dotDamage: 数値（出血・やけど・猛毒の合計。実際にライフへ反映する処理は各バトルエンジン側で行う）,
//   bleedDamage / burnDamage / poisonDamage: 内訳（個別にログ表示するため）
// }
//   confused=true の場合、そのターンは状態異常により行動失敗（failReasonで原因を判別できる）
function tickStatusTurnsAndCheckConfusion(unit) {
    if (!unit) return { confused: false, failReason: null, dotDamage: 0, bleedDamage: 0, burnDamage: 0, poisonDamage: 0 };

    const maxLifeVal = unit.stats ? unit.stats.maxLife : unit.maxLife;

    // 出血（まっぷたつ・地雷針等）：指定ターンの間、最大ライフの一定割合の継続ダメージ
    let bleedDamage = 0;
    if (unit.dotTurns > 0) {
        bleedDamage = Math.max(1, Math.floor((maxLifeVal || 0) * (unit.dotPct || 0.08)));
        unit.dotTurns--;
    }

    // やけど：治るまでターン数の制限なく、毎ターン終了時に最大ライフの1/16のダメージを受け続ける
    let burnDamage = 0;
    if (unit.isBurned) {
        burnDamage = Math.max(1, Math.floor((maxLifeVal || 0) / 16));
    }

    // 猛毒：ターンが経過するごとに最大ライフの1/16, 2/16…と受けるダメージが増えていく（最大15/16）。
    // 交代するとダメージ量は1/16からやり直しになる（clearBattleStatModifiersOnSwitchでリセット）。
    let poisonDamage = 0;
    if (unit.isPoisoned) {
        unit.poisonCounter = Math.min(15, (unit.poisonCounter || 0) + 1);
        poisonDamage = Math.max(1, Math.floor((maxLifeVal || 0) * unit.poisonCounter / 16));
    }

    const dotDamage = bleedDamage + burnDamage + poisonDamage;

    // 衰弱（weaken_pow_int）はターン経過では解除されず、交代するまで持続する（clearBattleStatModifiersOnSwitchでリセット）。
    if (unit.defDownTurns > 0) unit.defDownTurns--;
    if (unit.blindTurns > 0) unit.blindTurns--;
    if (unit.hitDownTempTurns > 0) unit.hitDownTempTurns--;

    // ねむり・混乱（意味不明）・マヒ・怯み、いずれも行動失敗の原因になり得るが、
    // 表示するメッセージは実際に発生した原因を優先度順（ねむり→混乱→マヒ→怯み）で1つだけ選ぶ。
    let failReason = null;

    // あくび：命中してから自身の行動ターンを2回消化すると、自動的にねむり状態になる
    if (unit.yawnTurns > 0) {
        unit.yawnTurns--;
        if (unit.yawnTurns === 0 && !(unit.sleepTurns > 0)) {
            unit.sleepTurns = 2;
        }
    }

    // ねむり：2ターンの間、確率判定なしで必ず行動不能になる
    if (unit.sleepTurns > 0) {
        unit.sleepTurns--;
        failReason = 'sleep';
    }

    // 混乱：固定ターン数ではなく、毎ターン30%の確率で解除される。解除されなかった場合、40%の確率で意味不明になり行動失敗する。
    if (unit.isConfused) {
        if (Math.random() < 0.30) {
            unit.isConfused = false;
        } else if (Math.random() < 0.40 && !failReason) {
            failReason = 'confuse';
        }
    }
    // マヒ：ターンでは消化しない（試合終了まで治らない）。毎ターン25%の確率で行動不能になる。
    if (unit.isParalyzed) {
        if (Math.random() < 0.25 && !failReason) failReason = 'paralyze';
    }
    if (unit.flinchTurns > 0) {
        unit.flinchTurns--;
        if (Math.random() < 0.5 && !failReason) failReason = 'flinch';
    }

    return { confused: !!failReason, failReason, dotDamage, bleedDamage, burnDamage, poisonDamage };
}

// --- 出血／やけど／猛毒のダメージを種類ごとに個別のログ行として構築しつつ、実際にライフへ反映する ---
// tickStatusTurnsAndCheckConfusion() の戻り値（result）を受け取り、bleedDamage/burnDamage/poisonDamageを
// それぞれ🩸/🔥/☠️の別ログとして表示する。masmon_battle.js（stats.life）・masmon_realtime_battle.js（life）
// どちらのライフ構造にも対応できるよう、getLife/setLifeで読み書きを吸収する。
// 戻り値: ログ文字列の配列（0件の場合は空配列）
function applyDotDamageAndBuildLogs(name, result, getLife, setLife) {
    const logs = [];
    if (!result) return logs;
    const steps = [
        { amount: result.bleedDamage, emoji: '🩸', label: '出血' },
        { amount: result.burnDamage, emoji: '🔥', label: 'やけど' },
        { amount: result.poisonDamage, emoji: '☠️', label: '猛毒' },
    ];
    steps.forEach(step => {
        if (step.amount > 0) {
            const newLife = Math.max(0, getLife() - step.amount);
            setLife(newLife);
            const msg = `${step.emoji} ${name} は${step.label}ダメージで ${step.amount} のダメージを受けた！(現在: ${Math.floor(newLife)})`;
            logs.push({ short: msg, detail: msg });
        }
    });
    return logs;
}

// --- みちづれ：発動中の相手を戦闘不能にした側を道連れにする ---
// unit: ライフが0になった当事者（みちづれを発動していたかもしれない側）
// opponent: そのダメージ・状態異常の原因となった相手
// getOpponentLife/setOpponentLife: opponent側のライフ読み書き（stats.lifeかlifeかの構造差を吸収）
// 戻り値: 発動時はログ文字列、発動しなければnull
function checkMichizureTrigger(unit, opponent, getUnitLife, getOpponentLife, setOpponentLife) {
    if (!unit || !opponent) return null;
    if (!unit.michizureActive) return null;
    if (getUnitLife() > 0) return null;
    unit.michizureActive = false;
    if (getOpponentLife() <= 0) return null; // 既に相手も戦闘不能の場合は何もしない
    setOpponentLife(0);
    return `💥 ${unit.name} の「みちづれ」が発動！ ${opponent.name} のライフも0になった！`;
}

// --- 衰弱状態を加味した実効ステータス値（ちから／かしこさ）を返す ---
// 1回につき10%低下、3回まで重複可（最大30%低下）。旧isWeakenedのみが立っている
// （重複導入前のセーブ状態等）場合は1回分として扱う。
function getWeakenedStat(unit, statVal) {
    if (!unit) return statVal;
    const stacks = (typeof unit.weakenStacks === 'number' && unit.weakenStacks > 0)
        ? unit.weakenStacks
        : (unit.isWeakened ? 1 : 0);
    if (stacks > 0) {
        return Math.floor(statVal * (1 - stacks * 0.1));
    }
    return statVal;
}

// --- 防御崩し状態（地震・地雷針・スタナーブリッツ等）を加味した実効「丈夫さ」を返す ---
function getDefDownStat(unit, defVal) {
    if (!unit) return defVal;
    let val = defVal;
    if (unit.defDownTurns > 0) {
        const pct = (typeof unit.defDownPct === 'number') ? unit.defDownPct : 15;
        val = val * (1 - pct / 100);
    }
    if (unit.permaDefDownPct) {
        val = val * (1 - unit.permaDefDownPct / 100);
    }
    // def_down_15：命中時30%の確率で発動する防御崩し。1回につき丈夫さ15%低下、3回まで重複可（交代するまで持続）
    if (unit.defDown15Stacks > 0) {
        val = val * (1 - unit.defDown15Stacks * 0.15);
    }
    // 瞑想：自身の丈夫さが1回につき10%低下する（3回まで重複可・交代するまで持続）
    if (unit.meisoStacks > 0) {
        val = val * (1 - unit.meisoStacks * 0.1);
    }
    // がん飛ばし：命中時、回避と丈夫さを1回につき20%低下させる（3回まで重複可・交代するまで持続）
    if (unit.evasionDefDownStacks > 0) {
        val = val * (1 - unit.evasionDefDownStacks * 0.2);
    }
    return Math.floor(val);
}

// --- がん飛ばし・ねんどがため等による回避増減を加味した実効「回避（spd）」を返す ---
// opponent: 指定された場合、getAuraMonClassStatMultiplier() による自身のオーラ／モン類 有利ボーナスを併せて反映する
function getEvasionStat(unit, spdVal, opponent) {
    if (!unit) return spdVal;
    let val = spdVal;
    if (unit.evasionDefDownStacks > 0) {
        val = val * (1 - unit.evasionDefDownStacks * 0.2);
    }
    if (unit.nendoGatameStacks > 0) {
        val = val * (1 - unit.nendoGatameStacks * 0.1);
    }
    // ゴビステップ：自身の回避を150%上昇させる
    if (unit.gobiStepActive) {
        val = val * 2.5;
    }
    // メテオバースト等：自身の回避（移動速度）ステータスが1段階上昇（1回につき10%、最大3回）
    if (unit.spdUpStacks > 0) {
        val = val * (1 + unit.spdUpStacks * 0.1);
    }
    // 粘液等：相手の回避（移動速度）ステータスが1段階低下（1回につき10%、最大3回・交代するまで持続）
    if (unit.spdDownStacks > 0) {
        val = val * (1 - unit.spdDownStacks * 0.1);
    }
    // アルスマグナ：命中時、自身のライフ以外の全ステータスが20%上昇（1回のみ・交代するまで持続）
    if (unit.arsMagnaBuffActive) {
        val = val * 1.2;
    }
    if (opponent) {
        val = val * getAuraMonClassStatMultiplier(unit, opponent);
    }
    return Math.floor(val);
}

// --- 目眩まし状態（おなら・自滅めまい等）、累積命中低下（砂かけ等）、
//     一時的な命中低下（メテオドライブ等）、永続命中低下（スタナーブリッツ等）による命中率補正（マイナス値）を返す ---
function getBlindHitPenalty(unit) {
    if (!unit) return 0;
    const blindPenalty = (unit.blindTurns > 0) ? 15 : 0;
    const stackPenalty = (unit.hitDownStacks || 0) * 10;
    const tempPenalty = (unit.hitDownTempTurns > 0) ? (unit.hitDownTempPct || 0) : 0;
    const permaPenalty = unit.permaHitDownPct || 0;
    return blindPenalty + stackPenalty + tempPenalty + permaPenalty;
}

// --- 自己強化状態（アサルトダンス等）を加味した実効攻撃ステータス（ちから／かしこさ）を返す ---
// statKind: 'pow' または 'int'（省略時は両方に効く旧来のバフのみ適用）。
// 瞑想（meisoStacks）はかしこさ（int）にのみ効果があるため、statKindがintの場合のみ加算する。
// opponent: 指定された場合、getAuraMonClassStatMultiplier() による自身のオーラ／モン類 有利ボーナスを併せて反映する
function getBuffedAttackStat(unit, statVal, statKind, opponent) {
    if (!unit) return statVal;
    let mult = 1;
    if (unit.atkUpStacks > 0) mult += unit.atkUpStacks * 0.1;
    if (unit.sakuraBuffStacks > 0) mult += unit.sakuraBuffStacks * 0.5;
    if (statKind === 'pow' && unit.kenbuStacks > 0) mult += unit.kenbuStacks * 0.25;
    if (statKind === 'int' && unit.meisoStacks > 0) mult += unit.meisoStacks * 0.3;
    if (statKind === 'int' && unit.youkoInoriStacks > 0) mult += unit.youkoInoriStacks * 0.5;
    if (unit.arsMagnaBuffActive) mult += 0.2;
    if (opponent) mult *= getAuraMonClassStatMultiplier(unit, opponent);
    if (mult === 1) return statVal;
    return Math.floor(statVal * mult);
}

// --- 瞑想（meisoStacks）による命中ステータス上昇を加味した実効「命中」を返す ---
// opponent: 指定された場合、getAuraMonClassStatMultiplier() による自身のオーラ／モン類 有利ボーナスを併せて反映する
function getBuffedHitStat(unit, statVal, opponent) {
    if (!unit) return statVal;
    let mult = 1;
    if (unit.meisoStacks > 0) mult += unit.meisoStacks * 0.3;
    if (unit.kenbuStacks > 0) mult += unit.kenbuStacks * 0.25;
    if (unit.arsMagnaBuffActive) mult += 0.2;
    if (opponent) mult *= getAuraMonClassStatMultiplier(unit, opponent);
    if (mult === 1) return statVal;
    return Math.floor(statVal * mult);
}

// --- 自己強化状態（トリオビームZ・ねんどがため等）を加味した実効「丈夫さ」を返す ---
// opponent: 指定された場合、getAuraMonClassStatMultiplier() による自身のオーラ／モン類 有利ボーナスを併せて反映する
function getBuffedDefenseStat(unit, statVal, opponent) {
    if (!unit) return statVal;
    let mult = 1;
    if (unit.defUpStacks > 0) mult += unit.defUpStacks * 0.15;
    if (unit.nendoGatameStacks > 0) mult += unit.nendoGatameStacks * 0.8;
    if (unit.mysticGuardStacks > 0) mult += unit.mysticGuardStacks * 0.5;
    if (unit.arsMagnaBuffActive) mult += 0.2;
    if (opponent) mult *= getAuraMonClassStatMultiplier(unit, opponent);
    if (mult === 1) return statVal;
    return Math.floor(statVal * mult);
}

// --- ①②のオーラ／モン類有利ボーナスを「最大ライフ」にも反映する ---
// pow/int/hit/丈夫さ/回避と違い、ライフは技を出すたびに再計算する値ではなく持続する値のため、
// 「場に出た瞬間の相手」との相性で1回だけ判定し、以後は自分が交代して入れ替わるまで固定する
// （バトル開始時・自分/相手の交代時にmasmon_battle.js側から呼び出される）。
// unit.stats.baseMaxLife: 装備込みの元々の最大ライフ（このボーナスでは変更しない基準値。初回呼び出し時に自動保存される）
function applyAuraMonClassLifeBonus(unit, opponent) {
    if (!unit || !unit.stats || !opponent) return;
    if (unit.stats.baseMaxLife == null) unit.stats.baseMaxLife = unit.stats.maxLife;
    const mult = getAuraMonClassStatMultiplier(unit, opponent);
    const newMax = Math.max(1, Math.floor(unit.stats.baseMaxLife * mult));
    if (newMax === unit.stats.maxLife) return;
    // 現在のライフ割合を保った状態で最大ライフを増減させる（変化の瞬間に全回復/即死させたりしないため）
    const ratio = unit.stats.maxLife > 0 ? (unit.stats.life / unit.stats.maxLife) : 1;
    unit.stats.maxLife = newMax;
    unit.stats.life = Math.min(newMax, Math.max(1, Math.round(newMax * ratio)));
}

// --- 「神秘の守り」による毎ターンのガッツ回復量ボーナスを取得（1回につき+10、3回まで重複可） ---
function getSkillGutsRecoveryBonus(unit) {
    if (!unit || !unit.mysticGuardStacks) return 0;
    return unit.mysticGuardStacks * 10;
}

// --- 次技威力アップ（オーロラゲート等）を加味した実効forceを返し、フラグを消費する ---
function consumeForceBoost(unit, baseForce) {
    if (unit && unit.forceBoost > 0) {
        const boosted = baseForce * (1 + unit.forceBoost);
        unit.forceBoost = 0;
        return boosted;
    }
    return baseForce;
}

// --- 装備アイテムデータベース ---
// ガッツファクトリーのレンタルモンスター生成時にランダムで抽選・付与されるほか、
// PvP編成プリセット（js/pvp_preset.js）ではユーザーが自由に選択して装備させる。
// mode: 'normal' / 'hard' は抽選プールの区分（'both' は両方から抽選される）。
// type: 'stat'    -> statKey のステータスが range[0]～range[1] の間でランダムに上昇する
//       'special' -> 戦闘中に特殊効果 (effect) が発動する
// =====================================================
const EQUIPMENT_DB = {
    // ---------- ノーマルモード産 ----------
    ember_claw:      { id: 'ember_claw',      name: '炎の爪',          icon: '🔥', rarity: '★★☆', mode: 'normal', type: 'stat', statKey: 'pow',     range: [20, 25], desc: 'ちからが上昇する牙状の装備。' },
    aqua_scale:      { id: 'aqua_scale',      name: '水鱗のよろい',     icon: '💧', rarity: '★★☆', mode: 'normal', type: 'stat', statKey: 'def',     range: [18, 24], desc: '丈夫さが上昇する鱗のよろい。' },
    wind_charm:      { id: 'wind_charm',      name: '風切りのお守り',   icon: '🍃', rarity: '★★☆', mode: 'normal', type: 'stat', statKey: 'spd',     range: [15, 20], desc: '回避が上昇するお守り。' },
    sage_ring:       { id: 'sage_ring',       name: '賢者の指輪',       icon: '💍', rarity: '★★☆', mode: 'normal', type: 'stat', statKey: 'int',     range: [20, 25], desc: 'かしこさが上昇する指輪。' },
    hawk_eye_lens:   { id: 'hawk_eye_lens',   name: '鷹の目レンズ',     icon: '🔍', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'hit',     range: [15, 20], desc: '命中が上昇するレンズ。' },
    vital_amulet:    { id: 'vital_amulet',    name: '生命のお守り',     icon: '💗', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'maxLife', range: [30, 40], desc: '最大ライフが上昇するお守り。' },
    rough_gauntlet:  { id: 'rough_gauntlet',  name: '荒縄のガントレット', icon: '🥊', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'pow',     range: [10, 14], desc: 'ちからが少し上昇する簡素な籠手。' },
    stone_bangle:    { id: 'stone_bangle',    name: '石の腕輪',         icon: '🪨', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'def',     range: [10, 14], desc: '丈夫さが少し上昇する素朴な腕輪。' },
    clever_charm:    { id: 'clever_charm',    name: '知恵の首飾り',     icon: '📿', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'int',     range: [12, 16], desc: 'かしこさが少し上昇する首飾り。' },
    swift_anklet:    { id: 'swift_anklet',    name: '俊足のアンクレット', icon: '👟', rarity: '★☆☆', mode: 'normal', type: 'stat', statKey: 'spd',     range: [10, 14], desc: '回避が少し上昇するアンクレット。' },
    guardian_pendant:{ id: 'guardian_pendant',name: '守護のペンダント', icon: '🛡️', rarity: '★★★', mode: 'normal', type: 'special', effect: 'lifesaver', healPct: 0.3, desc: '残りライフが最大ライフの3割を切った時、1度だけ最大ライフの3割を回復する。' },

    // ---------- ハードモード産（ノーマルより強力・周回価値づけ） ----------
    dragon_fang:     { id: 'dragon_fang',     name: '竜牙の爪',        icon: '🐉', rarity: '★★★', mode: 'hard', type: 'stat', statKey: 'pow',     range: [30, 40], desc: 'ちからが大きく上昇する竜の牙。' },
    obsidian_armor:  { id: 'obsidian_armor',  name: '黒曜の鎧',        icon: '🗿', rarity: '★★★', mode: 'hard', type: 'stat', statKey: 'def',     range: [30, 38], desc: '丈夫さが大きく上昇する漆黒の鎧。' },
    phantom_veil:    { id: 'phantom_veil',    name: '幻影のヴェール',   icon: '🌫️', rarity: '★★★', mode: 'hard', type: 'stat', statKey: 'spd',     range: [28, 35], desc: '回避が大きく上昇するヴェール。' },
    archsage_crown:  { id: 'archsage_crown',  name: '大賢者の冠',       icon: '👑', rarity: '★★★', mode: 'hard', type: 'stat', statKey: 'int',     range: [32, 40], desc: 'かしこさが大きく上昇する冠。' },
    true_strike_lens:{ id: 'true_strike_lens',name: '真眼のレンズ',     icon: '🎯', rarity: '★★☆', mode: 'hard', type: 'stat', statKey: 'hit',     range: [25, 32], desc: '命中が大きく上昇するレンズ。' },
    titan_heart:     { id: 'titan_heart',     name: '巨神の心臓',       icon: '❤️', rarity: '★★★', mode: 'hard', type: 'stat', statKey: 'maxLife', range: [60, 80], desc: '最大ライフが大きく上昇する秘宝。' },
    iron_claw_shard: { id: 'iron_claw_shard', name: '鉄爪の欠片',       icon: '🦴', rarity: '★☆☆', mode: 'hard', type: 'stat', statKey: 'pow',     range: [18, 22], desc: 'ちからが上昇する鉄爪の欠片。' },
    cracked_scale:   { id: 'cracked_scale',   name: 'ひび割れた鱗',     icon: '🐍', rarity: '★☆☆', mode: 'hard', type: 'stat', statKey: 'def',     range: [16, 20], desc: '丈夫さが上昇するひび割れた鱗。' },
    phoenix_feather: { id: 'phoenix_feather', name: '不死鳥の羽根',     icon: '🪶', rarity: '★★★', mode: 'hard', type: 'special', effect: 'lifesaver', healPct: 0.4, desc: '残りライフが最大ライフの3割を切った時、1度だけ最大ライフの4割を回復する。' },

    // ---------- ハードモード専用★★★特殊効果装備 ----------
    guardian_ward:   { id: 'guardian_ward',   name: '護りの霊符',       icon: '🔰', rarity: '★★★', mode: 'hard', type: 'special', effect: 'gutsDownCut', cutRate: 0.3, desc: '被ガッツダウン量を3割カットする。' },
    crit_fang_charm: { id: 'crit_fang_charm', name: '牙獣のお守り',     icon: '🦷', rarity: '★★★', mode: 'hard', type: 'special', effect: 'critUp', critBonus: 0.35, desc: 'クリティカル率が大幅にアップする。' },
    berserker_core:  { id: 'berserker_core',  name: '闘魂の紅玉',       icon: '💢', rarity: '★★★', mode: 'hard', type: 'special', effect: 'lowLifeAtkUp', threshold: 0.5, bonusPct: 0.2, desc: '自身のライフが最大ライフの半分を切った時、攻撃ステータス（ちから・かしこさ）が20%アップする。' },
    fighting_spirit_core: { id: 'fighting_spirit_core', name: '闘気の勾玉', icon: '🔶', rarity: '★★★', mode: 'hard', type: 'special', effect: 'gutsRecoveryUp', gutsRecoveryBonus: 10, desc: '自ターン開始時のガッツ回復量が+10される。' },
    endurance_helm:  { id: 'endurance_helm',  name: '不屈の兜',         icon: '⛑️', rarity: '★★★', mode: 'hard', type: 'special', effect: 'endure', desc: 'ライフが0になるほどの攻撃を受けても、1度だけライフ1で持ちこたえる。' },
    haste_boots:     { id: 'haste_boots',     name: '韋駄天の靴',       icon: '👢', rarity: '★★★', mode: 'hard', type: 'special', effect: 'preemptiveStrike', chance: 0.25, desc: '移動速度に関わらず、25%の確率で先制攻撃できる。' },
    sprout_charm:    { id: 'sprout_charm',    name: '癒しの若葉',       icon: '🌱', rarity: '★★★', mode: 'hard', type: 'special', effect: 'turnRegen', healFraction: 1 / 16, desc: '自ターン開始時、最大ライフの1/16を回復する。' },
    deathmatch_weight:{ id: 'deathmatch_weight', name: '死闘の重錘',    icon: '⚫', rarity: '★★★', mode: 'hard', type: 'special', effect: 'recoilForceUp', lifeCostFraction: 1 / 10, forceMultiplier: 2, desc: '攻撃するたびに最大ライフの1/10のダメージを受けるが、技の威力が2倍になる。' },
    tortoise_shell:  { id: 'tortoise_shell',  name: '大亀の甲羅',       icon: '🐢', rarity: '★★★', mode: 'hard', type: 'special', effect: 'alwaysLast', desc: '必ず後攻になる。ただし、優先度のある技を使う場合はこの効果を受けない。' }
};

// --- 装備ベースデータ1件から実際の所持インスタンス（個体値ロール済み）を生成する共通ヘルパー ---
// ガッツファクトリー／PvPレンタルの段階別・ランダムプール抽選の両方から使う。
function buildEquipmentInstanceFromBase(base) {
    if (!base) return null;
    const instance = {
        instanceId: 'eq_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        equipId: base.id,
        acquiredAt: Date.now(),
        favoriteTags: { p1: false, p2: false, p3: false, p4: false, p5: false } // お気に入り登録（5パターン）
    };

    if (base.type === 'stat') {
        const [min, max] = base.range;
        instance.rolledValue = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    return instance;
}

// --- ステータスキーの日本語表示名（装備効果文言・図鑑等で共通利用） ---
function getStatLabel(key) {
    const labels = {
        maxLife: 'ライフ',
        pow: 'ちから',
        int: 'かしこさ',
        hit: '命中',
        spd: '回避',
        def: '丈夫さ'
    };
    return labels[key] || key;
}

// --- 装備インスタンスの表示名（レア度込み） ---
function getEquipmentDisplayName(instance) {
    const base = EQUIPMENT_DB[instance.equipId];
    if (!base) return '不明な装備';
    return `${base.name}（レア度${base.rarity}）`;
}

// --- 装備インスタンスの効果説明文（ランダム数値を反映） ---
function getEquipmentDisplayDesc(instance) {
    const base = EQUIPMENT_DB[instance.equipId];
    if (!base) return '';
    if (base.type === 'stat') {
        return `${getStatLabel(base.statKey)} +${instance.rolledValue} アップ`;
    }
    return base.desc;
}

// --- 装備がユニットのステータスに与えるボーナス（{pow,int,hit,spd,def,maxLife}）を取得 ---
function getEquipmentStatBonuses(instance) {
    const bonuses = { pow: 0, int: 0, hit: 0, spd: 0, def: 0, maxLife: 0 };
    if (!instance) return bonuses;
    const base = EQUIPMENT_DB[instance.equipId];
    if (!base || base.type !== 'stat') return bonuses;
    bonuses[base.statKey] = instance.rolledValue || 0;
    return bonuses;
}

// --- 装備の「被ガッツダウンカット」効果の軽減率（0〜1）を取得 ---
function getEquipmentGutsDownCutRate(unit) {
    if (!unit || !unit.equippedItem) return 0;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'gutsDownCut') return 0;
    return base.cutRate || 0;
}

// --- 装備の「クリティカル率アップ」効果のボーナス値（0〜1）を取得 ---
function getEquipmentCritBonus(unit) {
    if (!unit || !unit.equippedItem) return 0;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'critUp') return 0;
    return base.critBonus || 0;
}

// --- 技自体に設定された「クリティカル率」ボーナス値（0〜1）を取得 ---
// SKILLS_DB の各技に任意で critBonus フィールドを持たせられる（未設定は0=ボーナス無し）。
// 技を繰り出したその1回の判定にのみ加算される（selfcrit_up_3のような数ターン持続効果とは別枠）。
function getSkillCritBonus(sk) {
    if (!sk) return 0;
    return sk.critBonus || 0;
}

// --- 装備の「自身のライフが半分を切った時、攻撃ステータスアップ」効果の倍率を取得 ---
// ユニットのライフ構造差（stats.life か life か）を吸収して両対応させる。
function getEquipmentLowLifeAtkMultiplier(unit) {
    if (!unit || !unit.equippedItem) return 1;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'lowLifeAtkUp') return 1;

    const hasNestedStats = !!unit.stats;
    const life = hasNestedStats ? unit.stats.life : unit.life;
    const maxLife = hasNestedStats ? unit.stats.maxLife : unit.maxLife;
    if (!maxLife || life > maxLife * (base.threshold || 0.5)) return 1;

    return 1 + (base.bonusPct || 0);
}

// --- 装備の「ライフが0になる攻撃を受けても1度だけライフ1で耐える」効果の判定・適用 ---
// unit: equippedItem（装備インスタンス）と equipEnduranceUsed フラグを持つ想定。
// ダメージ処理で life を0まで減算した直後に呼び出すこと。
// 戻り値: 発動した場合のログメッセージ（未発動なら null）
function checkAndApplyEquipmentEnduranceEffect(unit) {
    if (!unit || !unit.equippedItem || unit.equipEnduranceUsed) return null;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'endure') return null;

    const hasNestedStats = !!unit.stats;
    const life = hasNestedStats ? unit.stats.life : unit.life;
    if (life > 0) return null; // ライフが0になっていなければ発動しない

    if (hasNestedStats) {
        unit.stats.life = 1;
    } else {
        unit.life = 1;
    }
    unit.equipEnduranceUsed = true;

    return `🛡️ ${unit.name} の【${base.name}】が発動！力尽きる寸前で、ライフ1で持ちこたえた！`;
}

// --- 装備の「移動速度に関わらず一定確率で先制攻撃できる」効果の発動確率（0〜1）を取得 ---
function getEquipmentPreemptiveChance(unit) {
    if (!unit || !unit.equippedItem) return 0;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'preemptiveStrike') return 0;
    return base.chance || 0;
}

// 先制攻撃効果が発動した際、行動順決定上の「実効移動速度」として扱う十分に大きな値
const EQUIPMENT_PREEMPTIVE_EFFECTIVE_SPEED = 9999;

// --- 装備の「必ず後攻になる（優先度のある技は除く）」効果を持つか判定 ---
function hasEquipmentAlwaysLastEffect(unit) {
    if (!unit || !unit.equippedItem) return false;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    return !!(base && base.effect === 'alwaysLast');
}

// 「必ず後攻」効果が適用された技の行動順優先度（通常技の優先度帯を大きく下回る値。
// 行動不能'none'の優先度(-99)は下回らないようにしておく）
const EQUIPMENT_ALWAYS_LAST_SKILL_PRIORITY = -50;

// --- 装備の「自ターン開始時、最大ライフの一定割合を回復する」効果を適用する ---
// unit: stats.life か life のどちらかを持つ想定。戻り値: 発動時のログ（未発動なら null）
function applyEquipmentTurnRegen(unit) {
    if (!unit || !unit.equippedItem) return null;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'turnRegen') return null;

    const hasNestedStats = !!unit.stats;
    const life = hasNestedStats ? unit.stats.life : unit.life;
    const maxLife = hasNestedStats ? unit.stats.maxLife : unit.maxLife;
    if (!maxLife || life <= 0 || life >= maxLife) return null;

    const healAmount = Math.max(1, Math.floor(maxLife * (base.healFraction || 0)));
    const newLife = Math.min(maxLife, life + healAmount);
    if (hasNestedStats) {
        unit.stats.life = newLife;
    } else {
        unit.life = newLife;
    }

    return `🌱 ${unit.name} の【${base.name}】が発動！ライフが ${newLife - life} 回復した！(現在: ${Math.floor(newLife)})`;
}

// --- 装備の「攻撃するたびにライフ消費・技威力アップ」効果の威力倍率を取得 ---
function getEquipmentRecoilForceMultiplier(unit) {
    if (!unit || !unit.equippedItem) return 1;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'recoilForceUp') return 1;
    return base.forceMultiplier || 1;
}

// --- 装備の「攻撃するたびにライフ消費・技威力アップ」効果によるライフ消費量を取得（未装備なら0） ---
function getEquipmentRecoilLifeCost(unit) {
    if (!unit || !unit.equippedItem) return 0;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'recoilForceUp') return 0;

    const hasNestedStats = !!unit.stats;
    const maxLife = hasNestedStats ? unit.stats.maxLife : unit.maxLife;
    if (!maxLife) return 0;
    return Math.max(1, Math.floor(maxLife * (base.lifeCostFraction || 0)));
}

// --- 装備の「自ターン開始時のガッツ回復量アップ」効果のボーナス値を取得 ---
function getEquipmentGutsRecoveryBonus(unit) {
    if (!unit || !unit.equippedItem) return 0;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'gutsRecoveryUp') return 0;
    return base.gutsRecoveryBonus || 0;
}

// --- 装備の特殊効果（残りライフ3割切りで1度だけ回復、等）判定・適用ヘルパー ---
// 育成中バトル／マスモンCPU対戦／リアルタイム対戦の3系統から共通で呼び出す。
// unit: equippedItem（装備インスタンス）と equipLifesaverUsed フラグを持つ想定。
// ライフフィールドの構造差（stats.life か life か）を吸収して両対応させる。
// 戻り値: 発動した場合のログメッセージ（未発動なら null）
function checkAndApplyEquipmentLifesaverEffect(unit) {
    if (!unit || !unit.equippedItem || unit.equipLifesaverUsed) return null;
    const base = EQUIPMENT_DB[unit.equippedItem.equipId];
    if (!base || base.effect !== 'lifesaver') return null;

    const hasNestedStats = !!unit.stats;
    const life = hasNestedStats ? unit.stats.life : unit.life;
    const maxLife = hasNestedStats ? unit.stats.maxLife : unit.maxLife;
    if (life <= 0 || life >= maxLife * 0.3) return null;

    const healAmount = Math.floor(maxLife * base.healPct);
    const newLife = Math.min(maxLife, life + healAmount);
    if (hasNestedStats) {
        unit.stats.life = newLife;
    } else {
        unit.life = newLife;
    }
    unit.equipLifesaverUsed = true;

    return `✨ ${unit.name} の【${base.name}】が発動！最大ライフの${Math.floor(base.healPct * 100)}%（${healAmount}）を回復した！`;
}

// =====================================================
// 「ガッツファクトリー」レンタルバトル用データ
// ・育成モードを介さず、あらかじめ用意されたレンタルモンスターを
//   6体提示→3体選出してパーティを組み、CPU/PvP問わず使用する。
// ・KIN_NEJIKI_SPECIES_POOL: 「6体提示」の抽選対象となる全12種族
// ・KIN_NEJIKI_SKILL_POOL: 各種族が使用できる固有技の候補（ここから4つをランダム抽選）
// =====================================================
const KIN_NEJIKI_SPECIES_POOL = ['mochi', 'suezo', 'dino', 'monolith', 'plant', 'kyubi', 'ham', 'arrowhead', 'nendoro', 'henger', 'durahan', 'golem', 'kawazumo', 'hinotori', 'gari', 'metalner', 'kijin', 'ghost', 'gel', 'ark', 'illumine', 'liger', 'pixie', 'zan'];

const KIN_NEJIKI_SKILL_POOL = {
    mochi:     ['sakuranomai', 'migawarimochi', 'gaccho', 'sakurafubuki', 'cho_rollinmochi', 'cho_mochihou', 'mossama', 'yaezakura'],
    suezo:     ['meiso', 'nameru', 'kamitsuki', 'kuu', 'psychokinesis', 'cho_netsushisen', 'utau', 'berobinta'],
    dino:      ['shippo', 'kamitsuki_dino', 'sunakake', 'kamitsukinage', 'honoo_taiatari', 'hizageri', 'kurohizacombo', 'stealth_rock'],
    monolith:  ['monotaore', 'warawara', 'sakebigoe', 'cho_monotaore', 'aurora_gate', 'sanren_attack', 'trio_beam_z', 'shinpi_no_mamori', 'choonpa'],
    plant:     ['renkon', 'tane_gun', 'kafun', 'combination_plant', 'tane_machinegun', 'flower_beam', 'face_drill', 'drain', 'doku_no_kona'],
    kyubi:     ['hikkaki', 'kagerou', 'kitsunebi', 'cho_kitsunebi', 'yuuwaku', 'kokonoe_shingan', 'tenga_tensho', 'akubi', 'youko_no_inori'],
    ham:       ['one_two_punch', 'sobat', 'atamatsuki', 'seoinage', 'cho_atamatsuki', 'machinegun_punch', 'onara', 'cho_ogoe'],
    arrowhead: ['tail_attack', 'zoom_punch', 'rocket_punch', 'needle_turn', 'w_needle_turn', 'tornado_attack', 'tail_blade', 'jiraibari'],
    nendoro:   ['zoom_punch_nendoro', 'mach_punch', 'meido_no_miyage', 'ganduke', 'body_press_nendoro', 'nagekiss_nendoro', 'nendo_gatame', 'youkaieki'],
    henger:    ['w_kick', 'laser_blade', 'laser_cutter', 'w_laser_sword', 'drill_rocket', 'w_drill_rocket', 'napalm_cannon'],
    durahan:   ['cho_dash_giri', 'midaretsuki', 'mappufutatsu', 'combo_punch', 'daisharin', 'fujinken', 'raijinken', 'kenbu'],
    golem:     ['dekopin', 'shoda', 'claw_nage', 'double_chop', 'guruguru_attack', 'nobiru_punch', 'jishin', 'stealth_rock'],
    kawazumo:  ['harite', 'gappuri_yotsu', 'uwatenage', 'kawazutsuki', 'renzoku_harite', 'tobi_harite', 'kaeru_no_shita', 'dai_kaiten_otoshi', 'kaeru_no_uta', 'bakudan_nage', 'nen_eki'],
    hinotori:  ['kuchibashi', 'renzoku_kagizume', 'flame_typhoon', 'otakebi', 'bakuretsu_otoshi', 'flame_line', 'flame_beam', 'fire_bird', 'fire_wave', 'ebony_nova'],
    gari:      ['knuckle', 'holy_fire', 'god_bless', 'press', 'hurricane', 'holy_earth', 'spin_cutter', 'straight', 'holy_icicle', 'big_spin_cutter', 'god_final'],
    metalner:  ['ponken', 'hidarite', 'sunkei', 'senkousho', 'tetsuzankou', 'double_shoda', 'twin_shoda', 'meta_beam', 'sho_henka', 'taikyoku_henka'],
    kijin:     ['zutsuki', 'onite', 'nagetobashi', 'onitsume', 'kijin_ranbu', 'chiretsuzan', 'onikokushou', 'ashura', 'rasetsu', 'rashomon'],
    ghost:     ['piko_hammer', 'taiatari', 'ohpunch', 'combination', 'odokasu', 'dokuro_beam', 'bikkuri_dokuro', 'card', 'ohki_otoshimono', 'ghost_flash', 'michizure'],
    gel:       ['tsukisashi', 'kushizashi', 'mana_drain', 'muchi', 'g_cube', 'gel_press', 'hae_tataki', 'parabola_beam', 'cho_parabola_beam', 'koma_attack', 'taihou', 'gel_copter'],
    ark:       ['waga_hitomi', 'sekai_wo_yurase', 'tobe_shinritsu_no_yaiba', 'shinkou_yo_kegare_wo_harae', 'ima_koso_shin_naru_mezame', 'aoki_ibara_yo_toga_wo_ugate', 'sabaki_no_hikari_yo_kudare', 'shuuen_ni_sukui_wo_ataeyo', 'shiten_no_tsurugi_yo_oritate', 'seiya_no_kane_yo_narihibike', 'inore_rinne_no_wa_yo', 'ten_no_jihi_yo_shimesareyo'],
    illumine:  ['plasma', 'shield_bash', 'straight_punch', 'venom_edge', 'assassin_claw', 'morning_star', 'arcana_flare', 'assault_arrow', 'buster_sword', 'ars_magna', 'blade_dance', 'requiem_end', 'mirage_claw', 'crimson_nova'],
    liger:     ['liger_hikkaki', 'liger_kamitsuki', 'body_slam', 'raigeki', 'one_two', 'reikidan', 'kagegeki', 'cho_raigeki', 'kuuchu_kaiten_attack', 'combination_liger', 'liger_raijinken', 'rakurai_kyoumei'],
    pixie:     ['pixie_harite', 'pixie_thunder', 'pixie_ray', 'pixie_lightning', 'pixie_megaray', 'pixie_nagekiss', 'pixie_highkick', 'pixie_van', 'pixie_gigaray', 'pixie_healraid', 'pixie_bigbang', 'pixie_astralray'],
    zan:       ['zan_mirage_shift', 'zan_single_shot', 'zan_leg_arc', 'zan_stunner_blitz', 'zan_ohzantou', 'zan_double_summer', 'zan_meteor_drive', 'zan_assault_dance', 'zan_assault_raid', 'zan_rising_rave', 'zan_axis_bullet', 'zan_dark_haunt', 'zan_makibishi', 'kenbu', 'zan_migawari_no_jutsu']
};

// =====================================================
// MONSTER_MOLDS: モンスターごとの「型」（技構成＋装備）データベース
// -----------------------------------------------------
// モンスター1種類につき最大7つの「型」を定義する。
// 各型は { skills: ['技名1', '技名2', ...], equipment: '装備名' または null } の形式。
// 技名・装備名は SKILLS_DB / EQUIPMENT_DB に登録されている「name」フィールドと
// 完全に一致する文字列を書くだけでよい（内部キーへの変換は自動で行われる）。
// ・上位の型（型3以降）の equipment は、必ず EQUIPMENT_DB 上で type: 'special'
//   （特殊効果装備）のものだけを指定する（ステータス強化装備は型1・型2のみ）。
//
// ・ガッツファクトリー（金ネジキ）では、セット数（＝今回の周回内の進行度）に応じて
//   1セットにつき型が1段階ずつ解放される（セット1→型1のみ …… セット7→型1〜型7すべて）。
//   （解放数は getMoldUnlockCountForSet で判定する）
// ・PvPレンタル対戦には「周回」の概念が無いため、常に型1〜7すべてが抽選対象になる。
//
// 【型を追加・変更したい場合】
//   下の配列に { skills: [...], equipment: '装備名' } を1つ追加・書き換えするだけでよい
//   （技は最大4つまで。装備は不要なら null にする）。
//
// ・dualStatType（MONSTER_TEMPLATESで dualStatType: true のフラグが立っている種族）：
//   ちから・かしこさが同程度の水準でバランスよく配置されているモンスターは、
//   桜の舞のようなバフをかけてもベースの数値が低く火力が伸びにくいという問題がある。
//   そこでこれらの種族だけは、型1〜7それぞれに「ちから特化型」「かしこさ特化型」の
//   2バリエーションを用意し、計14パターンを配列で並べる：
//     [型1ちから, 型1かしこさ, 型2ちから, 型2かしこさ, ... , 型7ちから, 型7かしこさ]
//   各パターンには statMod: { pow, int } を指定でき、pickMonsterMold経由で
//   種族ベースのpow/intステータスに乗算される（省略時は乗算なし＝1倍）。
//   これにより「型の番号＝周回進行に応じた強さの系統」「ちから/かしこさ＝個性の軸」を
//   直交させたまま、序盤の解放段階からでも両方の特化型に出会えるようにしている。
//   pickMonsterMold内部で dualStatType の種族だけ自動的に解放数・開始インデックスを
//   2倍にして扱うため、呼び出し側（kinnejiki.js / pvp_rental.js）の修正は不要。
// =====================================================
const MONSTER_MOLDS = {
    'モッチー': [
        // --- 型1：ちから特化型／かしこさ特化型 ---
        { skills: ['桜の舞', 'ガッチョ', 'もっさま', '八重ざくら'], equipment: '荒縄のガントレット', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', 'さくら吹雪', 'みがわり餅', '八重ざくら'], equipment: '知恵の首飾り', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型2：ちから特化型／かしこさ特化型 ---
        { skills: ['桜の舞', 'ガッチョ', '超ローリンモッチ', 'もっさま'], equipment: '竜牙の爪', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', 'さくら吹雪', '超もっち砲', '八重ざくら'], equipment: '大賢者の冠', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型3：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['桜の舞', '超ローリンモッチ', 'もっさま', 'みがわり餅'], equipment: '闘魂の紅玉', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', '超もっち砲', 'さくら吹雪', 'みがわり餅'], equipment: '守護のペンダント', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型4：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['桜の舞', '超ローリンモッチ', 'もっさま', '超もっち砲'], equipment: '死闘の重錘', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', '超もっち砲', 'さくら吹雪', '八重ざくら'], equipment: '不死鳥の羽根', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型5：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['桜の舞', 'もっさま', '超ローリンモッチ', 'みがわり餅'], equipment: '護りの霊符', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', 'さくら吹雪', '超もっち砲', 'みがわり餅'], equipment: '牙獣のお守り', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型6：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['桜の舞', 'ガッチョ', 'もっさま', '八重ざくら'], equipment: '闘気の勾玉', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', 'さくら吹雪', '超もっち砲', '八重ざくら'], equipment: '不屈の兜', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型7：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['桜の舞', '超ローリンモッチ', 'もっさま', 'みがわり餅'], equipment: '韋駄天の靴', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['桜の舞', '超もっち砲', 'さくら吹雪', '八重ざくら'], equipment: '癒しの若葉', statMod: { pow: 0.75, int: 1.25 } },
    ],
    'スエゾー': [
        { skills: ['瞑想', 'なめる', 'かみつき', '食う'], equipment: '鷹の目レンズ' },
        { skills: ['かみつき', '食う', '超熱視線', 'ベロビンタ'], equipment: '知恵の首飾り' },
        { skills: ['なめる', 'サイコキネシス', 'ベロビンタ', '超熱視線'], equipment: '護りの霊符' },
        { skills: ['サイコキネシス', '歌う', '食う', 'ベロビンタ'], equipment: '牙獣のお守り' },
        // --- 型5 ---
        { skills: ['超熱視線', '食う', 'ベロビンタ', 'かみつき'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['サイコキネシス', '食う', 'ベロビンタ', 'かみつき'], equipment: '闘魂の紅玉' },
        // --- 型7 ---
        { skills: ['サイコキネシス', '超熱視線', '食う', 'ベロビンタ'], equipment: '闘気の勾玉' },
    ],
    'ディノ': [
        { skills: ['しっぽ', 'かみつき', '砂かけ', 'かみつき投げ'], equipment: '荒縄のガントレット' },
        { skills: ['かみつき投げ', 'ひざげり', '砂かけ', '炎のたいあたり'], equipment: '鉄爪の欠片' },
        { skills: ['炎のたいあたり', 'ひざげり', 'かみつき投げ', '砂かけ'], equipment: '闘魂の紅玉' },
        { skills: ['黒ひざコンボ', '炎のたいあたり', 'かみつき投げ', 'ステルスロック'], equipment: '闘気の勾玉' },
        // --- 型5 ---
        { skills: ['炎のたいあたり', 'かみつき投げ', 'ひざげり', 'かみつき'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['黒ひざコンボ', 'かみつき投げ', 'ひざげり', 'かみつき'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['黒ひざコンボ', '炎のたいあたり', 'かみつき投げ', 'ひざげり'], equipment: '牙獣のお守り' },
    ],
    'モノリス': [
        // --- 型1：ちから特化型／かしこさ特化型 ---
        { skills: ['たおれこみ', 'わらわら', '超たおれこみ', '3連アタック'], equipment: '荒縄のガントレット', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['サケビ声', 'オーロラゲート', 'トリオビームZ'], equipment: '知恵の首飾り', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型2：ちから特化型／かしこさ特化型 ---
        { skills: ['わらわら', '超たおれこみ', '3連アタック', 'たおれこみ'], equipment: '竜牙の爪', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['オーロラゲート', 'トリオビームZ', 'サケビ声'], equipment: '大賢者の冠', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型3：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['超たおれこみ', '3連アタック', 'わらわら', 'たおれこみ'], equipment: '闘魂の紅玉', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['トリオビームZ', 'オーロラゲート', 'サケビ声'], equipment: '護りの霊符', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型4：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['3連アタック', '超たおれこみ', 'わらわら', 'たおれこみ'], equipment: '死闘の重錘', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['トリオビームZ', 'オーロラゲート', 'サケビ声'], equipment: '不屈の兜', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型5：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['3連アタック', '超たおれこみ', 'わらわら', '神秘の守り'], equipment: '牙獣のお守り', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['トリオビームZ', 'オーロラゲート', '超音波', '神秘の守り'], equipment: '闘気の勾玉', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型6：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['3連アタック', 'たおれこみ', '超たおれこみ', '神秘の守り'], equipment: '韋駄天の靴', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['トリオビームZ', 'サケビ声', 'オーロラゲート', '神秘の守り'], equipment: '癒しの若葉', statMod: { pow: 0.75, int: 1.25 } },
        // --- 型7：ちから特化型／かしこさ特化型（特殊効果装備のみ） ---
        { skills: ['3連アタック', '超たおれこみ', 'わらわら', 'たおれこみ'], equipment: '守護のペンダント', statMod: { pow: 1.25, int: 0.75 } },
        { skills: ['トリオビームZ', 'オーロラゲート', '超音波', 'サケビ声'], equipment: '大亀の甲羅', statMod: { pow: 0.75, int: 1.25 } },
    ],
    'プラント': [
        { skills: ['連続根っこ', '種ガン', '花粉', 'コンビネーション'], equipment: '生命のお守り' },
        { skills: ['コンビネーション', '種マシンガン', 'ドレイン', '花粉'], equipment: '賢者の指輪' },
        { skills: ['フラワービーム', 'フェイスドリル', 'ドレイン', '種マシンガン'], equipment: '韋駄天の靴' },
        { skills: ['フラワービーム', 'フェイスドリル', '種マシンガン', 'ドレイン'], equipment: '癒しの若葉' },
        // --- 型5 ---
        { skills: ['フラワービーム', 'コンビネーション', '種マシンガン', 'ドレイン'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['フェイスドリル', 'コンビネーション', '種マシンガン', 'ドレイン'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['フェイスドリル', 'フラワービーム', 'コンビネーション', '種マシンガン'], equipment: '牙獣のお守り' },
    ],
    'キュービ': [
        { skills: ['ひっかき', '陽炎', '狐火', '超狐火'], equipment: '風切りのお守り' },
        { skills: ['狐火', '超狐火', 'ゆうわく', 'ひっかき'], equipment: '幻影のヴェール' },
        { skills: ['陽炎', '九重神眼', '超狐火', 'ゆうわく'], equipment: '死闘の重錘' },
        { skills: ['天河天翔', '超狐火', '九重神眼', 'ゆうわく'], equipment: '大亀の甲羅' },
        // --- 型5 ---
        { skills: ['九重神眼', '陽炎', '超狐火', 'ゆうわく'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['天河天翔', '陽炎', '超狐火', 'ゆうわく'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['天河天翔', '九重神眼', '陽炎', '超狐火'], equipment: '牙獣のお守り' },
    ],
    'ハム': [
        { skills: ['ワンツーパンチ', 'ソバット', '頭つき', '背負い投げ'], equipment: '俊足のアンクレット' },
        { skills: ['頭つき', '背負い投げ', 'おなら', 'ソバット'], equipment: '鉄爪の欠片' },
        { skills: ['超頭つき', 'マシンガンパンチ', 'おなら', '背負い投げ'], equipment: '守護のペンダント' },
        { skills: ['マシンガンパンチ', '背負い投げ', '超大声', '超頭つき'], equipment: '不死鳥の羽根' },
        // --- 型5 ---
        { skills: ['マシンガンパンチ', '背負い投げ', '超頭つき', '頭つき'], equipment: '護りの霊符' },
        // --- 型6 ---
        { skills: ['超大声', '背負い投げ', '超頭つき', '頭つき'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['超大声', 'マシンガンパンチ', '背負い投げ', '超頭つき'], equipment: '闘魂の紅玉' },
    ],
    'アローヘッド': [
        { skills: ['テイルアタック', 'ズームパンチ', 'ニードルターン', 'ロケットパンチ'], equipment: '鷹の目レンズ' },
        { skills: ['ニードルターン', 'Wニードルターン', 'ロケットパンチ', 'ズームパンチ'], equipment: '真眼のレンズ' },
        { skills: ['竜巻アタック', 'テイルブレード', '地雷針', 'ニードルターン'], equipment: '護りの霊符' },
        { skills: ['Wニードルターン', '竜巻アタック', 'ロケットパンチ', 'テイルブレード'], equipment: '牙獣のお守り' },
        // --- 型5 ---
        { skills: ['ロケットパンチ', 'Wニードルターン', 'ニードルターン', 'テイルブレード'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['竜巻アタック', 'Wニードルターン', 'ニードルターン', 'テイルブレード'], equipment: '闘魂の紅玉' },
        // --- 型7 ---
        { skills: ['竜巻アタック', 'ロケットパンチ', 'Wニードルターン', 'ニードルターン'], equipment: '闘気の勾玉' },
    ],
    'ネンドロ': [
        { skills: ['ズームパンチ', 'がん飛ばし', 'マッハパンチ', 'ボディプレス'], equipment: '荒縄のガントレット' },
        { skills: ['がん飛ばし', 'ボディプレス', 'マッハパンチ', 'めいどのみやげ'], equipment: '鉄爪の欠片' },
        { skills: ['めいどのみやげ', 'ボディプレス', 'マッハパンチ', 'がん飛ばし'], equipment: '闘魂の紅玉' },
        { skills: ['めいどのみやげ', 'マッハパンチ', 'ボディプレス', 'ズームパンチ'], equipment: '闘気の勾玉' },
        // --- 型5 ---
        { skills: ['ボディプレス', 'マッハパンチ', 'ようかい液', 'ズームパンチ'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['めいどのみやげ', 'マッハパンチ', 'ようかい液', 'ズームパンチ'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['めいどのみやげ', 'ボディプレス', 'マッハパンチ', 'ようかい液'], equipment: '牙獣のお守り' },
    ],
    'ヘンガー': [
        { skills: ['Wキック', 'レーザーブレード', 'Wレーザーソード', 'レーザーカッター'], equipment: '鷹の目レンズ' },
        { skills: ['ドリルロケット', 'レーザーカッター', 'Wレーザーソード', 'レーザーブレード'], equipment: '知恵の首飾り' },
        { skills: ['Wドリルロケット', 'ナパームキャノン', 'レーザーカッター', 'ドリルロケット'], equipment: '不屈の兜' },
        { skills: ['ナパームキャノン', 'Wドリルロケット', 'ドリルロケット', 'レーザーカッター'], equipment: '韋駄天の靴' },
        // --- 型5 ---
        { skills: ['ドリルロケット', 'ナパームキャノン', 'レーザーカッター', 'Wキック'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['Wドリルロケット', 'ナパームキャノン', 'レーザーカッター', 'Wキック'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['Wドリルロケット', 'ドリルロケット', 'ナパームキャノン', 'レーザーカッター'], equipment: '牙獣のお守り' },
    ],
    'デュラハン': [
        { skills: ['超ダッシュ斬り', '剣舞', '風神剣', 'コンボパンチ'], equipment: '荒縄のガントレット' },
        { skills: ['乱れ突き', 'コンボパンチ', '風神剣', '超ダッシュ斬り'], equipment: '鉄爪の欠片' },
        { skills: ['まっぷたつ', '大車輪', '雷神剣', '乱れ突き'], equipment: '護りの霊符' },
        { skills: ['雷神剣', 'まっぷたつ', 'コンボパンチ', '大車輪'], equipment: '癒しの若葉' },
        // --- 型5 ---
        { skills: ['コンボパンチ', 'まっぷたつ', '大車輪', '乱れ突き'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['雷神剣', 'まっぷたつ', '大車輪', '乱れ突き'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['雷神剣', 'コンボパンチ', 'まっぷたつ', '大車輪'], equipment: '闘魂の紅玉' },
    ],
    'ゴーレム': [
        { skills: ['でこぴん', '掌打', 'ダブルチョップ', 'ステルスロック'], equipment: '石の腕輪' },
        { skills: ['クロー投げ', 'ダブルチョップ', '地震', '掌打'], equipment: '鉄爪の欠片' },
        { skills: ['のびーるパンチ', 'ぐるぐるアタック', '地震', 'ダブルチョップ'], equipment: '死闘の重錘' },
        { skills: ['ぐるぐるアタック', 'のびーるパンチ', 'クロー投げ', '地震'], equipment: '大亀の甲羅' },
        // --- 型5 ---
        { skills: ['のびーるパンチ', 'クロー投げ', 'ダブルチョップ', '地震'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['ぐるぐるアタック', 'クロー投げ', 'ダブルチョップ', '地震'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['ぐるぐるアタック', 'のびーるパンチ', 'クロー投げ', 'ダブルチョップ'], equipment: '牙獣のお守り' },
    ],
    'カワズモー': [
        { skills: ['はり手', 'かわずつき', 'かえるのした', '粘液'], equipment: '荒縄のガントレット' },
        { skills: ['がっぷりよつ', '上手投げ', 'かえるのした', 'はり手'], equipment: '石の腕輪' },
        { skills: ['連続はり手', '飛びはり手', 'ばくだん投げ', 'かわずつき'], equipment: '守護のペンダント' },
        { skills: ['大回転落とし', 'かえるのうた', '上手投げ', 'ばくだん投げ'], equipment: '不死鳥の羽根' },
        // --- 型5 ---
        { skills: ['ばくだん投げ', '上手投げ', 'がっぷりよつ', '連続はり手'], equipment: '護りの霊符' },
        // --- 型6 ---
        { skills: ['大回転落とし', '上手投げ', 'がっぷりよつ', '連続はり手'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['大回転落とし', 'ばくだん投げ', '上手投げ', 'がっぷりよつ'], equipment: '闘魂の紅玉' },
    ],
    'ヒノトリ': [
        { skills: ['くちばし', '連続かぎづめ', 'フレイムビーム', '雄叫び'], equipment: '荒縄のガントレット' },
        { skills: ['フレイムタイフーン', '雄叫び', 'フレイムビーム', '連続かぎづめ'], equipment: '鷹の目レンズ' },
        { skills: ['爆裂落とし', 'フレイムライン', 'ファイヤーバード', 'フレイムタイフーン'], equipment: '護りの霊符' },
        { skills: ['ファイアウェーブ', 'エボニーノヴァ', 'ファイヤーバード', 'フレイムタイフーン'], equipment: '不死鳥の羽根' },
        // --- 型5 ---
        { skills: ['ファイアウェーブ', 'フレイムビーム', 'フレイムタイフーン', 'ファイヤーバード'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['エボニーノヴァ', 'フレイムビーム', 'フレイムタイフーン', 'ファイヤーバード'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['エボニーノヴァ', 'ファイアウェーブ', 'フレイムビーム', 'フレイムタイフーン'], equipment: '闘魂の紅玉' },
    ],
    'ガリ': [
        { skills: ['ナックル', 'ストレート', 'スピンカッター', 'プレス'], equipment: '荒縄のガントレット' },
        { skills: ['プレス', 'ハリケーン', 'ホーリーファイヤー', 'ゴッドブレス'], equipment: '真眼のレンズ' },
        { skills: ['ホーリーアース', 'ホーリーアイシクル', '大スピンカッター', 'ハリケーン'], equipment: '闘魂の紅玉' },
        { skills: ['ゴッドファイナル', 'ゴッドブレス', '大スピンカッター', 'ホーリーアース'], equipment: '牙獣のお守り' },
        // --- 型5 ---
        { skills: ['ホーリーファイヤー', 'ゴッドブレス', 'プレス', 'ホーリーアイシクル'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['ゴッドファイナル', 'ゴッドブレス', 'プレス', 'ホーリーアイシクル'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['ホーリーアイシクル', 'ホーリーアース', 'ゴッドブレス', 'ゴッドファイナル'], equipment: '闘気の勾玉' },
    ],
    'メタルナー': [
        { skills: ['ポン拳', '左掌', 'テツざんこう', 'すんけい'], equipment: '荒縄のガントレット' },
        { skills: ['すんけい', 'ダブル掌打', 'メタビーム', '左掌'], equipment: '石の腕輪' },
        { skills: ['閃光掌', 'ツイン掌打', '小変化', 'ダブル掌打'], equipment: '闘気の勾玉' },
        { skills: ['太極変化', 'ツイン掌打', '閃光掌', 'すんけい'], equipment: '不屈の兜' },
        // --- 型5 ---
        { skills: ['ツイン掌打', 'メタビーム', 'ダブル掌打', 'すんけい'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['太極変化', 'メタビーム', 'ダブル掌打', 'すんけい'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['太極変化', 'ツイン掌打', 'メタビーム', 'ダブル掌打'], equipment: '牙獣のお守り' },
    ],
    'キジン': [
        { skills: ['頭突き', '鬼手', '鬼爪', '投げ飛ばし'], equipment: '荒縄のガントレット' },
        { skills: ['投げ飛ばし', '地裂斬', '鬼哭衝', '鬼爪'], equipment: '石の腕輪' },
        { skills: ['鬼神乱舞', '羅刹', '阿修羅', '地裂斬'], equipment: '韋駄天の靴' },
        { skills: ['羅生門', '阿修羅', '鬼神乱舞', '鬼哭衝'], equipment: '牙獣のお守り' },
        // --- 型5 ---
        { skills: ['阿修羅', '鬼神乱舞', '投げ飛ばし', '羅刹'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['羅生門', '鬼神乱舞', '投げ飛ばし', '羅刹'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['羅生門', '阿修羅', '鬼神乱舞', '投げ飛ばし'], equipment: '闘魂の紅玉' },
    ],
    'ゴースト': [
        { skills: ['ピコピコハンマー', '体当たり', 'おどかす', 'カード'], equipment: '荒縄のガントレット' },
        { skills: ['大パンチ', 'カード', 'ドクロビーム', 'おどかす'], equipment: '賢者の指輪' },
        { skills: ['コンビネーション', '大きなおとしもの', 'びっくりドクロ', 'ドクロビーム'], equipment: '癒しの若葉' },
        { skills: ['ゴーストフラッシュ', 'びっくりドクロ', '大きなおとしもの', 'ドクロビーム'], equipment: '死闘の重錘' },
        // --- 型5 ---
        { skills: ['びっくりドクロ', '大パンチ', '大きなおとしもの', 'ドクロビーム'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['ゴーストフラッシュ', '大パンチ', '大きなおとしもの', 'ドクロビーム'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['ゴーストフラッシュ', 'びっくりドクロ', '大パンチ', '大きなおとしもの'], equipment: '牙獣のお守り' },
    ],
    'ゲル': [
        { skills: ['突き刺し', 'くし刺し', 'ムチ', 'G・キューブ'], equipment: '荒縄のガントレット' },
        { skills: ['くし刺し', 'G・キューブ', 'パラボラビーム', 'ハエタタキ'], equipment: '鷹の目レンズ' },
        { skills: ['マナドレイン', '超パラボラビーム', 'ゲルプレス', 'ハエタタキ'], equipment: '大亀の甲羅' },
        { skills: ['ゲルコプター', 'ゲルプレス', '超パラボラビーム', '大砲'], equipment: '守護のペンダント' },
        // --- 型5 ---
        { skills: ['ゲルプレス', '超パラボラビーム', 'マナドレイン', 'ゲルコプター'], equipment: '護りの霊符' },
        // --- 型6 ---
        { skills: ['大砲', '超パラボラビーム', 'マナドレイン', 'ゲルコプター'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['大砲', 'ゲルプレス', '超パラボラビーム', 'マナドレイン'], equipment: '闘魂の紅玉' },
    ],
    'アーク': [
        { skills: ['我が瞳の真理を見よ', '世界を揺らせ', '翔べ震律の刃よ', '神光よ汚れを祓え'], equipment: '知恵の首飾り' },
        { skills: ['神光よ汚れを祓え', '今こそ真なる目醒め', '蒼き荊よ咎を穿て', '裁きの光よ下れ'], equipment: '賢者の指輪' },
        { skills: ['裁きの光よ下れ', '終焉に救いを与えよ', '熾天の剣よ降り立て', '聖夜の鐘よ鳴響け'], equipment: '不死鳥の羽根' },
        { skills: ['祈れ輪廻の環よ', '天の慈悲よ示されよ', '熾天の剣よ降り立て', '終焉に救いを与えよ'], equipment: '護りの霊符' },
        // --- 型5 ---
        { skills: ['祈れ輪廻の環よ', '聖夜の鐘よ鳴響け', '終焉に救いを与えよ', '裁きの光よ下れ'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['天の慈悲よ示されよ', '聖夜の鐘よ鳴響け', '終焉に救いを与えよ', '裁きの光よ下れ'], equipment: '牙獣のお守り' },
        // --- 型7 ---
        { skills: ['天の慈悲よ示されよ', '裁きの光よ下れ', '聖夜の鐘よ鳴響け', '熾天の剣よ降り立て'], equipment: '闘魂の紅玉' },
    ],
    'イルミネ': [
        { skills: ['プラズマ', 'シールドバッシュ', 'ヴェノムエッジ', 'ストレート'], equipment: '荒縄のガントレット' },
        { skills: ['アサシンクロウ', 'モーニングスター', 'ヴェノムエッジ', 'ストレート'], equipment: '鷹の目レンズ' },
        { skills: ['アサルトアロー', 'バスターソード', 'アルカナフレア', 'アサシンクロウ'], equipment: '牙獣のお守り' },
        { skills: ['レクイエムエンド', 'ミラージュクロウ', 'ブレードダンス', 'アルスマグナ'], equipment: '闘魂の紅玉' },
        // --- 型5 ---
        { skills: ['ミラージュクロウ', 'アサルトアロー', 'アルスマグナ', 'モーニングスター'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['レクイエムエンド', 'ヴェノムエッジ', 'プラズマ', 'クリムゾンノヴァ'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['レクイエムエンド', 'ミラージュクロウ', 'アサルトアロー', 'アルスマグナ'], equipment: '闘気の勾玉' },
    ],
    'ライガー': [
        { skills: ['ひっかき', 'かみつき', '体当たり', 'ワンツー'], equipment: '荒縄のガントレット' },
        { skills: ['体当たり', '影撃', '雷撃', 'コンビネーション'], equipment: '鷹の目レンズ' },
        { skills: ['冷気弾', '超雷撃', '空中回転アタック', 'コンビネーション'], equipment: '闘気の勾玉' },
        { skills: ['落雷共鳴', '雷神剣', '超雷撃', '空中回転アタック'], equipment: '不屈の兜' },
        // --- 型5 ---
        { skills: ['雷神剣', 'コンビネーション', '空中回転アタック', 'ワンツー'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['落雷共鳴', 'コンビネーション', '空中回転アタック', 'ワンツー'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['落雷共鳴', '雷神剣', 'コンビネーション', '空中回転アタック'], equipment: '牙獣のお守り' },
    ],
    'ピクシー': [
        { skills: ['はり手', 'サンダー', 'レイ', 'ハイキック'], equipment: '賢者の指輪' },
        { skills: ['レイ', 'ライトニング', 'なげキッス', 'ハイキック'], equipment: '鷹の目レンズ' },
        { skills: ['メガレイ', 'なげキッス', 'バン', 'ギガレイ'], equipment: '韋駄天の靴' },
        { skills: ['アストラルレイ', 'ビッグバン', 'ギガレイ', 'ヒールレイド'], equipment: '癒しの若葉' },
        // --- 型5 ---
        { skills: ['ビッグバン', 'バン', 'ヒールレイド', 'ギガレイ'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['アストラルレイ', 'バン', 'ヒールレイド', 'ギガレイ'], equipment: '護りの霊符' },
        // --- 型7 ---
        { skills: ['アストラルレイ', 'ビッグバン', 'バン', 'ヒールレイド'], equipment: '牙獣のお守り' },
    ],
    'ザン': [
        { skills: ['ミラージュシフト', 'シングルショット', 'レッグアーク', 'まきびし'], equipment: '荒縄のガントレット' },
        { skills: ['レッグアーク', 'スタナーブリッツ', 'ダブルサマー', '剣舞'], equipment: '鉄爪の欠片' },
        { skills: ['メテオドライブ', 'アサルトダンス', 'みがわりの術', 'アサルトレイド'], equipment: '死闘の重錘' },
        { skills: ['ライジングレイヴ', 'アクシズバレット', 'ダークホウスト', 'アサルトレイド'], equipment: '牙獣のお守り' },
        // --- 型5 ---
        { skills: ['ダークホウスト', 'アサルトレイド', 'アクシズバレット', 'ダブルサマー'], equipment: '守護のペンダント' },
        // --- 型6 ---
        { skills: ['ライジングレイヴ', 'ダークホウスト', 'アクシズバレット', '剣舞'], equipment: '闘気の勾玉' },
        // --- 型7 ---
        { skills: ['まきびし', 'みがわりの術', 'ライジングレイヴ', '剣舞'], equipment: '癒しの若葉' },
    ]
};

// --- モンスター名から種族IDを逆引きする ---
function findSpeciesIdByMonsterName(name) {
    return Object.keys(MONSTER_TEMPLATES).find(id => MONSTER_TEMPLATES[id].name === name) || null;
}

// --- 技名から技キーを逆引きする ---
// speciesId を渡すと、まずその種族の固有技候補（KIN_NEJIKI_SKILL_POOL）内から優先的に探す。
// （複数の種族に同じ表示名の技が存在する場合に、誤って他種族の技を拾わないようにするため）
function findSkillKeyByName(name, speciesId) {
    if (speciesId && KIN_NEJIKI_SKILL_POOL[speciesId]) {
        const inSpecies = KIN_NEJIKI_SKILL_POOL[speciesId].find(k => SKILLS_DB[k] && SKILLS_DB[k].name === name);
        if (inSpecies) return inSpecies;
    }
    return Object.keys(SKILLS_DB).find(k => SKILLS_DB[k].name === name) || null;
}

// --- 装備名から装備IDを逆引きする ---
function findEquipmentIdByName(name) {
    if (!name) return null;
    return Object.keys(EQUIPMENT_DB).find(k => EQUIPMENT_DB[k].name === name) || null;
}

// --- ガッツファクトリーのセット数（周回数）から、解放済みの型の数（1〜4）を返す ---
function getMoldUnlockCountForSet(setNumber) {
    // 型は全7段階。1セットごとに1段階ずつ解放していく（セット1→型1のみ、セット7→型1〜7すべて）。
    return Math.max(1, Math.min(7, setNumber));
}

// --- 装備が重複回避（excludeEquipIds）のため使用できなくなった場合の代役を選ぶ ---
// まず同じtype（special/stat）・mode（normal/hard）の中から探し、無ければmode条件を緩め、
// それでも無ければ最終手段としてexcludeEquipIds自体を無視してでも同じtypeの何かを返す
// （guaranteeEquip指定時に「未装備」を発生させないための保険）。
function pickSubstituteEquipmentBase(originalBase, excludeEquipIds) {
    if (!originalBase) return null;
    const excluded = excludeEquipIds || [];

    const sameTypeAndMode = Object.values(EQUIPMENT_DB).filter(eq => eq.type === originalBase.type && eq.mode === originalBase.mode && !excluded.includes(eq.id));
    if (sameTypeAndMode.length > 0) return sameTypeAndMode[Math.floor(Math.random() * sameTypeAndMode.length)];

    const sameType = Object.values(EQUIPMENT_DB).filter(eq => eq.type === originalBase.type && !excluded.includes(eq.id));
    if (sameType.length > 0) return sameType[Math.floor(Math.random() * sameType.length)];

    const anySameType = Object.values(EQUIPMENT_DB).filter(eq => eq.type === originalBase.type);
    return anySameType.length > 0 ? anySameType[Math.floor(Math.random() * anySameType.length)] : originalBase;
}

// --- 指定種族の「型」を、解放数（unlockedCount: 1〜4）の範囲からランダムに1つ選び、
//     技キー配列と装備インスタンスに変換して返す。型データが無ければ null を返す。
// excludeEquipIds: この配列に含まれる装備IDが選ばれた場合、その型は装備なし扱いにする
//                  （同じ道具を持ったモンスター同士が対面しない、という仕様のための調整弁）
// minIndex: 抽選対象の型の開始インデックス（0始まり）。省略時は0（型1から）。
//           PvPレンタルのように「上位の型（型3・型4）のみから選出したい」場合は 2 を渡す。
// guaranteeEquip: trueの場合、重複回避で本来の装備が使えなくなっても「未装備」にはせず、
//                 同種の装備で代役を立てる（ガッツファクトリーの敵生成用。省略時はfalse＝従来通り）。
//
// ※ dualStatType（ちから/かしこさ特化型を型ごとに2パターン持つ種族）の場合、
//   MONSTER_MOLDS側の配列は [型1ちから,型1かしこさ,型2ちから,型2かしこさ,...] という
//   「型番号1つにつき2エントリ」の並びになっているため、unlockedCount・minIndexは
//   ここで内部的に2倍にして扱う（型の番号ベースの意味はそのまま保たれる）。
//   これにより呼び出し側（kinnejiki.js）は今まで通り
//   「型番号（1〜7）」の感覚でunlockedCount・minIndexを渡すだけでよい。
function pickMonsterMold(speciesId, unlockedCount, excludeEquipIds, minIndex, guaranteeEquip) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    const molds = tmpl ? MONSTER_MOLDS[tmpl.name] : null;
    if (!molds || molds.length === 0) return null;

    const isDualStatType = !!(tmpl && tmpl.dualStatType);
    const rawUnlockedCount = unlockedCount || 1;
    const rawMinIndex = minIndex || 0;
    const effectiveUnlockedCount = isDualStatType ? rawUnlockedCount * 2 : rawUnlockedCount;
    const effectiveMinIndex = isDualStatType ? rawMinIndex * 2 : rawMinIndex;

    const start = Math.max(0, Math.min(effectiveMinIndex, molds.length - 1));
    const count = Math.max(start + 1, Math.min(effectiveUnlockedCount, molds.length));
    const availableMolds = molds.slice(start, count);
    const chosen = availableMolds[Math.floor(Math.random() * availableMolds.length)];
    if (!chosen) return null;

    const skillKeys = (chosen.skills || []).map(n => findSkillKeyByName(n, speciesId)).filter(Boolean);
    if (skillKeys.length === 0) return null; // 技名が1つも解決できない＝型データ不備とみなし呼び出し側でフォールバックさせる

    let equip = null;
    if (chosen.equipment) {
        const equipId = findEquipmentIdByName(chosen.equipment);
        const isExcluded = equipId && excludeEquipIds && excludeEquipIds.includes(equipId);
        if (equipId && !isExcluded) {
            equip = buildEquipmentInstanceFromBase(EQUIPMENT_DB[equipId]);
        } else if (equipId && isExcluded && guaranteeEquip) {
            // 本来の装備が重複回避で使えない場合、未装備にはせず同種の代役を立てる
            const substitute = pickSubstituteEquipmentBase(EQUIPMENT_DB[equipId], excludeEquipIds);
            if (substitute) equip = buildEquipmentInstanceFromBase(substitute);
        }
    } else if (guaranteeEquip) {
        // 型自体に装備指定が無い場合も、guaranteeEquip指定時は特殊効果装備の中から必ず1つ持たせる
        const excluded = excludeEquipIds || [];
        const specialPool = Object.values(EQUIPMENT_DB).filter(eq => eq.type === 'special' && !excluded.includes(eq.id));
        const fallbackPool = specialPool.length > 0 ? specialPool : Object.values(EQUIPMENT_DB).filter(eq => eq.type === 'special');
        const base = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        if (base) equip = buildEquipmentInstanceFromBase(base);
    }
    // statMod: ちから/かしこさ特化型が種族ベースのpow/intステータスに掛ける倍率（{pow, int}）。
    // 未指定の型（dualStatTypeでない通常種族）はnullのまま返し、呼び出し側で1倍として扱われる。
    return { skills: skillKeys, equip, statMod: chosen.statMod || null };
}

// --- 専属ボス「レジェンドブリーダー・コルト」（3セット目・7セット目に登場）---
// 通常のレンタルプールには含まれず、それぞれ専属のモンスター1体を率いて登場する。
const KIN_NEJIKI_BOSSES = {
    set3: {
        name: 'コルトのゴビ',
        shortName: 'コルト',
        title: 'レジェンドブリーダー・コルト',
        templateId: 'golem',
        emoji: '🗿',
        desc: 'ちからと丈夫さに全振りした岩石の怪物。ガッツが溜まると「ローリング激突」や「竜巻アタック」で大ダメージを与えてくる。さらに「ゴビステップ」で自身の回避を大きく高めてくるため、回避特化での対策も過信は禁物。',
        statsBase: { maxLife: 260, pow: 78, int: 18, hit: 34, spd: 16, def: 62, gutsSpeed: 12 },
        skills: ['claw_nage', 'boss_roll', 'tornado_attack', 'gobi_step']
    },
    set7: {
        name: 'コルトのモスト',
        shortName: 'コルト',
        title: 'レジェンドブリーダー・コルト（最終決戦）',
        templateId: null, // 特定種族に属さないオリジナルの最終ボス
        emoji: '👿',
        aura: 'white', // モスト専用の特別なオーラ（三竦みに参加しない中立オーラ）
        desc: '伝説の邪神。戦闘のたびに異なる型で現れ、毒と吸収でじわじわ追い詰める型と、「サイコブラスト」「メテオバースト」の大技で一気に畳みかける型を使い分ける。ガッツダウン性能の高い技で常にガッツを抑え込むのが攻略の鍵。',
        statsBase: { maxLife: 480, pow: 58, int: 58, hit: 62, spd: 46, def: 58, gutsSpeed: 14 },
        // 型①：毒＋ドレインでじわじわ追い詰めるタイプ　型②：サイコブラスト/メテオバーストで一気に畳みかけるタイプ
        // バトルのたびにいずれか1つの型がランダムで選ばれる。
        molds: [
            ['doku_no_kona', 'drain', 'migawarimochi', 'boss_meteor'],
            ['boss_laser', 'boss_meteor', 'mach_punch', 'inore_rinne_no_wa_yo']
        ],
        skills: ['doku_no_kona', 'drain', 'migawarimochi', 'boss_meteor'] // デバッグツール等でのフォールバック用デフォルト（型①）
    }
};

