const DATA_URL = "data/matches.json";
const POLL_MS = 60000;
const stageOrder = { R16: 1, QF: 2, SF: 3, FINAL: 4, THIRD: 5 };
const stageLabels = {
  R16: "1/8 финала",
  QF: "1/4 финала",
  SF: "1/2 финала",
  FINAL: "Финал",
  THIRD: "Матч за 3-е место"
};
const stageShort = { R16: "R16", QF: "QF", SF: "SF", FINAL: "FINAL", THIRD: "3RD" };
const svgNS = "http://www.w3.org/2000/svg";
const palette = {
  MAR: ["#0f8f5a", "#48e49d"],
  CAN: ["#b3243e", "#ff7d8d"],
  FRA: ["#1d4f91", "#74a8ff"],
  PAR: ["#b62d42", "#f4d4d8"],
  POR: ["#0b7c56", "#e65353"],
  ESP: ["#c99618", "#f3d86a"],
  USA: ["#274d8e", "#e35f66"],
  BEL: ["#161616", "#f0c45b"],
  BRA: ["#197a3a", "#f1d33f"],
  NOR: ["#27498f", "#d94a55"],
  MEX: ["#146b4b", "#f4f0df"],
  ENG: ["#f4f0df", "#d84f5b"],
  ARG: ["#6ec7e8", "#f7f2df"],
  EGY: ["#b93739", "#f2f2f2"],
  SUI: ["#d93838", "#ffffff"],
  COL: ["#e0b326", "#3f65b3"],
  TBD: ["#2b3b36", "#8da59a"]
};
const flags = {
  PAR: "🇵🇾",
  FRA: "🇫🇷",
  CAN: "🇨🇦",
  MAR: "🇲🇦",
  POR: "🇵🇹",
  ESP: "🇪🇸",
  USA: "🇺🇸",
  BEL: "🇧🇪",
  BRA: "🇧🇷",
  NOR: "🇳🇴",
  MEX: "🇲🇽",
  ENG: "🏴",
  ARG: "🇦🇷",
  EGY: "🇪🇬",
  SUI: "🇨🇭",
  COL: "🇨🇴",
  TBD: "◇"
};

let latestData = null;

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isComplete(match) {
  return ["complete", "finished", "final", "ft", "aet", "pen"].includes(String(match.status || "").toLowerCase());
}

function isLive(match) {
  return ["live", "1h", "2h", "ht", "et", "p", "bt", "int"].includes(String(match.status || "").toLowerCase());
}

function scoreText(match) {
  const a = match.score1;
  const b = match.score2;
  if (a === null || a === undefined || b === null || b === undefined) return "";
  let text = `${a}:${b}`;
  if (match.penalty1 !== undefined && match.penalty1 !== null && match.penalty2 !== undefined && match.penalty2 !== null) {
    text += ` пен. ${match.penalty1}:${match.penalty2}`;
  }
  return text;
}

function matchWinner(match) {
  if (!match) return null;
  if (match.winner && match.winner !== "TBD") {
    if (match.winner === "team1" || match.winner === 1) return match.team1;
    if (match.winner === "team2" || match.winner === 2) return match.team2;
    const winnerCode = String(match.winner).toUpperCase();
    if (match.team1?.code === winnerCode) return match.team1;
    if (match.team2?.code === winnerCode) return match.team2;
  }
  if (!isComplete(match)) return null;
  if (typeof match.score1 === "number" && typeof match.score2 === "number") {
    if (match.score1 > match.score2) return match.team1;
    if (match.score2 > match.score1) return match.team2;
  }
  if (typeof match.penalty1 === "number" && typeof match.penalty2 === "number") {
    if (match.penalty1 > match.penalty2) return match.team1;
    if (match.penalty2 > match.penalty1) return match.team2;
  }
  return null;
}

function isPlaceholder(team) {
  if (!team) return true;
  return !team.code || team.code === "TBD" || String(team.name || "").startsWith("Победитель") || String(team.name || "").startsWith("TBD");
}

