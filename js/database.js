// =====================================================
// オーラ属性データベース（新要素）
// 育成開始時の「オーラの儀式」でプレイヤーのモンスターに付与し、
// 育成中バトル(game_battle.js)の敵にはランダムで付与する。
// 相性: 赤→緑→黄→青→赤 の順に有利（beatsで示す色に対して1.5倍ダメージ）
// =====================================================
const AURA_TYPES = {
    red:    { key: 'red',    name: '赤',  emoji: '🔴', colorClass: 'bg-red-500',    textClass: 'text-red-400',    beats: 'green' },
    green:  { key: 'green',  name: '緑',  emoji: '🟢', colorClass: 'bg-green-500',  textClass: 'text-green-400',  beats: 'yellow' },
    yellow: { key: 'yellow', name: '黄',  emoji: '🟡', colorClass: 'bg-yellow-400', textClass: 'text-yellow-300', beats: 'blue' },
    blue:   { key: 'blue',   name: '青',  emoji: '🔵', colorClass: 'bg-blue-500',   textClass: 'text-blue-400',   beats: 'red' }
};

// --- 攻撃側オーラが防御側オーラに対して有利かどうかを判定する ---
function isAuraAdvantageous(attackerAuraKey, defenderAuraKey) {
    if (!attackerAuraKey || !defenderAuraKey) return false;
    const attackerAura = AURA_TYPES[attackerAuraKey];
    return !!attackerAura && attackerAura.beats === defenderAuraKey;
}

// --- 4色からランダムに1つオーラを選ぶ（敵モンスターへの付与用） ---
function getRandomAuraKey() {
    const keys = Object.keys(AURA_TYPES);
    return keys[Math.floor(Math.random() * keys.length)];
}

// --- モンスターデータベース ---
const MONSTER_TEMPLATES = {
    mochi: {
        id: 'mochi',
        name: 'モッチー',
        emoji: '🍪',
        desc: '丸くて愛らしいが、バランスの取れた優秀な能力と強力なガッツ回復力を持つ。',
        stats: { maxLife: 220, life: 220, pow: 71, int: 61, hit: 55, spd: 45, def: 40, gutsSpeed: 16 }
    },
    suezo: {
        id: 'suezo',
        name: 'スエゾー',
        emoji: '👁️',
        desc: '単眼の奇妙なモンスター。かしこさと命中が非常に高く、トリッキーな技が得意。',
        stats: { maxLife: 180, life: 180, pow: 35, int: 102, hit: 65, spd: 40, def: 30, gutsSpeed: 14 }
    },
    dino: {
        id: 'dino',
        name: 'ディノ',
        emoji: '🦖',
        desc: '恐竜のような獰猛な外見。ちからと丈夫さに優れ、大ダメージを与える大技を放つ。',
        stats: { maxLife: 250, life: 250, pow: 102, int: 35, hit: 45, spd: 35, def: 50, gutsSpeed: 12 }
    },
    monolith: {
        id: 'monolith',
        name: 'モノリス',
        emoji: '🗿',
        desc: '古代より佇む謎の岩石生命体。動きは鈍く回避は苦手だが、岩の肉体は並外れた丈夫さを誇り、ちから・かしこさ両面の技を使いこなす。',
        stats: { maxLife: 235, life: 235, pow: 74, int: 70, hit: 42, spd: 26, def: 62, gutsSpeed: 13 }
    },
    plant: {
        id: 'plant',
        name: 'プラント',
        emoji: '🌸',
        desc: '花を戴く植物系のモンスター。ちからはやや低めだが、驚異的な生命力を持ち、多彩なかしこさ技で相手を翻弄する。',
        stats: { maxLife: 260, life: 260, pow: 42, int: 94, hit: 46, spd: 32, def: 46, gutsSpeed: 14 }
    },
    kyubi: {
        id: 'kyubi',
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
        name: 'ハム',
        emoji: '🐇',
        desc: '素早い身のこなしのウサギ型モンスター。命中と回避に優れ、格闘技主体の接近戦を得意とするが、ライフと丈夫さはやや低め。',
        stats: { maxLife: 175, life: 175, pow: 90, int: 40, hit: 58, spd: 58, def: 26, gutsSpeed: 15 }
    },
    arrowhead: {
        id: 'arrowhead',
        name: 'アローヘッド',
        emoji: '🦀',
        desc: '硬い甲殻を持つ蟹型モンスター。丈夫さと回避に優れ、ガッツ回復もそこそこ速いが、命中はやや低め。',
        stats: { maxLife: 215, life: 215, pow: 92, int: 40, hit: 32, spd: 40, def: 56, gutsSpeed: 14 }
    },
    nendoro: {
        id: 'nendoro',
        name: 'ネンドロ',
        emoji: '👤',
        desc: 'プロレスラーのような屈強な粘土質モンスター。ライフ・ちから・回避のすべてが高水準で、格闘技の連打で押し切る。かしこさは低い。',
        stats: { maxLife: 250, life: 250, pow: 100, int: 18, hit: 44, spd: 52, def: 42, gutsSpeed: 13 }
    },
    henger: {
        id: 'henger',
        name: 'ヘンガー',
        emoji: '🤖',
        desc: '機械仕掛けの人造モンスター。ちから・かしこさ・命中のバランスに優れ、レーザーや光線技を得意とするが丈夫さはやや低め。',
        stats: { maxLife: 195, life: 195, pow: 80, int: 76, hit: 48, spd: 38, def: 30, gutsSpeed: 14 }
    },
    durahan: {
        id: 'durahan',
        name: 'デュラハン',
        emoji: '🛡️',
        desc: '甲冑を纏う騎士型モンスター。ちからと丈夫さが非常に高く重厚な一撃を得意とするが、ガッツ回復と回避に難がある。',
        stats: { maxLife: 235, life: 235, pow: 104, int: 46, hit: 40, spd: 18, def: 60, gutsSpeed: 11 }
    },
    golem: {
        id: 'golem',
        name: 'ゴーレム',
        emoji: '🗿',
        desc: '岩石の巨体を持つゴーレム型モンスター。ちからと丈夫さは最高クラスだが、命中と回避が低く動きは非常に鈍い。',
        stats: { maxLife: 230, life: 230, pow: 108, int: 16, hit: 32, spd: 14, def: 58, gutsSpeed: 11 }
    },
    kawazumo: {
        id: 'kawazumo',
        name: 'カワズモー',
        emoji: '🐸',
        desc: '力士のような体躯を持つ蛙型モンスター。がっちりとした重い体と怪力を武器に、張り手や投げ技を得意とするが、見た目に反して舌や鳴き声を使ったかしこさ技も巧みに操る。動きはやや鈍重。',
        stats: { maxLife: 240, life: 240, pow: 94, int: 58, hit: 48, spd: 34, def: 56, gutsSpeed: 13 }
    },
    hinotori: {
        id: 'hinotori',
        name: 'ヒノトリ',
        emoji: '🐦‍🔥',
        desc: '身を炎に包んだ伝説の不死鳥。ちから・かしこさの両面で高い水準を誇り、多彩な炎の技を操って相手を焼き尽くすが、丈夫さはやや低い。',
        stats: { maxLife: 200, life: 200, pow: 78, int: 88, hit: 52, spd: 50, def: 34, gutsSpeed: 14 }
    },
    gari: {
        id: 'gari',
        name: 'ガリ',
        emoji: '👊',
        desc: '厳しい修行の末に神聖な力を会得した孤高の武闘家モンスター。ちから・かしこさともに高水準で、拳打と神聖魔法を織り交ぜた多彩な技を操るが、丈夫さはやや薄い。',
        stats: { maxLife: 210, life: 210, pow: 92, int: 84, hit: 58, spd: 44, def: 30, gutsSpeed: 15 }
    }
};

