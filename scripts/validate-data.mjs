import fs from "node:fs/promises";

const DATA_FILE = new URL("../data/matches.json", import.meta.url);
const terminalStatuses = new Set(["complete", "finished", "final", "ft", "aet", "pen"]);

function fail(message) {
  throw new Error(`Data validation failed: ${message}`);
}

function isComplete(match) {
  return terminalStatuses.has(String(match.status || "").toLowerCase());
}

function validDate(value) {
  return !value || !Number.isNaN(new Date(value).getTime());
}

function winnerTeam(match) {
  if (!match.winner || match.winner === "TBD") return null;
  const winner = String(match.winner).toUpperCase();
  if (match.team1?.code === winner) return match.team1;
  if (match.team2?.code === winner) return match.team2;
  return null;
}

const raw = await fs.readFile(DATA_FILE, "utf8");
if (/\?{3,}/.test(raw)) fail("file contains replacement question marks");

const data = JSON.parse(raw);
if (!data.meta?.updatedAt || !validDate(data.meta.updatedAt)) fail("meta.updatedAt is missing or invalid");
if (!Array.isArray(data.matches) || data.matches.length === 0) fail("matches array is empty");

const byId = new Map();
for (const match of data.matches) {
  if (!match.id) fail("match without id");
  if (byId.has(match.id)) fail(`duplicate match id ${match.id}`);
  byId.set(match.id, match);
}

for (const match of data.matches) {
  if (!match.stage) fail(`${match.id}: missing stage`);
  if (!match.team1?.code || !match.team2?.code) fail(`${match.id}: missing team code`);
  if (!validDate(match.kickoff)) fail(`${match.id}: invalid kickoff`);

  if (match.nextMatchId) {
    const next = byId.get(match.nextMatchId);
    if (!next) fail(`${match.id}: nextMatchId ${match.nextMatchId} not found`);
    if (!["team1", "team2"].includes(match.nextSlot)) fail(`${match.id}: invalid nextSlot`);
  }

  if (isComplete(match)) {
    if (typeof match.score1 !== "number" || typeof match.score2 !== "number") {
      fail(`${match.id}: completed match without numeric score`);
    }
    if (!winnerTeam(match)) fail(`${match.id}: winner does not match team codes`);
  }
}

console.log(`Validated ${data.matches.length} matches from ${data.meta.source || "unknown source"}.`);
