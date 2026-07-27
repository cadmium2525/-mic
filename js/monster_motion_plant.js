// =====================================================
// monster_motion_plant.js
// プラント専用のバトルモーション演出。
//
// プラントの特徴（＝演出の軸）：
//   ・根とツル       → 打撃系は「地面から根が生える」「ツルがしなって叩く」動きで見せる
//   ・種を撃ち出す   → 種ガン系は弾数の差（1発／連射）をはっきり見せ分ける
//   ・花粉・胞子     → 状態異常系はふわりと漂う粉で見せる
//   ・生命を吸う     → ドレインは相手→自分へ流れる緑の光で見せる
//
// 対応技：連続根っこ／コンビネーション／フェイスドリル／種ガン／種マシンガン／
//         花粉／フラワービーム／ドレイン／どくのこな
// =====================================================

const PLANT_GREEN = '#7ed957';

// --- 共通：地面から根が突き上がる ---
function spawnPlantRoot(x, y, opts = {}) {
    const { size = 30, duration = 420, delay = 0 } = opts;
    spawnCustomParticle('🌿', x, y + 24, {
        size, delay, color: PLANT_GREEN,
        duration: duration * EFFECT_SPEED_MULTIPLIER,
        keyframes: [
            { transform: 'translate(-50%,-50%) translateY(24px) scaleY(0.3)', opacity: 0 },
            { transform: 'translate(-50%,-50%) translateY(-16px) scaleY(1.25)', opacity: 1, offset: 0.45 },
            { transform: 'translate(-50%,-50%) translateY(-26px) scaleY(1)', opacity: 0 }
        ]
    });
}

// --- 連続根っこ：相手の足元から根が次々と突き上がる ---
function playRenkonMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;

    // 根を伸ばすため、地面へ力を送り込むように沈み込む
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.05,0.93)', offset: 0.2 },
        { transform: 'scale(0.98,1.04)', offset: 0.45 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 手前から奥へ、位置をずらしながら根が連続で突き上がる
    const hits = 4;
    for (let i = 0; i < hits; i++) {
        const ox = (i - (hits - 1) / 2) * 22;
        setTimeout(() => {
            spawnPlantRoot(to.x + ox, to.y, { size: 28 + (i % 2) * 6 });
            spawnImpactBurst(to.x + ox, to.y, { emoji: '✨', size: 20, duration: 260 * EFFECT_SPEED_MULTIPLIER, color: PLANT_GREEN });
        }, duration * (0.22 + (i / hits) * 0.55));
    }
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 10, rotate: -7 }), duration * 0.72);
}
registerCustomSkillMotion('renkon', playRenkonMotion, 'プラント');

// --- コンビネーション：ツルをしならせて連打する ---
function playCombinationPlantMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 950 * EFFECT_SPEED_MULTIPLIER;

    // 体をしならせて、左右から交互に叩き込む
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) translateX(0)', offset: 0 },
        { transform: 'rotate(-13deg) translateX(-4px)', offset: 0.2 },
        { transform: 'rotate(11deg) translateX(6px)', offset: 0.38 },
        { transform: 'rotate(-10deg) translateX(-3px)', offset: 0.56 },
        { transform: 'rotate(12deg) translateX(7px)', offset: 0.74 },
        { transform: 'rotate(0deg) translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.38, -30], [0.74, 30]].forEach(([at, angle], i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y + (i === 0 ? -10 : 10), angle, { length: 100, width: 9, color: PLANT_GREEN, duration: 260 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + (i === 0 ? -10 : 10), { size: i === 1 ? 34 : 28, duration: 320 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 12 : 8, rotate: i === 1 ? 9 : 6 });
        }, duration * at);
    });
}
registerCustomSkillMotion('combination_plant', playCombinationPlantMotion, 'プラント');

