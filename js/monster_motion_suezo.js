// =====================================================
// monster_motion_suezo.js
// スエゾー専用の丁寧なバトルモーション演出。
// monster_motion_mochi.js と同じく skill_effects.js の CUSTOM_SKILL_MOTIONS の仕組みを使い、
// スエゾーの技だけは汎用の絵文字エフェクトではなく、スエゾーらしい individual な演出を再生する。
//
// スエゾーの特徴（＝演出の軸）：
//   ・大きな単眼      → 視線・念力系の技は「眼」を起点に見せる
//   ・長く伸びる舌    → なめる／ベロビンタは舌が伸びる動きで見せる
//   ・大きな口        → かみつき／食うは口で捕らえる動きで見せる
//
// 対応技：
//   ・meiso           （瞑想）      ：ふわりと浮かび上がり、集中の輪が広がる（自己強化）
//   ・nameru          （なめる）    ：舌がびろーんと伸びて相手を舐める（必中技なので外さない見た目に）
//   ・kamitsuki       （かみつき）  ：素早く踏み込んで噛みつく
//   ・kuu             （食う）      ：相手を吸い込んで丸呑みし、englobeして自身が回復する
//   ・psychokinesis   （サイコキネシス）：眼が光り、相手が浮かび上がって揺さぶられ、叩きつけられる
//   ・cho_netsushisen （超熱視線）  ：眼にエネルギーを溜めてから熱線を撃つ
//   ・utau            （歌う）      ：音符が波打ちながら飛び、相手がふらふらする
//   ・berobinta       （ベロビンタ）：舌を横薙ぎに振るって引っぱたく
//
// ※スプライト自体を動かす演出では、必ず animateSpriteLayers()（skill_effects.js）を使う。
//   絵柄本体だけを動かすと、オーラ着色オーバーレイがその場に取り残されてしまうため。
// =====================================================

// --- 舌を「伸ばす」共通ヘルパー ---
// 起点から目標に向かって、ピンク色の帯（＝舌）が伸び、先端に👅を付けて表示する。
// 伸びる → 少し保持 → 縮んで戻る、という往復の動きにして「舌を出して引っ込める」感じを出す。
//   holdRatio: 伸びきった状態を保持する割合（0〜1）。大きいほど「ベローンと出したまま」になる。
function spawnSuezoTongue(fromX, fromY, toX, toY, totalDuration, opts = {}) {
    const { width = 14, color = '#ff7fb0', holdRatio = 0.35 } = opts;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    // 舌の本体（根元から先端へ伸びる帯）
    const tongue = document.createElement('div');
    tongue.style.cssText = `position:fixed; left:${fromX}px; top:${fromY}px; width:${length}px; height:${width}px;
        transform-origin:0% 50%; pointer-events:none; z-index:9998; will-change:transform,opacity;
        border-radius:${width}px;
        background:linear-gradient(90deg, ${color} 0%, #ff9ec4 60%, #ffb3d1 100%);
        box-shadow:0 0 6px 2px rgba(255,127,176,0.5); margin-top:${-width / 2}px;`;
    document.body.appendChild(tongue);

    const extendEnd = (1 - holdRatio) / 2;          // 伸びきるまで
    const holdEnd = extendEnd + holdRatio;          // 保持し終わるまで
    const keyframes = [
        { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 0.9, offset: 0 },
        { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: extendEnd },
        { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: holdEnd },
        { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 0.9, offset: 1 }
    ];
    try {
        const anim = tongue.animate(keyframes, { duration: totalDuration, easing: 'ease-in-out', fill: 'forwards' });
        anim.onfinish = () => tongue.remove();
        setTimeout(() => tongue.remove(), totalDuration + 200);
    } catch (e) {
        tongue.remove();
    }

    // 舌の先端（👅）。根元から目標地点まで動いて、また戻ってくる
    spawnCustomParticle('👅', fromX, fromY, {
        size: 26,
        duration: totalDuration,
        // 舌の帯（上のtongue.animate）とまったく同じ補間カーブを指定する。
        // ここを揃えないと、先端の絵文字だけが帯より先に進んでしまう。
        easing: 'ease-in-out',
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 0 },
            { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: extendEnd },
            { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: holdEnd },
            { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 1 }
        ]
    });
}

