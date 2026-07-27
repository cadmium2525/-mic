// =====================================================
// monster_motion_ham.js
// ハム専用のバトルモーション演出。
//
// ハムの特徴（＝演出の軸）：
//   ・格闘家タイプ   → 拳と足の技は「小刻みで手数が多い」テンポで見せる
//   ・分厚い体と頭   → 頭つき系は体ごとぶつける重い当たりにする
//   ・投げ技         → 背負い投げは相手を担いで一回転させる
//   ・コミカルな大技 → おなら・超大声は勢いよく、少し可笑しみのある見た目にする
//
// 対応技：ワンツーパンチ／ソバット／頭つき／背負い投げ／超頭つき／
//         マシンガンパンチ／おなら／超大声
// =====================================================

// --- ワンツーパンチ：左右の拳を素早く2発 ---
function playOneTwoPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 680 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;

    // 小さく踏み込みながら、上下に振り分けて2発
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: `translate(${travel}px,-5px) rotate(-6deg)`, offset: 0.26 },  // ワン
        { transform: `translate(${travel * 0.7}px,2px) rotate(4deg)`, offset: 0.42 },
        { transform: `translate(${travel * 1.05}px,-3px) rotate(-7deg)`, offset: 0.62 }, // ツー
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.26, -10, 26], [0.62, 8, 34]].forEach(([at, oy, size], i) => {
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y + oy, { size, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 11 : 7, rotate: i === 1 ? 8 : 5, duration: 320 });
        }, duration * at);
    });
}
registerCustomSkillMotion('one_two_punch', playOneTwoPunchMotion, 'ハム');

// --- ソバット：体を回転させながら踵で蹴り抜く ---
function playSobatMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.6;
    const spinDir = (to.x - from.x) > 0 ? 1 : -1;

    // 背を向けるように半回転してから、踵を叩き込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${-travel * 0.1}px) rotate(${spinDir * 120}deg)`, offset: 0.28 }, // 回る
        { transform: `translateX(${travel}px) rotate(${spinDir * 330}deg)`, offset: 0.52 },        // 蹴り抜く
        { transform: `translateX(${travel * 0.6}px) rotate(${spinDir * 360}deg)`, offset: 0.72 },
        { transform: `translateX(0) rotate(${spinDir * 360}deg)`, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y + 4, -12, { length: 100, width: 10, color: '#ffd0a0', duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.5);
}
registerCustomSkillMotion('sobat', playSobatMotion, 'ハム');

// --- 頭つき：体ごと突っ込んで頭をぶつける ---
function playAtamatsukiMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.62, duration: 640, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y - 6, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💫', to.x, to.y - 24, {
            size: 22, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: 'translate(0,-12px) translate(-50%,-50%) scale(0.8)', opacity: 0 }
            ]
        });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('atamatsuki', playAtamatsukiMotion, 'ハム');

// --- 背負い投げ：懐に入り、相手を担いで一回転させて叩きつける ---
function playSeoinageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.52;
    const throwDir = (to.x - from.x) > 0 ? -1 : 1; // 投げは自分の後方へ

    // 懐に入る → 担ぎ上げる → 前へ投げ落とす
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: `translate(${travel}px,4px) rotate(0deg)`, offset: 0.24 },  // 懐に入る
        { transform: `translate(${travel}px,-6px) rotate(-14deg)`, offset: 0.44 }, // 担ぎ上げる
        { transform: `translate(${travel * 0.8}px,4px) rotate(18deg)`, offset: 0.62 }, // 投げる
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手は担がれて宙で一回転し、地面に叩きつけられる
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: `translate(${throwDir * 12}px,-34px) rotate(-90deg)`, offset: 0.32 },  // 担ぎ上げられる
            { transform: `translate(${throwDir * 30}px,-16px) rotate(-230deg)`, offset: 0.6 },  // 投げられる
            { transform: `translate(${throwDir * 20}px,14px) rotate(-350deg)`, offset: 0.82 },  // 落ちる
            { transform: 'translate(0,0) rotate(-360deg)', offset: 1 }
        ], { duration: duration * 0.7, easing: 'ease-in-out' });
    }, duration * 0.26);

    // 叩きつけの衝撃
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 16, { size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💨', to.x, to.y + 20, {
            size: 28, duration: 440 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
            ]
        });
    }, duration * 0.8);
}
registerCustomSkillMotion('seoinage', playSeoinageMotion, 'ハム');

// --- 超頭つき：助走をつけた渾身の頭突き（頭つきの強化版として、ためと衝撃を大きく） ---
function playChoAtamatsukiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1060 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.78;

    // 大きく後ろへ下がって助走 → 全力で突っ込む
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: `translateX(${-travel * 0.28}px) scale(0.94)`, offset: 0.3 },  // 下がる
        { transform: `translateX(${-travel * 0.3}px) scale(0.93)`, offset: 0.42 },
        { transform: `translateX(${travel}px) scale(1.12)`, offset: 0.62 },          // 突進
        { transform: `translateX(${travel}px) scale(1.12)`, offset: 0.72 },
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 助走中の砂ぼこり
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('💨', from.x - (to.x - from.x) * 0.2, from.y + 18, {
            size: 20, delay: duration * 0.34 + i * 70, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.8, offset: 0.4 },
                { transform: 'translate(-14px,-8px) translate(-50%,-50%) scale(1.6)', opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y - 6, { size: 50, duration: 460 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI * 2 * i) / 4;
            spawnCustomParticle('💥', to.x, to.y, {
                size: 20, delay: i * 40, duration: 400 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 54}px,${Math.sin(a) * 42}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 18, rotate: 13, duration: 600 });
    }, duration * 0.62);
}
registerCustomSkillMotion('cho_atamatsuki', playChoAtamatsukiMotion, 'ハム');

