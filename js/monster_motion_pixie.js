// =====================================================
// monster_motion_pixie.js
// ピクシー専用のバトルモーション演出。
//
// ピクシーの特徴（＝演出の軸）：
//   ・小柄な妖精のような体 → 動きは軽やかに。地に足をつけず、浮いたまま戦う
//   ・光線技が非常に多い       → レイ系は「威力の順に規模が大きくなる」ことを見た目でも分かるようにする
//   ・魅了・回復もこなす       → なげキッスはハート、ヒールレイドは温かい光で見せる
//
// ★レイ系の見た目の格付け（弱→強）：
//     レイ       … 細い光線1本
//     メガレイ   … 太い光線＋着弾が大きい
//     ギガレイ   … ため＋極太の光線＋着弾が拡散
//     アストラルレイ … 最上位。長いため＋多重の光線＋画面が光に包まれる
//   同じ「光線」でも規模で明確に差をつけ、上位技ほど強く見えるようにしている。
//
// 対応技：はり手／サンダー／レイ／ライトニング／メガレイ／なげキッス／
//         ハイキック／バン／ギガレイ／ヒールレイド／ビッグバン／アストラルレイ
// =====================================================

const PIXIE_LIGHT = '#ffe9a8';  // 光線の基本色
const PIXIE_PINK = '#ff9ec4';   // 魅了・ハート系
const PIXIE_THUNDER = '#ffe066'; // 雷

// --- ピクシー共通：ふわりと浮いた状態で構える（多くの技の導入に使う） ---
function pixieHoverKeyframes(extra = '') {
    return [
        { transform: `translateY(0) ${extra}`.trim(), offset: 0 },
        { transform: `translateY(-10px) ${extra}`.trim(), offset: 0.35 },
        { transform: `translateY(-10px) ${extra}`.trim(), offset: 0.6 },
        { transform: `translateY(0) ${extra}`.trim(), offset: 1 }
    ];
}

// --- 光線技の共通処理：ため → 発射 → 着弾。規模だけを引数で変える ---
//   これにより、レイ／メガレイ／ギガレイ／アストラルレイを同じ「型」で作りつつ、
//   太さ・本数・着弾の派手さだけで格の違いを表現できる。
function playPixieRayMotion(side, opts = {}) {
    const {
        chargeDuration = 420, beamDuration = 520, beamWidth = 9, beamCount = 1,
        color = PIXIE_LIGHT, burstSize = 34, burstCount = 3, chargeParticles = 3
    } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const charge = chargeDuration * EFFECT_SPEED_MULTIPLIER;
    const beam = beamDuration * EFFECT_SPEED_MULTIPLIER;

    // ため：手元に光を集める
    animateSpriteLayers(side, pixieHoverKeyframes(), { duration: charge + beam, easing: 'ease-in-out' });
    for (let i = 0; i < chargeParticles; i++) {
        const a = (Math.PI * 2 * i) / chargeParticles;
        spawnCustomParticle('✦', from.x + Math.cos(a) * 34, from.y + Math.sin(a) * 26, {
            size: 20, delay: i * 70, duration: charge, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * 34}px,${-Math.sin(a) * 26}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    // 発射：本数が多いほど上位技に見える
    setTimeout(() => {
        for (let i = 0; i < beamCount; i++) {
            const oy = beamCount === 1 ? 0 : (i - (beamCount - 1) / 2) * 16;
            spawnBeamLine(from.x, from.y + oy, to.x - from.x, to.y - (from.y + oy), color, beam, beamWidth);
        }
        // 着弾
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: burstSize, duration: 420 * EFFECT_SPEED_MULTIPLIER, color });
            for (let i = 0; i < burstCount; i++) {
                const a = (Math.PI * 2 * i) / burstCount;
                spawnCustomParticle('✨', to.x, to.y, {
                    size: 20 + burstSize * 0.15, delay: i * 45, duration: 460 * EFFECT_SPEED_MULTIPLIER, color,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 58}px,${Math.sin(a) * 44}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                    ]
                });
            }
            playRecoilMotion(otherSide(side), { distance: 8 + burstSize * 0.15, rotate: 6 + burstSize * 0.1 });
        }, beam * 0.3);
    }, charge);
}

