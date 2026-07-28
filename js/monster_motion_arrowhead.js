// =====================================================
// monster_motion_arrowhead.js
// アローヘッド専用のバトルモーション演出。
//
// アローヘッドの特徴（＝演出の軸）：
//   ・鋭い尾           → テイル系は「体をしならせて尾を鞭のように振る」動きで見せる
//   ・全身の針         → ニードルターンは回転しながら針を突き出す
//   ・射出できる腕     → ズームパンチ／ロケットパンチは腕が伸びる・飛ぶで差別化する
//   ・「W」の付く技    → 単発版の見た目を2回に増やし、2連装だと分かるようにする
//
// 対応技：テイルアタック／ズームパンチ／ロケットパンチ／ニードルターン／
//         Wニードルターン／竜巻アタック／テイルブレード／地雷針
// =====================================================

const ARROWHEAD_SHELL = '#a8c4d8'; // 甲殻の色
const ARROWHEAD_NEEDLE = '#e0f0ff'; // 針の光

// --- 体をしならせて尾を振る共通の動き ---
function playArrowheadTailSwing(side, opts = {}) {
    const { duration = 700, reach = 0.5, high = false } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return null;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * reach;

    // 反対側へしなってから、勢いよく振り抜く
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: `translateX(${-travel * 0.16}px) rotate(-14deg) scale(0.97,1.03)`, offset: 0.26 }, // しなる
        { transform: `translateX(${travel}px) rotate(${high ? 20 : 14}deg) scale(1.04,0.97)`, offset: 0.5 }, // 振り抜く
        { transform: `translateX(${travel * 0.6}px) rotate(4deg) scale(1,1)`, offset: 0.7 },
        { transform: 'translateX(0) rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration: d, easing: 'ease-in-out' });

    return { duration: d, impactAt: d * 0.48, from, to };
}

// --- テイルアタック：尾を鞭のように叩きつける ---
function playTailAttackMotion(side) {
    const r = playArrowheadTailSwing(side, { duration: 700, reach: 0.5 });
    if (!r) return;
    setTimeout(() => {
        spawnSlashArc(r.to.x, r.to.y + 10, 14, { length: 108, width: 9, color: ARROWHEAD_SHELL, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(r.to.x, r.to.y + 6, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, r.impactAt);
}
registerCustomSkillMotion('tail_attack', playTailAttackMotion, 'アローヘッド');

// --- テイルブレード：尾の刃を立てて斬り抜く（テイルアタックの「打つ」に対し、こちらは「斬る」） ---
function playTailBladeMotion(side) {
    const r = playArrowheadTailSwing(side, { duration: 800, reach: 0.6, high: true });
    if (!r) return;
    setTimeout(() => {
        // 鋭い刃なので、細く長い軌跡を2本重ねて切れ味を出す
        spawnSlashArc(r.to.x, r.to.y, -22, { length: 132, width: 7, color: ARROWHEAD_NEEDLE, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        setTimeout(() => spawnSlashArc(r.to.x, r.to.y + 8, -14, { length: 112, width: 5, color: ARROWHEAD_NEEDLE, duration: 260 * EFFECT_SPEED_MULTIPLIER }), 80);
        spawnImpactBurst(r.to.x, r.to.y, { size: 38, duration: 360 * EFFECT_SPEED_MULTIPLIER, color: ARROWHEAD_NEEDLE });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, r.impactAt);
}
registerCustomSkillMotion('tail_blade', playTailBladeMotion, 'アローヘッド');

// --- ズームパンチ：腕を伸ばして遠くから殴る（本体はほぼ動かない） ---
function playZoomPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 780 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;
    const armMs = 500 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: `translateX(${-Math.sign(dx) * 5}px) scale(0.97,1.02)`, offset: 0.24 },
        { transform: `translateX(${Math.sign(dx) * 6}px) scale(1.04,0.98)`, offset: 0.42 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 伸びる腕（帯）と拳を同じカーブで動かして、先端がズレないようにする
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const arm = document.createElement('div');
        arm.style.cssText = `position:fixed; left:${from.x}px; top:${from.y}px; width:${length}px; height:13px;
            margin-top:-6.5px; transform-origin:0% 50%; pointer-events:none; z-index:9998; border-radius:7px;
            background:linear-gradient(90deg, ${ARROWHEAD_SHELL}, #d4e4f0);`;
        document.body.appendChild(arm);
        try {
            const a = arm.animate([
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.45 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.6 },
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1 }
            ], { duration: armMs, easing: 'ease-in-out', fill: 'forwards' });
            a.onfinish = () => arm.remove();
            setTimeout(() => arm.remove(), armMs + 200);
        } catch (e) { arm.remove(); }

        spawnCustomParticle('✊', from.x, from.y, {
            size: 28, duration: armMs, easing: 'ease-in-out',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 34 });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
        }, armMs * 0.45);
    }, duration * 0.3);
}
registerCustomSkillMotion('zoom_punch', playZoomPunchMotion, 'アローヘッド');

