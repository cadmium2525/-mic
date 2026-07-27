// =====================================================
// monster_motion_ark.js
// アーク専用のバトルモーション演出。
//
// アークの特徴（＝演出の軸）：
//   ・技名がすべて祝詞・詠唱   → どの技も「①詠唱（自分の周りに光が集まる）→
//                                ②顕現（何かが現れる）→ ③裁き（相手に降りる）」の
//                                三段構成にし、儀式めいた間を必ず取る
//   ・神聖な光の使い手         → 基調色は白金。闇や炎に寄せず、光の形（剣・環・鐘・荊）で描き分ける
//   ・技名が意味を持っている   → 「蒼き荊」は蒼、「聖夜の鐘」は鐘、「輪廻の環」は円環と、
//                                名前の情景をそのまま画に落とし込む
//
// 対応技（12種）：我が瞳の真理を見よ／世界を揺らせ／翔べ震律の刃よ／神光よ汚れを祓え／
//   今こそ真なる目醒め／蒼き荊よ咎を穿て／裁きの光よ下れ／終焉に救いを与えよ／
//   熾天の剣よ降り立て／聖夜の鐘よ鳴響け／祈れ輪廻の環よ／天の慈悲よ示されよ
// =====================================================

const ARK_HOLY = '#fff3c4';   // 神聖な白金
const ARK_AZURE = '#7fb0ff';  // 蒼（荊・真理）
const ARK_JUDGE = '#ffe066';  // 裁きの金

