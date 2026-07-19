"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";

type Fingering = {
  thumb: boolean;
  register: boolean;
  aKey: boolean;
  holes: boolean[];
  name: string;
  tip: string;
};

type LessonNote = {
  id: string;
  written: string;
  sounding: string;
  solfege: string;
  beats: number;
  rhythm: string;
  frequency: number;
  staffOffset: number;
  fingering: Fingering;
};

const lessonNotes: LessonNote[] = [
  {
    id: "c4",
    written: "C4",
    sounding: "B♭3",
    solfege: "Do",
    beats: 1,
    rhythm: "四分音符",
    frequency: 233.08,
    staffOffset: -13,
    fingering: {
      thumb: true,
      register: false,
      aKey: false,
      holes: [true, true, true, false, false, false],
      name: "左手基本手型",
      tip: "左手拇指、食指、中指、无名指盖严音孔。",
    },
  },
  {
    id: "d4",
    written: "D4",
    sounding: "C4",
    solfege: "Re",
    beats: 1,
    rhythm: "四分音符",
    frequency: 261.63,
    staffOffset: -5,
    fingering: {
      thumb: true,
      register: false,
      aKey: false,
      holes: [true, true, false, false, false, false],
      name: "抬起左手无名指",
      tip: "拇指、左手食指与中指按住，手指保持自然弯曲。",
    },
  },
  {
    id: "e4",
    written: "E4",
    sounding: "D4",
    solfege: "Mi",
    beats: 1,
    rhythm: "四分音符",
    frequency: 293.66,
    staffOffset: 3,
    fingering: {
      thumb: true,
      register: false,
      aKey: false,
      holes: [true, false, false, false, false, false],
      name: "拇指与食指",
      tip: "只保留左手拇指和食指，抬起的手指不要离键太远。",
    },
  },
  {
    id: "f4",
    written: "F4",
    sounding: "E♭4",
    solfege: "Fa",
    beats: 1,
    rhythm: "四分音符",
    frequency: 311.13,
    staffOffset: 11,
    fingering: {
      thumb: true,
      register: false,
      aKey: false,
      holes: [false, false, false, false, false, false],
      name: "只按左手拇指",
      tip: "拇指盖住背面音孔，其他手指悬在原位。",
    },
  },
  {
    id: "g4",
    written: "G4",
    sounding: "F4",
    solfege: "Sol",
    beats: 2,
    rhythm: "二分音符",
    frequency: 349.23,
    staffOffset: 19,
    fingering: {
      thumb: false,
      register: false,
      aKey: false,
      holes: [false, false, false, false, false, false],
      name: "开放 G",
      tip: "所有音孔都打开，用稳定气流把这个长音吹满两拍。",
    },
  },
  {
    id: "a4",
    written: "A4",
    sounding: "G4",
    solfege: "La",
    beats: 1,
    rhythm: "四分音符",
    frequency: 392,
    staffOffset: 27,
    fingering: {
      thumb: false,
      register: false,
      aKey: true,
      holes: [false, false, false, false, false, false],
      name: "左手食指按 A 键",
      tip: "食指向内滚动轻按 A 键，不要用力夹住乐器。",
    },
  },
  {
    id: "g4-end",
    written: "G4",
    sounding: "F4",
    solfege: "Sol",
    beats: 1,
    rhythm: "四分音符",
    frequency: 349.23,
    staffOffset: 19,
    fingering: {
      thumb: false,
      register: false,
      aKey: false,
      holes: [false, false, false, false, false, false],
      name: "回到开放 G",
      tip: "手指全部抬起，保持口型与气流不变。",
    },
  },
];

const beatLabels = ["1", "2", "3", "4"];