// --- 技データベース (ダメージランク対応) ---
const SKILLS_DB = {
    // --- モッチー系統 ---
    monta: { name: 'もんた', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 10, effect: null, desc: '小さな手で叩く基本技。相手GUTS-10' },
    mochiki: { name: 'もちき', cost: 20, type: 'pow', hitRate: 75, force: 1.2, gutsDown: 5, effect: null, desc: '力を込めて押しつぶす。相手GUTS-5' },
    gaccho: { name: 'ガッチョ', cost: 30, type: 'pow', hitRate: 80, force: 1.5, gutsDown: 12, effect: null, desc: '突っ張りによる連続攻撃。相手GUTS-12' },
    sakurafubuki: { name: 'さくら吹雪', cost: 25, type: 'int', hitRate: 85, force: 1.3, gutsDown: 10, effect: null, desc: '桜の花びらを舞い散らせる。相手GUTS-10' },
    cho_rollinmochi: { name: '超ローリンモッチ', cost: 40, type: 'pow', hitRate: 65, force: 2.3, gutsDown: 20, effect: null, desc: '大回転して激突する。相手GUTS-20' },
    cho_mochihou: { name: '超もっち砲', cost: 45, type: 'int', hitRate: 70, force: 2.5, gutsDown: 15, effect: null, desc: '最大出力のエネルギー弾。相手GUTS-15' },
    mossama: { name: 'もっさま', cost: 35, type: 'pow', hitRate: 75, force: 1.8, gutsDown: 25, effect: 'selfcrit_up_3', desc: '強烈な威圧を伴う打撃。相手GUTS-25。さらに命中した場合、3ターンの間自身のクリティカル率が25%アップする' },
    yaezakura: { name: '八重ざくら', cost: 30, type: 'heal', hitRate: 100, force: 0, gutsDown: 0, effect: 'heal_hp', desc: '桜の結界でライフを大幅回復する' },

    // --- スエゾー系統 ---
    shippobinta: { name: 'しっぽビンタ', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 15, effect: null, desc: 'しっぽで往復ビンタ。相手GUTS-15' },
    nameru: { name: 'なめる', cost: 15, type: 'int', hitRate: 100, force: 0.4, gutsDown: 15, effect: null, desc: '不快な舌舐め攻撃。回避を完全に無視して【必中】する！相手GUTS-15' },
    kamitsuki: { name: 'かみつき', cost: 20, type: 'pow', hitRate: 75, force: 1.2, gutsDown: 10, effect: null, desc: '大きな口で噛みつく基本技。相手GUTS-10' },
    kuu: { name: '食う', cost: 35, type: 'pow', hitRate: 70, force: 1.8, gutsDown: 20, effect: 'self_heal_15pct', desc: '丸呑みして締め付ける。相手GUTS-20。さらに命中した場合、丸呑みで英気を養い自身のライフを15%回復する' },
    psychokinesis: { name: 'サイコキネシス', cost: 45, type: 'int', hitRate: 75, force: 2.2, gutsDown: 30, effect: 'paralyze_25', desc: '強力な念動力攻撃。相手GUTS-30。さらに命中した場合、念動力で締め付けられ2回の行動の間25%の確率で相手を行動不能にする' },
    cho_netsushisen: { name: '超熱視線', cost: 40, type: 'int', hitRate: 80, force: 2.0, gutsDown: 20, effect: null, desc: '眼から放つ熱線攻撃。相手GUTS-20' },
    utau: { name: '歌う', cost: 30, type: 'int', hitRate: 95, force: 0.2, gutsDown: 45, effect: null, desc: '音痴な歌声で相手を悶絶させる。相手GUTS-45' },
    berobinta: { name: 'ベロビンタ', cost: 25, type: 'pow', hitRate: 80, force: 1.4, gutsDown: 15, effect: 'blind_2', desc: '長い舌で叩きつける。相手GUTS-15。さらに命中した場合、2ターンの間相手の目を眩ませ命中率を下げる' },

    // --- ディノ系統 ---
    shippo: { name: 'しっぽ', cost: 15, type: 'pow', hitRate: 85, force: 0.9, gutsDown: 5, effect: null, desc: '力強いしっぽの叩きつけ。相手GUTS-5' },
    kamitsuki_dino: { name: 'かみつき', cost: 20, type: 'pow', hitRate: 75, force: 1.3, gutsDown: 5, effect: null, desc: '鋭いキバで噛みつく基本技。相手GUTS-5' },
    sunakake: { name: '砂かけ', cost: 15, type: 'int', hitRate: 90, force: 0.6, gutsDown: 20, effect: 'hitdown_stack_3', desc: '砂をかけて視界と闘志を奪う。相手GUTS-20。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    kamitsukinage: { name: 'かみつき投げ', cost: 35, type: 'pow', hitRate: 70, force: 1.9, gutsDown: 10, effect: 'def_down_15', desc: '噛みついたまま投げ飛ばす。相手GUTS-10。さらに命中した場合、投げの衝撃で3ターンの間相手の丈夫さを15%低下させる' },
    honoo_taiatari: { name: '炎のたいあたり', cost: 40, type: 'pow', hitRate: 65, force: 2.4, gutsDown: 15, effect: 'dot_mine', desc: '燃え盛る炎を纏って突進する。相手GUTS-15。さらに命中した場合、火傷により3ターンの間継続ダメージを与える' },
    hizageri: { name: 'ひざげり', cost: 25, type: 'pow', hitRate: 80, force: 1.5, gutsDown: 10, effect: 'selfcrit_up_3', desc: '鋭い跳び膝蹴りを叩き込む。相手GUTS-10。さらに命中した場合、3ターンの間自身のクリティカル率が25%アップする' },
    kurohizacombo: { name: '黒ひざコンボ', cost: 50, type: 'pow', hitRate: 75, force: 2.8, gutsDown: 15, effect: null, desc: '連続で膝蹴りを叩き込む破壊技。相手GUTS-15' },

    // --- モノリス系統 ---
    monotaore: { name: 'たおれこみ', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 10, effect: null, desc: '巨体を活かした体当たり基本技。相手GUTS-10' },
    warawara: { name: 'わらわら', cost: 25, type: 'pow', hitRate: 80, force: 1.1, gutsDown: 15, effect: 'weaken_pow_int', desc: '奇妙な唸り声で相手を威圧する。相手GUTS-15。さらに3ターンの間、相手の「ちから」「かしこさ」を10%低下させる' },
    cho_monotaore: { name: '超たおれこみ', cost: 40, type: 'pow', hitRate: 70, force: 1.8, gutsDown: 20, effect: 'paralyze_25', desc: '全体重を乗せた渾身の体当たり。相手GUTS-20。さらに命中した場合、衝撃で感電したように痺れ、2回の行動の間25%の確率で相手を行動不能にする' },
    sanren_attack: { name: '3連アタック', cost: 50, type: 'pow', hitRate: 70, force: 2.8, gutsDown: 25, effect: 'def_down_15', desc: '硬い岩の腕を叩きつける三段攻撃。相手GUTS-25。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    sakebigoe: { name: 'サケビ声', cost: 20, type: 'int', hitRate: 95, force: 0.75, gutsDown: 15, effect: 'confuse_30', desc: '甲高い叫び声で相手の精神を揺さぶる高命中技。相手GUTS-15。さらに命中した場合、3回の行動の間30%の確率で相手を混乱させる（混乱中は行動に失敗する）' },
    aurora_gate: { name: 'オーロラゲート', cost: 30, type: 'int', hitRate: 80, force: 1.7, gutsDown: 15, effect: 'next_force_up', desc: '虹色の門を展開し力を収束させる。相手GUTS-15。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    trio_beam_z: { name: 'トリオビームZ', cost: 55, type: 'int', hitRate: 65, force: 2.8, gutsDown: 30, effect: null, desc: '三条の破壊光線を放つ最大出力の切り札。相手GUTS-30' },

    // --- プラント系統 ---
    renkon: { name: '連続根っこ', cost: 20, type: 'pow', hitRate: 100, force: 0.8, gutsDown: 10, effect: null, desc: '地中の根っこを操り連続で打ちすえる。回避を完全に無視して【必中】する！相手GUTS-10' },
    combination: { name: 'コンビネーション', cost: 35, type: 'pow', hitRate: 78, force: 1.8, gutsDown: 15, effect: null, desc: '枝と根を使った連続コンビネーション攻撃。相手GUTS-15' },
    face_drill: { name: 'フェイスドリル', cost: 45, type: 'pow', hitRate: 68, force: 2.3, gutsDown: 20, effect: 'def_down_15', desc: '顔面の突起を高速回転させ突き刺す大技。相手GUTS-20。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    tane_gun: { name: '種ガン', cost: 20, type: 'int', hitRate: 82, force: 1.1, gutsDown: 10, effect: 'hitdown_stack_3', desc: '硬い種を弾丸のように撃ち出す基本技。相手GUTS-10。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tane_machinegun: { name: '種マシンガン', cost: 32, type: 'int', hitRate: 78, force: 1.4, gutsDown: 15, effect: 'hitdown_stack_3', desc: '種を連射して相手を蜂の巣にする。相手GUTS-15。さらに命中した場合、相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    kafun: { name: '花粉', cost: 25, type: 'int', hitRate: 90, force: 0.2, gutsDown: 40, effect: null, desc: '大量の花粉をまき散らし、相手の闘志を大きく削ぐ。相手GUTS-40' },
    flower_beam: { name: 'フラワービーム', cost: 45, type: 'int', hitRate: 70, force: 2.2, gutsDown: 20, effect: 'dot_mine', desc: '花の中心から極大の光線を放つ切り札。相手GUTS-20。さらに命中した場合、花粉の後遺症で3ターンの間継続ダメージを与える' },
    drain: { name: 'ドレイン', cost: 35, type: 'int', hitRate: 68, force: 1.4, gutsDown: 10, effect: 'drain_heal', desc: '相手の生命力を吸い取る。命中率はやや低めだが、与えたダメージの20%だけ自身のライフを回復する。相手GUTS-10' },

    // --- キュービ系統 ---
    hikkaki: { name: 'ひっかき', cost: 15, type: 'pow', hitRate: 85, force: 0.5, gutsDown: 10, effect: null, desc: '鋭い爪で引っかく基本技。相手GUTS-10' },
    kagerou: { name: '陽炎', cost: 45, type: 'pow', hitRate: 75, force: 1.4, gutsDown: 15, effect: 'guaranteed_dodge_next', desc: '陽炎に姿を紛れ込ませて攻撃する。相手GUTS-15。さらに命中した場合、次に受ける敵の攻撃を確実に回避する' },
    kitsunebi: { name: '狐火', cost: 15, type: 'int', hitRate: 95, force: 0.5, gutsDown: 10, effect: null, desc: '青白い狐火を飛ばす高命中の基本技。相手GUTS-10' },
    cho_kitsunebi: { name: '超狐火', cost: 32, type: 'int', hitRate: 88, force: 1.4, gutsDown: 15, effect: 'dot_mine', desc: '巨大化させた狐火をぶつける高命中技。相手GUTS-15。さらに命中した場合、狐火の残り火により3ターンの間継続ダメージを与える' },
    yuuwaku: { name: 'ゆうわく', cost: 25, type: 'int', hitRate: 85, force: 0.85, gutsDown: 40, effect: 'confuse_30', desc: '妖しい魅力で相手の闘志を大きく削ぐ。相手GUTS-40。さらに命中した場合、3回の行動の間30%の確率で相手を混乱させる' },
    kokonoe_shingan: { name: '九重神眼', cost: 40, type: 'int', hitRate: 75, force: 1.8, gutsDown: 15, effect: 'shield_self_20pct', desc: '九尾の瞳で相手を見据えて攻撃する。相手GUTS-15。さらに命中した場合、自身の最大ライフの20%に相当するシールドを展開する' },
    tenga_tensho: { name: '天河天翔', cost: 55, type: 'int', hitRate: 60, force: 2.6, gutsDown: 20, effect: 'perma_dmg_up_20', desc: '天空を駆け巡る霊力の奔流を叩き込む最大の切り札。相手GUTS-20。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- 敵・ボス共用 ---
    boss_bite: { name: 'かみつき', cost: 20, type: 'pow', hitRate: 75, force: 1.2, gutsDown: 10, effect: null, desc: '鋭い牙でガッツを奪う攻撃' },
    boss_roll: { name: 'ローリング激突', cost: 40, type: 'pow', hitRate: 65, force: 2.4, gutsDown: 20, effect: null, desc: '大回転で激突してガッツを奪う' },
    boss_focus: { name: 'きあい', cost: 10, type: 'buff_pow', hitRate: 100, force: 0, gutsDown: 0, effect: 'pow_up', desc: '攻撃力を上昇させる' },
    boss_laser: { name: 'サイコブラスト', cost: 45, type: 'int', hitRate: 70, force: 2.6, gutsDown: 30, effect: null, desc: '精神力を収束させた衝撃波' },
    boss_meteor: { name: 'メテオバースト', cost: 55, type: 'int', hitRate: 70, force: 3.2, gutsDown: 45, effect: null, desc: '巨大な隕石を放つ大技' },

    // --- ハム系統 ---
    one_two_punch: { name: 'ワンツーパンチ', cost: 15, type: 'pow', hitRate: 90, force: 0.7, gutsDown: 8, effect: null, desc: '素早い連続パンチの基本技。相手GUTS-8' },
    sobat: { name: 'ソバット', cost: 16, type: 'pow', hitRate: 82, force: 0.9, gutsDown: 8, effect: 'selfcrit_up_3', desc: '回転しながら蹴りを放つ基本技。相手GUTS-8。さらに命中した場合、3ターンの間自身のクリティカル率が25%アップする' },
    atamatsuki: { name: '頭つき', cost: 22, type: 'pow', hitRate: 88, force: 1.2, gutsDown: 12, effect: null, desc: '勢いよく頭突きを叩き込む命中重視技。相手GUTS-12' },
    seoinage: { name: '背負い投げ', cost: 32, type: 'pow', hitRate: 68, force: 2.0, gutsDown: 20, effect: 'def_down_15', desc: '相手を担ぎ上げて叩きつける大技。相手GUTS-20。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    cho_atamatsuki: { name: '超頭つき', cost: 38, type: 'pow', hitRate: 85, force: 1.7, gutsDown: 15, effect: null, desc: '頭突きを強化した高命中の一撃。相手GUTS-15' },
    machinegun_punch: { name: 'マシンガンパンチ', cost: 42, type: 'pow', hitRate: 70, force: 2.3, gutsDown: 18, effect: null, desc: '連射式の高速パンチの雨あられ。相手GUTS-18' },
    onara: { name: 'おなら', cost: 35, type: 'int', hitRate: 78, force: 1.0, gutsDown: 35, effect: 'blind_2', desc: '強烈な臭気で相手の闘志を大きく削ぐ。相手GUTS-35。さらに命中した場合、2ターンの間相手の目を眩ませ命中率を下げる' },
    cho_ogoe: { name: '超大声', cost: 45, type: 'int', hitRate: 65, force: 2.6, gutsDown: 20, effect: 'confuse_30', desc: '遠方まで届く必殺の大絶叫。相手GUTS-20。さらに命中した場合、3回の行動の間30%の確率で相手を混乱させる'},

    // --- アローヘッド系統 ---
    tail_attack: { name: 'テイルアタック', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 8, effect: null, desc: '硬い尾を叩きつける基本技。相手GUTS-8' },
    zoom_punch: { name: 'ズームパンチ', cost: 20, type: 'pow', hitRate: 88, force: 1.1, gutsDown: 10, effect: null, desc: 'コスパに優れる標準的な打撃技。相手GUTS-10' },
    rocket_punch: { name: 'ロケットパンチ', cost: 40, type: 'pow', hitRate: 68, force: 2.2, gutsDown: 18, effect: 'def_down_15', desc: '拳を撃ち出す大ダメージ技。相手GUTS-18。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    needle_turn: { name: 'ニードルターン', cost: 25, type: 'pow', hitRate: 78, force: 1.4, gutsDown: 12, effect: null, desc: '回転しながら針を突き刺す連続技。相手GUTS-12' },
    w_needle_turn: { name: 'Wニードルターン', cost: 35, type: 'pow', hitRate: 72, force: 1.8, gutsDown: 15, effect: null, desc: '針の連続突きを2連続で放つ。相手GUTS-15' },
    tornado_attack: { name: '竜巻アタック', cost: 45, type: 'pow', hitRate: 65, force: 2.4, gutsDown: 20, effect: 'hitdown_stack_3', desc: '体を回転させ竜巻を起こす豪快な大技。相手GUTS-20。さらに命中した場合、砂塵が舞い相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tail_blade: { name: 'テイルブレード', cost: 28, type: 'pow', hitRate: 75, force: 1.3, gutsDown: 30, effect: 'def_down_15', desc: '鋭い尾で斬りつけ闘志を大きく削ぐ。相手GUTS-30。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    jiraibari: { name: '地雷針', cost: 30, type: 'int', hitRate: 90, force: 1.2, gutsDown: 12, effect: 'dot_mine', desc: '地中の針を遠隔操作する高命中の遠距離技。相手GUTS-12。さらに命中した場合、3ターンの間毎ターン継続ダメージを与える' },

    // --- ネンドロ系統 ---
    zoom_punch_nendoro: { name: 'ズームパンチ', cost: 18, type: 'pow', hitRate: 90, force: 1.0, gutsDown: 10, effect: null, desc: '踏み込んで放つ正確な一撃。相手GUTS-10' },
    mach_punch: { name: 'マッハパンチ', cost: 30, type: 'pow', hitRate: 80, force: 1.8, gutsDown: 15, effect: 'selfcrit_up_3', desc: '目にも留まらぬ速さの高速連打。相手GUTS-15。さらに命中した場合、3ターンの間自身のクリティカル率が25%アップする' },
    meido_no_miyage: { name: 'めいどのみやげ', cost: 50, type: 'pow', hitRate: 62, force: 2.9, gutsDown: 25, effect: 'dot_mine', desc: '渾身の力を込めた極悪の一撃。相手GUTS-25。さらに命中した場合、強烈な後遺症で3ターンの間継続ダメージを与える' },
    ganduke: { name: 'がん飛ばし', cost: 14, type: 'pow', hitRate: 92, force: 0.6, gutsDown: 6, effect: null, desc: '威圧するような軽い張り手の基本技。相手GUTS-6' },
    body_press_nendoro: { name: 'ボディプレス', cost: 33, type: 'pow', hitRate: 74, force: 1.9, gutsDown: 18, effect: 'def_down_15', desc: '全体重を乗せた押しつぶし。相手GUTS-18。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },

    // --- ヘンガー系統 ---
    w_kick: { name: 'Wキック', cost: 20, type: 'pow', hitRate: 78, force: 1.3, gutsDown: 10, effect: null, desc: '命中はやや低いが威力の高い二段蹴り。相手GUTS-10' },
    laser_blade: { name: 'レーザーブレード', cost: 15, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 8, effect: null, desc: '腕から放つ小型の光刃による基本技。相手GUTS-8' },
    laser_cutter: { name: 'レーザーカッター', cost: 32, type: 'int', hitRate: 78, force: 1.6, gutsDown: 15, effect: 'dot_mine', desc: '収束させた光線で斬り裂く。相手GUTS-15。さらに命中した場合、レーザーの傷跡により3ターンの間継続ダメージを与える' },
    w_laser_sword: { name: 'Wレーザーソード', cost: 26, type: 'int', hitRate: 88, force: 1.3, gutsDown: 12, effect: null, desc: '2連続の光刃による命中重視技。相手GUTS-12' },
    drill_rocket: { name: 'ドリルロケット', cost: 38, type: 'pow', hitRate: 72, force: 2.1, gutsDown: 15, effect: null, desc: '回転するドリルを撃ち出す。相手GUTS-15' },
    w_drill_rocket: { name: 'Wドリルロケット', cost: 48, type: 'pow', hitRate: 68, force: 2.5, gutsDown: 18, effect: 'def_down_15', desc: '2発同時に放つドリルロケットの強化版。相手GUTS-18。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    napalm_cannon: { name: 'ナパームキャノン', cost: 50, type: 'int', hitRate: 70, force: 2.7, gutsDown: 22, effect: 'dot_mine', desc: '内蔵砲門から放つ最大火力の砲撃。相手GUTS-22。さらに命中した場合、火傷により3ターンの間継続ダメージを与える' },

    // --- デュラハン系統 ---
    cho_dash_giri: { name: '超ダッシュ斬り', cost: 20, type: 'pow', hitRate: 85, force: 1.1, gutsDown: 10, effect: null, desc: '踏み込みながら剣を振るう基本技。相手GUTS-10' },
    midaretsuki: { name: '乱れ突き', cost: 28, type: 'pow', hitRate: 82, force: 1.5, gutsDown: 12, effect: null, desc: '剣による素早い連続突き。相手GUTS-12' },
    mappufutatsu: { name: 'まっぷたつ', cost: 42, type: 'pow', hitRate: 68, force: 2.3, gutsDown: 18, effect: 'dot_mine', desc: '巨大な剣で真っ二つに斬り裂く大技。相手GUTS-18。さらに命中した場合、深い傷跡が3ターンの間継続ダメージとなる' },
    combo_punch: { name: 'コンボパンチ', cost: 48, type: 'pow', hitRate: 70, force: 2.5, gutsDown: 20, effect: 'selfcrit_up_3', desc: '拳と剣を織り交ぜた渾身の連続攻撃。相手GUTS-20。さらに命中した場合、3ターンの間自身のクリティカル率が25%アップする' },
    daisharin: { name: '大車輪', cost: 40, type: 'pow', hitRate: 65, force: 2.2, gutsDown: 15, effect: 'hitdown_stack_3', desc: '剣を大きく振り回す遠距離の大技。相手GUTS-15。さらに命中した場合、目眩ましとなり相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    fujinken: { name: '風神剣', cost: 25, type: 'int', hitRate: 88, force: 1.2, gutsDown: 25, effect: 'paralyze_25', desc: '風を纏った剣閃で相手の闘志を削ぐ。相手GUTS-25。さらに命中した場合、風圧で怯み2回の行動の間25%の確率で相手を行動不能にする' },
    raijinken: { name: '雷神剣', cost: 45, type: 'int', hitRate: 66, force: 2.6, gutsDown: 20, effect: 'paralyze_25', desc: '雷を纏わせた渾身の一閃。相手GUTS-20。さらに命中した場合、感電により2回の行動の間25%の確率で相手を行動不能にする' },

    // --- ゴーレム系統 ---
    dekopin: { name: 'でこぴん', cost: 12, type: 'pow', hitRate: 90, force: 0.5, gutsDown: 6, effect: null, desc: '軽く弾き飛ばす基本技。相手GUTS-6' },
    shoda: { name: '掌打', cost: 16, type: 'pow', hitRate: 85, force: 0.8, gutsDown: 10, effect: null, desc: '手のひらで打ちつける基本技。相手GUTS-10' },
    claw_nage: { name: 'クロー投げ', cost: 30, type: 'pow', hitRate: 80, force: 1.6, gutsDown: 15, effect: 'def_down_15', desc: '鋭い爪で捉えて投げ飛ばす命中重視技。相手GUTS-15。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    double_chop: { name: 'ダブルチョップ', cost: 24, type: 'pow', hitRate: 78, force: 1.3, gutsDown: 12, effect: null, desc: '両腕を交互に振り下ろす連続技。相手GUTS-12' },
    guruguru_attack: { name: 'ぐるぐるアタック', cost: 45, type: 'pow', hitRate: 66, force: 2.4, gutsDown: 20, effect: 'self_dizzy', desc: '巨体を回転させる遠距離の大技。相手GUTS-20。ただし勢い余って自身も目を回し、次の1ターン自身の命中率が低下する' },
    nobiru_punch: { name: 'のびーるパンチ', cost: 36, type: 'pow', hitRate: 70, force: 2.0, gutsDown: 15, effect: 'hitdown_stack_3', desc: '腕を伸ばして遠くまで殴りつける。相手GUTS-15。さらに命中した場合、相手の視界を乱し命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    jishin: { name: '地震', cost: 30, type: 'int', hitRate: 82, force: 0.9, gutsDown: 35, effect: 'def_down_15', desc: '大地を揺るがし相手の闘志を大きく削ぐ。相手GUTS-35。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },

    // --- カワズモー系統 ---
    harite: { name: 'はり手', cost: 15, type: 'pow', hitRate: 74, force: 1.05, gutsDown: 6, critBonus: 0, effect: null, desc: '素早い張り手で相手の頬を打つ基本技。相手GUTS-6' },
    gappuri_yotsu: { name: 'がっぷりよつ', cost: 28, type: 'pow', hitRate: 78, force: 1.5, gutsDown: 15, critBonus: 0.10, effect: 'def_down_15', desc: 'がっちりと組み合い、渾身の力で相手の体勢を崩す。相手GUTS-15。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    uwatenage: { name: '上手投げ', cost: 28, type: 'pow', hitRate: 64, force: 1.75, gutsDown: 18, critBonus: 0.17, effect: null, desc: '渾身の力を込めて相手を豪快に投げ飛ばす。命中率は低いが会心の一撃になりやすい。相手GUTS-18' },
    kawazutsuki: { name: 'かわずつき', cost: 21, type: 'pow', hitRate: 66, force: 0.85, gutsDown: 9, critBonus: 0.17, effect: 'selfcrit_up_3', desc: '蛙のように鋭く跳びかかって突く。相手GUTS-9。さらに命中した場合、闘志が高まり3ターンの間自身のクリティカル率が25%アップする' },
    renzoku_harite: { name: '連続はり手', cost: 27, type: 'pow', hitRate: 90, force: 1.35, gutsDown: 6, critBonus: 0.05, effect: 'hitdown_stack_3', desc: '両手による高速の張り手を連続で叩き込む高命中技。相手GUTS-6。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    tobi_harite: { name: '飛びはり手', cost: 19, type: 'pow', hitRate: 86, force: 0.75, gutsDown: 5, critBonus: 0.05, effect: null, desc: '飛び上がりながら繰り出す張り手。命中率が高い基本技。相手GUTS-5' },
    kaeru_no_shita: { name: 'かえるのした', cost: 16, type: 'int', hitRate: 72, force: 0.85, gutsDown: 25, critBonus: 0.17, effect: 'paralyze_25', desc: '長い舌を伸ばして絡めとる。相手GUTS-25。さらに命中した場合、舌に絡め取られ2回の行動の間25%の確率で相手を行動不能にする' },
    dai_kaiten_otoshi: { name: '大回転落とし', cost: 50, type: 'pow', hitRate: 70, force: 2.8, gutsDown: 18, critBonus: 0, effect: 'def_down_15', desc: '巨体で大きく回転し、渾身の力で相手を叩き落とす切り札。相手GUTS-18。さらに命中した場合、衝撃で3ターンの間相手の丈夫さを15%低下させる' },
    kaeru_no_uta: { name: 'かえるのうた', cost: 40, type: 'int', hitRate: 90, force: 0.2, gutsDown: 42, critBonus: 0.10, effect: 'confuse_30', desc: '独特な鳴き声の合唱で相手の闘志を大きく削ぐ高命中技。相手GUTS-42。さらに命中した場合、3回の行動の間30%の確率で相手を混乱させる' },
    bakudan_nage: { name: 'ばくだん投げ', cost: 28, type: 'int', hitRate: 73, force: 2.05, gutsDown: 30, critBonus: 0.03, effect: 'dot_mine', desc: '爆弾を模した重い物体を放り投げる大技。相手GUTS-30。さらに命中した場合、爆発の後遺症で3ターンの間継続ダメージを与える' },

    // --- ヒノトリ系統 ---
    kuchibashi: { name: 'くちばし', cost: 16, type: 'pow', hitRate: 70, force: 0.5, gutsDown: 4, critBonus: 0, effect: null, desc: '鋭いくちばしで相手を鋭くつつく基本技。相手GUTS-4' },
    renzoku_kagizume: { name: '連続かぎづめ', cost: 25, type: 'pow', hitRate: 72, force: 1.2, gutsDown: 26, critBonus: 0.08, effect: 'hitdown_stack_3', desc: '鋭い鉤爪で相手を連続して切り裂く。相手GUTS-26。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    flame_typhoon: { name: 'フレイムタイフーン', cost: 30, type: 'int', hitRate: 82, force: 1.85, gutsDown: 12, critBonus: 0.25, effect: 'def_down_15', desc: '燃え盛る炎の竜巻を巻き起こし相手を包み込む。相手GUTS-12。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    otakebi: { name: '雄叫び', cost: 20, type: 'int', hitRate: 65, force: 1.05, gutsDown: 27, critBonus: 0.03, effect: 'weaken_pow_int', desc: '大地を震わせる猛々しい咆哮で相手を威圧する。相手GUTS-27。さらに命中した場合、3ターンの間相手の「ちから」「かしこさ」が10%低下する' },
    bakuretsu_otoshi: { name: '爆裂落とし', cost: 38, type: 'pow', hitRate: 58, force: 1.65, gutsDown: 7, critBonus: 0.15, effect: 'dot_mine', desc: '爆炎を纏った巨体で相手に叩き落とす豪快な一撃。相手GUTS-7。さらに命中した場合、火傷の後遺症で3ターンの間継続ダメージを与える' },
    flame_line: { name: 'フレイムライン', cost: 25, type: 'int', hitRate: 95, force: 1.1, gutsDown: 16, critBonus: 0.25, effect: 'blind_2', desc: '一直線に炎を放つ回避困難な高命中技。相手GUTS-16。さらに命中した場合、閃光で2ターンの間相手の目を眩ませ命中率を下げる' },
    flame_beam: { name: 'フレイムビーム', cost: 25, type: 'int', hitRate: 70, force: 2.1, gutsDown: 4, critBonus: 0, effect: null, desc: '収束させた炎のエネルギーを一直線に放つ。相手GUTS-4' },
    fire_bird: { name: 'ファイヤーバード', cost: 40, type: 'pow', hitRate: 88, force: 1.7, gutsDown: 11, critBonus: 0.08, effect: 'selfcrit_up_3', desc: '炎をまとった火の鳥と化して急降下する。相手GUTS-11。さらに命中した場合、闘志が高まり3ターンの間自身のクリティカル率が25%アップする' },
    fire_wave: { name: 'ファイアウェーブ', cost: 43, type: 'int', hitRate: 87, force: 2.6, gutsDown: 18, critBonus: 0.12, effect: 'dot_mine', desc: '灼熱の炎を大波のようにぶつける豪快な大技。相手GUTS-18。さらに命中した場合、火傷の後遺症で3ターンの間継続ダメージを与える' },
    ebony_nova: { name: 'エボニーノヴァ', cost: 54, type: 'int', hitRate: 82, force: 3.2, gutsDown: 3, critBonus: 0.16, effect: 'perma_dmg_up_20', desc: '漆黒の炎を極限まで凝縮し解き放つ、この上ない最大の切り札。相手GUTS-3。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' },

    // --- ガリ系統 ---
    knuckle: { name: 'ナックル', cost: 18, type: 'pow', hitRate: 77, force: 0.85, gutsDown: 4, critBonus: 0, effect: null, desc: '拳を握り込んで叩きつける基本技。相手GUTS-4' },
    holy_fire: { name: 'ホーリーファイヤー', cost: 31, type: 'int', hitRate: 64, force: 2.15, gutsDown: 12, critBonus: 0.10, effect: 'dot_mine', desc: '神聖な炎を呼び出し相手を焼き尽くす。相手GUTS-12。さらに命中した場合、聖なる火傷で3ターンの間継続ダメージを与える' },
    god_bless: { name: 'ゴッドブレス', cost: 36, type: 'int', hitRate: 89, force: 1.7, gutsDown: 13, critBonus: 0.14, effect: 'next_force_up', desc: '天よりの祝福を身にまとい相手を打つ高命中技。相手GUTS-13。さらに命中した場合、自身が次に繰り出す技の威力が50%アップする' },
    press: { name: 'プレス', cost: 25, type: 'pow', hitRate: 57, force: 1.65, gutsDown: 8, critBonus: 0.03, effect: 'def_down_15', desc: '全体重を乗せて相手を押し潰す。相手GUTS-8。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    hurricane: { name: 'ハリケーン', cost: 19, type: 'int', hitRate: 63, force: 1.4, gutsDown: 11, critBonus: 0.04, effect: 'blind_2', desc: '暴風を巻き起こし相手に叩きつける。相手GUTS-11。さらに命中した場合、砂塵で2ターンの間相手の目を眩ませ命中率を下げる' },
    holy_earth: { name: 'ホーリーアース', cost: 28, type: 'int', hitRate: 66, force: 1.35, gutsDown: 27, critBonus: 0.25, effect: 'def_down_15', desc: '大地の聖なる力を呼び覚まし激しく揺るがす。相手GUTS-27。さらに命中した場合、3ターンの間相手の丈夫さを15%低下させる' },
    spin_cutter: { name: 'スピンカッター', cost: 22, type: 'pow', hitRate: 71, force: 0.9, gutsDown: 3, critBonus: 0.12, effect: 'hitdown_stack_3', desc: '身を回転させ鋭い一撃を叩き込む。相手GUTS-3。さらに命中した場合、目が眩み相手の命中率が10%低下する（最大3回まで累積、バトル終了まで持続）' },
    straight: { name: 'ストレート', cost: 15, type: 'pow', hitRate: 74, force: 0.75, gutsDown: 6, critBonus: 0.08, effect: null, desc: '基本に忠実な真っ直ぐな一撃。相手GUTS-6' },
    holy_icicle: { name: 'ホーリーアイシクル', cost: 27, type: 'int', hitRate: 78, force: 1.5, gutsDown: 17, critBonus: 0.17, effect: 'paralyze_25', desc: '神聖な氷柱を呼び出し相手を貫く。相手GUTS-17。さらに命中した場合、凍りつき2回の行動の間25%の確率で相手を行動不能にする' },
    big_spin_cutter: { name: '大スピンカッター', cost: 26, type: 'pow', hitRate: 62, force: 1.15, gutsDown: 18, critBonus: 0.26, effect: 'selfcrit_up_3', desc: '大きく回転しながら渾身の一撃を叩き込む。相手GUTS-18。さらに命中した場合、闘志が高まり3ターンの間自身のクリティカル率が25%アップする' },
    god_final: { name: 'ゴッドファイナル', cost: 40, type: 'pow', hitRate: 69, force: 2.7, gutsDown: 2, critBonus: 0.14, effect: 'perma_dmg_up_20', desc: '神の力を宿した拳を叩き込む、この上ない最大の切り札。相手GUTS-2。さらに命中した場合、自身が今後与えるダメージが永続的に20%アップする' }
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
function getGutsModifiers(guts) {
    // 攻撃側のガッツが50を基準(1.0)とする
    // ガッツ0で最低補正(ダメージ0.5倍、命中-15%)
    // ガッツ100で最高補正(ダメージ1.5倍、命中+15%)
    const base = 50;
    const diff = guts - base;
    
    const dmgMod = 1.0 + (diff * 0.01); // 0.5倍 〜 1.5倍
    const hitMod = diff * 0.3;          // -15% 〜 +15%
    
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
    if (type === 'heal' || type === 'buff_guts' || type === 'buff_pow') return 'G';
    if (force >= 3.0) return 'S+';
    if (force >= 2.5) return 'S';
    if (force >= 2.0) return 'A';
    if (force >= 1.8) return 'B+';
    if (force >= 1.6) return 'B';
    if (force >= 1.3) return 'C';
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
    return Math.max(1, Math.floor(damageDealt * 0.2));
}

// =====================================================
// 新規状態効果ヘルパー（モノリスの技「わらわら」「サケビ声」「オーロラゲート」用）
// 育成中バトル(game.js)／マスモンCPU対戦(masmon_battle.js)／
// リアルタイム対戦(masmon_realtime_battle.js) の3系統から共通で利用する。
// 対象ユニットは weakenTurns / confuseTurns / forceBoost の3フィールドを持つ前提。
// =====================================================

// --- 技が命中した際の追加効果（衰弱／混乱／次技威力アップ）を適用する ---
// caster: 技を撃った側のユニット, target: 技を受けた側のユニット, sk: 実効技データ（force/hitRate反映済み）
// 戻り値: 追加効果のログメッセージ配列
function applySkillOnHitEffect(caster, target, sk) {
    const logs = [];
    if (!sk || !sk.effect) return logs;

    if (sk.effect === 'weaken_pow_int') {
        target.weakenTurns = 3;
        logs.push(`💢 ${target.name} の「ちから」「かしこさ」が3ターンの間10%低下した！`);
    } else if (sk.effect === 'confuse_30') {
        target.confuseTurns = 3;
        logs.push(`❓ ${target.name} は混乱状態になった！（3回の行動の間、30%の確率で行動に失敗する）`);
    } else if (sk.effect === 'next_force_up') {
        caster.forceBoost = 0.5;
        logs.push(`✨ ${caster.name} の次の技の威力が50%アップした！`);
    } else if (sk.effect === 'perma_dmg_up_20') {
        if (caster.permaForceBoostActive) {
            logs.push(`（${caster.name} はすでに天河天翔の効果を得ているため、追加のダメージアップは発生しなかった）`);
        } else {
            caster.permaForceBoostActive = true;
            logs.push(`✨ ${caster.name} の全身に霊力が満ち、今後与えるダメージが永続的に1.2倍になった！`);
        }
    } else if (sk.effect === 'guaranteed_dodge_next') {
        caster.dodgeNextGuaranteed = true;
        logs.push(`🌫️ ${caster.name} は陽炎に包まれ、次の敵の攻撃を確実に回避する構えを取った！`);
    } else if (sk.effect === 'shield_self_20pct') {
        if (caster.shieldUsedThisBattle) {
            logs.push(`（${caster.name} の九重神眼はすでに使用済みのため、シールドは展開されなかった）`);
        } else {
            // ライフ構造の違い（stats.maxLife か maxLife か）を吸収して両対応させる
            const maxLifeVal = caster.stats ? caster.stats.maxLife : caster.maxLife;
            caster.shieldValue = Math.floor(maxLifeVal * 0.2);
            caster.shieldUsedThisBattle = true;
            logs.push(`🛡️ ${caster.name} は自身の最大ライフの20%（${caster.shieldValue}）に相当するシールドを展開した！（このバトル中は再展開不可）`);
        }
    // ---------- 「ガッツファクトリー」新規種族技用の追加効果 ----------
    } else if (sk.effect === 'blind_2') {
        target.blindTurns = 2;
        logs.push(`💨 ${target.name} は強烈な臭気で目が眩んだ！（2ターンの間、命中率が低下する）`);
    } else if (sk.effect === 'def_down_15') {
        target.defDownTurns = 3;
        logs.push(`💥 ${target.name} の防御が崩れた！（3ターンの間、丈夫さが15%低下する）`);
    } else if (sk.effect === 'dot_mine') {
        target.dotTurns = 3;
        target.dotPct = 0.08;
        logs.push(`🩸 ${target.name} に深い傷が刻まれた！（3ターンの間、毎ターン最大ライフの8%の継続ダメージを受ける）`);
    } else if (sk.effect === 'paralyze_25') {
        target.paralyzeTurns = 2;
        logs.push(`⚡ ${target.name} は感電し痺れが走った！（2回の行動の間、25%の確率で行動に失敗する）`);
    } else if (sk.effect === 'self_dizzy') {
        caster.blindTurns = Math.max(caster.blindTurns || 0, 1);
        logs.push(`😵 ${caster.name} は勢い余って目を回してしまった！（1ターンの間、自身の命中率が低下する）`);
    } else if (sk.effect === 'hitdown_stack_3') {
        target.hitDownStacks = Math.min(3, (target.hitDownStacks || 0) + 1);
        logs.push(`🏜️ ${target.name} の命中率が低下した！（累積 ${target.hitDownStacks}/3 ・ 1回につき10%低下、バトル終了まで持続）`);
    } else if (sk.effect === 'selfcrit_up_3') {
        caster.critBonusTurns = Math.max(caster.critBonusTurns || 0, 3);
        logs.push(`🔥 ${caster.name} は闘志を燃やした！（3ターンの間、クリティカル率が25%アップ）`);
    } else if (sk.effect === 'self_heal_15pct') {
        const maxLifeVal = caster.stats ? caster.stats.maxLife : caster.maxLife;
        const healAmount = Math.floor(maxLifeVal * 0.15);
        caster.stats.life = Math.min(caster.stats.maxLife, caster.stats.life + healAmount);
        logs.push(`💚 ${caster.name} は自身のライフを ${healAmount} 回復した！(現在: ${Math.floor(caster.stats.life)})`);
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
// 戻り値: { confused: true/false, dotDamage: 数値 }
//   confused=true の場合、そのターンは混乱／痺れにより行動失敗
//   dotDamage>0 の場合、継続ダメージ技（まっぷたつ・地雷針等）による自動ダメージが発生している
//   （実際にライフへ反映する処理は各バトルエンジン側で行う）
function tickStatusTurnsAndCheckConfusion(unit) {
    if (!unit) return { confused: false, dotDamage: 0 };

    let dotDamage = 0;
    if (unit.dotTurns > 0) {
        const maxLifeVal = unit.stats ? unit.stats.maxLife : unit.maxLife;
        dotDamage = Math.max(1, Math.floor((maxLifeVal || 0) * (unit.dotPct || 0.08)));
        unit.dotTurns--;
    }

    if (unit.weakenTurns > 0) unit.weakenTurns--;
    if (unit.defDownTurns > 0) unit.defDownTurns--;
    if (unit.blindTurns > 0) unit.blindTurns--;

    let failed = false;
    if (unit.confuseTurns > 0) {
        unit.confuseTurns--;
        if (Math.random() < 0.30) failed = true;
    }
    if (unit.paralyzeTurns > 0) {
        unit.paralyzeTurns--;
        if (Math.random() < 0.25) failed = true;
    }

    return { confused: failed, dotDamage };
}

// --- 衰弱状態を加味した実効ステータス値（ちから／かしこさ）を返す ---
function getWeakenedStat(unit, statVal) {
    if (unit && unit.weakenTurns > 0) {
        return Math.floor(statVal * 0.9);
    }
    return statVal;
}

// --- 防御崩し状態（地震・地雷針等）を加味した実効「丈夫さ」を返す ---
function getDefDownStat(unit, defVal) {
    if (unit && unit.defDownTurns > 0) {
        return Math.floor(defVal * 0.85);
    }
    return defVal;
}

// --- 目眩まし状態（おなら・自滅めまい等）および累積命中低下（砂かけ等）による命中率補正（マイナス値）を返す ---
function getBlindHitPenalty(unit) {
    if (!unit) return 0;
    const blindPenalty = (unit.blindTurns > 0) ? 15 : 0;
    const stackPenalty = (unit.hitDownStacks || 0) * 10;
    return blindPenalty + stackPenalty;
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

// --- トレーニングデータベース ---
const TRAINING_DB = [
    { id: 'run', name: '走り込み', cost: 20, mainStat: 'maxLife', mainVal: 15, desc: 'ライフが増加する軽めのトレーニング。', type: 'light' },
    { id: 'domino', name: 'ドミノ倒し', cost: 20, mainStat: 'pow', mainVal: 15, desc: '集中力を切らさずちからが増加する。', type: 'light' },
    { id: 'study', name: '猛勉強', cost: 20, mainStat: 'int', mainVal: 15, desc: '書を読みふけりかしこさが増加する。', type: 'light' },
    { id: 'shoot', name: 'しゃてき', cost: 20, mainStat: 'hit', mainVal: 15, desc: '的な正確に狙い命中が増加する。', type: 'light' },
    { id: 'dodge', name: '巨石よけ', cost: 20, mainStat: 'spd', mainVal: 15, desc: '降る岩を避けて回避が増加する。', type: 'light' },
    { id: 'wood', name: '丸太うけ', cost: 20, mainStat: 'def', mainVal: 15, desc: '体当たりを受け止め丈夫さが増加。', type: 'light' },
    
    // 重トレーニング
    { id: 'pull', name: '重り引き', cost: 35, mainStat: 'pow', mainVal: 25, extraStat: 'maxLife', extraVal: 15, penaltyStat: 'spd', penaltyVal: 10, desc: 'ちからが大増加・ライフが増加、回避が減少。', type: 'heavy' },
    { id: 'meditate', name: 'めいそう', cost: 35, mainStat: 'int', mainVal: 25, extraStat: 'hit', extraVal: 15, penaltyStat: 'def', penaltyVal: 10, desc: 'かしこさが大増加・命中が増加、丈夫さが減少。', type: 'heavy' },
    { id: 'floor', name: '変動ゆか', cost: 35, mainStat: 'spd', mainVal: 25, extraStat: 'int', extraVal: 15, penaltyStat: 'pow', penaltyVal: 10, desc: '回避が大増加・かしこさが増加、ちからが減少。', type: 'heavy' },
    { id: 'pool', name: 'プール', cost: 35, mainStat: 'def', mainVal: 25, extraStat: 'maxLife', extraVal: 15, penaltyStat: 'int', penaltyVal: 10, desc: '丈夫さが大増加・ライフが増加、かしこさが減少。', type: 'heavy' }
];

// --- アイテムデータベース ---
const ITEMS_DB = {
    energy_drink: { id: 'energy_drink', name: '消夏ドリンク', icon: '🧪', desc: '体力を 30 回復する。ブリーダー御用達のドリンク。', type: 'fatigue', value: 30 },
    guts_drink: { id: 'guts_drink', name: '万華ドリンク', icon: '🍷', desc: '体力を 60 回復する。疲労を急速に吹き飛ばす秘薬。', type: 'fatigue', value: 60 },
    power_jelly: { id: 'power_jelly', name: 'ちからの飴', icon: '🍬', desc: 'ちからが永続的にアップする(高ステータス時逓減あり)。', type: 'stat', stat: 'pow', value: 10 },
    smart_jelly: { id: 'smart_jelly', name: 'かしこさの飴', icon: '🍭', desc: 'かしこさが永続的にアップする(高ステータス時逓減あり)。', type: 'stat', stat: 'int', value: 10 },
    hp_bread: { id: 'hp_bread', name: 'ライフパン', icon: '🍞', desc: '最大ライフがアップし、さらにライフも同量回復する。', type: 'stat', stat: 'maxLife', value: 15 },
    
    // トレーニング効果アップアイテム
    steel_domino: { id: 'steel_domino', name: '鋼鉄ドミノ', icon: '🏋️', desc: '次回のドミノ倒しのトレーニング効果が2倍になる超重量ドミノ。', type: 'train_boost', targetTraining: 'domino', multiplier: 2.0 },
    silent_room: { id: 'silent_room', name: '無音ルーム', icon: '🔕', desc: '次回のめいそうのトレーニング効果が2倍になる完全防音の修練室。', type: 'train_boost', targetTraining: 'meditate', multiplier: 2.0 },
    speed_track: { id: 'speed_track', name: '高速トラック', icon: '🏃', desc: '次回の走り込みのトレーニング効果が2倍になるプロ仕様のコース。', type: 'train_boost', targetTraining: 'run', multiplier: 2.0 },
    sniper_scope: { id: 'sniper_scope', name: '精密スコープ', icon: '🔭', desc: '次回のしゃてきのトレーニング効果が2倍になる超精密照準器。', type: 'train_boost', targetTraining: 'shoot', multiplier: 2.0 },
    boulder_suit: { id: 'boulder_suit', name: '岩石スーツ', icon: '🪨', desc: '次回の巨石よけのトレーニング効果が2倍になる特製加重スーツ。', type: 'train_boost', targetTraining: 'dodge', multiplier: 2.0 },
    iron_log: { id: 'iron_log', name: '鋼鉄丸太', icon: '⚙️', desc: '次回の丸太うけのトレーニング効果が2倍になる超重量丸太。', type: 'train_boost', targetTraining: 'wood', multiplier: 2.0 },
    
    // 行き先選択型コンパス
    compass_battle: { id: 'compass_battle', name: '運命のコンパス', icon: '🧭', desc: '使用すると、次の探索先を自分で自由に選択できる。', type: 'compass', target: 'any' },
    compass_train: { id: 'compass_train', name: '運命のコンパス', icon: '🧭', desc: '使用すると、次の探索先を自分で自由に選択できる。', type: 'compass', target: 'any' },
    compass_event: { id: 'compass_event', name: '運命のコンパス', icon: '🧭', desc: '使用すると、次の探索先を自分で自由に選択できる。', type: 'compass', target: 'any' }
};

// =====================================================
// --- 装備アイテムデータベース ---
// 育成中の「宝箱発見」イベントやバトル終了後の低確率ドロップで入手する。
// クリア時にブリーダーID（getMyPlayerId）に紐づけて保存され、PvP（マスモン対戦）で
// 自分のマスモンに1つ装備させることができる。
// mode: 'normal' はノーマルモード産、'hard' はハードモード産（周回のご褒美として
//       ノーマルより高い数値・強力な特殊効果を持つ）。
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

    // ---------- オーラ連動装備（ノーマル・ハード共通ドロップ／各オーラ★1〜★3） ----------
    // 自身のオーラが requiredAura と一致する時のみ、ランダムに選ばれた2種類のステータスが上昇する。
    // 上昇幅はレア度（★の数）に応じて変化し、上昇するステータスの組み合わせは装備入手時に決定される。
    red_aura_amulet:  { id: 'red_aura_amulet',  name: '紅蓮のお守り', icon: '🔴', rarity: '★☆☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'red' },
    red_aura_ring:    { id: 'red_aura_ring',    name: '紅蓮の指輪',   icon: '🔴', rarity: '★★☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'red' },
    red_aura_crest:   { id: 'red_aura_crest',   name: '紅蓮の紋章',   icon: '🔴', rarity: '★★★', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'red' },

    blue_aura_amulet: { id: 'blue_aura_amulet', name: '蒼海のお守り', icon: '🔵', rarity: '★☆☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'blue' },
    blue_aura_ring:   { id: 'blue_aura_ring',   name: '蒼海の指輪',   icon: '🔵', rarity: '★★☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'blue' },
    blue_aura_crest:  { id: 'blue_aura_crest',  name: '蒼海の紋章',   icon: '🔵', rarity: '★★★', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'blue' },

    green_aura_amulet:{ id: 'green_aura_amulet',name: '翠緑のお守り', icon: '🟢', rarity: '★☆☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'green' },
    green_aura_ring:  { id: 'green_aura_ring',  name: '翠緑の指輪',   icon: '🟢', rarity: '★★☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'green' },
    green_aura_crest: { id: 'green_aura_crest', name: '翠緑の紋章',   icon: '🟢', rarity: '★★★', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'green' },

    yellow_aura_amulet:{ id: 'yellow_aura_amulet', name: '黄金のお守り', icon: '🟡', rarity: '★☆☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'yellow' },
    yellow_aura_ring:  { id: 'yellow_aura_ring',   name: '黄金の指輪',   icon: '🟡', rarity: '★★☆', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'yellow' },
    yellow_aura_crest: { id: 'yellow_aura_crest',  name: '黄金の紋章',   icon: '🟡', rarity: '★★★', mode: 'both', type: 'auraStat2', effect: 'auraStatUp', requiredAura: 'yellow' }
};

// --- オーラ連動装備（type: 'auraStat2'）の上昇候補ステータスと、レア度ごとの上昇幅 ---
// ライフ・命中や命中・回避、ちから・丈夫さ　等、2種類の組み合わせを装備入手時にランダム抽選する。
const AURA_STAT2_KEYS = ['maxLife', 'pow', 'int', 'hit', 'spd', 'def'];
const AURA_STAT2_RANGE_BY_RARITY = {
    '★☆☆': { maxLife: [15, 20], pow: [8, 11],  int: [8, 11],  hit: [8, 11],  spd: [8, 11],  def: [8, 11]  },
    '★★☆': { maxLife: [26, 32], pow: [13, 17], int: [13, 17], hit: [13, 17], spd: [13, 17], def: [13, 17] },
    '★★★': { maxLife: [40, 50], pow: [20, 26], int: [20, 26], hit: [20, 26], spd: [20, 26], def: [20, 26] }
};

// --- レア度ごとの抽選重み（★の数が少ないほど重みを大きくし、レア度間の出現率を均す） ---
// ハードモードは★★★装備の登録数が★☆☆・★★☆に比べて多いため、単純な均等抽選だと
// ★★★ばかりが出てすぐに★☆☆・★★☆が埋まらない状態になっていた。
// レア度単位で重みを持たせることで、登録数に関わらずどのレア度もまんべんなくドロップする。
const EQUIPMENT_RARITY_DROP_WEIGHT = {
    '★☆☆': 3,
    '★★☆': 2,
    '★★★': 1
};

// --- 装備ベースデータ1件から実際の所持インスタンス（個体値ロール済み）を生成する共通ヘルパー ---
// rollEquipmentInstance（通常/ハードの単純プール抽選）と、ガッツファクトリーの段階別カスタムプール抽選の両方から使う。
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

    if (base.type === 'auraStat2') {
        // 上昇ステータスをランダムに重複無く2種類選び、レア度に応じた範囲で数値を決定する
        const shuffled = [...AURA_STAT2_KEYS].sort(() => Math.random() - 0.5);
        const pickedKeys = shuffled.slice(0, 2);
        const rangeTable = AURA_STAT2_RANGE_BY_RARITY[base.rarity] || {};
        instance.rolledStats = pickedKeys.map(key => {
            const [min, max] = rangeTable[key] || [10, 15];
            return { key, value: Math.floor(Math.random() * (max - min + 1)) + min };
        });
    }

    return instance;
}

// --- 装備アイテムの入手：指定モードのプールからランダムに1つ選び、ランダム個体値を持つ「所持インスタンス」を生成する ---
// 同じ名前の装備でも取得時にランダムで数値が変動する（例：炎の爪：ちから20～25アップ）
function rollEquipmentInstance(mode) {
    const pool = Object.values(EQUIPMENT_DB).filter(e => e.mode === mode || e.mode === 'both');
    if (pool.length === 0) return null;

    // レア度ごとの重みを使った重み付き抽選（★の少ない装備ほど出やすくなる）
    const weights = pool.map(e => EQUIPMENT_RARITY_DROP_WEIGHT[e.rarity] || 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    let base = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll < 0) {
            base = pool[i];
            break;
        }
    }

    return buildEquipmentInstanceFromBase(base);
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
    if (base.type === 'auraStat2') {
        const auraName = (AURA_TYPES[base.requiredAura] || {}).name || base.requiredAura;
        const statsText = (instance.rolledStats || [])
            .map(s => `${getStatLabel(s.key)}+${s.value}`)
            .join('・');
        return `自身が${auraName}オーラの時、${statsText} アップ`;
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

// --- 装備の「自身オーラ○○の時、ランダム2種のステータスアップ」効果による補正値を取得 ---
// unitAuraKey: そのユニット自身が持つオーラ（PvPマスモンは育成中に選んだオーラを引き継ぐ）
// 戻り値: {pow, int, hit, spd, def, maxLife} （装備入手時にランダムで決まった2種類のみ値が入る）
function getEquipmentAuraStatBonuses(equipInstance, unitAuraKey) {
    const bonuses = { pow: 0, int: 0, hit: 0, spd: 0, def: 0, maxLife: 0 };
    if (!equipInstance || !unitAuraKey) return bonuses;
    const base = EQUIPMENT_DB[equipInstance.equipId];
    if (!base || base.effect !== 'auraStatUp') return bonuses;
    if (base.requiredAura !== unitAuraKey) return bonuses;

    (equipInstance.rolledStats || []).forEach(s => {
        if (bonuses.hasOwnProperty(s.key)) {
            bonuses[s.key] += s.value || 0;
        }
    });
    return bonuses;
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

// --- 敵テンプレート (種族反映) ---
const ENEMY_TEMPLATES = [
    { name: 'ハム', emoji: '🐇', type: 'ハム種', maxLife: 90, pow: 25, int: 20, hit: 40, spd: 45, def: 20, skills: ['shippobinta'] },
    { name: 'アローヘッド', emoji: '🦀', type: 'アローヘッド種', maxLife: 110, pow: 35, int: 15, hit: 35, spd: 20, def: 55, skills: ['kamitsuki'] },
    { name: 'ネンドロ', emoji: '👤', type: 'ネンドロ種', maxLife: 100, pow: 20, int: 35, hit: 45, spd: 30, def: 35, skills: ['nameru'] }, // なめる（必中技）持ち
    { name: 'ヘンガー', emoji: '🤖', type: 'ヘンガー種', maxLife: 95, pow: 35, int: 30, hit: 55, spd: 30, def: 40, skills: ['kamitsuki', 'sunakake'] },
    { name: 'プラント', emoji: '🌸', type: 'プラント種', maxLife: 130, pow: 15, int: 40, hit: 40, spd: 25, def: 30, skills: ['nameru'] } // なめる（必中技）持ち
];

// 各ボスの強さ
const BOSS_TEMPLATES = {
    10: { name: '中ボス：ゴビ', emoji: '🗿', type: 'ゴーレム種', maxLife: 210, pow: 75, int: 10, hit: 30, spd: 10, def: 45, skills: ['boss_bite', 'boss_roll'] },
    20: { name: '中ボス：デュラハン', emoji: '🛡️', type: 'デュラハン種', maxLife: 320, pow: 28, int: 14, hit: 30, spd: 40, def: 55, skills: ['boss_bite', 'boss_roll', 'boss_focus'] },
    // モストに低消費ガッツ技および必中技を完備してハメを封殺
    30: { name: '伝説の邪神：モスト', emoji: '👿', type: 'モッチー種', maxLife: 550, pow: 42, int: 42, hit: 65, spd: 50, def: 65, skills: ['boss_bite', 'nameru', 'boss_laser', 'boss_roll', 'boss_laser', 'boss_meteor'] }
};

// =====================================================
// 「ガッツファクトリー」レンタルバトル用データ
// ・育成モードを介さず、あらかじめ用意されたレンタルモンスターを
//   6体提示→3体選出してパーティを組み、CPU/PvP問わず使用する。
// ・KIN_NEJIKI_SPECIES_POOL: 「6体提示」の抽選対象となる全12種族
// ・KIN_NEJIKI_SKILL_POOL: 各種族が使用できる固有技の候補（ここから4つをランダム抽選）
// =====================================================
const KIN_NEJIKI_SPECIES_POOL = ['mochi', 'suezo', 'dino', 'monolith', 'plant', 'kyubi', 'ham', 'arrowhead', 'nendoro', 'henger', 'durahan', 'golem', 'kawazumo', 'hinotori', 'gari'];

const KIN_NEJIKI_SKILL_POOL = {
    mochi:     ['monta', 'mochiki', 'gaccho', 'sakurafubuki', 'cho_rollinmochi', 'cho_mochihou', 'mossama', 'yaezakura'],
    suezo:     ['shippobinta', 'nameru', 'kamitsuki', 'kuu', 'psychokinesis', 'cho_netsushisen', 'utau', 'berobinta'],
    dino:      ['shippo', 'kamitsuki_dino', 'sunakake', 'kamitsukinage', 'honoo_taiatari', 'hizageri', 'kurohizacombo'],
    monolith:  ['monotaore', 'warawara', 'sakebigoe', 'cho_monotaore', 'aurora_gate', 'sanren_attack', 'trio_beam_z'],
    plant:     ['renkon', 'tane_gun', 'kafun', 'combination', 'tane_machinegun', 'flower_beam', 'face_drill', 'drain'],
    kyubi:     ['hikkaki', 'kagerou', 'kitsunebi', 'cho_kitsunebi', 'yuuwaku', 'kokonoe_shingan', 'tenga_tensho'],
    ham:       ['one_two_punch', 'sobat', 'atamatsuki', 'seoinage', 'cho_atamatsuki', 'machinegun_punch', 'onara', 'cho_ogoe'],
    arrowhead: ['tail_attack', 'zoom_punch', 'rocket_punch', 'needle_turn', 'w_needle_turn', 'tornado_attack', 'tail_blade', 'jiraibari'],
    nendoro:   ['zoom_punch_nendoro', 'mach_punch', 'meido_no_miyage', 'ganduke', 'body_press_nendoro'],
    henger:    ['w_kick', 'laser_blade', 'laser_cutter', 'w_laser_sword', 'drill_rocket', 'w_drill_rocket', 'napalm_cannon'],
    durahan:   ['cho_dash_giri', 'midaretsuki', 'mappufutatsu', 'combo_punch', 'daisharin', 'fujinken', 'raijinken'],
    golem:     ['dekopin', 'shoda', 'claw_nage', 'double_chop', 'guruguru_attack', 'nobiru_punch', 'jishin'],
    kawazumo:  ['harite', 'gappuri_yotsu', 'uwatenage', 'kawazutsuki', 'renzoku_harite', 'tobi_harite', 'kaeru_no_shita', 'dai_kaiten_otoshi', 'kaeru_no_uta', 'bakudan_nage'],
    hinotori:  ['kuchibashi', 'renzoku_kagizume', 'flame_typhoon', 'otakebi', 'bakuretsu_otoshi', 'flame_line', 'flame_beam', 'fire_bird', 'fire_wave', 'ebony_nova'],
    gari:      ['knuckle', 'holy_fire', 'god_bless', 'press', 'hurricane', 'holy_earth', 'spin_cutter', 'straight', 'holy_icicle', 'big_spin_cutter', 'god_final']
};

// =====================================================
// MONSTER_MOLDS: モンスターごとの「型」（技構成＋装備）データベース
// -----------------------------------------------------
// モンスター1種類につき最大4つの「型」を定義する。
// 各型は { skills: ['技名1', '技名2', ...], equipment: '装備名' または null } の形式。
// 技名・装備名は SKILLS_DB / EQUIPMENT_DB に登録されている「name」フィールドと
// 完全に一致する文字列を書くだけでよい（内部キーへの変換は自動で行われる）。
//
// ・ガッツファクトリー（金ネジキ）では、セット数（＝今回の周回内の進行度）に応じて
//   型1→型2→型3→型4の順に解放される：
//     セット1〜2 … 型1のみ
//     セット3〜4 … 型1・型2
//     セット5〜6 … 型1・型2・型3
//     セット7     … 型1〜型4すべて
//   （解放数は getMoldUnlockCountForSet で判定する）
// ・PvPレンタル対戦には「周回」の概念が無いため、常に型1〜4すべてが抽選対象になる。
//
// 【型を追加・変更したい場合】
//   下の配列に { skills: [...], equipment: '装備名' } を1つ追加・書き換えするだけでよい
//   （技は最大4つまで。装備は不要なら null にする）。
// =====================================================
const MONSTER_MOLDS = {
    'モッチー': [
        { skills: ['もんた', 'もちき', 'さくら吹雪'], equipment: '荒縄のガントレット' },
        { skills: ['ガッチョ', '超ローリンモッチ', '八重ざくら'], equipment: '生命のお守り' },
        { skills: ['さくら吹雪', '超もっち砲', 'もっさま', '八重ざくら'], equipment: '賢者の指輪' },
        { skills: ['もっさま', '超ローリンモッチ', '超もっち砲', '八重ざくら'], equipment: '竜牙の爪' }
    ],
    'スエゾー': [
        { skills: ['しっぽビンタ', 'なめる', 'かみつき'], equipment: '鷹の目レンズ' },
        { skills: ['かみつき', '食う', '超熱視線'], equipment: '知恵の首飾り' },
        { skills: ['なめる', 'サイコキネシス', 'ベロビンタ'], equipment: '真眼のレンズ' },
        { skills: ['サイコキネシス', '歌う', '食う', 'ベロビンタ'], equipment: '大賢者の冠' }
    ],
    'ディノ': [
        { skills: ['しっぽ', 'かみつき', '砂かけ'], equipment: '荒縄のガントレット' },
        { skills: ['かみつき投げ', 'ひざげり', '砂かけ'], equipment: '鉄爪の欠片' },
        { skills: ['炎のたいあたり', 'ひざげり', 'かみつき投げ'], equipment: 'ひび割れた鱗' },
        { skills: ['黒ひざコンボ', '炎のたいあたり', 'かみつき投げ', 'ひざげり'], equipment: '竜牙の爪' }
    ],
    'モノリス': [
        { skills: ['たおれこみ', 'わらわら', 'サケビ声'], equipment: '石の腕輪' },
        { skills: ['超たおれこみ', 'わらわら', 'オーロラゲート'], equipment: '水鱗のよろい' },
        { skills: ['サケビ声', 'オーロラゲート', '3連アタック'], equipment: '黒曜の鎧' },
        { skills: ['トリオビームZ', '3連アタック', '超たおれこみ', 'オーロラゲート'], equipment: '護りの霊符' }
    ],
    'プラント': [
        { skills: ['連続根っこ', '種ガン', '花粉'], equipment: '生命のお守り' },
        { skills: ['コンビネーション', '種マシンガン', 'ドレイン'], equipment: '賢者の指輪' },
        { skills: ['フラワービーム', 'フェイスドリル', 'ドレイン'], equipment: '大賢者の冠' },
        { skills: ['フラワービーム', 'フェイスドリル', '種マシンガン', 'ドレイン'], equipment: '巨神の心臓' }
    ],
    'キュービ': [
        { skills: ['ひっかき', '陽炎', '狐火'], equipment: '風切りのお守り' },
        { skills: ['狐火', '超狐火', 'ゆうわく'], equipment: '幻影のヴェール' },
        { skills: ['陽炎', '九重神眼', '超狐火'], equipment: '真眼のレンズ' },
        { skills: ['天河天翔', '超狐火', '九重神眼', 'ゆうわく'], equipment: '大賢者の冠' }
    ],
    'ハム': [
        { skills: ['ワンツーパンチ', 'ソバット', '頭つき'], equipment: '俊足のアンクレット' },
        { skills: ['頭つき', '背負い投げ', 'おなら'], equipment: '鉄爪の欠片' },
        { skills: ['超頭つき', 'マシンガンパンチ', 'おなら'], equipment: '幻影のヴェール' },
        { skills: ['マシンガンパンチ', '背負い投げ', '超大声', '超頭つき'], equipment: '竜牙の爪' }
    ],
    'アローヘッド': [
        { skills: ['テイルアタック', 'ズームパンチ', 'ニードルターン'], equipment: '鷹の目レンズ' },
        { skills: ['ニードルターン', 'Wニードルターン', 'ロケットパンチ'], equipment: '真眼のレンズ' },
        { skills: ['竜巻アタック', 'テイルブレード', '地雷針'], equipment: 'ひび割れた鱗' },
        { skills: ['Wニードルターン', '竜巻アタック', 'ロケットパンチ', 'テイルブレード'], equipment: '黒曜の鎧' }
    ],
    'ネンドロ': [
        { skills: ['ズームパンチ', 'がん飛ばし', 'マッハパンチ'], equipment: '荒縄のガントレット' },
        { skills: ['がん飛ばし', 'ボディプレス', 'マッハパンチ'], equipment: '鉄爪の欠片' },
        { skills: ['めいどのみやげ', 'ボディプレス', 'マッハパンチ'], equipment: '石の腕輪' },
        { skills: ['めいどのみやげ', 'マッハパンチ', 'ボディプレス', 'ズームパンチ'], equipment: '竜牙の爪' }
    ],
    'ヘンガー': [
        { skills: ['Wキック', 'レーザーブレード', 'Wレーザーソード'], equipment: '鷹の目レンズ' },
        { skills: ['ドリルロケット', 'レーザーカッター', 'Wレーザーソード'], equipment: '知恵の首飾り' },
        { skills: ['Wドリルロケット', 'ナパームキャノン', 'レーザーカッター'], equipment: '幻影のヴェール' },
        { skills: ['ナパームキャノン', 'Wドリルロケット', 'ドリルロケット', 'レーザーカッター'], equipment: '大賢者の冠' }
    ],
    'デュラハン': [
        { skills: ['超ダッシュ斬り', '乱れ突き', '風神剣'], equipment: '荒縄のガントレット' },
        { skills: ['乱れ突き', 'コンボパンチ', '風神剣'], equipment: '鉄爪の欠片' },
        { skills: ['まっぷたつ', '大車輪', '雷神剣'], equipment: '護りの霊符' },
        { skills: ['雷神剣', 'まっぷたつ', 'コンボパンチ', '大車輪'], equipment: '竜牙の爪' }
    ],
    'ゴーレム': [
        { skills: ['でこぴん', '掌打', 'ダブルチョップ'], equipment: '石の腕輪' },
        { skills: ['クロー投げ', 'ダブルチョップ', '地震'], equipment: '鉄爪の欠片' },
        { skills: ['のびーるパンチ', 'ぐるぐるアタック', '地震'], equipment: '黒曜の鎧' },
        { skills: ['ぐるぐるアタック', 'のびーるパンチ', 'クロー投げ', '地震'], equipment: '巨神の心臓' }
    ],
    'カワズモー': [
        { skills: ['はり手', 'かわずつき', 'かえるのした'], equipment: '荒縄のガントレット' },
        { skills: ['がっぷりよつ', '上手投げ', 'かえるのした'], equipment: '石の腕輪' },
        { skills: ['連続はり手', '飛びはり手', 'ばくだん投げ'], equipment: '黒曜の鎧' },
        { skills: ['大回転落とし', 'かえるのうた', '上手投げ', 'ばくだん投げ'], equipment: '竜牙の爪' }
    ],
    'ヒノトリ': [
        { skills: ['くちばし', '連続かぎづめ', 'フレイムビーム'], equipment: '荒縄のガントレット' },
        { skills: ['フレイムタイフーン', '雄叫び', 'フレイムビーム'], equipment: '鷹の目レンズ' },
        { skills: ['爆裂落とし', 'フレイムライン', 'ファイヤーバード'], equipment: '竜牙の爪' },
        { skills: ['ファイアウェーブ', 'エボニーノヴァ', 'ファイヤーバード', 'フレイムタイフーン'], equipment: '不死鳥の羽根' }
    ],
    'ガリ': [
        { skills: ['ナックル', 'ストレート', 'スピンカッター'], equipment: '荒縄のガントレット' },
        { skills: ['プレス', 'ハリケーン', 'ホーリーファイヤー'], equipment: '真眼のレンズ' },
        { skills: ['ホーリーアース', 'ホーリーアイシクル', '大スピンカッター'], equipment: '竜牙の爪' },
        { skills: ['ゴッドファイナル', 'ゴッドブレス', '大スピンカッター', 'ホーリーアース'], equipment: '牙獣のお守り' }
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
    if (setNumber >= 7) return 4;
    if (setNumber >= 5) return 3;
    if (setNumber >= 3) return 2;
    return 1;
}

// --- 指定種族の「型」を、解放数（unlockedCount: 1〜4）の範囲からランダムに1つ選び、
//     技キー配列と装備インスタンスに変換して返す。型データが無ければ null を返す。
// excludeEquipIds: この配列に含まれる装備IDが選ばれた場合、その型は装備なし扱いにする
//                  （同じ道具を持ったモンスター同士が対面しない、という仕様のための調整弁）
function pickMonsterMold(speciesId, unlockedCount, excludeEquipIds) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    const molds = tmpl ? MONSTER_MOLDS[tmpl.name] : null;
    if (!molds || molds.length === 0) return null;

    const count = Math.max(1, Math.min(unlockedCount || 1, molds.length));
    const availableMolds = molds.slice(0, count);
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
        }
    }
    return { skills: skillKeys, equip };
}

// --- ファクトリーヘッド（3セット目・7セット目に登場する専用ボス）---
// 通常のレンタルプールには含まれず、それぞれ専属のモンスター1体を率いて登場する。
const KIN_NEJIKI_BOSSES = {
    set3: {
        name: 'ファクトリーヘッド：ゴビ',
        title: 'ファクトリーヘッド・ゴビ',
        templateId: 'golem',
        emoji: '🗿',
        desc: 'ちからと丈夫さに全振りした岩石の怪物。ガッツが溜まると「ぐるぐるアタック」で大ダメージを与えてくる。命中と回避は低いため回避特化での対策が有効。',
        statsBase: { maxLife: 260, pow: 78, int: 18, hit: 34, spd: 16, def: 62, gutsSpeed: 12 },
        skills: ['dekopin', 'claw_nage', 'guruguru_attack', 'boss_roll']
    },
    set7: {
        name: 'ファクトリーヘッド：モスト',
        title: 'ファクトリーヘッド・モスト（最終決戦）',
        templateId: null, // 特定種族に属さないオリジナルの最終ボス
        emoji: '👿',
        desc: '伝説の邪神。回避不能の必中技「なめる」と、壊滅的な「メテオバースト」を併せ持つ。ガッツダウン性能の高い技で常にガッツを抑え込むのが攻略の鍵。',
        statsBase: { maxLife: 480, pow: 58, int: 58, hit: 62, spd: 46, def: 58, gutsSpeed: 14 },
        skills: ['boss_bite', 'nameru', 'boss_laser', 'boss_roll', 'boss_meteor']
    }
};

// --- イベント＆修行データベース ---
const GENERAL_EVENTS = [
    {
        title: 'あやしい商人のテント',
        visual: '🎪',
        desc: '怪しいローブをまとったブリーダーが薬を差し出してきた。「これを飲めばステータスが劇的に変わるぞ…」',
        choices: [
            {
                text: '怪薬を飲む（ギャンブル）',
                action: (player) => {
                    const isSuccess = Math.random() > 0.5;
                    if (isSuccess) {
                        const gainP = getDiminishedVal(player.stats.pow, 20);
                        const gainI = getDiminishedVal(player.stats.int, 20);
                        player.stats.pow += gainP;
                        player.stats.int += gainI;
                        return `大成功！ちからが+${gainP}、かしこさが+${gainI}アップした！`;
                    } else {
                        player.stats.maxLife = Math.max(100, player.stats.maxLife - 20);
                        player.stats.life = Math.min(player.stats.maxLife, player.stats.life);
                        return `うっ、体に毒が回った…！最大ライフが20ダウンした。`;
                    }
                }
            },
            {
                text: '怪しいので断る',
                action: (player) => {
                    player.stats.life = player.stats.maxLife;
                    return `断ると商人は消え去った。一安心したモンスターは深くリラックスし、ライフが全回復した。`;
                }
            }
        ]
    },
    {
        title: '不思議な黄金桃の木',
        visual: '🍑',
        desc: 'モンスターファーム伝説の「黄金桃」に似た、輝く果実が実っています。',
        choices: [
            {
                text: '桃を分け合って食べる',
                action: (player) => {
                    const gainL = getDiminishedVal(player.stats.maxLife, 25);
                    const gainD = getDiminishedVal(player.stats.def, 10);
                    player.stats.maxLife += gainL;
                    player.stats.life = Math.min(player.stats.maxLife, player.stats.life + 70);
                    player.stats.def += gainD;
                    return `活力がみなぎる！最大ライフが+${gainL}、丈夫さが+${gainD}アップし、ライフが70回復した！`;
                }
            },
            {
                text: 'お守りとして持ち帰る',
                action: (player) => {
                    const gainS = getDiminishedVal(player.stats.spd, 15);
                    const gainH = getDiminishedVal(player.stats.hit, 15);
                    player.stats.spd += gainS;
                    player.stats.hit += gainH;
                    return `体が軽くなった気がする！回避が+${gainS}、命中が+${gainH}アップした。`;
                }
            }
        ]
    },
    {
        title: 'ブリーダー協会の支援物資',
        visual: '📦',
        desc: '協会の支援物資コンテナが落ちています。どうやらブリーダーへの補給品ようです。',
        choices: [
            {
                text: '栄養豊富な保存食を食べる',
                action: (player) => {
                    player.stats.life = player.stats.maxLife;
                    return `体力が完全に回復した！ライフが最大になりました。`;
                }
            },
            {
                text: 'トレーニング用の薬をもらう',
                action: (player) => {
                    const gainH = getDiminishedVal(player.stats.hit, 20);
                    player.stats.hit += gainH;
                    return `モンスターにトレーニング器具とプロテインを与えました。命中が+${gainH}アップ！`;
                }
            }
        ]
    },
    // 通常ランダムイベントに「特訓イベント」を配置
    {
        title: '秘密の特訓場を発見！',
        visual: '⛩️',
        desc: '伝説のブリーダーが遺したと言われる秘密 of 特訓地を発見しました！効率よく特定のパラメータを鍛え上げられます。',
        choices: [
            {
                text: '攻の特別トレーニング（ライフ-25）',
                action: (player) => {
                    player.stats.life = Math.max(10, player.stats.life - 25);
                    const gainP = getDiminishedVal(player.stats.pow, 20);
                    const gainH = getDiminishedVal(player.stats.hit, 12);
                    player.stats.pow += gainP;
                    player.stats.hit += gainH;
                    return `攻撃特訓が成功！ちからが+${gainP}、命中が+${gainH}アップした！(ライフ-25)`;
                }
            },
            {
                text: '防の特別トレーニング（ライフ-25）',
                action: (player) => {
                    player.stats.life = Math.max(10, player.stats.life - 25);
                    const gainD = getDiminishedVal(player.stats.def, 20);
                    const gainS = getDiminishedVal(player.stats.spd, 12);
                    player.stats.def += gainD;
                    player.stats.spd += gainS;
                    return `防御と回避の特訓が成功！丈夫さが+${gainD}、回避が+${gainS}アップした！(ライフ-25)`;
                }
            }
        ]
    }
];

// --- 宝箱発見イベント（装備アイテム入手）演出データ ---
// 実際の抽選・付与処理は setupTreasureEvent()（game_adventure.js）が行う。
// ここでは選択肢のラベル・演出文言のみを保持する。
const TREASURE_EVENTS = [
    {
        title: '古びた宝箱を発見！',
        visual: '🎁',
        openText: '宝箱を開けてみる',
        leaveText: 'そっとしておく（ライフ20回復）'
    },
    {
        title: '光る祭壇の上の宝箱',
        visual: '⛩️',
        openText: '祭壇の宝箱を開ける',
        leaveText: '触れずに立ち去る（ライフ20回復）'
    }
];

// 「修行コンパス」からはこちらが100%発動
const TRAINING_EVENTS = [
    {
        title: '猛特訓修行（新技習得）',
        visual: '⛰️',
        desc: '過酷ですが効果絶大な修行地を発見しました。厳しい修行により種族固有の新技を確実に1つ修得できます！',
        choices: [
            {
                text: '命懸けの修行を開始（ライフ-40）',
                action: (player) => {
                    player.stats.life = Math.max(10, player.stats.life - 40);
                    
                    let candidates = [];
                    if (player.emoji === '🍪') {
                        candidates = ['monta', 'mochiki', 'gaccho', 'sakurafubuki', 'cho_rollinmochi', 'cho_mochihou', 'mossama', 'yaezakura'];
                    } else if (player.emoji === '👁️') {
                        candidates = ['shippobinta', 'nameru', 'kamitsuki', 'kuu', 'psychokinesis', 'cho_netsushisen', 'utau', 'berobinta'];
                    } else if (player.emoji === '🦖') {
                        candidates = ['shippo', 'kamitsuki_dino', 'sunakake', 'kamitsukinage', 'honoo_taiatari', 'hizageri', 'kurohizacombo'];
                    } else if (player.emoji === '🗿') {
                        candidates = ['monotaore', 'warawara', 'sakebigoe', 'cho_monotaore', 'aurora_gate', 'sanren_attack', 'trio_beam_z'];
                    } else if (player.emoji === '🌸') {
                        candidates = ['renkon', 'tane_gun', 'kafun', 'combination', 'tane_machinegun', 'flower_beam', 'face_drill', 'drain'];
                    } else if (player.emoji === '🦊') {
                        candidates = ['hikkaki', 'kagerou', 'kitsunebi', 'cho_kitsunebi', 'yuuwaku', 'kokonoe_shingan', 'tenga_tensho'];
                    }

                    const available = candidates.filter(s => !player.skills.includes(s));
                    if (available.length > 0) {
                        const newSkill = available[Math.floor(Math.random() * available.length)];
                        player.skills.push(newSkill);
                        return `厳しい修行の結果、新しい秘技【${SKILLS_DB[newSkill].name}】（ダメージランク: ${getDamageRank(SKILLS_DB[newSkill].force, SKILLS_DB[newSkill].type)}）を習得した！ (ライフ-40)`;
                    } else {
                        // 全技習得済みの場合は強化修行へ誘導
                        player.stats.life = Math.min(player.stats.maxLife, player.stats.life + 40); // ライフペナルティを戻す
                        return '全技習得済み！強化修行に切り替えます...';
                    }
                }
            },
            {
                text: '基礎を鍛える修行に留める（ライフ-10）',
                action: (player) => {
                    player.stats.life = Math.max(10, player.stats.life - 10);
                    const gainP = getDiminishedVal(player.stats.pow, 10);
                    const gainH = getDiminishedVal(player.stats.hit, 10);
                    player.stats.pow += gainP;
                    player.stats.hit += gainH;
                    return `基礎トレーニングを行いました。ちからが+${gainP}、命中が+${gainH}アップした。 (ライフ-10)`;
                }
            }
        ]
    }
];