function hydrateBracket(data) {
  const hydrated = cloneData(data);
  const byId = new Map(hydrated.matches.map((match) => [match.id, match]));
  const ordered = [...hydrated.matches].sort((a, b) => {
    return (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99) || (a.order || 0) - (b.order || 0);
  });

  for (const match of ordered) {
    const winner = matchWinner(match);
    if (!winner || !match.nextMatchId || !match.nextSlot) continue;
    const next = byId.get(match.nextMatchId);
    if (!next) continue;
    if (match.nextSlot === "team1" && isPlaceholder(next.team1)) next.team1 = winner;
    if (match.nextSlot === "team2" && isPlaceholder(next.team2)) next.team2 = winner;
  }

  return hydrated;
}

function byStage(matches) {
  return {
    R16: matches.filter((m) => m.stage === "R16").sort((a, b) => a.order - b.order),
    QF: matches.filter((m) => m.stage === "QF").sort((a, b) => a.order - b.order),
    SF: matches.filter((m) => m.stage === "SF").sort((a, b) => a.order - b.order),
    FINAL: matches.filter((m) => m.stage === "FINAL").sort((a, b) => a.order - b.order),
    THIRD: matches.filter((m) => m.stage === "THIRD").sort((a, b) => a.order - b.order)
  };
}

function layoutMatches(matches) {
  const stages = byStage(matches);
  const positions = new Map();
  const x = { R16: 72, QF: 472, SF: 866, FINAL: 1260, CHAMPION: 1586 };
  const w = { R16: 318, QF: 318, SF: 318, FINAL: 314, CHAMPION: 218 };
  const h = { R16: 86, QF: 116, SF: 132, FINAL: 156 };
  const y0 = 190;
  const gap = 23;

  stages.R16.forEach((match, index) => {
    positions.set(match.id, { x: x.R16, y: y0 + index * (h.R16 + gap), w: w.R16, h: h.R16 });
  });
  stages.QF.forEach((match, index) => {
    const first = positions.get(stages.R16[index * 2]?.id);
    const second = positions.get(stages.R16[index * 2 + 1]?.id);
    const center = first && second ? (first.y + first.h / 2 + second.y + second.h / 2) / 2 : y0 + index * 195;
    positions.set(match.id, { x: x.QF, y: center - h.QF / 2, w: w.QF, h: h.QF });
  });
  stages.SF.forEach((match, index) => {
    const first = positions.get(stages.QF[index * 2]?.id);
    const second = positions.get(stages.QF[index * 2 + 1]?.id);
    const center = first && second ? (first.y + first.h / 2 + second.y + second.h / 2) / 2 : y0 + index * 360;
    positions.set(match.id, { x: x.SF, y: center - h.SF / 2, w: w.SF, h: h.SF });
  });

  const semiOne = positions.get(stages.SF[0]?.id);
  const semiTwo = positions.get(stages.SF[1]?.id);
  const finalCenter = semiOne && semiTwo ? (semiOne.y + semiOne.h / 2 + semiTwo.y + semiTwo.h / 2) / 2 : 560;
  stages.FINAL.forEach((match) => {
    positions.set(match.id, { x: x.FINAL, y: finalCenter - h.FINAL / 2, w: w.FINAL, h: h.FINAL });
  });

  const final = positions.get(stages.FINAL[0]?.id);
  if (final) positions.set("champion", { x: x.CHAMPION, y: final.y + 16, w: w.CHAMPION, h: 124 });
  return { stages, positions };
}