// --- アーク共通：詠唱（自分の周りに光の粒が集まってくる） ---
//   すべての技の導入に使い、「詠唱してから発動する」という統一した所作を作る。
function playArkChant(side, opts = {}) {
    const { duration = 560, color = ARK_HOLY, count = 6, radius = 62 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return null;
    const { x, y } = getElCenter(casterEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;

    // 静かに浮かび上がりながら詠唱する
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.04)', offset: 0.45 },
        { transform: 'translateY(-10px) scale(1.04)', offset: 0.75 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration: d * 1.6, easing: 'ease-in-out' });

    // 光の粒が外周から術者へ収束する
    for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count;
        spawnCustomParticle('✦', x + Math.cos(a) * radius, y + Math.sin(a) * radius * 0.7, {
            size: 20, delay: i * 55, duration: d, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * radius}px,${-Math.sin(a) * radius * 0.7}px) translate(-50%,-50%) scale(0.35)`, opacity: 0 }
            ]
        });
    }
    return { x, y, duration: d };
}

// --- アーク共通：裁きが相手に降りる（上から差す光の柱） ---
function spawnArkJudgementPillar(x, y, opts = {}) {
    const { color = ARK_JUDGE, width = 16, height = 150, duration = 460 } = opts;
    spawnBeamLine(x, y - height, 0, height, color, duration * EFFECT_SPEED_MULTIPLIER, width);
}

// --- 我が瞳の真理を見よ：瞳を見開き、真理の光で相手を射抜く ---
function playWagaHitomiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { color: ARK_AZURE, count: 4, duration: 500 });
    if (!chant) return;

    setTimeout(() => {
        // 瞳が開く
        spawnCustomParticle('◯', from.x, from.y - 6, {
            size: 44, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: ARK_AZURE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scaleX(1.4) scaleY(0.15)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scaleX(1.5) scaleY(1)', opacity: 1, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scaleX(1.6) scaleY(0.9)', opacity: 0 }
            ]
        });
        // 真理の光が一直線に射抜く
        spawnBeamLine(from.x, from.y - 6, to.x - from.x, to.y - (from.y - 6), ARK_AZURE, 520 * EFFECT_SPEED_MULTIPLIER, 11);
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: ARK_AZURE });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
        }, 200 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('waga_hitomi', playWagaHitomiMotion, 'アーク');

// --- 世界を揺らせ：足元から大地を震わせる ---
function playSekaiWoYuraseMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { duration: 540 });
    if (!chant) return;

    setTimeout(() => {
        // 地面を走る震動
        const groundY = Math.max(from.y, to.y) + 26;
        spawnBeamLine(from.x, groundY, to.x - from.x, 0, ARK_HOLY, 520 * EFFECT_SPEED_MULTIPLIER, 13);
        // 波紋が広がる
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', to.x, to.y + 16, {
                size: 60, delay: i * 130, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.35)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2) scaleY(0.4)', opacity: 0.9, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(2) scaleY(0.45)', opacity: 0 }
                ]
            });
        }
        // 相手が大きく揺さぶられる
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: 'translate(-6px,-8px) rotate(-6deg)', offset: 0.2 },
            { transform: 'translate(7px,4px) rotate(7deg)', offset: 0.42 },
            { transform: 'translate(-5px,-4px) rotate(-5deg)', offset: 0.64 },
            { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
        ], { duration: 760 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y + 12, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
    }, chant.duration);
}
registerCustomSkillMotion('sekai_wo_yurase', playSekaiWoYuraseMotion, 'アーク');

// --- 翔べ震律の刃よ：律動する光の刃が飛来する ---
function playTobeShinritsuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const dx = to.x - from.x, dy = to.y - from.y;
    const chant = playArkChant(side, { duration: 480, count: 4 });
    if (!chant) return;

    setTimeout(() => {
        // 3枚の刃が時間差で飛ぶ
        for (let i = 0; i < 3; i++) {
            const oy = (i - 1) * 20;
            spawnCustomParticle('✦', from.x, from.y + oy * 0.4, {
                size: 26, delay: i * 90, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: `translate(${dx * 0.5}px,${dy * 0.5 + oy * 0.5}px) translate(-50%,-50%) scale(1.15) rotate(180deg)`, opacity: 1, offset: 0.5 },
                    { transform: `translate(${dx}px,${dy + oy}px) translate(-50%,-50%) scale(0.9) rotate(360deg)`, opacity: 0 }
                ]
            });
            setTimeout(() => {
                spawnSlashArc(to.x, to.y + oy, i % 2 === 0 ? -32 : 32, { length: 110, width: 8, color: ARK_HOLY, duration: 260 * EFFECT_SPEED_MULTIPLIER });
                spawnImpactBurst(to.x, to.y + oy, { emoji: '✨', size: 24, duration: 280 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY });
            }, i * 90 + 420 * EFFECT_SPEED_MULTIPLIER);
        }
        setTimeout(() => playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 }), 640 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('tobe_shinritsu_no_yaiba', playTobeShinritsuMotion, 'アーク');

// --- 神光よ汚れを祓え：清めの光が相手を洗い流す ---
function playShinkouYoKegareMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { duration: 560 });
    if (!chant) return;

    setTimeout(() => {
        // 上から降り注ぐ清めの光
        spawnArkJudgementPillar(to.x, to.y, { color: ARK_HOLY, width: 22, height: 140, duration: 520 });
        for (let i = 0; i < 5; i++) {
            spawnCustomParticle('✨', to.x + (Math.random() - 0.5) * 50, to.y - 46, {
                size: 20, delay: i * 70, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(0,30px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(0,58px) translate(-50%,-50%) scale(0.6)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, chant.duration);
}
registerCustomSkillMotion('shinkou_yo_kegare_wo_harae', playShinkouYoKegareMotion, 'アーク');

// --- 今こそ真なる目醒め：自身が覚醒し、力を解放する（自己強化） ---
function playImaKosoShinNaruMezameMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;

    // 目醒め：静→動。ゆっくり力を溜め、一気に解き放つ
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-6px) scale(0.97)', offset: 0.28 },  // 内に収める
        { transform: 'translateY(-12px) scale(1.12)', offset: 0.52 }, // 解放
        { transform: 'translateY(-6px) scale(1.05)', offset: 0.72 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    playArkChant(side, { duration: 620, count: 8, radius: 70 });

    // 解放の瞬間、光の環が外へ広がる
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', x, y, {
                size: 70, delay: i * 140, duration: 680 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.95, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(2.1)', opacity: 0 }
                ]
            });
        }
        spawnSelfParticleRing(casterEl, '✨', 8, 20, 780 * EFFECT_SPEED_MULTIPLIER, 44);
    }, duration * 0.5);
}
registerCustomSkillMotion('ima_koso_shin_naru_mezame', playImaKosoShinNaruMezameMotion, 'アーク');

// --- 蒼き荊よ咎を穿て：蒼い茨が地から生えて相手を貫く ---
function playAokiIbaraMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { color: ARK_AZURE, duration: 560 });
    if (!chant) return;

    setTimeout(() => {
        // 足元から茨が次々と突き上がる
        for (let i = 0; i < 5; i++) {
            const ox = (i - 2) * 18;
            spawnCustomParticle('✦', to.x + ox, to.y + 24, {
                size: 24, delay: i * 70, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: ARK_AZURE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(22px) scaleY(0.3) scaleX(0.6)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-26px) scaleY(1.5) scaleX(1)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) translateY(-42px) scaleY(1.2) scaleX(0.8)', opacity: 0 }
                ]
            });
        }
        // 締め上げる茨の環
        for (let i = 0; i < 2; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 54, delay: 180 + i * 150, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: ARK_AZURE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.5) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(120deg)', opacity: 0.9, offset: 0.55 },
                    { transform: 'translate(-50%,-50%) scale(0.7) rotate(220deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: ARK_AZURE });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, chant.duration);
}
registerCustomSkillMotion('aoki_ibara_yo_toga_wo_ugate', playAokiIbaraMotion, 'アーク');

// --- 裁きの光よ下れ：天から一条の裁きが落ちる ---
function playSabakiNoHikariMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { color: ARK_JUDGE, duration: 600 });
    if (!chant) return;

    setTimeout(() => {
        // 落ちる前に、相手の真上に裁きの印が浮かぶ（予兆の間）
        spawnCustomParticle('◯', to.x, to.y - 74, {
            size: 46, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: ARK_JUDGE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) rotate(120deg)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.9) rotate(200deg)', opacity: 0.8 }
            ]
        });
        setTimeout(() => {
            spawnArkJudgementPillar(to.x, to.y, { color: ARK_JUDGE, width: 24, height: 150, duration: 480 });
            spawnImpactBurst(to.x, to.y, { size: 48, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: ARK_JUDGE });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, 420 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('sabaki_no_hikari_yo_kudare', playSabakiNoHikariMotion, 'アーク');

// --- 終焉に救いを与えよ：終わりを告げる大いなる光 ---
function playShuuenNiSukuiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { duration: 700, count: 8, radius: 68 });
    if (!chant) return;

    setTimeout(() => {
        // 一点に収束してから、全てを包む光へ変わる
        spawnCustomParticle('✦', to.x, to.y, {
            size: 34, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.15)', opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 88, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i) / 6;
                spawnCustomParticle('✨', to.x, to.y, {
                    size: 24, delay: i * 45, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 44}px,${Math.sin(a) * 34}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 76}px,${Math.sin(a) * 58}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 52, duration: 520 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 17, rotate: 13, duration: 600 });
        }, 420 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('shuuen_ni_sukui_wo_ataeyo', playShuuenNiSukuiMotion, 'アーク');

// --- 熾天の剣よ降り立て：天上から巨大な光の剣が突き刺さる ---
function playShitenNoTsurugiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { color: ARK_HOLY, duration: 680, count: 6 });
    if (!chant) return;

    setTimeout(() => {
        // 剣が天から降りてきて突き刺さる
        spawnCustomParticle('✦', to.x, to.y - 120, {
            size: 54, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY, easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scaleY(1.6) scaleX(0.5)', opacity: 0 },
                { transform: 'translate(0,70px) translate(-50%,-50%) scaleY(1.8) scaleX(0.6)', opacity: 1, offset: 0.5 },
                { transform: 'translate(0,120px) translate(-50%,-50%) scaleY(1.5) scaleX(0.7)', opacity: 1 }
            ]
        });
        setTimeout(() => {
            // 突き刺さった衝撃で光が十字に走る
            spawnSlashArc(to.x, to.y, 90, { length: 160, width: 16, color: '#ffffff', duration: 400 * EFFECT_SPEED_MULTIPLIER });
            setTimeout(() => spawnSlashArc(to.x, to.y, 0, { length: 130, width: 11, color: ARK_HOLY, duration: 360 * EFFECT_SPEED_MULTIPLIER }), 100);
            spawnImpactBurst(to.x, to.y, { size: 50, duration: 500 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY });
            playRecoilMotion(otherSide(side), { distance: 17, rotate: 12, duration: 600 });
        }, 400 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('shiten_no_tsurugi_yo_oritate', playShitenNoTsurugiMotion, 'アーク');

// --- 聖夜の鐘よ鳴響け：荘厳な鐘の音が波となって広がる ---
function playSeiyaNoKaneMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const dx = to.x - from.x;
    const chant = playArkChant(side, { duration: 560 });
    if (!chant) return;

    setTimeout(() => {
        // 鐘が現れて揺れる
        spawnCustomParticle('🔔', from.x, from.y - 24, {
            size: 40, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: ARK_JUDGE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15) rotate(-14deg)', opacity: 1, offset: 0.35 },
                { transform: 'translate(-50%,-50%) scale(1.15) rotate(14deg)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 0 }
            ]
        });
        // 鐘の音が輪になって押し寄せる
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('◯', from.x, from.y - 20, {
                size: 46 + i * 6, delay: i * 130, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: ARK_JUDGE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 0 },
                    { transform: `translate(${dx * 0.55}px,0) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.5 },
                    { transform: `translate(${dx}px,0) translate(-50%,-50%) scale(1.9)`, opacity: 0 }
                ]
            });
        }
        setTimeout(() => {
            // 音圧で震える
            animateSpriteLayers(otherSide(side), [
                { transform: 'translateX(0)', offset: 0 },
                { transform: 'translateX(4px)', offset: 0.2 },
                { transform: 'translateX(-4px)', offset: 0.4 },
                { transform: 'translateX(3px)', offset: 0.6 },
                { transform: 'translateX(0)', offset: 1 }
            ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'linear' });
            spawnImpactBurst(to.x, to.y, { size: 40, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: ARK_JUDGE });
        }, 560 * EFFECT_SPEED_MULTIPLIER);
    }, chant.duration);
}
registerCustomSkillMotion('seiya_no_kane_yo_narihibike', playSeiyaNoKaneMotion, 'アーク');

