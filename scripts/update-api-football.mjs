import fs from "node:fs/promises";

const DATA_FILE = new URL("../data/matches.json", import.meta.url);
const API_KEY = process.env.APIFOOTBALL_KEY;
const API_URL = process.env.APIFOOTBALL_URL || "https://apiv3.apifootball.com/";
const LEAGUE_ID = process.env.APIFOOTBALL_LEAGUE_ID || "";
const TIMEZONE = process.env.APIFOOTBALL_TIMEZONE || "Europe/Moscow";

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

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zа-я0-9]+/g, "");
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

function findEvent(match, events) {
  const byId = events.find((event) => String(event.match_id) === String(match.id));
  if (byId) return byId;

  const home = normalize(match.team1?.name);
  const away = normalize(match.team2?.name);
  return events.find((event) => {
    const eventHome = normalize(event.match_hometeam_name);
    const eventAway = normalize(event.match_awayteam_name);
    return eventHome === home && eventAway === away;
  });
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

function applyEvent(match, event) {
  const updated = structuredClone(match);
  updated.kickoff = buildKickoff(event, updated.kickoff);
  updated.score1 = parseScore(event.match_hometeam_score);
  updated.score2 = parseScore(event.match_awayteam_score);
  updated.penalty1 = parseScore(event.match_hometeam_penalty_score);
  updated.penalty2 = parseScore(event.match_awayteam_penalty_score);
  updated.status = statusFromEvent(event);
  updated.kickoffLocal = formatKickoffLocal(updated);
  updated.winner = winnerFrom(updated);
  return updated;
}

async function main() {
  if (!API_KEY) {
    console.log("APIFOOTBALL_KEY is not set; keeping existing data.");
    return;
  }

  const raw = await fs.readFile(DATA_FILE, "utf8");
  const data = JSON.parse(raw);
  const events = await fetchEvents(data);
  let changed = false;

  data.matches = data.matches.map((match) => {
    const event = findEvent(match, events);
    if (!event) return match;
    const updated = applyEvent(match, event);
    if (JSON.stringify(updated) !== JSON.stringify(match)) changed = true;
    return updated;
  });

  if (!changed) {
    console.log("No match changes from APIFootball.");
    return;
  }

  data.meta = {
    ...data.meta,
    updatedAt: new Date().toISOString(),
    source: "APIFootball live data",
    timezone: TIMEZONE
  };

  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("Updated data/matches.json from APIFootball.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
