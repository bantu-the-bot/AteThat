const GEMINI_MODEL = "gemini-1.5-flash";
const STORAGE_KEY = "atethat_sets_v1";
const KEY_STORAGE = "atethat_api_key";

const els = {
  apiKey: document.getElementById("apiKey"),
  saveKeyBtn: document.getElementById("saveKeyBtn"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
  fileInput: document.getElementById("fileInput"),
  rawText: document.getElementById("rawText"),
  extractBtn: document.getElementById("extractBtn"),
  itemsTableBody: document.querySelector("#itemsTable tbody"),
  addItemBtn: document.getElementById("addItemBtn"),
  saveSetBtn: document.getElementById("saveSetBtn"),
  setSelect: document.getElementById("setSelect"),
  startQuizBtn: document.getElementById("startQuizBtn"),
  quizBox: document.getElementById("quizBox"),
  quizProgress: document.getElementById("quizProgress"),
  quizPrompt: document.getElementById("quizPrompt"),
  quizChoices: document.getElementById("quizChoices"),
  quizAnswer: document.getElementById("quizAnswer"),
  submitAnswerBtn: document.getElementById("submitAnswerBtn"),
  skipBtn: document.getElementById("skipBtn"),
  feedback: document.getElementById("feedback"),
  summary: document.getElementById("summary"),
  status: document.getElementById("status"),
};

let extractedItems = [];
let sets = loadSets();
let quiz = null;

init();

function init() {
  const savedKey = localStorage.getItem(KEY_STORAGE) || "";
  els.apiKey.value = savedKey;
  refreshSetsDropdown();
  renderItems();

  els.saveKeyBtn.onclick = () => {
    localStorage.setItem(KEY_STORAGE, els.apiKey.value.trim());
    setStatus("API key saved locally in this browser.");
  };
  els.clearKeyBtn.onclick = () => {
    localStorage.removeItem(KEY_STORAGE);
    els.apiKey.value = "";
    setStatus("API key cleared.");
  };
  els.extractBtn.onclick = extractStudyItems;
  els.addItemBtn.onclick = () => {
    extractedItems.push({ term: "", answer: "" });
    renderItems();
  };
  els.saveSetBtn.onclick = saveCurrentSet;
  els.startQuizBtn.onclick = startQuiz;
  els.submitAnswerBtn.onclick = submitAnswer;
  els.skipBtn.onclick = skipQuestion;
}

function setStatus(msg) { els.status.textContent = msg; }

function loadSets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveSets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sets));
}

function refreshSetsDropdown() {
  els.setSelect.innerHTML = "";
  if (!sets.length) {
    const o = document.createElement("option");
    o.textContent = "No sets saved yet";
    o.value = "";
    els.setSelect.appendChild(o);
    return;
  }
  sets.forEach((s, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${s.name} (${s.items.length})`;
    els.setSelect.appendChild(o);
  });
}

function renderItems() {
  els.itemsTableBody.innerHTML = "";
  extractedItems.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="term" data-i="${idx}" value="${escapeHtml(item.term)}" /></td>
      <td><input data-k="answer" data-i="${idx}" value="${escapeHtml(item.answer)}" /></td>
      <td><button class="smallBtn" data-del="${idx}">Delete</button></td>
    `;
    els.itemsTableBody.appendChild(tr);
  });

  els.itemsTableBody.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.i);
      const k = e.target.dataset.k;
      extractedItems[i][k] = e.target.value;
    });
  });
  els.itemsTableBody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      extractedItems.splice(Number(btn.dataset.del), 1);
      renderItems();
    });
  });
}

async function extractStudyItems() {
  const key = els.apiKey.value.trim();
  const text = els.rawText.value.trim();
  const file = els.fileInput.files[0];

  if (!key) return setStatus("Enter Gemini API key first.");
  if (!text && !file) return setStatus("Add pasted text or upload a file first.");

  setStatus("Extracting items with Gemini...");

  try {
    const parts = [];
    parts.push({ text: "Extract study items into JSON array: [{term, answer}]. Keep concise and accurate. Return ONLY JSON." });

    if (text) parts.push({ text: `Study content:\n${text}` });

    if (file) {
      const base64 = await fileToBase64(file);
      parts.push({ inline_data: { mime_type: file.type || "application/octet-stream", data: base64 } });
    }

    const data = await callGemini(key, parts);
    const raw = extractTextFromGemini(data);
    const parsed = tryParseJsonArray(raw);
    if (!parsed.length) throw new Error("No items extracted");

    extractedItems = parsed
      .map(x => ({ term: String(x.term || "").trim(), answer: String(x.answer || "").trim() }))
      .filter(x => x.term && x.answer);

    renderItems();
    setStatus(`Extracted ${extractedItems.length} items. Review/edit, then save set.`);
  } catch (e) {
    setStatus(`Extraction failed: ${e.message}`);
  }
}