// --- 祈れ輪廻の環よ：巡る環が相手を包み込む ---
function playInoreRinneMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const chant = playArkChant(side, { duration: 620, count: 6 });
    if (!chant) return;

    setTimeout(() => {
        // 環が回りながら何重にも重なる（輪廻＝巡り続けるイメージ）
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 58, delay: i * 120, duration: 720 * EFFECT_SPEED_MULTIPLIER,
                color: i % 2 === 0 ? ARK_HOLY : ARK_AZURE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.6) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1) rotate(180deg)', opacity: 0.9, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) scale(0.5) rotate(360deg)', opacity: 0 }
                ]
            });
        }
        // 環に沿って光の粒が巡る
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6;
            spawnCustomParticle('✦', to.x, to.y, {
                size: 18, delay: 200 + i * 60, duration: 660 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 26}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 34}px,${Math.sin(a + 2.1) * 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                    { transform: `translate(${Math.cos(a + 4.2) * 34}px,${Math.sin(a + 4.2) * 26}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, chant.duration);
}
registerCustomSkillMotion('inore_rinne_no_wa_yo', playInoreRinneMotion, 'アーク');

// --- 天の慈悲よ示されよ：天から慈悲の光が降り、自らを癒す ---
function playTenNoJihiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const chant = playArkChant(side, { duration: 620, count: 6 });
    if (!chant) return;

    setTimeout(() => {
        // 頭上から柔らかな光が差し込む
        spawnArkJudgementPillar(x, y, { color: ARK_HOLY, width: 26, height: 130, duration: 620 });
        // 降り注ぐ光の粒
        for (let i = 0; i < 6; i++) {
            spawnCustomParticle('✨', x + (Math.random() - 0.5) * 54, y - 52, {
                size: 20, delay: i * 80, duration: 660 * EFFECT_SPEED_MULTIPLIER, color: ARK_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(0,32px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(0,60px) translate(-50%,-50%) scale(0.6)', opacity: 0 }
                ]
            });
        }
        // 癒しの緑がまとわりつく
        spawnSelfParticleRing(casterEl, '💚', 6, 18, 760 * EFFECT_SPEED_MULTIPLIER, 38);
    }, chant.duration);
}
registerCustomSkillMotion('ten_no_jihi_yo_shimesareyo', playTenNoJihiMotion, 'アーク');
