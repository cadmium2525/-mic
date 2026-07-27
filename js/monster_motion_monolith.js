// =====================================================
// monster_motion_monolith.js
// モノリス専用のバトルモーション演出。
//
// モノリスの特徴（＝演出の軸）：
//   ・巨大で鈍重な石の体 → 動きは「ゆっくり傾いて、どしんと落ちる」重量感で見せる
//   ・並んだ複数の目     → ビーム系は「複数の光線が同時に走る」形にする
//   ・音波・神秘の力     → 声／超音波は輪が広がる形、神秘系は多色の光で見せる
//
// 対応技：たおれこみ／わらわら／超たおれこみ／3連アタック／サケビ声／
//         オーロラゲート／トリオビームZ／神秘の守り／超音波
// =====================================================

const MONOLITH_STONE = '#cbd5e1'; // 石の色

// --- 共通：音や波紋が輪になって広がる（声・超音波系で使う） ---
function spawnMonolithRings(x, y, count, color, duration, opts = {}) {
    const { size = 54, stagger = 150, scaleTo = 2.2 } = opts;
    for (let i = 0; i < count; i++) {
        spawnCustomParticle('◯', x, y, {
            size, color,
            duration: duration * EFFECT_SPEED_MULTIPLIER,
            delay: i * stagger * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.4 },
                { transform: `translate(-50%,-50%) scale(${scaleTo})`, opacity: 0 }
            ]
        });
    }
}

// --- たおれこみ：巨体をそのまま前へ倒し込む ---
function playMonotaoreMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 860 * EFFECT_SPEED_MULTIPLIER;
    const dir = (to.x - from.x) > 0 ? 1 : -1;
    const travel = (to.x - from.x) * 0.45;

    // 体を反らして溜め、板が倒れるようにゆっくり傾いてから一気に落ちる
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${-dir * 6}px) rotate(${-dir * 10}deg)`, offset: 0.3 },  // 後ろへ溜める
        { transform: `translateX(${travel}px) rotate(${dir * 62}deg)`, offset: 0.56 },     // 倒れ込む
        { transform: `translateX(${travel}px) rotate(${dir * 62}deg)`, offset: 0.68 },
        { transform: 'translateX(0) rotate(0deg)', offset: 1 }                              // 起き上がる
    ], { duration, easing: 'ease-in' });

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 12, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💨', to.x, to.y + 18, {
            size: 28, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
            ]
        });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 7 });
    }, duration * 0.56);
}
registerCustomSkillMotion('monotaore', playMonotaoreMotion, 'モノリス');

// --- わらわら：奇妙な唸り声で相手を威圧し、力を削ぐ ---
function playWarawaraMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 低く唸るように、小さな振動を続ける
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: 'translateX(-2px) scale(1.03)', offset: 0.2 },
        { transform: 'translateX(2px) scale(1.03)', offset: 0.4 },
        { transform: 'translateX(-2px) scale(1.02)', offset: 0.6 },
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnMonolithRings(from.x, from.y, 3, '#9b7fd6', 700, { stagger: 170, scaleTo: 2.6 });

    // 威圧されて相手が縮こまり、力が抜けていく
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(0.93,0.9)', offset: 0.4 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('⬇️', to.x + (i - 1) * 18, to.y - 10, {
                size: 20, delay: i * 90, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#9b7fd6',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: 'translate(0,14px) translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,30px) translate(-50%,-50%) scale(0.8)', opacity: 0 }
                ]
            });
        }
    }, duration * 0.5);
}
registerCustomSkillMotion('warawara', playWarawaraMotion, 'モノリス');

// --- 超たおれこみ：全体重を乗せた渾身の倒れ込み（たおれこみの強化版として、ためと衝撃を大きく） ---
function playChoMonotaoreMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;
    const dir = (to.x - from.x) > 0 ? 1 : -1;
    const travel = (to.x - from.x) * 0.6;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: `translate(${-dir * 10}px,-6px) rotate(${-dir * 18}deg) scale(1.06)`, offset: 0.32 }, // 大きく溜める
        { transform: `translate(${-dir * 10}px,-6px) rotate(${-dir * 20}deg) scale(1.08)`, offset: 0.44 },
        { transform: `translate(${travel}px,8px) rotate(${dir * 74}deg) scale(1.04)`, offset: 0.64 },      // 全体重で落ちる
        { transform: `translate(${travel}px,8px) rotate(${dir * 74}deg) scale(1.04)`, offset: 0.76 },
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in' });

    // 落下の瞬間、地面が割れて岩片が跳ねる
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 14, { size: 50, duration: 500 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI + (Math.PI * i) / 5;
            spawnCustomParticle('🪨', to.x, to.y + 20, {
                size: 17, delay: i * 35, duration: 520 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 44}px, ${Math.sin(a) * 30}px) translate(-50%,-50%) scale(1) rotate(200deg)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 70}px, ${Math.sin(a) * 8}px) translate(-50%,-50%) scale(0.7) rotate(360deg)`, opacity: 0 }
                ]
            });
        }
        spawnMonolithRings(to.x, to.y + 20, 2, MONOLITH_STONE, 520, { size: 60, stagger: 90, scaleTo: 2.4 });
        playRecoilMotion(otherSide(side), { distance: 17, rotate: 13, duration: 620 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.64);
}
registerCustomSkillMotion('cho_monotaore', playChoMonotaoreMotion, 'モノリス');