// --- フェイスドリル：頭部を高速回転させて突っ込む ---
function playFaceDrillMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    // 回転しながら突っ込む
    const { impactAt } = playLungeMotion(side, { reach: 0.72, duration, spin: 720 });

    setTimeout(() => {
        // ドリルの回転を表す渦を重ねる
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('🌀', to.x, to.y, {
                size: 30, delay: i * 60, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: PLANT_GREEN,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.25) rotate(320deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(0.85) rotate(600deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 10 });
    }, impactAt);
}
registerCustomSkillMotion('face_drill', playFaceDrillMotion, 'プラント');

// --- 種ガン：狙いを定めて種を1発撃ち出す ---
function playTaneGunMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 720 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 反動でぐっと引いてから撃つ
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: `translateX(${-dx * 0.04}px) scale(0.96)`, offset: 0.28 },
        { transform: `translateX(${dx * 0.03}px) scale(1.04)`, offset: 0.42 },
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 種が一直線に飛ぶ
    spawnCustomParticle('🌰', from.x, from.y, {
        size: 22, delay: duration * 0.36, duration: 380 * EFFECT_SPEED_MULTIPLIER,
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) translate(-50%,-50%) scale(1) rotate(360deg)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.9) rotate(720deg)`, opacity: 1, offset: 1 }
        ]
    });
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 28, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 8, rotate: 5 });
    }, duration * 0.36 + 380 * EFFECT_SPEED_MULTIPLIER);
}
registerCustomSkillMotion('tane_gun', playTaneGunMotion, 'プラント');

// --- 種マシンガン：種を高速で連射する（種ガンとの差を「弾数と連射感」で出す） ---
function playTaneMachinegunMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 連射の反動で小刻みに揺れ続ける
    const kf = [{ transform: 'translateX(0)', offset: 0 }];
    for (let i = 0; i < 6; i++) {
        const base = 0.16 + (i / 6) * 0.68;
        kf.push({ transform: `translateX(${-dx * 0.03}px)`, offset: base });
        kf.push({ transform: 'translateX(0)', offset: base + 0.04 });
    }
    kf.push({ transform: 'translateX(0)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    // 種を8発、ばらつかせながら連射する
    const shots = 8;
    for (let i = 0; i < shots; i++) {
        const spread = (Math.random() - 0.5) * 34;
        spawnCustomParticle('🌰', from.x, from.y, {
            size: 16 + Math.random() * 5,
            delay: duration * 0.16 + i * 75,
            duration: 330 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + spread * 0.4}px) translate(-50%,-50%) scale(0.95) rotate(280deg)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px, ${dy + spread}px) translate(-50%,-50%) scale(0.85) rotate(560deg)`, opacity: 1, offset: 1 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x + (Math.random() - 0.5) * 26, to.y + spread * 0.6, {
                emoji: '✨', size: 17, duration: 220 * EFFECT_SPEED_MULTIPLIER, color: PLANT_GREEN
            });
        }, duration * 0.16 + i * 75 + 330 * EFFECT_SPEED_MULTIPLIER);
    }
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 9, rotate: 6 }), duration * 0.8);
}
registerCustomSkillMotion('tane_machinegun', playTaneMachinegunMotion, 'プラント');

