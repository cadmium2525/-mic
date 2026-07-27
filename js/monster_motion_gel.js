// =====================================================
// monster_motion_gel.js
// ゲル専用のバトルモーション演出。
//
// ゲルの特徴（＝演出の軸）：
//   ・半透明のゼリー状の体 → 攻撃のたびに体が「伸びる・潰れる」変形を伴わせる。
//                            ネンドロの粘土が「重く潰れる」のに対し、ゲルは
//                            「弾力で跳ね返る」揺れ（オーバーシュート）で描き分ける
//   ・体を変形させて武器にする → 突き刺し・ムチは体の一部を伸ばして攻撃する
//   ・不思議な機械技       → パラボラビーム・大砲・ゲルコプターは、
//                            体から機械を生やしたようなギャップのある見た目にする
//
// 対応技：突き刺し／くし刺し／マナドレイン／ムチ／G・キューブ／ゲルプレス／
//         ハエタタキ／パラボラビーム／超パラボラビーム／コマアタック／大砲／ゲルコプター
// =====================================================

const GEL_BODY = '#7fd8e8';   // ゲルの体色（半透明の水色）
const GEL_ENERGY = '#a8f0ff'; // ビーム等のエネルギー色

// --- ゲル共通：体の一部を伸ばして突き出す（突き刺し・ムチ等で使う） ---
//   帯と先端は同じ補間カーブで動かし、先端だけ先行しないようにする。
function spawnGelExtend(fromX, fromY, toX, toY, totalDuration, opts = {}) {
    const { width = 13, color = GEL_BODY, tipEmoji = '◆', holdRatio = 0.16 } = opts;
    const dx = toX - fromX, dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const extendEnd = (1 - holdRatio) / 2;
    const holdEnd = extendEnd + holdRatio;

    const arm = document.createElement('div');
    arm.style.cssText = `position:fixed; left:${fromX}px; top:${fromY}px; width:${length}px; height:${width}px;
        margin-top:${-width / 2}px; transform-origin:0% 50%; pointer-events:none; z-index:9998;
        border-radius:${width}px; background:linear-gradient(90deg, ${color}, #c8f4ff);
        box-shadow:0 0 8px 2px rgba(127,216,232,0.5);`;
    document.body.appendChild(arm);
    try {
        const anim = arm.animate([
            { transform: `rotate(${angle}deg) scaleX(0) scaleY(1.4)`, opacity: 1, offset: 0 },
            { transform: `rotate(${angle}deg) scaleX(1) scaleY(1)`, opacity: 1, offset: extendEnd },
            { transform: `rotate(${angle}deg) scaleX(1) scaleY(1)`, opacity: 1, offset: holdEnd },
            { transform: `rotate(${angle}deg) scaleX(0) scaleY(1.4)`, opacity: 1, offset: 1 }
        ], { duration: totalDuration, easing: 'ease-in-out', fill: 'forwards' });
        anim.onfinish = () => arm.remove();
        setTimeout(() => arm.remove(), totalDuration + 200);
    } catch (e) { arm.remove(); }

    spawnCustomParticle(tipEmoji, fromX, fromY, {
        size: 24, duration: totalDuration, color, easing: 'ease-in-out',
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 0 },
            { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: extendEnd },
            { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: holdEnd },
            { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 1 }
        ]
    });
}

// --- ゲル共通：弾力で揺れる体（跳ね返るような伸縮） ---
function gelWobbleKeyframes(intensity = 1) {
    const a = 0.14 * intensity, b = 0.08 * intensity;
    return [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: `scale(${1 - a},${1 + a})`, offset: 0.22 },
        { transform: `scale(${1 + a},${1 - a})`, offset: 0.42 },
        { transform: `scale(${1 - b},${1 + b})`, offset: 0.62 },
        { transform: `scale(${1 + b * 0.5},${1 - b * 0.5})`, offset: 0.8 },
        { transform: 'scale(1,1)', offset: 1 }
    ];
}

