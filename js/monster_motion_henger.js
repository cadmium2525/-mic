// =====================================================
// monster_motion_henger.js
// ヘンガー専用のバトルモーション演出。
//
// ヘンガーの特徴（＝演出の軸）：
//   ・機械仕掛けの体   → 動きは直線的・角ばった軌道にし、生物的な「ため」を作らない
//   ・武装を撃ち出せる → ドリルロケットは腕そのものが発射されて戻ってくる
//   ・「W」の付く技    → 単発技の見た目をそのまま2つに増やし、
//                        「W＝2連装」であることが一目で分かるようにする
//                        （Wキック／Wレーザーソード／Wドリルロケット）
//
// 対応技：Wキック／レーザーブレード／レーザーカッター／Wレーザーソード／
//         ドリルロケット／Wドリルロケット／ナパームキャノン
// =====================================================

const HENGER_LASER = '#7ee8ff';  // レーザーの色（機械的な水色）
const HENGER_METAL = '#c3ccd6';  // 金属の色

// --- 機械的な「駆動音」を表す短い光（技の起動時に共通で挟む） ---
function spawnHengerBoot(side, color = HENGER_LASER) {
    const el = getBattleSpriteContainerEl(side);
    if (!el) return;
    const { x, y } = getElCenter(el);
    spawnCustomParticle('✦', x, y - 8, {
        size: 26, duration: 340 * EFFECT_SPEED_MULTIPLIER, color,
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.4 },
            { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 0 }
        ]
    });
}

// --- Wキック：両脚による2連蹴り ---
function playWKickMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.6;

    // 機械らしく、ためを作らずカクッと踏み込んで2回蹴る
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: `translate(${travel}px,-14px) rotate(-10deg)`, offset: 0.26 }, // 1発目
        { transform: `translate(${travel * 0.75}px,0) rotate(0deg)`, offset: 0.42 },
        { transform: `translate(${travel}px,10px) rotate(10deg)`, offset: 0.62 },   // 2発目（下段）
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'linear' });

    [[0.26, -14], [0.62, 12]].forEach(([at, oy], i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y + oy, i === 0 ? -30 : 30, { length: 88, width: 8, color: HENGER_METAL, duration: 240 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { size: i === 1 ? 34 : 28, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 12 : 8, rotate: i === 1 ? 9 : 5, duration: 320 });
        }, duration * at);
    });
}
registerCustomSkillMotion('w_kick', playWKickMotion, 'ヘンガー');