function svgEl(name, attrs = {}, text = null) {
  const el = document.createElementNS(svgNS, name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  if (text !== null) el.textContent = text;
  return el;
}

function appendText(svg, x, y, text, size = 18, weight = 750, fill = "#f5ead0", extra = {}) {
  const el = svgEl("text", {
    x,
    y,
    "font-family": "Manrope, Inter, Segoe UI, Arial, sans-serif",
    "font-size": size,
    "font-weight": weight,
    fill,
    ...extra
  }, text);
  svg.appendChild(el);
  return el;
}

function appendRect(svg, x, y, w, h, rx, fill, stroke = "rgba(255,255,255,.12)", sw = 1, extra = {}) {
  const el = svgEl("rect", { x, y, width: w, height: h, rx, fill, stroke, "stroke-width": sw, ...extra });
  svg.appendChild(el);
  return el;
}

function appendPath(svg, d, attrs = {}) {
  const path = svgEl("path", { d, fill: "none", ...attrs });
  svg.appendChild(path);
  return path;
}

function truncateText(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function teamColors(code) {
  return palette[code] || palette.TBD;
}

function flagFor(code) {
  return flags[code] || flags.TBD;
}

function statusLabel(match) {
  if (isLive(match)) return "LIVE";
  if (isComplete(match)) return scoreText(match) ? `FT ${scoreText(match)}` : "FT";
  return match.kickoffLocal || match.kickoff || "TBD";
}

function matchClass(match) {
  if (isLive(match)) return "is-live";
  if (isComplete(match)) return "is-complete";
  return "is-scheduled";
}

function createDefs(svg) {
  const defs = svgEl("defs");
  defs.appendChild(svgEl("linearGradient", { id: "board", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }));
  defs.querySelector("#board").appendChild(svgEl("stop", { offset: "0%", "stop-color": "#092017" }));
  defs.querySelector("#board").appendChild(svgEl("stop", { offset: "50%", "stop-color": "#0b3f2e" }));
  defs.querySelector("#board").appendChild(svgEl("stop", { offset: "100%", "stop-color": "#07100d" }));

  defs.appendChild(svgEl("linearGradient", { id: "card", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }));
  defs.querySelector("#card").appendChild(svgEl("stop", { offset: "0%", "stop-color": "#172520" }));
  defs.querySelector("#card").appendChild(svgEl("stop", { offset: "100%", "stop-color": "#0a1210" }));

  defs.appendChild(svgEl("linearGradient", { id: "cardWin", x1: "0%", y1: "0%", x2: "100%", y2: "100%" }));
  defs.querySelector("#cardWin").appendChild(svgEl("stop", { offset: "0%", "stop-color": "#113628" }));
  defs.querySelector("#cardWin").appendChild(svgEl("stop", { offset: "100%", "stop-color": "#0b1814" }));

  defs.appendChild(svgEl("linearGradient", { id: "gold", x1: "0%", y1: "0%", x2: "100%", y2: "0%" }));
  defs.querySelector("#gold").appendChild(svgEl("stop", { offset: "0%", "stop-color": "#f5d980" }));
  defs.querySelector("#gold").appendChild(svgEl("stop", { offset: "100%", "stop-color": "#b87820" }));

  const filter = svgEl("filter", { id: "softShadow", x: "-20%", y: "-25%", width: "140%", height: "155%" });
  filter.appendChild(svgEl("feDropShadow", { dx: "0", dy: "18", stdDeviation: "18", "flood-color": "#000000", "flood-opacity": ".32" }));
  defs.appendChild(filter);
  svg.appendChild(defs);
}

function drawBoard(svg) {
  appendRect(svg, 0, 0, 1840, 1120, 28, "url(#board)", "none", 0);
  for (let x = 90; x < 1780; x += 116) {
    svg.appendChild(svgEl("line", { x1: x, y1: 0, x2: x - 180, y2: 1120, stroke: "rgba(245,234,208,.035)", "stroke-width": 2 }));
  }
  appendRect(svg, 44, 42, 1752, 1032, 22, "transparent", "rgba(245,234,208,.18)", 2);
  svg.appendChild(svgEl("line", { x1: 920, y1: 42, x2: 920, y2: 1074, stroke: "rgba(245,234,208,.12)", "stroke-width": 2 }));
  svg.appendChild(svgEl("circle", { cx: 920, cy: 558, r: 150, fill: "none", stroke: "rgba(245,234,208,.11)", "stroke-width": 3 }));
  appendText(svg, 72, 78, "FIFA WORLD CUP 2026", 42, 850, "#fff7df");
}

function appendConnector(svg, from, to, active = false) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const mid = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  appendPath(svg, d, {
    stroke: active ? "#43e09a" : "rgba(245,234,208,.3)",
    "stroke-width": active ? 5 : 3,
    "stroke-linecap": "round",
    opacity: active ? 1 : .72
  });
}

function drawTeam(svg, x, y, w, team, score, isWinner) {
  const code = team?.code || "TBD";
  const name = team?.name || "Пока неизвестно";
  const colors = teamColors(code);
  if (isWinner) appendRect(svg, x + 8, y - 3, w - 16, 34, 10, "rgba(67,224,154,.14)", "rgba(67,224,154,.34)", 1);
  appendText(svg, x + 32, y + 22, flagFor(code), 21, 850, "#fff7df", { "text-anchor": "middle" });
  appendRect(svg, x + 52, y, 54, 30, 9, colors[0], "rgba(255,255,255,.16)", 1);
  appendText(svg, x + 79, y + 21, code, 14, 850, colors[0] === "#f4f0df" || colors[0] === "#f2f2f2" ? "#101717" : "#fff7df", { "text-anchor": "middle" });
  appendText(svg, x + 118, y + 21, truncateText(name, 20), 18, 850, isWinner ? "#f7ffe9" : "#f5ead0");
  const scoreValue = score === null || score === undefined ? "–" : String(score);
  appendText(svg, x + w - 22, y + 22, scoreValue, 24, 850, isWinner ? "#43e09a" : "#f0c45b", { "text-anchor": "end" });
}

function drawMatch(svg, match, pos) {
  const winner = matchWinner(match);
  const border = isLive(match) ? "#e8625d" : winner ? "#43e09a" : "rgba(245,234,208,.18)";
  appendRect(svg, pos.x, pos.y, pos.w, pos.h, 18, winner ? "url(#cardWin)" : "url(#card)", border, winner ? 2 : 1.2, { filter: "url(#softShadow)" });
  appendRect(svg, pos.x + 14, pos.y + 12, 54, 24, 12, "rgba(245,234,208,.08)", "rgba(245,234,208,.15)", 1);
  appendText(svg, pos.x + 41, pos.y + 29, stageShort[match.stage] || match.stage, 12, 850, "#f0c45b", { "text-anchor": "middle" });

  const statusFill = isLive(match) ? "#e8625d" : isComplete(match) ? "#0f7652" : "rgba(245,234,208,.08)";
  appendRect(svg, pos.x + pos.w - 110, pos.y + 12, 94, 24, 12, statusFill, "rgba(255,255,255,.12)", 1);
  appendText(svg, pos.x + pos.w - 63, pos.y + 29, truncateText(statusLabel(match), 12), 11, 850, "#fff7df", { "text-anchor": "middle" });

  appendText(svg, pos.x + 78, pos.y + 29, `M${match.order || ""}`, 13, 750, "#9fb3aa");
  const winnerCode = winner?.code;
  drawTeam(svg, pos.x, pos.y + 46, pos.w, match.team1, match.score1, Boolean(winnerCode && winnerCode === match.team1?.code));
  drawTeam(svg, pos.x, pos.y + 78, pos.w, match.team2, match.score2, Boolean(winnerCode && winnerCode === match.team2?.code));
}

function drawChampion(svg, data, pos) {
  const final = data.matches.find((match) => match.stage === "FINAL");
  const champ = matchWinner(final);
  appendRect(svg, pos.x, pos.y, pos.w, pos.h, 24, "rgba(8,14,12,.88)", "rgba(240,196,91,.64)", 1.8, { filter: "url(#softShadow)" });
  appendRect(svg, pos.x + 22, pos.y + 20, pos.w - 44, 34, 17, "url(#gold)", "none", 0);
  appendText(svg, pos.x + pos.w / 2, pos.y + 43, "CHAMPION", 13, 850, "#170d04", { "text-anchor": "middle" });
  appendText(svg, pos.x + pos.w / 2, pos.y + 88, truncateText(champ?.name || "будет здесь", 16), 24, 850, "#fff7df", { "text-anchor": "middle" });
}

function renderBracket(data) {
  const shell = document.getElementById("bracket");
  shell.innerHTML = "";
  const svg = svgEl("svg", { id: "bracketSvg", viewBox: "0 0 1840 1120", role: "img", "aria-label": "Живая сетка плей-офф ЧМ-2026" });
  createDefs(svg);
  drawBoard(svg);

  const { stages, positions } = layoutMatches(data.matches);
  const headings = [
    ["R16", 72, "1/8 финала"],
    ["QF", 472, "1/4 финала"],
    ["SF", 866, "1/2 финала"],
    ["FINAL", 1260, "Финал"]
  ];
  headings.forEach(([, x, label]) => {
    appendText(svg, x, 162, label, 22, 850, "#fff7df");
    appendRect(svg, x, 171, 116, 4, 2, "#f0c45b", "none", 0);
  });

  data.matches.forEach((match) => {
    const from = positions.get(match.id);
    const to = positions.get(match.nextMatchId);
    if (from && to) appendConnector(svg, from, to, Boolean(matchWinner(match)));
  });

  const final = stages.FINAL[0];
  const finalPos = final ? positions.get(final.id) : null;
  const champPos = positions.get("champion");
  if (finalPos && champPos) appendConnector(svg, finalPos, champPos, false);

  [...stages.R16, ...stages.QF, ...stages.SF, ...stages.FINAL].forEach((match) => {
    const pos = positions.get(match.id);
    if (pos) drawMatch(svg, match, pos);
  });

  if (champPos) drawChampion(svg, data, champPos);

  shell.appendChild(svg);
}

function formatUpdated(dateValue) {
  if (!dateValue) return "нет данных";
  return new Date(dateValue).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function nextScheduledMatch(matches) {
  const scheduled = matches
    .filter((match) => !isComplete(match))
    .sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
  return scheduled[0] || null;
}

function updateDashboard(data) {
  const completed = data.matches.filter(isComplete).length;
  const next = nextScheduledMatch(data.matches);

  document.getElementById("updatedAt").textContent = formatUpdated(data.meta.updatedAt);
  document.getElementById("progressStat").textContent = `${completed}/${data.matches.length}`;
  document.getElementById("nextMatchStat").textContent = next
    ? `${flagFor(next.team1?.code)} ${next.team1?.code || "TBD"} - ${flagFor(next.team2?.code)} ${next.team2?.code || "TBD"}`
    : "финал ожидается";
  document.getElementById("matchCount").textContent = `${data.matches.length} матчей`;
  document.getElementById("focusTitle").textContent = next
    ? `${flagFor(next.team1?.code)} ${next.team1?.code || "TBD"} - ${flagFor(next.team2?.code)} ${next.team2?.code || "TBD"}`
    : "Финал";
  document.getElementById("focusMeta").textContent = next
    ? next.kickoffLocal || "время уточняется"
    : "все матчи завершены";
}

function predictionKey(match) {
  return `worldcup-prediction-${match?.id || "none"}`;
}

function renderPrediction(data) {
  const next = nextScheduledMatch(data.matches);
  const title = document.getElementById("predictTitle");
  const options = document.getElementById("winnerOptions");
  const form = document.getElementById("predictionForm");
  const result = document.getElementById("predictionResult");
  const oneLabel = document.getElementById("scoreOneLabel");
  const twoLabel = document.getElementById("scoreTwoLabel");
  if (!next) {
    title.textContent = "Прогноз закрыт";
    options.innerHTML = "";
    form.style.display = "none";
    result.textContent = "Все матчи завершены";
    return;
  }

  form.style.display = "grid";
  const teamOne = next.team1 || { code: "TBD", name: "Команда 1" };
  const teamTwo = next.team2 || { code: "TBD", name: "Команда 2" };
  title.textContent = `${flagFor(teamOne.code)} ${teamOne.name} — ${flagFor(teamTwo.code)} ${teamTwo.name}`;
  oneLabel.textContent = teamOne.code || "1";
  twoLabel.textContent = teamTwo.code || "2";
  options.innerHTML = [teamOne, teamTwo].map((team, index) => `
    <label>
      <input type="radio" name="winner" value="${escapeHtml(team.code || `team${index + 1}`)}" ${index === 0 ? "checked" : ""}>
      <span>${escapeHtml(flagFor(team.code))}</span>
      <span>${escapeHtml(team.name || "TBD")}</span>
    </label>
  `).join("");

  const saved = JSON.parse(localStorage.getItem(predictionKey(next)) || "null");
  result.textContent = saved
    ? `Ваш прогноз: ${saved.flag} ${saved.winnerName}, счёт ${saved.scoreOne}:${saved.scoreTwo}`
    : "Выберите победителя и счёт";

  form.onsubmit = (event) => {
    event.preventDefault();
    const winnerCode = new FormData(form).get("winner");
    const winnerTeam = [teamOne, teamTwo].find((team) => team.code === winnerCode) || teamOne;
    const scoreOne = document.getElementById("scoreOne").value || "0";
    const scoreTwo = document.getElementById("scoreTwo").value || "0";
    const payload = {
      winnerCode,
      winnerName: winnerTeam.name,
      flag: flagFor(winnerTeam.code),
      scoreOne,
      scoreTwo,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(predictionKey(next), JSON.stringify(payload));
    result.textContent = `Ваш прогноз: ${payload.flag} ${payload.winnerName}, счёт ${scoreOne}:${scoreTwo}`;
  };
}

function renderMatchList(data) {
  const list = document.getElementById("matchList");
  const matches = [...data.matches].sort((a, b) => {
    return (stageOrder[a.stage] || 99) - (stageOrder[b.stage] || 99) || (a.order || 0) - (b.order || 0);
  });

  list.innerHTML = matches.map((match) => {
    const winner = matchWinner(match);
    const winnerCode = winner?.code;
    const teamOneWin = winnerCode && winnerCode === match.team1?.code;
    const teamTwoWin = winnerCode && winnerCode === match.team2?.code;
    return `
      <article class="match-card ${matchClass(match)}">
        <div class="match-meta">
          <span>${escapeHtml(stageLabels[match.stage] || match.stage)} · M${escapeHtml(match.order || "")}</span>
          <span class="pill">${escapeHtml(statusLabel(match))}</span>
        </div>
        <div class="team-row ${teamOneWin ? "is-winner" : ""}">
          <span class="team-flag">${escapeHtml(flagFor(match.team1?.code || "TBD"))}</span>
          <span class="team-code">${escapeHtml(match.team1?.code || "TBD")}</span>
          <span class="team-name">${escapeHtml(match.team1?.name || "Пока неизвестно")}</span>
          <span class="team-score">${match.score1 ?? "–"}</span>
        </div>
        <div class="team-row ${teamTwoWin ? "is-winner" : ""}">
          <span class="team-flag">${escapeHtml(flagFor(match.team2?.code || "TBD"))}</span>
          <span class="team-code">${escapeHtml(match.team2?.code || "TBD")}</span>
          <span class="team-name">${escapeHtml(match.team2?.name || "Пока неизвестно")}</span>
          <span class="team-score">${match.score2 ?? "–"}</span>
        </div>
      </article>
    `;
  }).join("");
}

function render(data) {
  latestData = hydrateBracket(data);
  updateDashboard(latestData);
  renderBracket(latestData);
  renderPrediction(latestData);
  renderMatchList(latestData);
}

async function loadData() {
  const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Не удалось загрузить ${DATA_URL}: ${res.status}`);
  const data = await res.json();
  render(data);
}

async function downloadPng() {
  const svg = document.getElementById("bracketSvg");
  if (!svg) return;
  const cloned = svg.cloneNode(true);
  cloned.setAttribute("width", "1840");
  cloned.setAttribute("height", "1120");
  const svgText = new XMLSerializer().serializeToString(cloned);
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1840;
    canvas.height = 1120;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#06100d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replaceAll(":", "-");
    link.download = `worldcup-bracket-${stamp}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  img.src = url;
}

document.getElementById("refreshBtn").addEventListener("click", () => loadData().catch((err) => alert(err.message)));
document.getElementById("pngBtn").addEventListener("click", downloadPng);

loadData().catch((err) => {
  document.getElementById("bracket").innerHTML = `<div class="error-state">Ошибка загрузки данных: ${escapeHtml(err.message)}</div>`;
});

setInterval(() => {
  loadData().catch(console.error);
}, POLL_MS);