// --- 突き刺し：体の先端を尖らせて一突き ---
function playTsukisashiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, gelWobbleKeyframes(1), { duration, easing: 'ease-in-out' });
    setTimeout(() => {
        spawnGelExtend(from.x, from.y, to.x, to.y, 480 * EFFECT_SPEED_MULTIPLIER, { width: 12 });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY });
            playRecoilMotion(otherSide(side), { distance: 11, rotate: 7 });
        }, 480 * EFFECT_SPEED_MULTIPLIER * 0.42);
    }, duration * 0.24);
}
registerCustomSkillMotion('tsukisashi', playTsukisashiMotion, 'ゲル');

// --- くし刺し：複数本を同時に突き出して串刺しにする（突き刺しの多段版） ---
function playKushizashiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, gelWobbleKeyframes(1.3), { duration, easing: 'ease-in-out' });
    // 3本を高さをずらして順に突き出す
    [-20, 0, 20].forEach((oy, i) => {
        setTimeout(() => {
            spawnGelExtend(from.x, from.y + oy * 0.4, to.x, to.y + oy, 440 * EFFECT_SPEED_MULTIPLIER, { width: 10 });
            setTimeout(() => {
                spawnImpactBurst(to.x, to.y + oy, { size: i === 1 ? 34 : 26, duration: 280 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY });
            }, 440 * EFFECT_SPEED_MULTIPLIER * 0.42);
        }, duration * (0.2 + i * 0.16));
    });
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 }), duration * 0.68);
}
registerCustomSkillMotion('kushizashi', playKushizashiMotion, 'ゲル');

