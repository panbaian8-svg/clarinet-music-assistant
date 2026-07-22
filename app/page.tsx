"use client";

import Image from "next/image";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLessonNote,
  CLARINET_KEY_LABELS,
  CLARINET_RANGE,
  DEMO_LESSON,
  type ClarinetKeyId,
  type ClarinetRegister,
  type Fingering,
  type LessonNote,
  YAMAHA_FINGERING_SOURCE,
} from "./lib/clarinet";
import { recognizeScoreImage, type RecognitionResult } from "./lib/score-recognition";

const beatLabels = ["1", "2", "3", "4"];
const durationOptions = [
  { beats: 0.5, label: "八分音符 · ½ 拍" },
  { beats: 1, label: "四分音符 · 1 拍" },
  { beats: 2, label: "二分音符 · 2 拍" },
  { beats: 4, label: "全音符 · 4 拍" },
];
const keyOrder = Object.keys(CLARINET_KEY_LABELS) as ClarinetKeyId[];
const registerTabs: Array<"全部" | ClarinetRegister> = ["全部", "低音区", "喉音区", "中音区", "高音区"];

function noteHead(pitch: string) {
  return pitch.replace(/-?\d/g, "");
}

function noteOctave(pitch: string) {
  return pitch.match(/-?\d/)?.[0] ?? "";
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.82) return "高";
  if (confidence >= 0.66) return "中";
  return "待校对";
}

function ClarinetDiagram({ fingering, compact = false }: { fingering: Fingering; compact?: boolean }) {
  return (
    <div className={`clarinet-diagram ${compact ? "compact" : ""}`} aria-label={`${fingering.register}${fingering.name}指法图`}>
      <span className="mouthpiece-shape" aria-hidden="true" />
      <span className="clarinet-rail" aria-hidden="true" />
      <span className="bell-shape" aria-hidden="true" />
      {keyOrder.map((key) => {
        const pressed = fingering.keys.includes(key);
        return (
          <span
            className={`fingering-key key-${key} ${pressed ? "pressed" : ""}`}
            key={key}
            title={`${CLARINET_KEY_LABELS[key]}：${pressed ? "按下" : "松开"}`}
            aria-label={`${CLARINET_KEY_LABELS[key]}${pressed ? "按下" : "松开"}`}
          >
            <b>{key === "register" ? "R" : key === "thumb" ? "T" : ""}</b>
          </span>
        );
      })}
      <span className="diagram-hand-label left">左手</span>
      <span className="diagram-hand-label right">右手</span>
    </div>
  );
}