// --- スエゾーの「眼が光る」共通ヘルパー ---
// 単眼モンスターらしさを出すため、念力・視線系の技の直前に必ず挟む。
function spawnSuezoEyeGlow(side, color, duration, size = 34) {
    const container = getBattleSpriteContainerEl(side);
    if (!container) return;
    const { x, y } = getElCenter(container);
    spawnCustomParticle('✦', x, y - 6, {
        size,
        duration,
        color,
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 1, offset: 0.45 },
            { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
        ]
    });
}

// =====================================================
// 瞑想：ふわりと浮かび上がり、集中の輪が周囲に広がる
// =====================================================
function playMeisoMotion(side) {
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // ゆっくり浮かび上がって、静かに降りてくる
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.45 },
        { transform: 'translateY(-10px) scale(1.03)', offset: 0.7 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    const container = getBattleSpriteContainerEl(side);
    if (!container) return;
    const { x, y } = getElCenter(container);

    // 集中を表す輪が、内から外へ静かに広がる（3重）
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('◯', x, y, {
            size: 52,
            duration: 760 * EFFECT_SPEED_MULTIPLIER,
            delay: i * 190 * EFFECT_SPEED_MULTIPLIER,
            color: '#8ab4ff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0.85, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 }
            ]
        });
    }
    // 立ちのぼる精神統一のきらめき
    spawnSelfParticleRing(container, '✨', 5, 15, 780 * EFFECT_SPEED_MULTIPLIER, 34);
}
registerCustomSkillMotion('meiso', playMeisoMotion, 'スエゾー');

// =====================================================
// なめる：舌がびろーんと伸びて相手を舐める
// （回避を無視する必中技なので、伸ばした舌が確実に届いて絡みつく見た目にしている）
// =====================================================
function playNameruMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const duration = 780 * EFFECT_SPEED_MULTIPLIER;

    // 舌を出すために、少しだけ相手の方へ身を乗り出す
    const lean = (to.x - from.x) * 0.08;
    animateSpriteLayers(side, [
        { transform: 'translateX(0)', offset: 0 },
        { transform: `translateX(${lean}px)`, offset: 0.3 },
        { transform: `translateX(${lean}px)`, offset: 0.6 },
        { transform: 'translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSuezoTongue(from.x, from.y, to.x, to.y, duration, { holdRatio: 0.4 });

    // 舐められた側の「うわっ」という反応（舌が届いたタイミングに合わせる）
    setTimeout(() => {
        spawnCustomParticle('💧', to.x + 10, to.y - 8, {
            size: 20,
            duration: 460 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) rotate(20deg)', opacity: 1, offset: 0.4 },
                { transform: 'translate(6px, 16px) translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }, duration * 0.32);
}
registerCustomSkillMotion('nameru', playNameruMotion, 'スエゾー');

// =====================================================
// かみつき：素早く踏み込んで噛みつき、すぐに戻る
// =====================================================
function playKamitsukiMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const travel = (to.x - from.x) * 0.55; // 相手の手前まで踏み込む
    const duration = 620 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: 'translateX(0) scale(0.92)', offset: 0.15 },                    // ためる
        { transform: `translateX(${travel}px) scale(1.06)`, offset: 0.42 },          // 踏み込む
        { transform: `translateX(${travel}px) scale(1.06)`, offset: 0.58 },
        { transform: 'translateX(0) scale(1)', offset: 1 }                            // 戻る
    ], { duration, easing: 'ease-in-out' });

    // 噛みついた瞬間の牙のあと（上下から挟み込むように2つ表示する）
    setTimeout(() => {
        [-1, 1].forEach((dir, i) => {
            spawnCustomParticle('🦷', to.x, to.y + dir * 16, {
                size: 22,
                duration: 380 * EFFECT_SPEED_MULTIPLIER,
                delay: i * 30,
                keyframes: [
                    { transform: `translate(-50%,-50%) translateY(${dir * 14}px) scale(0.6)`, opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1.15)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1)', opacity: 0 }
                ]
            });
        });
        spawnCustomParticle('💥', to.x, to.y, {
            size: 30,
            duration: 340 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
            ]
        });
    }, duration * 0.42);
}
registerCustomSkillMotion('kamitsuki', playKamitsukiMotion, 'スエゾー');