// --- 花粉：ふわりと広がる花粉を浴びせる ---
function playKafunMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 体を震わせて花粉を飛ばす
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg)', offset: 0 },
        { transform: 'rotate(-4deg)', offset: 0.15 },
        { transform: 'rotate(4deg)', offset: 0.3 },
        { transform: 'rotate(-3deg)', offset: 0.45 },
        { transform: 'rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 花粉がゆっくり漂いながら相手を包む（重力に逆らってふわふわ舞う軌道）
    for (let i = 0; i < 8; i++) {
        const drift = (Math.random() - 0.5) * 46;
        const rise = -20 - Math.random() * 24;
        spawnCustomParticle('🌸', from.x, from.y, {
            size: 15 + Math.random() * 7,
            delay: 140 + i * 65,
            duration: 780 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${rise}px) translate(-50%,-50%) scale(1) rotate(120deg)`, opacity: 0.95, offset: 0.45 },
                { transform: `translate(${dx}px, ${drift}px) translate(-50%,-50%) scale(0.9) rotate(280deg)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnSelfParticleRing(targetEl, '🌸', 5, 16, 620 * EFFECT_SPEED_MULTIPLIER, 34);
        spawnImpactBurst(to.x, to.y - 14, { emoji: '😵', size: 26, duration: 420 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.62);
}
registerCustomSkillMotion('kafun', playKafunMotion, 'プラント');

// --- フラワービーム：花を開いて緑の光線を放つ ---
function playFlowerBeamMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    // 花が開くように膨らんでから撃つ
    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(0.94)', offset: 0.2 },
        { transform: 'scale(1.1)', offset: 0.42 },   // 開く
        { transform: 'scale(1.04)', offset: 0.56 },
        { transform: 'scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 花が開くとともに、周囲に花びらが舞う
    setTimeout(() => spawnSelfParticleRing(casterEl, '🌼', 6, 18, 560 * EFFECT_SPEED_MULTIPLIER, 34), duration * 0.24);

    setTimeout(() => {
        spawnBeamLine(from.x, from.y, to.x - from.x, to.y - from.y, PLANT_GREEN, 520 * EFFECT_SPEED_MULTIPLIER, 15);
        setTimeout(() => {
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 * i) / 4;
                spawnCustomParticle('🌼', to.x, to.y, {
                    size: 20, delay: i * 45, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: PLANT_GREEN,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 34}px, ${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 54}px, ${Math.sin(a) * 42}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
        }, 220 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.46);
}
registerCustomSkillMotion('flower_beam', playFlowerBeamMotion, 'プラント');

// --- ドレイン：相手の生命力を吸い上げて自分の傷を癒やす ---
function playDrainMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = from.x - to.x; // 相手 → 自分 の向き（吸い上げるので逆向き）
    const dy = from.y - to.y;

    // 吸い上げるにつれて、じわじわ膨らむ
    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.02)', offset: 0.4 },
        { transform: 'scale(1.07)', offset: 0.72 },
        { transform: 'scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手がしぼんでいく
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(0.94,0.92)', offset: 0.5 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 760 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
    }, duration * 0.2);

    // 生命力の光が相手から自分へ流れ込む
    for (let i = 0; i < 6; i++) {
        const wobble = (Math.random() - 0.5) * 30;
        spawnCustomParticle('💚', to.x, to.y, {
            size: 17 + Math.random() * 6,
            delay: 160 + i * 105,
            duration: 640 * EFFECT_SPEED_MULTIPLIER,
            color: PLANT_GREEN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + wobble}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 }
            ]
        });
    }
    // 吸い切った後、自分が癒える
    setTimeout(() => spawnSelfParticleRing(casterEl, '✨', 5, 17, 620 * EFFECT_SPEED_MULTIPLIER, 36), duration * 0.72);
}
registerCustomSkillMotion('drain', playDrainMotion, 'プラント');

// --- どくのこな：紫の毒の粉をまき散らす ---
function playDokuNoKonaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-6deg) scale(1.04)', offset: 0.2 },
        { transform: 'rotate(6deg) scale(1.02)', offset: 0.4 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 毒の粉が重く沈みながら相手を覆う（花粉より低く、ゆっくり垂れ込める軌道にする）
    for (let i = 0; i < 8; i++) {
        const drift = (Math.random() - 0.5) * 40;
        spawnCustomParticle('☠️', from.x, from.y, {
            size: 15 + Math.random() * 7,
            delay: 130 + i * 62,
            duration: 800 * EFFECT_SPEED_MULTIPLIER,
            color: '#a855f7',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${-6 + drift * 0.3}px) translate(-50%,-50%) scale(1)`, opacity: 0.95, offset: 0.45 },
                { transform: `translate(${dx}px, ${18 + drift}px) translate(-50%,-50%) scale(1.15)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnSelfParticleRing(targetEl, '💜', 5, 16, 620 * EFFECT_SPEED_MULTIPLIER, 34);
        spawnImpactBurst(to.x, to.y - 12, { emoji: '🤢', size: 26, duration: 440 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.62);
}
registerCustomSkillMotion('doku_no_kona', playDokuNoKonaMotion, 'プラント');
