import fs from "node:fs/promises";

const DATA_FILE = new URL("../data/matches.json", import.meta.url);
const API_KEY = process.env.APIFOOTBALL_KEY;
const API_URL = process.env.APIFOOTBALL_URL || "https://apiv3.apifootball.com/";
const LEAGUE_ID = process.env.APIFOOTBALL_LEAGUE_ID || "";
const TIMEZONE = process.env.APIFOOTBALL_TIMEZONE || "Europe/Moscow";
const SOURCE_LABEL = "API-Football get_events";

const terminalStatuses = new Set([
  "finished",
  "ft",
  "after pen.",
  "pen.",
  "aet",
  "after extra time",
  "ended"
]);
const liveStatuses = new Set(["1h", "2h", "ht", "et", "live", "pen", "break"]);
const teamAliases = {
  PAR: ["Paraguay", "Парагвай"],
  FRA: ["France", "Франция"],
  CAN: ["Canada", "Канада"],
  MAR: ["Morocco", "Марокко"],
  POR: ["Portugal", "Португалия"],
  ESP: ["Spain", "España", "Испания"],
  USA: ["USA", "US", "United States", "United States of America", "США"],
  BEL: ["Belgium", "Бельгия"],
  BRA: ["Brazil", "Brasil", "Бразилия"],
  NOR: ["Norway", "Норвегия"],
  MEX: ["Mexico", "México", "Мексика"],
  ENG: ["England", "Англия"],
  ARG: ["Argentina", "Аргентина"],
  EGY: ["Egypt", "Египет"],
  SUI: ["Switzerland", "Swiss", "Швейцария"],
  COL: ["Colombia", "Колумбия"]
};

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}0-9]+/gu, "");
}

function parseScore(value) {
  if (value === "" || value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function statusFromEvent(event) {
  const status = String(event.match_status || event.match_live || "").trim().toLowerCase();
  if (terminalStatuses.has(status)) return "complete";
  if (event.match_live === "1" || liveStatuses.has(status)) return "live";
  return "scheduled";
}

function winnerFrom(match) {
  if (match.status !== "complete") return null;
  if (typeof match.score1 === "number" && typeof match.score2 === "number") {
    if (match.score1 > match.score2) return match.team1.code;
    if (match.score2 > match.score1) return match.team2.code;
  }
  if (typeof match.penalty1 === "number" && typeof match.penalty2 === "number") {
    if (match.penalty1 > match.penalty2) return match.team1.code;
    if (match.penalty2 > match.penalty1) return match.team2.code;
  }
  return null;
}

function isUnknownTeam(team) {
  return !team?.code || team.code === "TBD";
}

function teamKeys(team) {
  const aliases = [team?.code, team?.name, ...(teamAliases[team?.code] || [])];
  return [...new Set(aliases.map(normalize).filter(Boolean))];
}

function teamMatches(team, eventName) {
  if (isUnknownTeam(team)) return false;
  const normalizedEvent = normalize(eventName);
  if (!normalizedEvent) return false;
  return teamKeys(team).some((key) => {
    if (key.length < 2) return false;
    return key === normalizedEvent || normalizedEvent.includes(key) || key.includes(normalizedEvent);
  });
}

function findEvent(match, events) {
  const byId = events.find((event) => String(event.match_id) === String(match.id));
  if (byId) return { event: byId, swapped: false };

  if (isUnknownTeam(match.team1) || isUnknownTeam(match.team2)) return null;
  for (const event of events) {
    const homeName = event.match_hometeam_name;
    const awayName = event.match_awayteam_name;
    const direct = teamMatches(match.team1, homeName) && teamMatches(match.team2, awayName);
    if (direct) return { event, swapped: false };
    const swapped = teamMatches(match.team1, awayName) && teamMatches(match.team2, homeName);
    if (swapped) return { event, swapped: true };
  }
  return null;
}

function buildKickoff(event, previousKickoff) {
  if (!event.match_date || !event.match_time) return previousKickoff;
  const iso = `${event.match_date}T${String(event.match_time).slice(0, 5)}:00+03:00`;
  return Number.isNaN(new Date(iso).getTime()) ? previousKickoff : iso;
}

function formatKickoffLocal(match) {
  if (match.status === "complete") return "Завершён";
  if (match.status === "live") return "LIVE";
  if (!match.kickoff) return "TBD";
  return new Date(match.kickoff).toLocaleString("ru-RU", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function fetchEvents(data) {
  const dates = data.matches
    .map((match) => match.kickoff)
    .filter(Boolean)
    .map((kickoff) => new Date(kickoff));
  const from = toDateOnly(Math.min(...dates));
  const to = toDateOnly(Math.max(...dates));
  const url = new URL(API_URL);
  url.searchParams.set("action", "get_events");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("timezone", TIMEZONE);
  url.searchParams.set("APIkey", API_KEY);
  if (LEAGUE_ID) url.searchParams.set("league_id", LEAGUE_ID);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`APIFootball returned ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(payload?.message || payload?.error || "APIFootball returned an unexpected response");
  }
  return payload;
}

function applyEvent(match, matchEvent) {
  const { event, swapped } = matchEvent;
  const homeScore = parseScore(event.match_hometeam_score);
  const awayScore = parseScore(event.match_awayteam_score);
  const homePenalty = parseScore(event.match_hometeam_penalty_score);
  const awayPenalty = parseScore(event.match_awayteam_penalty_score);
  const updated = structuredClone(match);
  updated.kickoff = buildKickoff(event, updated.kickoff);
  updated.score1 = swapped ? awayScore : homeScore;
  updated.score2 = swapped ? homeScore : awayScore;
  updated.penalty1 = swapped ? awayPenalty : homePenalty;
  updated.penalty2 = swapped ? homePenalty : awayPenalty;
  updated.status = statusFromEvent(event);
  updated.kickoffLocal = formatKickoffLocal(updated);
  updated.winner = winnerFrom(updated);
  return updated;
}

async function main() {
  if (!API_KEY) {
    const message = "APIFOOTBALL_KEY is not set. Add it in Settings -> Secrets and variables -> Actions.";
    if (process.env.GITHUB_ACTIONS === "true") throw new Error(message);
    console.log(`${message} Keeping existing data.`);
    return;
  }

  const raw = await fs.readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw);
  const events = await fetchEvents(data);
  let changed = false;
  const unmatched = [];

  data.matches = data.matches.map((match) => {
    const matchEvent = findEvent(match, events);
    if (!matchEvent) {
      if (!isUnknownTeam(match.team1) && !isUnknownTeam(match.team2) && match.status !== "complete") {
        unmatched.push(`${match.team1.code}-${match.team2.code}`);
      }
      return match;
    }
    const updated = applyEvent(match, matchEvent);
    if (JSON.stringify(updated) !== JSON.stringify(match)) changed = true;
    return updated;
  });

  if (unmatched.length) {
    console.log(`No API event match for: ${unmatched.join(", ")}`);
  }

  if (!changed) {
    console.log("No match changes from APIFootball.");
    return;
  }

  data.meta = {
    ...data.meta,
    updatedAt: new Date().toISOString(),
    source: SOURCE_LABEL,
    sourceUrl: "https://apifootball.com/documentation/",
    timezone: TIMEZONE
  };

  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("Updated data/matches.json from APIFootball.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