function saveCurrentSet() {
  const valid = extractedItems.filter(x => x.term.trim() && x.answer.trim());
  if (!valid.length) return setStatus("No valid items to save.");
  const name = prompt("Set name?", `Set ${new Date().toLocaleString()}`);
  if (!name) return;
  sets.unshift({ id: crypto.randomUUID(), name, items: valid, createdAt: Date.now() });
  saveSets();
  refreshSetsDropdown();
  setStatus(`Saved set \"${name}\" with ${valid.length} items.`);
}

function startQuiz() {
  const idx = Number(els.setSelect.value);
  const set = sets[idx];
  if (!set) return setStatus("No set selected.");

  const items = shuffle([...set.items]).slice(0, 10);
  const questions = items.map((it, i) => {
    const type = i % 3 === 0 ? "mcq" : "typed";
    if (type === "mcq") {
      const distractors = shuffle(set.items.filter(x => x.term !== it.term)).slice(0, 3).map(x => x.answer);
      const choices = shuffle([it.answer, ...distractors]);
      return { type, prompt: `What matches: ${it.term}?`, answer: it.answer, choices, source: it };
    }
    return { type, prompt: `Type the meaning for: ${it.term}`, answer: it.answer, source: it };
  });

  quiz = { setName: set.name, questions, i: 0, correct: 0, total: 0, missed: [] };
  els.summary.classList.add("hidden");
  els.quizBox.classList.remove("hidden");
  els.feedback.textContent = "";
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[quiz.i];
  els.quizProgress.textContent = `Question ${quiz.i + 1}/${quiz.questions.length}`;
  els.quizPrompt.textContent = q.prompt;
  els.quizChoices.innerHTML = "";
  els.quizAnswer.value = "";

  if (q.type === "mcq") {
    q.choices.forEach(c => {
      const b = document.createElement("button");
      b.textContent = c;
      b.className = "secondary";
      b.onclick = () => grade(c);
      els.quizChoices.appendChild(b);
    });
    els.quizAnswer.classList.add("hidden");
    els.submitAnswerBtn.classList.add("hidden");
  } else {
    els.quizAnswer.classList.remove("hidden");
    els.submitAnswerBtn.classList.remove("hidden");
  }
}

function submitAnswer() {
  if (!quiz) return;
  const user = els.quizAnswer.value.trim();
  grade(user);
}

function skipQuestion() {
  const q = quiz.questions[quiz.i];
  quiz.total++;
  quiz.missed.push({ q: q.prompt, answer: q.answer });
  els.feedback.textContent = `⏭️ Skipped. Correct: ${q.answer}`;
  nextQuestionSoon();
}

function grade(userAnswer) {
  const q = quiz.questions[quiz.i];
  quiz.total++;
  const result = friendlyGrade(userAnswer, q.answer);
  if (result.ok) quiz.correct++;
  else quiz.missed.push({ q: q.prompt, answer: q.answer });
  els.feedback.textContent = result.msg;
  nextQuestionSoon();
}

function nextQuestionSoon() {
  setTimeout(() => {
    quiz.i++;
    if (quiz.i >= quiz.questions.length) return finishQuiz();
    renderQuestion();
    els.feedback.textContent = "";
  }, 900);
}

function finishQuiz() {
  els.quizBox.classList.add("hidden");
  const pct = Math.round((quiz.correct / Math.max(1, quiz.total)) * 100);
  const missed = quiz.missed.map(m => `<li>${escapeHtml(m.q)} <br/><small>Answer: ${escapeHtml(m.answer)}</small></li>`).join("");
  els.summary.innerHTML = `
    <h3>Done! 🎉</h3>
    <p><b>Set:</b> ${escapeHtml(quiz.setName)}</p>
    <p><b>Score:</b> ${quiz.correct}/${quiz.total} (${pct}%)</p>
    <h4>Review missed:</h4>
    <ul>${missed || "<li>None. AteThat! ✅</li>"}</ul>
  `;
  els.summary.classList.remove("hidden");
  setStatus("Quiz complete.");
}

function friendlyGrade(user, correct) {
  const a = normalize(user);
  const b = normalize(correct);
  if (!a) return { ok: false, msg: "Try typing an answer 🙂" };
  if (a === b) return { ok: true, msg: "Perfect! 🎉" };

  const dist = levenshtein(a, b);
  if (dist <= 2) return { ok: true, msg: `Almost there! ✨ Tiny typo. Correct is: ${correct}` };

  const noAccentA = stripAccents(a);
  const noAccentB = stripAccents(b);
  if (noAccentA === noAccentB) return { ok: true, msg: `Great try! Accent check ✅ Correct form: ${correct}` };

  return { ok: false, msg: `Good effort 💛 Correct answer: ${correct}` };
}

async function callGemini(apiKey, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents: [{ role: "user", parts }] };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini error ${res.status}: ${t.slice(0, 200)}`);
  }
  return await res.json();
}

function extractTextFromGemini(data) {
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n") || "";
}

function tryParseJsonArray(raw) {
  try { return JSON.parse(raw); } catch {}
  const s = raw.indexOf("[");
  const e = raw.lastIndexOf("]");
  if (s >= 0 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  }
  return [];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function normalize(s) {
  return stripAccents(String(s || "").trim().toLowerCase().replace(/\s+/g, " "));
}

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
