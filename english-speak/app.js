/*
  SpeakEnglish App - Vanilla JS
  - Loads curriculum from data/curriculum.json
  - Renders Levels -> Lessons -> Activities
  - Provides TTS (Speech Synthesis) and STT (Speech Recognition) support
  - Stores progress in localStorage
*/

(function () {
  const DATA_URL = "./data/curriculum.json";
  const STORAGE_KEY = "speakEnglish.progress.v1";
  const DEFAULT_LOCALE = "en-US";

  const dom = {
    voiceSelect: document.getElementById("voiceSelect"),
    rateRange: document.getElementById("rateRange"),
    toggleThemeBtn: document.getElementById("toggleThemeBtn"),
    levelsList: document.getElementById("levelsList"),
    lessonsList: document.getElementById("lessonsList"),
    main: document.getElementById("main"),
    banner: document.getElementById("compatBanner"),
    lessonIntro: document.getElementById("lessonIntro"),
    activityChooser: document.getElementById("activityChooser"),
    activityRoot: document.getElementById("activityRoot"),
  };

  const appState = {
    curriculum: null,
    voices: [],
    selectedVoice: null,
    speechRate: 1,
    selectedLevelId: null,
    selectedLessonId: null,
    progressByKey: loadLocalProgress(),
    darkMode: true,
  };

  // ---------- Storage ----------
  function loadLocalProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn("Failed to parse saved progress", e);
      return {};
    }
  }

  function saveLocalProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.progressByKey));
    } catch (e) {
      console.warn("Failed to save progress", e);
    }
  }

  function getProgressKey(lessonId, type, id) {
    return `${lessonId}::${type}::${id}`;
  }

  // ---------- Utilities ----------
  function normalizeSentence(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function levenshteinDistance(a, b) {
    const s = normalizeSentence(a);
    const t = normalizeSentence(b);
    const n = s.length;
    const m = t.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const dp = new Array((n + 1) * (m + 1));
    const idx = (i, j) => i * (m + 1) + j;
    for (let i = 0; i <= n; i++) dp[idx(i, 0)] = i;
    for (let j = 0; j <= m; j++) dp[idx(0, j)] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[idx(i, j)] = Math.min(
          dp[idx(i - 1, j)] + 1,
          dp[idx(i, j - 1)] + 1,
          dp[idx(i - 1, j - 1)] + cost
        );
      }
    }
    return dp[idx(n, m)];
  }

  function similarityScore(expected, said) {
    const s = normalizeSentence(expected);
    const t = normalizeSentence(said);
    if (!s && !t) return 1;
    const maxLen = Math.max(s.length, t.length) || 1;
    const dist = levenshteinDistance(s, t);
    const ratio = 1 - dist / maxLen;
    return Math.max(0, Math.min(1, ratio));
  }

  function fmtPct(v) {
    return `${Math.round(v * 100)}%`;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.substring(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children) {
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  // ---------- Speech Synthesis ----------
  const SpeechService = (function () {
    let voices = [];
    let currentUtterance = null;

    function loadVoices() {
      voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      return voices;
    }

    function getVoices() {
      if (!voices.length) loadVoices();
      return voices;
    }

    function speak(text) {
      if (!("speechSynthesis" in window)) return;
      cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = DEFAULT_LOCALE;
      utter.rate = appState.speechRate || 1;
      if (appState.selectedVoice) utter.voice = appState.selectedVoice;
      currentUtterance = utter;
      window.speechSynthesis.speak(utter);
    }

    function cancel() {
      if (!("speechSynthesis" in window)) return;
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      currentUtterance = null;
    }

    return { loadVoices, getVoices, speak, cancel };
  })();

  // ---------- Speech Recognition ----------
  const RecognitionService = (function () {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    function isSupported() {
      return Boolean(Rec);
    }

    function startOnce() {
      return new Promise((resolve, reject) => {
        if (!isSupported()) {
          return reject(new Error("Speech Recognition not supported"));
        }
        if (recognition) {
          try { recognition.abort(); } catch {}
        }
        recognition = new Rec();
        recognition.lang = DEFAULT_LOCALE;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;

        let finalTranscript = "";

        recognition.onresult = (event) => {
          const res = event.results[0][0];
          finalTranscript = res.transcript || "";
        };
        recognition.onerror = (e) => {
          reject(new Error(e.error || "recognition_error"));
        };
        recognition.onend = () => {
          resolve(finalTranscript);
        };
        try {
          recognition.start();
        } catch (e) {
          reject(e);
        }
      });
    }

    function stop() {
      try { recognition && recognition.stop(); } catch {}
    }

    return { isSupported, startOnce, stop };
  })();

  // ---------- SRS ----------
  function computeNextReviewTimestamp(grade) {
    const now = Date.now();
    if (grade === "hard") return now + 24 * 60 * 60 * 1000; // 1 day
    if (grade === "good") return now + 3 * 24 * 60 * 60 * 1000; // 3 days
    if (grade === "easy") return now + 7 * 24 * 60 * 60 * 1000; // 7 days
    return now + 12 * 60 * 60 * 1000; // default 12h
  }

  function markProgress(lessonId, type, id, payload) {
    const key = getProgressKey(lessonId, type, id);
    appState.progressByKey[key] = {
      ...(appState.progressByKey[key] || {}),
      ...payload,
    };
    saveLocalProgress();
  }

  function getProgress(lessonId, type, id) {
    const key = getProgressKey(lessonId, type, id);
    return appState.progressByKey[key] || null;
  }

  // ---------- UI: Levels & Lessons ----------
  function renderLevels() {
    if (!appState.curriculum) return;
    dom.levelsList.innerHTML = "";
    appState.curriculum.levels.forEach((lvl) => {
      const node = el("div", { class: "item" + (appState.selectedLevelId === lvl.id ? " active" : "") }, [
        el("div", { text: lvl.title }),
        el("span", { class: "small", text: lvl.description || "" }),
      ]);
      node.addEventListener("click", () => {
        appState.selectedLevelId = lvl.id;
        appState.selectedLessonId = null;
        renderLevels();
        renderLessons();
        clearActivity();
      });
      dom.levelsList.appendChild(node);
    });
  }

  function renderLessons() {
    dom.lessonsList.classList.remove("muted");
    dom.lessonsList.innerHTML = "";
    const level = appState.curriculum.levels.find((l) => l.id === appState.selectedLevelId);
    if (!level) {
      dom.lessonsList.classList.add("muted");
      dom.lessonsList.textContent = "Select a level";
      return;
    }
    level.lessons.forEach((lesson) => {
      const completedCount = (lesson.phrases || []).filter((p, idx) => {
        const pr = getProgress(lesson.id, "phrase", String(idx));
        return pr && pr.bestScore >= 0.85;
      }).length;
      const totalCount = (lesson.phrases || []).length;
      const node = el("div", { class: "item" + (appState.selectedLessonId === lesson.id ? " active" : "") }, [
        el("div", { text: lesson.title }),
        el("span", { class: "small", text: `${completedCount}/${totalCount} phrases mastered` }),
      ]);
      node.addEventListener("click", () => {
        appState.selectedLessonId = lesson.id;
        renderLessons();
        renderLessonIntro(lesson);
      });
      dom.lessonsList.appendChild(node);
    });
  }

  function clearActivity() {
    dom.lessonIntro.classList.add("hidden");
    dom.activityChooser.classList.add("hidden");
    dom.activityRoot.classList.add("hidden");
    dom.activityRoot.innerHTML = "";
  }

  function renderLessonIntro(lesson) {
    dom.lessonIntro.innerHTML = "";
    dom.lessonIntro.appendChild(
      el("div", {}, [
        el("h2", { text: lesson.title }),
        el("div", { class: "muted", text: (lesson.objectives || []).join(" · ") }),
        el("div", { style: "height:8px" }),
        el("div", { class: "progress" }, [
          el("div", { style: `width: ${computeLessonProgress(lesson)}%` })
        ]),
      ])
    );
    dom.lessonIntro.classList.remove("hidden");

    dom.activityChooser.innerHTML = "";
    dom.activityChooser.appendChild(
      el("div", {}, [
        el("h3", { text: "Choose an activity" }),
        el("div", { class: "actions" }, [
          buttonPrimary("Listen & Repeat", () => startListenRepeat(lesson)),
          buttonPrimary("Role-play", () => startRolePlay(lesson)),
          buttonPrimary("Vocabulary", () => startVocabulary(lesson)),
        ]),
      ])
    );
    dom.activityChooser.classList.remove("hidden");
    dom.activityRoot.classList.add("hidden");
  }

  function computeLessonProgress(lesson) {
    const phrases = lesson.phrases || [];
    if (!phrases.length) return 0;
    const mastered = phrases.filter((p, idx) => {
      const pr = getProgress(lesson.id, "phrase", String(idx));
      return pr && pr.bestScore >= 0.85;
    }).length;
    return Math.round((mastered / phrases.length) * 100);
  }

  function buttonPrimary(text, onClick) {
    return el("button", { class: "button primary", onClick }, [text]);
  }

  function button(text, onClick, extraClass = "") {
    return el("button", { class: `button ${extraClass}`.trim(), onClick }, [text]);
  }

  // ---------- Activity: Listen & Repeat ----------
  function startListenRepeat(lesson) {
    dom.activityRoot.innerHTML = "";
    dom.activityRoot.classList.remove("hidden");

    const phrases = lesson.phrases || [];
    if (!phrases.length) {
      dom.activityRoot.appendChild(el("div", { class: "muted", text: "No phrases in this lesson." }));
      return;
    }

    let currentIndex = 0;
    const phraseEl = el("div", { class: "phrase" });
    const transcriptEl = el("div", { class: "transcript" });
    const scoreEl = el("div", { class: "stat" }, ["Score: ", el("span", { text: "-" })]);

    function renderPhrase() {
      const text = phrases[currentIndex];
      phraseEl.textContent = text;
      transcriptEl.textContent = "";
      const pr = getProgress(lesson.id, "phrase", String(currentIndex));
      const best = pr?.bestScore || 0;
      scoreEl.querySelector("span").textContent = pr ? `${fmtPct(best)} best` : "-";
      progressBar.style.width = `${Math.round(((currentIndex) / phrases.length) * 100)}%`;
    }

    const controls = el("div", { class: "actions" }, [
      button("Play", () => SpeechService.speak(phrases[currentIndex]), "primary"),
      button("Speak", async () => {
        transcriptEl.textContent = "Listening...";
        SpeechService.cancel();
        try {
          const said = await RecognitionService.startOnce();
          const expected = phrases[currentIndex];
          const score = similarityScore(expected, said);
          transcriptEl.textContent = `You said: "${said}"`;
          scoreEl.querySelector("span").textContent = fmtPct(score);
          markProgress(lesson.id, "phrase", String(currentIndex), {
            bestScore: Math.max(score, getProgress(lesson.id, "phrase", String(currentIndex))?.bestScore || 0),
            lastScore: score,
            lastSaid: said,
            lastAt: Date.now(),
          });
        } catch (e) {
          transcriptEl.textContent = `Recognition error: ${e.message || e}`;
        }
      }),
      button("Next", () => {
        currentIndex = (currentIndex + 1) % phrases.length;
        renderPhrase();
      }),
    ]);

    const progressBar = el("div", { class: "progress" }, [el("div", { style: "width: 0%" })]);

    dom.activityRoot.appendChild(el("h3", { text: "Listen & Repeat" }));
    dom.activityRoot.appendChild(progressBar);
    dom.activityRoot.appendChild(phraseEl);
    dom.activityRoot.appendChild(controls);
    dom.activityRoot.appendChild(scoreEl);
    dom.activityRoot.appendChild(el("div", { class: "muted" }, [
      RecognitionService.isSupported() ? "Click Speak and talk after the beep." : "Speech Recognition not supported. Type your answer below."
    ]));

    if (!RecognitionService.isSupported()) {
      const input = el("input", { placeholder: "Type what you would say", style: "width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:#0b1020;color:var(--text)" });
      const checkBtn = button("Check", () => {
        const expected = phrases[currentIndex];
        const score = similarityScore(expected, input.value || "");
        transcriptEl.textContent = `You typed: "${input.value}"`;
        scoreEl.querySelector("span").textContent = fmtPct(score);
        markProgress(lesson.id, "phrase", String(currentIndex), {
          bestScore: Math.max(score, getProgress(lesson.id, "phrase", String(currentIndex))?.bestScore || 0),
          lastScore: score,
          lastSaid: input.value || "",
          lastAt: Date.now(),
        });
      });
      const row = el("div", { class: "actions" }, [input, checkBtn]);
      dom.activityRoot.appendChild(row);
    }

    dom.activityRoot.appendChild(transcriptEl);

    renderPhrase();
  }

  // ---------- Activity: Role-play ----------
  function startRolePlay(lesson) {
    dom.activityRoot.innerHTML = "";
    dom.activityRoot.classList.remove("hidden");

    const dialogues = lesson.dialogues || [];
    if (!dialogues.length) {
      dom.activityRoot.appendChild(el("div", { class: "muted", text: "No dialogues in this lesson." }));
      return;
    }

    let currentIndex = 0;
    let yourRole = "a"; // or "b"

    const roleToggle = el("div", { class: "actions" }, [
      el("span", { class: "badge", text: "Your role:" }),
      button("A", () => { yourRole = "a"; renderDialogue(); }, "primary"),
      button("B", () => { yourRole = "b"; renderDialogue(); }, "primary"),
    ]);

    const convoBox = el("div", { class: "grid" });
    const feedbackEl = el("div", { class: "stat" }, ["Match: ", el("span", { text: "-" })]);

    function renderDialogue() {
      convoBox.innerHTML = "";
      const d = dialogues[currentIndex];
      [["a", d.a], ["b", d.b]].forEach(([role, text]) => {
        const mine = role === yourRole;
        const card = el("div", { class: "card" }, [
          el("div", { class: "muted", text: mine ? "You" : "Partner" }),
          el("div", { class: "phrase", text }),
          el("div", { class: "actions" }, [
            button("Play", () => SpeechService.speak(text), "primary"),
            mine ? button("Speak", async () => {
              try {
                const said = await RecognitionService.startOnce();
                const score = similarityScore(text, said);
                feedbackEl.querySelector("span").textContent = fmtPct(score);
                markProgress(lesson.id, "dialogue", `${currentIndex}:${role}`, {
                  bestScore: Math.max(score, getProgress(lesson.id, "dialogue", `${currentIndex}:${role}`)?.bestScore || 0),
                  lastScore: score,
                  lastSaid: said,
                  lastAt: Date.now(),
                });
              } catch (e) {
                feedbackEl.querySelector("span").textContent = "error";
              }
            }) : button("Play", () => SpeechService.speak(text), "primary"),
          ])
        ]);
        convoBox.appendChild(card);
      });
    }

    const navRow = el("div", { class: "actions" }, [
      button("Previous", () => { currentIndex = (currentIndex - 1 + dialogues.length) % dialogues.length; renderDialogue(); }),
      button("Next", () => { currentIndex = (currentIndex + 1) % dialogues.length; renderDialogue(); }),
    ]);

    dom.activityRoot.appendChild(el("h3", { text: "Role-play" }));
    dom.activityRoot.appendChild(roleToggle);
    dom.activityRoot.appendChild(convoBox);
    dom.activityRoot.appendChild(navRow);
    dom.activityRoot.appendChild(feedbackEl);

    renderDialogue();
  }

  // ---------- Activity: Vocabulary (SRS) ----------
  function startVocabulary(lesson) {
    dom.activityRoot.innerHTML = "";
    dom.activityRoot.classList.remove("hidden");

    const vocab = lesson.vocabulary || [];
    if (!vocab.length) {
      dom.activityRoot.appendChild(el("div", { class: "muted", text: "No vocabulary in this lesson." }));
      return;
    }

    let currentIndex = 0;

    function nextDueIndex(startIdx) {
      const now = Date.now();
      for (let i = 0; i < vocab.length; i++) {
        const idx = (startIdx + i) % vocab.length;
        const w = vocab[idx];
        const pr = getProgress(lesson.id, "vocab", w.word);
        if (!pr || !pr.nextAt || pr.nextAt <= now) return idx;
      }
      return startIdx;
    }

    currentIndex = nextDueIndex(0);

    const cardBox = el("div", { class: "card" });
    const wordEl = el("div", { class: "phrase" });
    const hintEl = el("div", { class: "muted" });

    const gradeRow = el("div", { class: "actions" }, [
      button("Hard", () => gradeCurrent("hard"), "warn"),
      button("Good", () => gradeCurrent("good"), "success"),
      button("Easy", () => gradeCurrent("easy"), "primary"),
    ]);

    function renderCard() {
      const w = vocab[currentIndex];
      wordEl.textContent = w.word;
      hintEl.textContent = `${w.meaning} · e.g., ${w.example}`;
    }

    function gradeCurrent(g) {
      const w = vocab[currentIndex];
      const nextAt = computeNextReviewTimestamp(g);
      markProgress(lesson.id, "vocab", w.word, { grade: g, nextAt, gradedAt: Date.now() });
      currentIndex = nextDueIndex(currentIndex + 1);
      renderCard();
    }

    const speakRow = el("div", { class: "actions" }, [
      button("Play", () => SpeechService.speak(vocab[currentIndex].word), "primary"),
      button("Example", () => SpeechService.speak(vocab[currentIndex].example || "")),
    ]);

    cardBox.appendChild(wordEl);
    cardBox.appendChild(hintEl);

    dom.activityRoot.appendChild(el("h3", { text: "Vocabulary" }));
    dom.activityRoot.appendChild(cardBox);
    dom.activityRoot.appendChild(speakRow);
    dom.activityRoot.appendChild(gradeRow);

    renderCard();
  }

  // ---------- Banner ----------
  function renderCompatBanner() {
    const synth = "speechSynthesis" in window;
    const rec = RecognitionService.isSupported();
    const parts = [];
    if (!synth) parts.push("Text-to-Speech unavailable");
    if (!rec) parts.push("Speech Recognition unavailable (try Chrome)");
    dom.banner.textContent = parts.length ? `Note: ${parts.join(" · ")}` : "";
  }

  // ---------- Theme ----------
  function applyTheme() {
    document.documentElement.style.colorScheme = appState.darkMode ? "dark" : "light";
  }

  // ---------- Init ----------
  async function init() {
    applyTheme();
    dom.toggleThemeBtn.addEventListener("click", () => {
      appState.darkMode = !appState.darkMode;
      applyTheme();
    });

    dom.rateRange.addEventListener("input", () => {
      appState.speechRate = Number(dom.rateRange.value);
    });

    // Load curriculum
    const res = await fetch(DATA_URL);
    appState.curriculum = await res.json();

    // Load voices and populate select
    function populateVoices() {
      const vs = SpeechService.getVoices();
      appState.voices = vs.filter(v => v.lang && v.lang.startsWith("en"));
      dom.voiceSelect.innerHTML = "";
      appState.voices.forEach((v, idx) => {
        const opt = el("option", { value: String(idx), text: `${v.name} (${v.lang})` });
        dom.voiceSelect.appendChild(opt);
      });
      appState.selectedVoice = appState.voices[0] || null;
      dom.voiceSelect.value = "0";
    }

    if ("speechSynthesis" in window) {
      SpeechService.loadVoices();
      populateVoices();
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }

    dom.voiceSelect.addEventListener("change", () => {
      const idx = Number(dom.voiceSelect.value);
      appState.selectedVoice = appState.voices[idx] || null;
    });

    renderCompatBanner();
    renderLevels();
    renderLessons();
  }

  // Start
  init().catch((e) => {
    console.error(e);
    dom.banner.textContent = `Failed to initialize: ${e.message || e}`;
  });
})();