// =====================================================
// 食う：相手を吸い込んで丸呑みし、englobeして自身のライフを回復する
// （技の効果「自身のライフを15%回復する」に合わせて、最後に回復の演出を入れている）
// =====================================================
function playKuuMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;

    // 口を大きく開けて吸い込み → ごくんと呑み込む（縦につぶれて膨らむ動き）
    animateSpriteLayers(side, [
        { transform: 'scale(1, 1)', offset: 0 },
        { transform: 'scale(1.14, 0.92)', offset: 0.28 },   // 口を大きく開ける
        { transform: 'scale(1.22, 1.12)', offset: 0.52 },   // 呑み込んで膨らむ
        { transform: 'scale(0.94, 1.06)', offset: 0.72 },   // ごくん
        { transform: 'scale(1, 1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手の位置からスエゾーの口元へ、吸い込まれていく渦
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    for (let i = 0; i < 5; i++) {
        const jitter = (Math.random() - 0.5) * 26;
        spawnCustomParticle('🌀', to.x + jitter, to.y + jitter * 0.5, {
            size: 18 + Math.random() * 6,
            duration: 520 * EFFECT_SPEED_MULTIPLIER,
            delay: i * 60 * EFFECT_SPEED_MULTIPLIER,
            color: '#8ce0a8',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.1) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) translate(-50%,-50%) scale(0.8) rotate(220deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.2) rotate(420deg)`, opacity: 0 }
            ]
        });
    }

    // 呑み込んだ後、英気を養って回復する
    setTimeout(() => {
        spawnSelfParticleRing(casterContainer, '💚', 5, 17, 620 * EFFECT_SPEED_MULTIPLIER, 36);
    }, duration * 0.62);
}
registerCustomSkillMotion('kuu', playKuuMotion, 'スエゾー');

// =====================================================
// サイコキネシス：眼が光り、相手が宙に浮かんで揺さぶられ、最後に叩きつけられる
// （技の効果「マヒ状態にする」に合わせ、締め付けられて痙攣するような揺れにしている）
// =====================================================
function playPsychokinesisMotion(side) {
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!targetContainer) return;
    const to = getElCenter(targetContainer);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;

    // まず自分の眼が光る（念力の起点を見せる）
    spawnSuezoEyeGlow(side, '#b07bff', 420 * EFFECT_SPEED_MULTIPLIER, 38);

    // 発動者はぐっと踏ん張る（念を込める）
    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(0.95)', offset: 0.2 },
        { transform: 'scale(1.02)', offset: 0.5 },
        { transform: 'scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手を持ち上げて、細かく揺さぶり、最後に叩きつける
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateY(0) rotate(0deg)', offset: 0 },
            { transform: 'translateY(-26px) rotate(-4deg)', offset: 0.22 },  // 浮かび上がる
            { transform: 'translateY(-30px) rotate(5deg)', offset: 0.38 },   // 揺さぶられる
            { transform: 'translateY(-24px) rotate(-6deg)', offset: 0.52 },
            { transform: 'translateY(-30px) rotate(4deg)', offset: 0.66 },
            { transform: 'translateY(6px) rotate(0deg)', offset: 0.86 },     // 叩きつけられる
            { transform: 'translateY(0) rotate(0deg)', offset: 1 }
        ], { duration: duration * 0.8, easing: 'ease-in-out' });
    }, duration * 0.18);

    // 相手を包む念力の輪
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('◯', to.x, to.y - 14, {
            size: 46,
            duration: 620 * EFFECT_SPEED_MULTIPLIER,
            delay: (300 + i * 170) * EFFECT_SPEED_MULTIPLIER,
            color: '#b07bff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.5) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.85) rotate(120deg)', opacity: 0.9, offset: 0.55 },
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(220deg)', opacity: 0 }
            ]
        });
    }

    // 叩きつけの衝撃
    setTimeout(() => {
        spawnCustomParticle('💥', to.x, to.y + 14, {
            size: 32,
            duration: 360 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
            ]
        });
    }, duration * 0.85);
}
registerCustomSkillMotion('psychokinesis', playPsychokinesisMotion, 'スエゾー');

// =====================================================
// 超熱視線：眼にエネルギーを溜めてから、灼熱の光線を撃ち抜く
// =====================================================
function playChoNetsushisenMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);

    const chargeDuration = 480 * EFFECT_SPEED_MULTIPLIER;
    const beamDuration = 560 * EFFECT_SPEED_MULTIPLIER;

    // ① ためる：眼に熱がこもり、赤い光が集まってくる
    spawnSuezoEyeGlow(side, '#ff5a3c', chargeDuration, 42);
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4 + 0.4;
        const startDx = Math.cos(angle) * 40;
        const startDy = Math.sin(angle) * 30;
        spawnCustomParticle('🔥', from.x + startDx, from.y + startDy - 6, {
            size: 16,
            duration: chargeDuration,
            delay: i * 60,
            color: '#ff7a3c',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-startDx}px, ${-startDy}px) translate(-50%,-50%) scale(0.3)`, opacity: 0 }
            ]
        });
    }

    // ② 反動：撃つ瞬間、わずかにのけぞる
    setTimeout(() => {
        const recoil = (from.x - to.x) > 0 ? 8 : -8;
        animateSpriteLayers(side, [
            { transform: 'translateX(0)', offset: 0 },
            { transform: `translateX(${recoil}px)`, offset: 0.25 },
            { transform: 'translateX(0)', offset: 1 }
        ], { duration: beamDuration, easing: 'ease-out' });

        // ③ 発射：眼から一直線に熱線が走る
        spawnBeamLine(from.x, from.y - 6, to.x - from.x, to.y - (from.y - 6), '#ff4d2d', beamDuration, 13);

        // ④ 着弾：炎が弾ける
        setTimeout(() => {
            for (let i = 0; i < 4; i++) {
                const spread = (Math.random() - 0.5) * 44;
                spawnCustomParticle('🔥', to.x + spread, to.y + (Math.random() - 0.5) * 30, {
                    size: 22 + Math.random() * 8,
                    duration: 420 * EFFECT_SPEED_MULTIPLIER,
                    delay: i * 45,
                    color: '#ff6a2c',
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.4 },
                        { transform: 'translate(0,-22px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                    ]
                });
            }
        }, beamDuration * 0.3);
    }, chargeDuration);
}
registerCustomSkillMotion('cho_netsushisen', playChoNetsushisenMotion, 'スエゾー');