// --- レイ：細い光線を1本（レイ系の最も基本形） ---
function playPixieRay(side) {
    playPixieRayMotion(side, { beamWidth: 8, beamCount: 1, burstSize: 30, burstCount: 3, chargeDuration: 380 });
}
registerCustomSkillMotion('pixie_ray', playPixieRay, 'ピクシー');

// --- メガレイ：太い光線1本。着弾も大きい ---
function playPixieMegaRay(side) {
    playPixieRayMotion(side, { beamWidth: 14, beamCount: 1, burstSize: 42, burstCount: 4, chargeDuration: 500, chargeParticles: 4 });
}
registerCustomSkillMotion('pixie_megaray', playPixieMegaRay, 'ピクシー');

// --- ギガレイ：極太の光線を3本束ねて撃つ ---
function playPixieGigaRay(side) {
    playPixieRayMotion(side, { beamWidth: 16, beamCount: 3, burstSize: 52, burstCount: 5, chargeDuration: 620, chargeParticles: 6 });
}
registerCustomSkillMotion('pixie_gigaray', playPixieGigaRay, 'ピクシー');

// --- アストラルレイ：ピクシー最上位の光線。長くためて、画面が光に包まれる ---
function playPixieAstralRay(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);

    // まず、他のレイ系より一段長いためを見せる
    spawnSelfParticleRing(casterEl, '✨', 8, 20, 780 * EFFECT_SPEED_MULTIPLIER, 46);
    setTimeout(() => {
        // 溜め切った瞬間の閃光
        spawnCustomParticle('✦', from.x, from.y, {
            size: 72, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }
            ]
        });
        // 5本の極太光線を一斉に放つ
        playPixieRayMotion(side, {
            chargeDuration: 240, beamDuration: 760, beamWidth: 18, beamCount: 5,
            color: '#ffffff', burstSize: 64, burstCount: 7, chargeParticles: 6
        });
        // 着弾後、光が空間全体に拡散する
        setTimeout(() => {
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i) / 6;
                spawnCustomParticle('✦', to.x, to.y, {
                    size: 30, delay: i * 55, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 50}px,${Math.sin(a) * 40}px) translate(-50%,-50%) scale(1.3)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 86}px,${Math.sin(a) * 68}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
        }, 900 * EFFECT_SPEED_MULTIPLIER);
    }, 700 * EFFECT_SPEED_MULTIPLIER);
}
registerCustomSkillMotion('pixie_astralray', playPixieAstralRay, 'ピクシー');

// --- サンダー：頭上に雷雲を呼び、相手に落雷させる ---
function playPixieThunderMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 950 * EFFECT_SPEED_MULTIPLIER;

    // 手を掲げて天に呼びかける
    animateSpriteLayers(side, pixieHoverKeyframes(), { duration, easing: 'ease-in-out' });

    // 相手の頭上に雷雲が集まる
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('☁️', to.x + (i - 1) * 18, to.y - 76, {
            size: 26, delay: i * 90, duration: 620 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.75 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }

    // 落雷
    setTimeout(() => {
        spawnBeamLine(to.x, to.y - 76, 0, 76, PIXIE_THUNDER, 400 * EFFECT_SPEED_MULTIPLIER, 12);
        spawnImpactBurst(to.x, to.y, { emoji: '⚡', size: 38, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_THUNDER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, duration * 0.6);
}
registerCustomSkillMotion('pixie_thunder', playPixieThunderMotion, 'ピクシー');

// --- ライトニング：稲妻がジグザグに走って相手を貫く（サンダーの「落雷」に対し、こちらは「横に走る雷」） ---
function playPixieLightningMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, pixieHoverKeyframes(), { duration, easing: 'ease-in-out' });
    spawnSelfParticleRing(casterEl, '⚡', 4, 18, 400 * EFFECT_SPEED_MULTIPLIER, 30);

    // ジグザグ：区間ごとに上下へ振った短いビームを繋げる
    setTimeout(() => {
        const segments = 4;
        for (let i = 0; i < segments; i++) {
            const t0 = i / segments, t1 = (i + 1) / segments;
            const x0 = from.x + (to.x - from.x) * t0;
            const x1 = from.x + (to.x - from.x) * t1;
            const y0 = from.y + (to.y - from.y) * t0 + (i % 2 === 0 ? -16 : 16);
            const y1 = from.y + (to.y - from.y) * t1 + (i % 2 === 0 ? 16 : -16);
            setTimeout(() => {
                spawnBeamLine(x0, y0, x1 - x0, y1 - y0, PIXIE_THUNDER, 320 * EFFECT_SPEED_MULTIPLIER, 8);
            }, i * 55);
        }
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { emoji: '⚡', size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_THUNDER });
            playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
        }, segments * 55 + 120);
    }, duration * 0.4);
}
registerCustomSkillMotion('pixie_lightning', playPixieLightningMotion, 'ピクシー');