// --- レーザーブレード：腕から光の刃を生成し、踏み込んで斬る ---
function playLaserBladeMotion(side) {
    spawnHengerBoot(side);
    const { impactAt, to } = playLungeMotion(side, { reach: 0.66, duration: 640 });
    if (!to) return;
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -25, { length: 112, width: 10, color: HENGER_LASER, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: HENGER_LASER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('laser_blade', playLaserBladeMotion, 'ヘンガー');

// --- レーザーカッター：離れた位置から、切断用の細い光線を走らせる（ブレードが近接なら、こちらは遠距離） ---
function playLaserCutterMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    spawnHengerBoot(side);
    // 照準を定めるように、その場で小さく位置を合わせる
    animateSpriteLayers(side, [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(-4px)', offset: 0.24 },
        { transform: 'translateY(-4px)', offset: 0.44 },
        { transform: 'translateY(0)', offset: 1 }
    ], { duration, easing: 'linear' });

    // 細い光線が走り、切断線として相手を横切る
    setTimeout(() => {
        spawnBeamLine(from.x, from.y, to.x - from.x, to.y - from.y, HENGER_LASER, 440 * EFFECT_SPEED_MULTIPLIER, 6);
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, 0, { length: 120, width: 5, color: HENGER_LASER, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { emoji: '✨', size: 30, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: HENGER_LASER });
            playRecoilMotion(otherSide(side), { distance: 9, rotate: 6 });
        }, 200 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.44);
}
registerCustomSkillMotion('laser_cutter', playLaserCutterMotion, 'ヘンガー');

// --- Wレーザーソード：光の刃を両腕に展開し、交差させて斬る（レーザーブレードの2連装版） ---
function playWLaserSwordMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;

    spawnHengerBoot(side);
    spawnHengerBoot(side); // 2本展開していることを示すため2回鳴らす

    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${travel}px) rotate(-12deg)`, offset: 0.32 }, // 1本目
        { transform: `translateX(${travel}px) rotate(12deg)`, offset: 0.56 },  // 2本目（逆方向）
        { transform: `translateX(${travel * 0.6}px) rotate(0deg)`, offset: 0.74 },
        { transform: 'translateX(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'linear' });

    // 2本の刃がX字に交差する
    [[0.32, -35], [0.56, 35]].forEach(([at, angle], i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, angle, { length: 124, width: 11, color: HENGER_LASER, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { size: i === 1 ? 40 : 30, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: HENGER_LASER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 14 : 9, rotate: i === 1 ? 10 : 6, duration: 360 });
        }, duration * at);
    });
}
registerCustomSkillMotion('w_laser_sword', playWLaserSwordMotion, 'ヘンガー');

// --- ドリルロケット：腕のドリルを発射し、回転しながら突き刺さって戻ってくる ---
//   本体は撃ち出すだけでほとんど動かない（＝武装が飛んでいく技であることを明確にする）
function playDrillRocketMotion(side, opts = {}) {
    const { count = 1 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    spawnHengerBoot(side, HENGER_METAL);
    // 撃ち出しの反動でわずかに後退する
    animateSpriteLayers(side, [
        { transform: 'translateX(0)', offset: 0 },
        { transform: `translateX(${-Math.sign(dx) * 8}px)`, offset: 0.3 },
        { transform: 'translateX(0)', offset: 1 }
    ], { duration, easing: 'linear' });

    for (let i = 0; i < count; i++) {
        const oy = count === 1 ? 0 : (i === 0 ? -18 : 18);
        const flightMs = 620 * EFFECT_SPEED_MULTIPLIER;
        // ドリルが高速回転しながら飛び、突き刺さって、また戻ってくる
        spawnCustomParticle('🌀', from.x, from.y + oy, {
            size: 30, delay: i * 110, duration: flightMs, color: HENGER_METAL, easing: 'ease-in-out',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.1) rotate(900deg)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.1) rotate(1300deg)`, opacity: 1, offset: 0.62 },
                { transform: 'translate(-50%,-50%) scale(0.5) rotate(1800deg)', opacity: 0 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y + oy, { size: count > 1 ? 34 : 38, duration: 340 * EFFECT_SPEED_MULTIPLIER });
            spawnSlashArc(to.x, to.y + oy, 0, { length: 74, width: 8, color: HENGER_METAL, duration: 240 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 11, rotate: 7, duration: 340 });
        }, i * 110 + flightMs * 0.45);
    }
}
registerCustomSkillMotion('drill_rocket', (side) => playDrillRocketMotion(side, { count: 1 }), 'ヘンガー');

// --- Wドリルロケット：両腕のドリルを同時に発射（ドリルロケットの2連装版） ---
registerCustomSkillMotion('w_drill_rocket', (side) => playDrillRocketMotion(side, { count: 2 }), 'ヘンガー');

// --- ナパームキャノン：胸部の砲口から焼夷弾を撃ち出し、着弾点で炎が広がる ---
function playNapalmCannonMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    spawnHengerBoot(side, '#ff9a3c');
    // 砲身を展開して、撃つ（発射の反動で大きく後ろへずれる）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(1.05,0.97)', offset: 0.28 },                 // 展開
        { transform: `translateX(${-Math.sign(dx) * 14}px) scale(0.96,1.03)`, offset: 0.44 }, // 反動
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 砲弾が弧を描いて飛ぶ
    setTimeout(() => {
        spawnCustomParticle('🔥', from.x, from.y, {
            size: 26, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: '#ff7a3c', easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 34}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.2)`, opacity: 1 }
            ]
        });
        // 着弾：炎が地表に広がる
        setTimeout(() => {
            spawnCustomParticle('◯', to.x, to.y + 12, {
                size: 66, duration: 500 * EFFECT_SPEED_MULTIPLIER, color: '#ff7a3c',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.45)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3) scaleY(0.5)', opacity: 0.95, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(2.1) scaleY(0.55)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 5; i++) {
                const ox = (i - 2) * 22 + (Math.random() - 0.5) * 10;
                spawnCustomParticle('🔥', to.x + ox, to.y + 8, {
                    size: 22 + Math.random() * 8, delay: i * 45, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ff6a2c',
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: 'translate(0,-20px) translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.45 },
                        { transform: 'translate(0,-40px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 44, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, 480 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('napalm_cannon', playNapalmCannonMotion, 'ヘンガー');
