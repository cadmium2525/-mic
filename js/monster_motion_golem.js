// =====================================================
// monster_motion_golem.js
// ゴーレム専用のバトルモーション演出。
//
// ゴーレムの特徴（＝演出の軸）：
//   ・巨体と圧倒的な腕力 → 攻撃は「ゆっくり大きく振りかぶって、重く当たる」テンポにする
//   ・岩の体             → 当たった時は岩の破片が飛び散る
//   ・小技も威力が高い   → でこぴんのような小さな動作でも、衝撃だけは特大にして落差を出す
//   ・地面を揺らす       → 地震は画面全体が揺れるような大技として別格に扱う
//
// 対応技：でこぴん／掌打／クロー投げ／ダブルチョップ／ぐるぐるアタック／
//         のびーるパンチ／地震／ゴビステップ
// =====================================================

const GOLEM_ROCK = '#c2b49a'; // 岩の色

// --- 岩の破片が飛び散る（ゴーレムの打撃で共通して使う） ---
function spawnGolemDebris(x, y, count = 4, opts = {}) {
    const { size = 15, spread = 46 } = opts;
    for (let i = 0; i < count; i++) {
        const a = -Math.PI + (Math.PI * i) / Math.max(1, count - 1);
        spawnCustomParticle('🪨', x, y, {
            size, delay: i * 35, duration: 440 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0 },
                { transform: `translate(${Math.cos(a) * spread * 0.6}px,${Math.sin(a) * spread * 0.5}px) translate(-50%,-50%) scale(1) rotate(180deg)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${Math.cos(a) * spread}px,${Math.abs(Math.sin(a)) * 10}px) translate(-50%,-50%) scale(0.7) rotate(320deg)`, opacity: 0 }
            ]
        });
    }
}

// --- でこぴん：ごく小さな指の動作から、不釣り合いに大きな衝撃が生まれる ---
function playDekopinMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 800 * EFFECT_SPEED_MULTIPLIER;

    // 動作自体はごく小さい（ためて、ぴんっと弾くだけ）
    animateSpriteLayers(side, [
        { transform: 'scale(1) rotate(0deg)', offset: 0 },
        { transform: 'scale(0.98) rotate(-3deg)', offset: 0.34 }, // 指をためる
        { transform: 'scale(1.02) rotate(2deg)', offset: 0.46 },  // 弾く
        { transform: 'scale(1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 一方で衝撃は特大（小さな動作との落差でパワーを表現する）
    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y, {
            size: 60, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.9, offset: 0.35 },
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 44, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        spawnGolemDebris(to.x, to.y, 4);
        playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 520 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.46);
}
registerCustomSkillMotion('dekopin', playDekopinMotion, 'ゴーレム');

// --- 掌打：巨大な手のひらで正面から打ち抜く ---
function playShodaMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.5, duration: 760, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        // 手のひらの面で押し込む感じを、横に広い衝撃で表現する
        spawnCustomParticle('◯', to.x, to.y, {
            size: 54, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: GOLEM_ROCK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) scaleX(0.7)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) scaleX(1.3)', opacity: 0.85, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.6) scaleX(1.7)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        spawnGolemDebris(to.x, to.y, 3);
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, impactAt);
}
registerCustomSkillMotion('shoda', playShodaMotion, 'ゴーレム');

// --- クロー投げ：腕の爪を掴んで相手へ投げつける（飛び道具） ---
function playClawNageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 大きく振りかぶって投げる
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) translateX(0)', offset: 0 },
        { transform: 'rotate(-18deg) translateX(-6px)', offset: 0.3 },  // 振りかぶる
        { transform: 'rotate(16deg) translateX(8px)', offset: 0.48 },   // 投げる
        { transform: 'rotate(0deg) translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 爪が回転しながら飛んでいく
    setTimeout(() => {
        spawnCustomParticle('🪨', from.x, from.y, {
            size: 28, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: GOLEM_ROCK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 16}px) translate(-50%,-50%) scale(1.1) rotate(360deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1) rotate(720deg)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 34, duration: 360 * EFFECT_SPEED_MULTIPLIER });
            spawnGolemDebris(to.x, to.y, 4);
            playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
        }, 460 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.46);
}
registerCustomSkillMotion('claw_nage', playClawNageMotion, 'ゴーレム');

