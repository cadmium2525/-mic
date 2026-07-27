// =====================================================
// monster_motion_nendoro.js
// ネンドロ専用のバトルモーション演出。
//
// ネンドロの特徴（＝演出の軸）：
//   ・粘土のように柔らかい体 → 全ての技で「潰れる・伸びる」変形（scaleのX/Y差）を効かせる。
//                              これがネンドロらしさの核なので、どの技にも必ず入れている。
//   ・腕を自在に伸ばせる     → ズームパンチは腕だけが伸びて届く
//   ・不気味さと道連れの執念 → みちづれ・めいどのみやげは暗い色で、纏わりつくように見せる
//
// 対応技：ズームパンチ／マッハパンチ／みちづれ／めいどのみやげ／がん飛ばし／
//         ボディプレス／投げキッス／ねんどがため／ようかい液
// =====================================================

const NENDORO_CLAY = '#b8a68c';  // 粘土の色
const NENDORO_OMEN = '#8f7fb5';  // 不吉な色（みちづれ系）

// --- 粘土らしい「伸びる腕」を描く（ズームパンチ・ロケット状の技で共通利用） ---
//   根元から目標へ帯が伸び、先端に拳を置く。帯と拳は同じ補間カーブで動かして、
//   先端だけが先に進んでしまわないようにする。
function spawnNendoroStretchArm(fromX, fromY, toX, toY, totalDuration, opts = {}) {
    const { width = 15, color = NENDORO_CLAY, fistEmoji = '✊', holdRatio = 0.18 } = opts;
    const dx = toX - fromX, dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const extendEnd = (1 - holdRatio) / 2;
    const holdEnd = extendEnd + holdRatio;

    const arm = document.createElement('div');
    arm.style.cssText = `position:fixed; left:${fromX}px; top:${fromY}px; width:${length}px; height:${width}px;
        margin-top:${-width / 2}px; transform-origin:0% 50%; pointer-events:none; z-index:9998;
        border-radius:${width}px; background:linear-gradient(90deg, ${color}, #d4c4a8);
        box-shadow:0 0 5px 2px rgba(0,0,0,0.25);`;
    document.body.appendChild(arm);
    const kf = [
        { transform: `rotate(${angle}deg) scaleX(0) scaleY(1.3)`, opacity: 1, offset: 0 },
        { transform: `rotate(${angle}deg) scaleX(1) scaleY(1)`, opacity: 1, offset: extendEnd },
        { transform: `rotate(${angle}deg) scaleX(1) scaleY(1)`, opacity: 1, offset: holdEnd },
        { transform: `rotate(${angle}deg) scaleX(0) scaleY(1.3)`, opacity: 1, offset: 1 }
    ];
    try {
        const anim = arm.animate(kf, { duration: totalDuration, easing: 'ease-in-out', fill: 'forwards' });
        anim.onfinish = () => arm.remove();
        setTimeout(() => arm.remove(), totalDuration + 200);
    } catch (e) { arm.remove(); }

    spawnCustomParticle(fistEmoji, fromX, fromY, {
        size: 28, duration: totalDuration, easing: 'ease-in-out', // 帯と同じカーブで先端を動かす
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0, offset: 0 },
            { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: extendEnd },
            { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: holdEnd },
            { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0, offset: 1 }
        ]
    });
}

// --- ズームパンチ：腕をぐいっと伸ばして遠くから殴る ---
function playZoomPunchNendoroMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;

    // 本体は縮んでから伸びる（腕を送り出す反動を粘土らしい変形で表す）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.14,0.86)', offset: 0.24 },  // ぐっと縮む
        { transform: 'scale(0.86,1.14)', offset: 0.42 },  // 伸び上がる
        { transform: 'scale(1.04,0.96)', offset: 0.62 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnNendoroStretchArm(from.x, from.y, to.x, to.y, 520 * EFFECT_SPEED_MULTIPLIER);
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 34 });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
        }, 520 * EFFECT_SPEED_MULTIPLIER * 0.41);
    }, duration * 0.3);
}
registerCustomSkillMotion('zoom_punch_nendoro', playZoomPunchNendoroMotion, 'ネンドロ');

// --- マッハパンチ：目にも留まらぬ速さの連打（ズームパンチが「伸ばす」なら、こちらは「速さ」で差別化） ---
function playMachPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.55;
    const hits = 5;

    // 高速で前後に潰れながら打ち込む
    const kf = [{ transform: 'translateX(0) scale(1,1)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.12 + (i / hits) * 0.74;
        kf.push({ transform: `translateX(${travel}px) scale(1.1,0.92)`, offset: base });
        kf.push({ transform: `translateX(${travel * 0.72}px) scale(0.94,1.06)`, offset: base + 0.04 });
    }
    kf.push({ transform: 'translateX(0) scale(1,1)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const ox = (Math.random() - 0.5) * 22, oy = (Math.random() - 0.5) * 28;
            spawnImpactBurst(to.x + ox, to.y + oy, { size: 22, duration: 220 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.12 + (i / hits) * 0.74));
    }
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 }), duration * 0.86);
}
registerCustomSkillMotion('mach_punch', playMachPunchMotion, 'ネンドロ');