// --- ロケットパンチ：腕を切り離して撃ち出す（ズームパンチが「伸ばす」なら、こちらは「飛ばす」） ---
function playRocketPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 860 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;
    const flightMs = 560 * EFFECT_SPEED_MULTIPLIER;

    // 撃ち出しの反動で後ろへ下がる
    animateSpriteLayers(side, [
        { transform: 'translateX(0)', offset: 0 },
        { transform: `translateX(${-Math.sign(dx) * 12}px)`, offset: 0.34 },
        { transform: 'translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        // 拳が噴射の煙を引きながら飛び、当たってから戻ってくる
        spawnCustomParticle('✊', from.x, from.y, {
            size: 30, duration: flightMs, color: ARROWHEAD_SHELL, easing: 'ease-in-out',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15) rotate(20deg)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15) rotate(20deg)`, opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 }
            ]
        });
        for (let i = 0; i < 3; i++) {
            const t = (i + 1) / 5;
            spawnCustomParticle('💨', from.x + dx * t * 0.7, from.y + dy * t * 0.7, {
                size: 18, delay: i * 55, duration: 380 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.75, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }
                ]
            });
        }
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 38, duration: 360 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
        }, flightMs * 0.45);
    }, duration * 0.34);
}
registerCustomSkillMotion('rocket_punch', playRocketPunchMotion, 'アローヘッド');

// --- ニードルターン：回転しながら全身の針を突き出す ---
//   Wニードルターンは同じ形で回転と着弾を2セットにする
function playNeedleTurnMotion(side, opts = {}) {
    const { turns = 1 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = (turns === 1 ? 800 : 1080) * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.66;

    // 回転数もセット数に応じて増やす
    const kf = [{ transform: 'translateX(0) rotate(0deg)', offset: 0 }];
    for (let i = 0; i < turns; i++) {
        const base = 0.2 + (i / turns) * 0.6;
        kf.push({ transform: `translateX(${travel}px) rotate(${(i + 1) * 720}deg)`, offset: base });
        if (i < turns - 1) kf.push({ transform: `translateX(${travel * 0.7}px) rotate(${(i + 1) * 720}deg)`, offset: base + 0.08 });
    }
    kf.push({ transform: `translateX(0) rotate(${turns * 720}deg)`, offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < turns; i++) {
        const at = 0.2 + (i / turns) * 0.6;
        setTimeout(() => {
            // 回転する針を放射状に見せる
            for (let k = 0; k < 4; k++) {
                const a = (Math.PI * 2 * k) / 4 + i * 0.5;
                spawnCustomParticle('✦', to.x, to.y, {
                    size: 18, delay: k * 30, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: ARROWHEAD_NEEDLE,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 30}px,${Math.sin(a) * 24}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 48}px,${Math.sin(a) * 38}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: turns > 1 && i === turns - 1 ? 42 : 32, duration: 340 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === turns - 1 ? 13 : 9, rotate: i === turns - 1 ? 9 : 6, duration: 360 });
        }, duration * at);
    }
}
registerCustomSkillMotion('needle_turn', (side) => playNeedleTurnMotion(side, { turns: 1 }), 'アローヘッド');
registerCustomSkillMotion('w_needle_turn', (side) => playNeedleTurnMotion(side, { turns: 2 }), 'アローヘッド');

// --- 竜巻アタック：高速回転で竜巻を起こし、相手を巻き上げる ---
function playTornadoAttackMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1120 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;

    // 加速しながら回転して突っ込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) rotate(200deg) scale(0.94,1.06)', offset: 0.24 },
        { transform: `translateX(${travel * 0.4}px) rotate(680deg) scale(0.9,1.1)`, offset: 0.46 },
        { transform: `translateX(${travel}px) rotate(1260deg) scale(0.92,1.08)`, offset: 0.68 },
        { transform: `translateX(${travel * 0.5}px) rotate(1440deg) scale(1,1)`, offset: 0.85 },
        { transform: 'translateX(0) rotate(1440deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 竜巻：渦が縦に伸びて立ち上がる
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('🌀', to.x, to.y + 16 - i * 16, {
                size: 26 + i * 4, delay: i * 70, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: '#bcd8ea',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2) rotate(300deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-20px) translate(-50%,-50%) scale(0.9) rotate(560deg)', opacity: 0 }
                ]
            });
        }
        // 相手が巻き上げられて回る
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateY(0) rotate(0deg)', offset: 0 },
            { transform: 'translateY(-22px) rotate(-180deg)', offset: 0.4 },
            { transform: 'translateY(-14px) rotate(-320deg)', offset: 0.65 },
            { transform: 'translateY(4px) rotate(-360deg)', offset: 0.88 },
            { transform: 'translateY(0) rotate(-360deg)', offset: 1 }
        ], { duration: 760 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.6);
}
registerCustomSkillMotion('tornado_attack', playTornadoAttackMotion, 'アローヘッド');

// --- 地雷針：針を飛ばして突き刺しつつ、残りを足元に仕掛ける ---
//   ※純粋な設置技ではなく、force1.2の攻撃技（命中時に継続ダメージの罠も残る）。
//     撒くだけだと効果と食い違うため、まず数本が相手に刺さる部分を見せる。
function playJiraibariMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 780 * EFFECT_SPEED_MULTIPLIER;

    // 体を震わせて針を飛ばす
    animateSpriteLayers(side, [
        { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'scale(0.95,1.06) rotate(-4deg)', offset: 0.22 },
        { transform: 'scale(1.1,0.92) rotate(5deg)', offset: 0.4 },  // 撒く
        { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        // ① まず数本が相手に突き刺さる
        for (let i = 0; i < 3; i++) {
            const oy = (i - 1) * 16;
            spawnSlashArc(to.x, to.y + oy, 0, { length: 70, width: 5, color: ARROWHEAD_NEEDLE, duration: 220 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { emoji: '✦', size: 20, duration: 240 * EFFECT_SPEED_MULTIPLIER, color: ARROWHEAD_NEEDLE });
        }
        playRecoilMotion(otherSide(side), { distance: 9, rotate: 6, duration: 400 });
        // ② 残りが足元に散らばって罠として残る
        setTimeout(() => {
            spawnScatterOnField(to.x, to.y + 24, '✦', 6, {
                size: 15, duration: 680 * EFFECT_SPEED_MULTIPLIER, spread: 72, color: ARROWHEAD_NEEDLE
            });
        }, 220 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.4);
}
registerCustomSkillMotion('jiraibari', playJiraibariMotion, 'アローヘッド');