// --- 3連アタック：石の体で3回続けて打ちつける ---
function playSanrenAttackMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;

    // 3回、少しずつ深く打ち込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0)', offset: 0 },
        { transform: `translateX(${travel * 0.8}px)`, offset: 0.22 },
        { transform: 'translateX(0)', offset: 0.34 },
        { transform: `translateX(${travel * 0.9}px)`, offset: 0.5 },
        { transform: 'translateX(0)', offset: 0.62 },
        { transform: `translateX(${travel * 1.1}px)`, offset: 0.78 },
        { transform: 'translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.22, 28], [0.5, 30], [0.78, 40]].forEach(([at, size], i) => {
        setTimeout(() => {
            const oy = (i - 1) * 14;
            spawnImpactBurst(to.x, to.y + oy, { size, duration: 320 * EFFECT_SPEED_MULTIPLIER });
            spawnCustomParticle('🪨', to.x, to.y + oy, {
                size: 18, duration: 340 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.1) rotate(160deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(14px,-16px) translate(-50%,-50%) scale(0.7) rotate(300deg)', opacity: 0 }
                ]
            });
            playRecoilMotion(otherSide(side), { distance: i === 2 ? 13 : 7, rotate: i === 2 ? 10 : 5, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        }, duration * at);
    });
}
registerCustomSkillMotion('sanren_attack', playSanrenAttackMotion, 'モノリス');

