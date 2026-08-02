// =====================================================
// audio.js
// BGM / SE 管理モジュール。
//
// ★このファイルは、BGM再生エンジン（特に実音声ファイルの再生・停止まわり）を
// 一から設計し直したものです。以前の実装は「合成BGM用の仕組み」に後から
// 「ファイル再生用の仕組み」を継ぎ足す形で拡張していたため、両者の状態管理が
// ズレて競合し、
//   ・iPhoneでファイル再生BGM(home.mp3)が鳴らないことがある
//   ・画面遷移を繰り返すと複数のBGMが重なって鳴り続ける
// といった不具合の温床になっていました。
//
// 新しい設計では、合成BGM／ファイル再生BGMの両方を「1つの世代カウンタ
// (bgmGeneration)」で一元管理します（詳細は下記のBGMエンジンのコメント参照）。
// これにより、どんなタイミングで画面遷移や音量変更が起きても、常に
// 「最後に要求された1曲だけ」が鳴ることを構造的に保証します。
//
// 効果音(SE)およびBGMの「作曲データ」（音符の並び）自体はこれまでの実装を
// そのまま引き継いでいます（不具合とは無関係な、既存の楽曲コンテンツのため）。
//
// ・BGMは「合成（Web Audio APIでその場で波形生成）」と「実音声ファイル
//   （mp3をfetch+decodeAudioDataで読み込み）」の2種類に対応し、BGM_FILE_SOURCES
//   に登録するだけで合成→実音声ファイルへ切り替えられます（下記参照）。
// ・音量は BGM/SE それぞれ 0〜100 の数値で個別に指定できる。初期値はどちらも 0（無音）。
// ・設定は localStorage に保存され、次回起動時も復元される。
// ・画面遷移（changeScreen）・戦闘演出（showEffect）・通知（showToast）を
//   ラップして自動的に適切な音を鳴らす。個々の画面のコードは変更不要。
//
// 他の game_*.js / masmon_*.js より後、かつそれらが定義する
// changeScreen / showEffect / showToast をラップするため
// index.html の <script> 読み込み順は「最後」に置くこと。
// =====================================================