// --- ダブルチョップ：両腕を振り下ろし、続けて2回叩き割る ---
function playDoubleChopMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,-8px) rotate(-14deg)', offset: 0.16 },              // 振りかぶる
        { transform: `translate(${travel}px,4px) rotate(12deg)`, offset: 0.32 },      // 1回目
        { transform: `translate(${travel * 0.7}px,-8px) rotate(-14deg)`, offset: 0.5 }, // 再度振りかぶる
        { transform: `translate(${travel}px,6px) rotate(16deg)`, offset: 0.68 },      // 2回目（深く）
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.32, 34, 90], [0.68, 44, 112]].forEach(([at, size, arcLen], i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, 88, { length: arcLen, width: 12, color: GOLEM_ROCK, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { size, duration: 360 * EFFECT_SPEED_MULTIPLIER });
            spawnGolemDebris(to.x, to.y, i === 1 ? 5 : 3);
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 15 : 9, rotate: i === 1 ? 11 : 6 });
        }, duration * at);
    });
}
registerCustomSkillMotion('double_chop', playDoubleChopMotion, 'ゴーレム');

// --- ぐるぐるアタック：巨体を独楽のように回して突っ込む ---
function playGuruguruAttackMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // 徐々に回転を上げてから突っ込む（巨体なので加速に時間がかかる印象にする）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: 'translateX(0) rotate(160deg)', offset: 0.22 },
        { transform: `translateX(${travel * 0.3}px) rotate(500deg)`, offset: 0.44 },
        { transform: `translateX(${travel}px) rotate(1000deg)`, offset: 0.68 },
        { transform: `translateX(${travel * 0.5}px) rotate(1080deg)`, offset: 0.84 },
        { transform: 'translateX(0) rotate(1080deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 回転で巻き上がる砂ぼこり
    for (let i = 0; i < 4; i++) {
        spawnCustomParticle('💨', from.x + (to.x - from.x) * (i / 5), from.y + 16, {
            size: 22, delay: duration * 0.3 + i * 60, duration: 440 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.8, offset: 0.4 },
                { transform: 'translate(0,-16px) translate(-50%,-50%) scale(1.6)', opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('🌀', to.x, to.y, {
                size: 32, delay: i * 60, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: GOLEM_ROCK,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3) rotate(300deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(540deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        spawnGolemDebris(to.x, to.y, 5);
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 11 });
    }, duration * 0.66);
}
registerCustomSkillMotion('guruguru_attack', playGuruguruAttackMotion, 'ゴーレム');

// --- のびーるパンチ：腕が伸びて、離れた位置から殴りつける ---
function playNobiruPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 860 * EFFECT_SPEED_MULTIPLIER;

    // 本体はほとんど動かない（腕だけが伸びる技なので、その場で構えるだけにする）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(-5px) scale(0.97,1.02)', offset: 0.22 }, // 引く
        { transform: 'translateX(6px) scale(1.04,0.98)', offset: 0.42 },  // 打ち出す
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 伸びる腕：根元から相手まで帯を伸ばし、先端に拳を置く
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    setTimeout(() => {
        const arm = document.createElement('div');
        arm.style.cssText = `position:fixed; left:${from.x}px; top:${from.y}px; width:${length}px; height:16px;
            margin-top:-8px; transform-origin:0% 50%; pointer-events:none; z-index:9998; border-radius:8px;
            background:linear-gradient(90deg, ${GOLEM_ROCK}, #d8ccb4);
            box-shadow:0 0 6px 2px rgba(0,0,0,0.35);`;
        document.body.appendChild(arm);
        const armDuration = 460 * EFFECT_SPEED_MULTIPLIER;
        try {
            const anim = arm.animate([
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.45 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.62 },
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 }
            ], { duration: armDuration, easing: 'ease-in-out', fill: 'forwards' });
            anim.onfinish = () => arm.remove();
            setTimeout(() => arm.remove(), armDuration + 200);
        } catch (e) { arm.remove(); }

        // 拳（腕の先端）。腕とまったく同じカーブで動かして、先端がズレないようにする
        spawnCustomParticle('✊', from.x, from.y, {
            size: 30, duration: armDuration, easing: 'ease-in-out',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.62 },
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 }
            ]
        });

        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 36, duration: 360 * EFFECT_SPEED_MULTIPLIER });
            spawnGolemDebris(to.x, to.y, 3);
            playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
        }, armDuration * 0.45);
    }, duration * 0.36);
}
registerCustomSkillMotion('nobiru_punch', playNobiruPunchMotion, 'ゴーレム');