// --- サケビ声：大きく身を反らして叫び、音の輪を叩きつける ---
function playSakebigoeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    // 身を反らして息を吸い、前へ叫ぶ
    animateSpriteLayers(side, [
        { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'scale(0.94,1.08) rotate(-6deg)', offset: 0.26 },  // 吸い込む
        { transform: 'scale(1.14,0.94) rotate(4deg)', offset: 0.45 },   // 叫ぶ
        { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnMonolithRings(from.x, from.y, 4, '#ffd84d', 640, { stagger: 110, scaleTo: 2.8 });
        // 相手が音圧で仰け反る
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { emoji: '💢', size: 30, duration: 380 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
        }, 260 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('sakebigoe', playSakebigoeMotion, 'モノリス');

// --- オーロラゲート：虹色の門が開き、神秘の光が相手を包む ---
function playAuroraGateMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.05)', offset: 0.32 },
        { transform: 'translateY(-10px) scale(1.05)', offset: 0.56 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 自分の前に、虹色の門が段階的に開く
    const auroraColors = ['#7dd3fc', '#a78bfa', '#f0abfc', '#86efac'];
    auroraColors.forEach((color, i) => {
        spawnCustomParticle('◯', from.x + (to.x - from.x) * 0.35, from.y, {
            size: 58 + i * 8, color,
            delay: 140 + i * 130, duration: 700 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) rotate(140deg)', opacity: 0.9, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(1.5) rotate(260deg)', opacity: 0 }
            ]
        });
    });

    // 門から放たれた光が相手を包む
    setTimeout(() => {
        auroraColors.forEach((color, i) => {
            spawnBeamLine(from.x + (to.x - from.x) * 0.35, from.y + (i - 1.5) * 10,
                to.x - (from.x + (to.x - from.x) * 0.35), to.y - (from.y + (i - 1.5) * 10),
                color, 480 * EFFECT_SPEED_MULTIPLIER, 7);
        });
        setTimeout(() => {
            spawnSelfParticleRing(targetEl, '✨', 6, 18, 620 * EFFECT_SPEED_MULTIPLIER, 40);
            spawnImpactBurst(to.x, to.y, { size: 42, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
        }, 220 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.56);
}
registerCustomSkillMotion('aurora_gate', playAuroraGateMotion, 'モノリス');

// --- トリオビームZ：3本の光線を同時に走らせ、相手の位置で交差させる ---
function playTrioBeamZMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(0.95)', offset: 0.28 },   // 溜める
        { transform: 'scale(1.08)', offset: 0.46 },   // 撃つ
        { transform: 'scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 3つの発射点に光が集まる
    const offsets = [-22, 0, 22];
    offsets.forEach((oy, i) => {
        spawnCustomParticle('✦', from.x, from.y + oy, {
            size: 22, color: '#7dd3fc', delay: 120 + i * 70, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0 }
            ]
        });
    });

    // 3本の光線が同時に走り、相手の一点で交差する
    setTimeout(() => {
        offsets.forEach((oy) => {
            spawnBeamLine(from.x, from.y + oy, to.x - from.x, to.y - (from.y + oy), '#7dd3fc', 520 * EFFECT_SPEED_MULTIPLIER, 9);
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            spawnCustomParticle('✦', to.x, to.y, {
                size: 56, color: '#e0f2fe', duration: 440 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }
                ]
            });
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
        }, 240 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.46);
}
registerCustomSkillMotion('trio_beam_z', playTrioBeamZMotion, 'モノリス');

// --- 神秘の守り：自己強化。淡い光の膜が体を包む ---
function playShinpiNoMamoriMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.05)', offset: 0.4 },
        { transform: 'scale(1.02)', offset: 0.7 },
        { transform: 'scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 守りの膜が二重に閉じていく（外から内へ収束させて「包まれる」感じにする）
    ['#a5b4fc', '#c4b5fd'].forEach((color, i) => {
        spawnCustomParticle('◯', x, y, {
            size: 64, color, delay: i * 200, duration: 760 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.9, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.95)', opacity: 0 }
            ]
        });
    });
    spawnSelfParticleRing(casterEl, '✨', 6, 17, 760 * EFFECT_SPEED_MULTIPLIER, 38);
}
registerCustomSkillMotion('shinpi_no_mamori', playShinpiNoMamoriMotion, 'モノリス');

// --- 超音波：目に見えない高周波を浴びせ、相手を混乱させる ---
function playChoonpaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.03,0.98)', offset: 0.25 },
        { transform: 'scale(0.98,1.03)', offset: 0.5 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 細かい輪を短い間隔で連射する（＝高周波のイメージ）
    spawnMonolithRings(from.x, from.y, 6, '#a5f3fc', 520, { size: 40, stagger: 80, scaleTo: 2.2 });

    // 相手は平衡感覚を失ってふらつく
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) translateX(0)', offset: 0 },
            { transform: 'rotate(6deg) translateX(4px)', offset: 0.22 },
            { transform: 'rotate(-6deg) translateX(-4px)', offset: 0.46 },
            { transform: 'rotate(4deg) translateX(3px)', offset: 0.7 },
            { transform: 'rotate(0deg) translateX(0)', offset: 1 }
        ], { duration: 700 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('💫', to.x, to.y - 24, {
                size: 18, delay: i * 85, duration: 680 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 20}px, ${Math.sin(a) * 8}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 22}px, ${Math.sin(a + 2.1) * 9}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 20}px, ${Math.sin(a + 4.2) * 8}px) translate(-50%,-50%) scale(0.75)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.5);
}
registerCustomSkillMotion('choonpa', playChoonpaMotion, 'モノリス');