// --- みちづれ：相手に纏わりついて、道連れにしようとする ---
function playMichizureMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // ずるりと這うように近づき、相手に絡みつく
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: `translateX(${travel * 0.4}px) scale(1.2,0.8)`, offset: 0.3 },  // 平たく伸びて這う
        { transform: `translateX(${travel}px) scale(0.9,1.15)`, offset: 0.56 },       // 巻きつく
        { transform: `translateX(${travel}px) scale(0.9,1.15)`, offset: 0.72 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 不吉な鎖のような輪が相手を締め上げる
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('◯', to.x, to.y, {
            size: 52, delay: duration * 0.5 + i * 130, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_OMEN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0.9, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
            { transform: 'scale(0.92,1.06) rotate(-4deg)', offset: 0.35 },
            { transform: 'scale(0.95,1.03) rotate(4deg)', offset: 0.68 },
            { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
        ], { duration: 700 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 20, { emoji: '💀', size: 28, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_OMEN });
    }, duration * 0.6);
}
registerCustomSkillMotion('michizure', playMichizureMotion, 'ネンドロ');

// --- めいどのみやげ：最後の置き土産とばかりに、全身を破裂させてぶつける ---
function playMeidoNoMiyageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;

    // 大きく膨らんでから、相手に飛びついて弾ける
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(1.18,1.18)', offset: 0.3 },  // 膨れ上がる
        { transform: 'translateX(0) scale(1.24,1.24)', offset: 0.44 },
        { transform: `translateX(${(to.x - from.x) * 0.75}px) scale(0.8,0.8)`, offset: 0.62 }, // 飛びつく
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ためている間、不吉な光が集まる
    spawnSelfParticleRing(casterEl, '💀', 5, 18, 560 * EFFECT_SPEED_MULTIPLIER, 38);

    // 破裂：粘土の塊が四方に飛び散る
    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y, {
            size: 74, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_OMEN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1, offset: 0.35 },
                { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }
            ]
        });
        for (let i = 0; i < 7; i++) {
            const a = (Math.PI * 2 * i) / 7;
            spawnCustomParticle('●', to.x, to.y, {
                size: 18, delay: i * 40, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_CLAY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 44}px,${Math.sin(a) * 34}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.4 },
                    { transform: `translate(${Math.cos(a) * 76}px,${Math.sin(a) * 58}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 52, duration: 520 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 18, rotate: 13, duration: 620 });
    }, duration * 0.6);
}
registerCustomSkillMotion('meido_no_miyage', playMeidoNoMiyageMotion, 'ネンドロ');

// --- がん飛ばし：ぐっと睨みつけて相手を怯ませる ---
function playGandukeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 体を低く構えて、ぐっと前に押し出すように睨む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(-4px) scale(1.06,0.94)', offset: 0.26 },
        { transform: `translateX(${(to.x - from.x) * 0.06}px) scale(1.1,1.02)`, offset: 0.44 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 睨みが飛ぶ（鋭い視線）
    setTimeout(() => {
        spawnBeamLine(from.x, from.y - 6, to.x - from.x, to.y - (from.y - 6), NENDORO_OMEN, 380 * EFFECT_SPEED_MULTIPLIER, 6);
        setTimeout(() => {
            // 睨まれてすくみ上がる
            animateSpriteLayers(otherSide(side), [
                { transform: 'scale(1,1) translateX(0)', offset: 0 },
                { transform: 'scale(0.92,0.94) translateX(6px)', offset: 0.35 },
                { transform: 'scale(0.97,0.98) translateX(2px)', offset: 0.7 },
                { transform: 'scale(1,1) translateX(0)', offset: 1 }
            ], { duration: 560 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
            spawnImpactBurst(to.x, to.y - 20, { emoji: '😨', size: 26, duration: 480 * EFFECT_SPEED_MULTIPLIER });
        }, 200 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('ganduke', playGandukeMotion, 'ネンドロ');

// --- ボディプレス：全身を平たく潰しながら相手に覆いかぶさる ---
function playBodyPressNendoroMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 跳び上がって、真上から潰れながら落ちる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) scale(1.1,0.9)', offset: 0.14 },              // 沈む
        { transform: `translate(${dx * 0.5}px,-46px) scale(0.9,1.14)`, offset: 0.4 }, // 跳ぶ
        { transform: `translate(${dx * 0.85}px,4px) scale(1.32,0.68)`, offset: 0.6 },  // 潰れて着地
        { transform: `translate(${dx * 0.6}px,0) scale(1.05,0.95)`, offset: 0.76 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 押し潰す衝撃（横に広がる）
        spawnCustomParticle('◯', to.x, to.y + 14, {
            size: 62, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_CLAY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) scaleY(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3) scaleY(0.45)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2) scaleY(0.5)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y + 10, { size: 42, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.58);
}
registerCustomSkillMotion('body_press_nendoro', playBodyPressNendoroMotion, 'ネンドロ');

// --- 投げキッス：粘土の唇をぷるんと飛ばす（ピクシーのなげキッスとは別物として、ぷるぷるした質感で見せる） ---
function playNagekissNendoroMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // ぷくっと膨らんで、勢いよく送り出す
    animateSpriteLayers(side, [
        { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'scale(1.12,1.08) rotate(-5deg)', offset: 0.26 },
        { transform: 'scale(0.9,0.94) rotate(6deg)', offset: 0.44 },
        { transform: 'scale(1.03,1.02) rotate(0deg)', offset: 0.6 },
        { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 唇が伸び縮みしながら飛んでいく（粘土らしさ）
    for (let i = 0; i < 2; i++) {
        const wave = i === 0 ? -20 : 16;
        spawnCustomParticle('💋', from.x, from.y - 6, {
            size: 26, delay: duration * 0.42 + i * 140, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: '#e29ab5',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4,0.8)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.2,0.9)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.85,1.1)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(6deg)', offset: 0.3 },
            { transform: 'rotate(-5deg)', offset: 0.6 },
            { transform: 'rotate(0deg)', offset: 1 }
        ], { duration: 600 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 20, { emoji: '💗', size: 26, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#e29ab5' });
    }, duration * 0.68);
}
registerCustomSkillMotion('nagekiss_nendoro', playNagekissNendoroMotion, 'ネンドロ');

// --- ねんどがため：全身の粘土を固めて守りを上げる（自己強化） ---
function playNendoGatameMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const duration = 940 * EFFECT_SPEED_MULTIPLIER;

    // ぶるぶる震えたあと、きゅっと引き締まって硬くなる
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.1,0.9)', offset: 0.18 },
        { transform: 'scale(0.9,1.1)', offset: 0.32 },
        { transform: 'scale(1.06,0.94)', offset: 0.46 },
        { transform: 'scale(0.97,1.03)', offset: 0.6 },
        { transform: 'scale(1.02,1.02)', offset: 0.8 },  // 引き締まる
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 固まった証として、体の周りに硬質な光が走る
    spawnSelfParticleRing(casterEl, '✦', 5, 17, 700 * EFFECT_SPEED_MULTIPLIER, 34);
    const { x, y } = getElCenter(casterEl);
    for (let i = 0; i < 2; i++) {
        spawnCustomParticle('◯', x, y, {
            size: 58, delay: 260 + i * 200, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: NENDORO_CLAY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.85, offset: 0.55 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }
}
registerCustomSkillMotion('nendo_gatame', playNendoGatameMotion, 'ネンドロ');

// --- ようかい液：体から溶解液を吐きかける ---
function playYoukaiekiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 体を大きく波打たせてから吐き出す
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(0.9,1.14)', offset: 0.22 },  // 溜め込む
        { transform: 'scale(1.18,0.86)', offset: 0.4 },  // 吐き出す
        { transform: 'scale(0.98,1.02)', offset: 0.58 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 液体の飛沫が飛び散りながら相手にかかる
    for (let i = 0; i < 6; i++) {
        const spread = (i - 2.5) * 12;
        spawnCustomParticle('💧', from.x, from.y, {
            size: 20 + Math.random() * 8,
            delay: duration * 0.36 + i * 55,
            duration: 580 * EFFECT_SPEED_MULTIPLIER,
            color: '#a8d86a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + spread * 0.5 - 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy + spread}px) translate(-50%,-50%) scale(0.9)`, opacity: 0 }
            ]
        });
    }
    // 溶かされて悶える
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
            { transform: 'scale(0.96,1.04) rotate(-4deg)', offset: 0.3 },
            { transform: 'scale(1.03,0.97) rotate(4deg)', offset: 0.6 },
            { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y, { emoji: '🫧', size: 30, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: '#a8d86a' });
    }, duration * 0.66);
}
registerCustomSkillMotion('youkaieki', playYoukaiekiMotion, 'ネンドロ');