const AudioManager = (() => {

    const STORAGE_KEY = 'mfload_audio_settings';
    const VOLUME_MIN = 0;
    const VOLUME_MAX = 100;
    // 音量100%時の実際のゲイン値（合成BGM用）。基準値からさらに1/3に引き下げ済み。
    const BGM_MAX_GAIN = 0.28 / 3 / 3;
    const SE_MAX_GAIN = 0.8;
    // 音量100%時の実際のゲイン値（実音声ファイルBGM用）。合成BGMと同じ基準で揃えてある。
    const FILE_BGM_MAX_GAIN = 1 / 3 / 3;
    // 旧バージョン（OFF/小/中/大の4段階）からの移行用：相当する0〜100の数値に変換する
    const LEGACY_LEVEL_TO_VOLUME = { off: 0, small: 30, mid: 55, large: 100 };

    let settings = { bgm: 0, se: 0 };

    // ユーザー操作やAudioContext生成を待たず、スクリプト読込み直後の可能な限り早い
    // タイミングでAudioSession種別を'ambient'にしておく（対応ブラウザのみ・安全に無視される）。
    // これがiOSのマナーモード（ミュートスイッチ）にBGMを従わせるための土台になる。
    try {
        if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
            navigator.audioSession.type = 'ambient';
        }
    } catch (e) { /* 無視 */ }

    let ctx = null;
    let masterBgmGain = null; // 合成BGM用マスターゲイン
    let masterSeGain = null;  // SE用マスターゲイン
    let fileMasterGain = null; // 実音声ファイルBGM用マスターゲイン
    let noiseBuffer = null;

    function clampVolume(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(n)));
    }

    // スライダー(0〜100)を、人の耳の感じ方（対数的）に合わせた指数カーブで実際の音量値へ
    // 変換する共通ヘルパー。単純な線形だと「0以外はどれもほぼ同じ小さい音」に聞こえて
    // しまうため、指数カーブにすることでスライダーのどの位置でも聞こえ方がはっきり変わる
    // ようにしている。v=0は必ず完全な無音(0)を返す。
    function perceptualVolumeValue(v, maxValue) {
        const cv = clampVolume(v);
        if (cv <= 0) return 0;
        const minRatio = 0.05;
        const t = cv / VOLUME_MAX;
        return maxValue * minRatio * Math.pow(1 / minRatio, t);
    }

    function bgmVolumeToGain(v) {
        return perceptualVolumeValue(v, BGM_MAX_GAIN);
    }

    function seVolumeToGain(v) {
        return perceptualVolumeValue(v, SE_MAX_GAIN);
    }

    function fileBgmVolumeToGain(v) {
        return perceptualVolumeValue(v, FILE_BGM_MAX_GAIN);
    }

    // ---------------------------------------------------
    // 設定の読み書き（LocalStorage）
    // ---------------------------------------------------
    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved) return;
            // 旧形式（'off'|'small'|'mid'|'large'）からの移行
            const bgmRaw = (typeof saved.bgm === 'string') ? LEGACY_LEVEL_TO_VOLUME[saved.bgm] : saved.bgm;
            const seRaw = (typeof saved.se === 'string') ? LEGACY_LEVEL_TO_VOLUME[saved.se] : saved.se;
            if (typeof bgmRaw === 'number') settings.bgm = clampVolume(bgmRaw);
            if (typeof seRaw === 'number') settings.se = clampVolume(seRaw);
        } catch (e) { /* 読み込み失敗時は初期値(0)のまま */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) { /* プライベートブラウズ等で失敗しても無視 */ }
    }

    // ---------------------------------------------------
    // AudioContext 初期化・再開
    // ---------------------------------------------------
    // ★マナーモード（iOSのミュートスイッチ）対応：
    // SafariのAudioSession API (Editor's Draft) では、audioSession.typeの既定値は
    // 'ambient'（＝ミュートスイッチに従って無音になる）だが、実際には音声を再生する
    // 処理が動くと、ブラウザ側の判断でセッション種別が暗黙に変わってしまうことがある。
    // これを明示的に'ambient'へ固定し直すことで、BGMがミュートスイッチ（マナーモード）
    // に従って鳴らなくなるようにする。非対応ブラウザでは何もしない（安全に無視される）。
    function applyAmbientAudioSession() {
        try {
            if (navigator && 'audioSession' in navigator) {
                navigator.audioSession.type = 'ambient';
            }
        } catch (e) { /* 非対応/失敗時は無視（この端末では従来通りの挙動になる） */ }
    }

    // iOS Safari（特にホーム画面追加＝PWAスタンドアロン起動時）では、実際のユーザー操作
    // （タップ／キー入力）より前にAudioContextを生成してしまうと、その後どれだけ
    // resume()やバッファ再生を試みてもそのContextインスタンス自体が二度と鳴らせない
    // ままになる、という既知の挙動がある。
    // 対策：最初の実ジェスチャー（pointerdown/keydown/click）を受け取るまでは
    // ensureContext()がAudioContextを生成しないようにガードする（曲名の記憶自体は
    // 行い、鳴らすのはジェスチャー後に回す）。
    let audioGestureReceived = false;

    function ensureContext() {
        if (ctx) return ctx;
        if (!audioGestureReceived) return null; // 実ジェスチャー前は生成しない（iOS対策）
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            ctx = new Ctor();
            applyAmbientAudioSession();
            masterBgmGain = ctx.createGain();
            masterBgmGain.gain.value = bgmVolumeToGain(settings.bgm);
            masterBgmGain.connect(ctx.destination);

            masterSeGain = ctx.createGain();
            masterSeGain.gain.value = seVolumeToGain(settings.se);
            masterSeGain.connect(ctx.destination);

            fileMasterGain = ctx.createGain();
            fileMasterGain.gain.value = fileBgmVolumeToGain(settings.bgm);
            fileMasterGain.connect(ctx.destination);
        } catch (e) {
            console.warn('[AudioManager] Web Audio API が利用できません:', e);
            ctx = null;
        }
        return ctx;
    }

    function resume() {
        const c = ensureContext();
        if (!c) return;
        if (c.state === 'suspended') {
            c.resume().then(() => {
                startBgmPlaybackIfReady();
            }).catch(() => {});
        } else if (c.state === 'running') {
            startBgmPlaybackIfReady();
        }
    }

    // iOS Safari（特にホーム画面追加＝PWAスタンドアロン起動時）は、resume()の
    // Promiseだけでは解除が間に合わないことがある。ユーザー操作の呼び出しスタックの
    // 中で実際に音声バッファの再生を1回開始しておくと、より確実にロック解除できる
    // ため、無音の極短バッファをタップ／キー入力の中で直接start()しておく。
    function unlockWithSilentBuffer() {
        const c = ctx;
        if (!c) return;
        try {
            const buf = c.createBuffer(1, 1, c.sampleRate);
            const src = c.createBufferSource();
            src.buffer = buf;
            src.connect(c.destination);
            src.start(0);
        } catch (e) { /* 無視：本命はresume()側 */ }
    }

    // iOS Safari（特にホーム画面追加＝PWAスタンドアロン起動）は、しばらく他画面に
    // 切り替えて（＝タスクキルはせず）長時間バックグラウンドに置かれると、既存の
    // AudioContextがresume()だけでは正常に戻らなくなることがある
    // （'interrupted'状態のまま固まる等）。その場合はContextを閉じて完全に
    // 作り直す必要がある。
    function recreateAudioContext() {
        try {
            if (ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') {
                ctx.close().catch(() => {});
            }
        } catch (e) { /* 無視 */ }
        ctx = null;
        masterBgmGain = null;
        masterSeGain = null;
        fileMasterGain = null;
        synthActiveNodes = [];
        synthTimerId = null;
        fileBgmSourceNode = null;
        return ensureContext(); // audioGestureReceivedは既にtrueなので生成される
    }

    // ---------------------------------------------------
    // バックグラウンド復帰後の保険：フォアグラウンドに戻った直後の自動resume()だけでは
    // 復帰しきらない端末向けに、復帰後の「次の実タップ」で確実に立て直す。
    // ---------------------------------------------------
    let foregroundRecoveryArmed = false;
    function armForegroundRecovery() {
        if (foregroundRecoveryArmed) return;
        foregroundRecoveryArmed = true;
        const recover = () => {
            if (!ctx || ctx.state !== 'running') {
                recreateAudioContext();
            }
            unlockWithSilentBuffer();
            resume();
            if (ctx && ctx.state === 'running') {
                foregroundRecoveryArmed = false;
                document.removeEventListener('pointerdown', recover, true);
                document.removeEventListener('click', recover, true);
                document.removeEventListener('keydown', recover, true);
            }
            // まだ 'running' になっていない場合はリスナーを残し、次のタップで再試行する
        };
        document.addEventListener('pointerdown', recover, true);
        document.addEventListener('click', recover, true);
        document.addEventListener('keydown', recover, true);
    }

    // 初回のユーザー操作でAudioContextのロックを解除する（ブラウザの自動再生制限対策）。
    // 実際に ctx.state === 'running' になったことを確認できるまではリスナーを解除せず、
    // 以後のタップ・キー入力のたびに何度でも解除を再試行する。
    function installUnlockListener() {
        const unlock = () => {
            audioGestureReceived = true; // これでensureContext()が実際に生成を行えるようになる
            ensureContext();
            unlockWithSilentBuffer();
            resume(); // ← 現在鳴らすべき曲（合成／ファイルいずれも）はここから一元的に開始される
            applyAmbientAudioSession(); // ジェスチャーの度に、セッション種別が変わっていないか念押しする
            if (ctx && ctx.state === 'running') {
                document.removeEventListener('pointerdown', unlock, true);
                document.removeEventListener('click', unlock, true);
                document.removeEventListener('keydown', unlock, true);
            }
            // まだ 'running' になっていない場合はリスナーを残し、次のタップで再試行する
        };
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('click', unlock, true);
        document.addEventListener('keydown', unlock, true);
    }

    // ---------------------------------------------------
    // 音名 → 周波数
    // ---------------------------------------------------
    const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    function noteFreq(note) {
        if (!note) return null;
        const m = /^([A-G]#?)(\d)$/.exec(note);
        if (!m) return null;
        const semitoneFromA4 = (parseInt(m[2], 10) - 4) * 12 + (NOTE_INDEX[m[1]] - NOTE_INDEX['A']);
        return 440 * Math.pow(2, semitoneFromA4 / 12);
    }

    // ---------------------------------------------------
    // 単音の合成・再生
    // ---------------------------------------------------
    function tone({ freq, freqEnd = null, duration = 0.15, type = 'square', when = 0, volume = 1, gainNode }) {
        const c = ensureContext();
        if (!c || !freq) return;
        const osc = c.createOscillator();
        osc.type = type;
        const startAt = c.currentTime + when;
        osc.frequency.setValueAtTime(freq, startAt);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startAt + duration);
        }
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.linearRampToValueAtTime(volume, startAt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(g);
        g.connect(gainNode);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.03);
        return { osc, gain: g };
    }

    function getNoiseBuffer() {
        const c = ensureContext();
        if (!c) return null;
        if (noiseBuffer) return noiseBuffer;
        const len = c.sampleRate * 0.5;
        noiseBuffer = c.createBuffer(1, len, c.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return noiseBuffer;
    }

    function noiseBurst({ duration = 0.12, when = 0, volume = 1, filterFreq = 1200, gainNode }) {
        const c = ensureContext();
        const buf = getNoiseBuffer();
        if (!c || !buf) return null;
        const src = c.createBufferSource();
        src.buffer = buf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const g = c.createGain();
        const startAt = c.currentTime + when;
        g.gain.setValueAtTime(volume, startAt);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        src.connect(filter);
        filter.connect(g);
        g.connect(gainNode);
        src.start(startAt);
        src.stop(startAt + duration + 0.03);
        return { osc: src, gain: g };
    }
    // ---------------------------------------------------
    // SE（効果音）定義
    // ---------------------------------------------------
    const SE_DEFS = {
        click: () => tone({ freq: 720, duration: 0.05, type: 'square', volume: 0.5, gainNode: masterSeGain }),
        decide: () => {
            tone({ freq: 523, duration: 0.07, type: 'square', volume: 0.5, gainNode: masterSeGain });
            tone({ freq: 784, duration: 0.09, type: 'square', when: 0.06, volume: 0.5, gainNode: masterSeGain });
        },
        cancel: () => {
            tone({ freq: 392, duration: 0.09, type: 'triangle', volume: 0.45, gainNode: masterSeGain });
            tone({ freq: 294, duration: 0.1, type: 'triangle', when: 0.06, volume: 0.4, gainNode: masterSeGain });
        },
        hit: () => {
            noiseBurst({ duration: 0.09, volume: 0.55, filterFreq: 1800, gainNode: masterSeGain });
            tone({ freq: 180, freqEnd: 90, duration: 0.1, type: 'square', volume: 0.5, gainNode: masterSeGain });
        },
        critical: () => {
            noiseBurst({ duration: 0.1, volume: 0.7, filterFreq: 2600, gainNode: masterSeGain });
            tone({ freq: 220, freqEnd: 70, duration: 0.14, type: 'sawtooth', volume: 0.6, gainNode: masterSeGain });
            tone({ freq: 880, duration: 0.08, type: 'square', when: 0.08, volume: 0.4, gainNode: masterSeGain });
        },
        miss: () => tone({ freq: 500, freqEnd: 150, duration: 0.22, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
        defend: () => tone({ freq: 150, freqEnd: 100, duration: 0.18, type: 'triangle', volume: 0.55, gainNode: masterSeGain }),
        heal: () => {
            ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.16, type: 'triangle', when: i * 0.07, volume: 0.4, gainNode: masterSeGain });
            });
        },
        buff: () => {
            ['C5', 'F5', 'A5'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.12, type: 'square', when: i * 0.05, volume: 0.35, gainNode: masterSeGain });
            });
        },
        debuff: () => {
            ['A4', 'F4', 'D4'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.14, type: 'sawtooth', when: i * 0.06, volume: 0.35, gainNode: masterSeGain });
            });
        },
        status: () => tone({ freq: 300, freqEnd: 600, duration: 0.3, type: 'sine', volume: 0.3, gainNode: masterSeGain }),
        win: () => {
            ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.18, type: 'square', when: i * 0.11, volume: 0.5, gainNode: masterSeGain });
            });
        },
        lose: () => {
            ['A4', 'G4', 'F4', 'D4'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.28, type: 'triangle', when: i * 0.16, volume: 0.4, gainNode: masterSeGain });
            });
        },
        item: () => {
            tone({ freq: noteFreq('E6'), duration: 0.06, type: 'square', volume: 0.4, gainNode: masterSeGain });
            tone({ freq: noteFreq('B6'), duration: 0.14, type: 'square', when: 0.06, volume: 0.4, gainNode: masterSeGain });
        },
        notify: () => tone({ freq: 660, duration: 0.09, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
        error: () => {
            tone({ freq: 220, duration: 0.14, type: 'sawtooth', volume: 0.4, gainNode: masterSeGain });
            tone({ freq: 165, duration: 0.18, type: 'sawtooth', when: 0.1, volume: 0.4, gainNode: masterSeGain });
        },
        toggle: () => tone({ freq: 900, duration: 0.05, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
        // --- 祈りの神殿（ガチャ）専用SE ---
        gacha_place: () => {
            // 円盤石を台座に置いた瞬間：低い着地音＋小さな煌めき
            tone({ freq: 180, freqEnd: 90, duration: 0.18, type: 'sine', volume: 0.5, gainNode: masterSeGain });
            tone({ freq: noteFreq('A5'), duration: 0.12, type: 'triangle', when: 0.06, volume: 0.3, gainNode: masterSeGain });
        },
        gacha_spin_start: () => {
            // 回転が始まる瞬間の立ち上がるような風切り音
            tone({ freq: 220, freqEnd: 660, duration: 0.5, type: 'sawtooth', volume: 0.2, gainNode: masterSeGain });
        },
        gacha_flash: () => {
            // 通常（金色）フラッシュ：明るい短いアルペジオ
            ['C5', 'E5', 'G5'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.18, type: 'triangle', when: i * 0.08, volume: 0.4, gainNode: masterSeGain });
            });
        },
        gacha_flash_rare: () => {
            // 虹色フラッシュ（★3確定）：より高く長く伸びるファンファーレ＋煌めきノイズ
            ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.22, type: 'triangle', when: i * 0.07, volume: 0.45, gainNode: masterSeGain });
            });
            noiseBurst({ duration: 0.3, volume: 0.22, filterFreq: 6500, when: 0.1, gainNode: masterSeGain });
        },
    };

    function playSE(name) {
        if (settings.se === 0) return;
        const c = ensureContext();
        if (!c) return;
        resume();
        const fn = SE_DEFS[name];
        if (fn) fn();
    }
    // ---------------------------------------------------
    // BGM（ループ楽曲）定義：メロディ + ベースの2声チップチューン
    // 各音符は [音名 or null(休符), 拍数] の配列
    // ---------------------------------------------------
    const BGM_TRACKS = {
        title: {
            tempo: 100, leadType: 'triangle', bassType: 'sine',
            lead: [['C4',1],['E4',1],['G4',1],['C5',1],['B4',1],['G4',1],['E4',1],['D4',1],
                   ['C4',1],['F4',1],['A4',1],['C5',1],['G4',1],['E4',1],['D4',1],['C4',2]],
            bass: [['C3',2],['G3',2],['A3',2],['E3',2],['F3',2],['C3',2],['G3',2],['C3',2]],
        },
        adventure: {
            tempo: 118, leadType: 'triangle', bassType: 'sine',
            lead: [['E4',0.5],['G4',0.5],['A4',1],['G4',0.5],['E4',0.5],['D4',1],
                   ['E4',0.5],['G4',0.5],['C5',1],['B4',0.5],['G4',0.5],['A4',1],
                   [null,0.5],['E4',0.5],['D4',0.5],['C4',0.5],['D4',2]],
            bass: [['A3',2],['E3',2],['F3',2],['C3',2],['A3',2],['E3',2],['G3',1],['A3',1],['D3',2]],
        },
        battle: {
            // 疾走感のあるJRPG風バトル曲（完全新規オリジナル作曲）。
            // Dナチュラルマイナー・テンポ168のハイテンポ構成で、ガロップ気味の
            // ベースラインの上に、跳躍を多用したサビ（アルペジオ）を乗せることで
            // 緊迫感・高揚感を狙っている。「イントロ→ヴァース→サビ→ヴァース→サビ」の
            // 1周72拍構成で、サビの着地からイントロ冒頭へ自然にループする。
            tempo: 168, leadType: 'square', bassType: 'sawtooth',
            lead: [
                // --- イントロ (8拍)：主音と属音を交互に刻みながら駆け上がる ---
                ['D4',0.5],['D4',0.5],['F4',0.5],['D4',0.5],['A4',0.5],['D5',0.5],['C5',0.5],['A4',0.5],
                ['F4',0.5],['A4',0.5],['C5',0.5],['D5',0.5],['A4',0.5],['F4',0.5],['D4',0.5],['A4',0.5],
                // --- ヴァース (16拍)：下降シーケンスを軸にしたメロディ ---
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['F4',0.5],['G4',0.5],['A4',0.5],
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['D4',0.5],
                ['G4',0.5],['A4',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],
                ['F4',0.5],['G4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],[null,0.5],
                // --- サビ (16拍)：オクターブ跳躍のアルペジオで一気に盛り上げる ---
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['G5',0.5],['F5',0.5],['D5',0.5],
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['F4',0.5],['G4',0.5],['A4',0.5],
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['D4',0.5],
                ['G4',0.5],['A4',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],
                ['F4',0.5],['G4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['G5',0.5],['F5',0.5],['D5',0.5],
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],[null,0.5],
            ],
            bass: [
                // --- イントロ (8拍)：主音固定のガロップ刻み ---
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['G2',0.5],['G2',0.5],
                // --- ヴァース (16拍)：ルート-5度の往復 ---
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                ['A#2',0.5],['F3',0.5],['A#2',0.5],['F3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],['D3',0.5],
                ['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                // --- サビ (16拍)：8分刻みで畳みかける ---
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['C3',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                ['A#2',0.5],['F3',0.5],['A#2',0.5],['F3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],['D3',0.5],
                ['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['C3',0.5],[null,0.5],
            ],
            // --- ハーモニー（和音）レイヤー：Dm/Bb/F/C/Amのコードを4拍ごとに敷き、厚みを出す ---
            harmony: [
                // --- イントロ (8拍)：Dmを保持して土台を作る ---
                [['D3','F3','A3'],4],[['D3','F3','A3'],4],
                // --- ヴァース (16拍)：Dm→Bb→Dm→C のコード進行 ---
                [['D3','F3','A3'],4],[['A#2','D3','F3'],4],[['D3','F3','A3'],4],[['C3','E3','G3'],4],
                // --- サビ (16拍)：Bb→F→Dm→Am で少し開けた響きにする ---
                [['A#2','D3','F3'],4],[['F2','A2','C3'],4],[['D3','F3','A3'],4],[['A2','C3','E3'],4],
                // --- ヴァース (16拍・再) ---
                [['D3','F3','A3'],4],[['A#2','D3','F3'],4],[['D3','F3','A3'],4],[['C3','E3','G3'],4],
                // --- サビ (16拍・再) ---
                [['A#2','D3','F3'],4],[['F2','A2','C3'],4],[['D3','F3','A3'],4],[['A2','C3','E3'],4],
            ],
            // --- パーカッションレイヤー：合成ドラム（kick/snare/hat）で駆動感を強める ---
            perc: [
                // 4拍ごとに kick-hat-snare-hat を繰り返す、疾走感のあるドラムパターン (72拍 = 18セット)
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
            ],
        },
        // レジェンドブリーダー・コルト（3セット目ボス戦）専用BGM。
        // 低音を厚めにしたテンポ控えめの重厚な曲調で「ボス戦」感を強調する。
        boss1: {
            tempo: 108, leadType: 'sawtooth', bassType: 'square',
            lead: [
                // イントロ：低音域の付点リズムによる威圧的な入り (8拍)
                ['D4',0.75],[null,0.25],['D4',0.5],[null,0.5],['F4',0.75],[null,0.25],['E4',0.5],['D4',0.5],
                ['A4',0.75],[null,0.25],['G4',0.5],['D4',0.5],['A#4',1],['A4',1],
                // 展開：畳みかけるような8分刻み。トライトーン(G#)で不穏さを演出 (8拍)
                ['D4',0.5],['D4',0.5],['F4',0.5],['D4',0.5],['G#4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],
                ['D4',0.5],['D4',0.5],['C5',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],
                // 頂点：大きく間を取った一撃ずつの強打 (8拍)
                ['D5',1],[null,0.5],['C5',0.5],['A#4',1],[null,0.5],['A4',0.5],['D5',1.5],[null,0.5],['A4',1],['D4',1],
            ],
            bass: [
                ['D2',1],['D2',1],['A2',1],['D2',1],['F2',1],['F2',1],['C3',1],['D2',1],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['C3',0.5],['C3',0.5],['C3',0.5],
                ['D2',2],['A2',2],['A#2',2],['D2',2],
            ],
            // --- ハーモニー（和音）レイヤー：Dm→(G#を含む不協和)→Bbで重厚さと不穏さを補強 ---
            harmony: [
                // --- イントロ (8拍)：Dmを保持し重々しい入りを支える ---
                [['D3','F3','A3'],8],
                // --- 展開 (8拍)：G#を含む不協和な響きで不穏さを強調 ---
                [['D3','F3','G#3'],8],
                // --- 頂点 (8拍)：Bbへ移り、スペースを取った強打を下支えする ---
                [['A#2','D3','F3'],8],
            ],
            // --- パーカッションレイヤー：合成ドラム（kick/snare/hat）で「ボス戦」の踏みしめる重さを出す ---
            perc: [
                // イントロ (8拍)：主音のキックで重厚に踏みしめる
                ['kick',1],['kick',1],['kick',1],['kick',1],['kick',1],['kick',1],['kick',1],['kick',1],
                // 展開 (8拍)：8分刻みのキック+ハットで畳みかける
                ['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],['kick',0.5],['hat',0.5],
                // 頂点 (8拍)：間を取ったキック/スネアの強打
                ['kick',2],['snare',2],['kick',2],['snare',2],
            ],
        },
        // レジェンドブリーダー・コルト（7セット目・最終決戦）専用BGM（完全新規オリジナル作曲）。
        // Aハーモニックマイナー・テンポ176の疾走感あるドラマチックな構成で、
        // 「壮大なラスボス決戦」のムードを狙っている（特定の既存楽曲の引用・模倣ではない）。
        // ノコギリ波の鋭いリードと矩形波の力強いオクターブ刻みベースで畳みかけつつ、
        // サビでは跳躍の大きいアルペジオにより頂点の高揚感を演出する。
        // 「イントロ→ヴァース→サビ→ヴァース→サビ」の1周72拍構成で自然にループする。
        boss2: {
            tempo: 176, leadType: 'sawtooth', bassType: 'square',
            lead: [
                // --- イントロ (8拍)：主音のオクターブ連打から一気に駆け上がる ---
                ['A4',0.5],['A4',0.5],['A4',0.5],['A4',0.5],['E5',0.5],['E5',0.5],['E5',0.5],['E5',0.5],
                ['F5',0.5],['F5',0.5],['E5',0.5],['E5',0.5],['D5',0.5],['D5',0.5],['C5',0.5],['C5',0.5],
                // --- ヴァース (16拍)：ハーモニックマイナー特有の増2度(F-G#)を含む緊迫したメロディ ---
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],
                ['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],['D5',0.5],
                ['E5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],[null,0.5],
                // --- サビ (16拍)：オクターブ跳躍のアルペジオで一気に頂点へ ---
                ['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['C5',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],
                ['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],['D5',0.5],
                ['E5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['C5',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],[null,0.5],
            ],
            bass: [
                // --- イントロ (8拍)：主音固定のオクターブ刻み ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['E3',0.5],['E3',0.5],['E3',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['D2',0.5],['D2',0.5],['C2',0.5],['C2',0.5],
                // --- ヴァース (16拍)：ルート-5度のガロップ ---
                ['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['B2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['B2',0.5],[null,0.5],
                // --- サビ (16拍)：8分刻みで畳みかける ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['B2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['B2',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],[null,0.5],
            ],
            // --- ハーモニー（和音）レイヤー：Am/F/Dm/E(ハーモニックマイナーの導音を含む)で劇的さを補強 ---
            harmony: [
                // --- イントロ (8拍)：Amを保持して土台を作る ---
                [['A2','C3','E3'],4],[['A2','C3','E3'],4],
                // --- ヴァース (16拍)：Am→F→Dm→E のコード進行 ---
                [['A2','C3','E3'],4],[['F2','A2','C3'],4],[['D3','F3','A3'],4],[['E2','G#2','B2'],4],
                // --- サビ (16拍)：F→Dm→Am→E でハーモニックマイナー特有の劇的な響きに ---
                [['F2','A2','C3'],4],[['D3','F3','A3'],4],[['A2','C3','E3'],4],[['E2','G#2','B2'],4],
                // --- ヴァース (16拍・再) ---
                [['A2','C3','E3'],4],[['F2','A2','C3'],4],[['D3','F3','A3'],4],[['E2','G#2','B2'],4],
                // --- サビ (16拍・再) ---
                [['F2','A2','C3'],4],[['D3','F3','A3'],4],[['A2','C3','E3'],4],[['E2','G#2','B2'],4],
            ],
            // --- パーカッションレイヤー：battleより一段と攻撃的な合成ドラムで最終決戦の圧を出す ---
            perc: [
                // 4拍ごとに kick-kick-hat-snare-kick-hat-snare-hat を繰り返す、より攻撃的な疾走ドラム (72拍 = 18セット)
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
                ['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],['kick',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['kick',0.5],['hat',0.5],['snare',0.5],['hat',0.5],
            ],
        },
        victory: {
            tempo: 132, leadType: 'square', bassType: 'triangle',
            lead: [['C5',0.5],['C5',0.5],['C5',0.5],['G5',1.5],['E5',1.5],
                   ['F5',0.5],['F5',0.5],['F5',0.5],['C5',0.75],['D5',0.25],['E5',2]],
            bass: [['C3',1.5],['G2',1.5],['A2',1.5],['C3',1.5],['F2',1.5],['C3',1.5],['G2',1.5],['C3',1.5]],
        },
        defeat: {
            tempo: 70, leadType: 'triangle', bassType: 'sine',
            lead: [['A4',1.5],['G4',1],['F4',1.5],['E4',1],['D4',2],[null,1],
                   ['D4',1.5],['C4',1],['B3',1.5],['A3',1],['A3',2],[null,1]],
            bass: [['D3',2],['A2',2],['B2',2],['E2',2],['A2',2],['D2',2]],
        },
        // マイルーム（小屋）専用BGM（完全新規オリジナル作曲）。
        // Cメジャー・テンポ76のゆったりとした構成で、木漏れ日が差し込む小屋の中で
        // モンスターたちがくつろいでいるような、穏やかで温かい雰囲気を狙っている。
        // 打楽器は使わず、三角波の柔らかいリードとサイン波のベース、控えめな和音の
        // パッドだけで構成し、聞き疲れしない落ち着いたループにしている。
        myroom: {
            tempo: 76, leadType: 'triangle', bassType: 'sine',
            lead: [
                // --- フレーズA (16拍) ---
                ['C5',1],['E5',1],['G5',1],['E5',1],
                ['A4',1],['C5',1],['B4',1],[null,1],
                ['G4',1],['C5',1],['E5',1],['D5',1],
                ['C5',1],['B4',1],['C5',2],
                // --- フレーズB (16拍) ---
                ['C5',1],['E5',1],['G5',1],['E5',1],
                ['A4',1],['C5',1],['D5',1],[null,1],
                ['E5',1],['D5',1],['C5',1],['A4',1],
                ['G4',1],['E4',1],['C4',2],
            ],
            bass: [
                ['C3',2],['G3',2],['A3',2],['F3',2],
                ['C3',2],['G3',2],['G3',2],['C3',2],
                ['C3',2],['G3',2],['A3',2],['F3',2],
                ['C3',2],['G3',2],['C3',4],
            ],
            // --- ハーモニー（和音）レイヤー：C→G→Am→F の穏やかなコード進行で温かみを補強 ---
            harmony: [
                [['C4','E4','G4'],4],[['G3','B3','D4'],4],
                [['A3','C4','E4'],4],[['F3','A3','C4'],4],
                [['C4','E4','G4'],4],[['G3','B3','D4'],4],[['G3','B3','D4'],4],[['C4','E4','G4'],4],
            ],
            harmonyVolume: 0.1,
        },
        // 祈りの神殿（ガチャ）専用BGM（完全新規オリジナル作曲）。
        // Dマイナー・テンポ92の神秘的で少し緊張感のある構成。サイン波の澄んだベルのような
        // リードと三角波の低いベース、和音パッドのみで、打楽器は使わず静けさと期待感を演出する。
        gacha: {
            tempo: 92, leadType: 'sine', bassType: 'triangle',
            lead: [
                ['D5',2],['A4',2],['F5',2],['D5',2],
                ['E5',2],['C5',2],['D5',4],
                ['A4',2],['D5',2],['F5',2],['A5',2],
                ['G5',2],['E5',2],['D5',4],
            ],
            bass: [
                ['D3',4],['A2',4],['F2',4],['D3',4],
                ['D3',4],['A2',4],['F2',4],['D3',4],
            ],
            // --- ハーモニー（和音）レイヤー：Dm→Am→F→Dm で神秘的な響きを支える ---
            harmony: [
                [['D3','F3','A3'],8],[['A2','C3','E3'],8],
                [['F2','A2','C3'],8],[['D3','F3','A3'],8],
            ],
            harmonyVolume: 0.12,
        },
    };
    // --- BGM用の簡易ドラム1打分（kick/snare/hat）を合成する ---
    // ・kick : 低いサイン波のピッチ落ち（サブベース的などすん、という一撃）
    // ・snare: 中域を残したノイズバースト＋短い三角波のスナップ音
    // ・hat  : 高域だけを残した極短ノイズバースト
    function schedulePercHit(hitType, when, beatSec) {
        const nodes = [];
        if (hitType === 'kick') {
            const n = tone({ freq: 150, freqEnd: 45, duration: Math.min(0.16, beatSec * 0.9), type: 'sine', when, volume: 0.5, gainNode: masterBgmGain });
            if (n) nodes.push(n);
        } else if (hitType === 'snare') {
            const n1 = noiseBurst({ duration: Math.min(0.12, beatSec * 0.7), when, volume: 0.32, filterFreq: 2200, gainNode: masterBgmGain });
            if (n1) nodes.push(n1);
            const n2 = tone({ freq: 320, freqEnd: 180, duration: 0.06, type: 'triangle', when, volume: 0.22, gainNode: masterBgmGain });
            if (n2) nodes.push(n2);
        } else if (hitType === 'hat') {
            const n = noiseBurst({ duration: Math.min(0.045, beatSec * 0.4), when, volume: 0.14, filterFreq: 8500, gainNode: masterBgmGain });
            if (n) nodes.push(n);
        }
        return nodes;
    }

    function totalBeats(seq) {
        return seq.reduce((s, [, d]) => s + d, 0);
    }
    // ---------------------------------------------------
    // BGMエンジン（合成BGM／実音声ファイルBGM 共通の再生制御）
    // ---------------------------------------------------
    // 「現在再生を要求されている世代（generation）」を1つのカウンタで一元管理する。
    // playBGM()・stopBgm() を呼ぶたびにこのカウンタを+1し、既存の再生
    // （合成BGMのスケジュールタイマー・オシレーター、ファイル再生のAudioBufferSourceNode）を
    // 同期的に即座に停止してから、新しい再生を「今の世代番号」を持たせて開始する。
    // 合成BGMのループ予約（setTimeout）や、ファイルの fetch+decode といった
    // 非同期処理はすべて、自分が開始された時点の世代番号を覚えておき、実際に
    // 音を出す直前に「今の世代と一致しているか」を必ず確認する。
    // 一致していなければ何もしない（stale＝もう不要になった再生要求）。
    // これにより、画面遷移を素早く繰り返した場合でも、常に「最後に要求された
    // 1曲」だけが鳴り、複数の曲が重なって鳴り続けることがない
    // （以前の実装は、合成BGM側とファイル再生側で別々に状態を持っていたため、
    // 両者の停止漏れ・タイミングのズレが「複数のBGMが鳴り続ける」不具合の原因になっていた）。
    let bgmGeneration = 0;
    let currentTrackName = null;    // 現在「鳴らすべき」として記憶している曲名（音量0時も含めて記憶）
    let synthTimerId = null;        // 合成BGMの次ループ予約タイマー
    let synthActiveNodes = [];      // 合成BGMで現在スケジュール済みのosc/gainノード
    let fileBgmSourceNode = null;   // 実音声ファイルBGMの現在再生中のAudioBufferSourceNode
    let fileBgmFallbackEl = null;   // decodeAudioData失敗時などのフォールバック用<audio>要素
    const fileBgmBufferCache = {};  // { trackName: AudioBuffer } デコード済みキャッシュ（一度読めば再取得しない）
    const fileBgmLoadingCache = {}; // { trackName: Promise } 読み込み中Promise（同じ曲の多重fetch防止）

    // 実音声ファイルBGMの登録先。ここに 'トラック名: ファイルパス' を追加するだけで、
    // 該当トラックが合成BGMから実音声ファイル再生へ切り替わる。
    // （例）戦闘曲を実音声化する場合： battle: 'audio/battle.mp3',
    const BGM_FILE_SOURCES = {
        home: 'audio/home.mp3',
        dochu: 'audio/douchu.mp3',
        // 今後追加予定（ファイルが用意でき次第、以下のコメントを外すだけでよい）：
        // battle: 'audio/battle.mp3',
        // boss1: 'audio/boss1.mp3',
        // boss2: 'audio/boss2.mp3',
        // myroom: 'audio/myroom.mp3',
        // gacha: 'audio/gacha.mp3',
    };

    function fileTrackSrc(name) {
        return BGM_FILE_SOURCES[name] || null;
    }
    function isSynthTrack(name) {
        return !!BGM_TRACKS[name];
    }

    // 合成BGM・実音声ファイルBGMを問わず、現在鳴っている・鳴る予定のBGMを
    // 同期的に即座に止める。曲の切り替え・停止のたびに必ず最初に呼ぶことで、
    // 「前の曲が鳴ったまま次の曲が重なる」ことを構造的に防ぐ。
    function stopAllBgmPlayback() {
        if (synthTimerId) {
            clearTimeout(synthTimerId);
            synthTimerId = null;
        }
        stopAllSynthNodes();
        if (fileBgmSourceNode) {
            try { fileBgmSourceNode.stop(); } catch (e) { /* 既に停止済み等は無視 */ }
            try { fileBgmSourceNode.disconnect(); } catch (e) { /* 無視 */ }
            fileBgmSourceNode = null;
        }
        if (fileBgmFallbackEl) {
            try { fileBgmFallbackEl.pause(); fileBgmFallbackEl.currentTime = 0; } catch (e) { /* 無視 */ }
        }
        // ★保険：上記の個別ノード停止は「今どのノードが鳴っているか」の自前トラッキングに
        // 依存しているため、万が一何らかの理由でその追跡漏れ（例：想定外のタイミングで
        // 生成されたノードが変数に上書きされ、古い方の参照を失う等）が起きていても、
        // マスターゲインノード自体をここで作り直し、出力経路（destinationへの接続）を
        // 物理的に断ち切ってしまうことで、追跡漏れのノードも含めて確実に無音化する。
        // 「画面を移動しても前の場所のBGMが止まらない」不具合を構造的に防ぐための対策。
        if (ctx) {
            if (fileMasterGain) {
                try { fileMasterGain.disconnect(); } catch (e) { /* 無視 */ }
            }
            fileMasterGain = ctx.createGain();
            fileMasterGain.gain.value = fileBgmVolumeToGain(settings.bgm);
            fileMasterGain.connect(ctx.destination);

            if (masterBgmGain) {
                try { masterBgmGain.disconnect(); } catch (e) { /* 無視 */ }
            }
            masterBgmGain = ctx.createGain();
            masterBgmGain.gain.value = bgmVolumeToGain(settings.bgm);
            masterBgmGain.connect(ctx.destination);
        }
    }

    // 現在鳴っている・鳴る予定の合成BGM用ノードを即座に無音化して停止する。
    // tone() は1ループ分（曲によっては十数秒）の音符をまとめて未来の時刻に
    // スケジュールしてしまうため、setTimeout を止めるだけでは既にスケジュール
    // 済みの音がそのまま最後まで鳴り続けてしまう。各ノードを強制的にごく短い
    // フェードアウトの後に停止させることで、曲の切り替え時に即座に止められるようにする。
    function stopAllSynthNodes() {
        if (!synthActiveNodes.length) return;
        const nodes = synthActiveNodes;
        synthActiveNodes = [];
        const c = ctx;
        const now = c ? c.currentTime : 0;
        nodes.forEach(({ osc, gain }) => {
            try {
                if (c && gain) {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
                }
            } catch (e) { /* 無視 */ }
            try {
                osc.stop(c ? now + 0.04 : 0);
            } catch (e) { /* 既に停止済み等は無視 */ }
        });
    }

    function scheduleSynthLoop(trackName, gen) {
        if (gen !== bgmGeneration) return; // 世代が古い＝もう不要になった再生要求
        const track = BGM_TRACKS[trackName];
        const c = ensureContext();
        if (!track || !c || c.state !== 'running') return;

        const beatSec = 60 / track.tempo;
        const startAt = 0.06; // 発音開始までの僅かなマージン（when は "今から何秒後" の相対値）
        const scheduledNodes = [];

        let t = startAt;
        track.lead.forEach(([note, d]) => {
            const freq = noteFreq(note);
            if (freq) {
                const node = tone({ freq, duration: d * beatSec * 0.92, type: track.leadType, when: t, volume: 0.55, gainNode: masterBgmGain });
                if (node) scheduledNodes.push(node);
            }
            t += d * beatSec;
        });

        t = startAt;
        (track.bass || []).forEach(([note, d]) => {
            const freq = noteFreq(note);
            if (freq) {
                const node = tone({ freq, duration: d * beatSec * 0.92, type: track.bassType, when: t, volume: 0.4, gainNode: masterBgmGain });
                if (node) scheduledNodes.push(node);
            }
            t += d * beatSec;
        });

        // --- ハーモニー（和音）レイヤー：任意。コード（複数音同時）を薄く重ねて厚みを出す ---
        t = startAt;
        (track.harmony || []).forEach(([chord, d]) => {
            if (chord) {
                const notes = Array.isArray(chord) ? chord : [chord];
                notes.forEach((n) => {
                    const freq = noteFreq(n);
                    if (freq) {
                        const node = tone({ freq, duration: d * beatSec * 0.9, type: track.harmonyType || 'triangle', when: t, volume: track.harmonyVolume || 0.16, gainNode: masterBgmGain });
                        if (node) scheduledNodes.push(node);
                    }
                });
            }
            t += d * beatSec;
        });

        // --- パーカッションレイヤー：任意。'kick'/'snare'/'hat' の簡易ドラムパターン ---
        t = startAt;
        (track.perc || []).forEach(([hit, d]) => {
            if (hit) {
                schedulePercHit(hit, t, beatSec).forEach((node) => scheduledNodes.push(node));
            }
            t += d * beatSec;
        });

        synthActiveNodes = scheduledNodes;

        const loopMs = totalBeats(track.lead) * beatSec * 1000;
        synthTimerId = setTimeout(() => {
            if (gen !== bgmGeneration) return; // 途中で停止・曲変更されていたら止める
            // このsetTimeoutは壁時計（実時間）基準で動くため、タブ/アプリがバックグラウンドに
            // なっていても関係なく発火し続けてしまう。復帰時にAudioContextが実際にrunningか
            // どうかを直接確認することで、suspended中に何重にもスケジュールが積み重なって
            // 復帰時に音が重複したり消えたりする不具合を防ぐ。
            if (!ctx || ctx.state !== 'running') {
                synthTimerId = null; // ここでは何もしない。復帰時はresume()成功時のstartBgmPlaybackIfReadyが仕切り直す
                return;
            }
            scheduleSynthLoop(trackName, gen);
        }, Math.max(200, loopMs - 80));
    }

    // 実音声ファイルBGMのAudioBufferを読み込む（初回のみfetch+decode、以降はキャッシュを返す）
    function loadFileBgmBuffer(trackName, src, c) {
        if (fileBgmBufferCache[trackName]) return Promise.resolve(fileBgmBufferCache[trackName]);
        if (fileBgmLoadingCache[trackName]) return fileBgmLoadingCache[trackName];
        const p = fetch(src)
            .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then((data) => c.decodeAudioData(data))
            .then((buf) => {
                fileBgmBufferCache[trackName] = buf;
                delete fileBgmLoadingCache[trackName];
                return buf;
            })
            .catch((err) => {
                delete fileBgmLoadingCache[trackName];
                console.warn('[AudioManager] ' + src + ' の読み込み/デコードに失敗しました。<audio>要素でのフォールバック再生を試みます:', err);
                return null;
            });
        fileBgmLoadingCache[trackName] = p;
        return p;
    }

    // decodeAudioData失敗時のフォールバック：<audio>要素で直接再生する。
    // iOSでは.volumeがスクリプトから効かない制約があるが、完全な無音よりは望ましいため
    // 最後の手段として用意している（本命は上のAudioBuffer再生ルート）。
    function startFileBgmFallback(trackName, src, gen) {
        if (gen !== bgmGeneration) return;
        if (!fileBgmFallbackEl) fileBgmFallbackEl = new Audio();
        const el = fileBgmFallbackEl;
        el.loop = true;
        if (!el.src || !el.src.endsWith(src)) el.src = src;
        el.volume = 1;
        const p = el.play();
        if (p && typeof p.catch === 'function') {
            p.catch((err) => console.warn('[AudioManager] ' + src + ' のフォールバック再生にも失敗しました:', err));
        }
    }

    function startFileBgm(trackName, gen) {
        const src = fileTrackSrc(trackName);
        if (!src) return;
        const c = ensureContext();
        if (!c) return; // ジェスチャー未取得。resume()成功時にstartBgmPlaybackIfReadyが改めて拾う
        loadFileBgmBuffer(trackName, src, c).then((buffer) => {
            if (gen !== bgmGeneration) return; // 世代が古い＝もう不要になった再生要求
            if (!buffer) {
                startFileBgmFallback(trackName, src, gen);
                return;
            }
            if (!fileMasterGain) {
                fileMasterGain = c.createGain();
                fileMasterGain.connect(c.destination);
            }
            fileMasterGain.gain.value = fileBgmVolumeToGain(settings.bgm);
            const source = c.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(fileMasterGain);
            source.start(0);
            fileBgmSourceNode = source;
        });
    }

    function dispatchBgmTrack(trackName, gen) {
        if (fileTrackSrc(trackName)) {
            startFileBgm(trackName, gen);
        } else if (isSynthTrack(trackName)) {
            const c = ensureContext();
            if (!c || c.state !== 'running') return; // running化した瞬間にstartBgmPlaybackIfReadyが拾う
            scheduleSynthLoop(trackName, gen);
        }
    }

    // AudioContextが実際に「running」状態になった時、および画面が前面へ復帰した時に
    // 呼ばれる、BGM再生の唯一の再開口。「今、鳴っているべきなのに鳴っていない」場合にだけ
    // 現在の曲(currentTrackName)を今の世代番号で鳴らし直す。
    function startBgmPlaybackIfReady() {
        if (!ctx || ctx.state !== 'running') return;
        if (!currentTrackName || settings.bgm === 0) return;
        if (synthTimerId || fileBgmSourceNode) return; // 既に鳴っている
        dispatchBgmTrack(currentTrackName, bgmGeneration);
    }

    // trackName を「現在流すべき曲」として記憶し、直ちに鳴らし始める。
    // BGM音量が0のときは実際には鳴らさないが、次に音量を上げた時に自動再開できるよう
    // trackNameだけは記憶しておく。
    function playBGM(trackName) {
        if (currentTrackName === trackName) return; // 既に同じ曲を再生中（またはその予定）
        currentTrackName = trackName;
        bgmGeneration++;
        const myGen = bgmGeneration;
        stopAllBgmPlayback();
        if (!trackName) return; // 明示的な停止
        if (settings.bgm === 0) return; // 無音設定中は記憶だけして鳴らさない
        dispatchBgmTrack(trackName, myGen);
    }

    function stopBgm() {
        currentTrackName = null;
        bgmGeneration++;
        stopAllBgmPlayback();
    }

    function getCurrentTrack() {
        return currentTrackName;
    }

    // ---------------------------------------------------
    // 設定変更
    // ---------------------------------------------------
    function applyGainImmediately() {
        const c = ensureContext();
        if (masterBgmGain && c) masterBgmGain.gain.setTargetAtTime(bgmVolumeToGain(settings.bgm), c.currentTime, 0.05);
        if (masterSeGain && c) masterSeGain.gain.setTargetAtTime(seVolumeToGain(settings.se), c.currentTime, 0.05);
        if (fileMasterGain && c) fileMasterGain.gain.setTargetAtTime(fileBgmVolumeToGain(settings.bgm), c.currentTime, 0.05);
    }

    // volume: 0〜100の数値
    function setBgmVolume(volume) {
        const v = clampVolume(volume);
        const wasOff = settings.bgm === 0;
        settings.bgm = v;
        saveSettings();
        resume();
        applyGainImmediately();
        if (!currentTrackName) return;
        if (v === 0) {
            stopAllBgmPlayback();
            return;
        }
        if (wasOff) {
            // 無音→音ありに変わった瞬間。「今の曲」を新しい世代で鳴らし直す
            bgmGeneration++;
            const myGen = bgmGeneration;
            stopAllBgmPlayback();
            dispatchBgmTrack(currentTrackName, myGen);
        }
    }

    // volume: 0〜100の数値
    function setSeVolume(volume) {
        const v = clampVolume(volume);
        settings.se = v;
        saveSettings();
        resume();
        applyGainImmediately();
    }

    function getSettings() {
        return { ...settings };
    }

    // ---------------------------------------------------
    // 画面ID → BGMトラック名 の対応表
    // ---------------------------------------------------
    // 'dochu'：ガッツファクトリー／エンドレスモード／PvPを選択してから、
    //   実際のバトルが始まるまでの準備・選択画面で流れるBGM（douchu.mp3）。
    const SCREEN_BGM_MAP = {
        'screen-title': 'home',
        'screen-battle': 'battle',
        // --- PvP（マッチング〜対戦準備） ---
        'screen-masmon-realtime-keyword': 'dochu',
        'screen-masmon-realtime-waiting': 'dochu',
        'screen-masmon-realtime-matched': 'battle',
        'screen-masmon-battle-result': 'title',
        'screen-pvp-ranking': 'title',
        'screen-pvp-rental-select': 'dochu',
        'screen-pvp-preset-list': 'dochu',
        'screen-pvp-preset-editor': 'dochu',
        'screen-pvp-preset-monster-editor': 'dochu',
        // --- ガッツファクトリー（きんねじき） ---
        'screen-kinnejiki-title': 'dochu',
        'screen-kinnejiki-select': 'dochu',
        'screen-kinnejiki-swap': 'dochu',
        'screen-kinnejiki-encounter': 'dochu',
        'screen-kinnejiki-result': 'title',
        'screen-kinnejiki-ranking': 'title',
        // --- エンドレスモード ---
        'screen-endless-home': 'dochu',
        'screen-endless-team-builder': 'dochu',
        'screen-endless-select': 'dochu',
        // --- その他 ---
        'screen-myroom': 'myroom',
        'screen-gacha': 'gacha',
    };

    // 「screen-battle」表示時、現在ガッツファクトリー（きんねじき）のボス戦かどうかを見て
    // 通常戦闘曲('battle')かボス曲('boss1'/'boss2')かを振り分ける。
    // MASMON_BATTLE_STATE.kinNejiki は launchKinNejikiBattleEngine 内で
    // changeScreen('screen-battle') より前にセットされているため、ここで参照可能。
    // 注意：MASMON_BATTLE_STATEはmasmon_battle.js側でconst宣言されており、
    // （classicスクリプトではconst/letのトップレベル宣言はwindowのプロパティにならないため）
    // window.MASMON_BATTLE_STATE経由では参照できない。素の識別子として参照する。
    function resolveBattleTrack() {
        try {
            const state = (typeof MASMON_BATTLE_STATE !== 'undefined') ? MASMON_BATTLE_STATE : null;
            const kn = state && state.kinNejiki;
            if (kn && kn.isNejiki) {
                return kn.set >= 7 ? 'boss2' : 'boss1';
            }
        } catch (e) { /* 参照できない場合は通常戦闘曲にフォールバック */ }
        return 'battle';
    }

    function onScreenChange(screenId) {
        const track = SCREEN_BGM_MAP[screenId];
        if (!track) return;
        playBGM(track === 'battle' ? resolveBattleTrack() : track);
    }

    // ---------------------------------------------------
    // showEffect(text) のテキスト内容から対応するSEを自動再生
    // ---------------------------------------------------
    function handleBattleEffectText(text) {
        if (typeof text !== 'string') return;
        if (text.includes('CRITICAL')) playSE('critical');
        else if (text.includes('HIT') || text.includes('被弾')) playSE('hit');
        else if (text.includes('MISS') || text.includes('回避')) playSE('miss');
        else if (text.includes('WIN') || text.includes('VICTORY')) playSE('win');
        else if (text.includes('LOSE') || text.includes('DEFEAT')) playSE('lose');
        else if (text.includes('DEFENSE') || text.includes('NO ACTION')) playSE('defend');
        else if (text.includes('回復')) playSE('heal');
        else if (text.includes('UP') || text.includes('会心') || text.includes('威力')) playSE('buff');
        else if (text.includes('衰弱') || text.includes('混乱')) playSE('debuff');
        else if (text.includes('交代') || text.includes('チャージ')) playSE('status');
        else playSE('notify');
    }

    // ---------------------------------------------------
    // showToast(message) の内容から対応するSEを自動再生
    // ---------------------------------------------------
    function handleToastText(message) {
        if (typeof message !== 'string') return;
        if (/できません|エラー|失敗|見つかりません/.test(message)) playSE('error');
        else if (/手に入れた|獲得|入手|引き継ぎました|宿した/.test(message)) playSE('item');
        else playSE('notify');
    }
    loadSettings();
    installUnlockListener();

    // ---------------------------------------------------
    // タスク切り替え（タブ/アプリの表示・非表示）対策
    // ---------------------------------------------------
    // 非表示になった瞬間にBGMの再生（合成／ファイルいずれも）を完全に停止し、
    // 前面に戻った瞬間にAudioContextを再開した上で同じ曲を最初から鳴らし直す。
    // こうすることで「途切れた続きを無理に合わせる」処理を避け、重複・消失の
    // どちらも起こらないようにする。
    function handleVisibilityChange() {
        if (document.hidden) {
            stopAllBgmPlayback(); // currentTrackNameは保持したまま、鳴っている分だけ止める
        } else {
            resume();
            if (ctx && ctx.state === 'running') startBgmPlaybackIfReady();
            // suspended中はresume()の成功コールバック（startBgmPlaybackIfReady）が拾って開始する。
            // 長時間バックグラウンドの後は上記のresume()だけでは復帰しない端末があるため、
            // 保険として「復帰後の次の実タップ」でAudioContextを作り直す仕組みも有効化しておく。
            armForegroundRecovery();
        }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // iOS Safari等でbfcacheから復元された場合もvisibilitychangeが発火しないことがあるため保険で対応
    window.addEventListener('pageshow', () => { if (!document.hidden) handleVisibilityChange(); });
    window.addEventListener('focus', () => { if (!document.hidden) handleVisibilityChange(); });
    // 非表示になる側も同様に、visibilitychangeが取りこぼす端末があるための保険
    window.addEventListener('pagehide', () => { stopAllBgmPlayback(); });
    window.addEventListener('blur', () => { if (document.hidden) stopAllBgmPlayback(); });

    return {
        VOLUME_MIN,
        VOLUME_MAX,
        playBGM,
        playSE,
        onScreenChange,
        handleBattleEffectText,
        handleToastText,
        setBgmVolume,
        setSeVolume,
        getSettings,
        resume,
        stopBgm,
        getCurrentTrack,
    };
})();

// =====================================================
// 既存関数のラップ：画面遷移・戦闘演出・トースト通知に自動でサウンドを紐付ける
// （各 game_*.js / masmon_*.js 側のコードは一切変更不要）
// =====================================================
(function attachAudioHooks() {
    const originalChangeScreen = window.changeScreen;
    if (typeof originalChangeScreen === 'function') {
        window.changeScreen = function (screenId) {
            const ret = originalChangeScreen(screenId);
            AudioManager.onScreenChange(screenId);
            return ret;
        };
    }

    const originalShowEffect = window.showEffect;
    if (typeof originalShowEffect === 'function') {
        window.showEffect = function (text) {
            AudioManager.handleBattleEffectText(text);
            return originalShowEffect(text);
        };
    }

    const originalShowToast = window.showToast;
    if (typeof originalShowToast === 'function') {
        window.showToast = function (message) {
            AudioManager.handleToastText(message);
            return originalShowToast(message);
        };
    }
})();

// =====================================================
// 起動直後の初期画面（例: タイトル画面）に対応するBGMを鳴らす。
// index.html側でHTML読み込み時から直接 class="active" が付与されている
// 最初の画面は changeScreen() を一度も経由しないため、上のフック（attachAudioHooks）
// だけでは対応するBGMが一度も再生されない不具合があった。
// ここで現在アクティブな画面をDOMから直接検出し、明示的にBGMを鳴らす。
(function playInitialScreenBgm() {
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen) AudioManager.onScreenChange(activeScreen.id);
})();

// =====================================================
// 汎用UI操作音：button / onclick要素のクリックに軽いSEを付与
// （キャプチャフェーズで拾うため個々のボタンの実装変更は不要）
// =====================================================
document.addEventListener('click', function (e) {
    const target = e.target.closest('button, [onclick], input[type="radio"], input[type="checkbox"], select');
    if (!target) return;
    if (target.closest('#audio-settings-modal')) return; // 設定モーダル内は専用の音を鳴らすため除外
    AudioManager.playSE('click');
}, true);

// =====================================================
// 音声設定モーダルのUI制御
// =====================================================
function openAudioSettingsModal() {
    updateAudioSettingsUI();
    document.getElementById('audio-settings-modal').classList.remove('hidden');
}

function closeAudioSettingsModal() {
    document.getElementById('audio-settings-modal').classList.add('hidden');
}

// kind: 'bgm' | 'se'  /  value: 0〜100の数値（スライダーのinput/change両方から呼ばれる）
function setAudioVolume(kind, value) {
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (kind === 'bgm') {
        AudioManager.setBgmVolume(v);
    } else if (kind === 'se') {
        AudioManager.setSeVolume(v);
    }
    updateAudioSettingsUI();
}

// スライダーを指で離した（change）タイミングでのみ確認用のSEを鳴らす
// （input中に毎回鳴らすと連打音になってしまうため）
function confirmAudioVolume(kind, value) {
    setAudioVolume(kind, value);
    if (kind === 'se' && AudioManager.getSettings().se > 0) {
        AudioManager.playSE('toggle');
    }
}

function updateAudioSettingsUI() {
    const s = AudioManager.getSettings();

    const bgmSlider = document.getElementById('audio-slider-bgm');
    const bgmLabel = document.getElementById('audio-value-bgm');
    if (bgmSlider && document.activeElement !== bgmSlider) bgmSlider.value = s.bgm;
    if (bgmLabel) bgmLabel.textContent = s.bgm;

    const seSlider = document.getElementById('audio-slider-se');
    const seLabel = document.getElementById('audio-value-se');
    if (seSlider && document.activeElement !== seSlider) seSlider.value = s.se;
    if (seLabel) seLabel.textContent = s.se;
}

document.addEventListener('DOMContentLoaded', updateAudioSettingsUI);

// =====================================================
// 設定モーダル：タブ切り替え（「音量/SE調整」⇄「スマホサイズ選択」）
// =====================================================
function switchSettingsTab(tab) {
    const audioPanel = document.getElementById('settings-tab-audio');
    const displayPanel = document.getElementById('settings-tab-display');
    const audioBtn = document.getElementById('settings-tab-btn-audio');
    const displayBtn = document.getElementById('settings-tab-btn-display');
    const isAudio = tab === 'audio';

    if (audioPanel) audioPanel.classList.toggle('hidden', !isAudio);
    if (displayPanel) displayPanel.classList.toggle('hidden', isAudio);

    [[audioBtn, isAudio], [displayBtn, !isAudio]].forEach(([btn, active]) => {
        if (!btn) return;
        btn.classList.toggle('bg-amber-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('text-gray-400', !active);
    });

    if (tab === 'display') updateCompactUiModeButtons();
}

// =====================================================
// 表示モード（スマホサイズ選択）：iPhone SE等、画面の小さい端末向けの
// コンパクト表示モード。#game-container自体を実寸より大きくレイアウトさせた上で
// 縮小表示することで、固定pxのUIが小さい画面に収まりきらない問題を緩和する
// （具体的な倍率はstyles.cssの body.compact-ui-mode #game-container を参照）。
// 既定（標準）レイアウトは一切変更しないため、通常サイズの端末には影響しない。
// =====================================================
const COMPACT_UI_STORAGE_KEY = 'mfload_compact_ui_mode';

function setCompactUiMode(enabled) {
    document.body.classList.toggle('compact-ui-mode', !!enabled);
    try { localStorage.setItem(COMPACT_UI_STORAGE_KEY, enabled ? '1' : '0'); } catch (e) { /* 無視 */ }
    updateCompactUiModeButtons();
}

function updateCompactUiModeButtons() {
    const isCompact = document.body.classList.contains('compact-ui-mode');
    const normalBtn = document.getElementById('compact-mode-btn-normal');
    const compactBtn = document.getElementById('compact-mode-btn-compact');
    [[normalBtn, !isCompact], [compactBtn, isCompact]].forEach(([btn, active]) => {
        if (!btn) return;
        btn.classList.toggle('border-amber-500', active);
        btn.classList.toggle('bg-amber-950/40', active);
        btn.classList.toggle('border-gray-700', !active);
        btn.classList.toggle('text-gray-300', !active);
    });
}

// 起動時、保存済みの表示モードを即座に復元する（レイアウトのガタつきを防ぐため、
// 他のスクリプトの読み込みを待たずできるだけ早いタイミングで適用する）
(function restoreCompactUiModeOnBoot() {
    try {
        if (localStorage.getItem(COMPACT_UI_STORAGE_KEY) === '1') {
            document.body.classList.add('compact-ui-mode');
        }
    } catch (e) { /* 無視 */ }
})();
document.addEventListener('DOMContentLoaded', updateCompactUiModeButtons);