export default function Home() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [countIn, setCountIn] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);

  const selectedNote = lessonNotes[selectedIndex];

  useEffect(() => {
    return () => {
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [uploadedUrl]);

  const acceptFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setHasAnalyzed(false);
    setSelectedIndex(0);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const analyzeScore = () => {
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setIsAnalyzing(false);
      setHasAnalyzed(true);
      setSelectedIndex(0);
    }, 1100);
  };

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const playTone = (frequency: number, duration = 0.8) => {
    const context = getAudioContext();
    void context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.045);
    master.gain.setValueAtTime(0.18, now + Math.max(0.06, duration - 0.12));
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    master.connect(context.destination);

    [
      { harmonic: 1, gain: 0.9 },
      { harmonic: 3, gain: 0.18 },
      { harmonic: 5, gain: 0.06 },
    ].forEach(({ harmonic, gain }) => {
      const oscillator = context.createOscillator();
      const voiceGain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * harmonic, now);
      voiceGain.gain.value = gain;
      oscillator.connect(voiceGain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.03);
    });
  };

  const playClick = (accent = false) => {
    const context = getAudioContext();
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "square";
    oscillator.frequency.value = accent ? 1180 : 860;
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.05);
  };

  const stopLesson = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setIsPlaying(false);
  };

  const playLesson = () => {
    if (isPlaying) {
      stopLesson();
      return;
    }

    setIsPlaying(true);
    const beatMs = 60000 / bpm;
    let cursor = countIn ? beatMs * 4 : 0;

    if (countIn) {
      beatLabels.forEach((_, index) => {
        timersRef.current.push(
          window.setTimeout(() => playClick(index === 0), index * beatMs),
        );
      });
    }

    lessonNotes.forEach((note, index) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setSelectedIndex(index);
          playTone(note.frequency, (note.beats * beatMs * 0.82) / 1000);
        }, cursor),
      );
      cursor += note.beats * beatMs;
    });

    timersRef.current.push(
      window.setTimeout(() => {
        setIsPlaying(false);
        timersRef.current = [];
      }, cursor + 120),
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="音乐助教首页">
          <span className="brand-mark" aria-hidden="true">
            <span>♩</span>
          </span>
          <span>
            <strong>音乐助教</strong>
            <small>CLARINET STUDIO</small>
          </span>
        </a>
        <nav className="top-nav" aria-label="主要导航">
          <a className="active" href="#workspace">识谱练习</a>
          <a href="#path">新手路径</a>
          <a href="#teacher-note">课堂提示</a>
        </nav>
        <button className="new-score" type="button" onClick={() => fileInputRef.current?.click()}>
          <span aria-hidden="true">＋</span> 新建谱面
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> 单簧管新手的第一位陪练</div>
          <h1>看懂一个音，<br /><em>吹对一个音。</em></h1>
          <p>
            拍下五线谱，把音符、节奏、指法和声音放到同一张学习卡里。
            老师讲得更直观，新手练得更有把握。
          </p>
          <div className="hero-meta" aria-label="教学特点">
            <span><b>01</b> 读谱</span>
            <i />
            <span><b>02</b> 对指</span>
            <i />
            <span><b>03</b> 听音</span>
          </div>
        </div>
        <div className="hero-quote" aria-label="今日课堂目标">
          <span className="quote-kicker">TODAY&apos;S NOTE</span>
          <strong>“慢一点，<br />先让每个音都站稳。”</strong>
          <div className="tempo-stamp">
            <span>建议速度</span>
            <b>♩ = 80</b>
          </div>
        </div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / SCORE LAB</span>
            <h2>从一张谱面开始</h2>
          </div>
          <div className="prototype-status">
            <span className="status-dot" /> 原型识别模式
            <small>照片可上传，当前先生成教学示例</small>
          </div>
        </div>

        <div className="lab-grid">
          <article className="score-panel panel">
            <div className="panel-title-row">
              <div>
                <span className="panel-number">A</span>
                <div><h3>谱面照片</h3><p>保持画面平整、光线均匀</p></div>
              </div>
              {fileName && <span className="file-chip">{fileName}</span>}
            </div>

            <div
              className={`score-dropzone ${isDragging ? "dragging" : ""} ${uploadedUrl ? "has-image" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {uploadedUrl ? (
                <Image
                  src={uploadedUrl}
                  alt="已上传的五线谱照片"
                  width={900}
                  height={600}
                  unoptimized
                />
              ) : (
                <div className="sample-sheet" aria-label="内置示例谱面">
                  <div className="sheet-title"><span>初学者练习 · 01</span><b>Andante</b></div>
                  <div className="staff">
                    <span className="clef" aria-hidden="true">𝄞</span>
                    <span className="time-signature">4<br />4</span>
                    {lessonNotes.map((note, index) => (
                      <span
                        className={`sheet-note ${selectedIndex === index ? "current" : ""}`}
                        style={{ "--note-y": `${note.staffOffset}px` } as React.CSSProperties}
                        key={note.id}
                      >
                        <i />
                        {note.beats === 2 && <em />}
                      </span>
                    ))}
                  </div>
                  <div className="sheet-footer"><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span><span>A</span><span>G</span></div>
                </div>
              )}

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                aria-label="上传五线谱照片"
              />
              <div className="dropzone-actions">
                <button type="button" className="outline-button" onClick={() => fileInputRef.current?.click()}>
                  <span aria-hidden="true">↥</span> {uploadedUrl ? "更换照片" : "上传谱面照片"}
                </button>
                <span>支持 JPG、PNG、WEBP</span>
              </div>
            </div>

            <button className="analyze-button" type="button" onClick={analyzeScore} disabled={isAnalyzing}>
              <span className="button-icon" aria-hidden="true">{isAnalyzing ? "···" : "◎"}</span>
              <span>
                <b>{isAnalyzing ? "正在整理谱面…" : uploadedUrl ? "分析这张谱面" : "使用示例进入课堂"}</b>
                <small>{uploadedUrl ? "当前版本将生成示例音符序列" : "C–D–E–F–G 基础练习"}</small>
              </span>
              <i aria-hidden="true">→</i>
            </button>

            {hasAnalyzed && (
              <div className="analysis-message" role="status">
                <span>✓</span>
                已生成 7 个示例音符。真实照片识谱服务将在下一阶段接入。
              </div>
            )}
          </article>

          <article className="fingering-panel panel">
            <div className="panel-title-row">
              <div>
                <span className="panel-number coral">B</span>
                <div><h3>当前音符</h3><p>降 B 调单簧管 · 谱面记音</p></div>
              </div>
              <button
                className="listen-small"
                type="button"
                onClick={() => playTone(selectedNote.frequency)}
                aria-label={`试听 ${selectedNote.written}`}
              >
                <span aria-hidden="true">▶</span> 试听
              </button>
            </div>

            <div className="note-summary">
              <div className="note-identity">
                <span className="solfege">{selectedNote.solfege}</span>
                <strong>{selectedNote.written.replace(/[0-9]/g, "")}</strong>
                <span className="octave">{selectedNote.written.match(/[0-9]/)?.[0]}</span>
              </div>
              <div className="note-facts">
                <div><span>实际听到</span><b>{selectedNote.sounding}</b></div>
                <div><span>时值</span><b>{selectedNote.beats} 拍 · {selectedNote.rhythm}</b></div>
              </div>
            </div>

            <div className="fingering-card">
              <div className="fingering-copy">
                <span className="mini-label">FINGERING / 指法</span>
                <h4>{selectedNote.fingering.name}</h4>
                <p>{selectedNote.fingering.tip}</p>
                <div className="finger-legend"><span><i className="closed" />按住</span><span><i />松开</span></div>
              </div>
              <div className="clarinet-diagram" aria-label={`${selectedNote.written} 单簧管指法图`}>
                <span className="bell-shape" />
                <span className={`side-key register ${selectedNote.fingering.register ? "pressed" : ""}`}><b>R</b></span>
                <span className={`side-key a-key ${selectedNote.fingering.aKey ? "pressed" : ""}`}><b>A</b></span>
                <span className={`thumb-hole ${selectedNote.fingering.thumb ? "pressed" : ""}`}><b>T</b></span>
                <div className="clarinet-body">
                  {selectedNote.fingering.holes.map((pressed, index) => (
                    <span className={`tone-hole ${pressed ? "pressed" : ""}`} key={index}>
                      <b>{index < 3 ? `L${index + 1}` : `R${index - 2}`}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="teacher-tip">
              <span aria-hidden="true">!</span>
              <p><b>老师提示</b> 橙色按键需要按住；音孔漏气是新手最常见的“发不响”原因。</p>
            </div>
          </article>
        </div>

        <article className="practice-panel panel">
          <div className="practice-header">
            <div>
              <span className="panel-number dark">C</span>
              <div><h3>逐拍练习</h3><p>点击任一音符，指法图与声音会同步切换</p></div>
            </div>
            <div className="practice-controls">
              <label className="count-toggle">
                <input type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} />
                <span /> 4 拍预备
              </label>
              <label className="tempo-control">
                <span>速度</span>
                <input
                  type="range"
                  min="60"
                  max="120"
                  step="2"
                  value={bpm}
                  onChange={(event) => setBpm(Number(event.target.value))}
                  aria-label="练习速度"
                />
                <b>{bpm} BPM</b>
              </label>
              <button className={`play-button ${isPlaying ? "playing" : ""}`} type="button" onClick={playLesson}>
                <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
                {isPlaying ? "停止" : "播放整段"}
              </button>
            </div>
          </div>

          <div className="note-timeline" role="list" aria-label="识别出的音符序列">
            {lessonNotes.map((note, index) => (
              <button
                type="button"
                role="listitem"
                className={`timeline-note ${selectedIndex === index ? "selected" : ""}`}
                key={note.id}
                onClick={() => { stopLesson(); setSelectedIndex(index); playTone(note.frequency); }}
                aria-current={selectedIndex === index ? "true" : undefined}
              >
                <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                <strong>{note.written.replace(/[0-9]/g, "")}</strong>
                <small>{note.solfege}</small>
                <span className="beat-bars" aria-label={`${note.beats} 拍`}>
                  {Array.from({ length: note.beats }).map((_, beat) => <i key={beat} />)}
                </span>
              </button>
            ))}
          </div>

          <div className="rhythm-guide">
            <span>一小节</span>
            <div>{beatLabels.map((beat) => <i key={beat}><b>{beat}</b></i>)}</div>
            <p>先跟着数字轻声数拍，再拿起乐器。</p>
          </div>
        </article>
      </section>

      <section className="learning-path" id="path">
        <div className="path-heading">
          <span className="section-index light">02 / FIRST LESSON</span>
          <h2>新手上手，不必一次学完所有事</h2>
          <p>每一次练习只推进一步，让眼睛、手指和耳朵慢慢建立联系。</p>
        </div>
        <div className="path-grid">
          <article><span>01</span><div className="path-icon">𝄞</div><h3>先认谱</h3><p>知道音符叫什么、落在哪一拍，不急着马上吹。</p><small>LOOK</small></article>
          <article className="featured"><span>02</span><div className="path-icon">●</div><h3>再对指</h3><p>跟着亮起的音孔慢慢落指，检查每个孔是否盖严。</p><small>TOUCH</small></article>
          <article><span>03</span><div className="path-icon">♪</div><h3>最后听</h3><p>听清目标音高，再用稳定气流把节奏完整吹出来。</p><small>LISTEN</small></article>
        </div>
      </section>

      <section className="teacher-note-section" id="teacher-note">
        <div className="teacher-note-card">
          <span className="section-index">03 / TEACHER&apos;S NOTE</span>
          <blockquote>“对新手来说，节奏稳定比速度更重要，<br />音孔盖严比吹得响更重要。”</blockquote>
          <div className="note-signature"><span /> 音乐助教 · 第一课</div>
        </div>
        <div className="next-up">
          <span>NEXT</span>
          <h3>下一步可以继续完善</h3>
          <ul>
            <li>接入真实五线谱图像识别</li>
            <li>补充完整单簧管音域指法库</li>
            <li>加入跟吹录音与音准判断</li>
          </ul>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark" aria-hidden="true"><span>♩</span></span>
          <span><strong>音乐助教</strong><small>CLARINET STUDIO</small></span>
        </a>
        <p>让每一位单簧管新手，都能看得懂、按得对、听得见。</p>
        <span>教学原型 · 2026</span>
      </footer>
    </main>
  );
}
