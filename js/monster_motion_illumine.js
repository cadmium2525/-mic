// =====================================================
// monster_motion_illumine.js
// イルミネ専用のバトルモーション演出。
//
// イルミネの特徴（＝演出の軸）：
//   ・技名が多彩な武装名     → 「その場で光の武器を生成して振るう」という一貫した所作にする。
//                              どの武器技も「①光が集まって武器の形になる → ②振るう」の二段構成
//   ・光を操る               → 基調はシアン。ただし技の性格で色を変えて描き分ける
//                              （毒＝紫緑／暗殺＝影紫／紅蓮＝深紅／鎮魂＝青白）
//   ・上位技ほど大仰         → アルスマグナ・レクイエムエンド・クリムゾンノヴァは
//                              ためを長く取り、規模を明確に大きくする
//
// 対応技（14種）：プラズマ／シールドバッシュ／ストレート／ヴェノムエッジ／アサシンクロウ／
//   モーニングスター／アルカナフレア／アサルトアロー／バスターソード／アルスマグナ／
//   ブレードダンス／レクイエムエンド／ミラージュクロウ／クリムゾンノヴァ
// =====================================================

const ILLUMINE_LIGHT = '#7fe8ff';   // 基調のシアン
const ILLUMINE_CRIMSON = '#ff4d6a'; // 紅蓮（クリムゾン系）
const ILLUMINE_REQUIEM = '#b9c8ff'; // 鎮魂の青白
const ILLUMINE_VENOM = '#9ee04a';   // 毒の黄緑
const ILLUMINE_SHADOW = '#9b6fd6';  // 暗殺の影紫

// --- イルミネ共通：手元に光が集まり、武器の形を成す ---
//   すべての武器技の頭に置くことで「武器を生成してから使う」という統一感を出す。
function spawnIllumineForge(side, opts = {}) {
    const { color = ILLUMINE_LIGHT, duration = 380, count = 4, radius = 32 } = opts;
    const el = getBattleSpriteContainerEl(side);
    if (!el) return;
    const { x, y } = getElCenter(el);
    for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count;
        spawnCustomParticle('✦', x + Math.cos(a) * radius, y + Math.sin(a) * radius * 0.75, {
            size: 18, delay: i * 45, duration: duration * EFFECT_SPEED_MULTIPLIER, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * radius}px,${-Math.sin(a) * radius * 0.75}px) translate(-50%,-50%) scale(0.35)`, opacity: 0 }
            ]
        });
    }
}

// --- プラズマ：帯電した光球を撃ち出す ---
function playPlasmaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    spawnIllumineForge(side, { color: ILLUMINE_LIGHT });
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: 'translateX(-5px) scale(0.97)', offset: 0.26 },
        { transform: 'translateX(6px) scale(1.04)', offset: 0.44 },
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnCustomParticle('⬤', from.x, from.y, {
            size: 28, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT, easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.2)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            // 着弾で電流が飛び散る
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 * i) / 4;
                spawnCustomParticle('⚡', to.x, to.y, {
                    size: 20, delay: i * 40, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                        { transform: `translate(${Math.cos(a) * 54}px,${Math.sin(a) * 42}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
        }, 460 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('plasma', playPlasmaMotion, 'イルミネ');

// --- シールドバッシュ：光の盾を構えて体当たりする ---
function playShieldBashMotion(side) {
    spawnIllumineForge(side, { color: ILLUMINE_LIGHT, count: 3 });
    const { impactAt, to } = playLungeMotion(side, { reach: 0.62, duration: 700, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        // 盾の面で押し込むので、横に広い衝撃にする
        spawnCustomParticle('◼', to.x, to.y, {
            size: 48, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT,
            keyframes: [
                { transform: 'translate(-50%,-50%) scaleX(0.6) scaleY(1.1)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scaleX(1.3) scaleY(1.3)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scaleX(1.8) scaleY(1.5)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 9 });
    }, impactAt);
}
registerCustomSkillMotion('shield_bash', playShieldBashMotion, 'イルミネ');

// --- ストレート：飾りのない、真っ直ぐな一撃（イルミネの中で最も素朴な技） ---
function playStraightPunchMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.66, duration: 560 });
    if (!to) return;
    setTimeout(() => {
        spawnCustomParticle('✊', to.x, to.y, {
            size: 30, duration: 320 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('straight_punch', playStraightPunchMotion, 'イルミネ');

// --- ヴェノムエッジ：毒を纏った刃で斬りつける ---
function playVenomEdgeMotion(side) {
    spawnIllumineForge(side, { color: ILLUMINE_VENOM });
    const { impactAt, to } = playLungeMotion(side, { reach: 0.64, duration: 680 });
    if (!to) return;
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -28, { length: 112, width: 9, color: ILLUMINE_VENOM, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        // 傷口から毒が滴る
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('💧', to.x + (i - 1) * 14, to.y, {
                size: 18, delay: 120 + i * 70, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_VENOM,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(0,20px) translate(-50%,-50%) scale(0.8)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_VENOM });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('venom_edge', playVenomEdgeMotion, 'イルミネ');

// --- アサシンクロウ：背後に回り込み、影の爪で急所を裂く ---
function playAssassinClawMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;
    const behind = (to.x - from.x) * 1.2; // 相手を通り越して背後へ

    // 消える → 背後に出現 → 斬る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(1)', opacity: 0.1, offset: 0.24 },
        { transform: `translateX(${behind}px) scale(1.04)`, opacity: 0.1, offset: 0.4 },
        { transform: `translateX(${behind}px) scale(1.06)`, opacity: 1, offset: 0.5 },
        { transform: `translateX(${behind}px) scale(1.06)`, opacity: 1, offset: 0.64 },
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 3本の爪痕（背後からなので逆向きの角度にする）
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                spawnSlashArc(to.x + (i - 1) * 8, to.y + (i - 1) * 14, 34, {
                    length: 104, width: 7, color: ILLUMINE_SHADOW, duration: 260 * EFFECT_SPEED_MULTIPLIER
                });
            }, i * 45);
        }
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_SHADOW });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: -9 });
    }, duration * 0.52);
}
registerCustomSkillMotion('assassin_claw', playAssassinClawMotion, 'イルミネ');