// --- マシンガンパンチ：目にも留まらぬ連打を浴びせる ---
function playMachinegunPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.48;
    const punches = 8;

    // 小さな前後の往復を高速で繰り返す
    const kf = [{ transform: 'translateX(0)', offset: 0 }];
    for (let i = 0; i < punches; i++) {
        const base = 0.12 + (i / punches) * 0.76;
        kf.push({ transform: `translateX(${travel}px)`, offset: base });
        kf.push({ transform: `translateX(${travel * 0.78}px)`, offset: base + 0.035 });
    }
    kf.push({ transform: 'translateX(0)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    // 着弾位置を細かくばらけさせて「連打されている」感じを出す
    for (let i = 0; i < punches; i++) {
        setTimeout(() => {
            const ox = (Math.random() - 0.5) * 26;
            const oy = (Math.random() - 0.5) * 34;
            spawnImpactBurst(to.x + ox, to.y + oy, { size: 20 + Math.random() * 8, duration: 240 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.12 + (i / punches) * 0.76));
    }
    // 最後にまとめて仰け反る
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.9);
}
registerCustomSkillMotion('machinegun_punch', playMachinegunPunchMotion, 'ハム');

// --- おなら：勢いよく放って相手を毒で悶絶させる（コミカルに見せる） ---
function playOnaraMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // ぐっと踏ん張って、ぷすーっと放つ（反動で少し前に押し出される）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(1.08,0.94)', offset: 0.22 },   // 踏ん張る
        { transform: `translateX(${dx * 0.06}px) scale(0.94,1.06)`, offset: 0.38 }, // 放つ反動
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 毒々しいガスが漂いながら相手を包む
    for (let i = 0; i < 6; i++) {
        const wave = (i % 2 === 0) ? -18 : 16;
        spawnCustomParticle('💨', from.x - dx * 0.06, from.y + 14, {
            size: 22 + Math.random() * 10,
            delay: duration * 0.32 + i * 80,
            duration: 700 * EFFECT_SPEED_MULTIPLIER,
            color: '#a8d86a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${wave}px) translate(-50%,-50%) scale(1.2)`, opacity: 0.85, offset: 0.5 },
                { transform: `translate(${dx}px,${wave * 0.4}px) translate(-50%,-50%) scale(1.7)`, opacity: 0 }
            ]
        });
    }

    // 臭さに悶絶する
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) translateX(0)', offset: 0 },
            { transform: 'rotate(-8deg) translateX(-5px)', offset: 0.25 },
            { transform: 'rotate(7deg) translateX(5px)', offset: 0.5 },
            { transform: 'rotate(-5deg) translateX(-3px)', offset: 0.75 },
            { transform: 'rotate(0deg) translateX(0)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 22, { emoji: '🤢', size: 30, duration: 520 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.62);
}
registerCustomSkillMotion('onara', playOnaraMotion, 'ハム');

// --- 超大声：腹の底から出す大音量。空気が震えて相手を吹き飛ばす ---
function playChoOgoeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 大きく息を吸い込み、渾身の大声（体が反動で震える）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1) translateX(0)', offset: 0 },
        { transform: 'scale(1.12,1.1) translateX(0)', offset: 0.26 },   // 吸い込む
        { transform: 'scale(0.92,0.94) translateX(-3px)', offset: 0.42 }, // 叫ぶ
        { transform: 'scale(1.04,1.02) translateX(2px)', offset: 0.54 },
        { transform: 'scale(0.98,0.99) translateX(-2px)', offset: 0.66 },
        { transform: 'scale(1,1) translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 音の壁が押し寄せる（輪をだんだん大きくして迫力を出す）
    for (let i = 0; i < 5; i++) {
        spawnCustomParticle('◯', from.x, from.y, {
            size: 40 + i * 8,
            delay: duration * 0.38 + i * 90,
            duration: 640 * EFFECT_SPEED_MULTIPLIER,
            color: '#ffd76a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25) scaleY(0.9)', opacity: 0 },
                { transform: `translate(${dx * 0.55}px,0) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.5 },
                { transform: `translate(${dx}px,0) translate(-50%,-50%) scale(1.9)`, opacity: 0 }
            ]
        });
    }

    // 音圧で吹き飛ばされる
    setTimeout(() => {
        const blowDir = dx > 0 ? 1 : -1;
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) rotate(0deg)', offset: 0 },
            { transform: `translateX(${blowDir * 18}px) rotate(${blowDir * 12}deg)`, offset: 0.35 },
            { transform: `translateX(${blowDir * 6}px) rotate(${blowDir * 4}deg)`, offset: 0.7 },
            { transform: 'translateX(0) rotate(0deg)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y - 18, { emoji: '😵', size: 30, duration: 480 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.66);
}
registerCustomSkillMotion('cho_ogoe', playChoOgoeMotion, 'ハム');