// --- マナドレイン：相手のガッツを吸い上げて自分に取り込む ---
function playManaDrainMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const dx = from.x - to.x, dy = from.y - to.y;

    // 吸い込むにつれて体が膨らんでいく
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(0.96,1.04)', offset: 0.24 },
        { transform: 'scale(1.12,1.12)', offset: 0.62 },  // 吸って膨らむ
        { transform: 'scale(1.04,1.04)', offset: 0.82 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手からエネルギーの粒が流れてくる
    for (let i = 0; i < 6; i++) {
        const jitter = (Math.random() - 0.5) * 30;
        spawnCustomParticle('✦', to.x + jitter, to.y + jitter * 0.5, {
            size: 18, delay: duration * 0.24 + i * 75, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: GEL_ENERGY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) translate(-50%,-50%) scale(0.9)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.2)`, opacity: 0 }
            ]
        });
    }
    // 吸われた側は力が抜ける
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(0.94,0.94)', offset: 0.45 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
    }, duration * 0.4);
}
registerCustomSkillMotion('mana_drain', playManaDrainMotion, 'ゲル');

// --- ムチ：体を細長く伸ばしてしならせ、鞭のように打つ ---
function playMuchiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;

    // しならせてから振り抜く
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'rotate(-12deg) scale(0.94,1.08)', offset: 0.26 },
        { transform: 'rotate(12deg) scale(1.1,0.94)', offset: 0.46 },
        { transform: 'rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 鞭は上から巻き込むように当てる
        spawnGelExtend(from.x, from.y - 10, to.x, to.y - 8, 420 * EFFECT_SPEED_MULTIPLIER, { width: 9, holdRatio: 0.1 });
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, 24, { length: 106, width: 8, color: GEL_BODY, duration: 260 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
        }, 420 * EFFECT_SPEED_MULTIPLIER * 0.4);
    }, duration * 0.28);
}
registerCustomSkillMotion('muchi', playMuchiMotion, 'ゲル');

// --- G・キューブ：体を立方体に固めて叩きつける ---
function playGCubeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 980 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // 丸い体が角ばって固まり、そのまま突っ込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translateX(0) scale(1.08,0.92) rotate(0deg)', offset: 0.2 },   // 固まる
        { transform: `translateX(${travel}px) scale(1.04,1.04) rotate(90deg)`, offset: 0.5 }, // 立方体で突撃
        { transform: `translateX(${travel * 0.6}px) scale(1,1) rotate(90deg)`, offset: 0.72 },
        { transform: 'translateX(0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 角ばった形の衝撃（回転する四角い光）
        for (let i = 0; i < 2; i++) {
            spawnCustomParticle('◼', to.x, to.y, {
                size: 44, delay: i * 90, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2) rotate(45deg)', opacity: 0.9, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(1.8) rotate(90deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.5);
}
registerCustomSkillMotion('g_cube', playGCubeMotion, 'ゲル');

// --- ゲルプレス：体を大きく広げて上から押し潰す ---
function playGelPressMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1020 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 跳び上がって、べちゃっと平たく潰れながら落ちる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) scale(1.12,0.88)', offset: 0.14 },
        { transform: `translate(${dx * 0.5}px,-46px) scale(0.88,1.16)`, offset: 0.4 },
        { transform: `translate(${dx * 0.85}px,6px) scale(1.4,0.62)`, offset: 0.6 },  // 押し潰す
        { transform: `translate(${dx * 0.5}px,0) scale(1.06,0.96)`, offset: 0.78 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y + 12, {
            size: 64, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) scaleY(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3) scaleY(0.45)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2) scaleY(0.5)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y + 8, { size: 42, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.58);
}
registerCustomSkillMotion('gel_press', playGelPressMotion, 'ゲル');

// --- ハエタタキ：平たい面で上から叩き落とす（コミカル） ---
function playHaeTatakiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'rotate(-16deg) scale(0.94,1.06)', offset: 0.28 },
        { transform: 'rotate(14deg) scale(1.12,0.9)', offset: 0.46 },
        { transform: 'rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 平たい面がぺちんと当たる（横に広い衝撃）
        spawnCustomParticle('◼', to.x, to.y - 10, {
            size: 50, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY,
            keyframes: [
                { transform: 'translate(-50%,-50%) translateY(-24px) scaleX(1.6) scaleY(0.25)', opacity: 0 },
                { transform: 'translate(-50%,-50%) translateY(4px) scaleX(1.8) scaleY(0.3)', opacity: 0.95, offset: 0.45 },
                { transform: 'translate(-50%,-50%) translateY(10px) scaleX(2) scaleY(0.35)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 30, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.46);
}
registerCustomSkillMotion('hae_tataki', playHaeTatakiMotion, 'ゲル');

// --- パラボラビーム：体からパラボラアンテナを生やして光線を撃つ ---
//   超パラボラビームは同じ形で、ため・太さ・着弾を一段階大きくする
function playParabolaBeamMotion(side, opts = {}) {
    const { superMode = false } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chargeMs = (superMode ? 640 : 440) * EFFECT_SPEED_MULTIPLIER;
    const beamMs = (superMode ? 700 : 520) * EFFECT_SPEED_MULTIPLIER;

    // アンテナを展開する（上に伸びてから固まる）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: `scale(${superMode ? 0.88 : 0.92},${superMode ? 1.2 : 1.12})`, offset: 0.3 }, // 展開
        { transform: 'scale(1.02,1.02)', offset: 0.55 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration: chargeMs + beamMs, easing: 'ease-in-out' });

    // 皿にエネルギーが集まる
    const ringCount = superMode ? 5 : 3;
    for (let i = 0; i < ringCount; i++) {
        const a = (Math.PI * 2 * i) / ringCount;
        spawnCustomParticle('✦', from.x + Math.cos(a) * 36, from.y + Math.sin(a) * 26 - 12, {
            size: superMode ? 24 : 20, delay: i * 70, duration: chargeMs, color: GEL_ENERGY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * 36}px,${-Math.sin(a) * 26 + 12}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        const beamCount = superMode ? 3 : 1;
        for (let i = 0; i < beamCount; i++) {
            const oy = beamCount === 1 ? -12 : (i - 1) * 14 - 12;
            spawnBeamLine(from.x, from.y + oy, to.x - from.x, to.y - (from.y + oy), GEL_ENERGY, beamMs, superMode ? 16 : 10);
        }
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: superMode ? 54 : 36, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: GEL_ENERGY });
            const burst = superMode ? 6 : 3;
            for (let i = 0; i < burst; i++) {
                const a = (Math.PI * 2 * i) / burst;
                spawnCustomParticle('✨', to.x, to.y, {
                    size: 20, delay: i * 45, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: GEL_ENERGY,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 36}px,${Math.sin(a) * 28}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 60}px,${Math.sin(a) * 46}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            playRecoilMotion(otherSide(side), { distance: superMode ? 16 : 11, rotate: superMode ? 12 : 8, duration: superMode ? 580 : 420 });
        }, beamMs * 0.3);
    }, chargeMs);
}
registerCustomSkillMotion('parabola_beam', (side) => playParabolaBeamMotion(side, { superMode: false }), 'ゲル');
registerCustomSkillMotion('cho_parabola_beam', (side) => playParabolaBeamMotion(side, { superMode: true }), 'ゲル');

// --- コマアタック：体を独楽のように高速回転させてぶつかる ---
function playKomaAttackMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 940 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;

    // 独楽らしく、細長くすぼまりながら回る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) rotate(240deg) scale(0.86,1.14)', offset: 0.24 },
        { transform: `translateX(${travel * 0.4}px) rotate(720deg) scale(0.82,1.18)`, offset: 0.46 },
        { transform: `translateX(${travel}px) rotate(1260deg) scale(0.86,1.14)`, offset: 0.66 },
        { transform: `translateX(${travel * 0.5}px) rotate(1440deg) scale(1,1)`, offset: 0.84 },
        { transform: 'translateX(0) rotate(1440deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('🌀', to.x, to.y, {
                size: 30, delay: i * 60, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.25) rotate(300deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(540deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 10 });
    }, duration * 0.64);
}
registerCustomSkillMotion('koma_attack', playKomaAttackMotion, 'ゲル');

// --- 大砲：体から砲身を生やして砲弾を撃ち出す ---
function playTaihouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 砲身を形成 → 発射の反動で大きく仰け反る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(1.1,0.94)', offset: 0.3 },                       // 砲身展開
        { transform: `translateX(${-Math.sign(dx) * 16}px) scale(0.9,1.1)`, offset: 0.46 }, // 反動
        { transform: 'translateX(0) scale(1.02,0.99)', offset: 0.66 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        // 発砲炎
        spawnCustomParticle('💥', from.x + Math.sign(dx) * 22, from.y, {
            size: 30, duration: 300 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
            ]
        });
        // 砲弾が弧を描いて飛ぶ
        spawnCustomParticle('⬤', from.x, from.y, {
            size: 24, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: '#5a6b78', easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 30}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.05)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 560 });
        }, 460 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.44);
}
registerCustomSkillMotion('taihou', playTaihouMotion, 'ゲル');

// --- ゲルコプター：頭上に回転翼を生やして飛び上がり、上空から突っ込む ---
function playGelCopterMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 浮上 → 移動 → 急降下
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,-14px) scale(0.94,1.08) rotate(0deg)', offset: 0.2 },      // 浮上
        { transform: `translate(${dx * 0.5}px,-56px) scale(0.92,1.1) rotate(0deg)`, offset: 0.42 }, // 上空を移動
        { transform: `translate(${dx * 0.9}px,-40px) scale(0.94,1.06) rotate(20deg)`, offset: 0.56 },
        { transform: `translate(${dx * 0.9}px,6px) scale(1.14,0.88) rotate(0deg)`, offset: 0.72 },  // 急降下
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 回転翼が回り続ける
    for (let i = 0; i < 5; i++) {
        const t = i / 5;
        spawnCustomParticle('🌀', from.x + dx * 0.5 * t, from.y - 20 - t * 34, {
            size: 26, delay: i * 80, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: GEL_BODY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1) rotate(360deg)', opacity: 0.9, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.8) rotate(720deg)', opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        // 降下の風圧
        spawnCustomParticle('💨', to.x, to.y + 16, {
            size: 34, duration: 440 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) scaleY(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5) scaleY(0.6)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2.2) scaleY(0.7)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y + 6, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
    }, duration * 0.72);
}
registerCustomSkillMotion('gel_copter', playGelCopterMotion, 'ゲル');