// --- ミラージュクロウ：分身しながら複数方向から爪で切り裂く ---
function playMirageClawMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;
    const hits = 3;

    // 消えて現れてを繰り返し、毎回違う高さから斬る
    const kf = [{ transform: 'translate(0,0)', opacity: 1, offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.18 + (i / hits) * 0.62;
        const oy = [-24, 18, -6][i];
        kf.push({ transform: `translate(${travel * 0.5}px,${oy}px)`, opacity: 0.12, offset: base - 0.06 });
        kf.push({ transform: `translate(${travel}px,${oy}px)`, opacity: 1, offset: base });
    }
    kf.push({ transform: 'translate(0,0)', opacity: 1, offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = [-20, 16, -4][i];
            // 残像
            spawnCustomParticle('◤', to.x, to.y + oy, {
                size: 30, duration: 300 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_SHADOW,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.5 },
                    { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
                ]
            });
            spawnSlashArc(to.x, to.y + oy, i % 2 === 0 ? -38 : 38, { length: 100, width: 7, color: ILLUMINE_LIGHT, duration: 250 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { size: i === hits - 1 ? 36 : 26, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === hits - 1 ? 12 : 7, rotate: i === hits - 1 ? 9 : 5, duration: 320 });
        }, duration * (0.18 + (i / hits) * 0.62));
    }
}
registerCustomSkillMotion('mirage_claw', playMirageClawMotion, 'イルミネ');