// =====================================================
// 歌う：音痴な歌声。音符が波打ちながら飛んでいき、相手がふらふらする
// （技の効果「混乱状態にする」に合わせ、最後に相手の頭上でぐるぐる回る）
// =====================================================
function playUtauMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    // 歌っている本人は、リズムに合わせて左右に体を揺らす
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg)', offset: 0 },
        { transform: 'rotate(-6deg)', offset: 0.2 },
        { transform: 'rotate(6deg)', offset: 0.4 },
        { transform: 'rotate(-5deg)', offset: 0.6 },
        { transform: 'rotate(4deg)', offset: 0.8 },
        { transform: 'rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 音符が上下に波打ちながら相手へ飛んでいく
    const notes = ['🎵', '🎶', '🎵', '🎶', '♪'];
    notes.forEach((note, i) => {
        const wave = (i % 2 === 0) ? -26 : 22; // 一つおきに上下へ揺れる軌道にする
        spawnCustomParticle(note, from.x, from.y - 10, {
            size: 20 + (i % 2) * 4,
            duration: 720 * EFFECT_SPEED_MULTIPLIER,
            delay: i * 110 * EFFECT_SPEED_MULTIPLIER,
            color: '#ffd84d',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-15deg)', opacity: 0 },
                { transform: `translate(${dx * 0.35}px, ${dy * 0.35 + wave}px) translate(-50%,-50%) scale(1.05) rotate(10deg)`, opacity: 1, offset: 0.4 },
                { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - wave * 0.6}px) translate(-50%,-50%) scale(1) rotate(-8deg)`, opacity: 1, offset: 0.7 },
                { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.8) rotate(15deg)`, opacity: 0 }
            ]
        });
    });

    // 聞かされた側はふらふらと目を回す
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) translateX(0)', offset: 0 },
            { transform: 'rotate(7deg) translateX(4px)', offset: 0.25 },
            { transform: 'rotate(-7deg) translateX(-4px)', offset: 0.5 },
            { transform: 'rotate(5deg) translateX(3px)', offset: 0.75 },
            { transform: 'rotate(0deg) translateX(0)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });

        // 頭上をぐるぐる回る（混乱の表現）
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('💫', to.x, to.y - 26, {
                size: 18,
                duration: 700 * EFFECT_SPEED_MULTIPLIER,
                delay: i * 90,
                keyframes: [
                    { transform: `translate(${Math.cos(angle) * 20}px, ${Math.sin(angle) * 8}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(angle + 2.1) * 22}px, ${Math.sin(angle + 2.1) * 9}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(angle + 4.2) * 20}px, ${Math.sin(angle + 4.2) * 8}px) translate(-50%,-50%) scale(0.8)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.55);
}
registerCustomSkillMotion('utau', playUtauMotion, 'スエゾー');

// =====================================================
// ベロビンタ：長い舌を横薙ぎに振るって引っぱたく
// （技の効果「目を眩ませ命中率を下げる」に合わせ、最後に相手の目の前で星が回る）
// =====================================================
function playBerobintaMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const duration = 660 * EFFECT_SPEED_MULTIPLIER;

    // 振りかぶって、鋭く振り抜く
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-10deg) scale(0.96)', offset: 0.25 },  // 振りかぶる
        { transform: 'rotate(8deg) scale(1.05)', offset: 0.45 },    // 振り抜く
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 舌は「上から下へ叩きつける」ため、相手の少し上を狙って伸ばす
    spawnSuezoTongue(from.x, from.y - 8, to.x, to.y - 20, duration * 0.75, { holdRatio: 0.15, width: 16 });

    // 叩いた瞬間の衝撃と、横薙ぎの軌跡
    setTimeout(() => {
        spawnCustomParticle('💥', to.x, to.y - 6, {
            size: 30,
            duration: 340 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-20deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3) rotate(10deg)', opacity: 1, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 0 }
            ]
        });
        // 引っぱたかれて仰け反る
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) rotate(0deg)', offset: 0 },
            { transform: 'translateX(10px) rotate(9deg)', offset: 0.3 },
            { transform: 'translateX(-4px) rotate(-3deg)', offset: 0.65 },
            { transform: 'translateX(0) rotate(0deg)', offset: 1 }
        ], { duration: 460 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
    }, duration * 0.42);

    // 目を眩ませた表現（相手の顔のあたりで星が回る）
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('⭐', to.x, to.y - 20, {
                size: 16,
                duration: 640 * EFFECT_SPEED_MULTIPLIER,
                delay: i * 80,
                color: '#ffd84d',
                keyframes: [
                    { transform: `translate(${Math.cos(angle) * 18}px, ${Math.sin(angle) * 7}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(angle + 2.1) * 20}px, ${Math.sin(angle + 2.1) * 8}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(angle + 4.2) * 18}px, ${Math.sin(angle + 4.2) * 7}px) translate(-50%,-50%) scale(0.75)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.6);
}
registerCustomSkillMotion('berobinta', playBerobintaMotion, 'スエゾー');