export default function Home() {
  const [lessonNotes, setLessonNotes] = useState<LessonNote[]>(DEMO_LESSON);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recognition, setRecognition] = useState<RecognitionResult | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [countIn, setCountIn] = useState(true);
  const [libraryPitch, setLibraryPitch] = useState("G4");
  const [libraryFilter, setLibraryFilter] = useState<"全部" | ClarinetRegister>("全部");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);

  const selectedNote = lessonNotes[selectedIndex] ?? lessonNotes[0] ?? DEMO_LESSON[0];
  const libraryEntry = CLARINET_RANGE.find((entry) => entry.value === libraryPitch) ?? CLARINET_RANGE[15];
  const libraryNote = buildLessonNote(libraryEntry.value, 1, { id: `library-${libraryEntry.value}`, source: "manual" });
  const filteredLibrary = useMemo(
    () => CLARINET_RANGE.filter((entry) => libraryFilter === "全部" || entry.register === libraryFilter),
    [libraryFilter],
  );

  useEffect(() => {
    return () => {
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [uploadedUrl]);

  const stopLesson = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setIsPlaying(false);
  };

  const acceptFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) {
      setAnalysisError("请选择 JPG、PNG 或 WEBP 图片。");
      return;
    }
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
    setUploadedUrl(URL.createObjectURL(file));
    setUploadedFile(file);
    setFileName(file.name);
    setRecognition(null);
    setAnalysisError("");
    setSelectedIndex(0);
    stopLesson();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const analyzeScore = async () => {
    setIsAnalyzing(true);
    setAnalysisError("");
    stopLesson();
    try {
      if (!uploadedFile) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        setLessonNotes(DEMO_LESSON);
        setRecognition(null);
      } else {
        const result = await recognizeScoreImage(uploadedFile);
        setRecognition(result);
        setLessonNotes(result.notes);
      }
      setSelectedIndex(0);
    } catch (error) {
      setRecognition(null);
      setAnalysisError(error instanceof Error ? error.message : "识谱失败，请更换照片后重试。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateSelectedPitch = (written: string) => {
    setLessonNotes((notes) =>
      notes.map((note, index) =>
        index === selectedIndex
          ? buildLessonNote(written, note.beats, {
              id: note.id,
              confidence: 1,
              source: "manual",
            })
          : note,
      ),
    );
  };

  const updateSelectedDuration = (beats: number) => {
    setLessonNotes((notes) =>
      notes.map((note, index) =>
        index === selectedIndex
          ? buildLessonNote(note.written, beats, { id: note.id, confidence: note.confidence, source: "manual" })
          : note,
      ),
    );
  };

  const removeSelectedNote = () => {
    if (lessonNotes.length <= 1) return;
    setLessonNotes((notes) => notes.filter((_, index) => index !== selectedIndex));
    setSelectedIndex((index) => Math.max(0, Math.min(index, lessonNotes.length - 2)));
  };

  const addNoteAfterSelected = () => {
    const note = buildLessonNote(selectedNote.written, 1, { source: "manual", confidence: 1 });
    setLessonNotes((notes) => [...notes.slice(0, selectedIndex + 1), note, ...notes.slice(selectedIndex + 1)]);
    setSelectedIndex(selectedIndex + 1);
  };

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  };

  const playTone = (frequency: number, duration = 0.8) => {
    const context = getAudioContext();
    void context.resume();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.17, now + 0.045);
    master.gain.setValueAtTime(0.17, now + Math.max(0.06, duration - 0.12));
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
        timersRef.current.push(window.setTimeout(() => playClick(index === 0), index * beatMs));
      });
    }
    lessonNotes.forEach((note, index) => {
      timersRef.current.push(
        window.setTimeout(() => {
          setSelectedIndex(index);
          playTone(note.frequency, Math.max(0.22, (note.beats * beatMs * 0.82) / 1000));
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

  const imagePreview = recognition?.previewDataUrl ?? uploadedUrl;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="音乐助教首页">
          <span className="brand-mark" aria-hidden="true"><span>♩</span></span>
          <span><strong>音乐助教</strong><small>CLARINET STUDIO</small></span>
        </a>
        <nav className="top-nav" aria-label="主要导航">
          <a className="active" href="#workspace">智能识谱</a>
          <a href="#fingering-library">完整指法库</a>
          <a href="#path">新手路径</a>
        </nav>
        <button className="new-score" type="button" onClick={() => fileInputRef.current?.click()}>
          <span aria-hidden="true">＋</span> 新建谱面
        </button>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span /> 单簧管新手的第一位陪练</div>
          <h1>照片变练习，<br /><em>每个音都有答案。</em></h1>
          <p>识别五线谱中的音高与节奏，逐音核对单簧管指法，再听见降 B 调单簧管实际发出的声音。</p>
          <div className="hero-meta" aria-label="教学特点">
            <span><b>01</b> 真识谱</span><i /><span><b>02</b> 42 音指法</span><i /><span><b>03</b> 逐拍试听</span>
          </div>
        </div>
        <div className="hero-quote" aria-label="本次升级">
          <span className="quote-kicker">VERSION 02 · SCORE TO SOUND</span>
          <strong>“先识别，<br />再校对，最后开吹。”</strong>
          <div className="tempo-stamp"><span>覆盖书写音域</span><b>E3 — A6</b></div>
        </div>
      </section>

      <section className="workspace" id="workspace">
        <div className="section-heading">
          <div><span className="section-index">01 / SCORE LAB</span><h2>从一张谱面开始</h2></div>
          <div className="prototype-status ready">
            <span className="status-dot" /> 本地识谱已启用
            <small>照片只在你的浏览器中处理，不会上传</small>
          </div>
        </div>

        <div className="lab-grid">
          <article className="score-panel panel">
            <div className="panel-title-row">
              <div><span className="panel-number">A</span><div><h3>谱面照片</h3><p>适合清晰、单声部、高音谱号的印刷谱</p></div></div>
              {fileName && <span className="file-chip">{fileName}</span>}
            </div>

            <div
              className={`score-dropzone ${isDragging ? "dragging" : ""} ${imagePreview ? "has-image" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {imagePreview ? (
                <Image src={imagePreview} alt={recognition ? "带有音符识别框的五线谱" : "已上传的五线谱照片"} width={1200} height={800} unoptimized />
              ) : (
                <div className="sample-sheet" aria-label="内置示例谱面">
                  <div className="sheet-title"><span>初学者练习 · 01</span><b>Andante</b></div>
                  <div className="staff">
                    <span className="clef" aria-hidden="true">𝄞</span><span className="time-signature">4<br />4</span>
                    {DEMO_LESSON.map((note, index) => (
                      <span className={`sheet-note ${selectedIndex === index ? "current" : ""}`} style={{ "--note-y": `${note.staffOffset}px` } as React.CSSProperties} key={note.id}>
                        <i />{note.beats === 2 && <em />}
                      </span>
                    ))}
                  </div>
                  <div className="sheet-footer"><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span><span>A</span><span>G</span></div>
                </div>
              )}
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} aria-label="上传五线谱照片" />
              <div className="dropzone-actions">
                <button type="button" className="outline-button" onClick={() => fileInputRef.current?.click()}><span aria-hidden="true">↥</span>{uploadedUrl ? "更换照片" : "上传谱面照片"}</button>
                <span>支持 JPG、PNG、WEBP</span>
              </div>
            </div>

            <div className="capture-checklist" aria-label="拍摄建议">
              <span><i>1</i> 正对谱面</span><span><i>2</i> 裁掉桌面</span><span><i>3</i> 避免阴影</span>
            </div>

            <button className="analyze-button" type="button" onClick={analyzeScore} disabled={isAnalyzing}>
              <span className="button-icon" aria-hidden="true">{isAnalyzing ? "···" : "◎"}</span>
              <span>
                <b>{isAnalyzing ? "正在校正谱线并寻找音符…" : uploadedFile ? "开始识别这张谱面" : "使用示例进入课堂"}</b>
                <small>{uploadedFile ? "识别音高、升降号与基础时值" : "C–D–E–F–G 基础练习"}</small>
              </span>
              <i aria-hidden="true">→</i>
            </button>

            {recognition && (
              <div className="recognition-report" role="status">
                <div><span className="report-check">✓</span><b>识别完成</b><small>{recognition.staffCount} 组五线谱 · {recognition.notes.length} 个音符</small></div>
                <div className="confidence-meter"><span style={{ width: `${recognition.confidence * 100}%` }} /><b>{Math.round(recognition.confidence * 100)}%</b></div>
                <p>{recognition.warning} 已自动校正 {Math.abs(recognition.deskewDegrees).toFixed(1)}° 倾斜。</p>
              </div>
            )}
            {analysisError && <div className="analysis-error" role="alert"><span>!</span>{analysisError}</div>}
          </article>

          <article className="fingering-panel panel">
            <div className="panel-title-row">
              <div><span className="panel-number coral">B</span><div><h3>当前音符</h3><p>降 B 调 Boehm 制式 · 谱面记音</p></div></div>
              <button className="listen-small" type="button" onClick={() => playTone(selectedNote.frequency)} aria-label={`试听 ${selectedNote.written}`}><span aria-hidden="true">▶</span>试听</button>
            </div>

            <div className="note-summary">
              <div className="note-identity"><span className="solfege">{selectedNote.solfege}</span><strong>{noteHead(selectedNote.written)}</strong><span className="octave">{noteOctave(selectedNote.written)}</span></div>
              <div className="note-facts">
                <div><span>实际听到</span><b>{selectedNote.sounding}</b></div>
                <div><span>时值</span><b>{selectedNote.beats} 拍 · {selectedNote.rhythm}</b></div>
              </div>
            </div>

            <div className="fingering-card">
              <div className="fingering-copy">
                <span className="mini-label">FINGERING / {selectedNote.fingering.register}</span>
                <h4>{selectedNote.fingering.name}</h4>
                <p>{selectedNote.fingering.tip}</p>
                <div className="finger-legend"><span><i className="closed" />按下／联动闭合</span><span><i />松开</span></div>
                <a className="library-jump" href="#fingering-library">查看完整 42 音指法库 →</a>
              </div>
              <ClarinetDiagram fingering={selectedNote.fingering} />
            </div>

            <div className="teacher-tip"><span aria-hidden="true">!</span><p><b>老师提示</b> 高音区除了指法，还依赖正确口型和气流；网站给出的是标准起始指法。</p></div>
          </article>
        </div>

        <article className="practice-panel panel">
          <div className="practice-header">
            <div><span className="panel-number dark">C</span><div><h3>识别结果与逐拍练习</h3><p>先校对音名与时值，再播放整段</p></div></div>
            <div className="practice-controls">
              <label className="count-toggle"><input type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} /><span />4 拍预备</label>
              <label className="tempo-control"><span>速度</span><input type="range" min="50" max="140" step="2" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} aria-label="练习速度" /><b>{bpm} BPM</b></label>
              <button className={`play-button ${isPlaying ? "playing" : ""}`} type="button" onClick={playLesson}><span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>{isPlaying ? "停止" : "播放整段"}</button>
            </div>
          </div>

          <div className="note-timeline" role="list" aria-label="识别出的音符序列">
            {lessonNotes.map((note, index) => (
              <button type="button" role="listitem" className={`timeline-note ${selectedIndex === index ? "selected" : ""}`} key={note.id} onClick={() => { stopLesson(); setSelectedIndex(index); playTone(note.frequency); }} aria-current={selectedIndex === index ? "true" : undefined}>
                <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                <span className={`note-confidence level-${confidenceLabel(note.confidence)}`}>{confidenceLabel(note.confidence)}</span>
                <strong>{noteHead(note.written)}</strong><small>{noteOctave(note.written)} · {note.beats} 拍</small>
                <span className={`beat-bars beats-${String(note.beats).replace(".", "-")}`} aria-label={`${note.beats} 拍`}><i /><i /><i /><i /></span>
              </button>
            ))}
          </div>

          <div className="note-editor" aria-label="校对当前音符">
            <div><span className="editor-kicker">校对第 {selectedIndex + 1} 个音</span><b>老师确认后再练习</b></div>
            <label><span>谱面音</span><select value={CLARINET_RANGE.find((entry) => entry.fingering.sourceIndex === selectedNote.fingering.sourceIndex)?.value ?? selectedNote.written} onChange={(event) => updateSelectedPitch(event.target.value)}>{CLARINET_RANGE.map((entry) => <option value={entry.value} key={entry.value}>{entry.label}</option>)}</select></label>
            <label><span>时值</span><select value={selectedNote.beats} onChange={(event) => updateSelectedDuration(Number(event.target.value))}>{durationOptions.map((option) => <option value={option.beats} key={option.beats}>{option.label}</option>)}</select></label>
            <button type="button" className="edit-action add" onClick={addNoteAfterSelected}>＋ 补一个音</button>
            <button type="button" className="edit-action remove" onClick={removeSelectedNote} disabled={lessonNotes.length <= 1}>删除</button>
          </div>

          <div className="rhythm-guide"><span>四拍脉冲</span><div>{beatLabels.map((beat) => <i key={beat}><b>{beat}</b></i>)}</div><p>八分音符会占半拍；播放时橙色音符会自动前进。</p></div>
        </article>
      </section>

      <section className="fingering-library-section" id="fingering-library">
        <div className="library-heading">
          <div><span className="section-index light">02 / COMPLETE FINGERING LIBRARY</span><h2>完整单簧管指法库</h2><p>降 B 调 Boehm 制式，覆盖书写音 E3–A6 的 42 个半音。点击音名即可看指法并试听实际音高。</p></div>
          <div className="library-stat"><strong>42</strong><span>STANDARD<br />FINGERINGS</span></div>
        </div>

        <div className="library-workbench">
          <div className="library-browser">
            <div className="register-tabs" role="tablist" aria-label="按音区筛选">
              {registerTabs.map((tab) => <button type="button" role="tab" aria-selected={libraryFilter === tab} className={libraryFilter === tab ? "active" : ""} onClick={() => setLibraryFilter(tab)} key={tab}>{tab}</button>)}
            </div>
            <div className="pitch-grid">
              {filteredLibrary.map((entry) => (
                <button type="button" className={libraryPitch === entry.value ? "selected" : ""} onClick={() => { setLibraryPitch(entry.value); playTone(buildLessonNote(entry.value).frequency); }} key={entry.value}>
                  <strong>{noteHead(entry.value)}</strong><small>{noteOctave(entry.value)}</small><span>{entry.register}</span>
                </button>
              ))}
            </div>
          </div>

          <article className="library-detail">
            <div className="library-note-title"><span>{libraryNote.solfege}</span><strong>{noteHead(libraryNote.written)}<i>{noteOctave(libraryNote.written)}</i></strong><button type="button" onClick={() => playTone(libraryNote.frequency)}>▶ 听 {libraryNote.sounding}</button></div>
            <div className="library-diagram-wrap"><ClarinetDiagram fingering={libraryEntry.fingering} compact /></div>
            <div className="library-description">
              <span className="register-chip">{libraryEntry.register}</span><h3>{libraryEntry.fingering.name}</h3><p>{libraryEntry.fingering.tip}</p>
              <div className="pressed-key-list"><b>图中标记</b>{libraryEntry.fingering.keys.length ? libraryEntry.fingering.keys.map((key) => <span key={key}>{CLARINET_KEY_LABELS[key]}</span>) : <span>全部开放</span>}</div>
            </div>
          </article>
        </div>
        <p className="library-source">标准指法依据 <a href={YAMAHA_FINGERING_SOURCE} target="_blank" rel="noreferrer">Yamaha Musical Instrument Guide</a> 逐音核对。高音区可能因乐器型号、音准与个人口型采用替代指法。</p>
      </section>

      <section className="learning-path" id="path">
        <div className="path-heading"><span className="section-index light">03 / FIRST LESSON</span><h2>识别不是终点，确认后再开吹</h2><p>照片识谱能加快准备，但老师的快速复核仍然重要，尤其是升降号、连音线与多声部。</p></div>
        <div className="path-grid">
          <article><span>01</span><div className="path-icon">◎</div><h3>上传与识别</h3><p>系统先校正倾斜、寻找谱线，再把候选音符框回原图。</p><small>SCAN</small></article>
          <article className="featured"><span>02</span><div className="path-icon">✓</div><h3>老师校对</h3><p>逐音确认音名和时值；不确定的结果会标为“待校对”。</p><small>REVIEW</small></article>
          <article><span>03</span><div className="path-icon">♪</div><h3>指法与听音</h3><p>跟着完整按键图落指，再用稳定节拍听完整段落。</p><small>PRACTICE</small></article>
        </div>
      </section>

      <section className="teacher-note-section" id="teacher-note">
        <div className="teacher-note-card"><span className="section-index">04 / TEACHER&apos;S NOTE</span><blockquote>“机器负责找得快，老师负责教得准；<br />学生负责慢慢把每个音吹稳。”</blockquote><div className="note-signature"><span />音乐助教 · 识谱工作流</div></div>
        <div className="next-up"><span>NEXT</span><h3>下一阶段</h3><ul><li>跟吹录音与音准判断</li><li>复杂节奏与休止符识别</li><li>多声部与调号语义分析</li></ul></div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><span>♩</span></span><span><strong>音乐助教</strong><small>CLARINET STUDIO</small></span></a>
        <p>让每一位单簧管新手，都能看得懂、按得对、听得见。</p><span>公开教学版 · 2026</span>
      </footer>
    </main>
  );
}