// --- モーニングスター：鎖付きの鉄球を大きく振り回して叩きつける ---
function playMorningStarMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    spawnIllumineForge(side, { color: ILLUMINE_LIGHT, count: 3 });
    // 頭上で振り回してから、振り下ろす
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-10deg) scale(1.04)', offset: 0.3 },
        { transform: 'rotate(-14deg) scale(1.05)', offset: 0.46 },
        { transform: 'rotate(18deg) scale(1.02)', offset: 0.62 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 鉄球が円を描いて回ってから飛ぶ
    for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
        spawnCustomParticle('⬤', from.x + Math.cos(a) * 34, from.y + Math.sin(a) * 28 - 16, {
            size: 22, delay: 120 + i * 90, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: '#8f9aa8',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnCustomParticle('⬤', from.x, from.y - 20, {
            size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: '#8f9aa8', easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0 },
                { transform: `translate(${dx * 0.6}px,${dy * 0.6 - 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.2)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 440 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 560 });
        }, 340 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.5);
}
registerCustomSkillMotion('morning_star', playMorningStarMotion, 'イルミネ');

// --- アルカナフレア：魔法陣が展開し、そこから炎の光が噴き上がる ---
function playArcanaFlareMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;

    spawnIllumineForge(side, { color: '#ffb347', count: 5, duration: 500 });
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.05)', offset: 0.34 },
        { transform: 'translateY(-8px) scale(1.05)', offset: 0.52 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 足元に魔法陣が回りながら開く
        for (let i = 0; i < 2; i++) {
            spawnCustomParticle('◯', to.x, to.y + 16, {
                size: 60, delay: i * 130, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#ffb347',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.35) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2) scaleY(0.4) rotate(140deg)', opacity: 0.95, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) scale(1.5) scaleY(0.45) rotate(260deg)', opacity: 0 }
                ]
            });
        }
        // 陣から炎が噴き上がる
        setTimeout(() => {
            for (let i = 0; i < 5; i++) {
                spawnCustomParticle('🔥', to.x + (i - 2) * 16, to.y + 14, {
                    size: 24 + Math.random() * 8, delay: i * 50, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ff8a3c',
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: 'translate(0,-34px) translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.45 },
                        { transform: 'translate(0,-64px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 44, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
        }, 400 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('arcana_flare', playArcanaFlareMotion, 'イルミネ');

// --- アサルトアロー：光の矢を連射する ---
function playAssaultArrowMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;
    const arrows = 4;

    spawnIllumineForge(side, { color: ILLUMINE_LIGHT, count: 3 });
    // 弓を引いて放つ動作を矢の数だけ繰り返す
    const kf = [{ transform: 'translateX(0)', offset: 0 }];
    for (let i = 0; i < arrows; i++) {
        const base = 0.2 + (i / arrows) * 0.66;
        kf.push({ transform: 'translateX(-5px)', offset: base - 0.04 });
        kf.push({ transform: 'translateX(4px)', offset: base });
    }
    kf.push({ transform: 'translateX(0)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    for (let i = 0; i < arrows; i++) {
        const oy = (i - (arrows - 1) / 2) * 16;
        const at = duration * (0.2 + (i / arrows) * 0.66);
        setTimeout(() => {
            spawnBeamLine(from.x, from.y + oy * 0.4, dx, dy + oy, ILLUMINE_LIGHT, 320 * EFFECT_SPEED_MULTIPLIER, 6);
            setTimeout(() => {
                spawnImpactBurst(to.x, to.y + oy, { emoji: '✨', size: 22, duration: 260 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT });
            }, 140 * EFFECT_SPEED_MULTIPLIER);
        }, at);
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, duration * 0.9);
}
registerCustomSkillMotion('assault_arrow', playAssaultArrowMotion, 'イルミネ');

// --- バスターソード：巨大な光の大剣を叩きつける ---
function playBusterSwordMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.64;

    spawnIllumineForge(side, { color: ILLUMINE_LIGHT, count: 5, duration: 460, radius: 40 });
    // 重い大剣なので、ためを長く・振りを大きく
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translate(0,-8px) rotate(-24deg) scale(1.06)', offset: 0.36 },
        { transform: 'translate(0,-8px) rotate(-26deg) scale(1.07)', offset: 0.48 },
        { transform: `translate(${travel}px,6px) rotate(20deg) scale(1.02)`, offset: 0.64 },
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 88, { length: 160, width: 18, color: '#ffffff', duration: 400 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 48, duration: 460 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 17, rotate: 12, duration: 580 });
    }, duration * 0.6);
}
registerCustomSkillMotion('buster_sword', playBusterSwordMotion, 'イルミネ');

// --- ブレードダンス：無数の刃を舞うように振るう多段技 ---
function playBladeDanceMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;
    const hits = 5;

    spawnIllumineForge(side, { color: ILLUMINE_LIGHT, count: 5 });
    // 相手の周りを舞うように位置を変え続ける
    const kf = [{ transform: 'translate(0,0) rotate(0deg)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.16 + (i / hits) * 0.68;
        const oy = (i % 2 === 0) ? -20 : 16;
        kf.push({ transform: `translate(${travel * (i % 2 === 0 ? 1 : 0.85)}px,${oy}px) rotate(${i % 2 === 0 ? -16 : 14}deg)`, offset: base });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i % 2 === 0) ? -16 : 14;
            spawnSlashArc(to.x, to.y + oy, (i * 47) % 180 - 90, { length: 98, width: 7, color: ILLUMINE_LIGHT, duration: 230 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { emoji: '✨', size: 22, duration: 250 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT });
        }, duration * (0.16 + (i / hits) * 0.68));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.9);
}
registerCustomSkillMotion('blade_dance', playBladeDanceMotion, 'イルミネ');

// --- アルスマグナ：全ての武装を同時に展開して一斉に叩き込む（大技） ---
function playArsMagnaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1500 * EFFECT_SPEED_MULTIPLIER;

    // 長いため：周囲に大量の武器が浮かび上がる
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.06)', offset: 0.3 },
        { transform: 'translateY(-12px) scale(1.1)', offset: 0.48 },
        { transform: 'translateY(0) scale(1.02)', offset: 0.66 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 術者の周りに武器が円形に並ぶ
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        spawnCustomParticle('✦', from.x + Math.cos(a) * 56, from.y + Math.sin(a) * 44, {
            size: 24, delay: 100 + i * 55, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) rotate(120deg)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1) rotate(200deg)', opacity: 1 }
            ]
        });
    }

    // 一斉射出：全ての武器が相手へ殺到する
    setTimeout(() => {
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8;
            const sx = from.x + Math.cos(a) * 56;
            const sy = from.y + Math.sin(a) * 44;
            spawnCustomParticle('✦', sx, sy, {
                size: 24, delay: i * 45, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_LIGHT, easing: 'ease-in',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1 },
                    { transform: `translate(${to.x - sx}px,${to.y - sy}px) translate(-50%,-50%) scale(0.8)`, opacity: 0 }
                ]
            });
            setTimeout(() => {
                spawnImpactBurst(to.x + (Math.random() - 0.5) * 30, to.y + (Math.random() - 0.5) * 26, {
                    size: 24, duration: 260 * EFFECT_SPEED_MULTIPLIER
                });
            }, i * 45 + 380 * EFFECT_SPEED_MULTIPLIER);
        }
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 56, duration: 520 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 19, rotate: 14, duration: 620 });
        }, 620 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.56);
}
registerCustomSkillMotion('ars_magna', playArsMagnaMotion, 'イルミネ');

// --- レクイエムエンド：鎮魂の光が相手を静かに包み込む（大技） ---
function playRequiemEndMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1450 * EFFECT_SPEED_MULTIPLIER;

    spawnIllumineForge(side, { color: ILLUMINE_REQUIEM, count: 6, duration: 620, radius: 48 });
    // 鎮魂なので動きは静か。祈るように構える
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.34 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.6 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 静かな光の環が上から降りて相手を閉じ込める
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 66, delay: i * 160, duration: 720 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_REQUIEM,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(-40px) scale(1.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1)', opacity: 0.9, offset: 0.55 },
                    { transform: 'translate(-50%,-50%) translateY(10px) scale(0.7)', opacity: 0 }
                ]
            });
        }
        // 最後に光が閉じる
        setTimeout(() => {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 84, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 1, offset: 0.55 },
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 }
                ]
            });
            spawnImpactBurst(to.x, to.y, { size: 50, duration: 500 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_REQUIEM });
            playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 600 });
        }, 620 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.48);
}
registerCustomSkillMotion('requiem_end', playRequiemEndMotion, 'イルミネ');

// --- クリムゾンノヴァ：紅蓮の光が一点に凝縮し、爆発的に膨張する（最大級の大技） ---
function playCrimsonNovaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1600 * EFFECT_SPEED_MULTIPLIER;

    // 全技中もっとも長いため（震えながら紅蓮を溜め込む）
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1)', offset: 0 },
        { transform: 'translate(-2px,0) scale(1.04)', offset: 0.14 },
        { transform: 'translate(2px,-4px) scale(1.08)', offset: 0.28 },
        { transform: 'translate(-2px,-8px) scale(1.14)', offset: 0.44 },
        { transform: 'translate(0,-8px) scale(1.16)', offset: 0.54 },
        { transform: 'translate(0,2px) scale(0.98)', offset: 0.68 },  // 撃ち出す
        { transform: 'translate(0,0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 紅蓮が渦を巻いて集まる
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const r = 66;
        spawnCustomParticle('🔥', from.x + Math.cos(a) * r, from.y + Math.sin(a) * r * 0.7, {
            size: 22, delay: 80 + i * 60, duration: 540 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_CRIMSON,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.7}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    // 超新星：一点に潰れてから、一気に膨張する
    setTimeout(() => {
        spawnCustomParticle('⬤', to.x, to.y, {
            size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_CRIMSON,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 92, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_CRIMSON,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.9)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3.4)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 * i) / 8;
                spawnCustomParticle('🔥', to.x, to.y, {
                    size: 26, delay: i * 40, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: ILLUMINE_CRIMSON,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 50}px,${Math.sin(a) * 40}px) translate(-50%,-50%) scale(1.3)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 86}px,${Math.sin(a) * 68}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 60, duration: 560 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 21, rotate: 15, duration: 660 });
        }, 420 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.62);
}
registerCustomSkillMotion('crimson_nova', playCrimsonNovaMotion, 'イルミネ');