// --- 地震：両腕を大地に叩きつけ、戦場全体を揺らす（ゴーレム最大の大技として別格に見せる） ---
function playJishinMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1350 * EFFECT_SPEED_MULTIPLIER;

    // 高く腕を掲げてから、渾身の力で大地へ叩きつける
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-14px) scale(1.02,1.06)', offset: 0.26 }, // 掲げる
        { transform: 'translateY(-14px) scale(1.02,1.06)', offset: 0.36 },
        { transform: 'translateY(8px) scale(1.08,0.9)', offset: 0.48 },    // 叩きつける
        { transform: 'translateY(0) scale(1,1)', offset: 0.62 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 地面を走る衝撃波（自分の足元から相手の足元へ）
        const groundY = Math.max(from.y, to.y) + 26;
        spawnBeamLine(from.x, groundY, to.x - from.x, 0, GOLEM_ROCK, 520 * EFFECT_SPEED_MULTIPLIER, 14);

        // 双方の足元から岩が突き上がる
        [from.x, (from.x + to.x) / 2, to.x].forEach((px, i) => {
            spawnCustomParticle('🪨', px, groundY, {
                size: 26, delay: i * 90, duration: 520 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(20px) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-22px) scale(1.2) rotate(140deg)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) translateY(2px) scale(0.9) rotate(240deg)', opacity: 0 }
                ]
            });
        });

        // 相手は足元をすくわれて大きく揺さぶられる
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: 'translate(-6px,-10px) rotate(-6deg)', offset: 0.2 },
            { transform: 'translate(7px,4px) rotate(7deg)', offset: 0.42 },
            { transform: 'translate(-5px,-6px) rotate(-5deg)', offset: 0.62 },
            { transform: 'translate(4px,2px) rotate(3deg)', offset: 0.8 },
            { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
        ], { duration: 820 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });

        spawnImpactBurst(to.x, to.y + 16, { size: 48, duration: 480 * EFFECT_SPEED_MULTIPLIER });
        spawnGolemDebris(to.x, to.y + 14, 6, { spread: 70 });
    }, duration * 0.46);
}
registerCustomSkillMotion('jishin', playJishinMotion, 'ゴーレム');

// --- ゴビステップ：重い足取りで踏み固め、自身の構えを整える（自己強化） ---
function playGobiStepMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 980 * EFFECT_SPEED_MULTIPLIER;

    // 左右に重心を移しながら、どっしりと踏み込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(-7px) scale(1.03,0.97)', offset: 0.22 },
        { transform: 'translateX(7px) scale(1.03,0.97)', offset: 0.48 },
        { transform: 'translateX(-4px) scale(1.02,0.98)', offset: 0.7 },
        { transform: 'translateX(0) scale(1.04,1.02)', offset: 0.88 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 踏み込むたびに足元から土埃が上がる
    [0.22, 0.48, 0.7].forEach((at, i) => {
        setTimeout(() => {
            spawnCustomParticle('💨', x + (i % 2 === 0 ? -14 : 14), y + 22, {
                size: 22, duration: 420 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.85, offset: 0.4 },
                    { transform: 'translate(0,-14px) translate(-50%,-50%) scale(1.6)', opacity: 0 }
                ]
            });
        }, duration * at);
    });
    // 構えが整い、力がみなぎる
    spawnSelfParticleRing(casterEl, '✦', 5, 17, 700 * EFFECT_SPEED_MULTIPLIER, 36);
}
registerCustomSkillMotion('gobi_step', playGobiStepMotion, 'ゴーレム');