// --- はり手：軽やかに近づいて、平手で打つ ---
function playPixieHariteMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.6, duration: 560 });
    if (!to) return;
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -10, { length: 84, width: 8, color: PIXIE_PINK, duration: 250 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 28, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 9, rotate: 7 });
    }, impactAt);
}
registerCustomSkillMotion('pixie_harite', playPixieHariteMotion, 'ピクシー');

// --- ハイキック：宙返りの勢いを乗せた 高い蹴り ---
function playPixieHighKickMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 800 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    // ふわりと跳び上がり、上から下へ足を振り抜く
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,4px) rotate(0deg)', offset: 0.14 },
        { transform: `translate(${travel * 0.6}px,-40px) rotate(-24deg)`, offset: 0.4 },  // 跳ぶ
        { transform: `translate(${travel}px,-8px) rotate(18deg)`, offset: 0.6 },          // 振り下ろす
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y - 6, 74, { length: 106, width: 10, color: PIXIE_PINK, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, duration * 0.58);
}
registerCustomSkillMotion('pixie_highkick', playPixieHighKickMotion, 'ピクシー');

// --- なげキッス：投げキスが漂って相手に届き、心を奪う ---
function playPixieNagekissMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 口元に手を添えて、ふわりと投げる
    animateSpriteLayers(side, [
        { transform: 'translateY(0) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-8px) rotate(-6deg)', offset: 0.28 },
        { transform: 'translateY(-4px) rotate(6deg)', offset: 0.45 },
        { transform: 'translateY(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ハートがふわふわ揺れながら飛んでいく
    for (let i = 0; i < 3; i++) {
        const wave = (i % 2 === 0) ? -22 : 18;
        spawnCustomParticle('💋', from.x, from.y - 8, {
            size: 26, delay: duration * 0.4 + i * 120, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_PINK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-10deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.1) rotate(10deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.9) rotate(-8deg)`, opacity: 0 }
            ]
        });
    }

    // 見とれてふらつく
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) scale(1)', offset: 0 },
            { transform: 'rotate(6deg) scale(1.03)', offset: 0.3 },
            { transform: 'rotate(-5deg) scale(0.99)', offset: 0.6 },
            { transform: 'rotate(0deg) scale(1)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('💗', to.x, to.y - 22, {
                size: 20, delay: i * 90, duration: 660 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_PINK,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 20}px,${Math.sin(a) * 9}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 22}px,${Math.sin(a + 2.1) * 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 20}px,${Math.sin(a + 4.2) * 9}px) translate(-50%,-50%) scale(0.8)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.66);
}
registerCustomSkillMotion('pixie_nagekiss', playPixieNagekissMotion, 'ピクシー');

// --- バン：至近距離で弾ける音の衝撃 ---
function playPixieVanMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 720 * EFFECT_SPEED_MULTIPLIER;

    // 指を鳴らすように、鋭く小さな動作
    animateSpriteLayers(side, [
        { transform: 'scale(1) rotate(0deg)', offset: 0 },
        { transform: 'scale(0.96) rotate(-4deg)', offset: 0.28 },
        { transform: 'scale(1.05) rotate(3deg)', offset: 0.42 },
        { transform: 'scale(1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 相手の位置で音が弾ける（輪が一気に開く）
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 48, delay: i * 70, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.9, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, duration * 0.44);
}
registerCustomSkillMotion('pixie_van', playPixieVanMotion, 'ピクシー');

// --- ヒールレイド：癒しの光を相手に叩きつけ、その反動で自らも癒える ---
//   ※回復専用技ではなく、force2.3の攻撃技（命中時に自身のライフを15%回復する）。
//     攻撃部分が無いと効果と食い違うため、相手への着弾を主役にし、自己回復は締めに置く。
function playPixieHealRaidMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const { x, y } = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    // ① 攻撃：癒しの光を相手へ撃ち込む
    setTimeout(() => {
        spawnBeamLine(x, y, to.x - x, to.y - y, PIXIE_LIGHT, 520 * EFFECT_SPEED_MULTIPLIER, 15);
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 44, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT });
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 * i) / 4;
                spawnCustomParticle('✨', to.x, to.y, {
                    size: 22, delay: i * 45, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 36}px,${Math.sin(a) * 28}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 60}px,${Math.sin(a) * 46}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10, duration: 520 });
        }, 200 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.32);

    // 静かに浮かび、光を受け止める
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.4 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.68 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ② 反動で自らも癒える（攻撃が当たった後に見せる）
    for (let i = 0; i < 5; i++) {
        spawnCustomParticle('✨', x + (Math.random() - 0.5) * 50, y - 50, {
            size: 20, delay: duration * 0.6 + i * 90, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(0,30px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.5 },
                { transform: 'translate(0,56px) translate(-50%,-50%) scale(0.6)', opacity: 0 }
            ]
        });
    }
    // 癒しの緑がまとわりつく
    setTimeout(() => spawnSelfParticleRing(casterEl, '💚', 6, 18, 760 * EFFECT_SPEED_MULTIPLIER, 38), duration * 0.6);
}
registerCustomSkillMotion('pixie_healraid', playPixieHealRaidMotion, 'ピクシー');

// --- ビッグバン：一点に凝縮した力が、爆発的に膨張する ---
function playPixieBigBangMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1300 * EFFECT_SPEED_MULTIPLIER;

    // 力を集めて、解き放つ
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(0.96)', offset: 0.3 },  // 凝縮
        { transform: 'translateY(-8px) scale(0.94)', offset: 0.44 },
        { transform: 'translateY(0) scale(1.06)', offset: 0.56 },     // 解放
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手の位置に、一点へ吸い込まれる光（＝爆発の前触れ）
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const r = 60;
        spawnCustomParticle('✦', to.x + Math.cos(a) * r, to.y + Math.sin(a) * r * 0.8, {
            size: 20, delay: duration * 0.34 + i * 55, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: PIXIE_LIGHT,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.8}px) translate(-50%,-50%) scale(0.2)`, opacity: 0 }
            ]
        });
    }

    // 大爆発
    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y, {
            size: 80, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 1, offset: 0.32 },
                { transform: 'translate(-50%,-50%) scale(2.8)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 58, duration: 520 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 7; i++) {
            const a = (Math.PI * 2 * i) / 7;
            spawnCustomParticle('💥', to.x, to.y, {
                size: 24, delay: i * 40, duration: 520 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 46}px,${Math.sin(a) * 36}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.4 },
                    { transform: `translate(${Math.cos(a) * 78}px,${Math.sin(a) * 62}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 19, rotate: 14, duration: 640 });
    }, duration * 0.58);
}
registerCustomSkillMotion('pixie_bigbang', playPixieBigBangMotion, 'ピクシー');
