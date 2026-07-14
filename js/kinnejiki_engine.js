// =====================================================
// kinnejiki_engine.js
// 「金ネジキ」レンタルバトルファクトリー：進行・生成・AIロジック
// -----------------------------------------------------
// このファイルは DOM に依存しない純粋なロジック層。
// database.js（MONSTER_TEMPLATES / SKILLS_DB / EQUIPMENT_DB /
// KIN_NEJIKI_SPECIES_POOL / KIN_NEJIKI_SKILL_POOL / KIN_NEJIKI_BOSSES /
// applySkillOnHitEffect / tickStatusTurnsAndCheckConfusion 等）に依存する。
// ブラウザ・Node.js（テスト用）の両方から呼び出せるようにする。
// =====================================================

(function (root) {

    const TOTAL_SETS = 7;
    const WINS_PER_SET = 7;
    const PARTY_SIZE = 3;
    const OFFER_SIZE = 6;

    // -----------------------------------------------------
    // 乱択ユーティリティ
    // -----------------------------------------------------
    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function pickN(arr, n) {
        const pool = [...arr];
        const result = [];
        while (result.length < n && pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length);
            result.push(pool.splice(idx, 1)[0]);
        }
        return result;
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // -----------------------------------------------------
    // 装備の段階分け（セット数に応じて抽選対象を絞る）
    // 1〜2: ノーマル産ステータス系
    // 3〜5: ハード産ステータス系＋一部特殊効果／オーラ連動
    // 6〜7・ネジキ戦: 特殊効果系中心
    // -----------------------------------------------------
    function getEquipmentTierForSet(setNumber) {
        if (setNumber <= 2) return 'early';
        if (setNumber <= 5) return 'mid';
        return 'late';
    }

    function getEquipmentCandidateIds(tier) {
        const all = Object.keys(EQUIPMENT_DB);
        if (tier === 'early') {
            return all.filter(id => EQUIPMENT_DB[id].mode === 'normal' && EQUIPMENT_DB[id].type === 'stat');
        }
        if (tier === 'mid') {
            return all.filter(id => {
                const e = EQUIPMENT_DB[id];
                if (e.type === 'auraStat2') return true; // オーラ連動装備は全セット通して抽選対象
                if (e.mode === 'hard' && e.type === 'stat') return true;
                if (e.type === 'special' && e.rarity !== '★★★') return true; // 一部特殊効果が混ざり始める
                return false;
            });
        }
        // late: 特殊効果中心（オーラ連動含む）
        return all.filter(id => {
            const e = EQUIPMENT_DB[id];
            return e.type === 'special' || e.type === 'auraStat2';
        });
    }

    // 装備インスタンスを1つ生成する（rollEquipmentInstance が database.js に無い場合の簡易版）
    function rollRentalEquipment(setNumber) {
        const tier = getEquipmentTierForSet(setNumber);
        const candidates = getEquipmentCandidateIds(tier);
        if (candidates.length === 0) return null;
        const equipId = pickRandom(candidates);
        const base = EQUIPMENT_DB[equipId];
        const inst = { equipId, instanceId: 'rental_' + Math.random().toString(36).slice(2, 10) };

        if (base.type === 'stat') {
            inst.rolledValue = randInt(base.range[0], base.range[1]);
        } else if (base.type === 'auraStat2') {
            // オーラ連動装備：2ステータスをランダムに選び、レア度に応じた上昇幅を割り当てる
            const statKeys = ['pow', 'int', 'hit', 'spd', 'def', 'maxLife'];
            const chosen = pickN(statKeys, 2);
            const starCount = (base.rarity.match(/★/g) || []).length;
            const baseVal = starCount === 3 ? 20 : (starCount === 2 ? 14 : 8);
            inst.auraStats = chosen.map(s => ({ stat: s, value: s === 'maxLife' ? baseVal * 2 : baseVal }));
        }
        return inst;
    }

    // -----------------------------------------------------
    // レンタルモンスターインスタンス生成
    // ・種族固有技プールから4つをランダム抽選（4未満しか無い場合は全て採用）
    // ・ステータスはセット数に応じて緩やかにスケーリング
    // -----------------------------------------------------
    function scaleStatsForSet(baseStats, setNumber) {
        // セット1を基準(1.0倍)とし、セット7で概ね1.6倍程度まで緩やかに強化する
        const scale = 1 + (setNumber - 1) * 0.10;
        const scaled = {};
        Object.keys(baseStats).forEach(k => {
            if (k === 'gutsSpeed') {
                scaled[k] = Math.round(baseStats[k] + (setNumber - 1) * 0.4);
            } else {
                scaled[k] = Math.round(baseStats[k] * scale);
            }
        });
        if (scaled.maxLife) scaled.life = scaled.maxLife;
        return scaled;
    }

    function createRentalMonsterInstance(speciesId, setNumber) {
        const template = MONSTER_TEMPLATES[speciesId];
        if (!template) throw new Error('Unknown species: ' + speciesId);

        const skillPool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
        const skillCount = Math.min(4, skillPool.length);
        const skills = pickN(skillPool, skillCount);

        const stats = scaleStatsForSet(template.stats, setNumber);
        const equip = rollRentalEquipment(setNumber);

        return {
            instanceId: 'mon_' + Math.random().toString(36).slice(2, 10),
            speciesId,
            name: template.name,
            emoji: template.emoji,
            stats,
            skills,
            equip,
            aura: (typeof getRandomAuraKey === 'function') ? getRandomAuraKey() : null,
            // 戦闘中に使う状態異常系フィールド（database.js の共通ヘルパーが利用する）
            weakenTurns: 0, confuseTurns: 0, paralyzeTurns: 0, blindTurns: 0, defDownTurns: 0,
            dotTurns: 0, dotPct: 0, forceBoost: 0, shieldValue: 0, shieldUsedThisBattle: false,
            permaForceBoostActive: false, dodgeNextGuaranteed: false,
            guts: 50
        };
    }

    // 装備によるステータス補正を反映した実効ステータスを返す
    function getEffectiveStats(unit) {
        const s = { ...unit.stats };
        if (unit.equip) {
            const base = EQUIPMENT_DB[unit.equip.equipId];
            if (base && base.type === 'stat') {
                s[base.statKey] += unit.equip.rolledValue;
                if (base.statKey === 'maxLife') s.life = (s.life || s.maxLife) + unit.equip.rolledValue;
            } else if (base && base.type === 'auraStat2' && unit.equip.auraStats && unit.aura === base.requiredAura) {
                unit.equip.auraStats.forEach(entry => {
                    s[entry.stat] += entry.value;
                    if (entry.stat === 'maxLife') s.life = (s.life || s.maxLife) + entry.value;
                });
            }
        }
        return s;
    }

    // -----------------------------------------------------
    // 「6体提示」の生成
    // 通常セットでは12種族からランダムに6種族を提示する。
    // setNumberに応じたステータス/技/装備スケーリングを適用する。
    // -----------------------------------------------------
    function generateSixMonsterOffer(setNumber) {
        const speciesChoices = pickN(KIN_NEJIKI_SPECIES_POOL, OFFER_SIZE);
        return speciesChoices.map(id => createRentalMonsterInstance(id, setNumber));
    }

    // -----------------------------------------------------
    // ネジキ役（ボス）インスタンス生成
    // -----------------------------------------------------
    function createNejikiBossInstance(bossKey) {
        const boss = KIN_NEJIKI_BOSSES[bossKey];
        if (!boss) throw new Error('Unknown boss: ' + bossKey);
        const stats = { ...boss.statsBase, life: boss.statsBase.maxLife };
        return {
            instanceId: 'boss_' + bossKey,
            speciesId: boss.templateId,
            name: boss.name,
            title: boss.title,
            emoji: boss.emoji,
            desc: boss.desc,
            stats,
            skills: [...boss.skills],
            equip: null,
            aura: null,
            weakenTurns: 0, confuseTurns: 0, paralyzeTurns: 0, blindTurns: 0, defDownTurns: 0,
            dotTurns: 0, dotPct: 0, forceBoost: 0, shieldValue: 0, shieldUsedThisBattle: false,
            permaForceBoostActive: false, dodgeNextGuaranteed: false,
            isNejiki: true,
            guts: 50
        };
    }

    // -----------------------------------------------------
    // 進行状態（KinNejikiState）の生成・操作
    // -----------------------------------------------------
    function createInitialState() {
        return {
            setNumber: 1,
            battleInSet: 0,     // このセット内で何勝したか（0〜7）
            totalWins: 0,       // 通算勝利数（0〜49）
            party: [],          // 現在の手持ち3体
            offer: [],          // 直近に提示された6体（未選出分は捨てられる）
            finished: false,
            defeated: false
        };
    }

    function startRun(state) {
        state.setNumber = 1;
        state.battleInSet = 0;
        state.totalWins = 0;
        state.finished = false;
        state.defeated = false;
        state.offer = generateSixMonsterOffer(1);
        state.party = [];
        return state;
    }

    function selectParty(state, chosenIndices) {
        if (!Array.isArray(chosenIndices) || chosenIndices.length !== PARTY_SIZE) {
            throw new Error('パーティは3体選出する必要があります');
        }
        state.party = chosenIndices.map(i => state.offer[i]);
        state.offer = [];
        return state;
    }

    // 次の対戦相手を生成する（ネジキ役の登場判定を含む）
    // 戻り値: { opponentParty: [1体], isNejiki: bool, bossKey: 'set3'|'set7'|null }
    function generateNextOpponent(state) {
        const upcomingBattleInSet = state.battleInSet + 1; // これから戦う対戦（1〜7）
        const isSet3Boss = (state.setNumber === 3 && upcomingBattleInSet === WINS_PER_SET);
        const isSet7Boss = (state.setNumber === 7 && upcomingBattleInSet === WINS_PER_SET);

        if (isSet3Boss) {
            return { opponent: createNejikiBossInstance('set3'), isNejiki: true, bossKey: 'set3' };
        }
        if (isSet7Boss) {
            return { opponent: createNejikiBossInstance('set7'), isNejiki: true, bossKey: 'set7' };
        }
        const speciesId = pickRandom(KIN_NEJIKI_SPECIES_POOL);
        return { opponent: createRentalMonsterInstance(speciesId, state.setNumber), isNejiki: false, bossKey: null };
    }

    // 勝利後の1体交換（バトルファクトリー・ルール）
    // playerIndex: 手持ちの何番目を手放すか, opponentInstance: 直前に倒した（もしくは対戦した）相手モンスター
    function tradeMonster(state, playerIndex, opponentInstance) {
        if (playerIndex < 0 || playerIndex >= state.party.length) return state;
        state.party[playerIndex] = opponentInstance;
        return state;
    }

    // 勝利処理：勝ち星を加算し、セット送り・クリア判定を行う
    // 戻り値: { setCleared: bool, allCleared: bool }
    function registerWin(state) {
        state.battleInSet++;
        state.totalWins++;
        let setCleared = false;
        let allCleared = false;
        if (state.battleInSet >= WINS_PER_SET) {
            setCleared = true;
            if (state.setNumber >= TOTAL_SETS) {
                allCleared = true;
                state.finished = true;
            } else {
                state.setNumber++;
                state.battleInSet = 0;
            }
        }
        return { setCleared, allCleared };
    }

    function registerLoss(state) {
        state.finished = true;
        state.defeated = true;
    }

    // -----------------------------------------------------
    // AI（難易度はセット数に応じて段階的に強化）
    // レベル1（セット1〜2）：ほぼランダム
    // レベル2（セット3〜4）：ガッツ状況を見て大技／ガッツダウン技を使い分け
    // レベル3（セット5〜6）：プレイヤーの手持ちの弱点を突く技を優先
    // レベル4（セット7・ネジキ戦）：状況に応じてモンスターの交代も行う
    // -----------------------------------------------------
    function getAiLevel(setNumber) {
        if (setNumber <= 2) return 1;
        if (setNumber <= 4) return 2;
        if (setNumber <= 6) return 3;
        return 4;
    }

    // 技候補の中からAIレベルに応じて1つ選ぶ
    function chooseAiSkill(aiUnit, targetUnit, setNumber) {
        const level = getAiLevel(setNumber);
        const usable = aiUnit.skills.map(k => SKILLS_DB[k]).filter(Boolean);
        if (usable.length === 0) return null;

        if (level === 1) {
            return pickRandom(usable);
        }

        if (level === 2) {
            // ガッツが十分ならガッツダウンの大きい技、そうでなければ低コスト技
            const guts = aiUnit.guts || 50;
            if (guts >= 60) {
                return usable.reduce((a, b) => (b.force > a.force ? b : a));
            }
            return usable.reduce((a, b) => (b.gutsDown > a.gutsDown ? b : a));
        }

        if (level === 3) {
            // 相手の弱点（ちから型かかしこさ型か）を突く
            const targetStats = targetUnit.stats;
            const targetIsPowWeak = targetStats.def < targetStats.int * 0.9; // 丈夫さが低いなら物理が刺さる
            const preferred = usable.filter(sk => (targetIsPowWeak ? sk.type === 'pow' : sk.type !== 'pow'));
            const pool = preferred.length > 0 ? preferred : usable;
            // 高威力かつそこそこ命中する技を優先
            return pool.reduce((a, b) => ((b.force * (b.hitRate / 100)) > (a.force * (a.hitRate / 100)) ? b : a));
        }

        // level 4: レベル3の判断に加え、状況が悪ければ交代を検討する（呼び出し側でshouldSwitchも参照する）
        const targetStats = targetUnit.stats;
        const targetIsPowWeak = targetStats.def < targetStats.int * 0.9;
        const preferred = usable.filter(sk => (targetIsPowWeak ? sk.type === 'pow' : sk.type !== 'pow'));
        const pool = preferred.length > 0 ? preferred : usable;
        return pool.reduce((a, b) => ((b.force * (b.hitRate / 100)) > (a.force * (a.hitRate / 100)) ? b : a));
    }

    // AIが現在の対面を不利と判断し、控えのモンスターに交代すべきかどうかを判定する（レベル4のみ）
    // aiParty: AI側の手持ち配列, activeIndex: 現在場に出ている個体のindex, playerActive: プレイヤーの場のモンスター
    function shouldAiSwitch(aiParty, activeIndex, playerActive, setNumber) {
        if (getAiLevel(setNumber) < 4) return -1;
        const active = aiParty[activeIndex];
        if (!active) return -1;

        // 自身のライフが半分以下、かつ相手の攻撃型に対して丈夫さが著しく劣る場合、交代を検討する
        const lifeRatio = active.stats.life / active.stats.maxLife;
        if (lifeRatio > 0.4) return -1;

        for (let i = 0; i < aiParty.length; i++) {
            if (i === activeIndex) continue;
            const candidate = aiParty[i];
            if (!candidate || candidate.stats.life <= 0) continue;
            // 現在よりも丈夫さ・ライフが優れている控えがいれば交代
            if (candidate.stats.def > active.stats.def && candidate.stats.life / candidate.stats.maxLife > 0.5) {
                return i;
            }
        }
        return -1;
    }

    const KinNejikiEngine = {
        TOTAL_SETS, WINS_PER_SET, PARTY_SIZE, OFFER_SIZE,
        getEquipmentTierForSet, rollRentalEquipment,
        createRentalMonsterInstance, createNejikiBossInstance, getEffectiveStats,
        generateSixMonsterOffer,
        createInitialState, startRun, selectParty,
        generateNextOpponent, tradeMonster, registerWin, registerLoss,
        getAiLevel, chooseAiSkill, shouldAiSwitch,
        pickRandom, pickN, randInt
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = KinNejikiEngine;
    } else {
        root.KinNejikiEngine = KinNejikiEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
