import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, CAPACITY, formatDate } from "./firebase.js";
import { splitSignups } from "./game-utils.js";

const $ = (id) => document.getElementById(id);
const leagues = new Map();
const games = new Map();
let players = [];
let leagueId = null;
let gameId = null;
let signups = [];
let selectedPlayer = null;
let stopGames, stopPlayers, stopSignups;

function status(id, text, success = false) {
  $(id).textContent = text;
  $(id).classList.toggle("success", success);
}

function empty(target, text) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = text;
  target.append(p);
}

function renderLeagues() {
  const list = $("league-list");
  list.replaceChildren();
  const all = [...leagues.values()].sort((a, b) => a.title.localeCompare(b.title));
  if (!all.length) empty(list, "No leagues yet.");
  all.forEach((league) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card game-card";
    const label = document.createElement("span");
    label.className = "badge";
    label.textContent = "League";
    const title = document.createElement("h3");
    title.textContent = league.title;
    button.append(label, title);
    button.addEventListener("click", () => selectLeague(league.id));
    list.append(button);
  });
  if (leagueId && leagues.has(leagueId)) $("league-title").textContent = leagues.get(leagueId).title;
}

function renderGames() {
  const all = [...games.values()];
  for (const [state, target, emptyText] of [["open", "open-games", "No open games yet."], ["closed", "past-games", "No previous games yet."]]) {
    const list = $(target);
    list.replaceChildren();
    const filtered = all.filter((game) => game.status === state).sort((a, b) => state === "open" ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt));
    if (!filtered.length) empty(list, emptyText);
    filtered.forEach((game) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card game-card";
      const badge = document.createElement("span");
      badge.className = `badge${state === "closed" ? " closed" : ""}`;
      badge.textContent = state === "open" ? "Open for signup" : "Previous game";
      const title = document.createElement("h3");
      title.textContent = game.title;
      const date = document.createElement("p");
      date.textContent = formatDate(game.startsAt);
      button.append(badge, title, date);
      button.addEventListener("click", () => selectGame(game.id));
      list.append(button);
    });
  }
  if (gameId) renderGame();
}

function renderGame() {
  const game = games.get(gameId);
  if (!game) return closeGame();
  const { confirmed, queue } = splitSignups(signups);
  $("game-heading").textContent = game.title;
  $("game-date").textContent = formatDate(game.startsAt);
  $("game-state").textContent = game.status === "open" ? "Open game" : "Previous game";
  $("spot-count").textContent = `${confirmed.length} / ${CAPACITY} in game · ${queue.length} waitlisted`;
  $("signup-form").hidden = game.status !== "open";
  for (const [id, people] of [["confirmed-list", confirmed], ["waitlist-list", queue]]) {
    const list = $(id);
    list.replaceChildren();
    if (!people.length) {
      const li = document.createElement("li");
      li.textContent = "No one yet.";
      list.append(li);
    }
    people.forEach((person) => {
      const li = document.createElement("li");
      li.textContent = person.name;
      list.append(li);
    });
  }
}

function setHash() {
  const params = new URLSearchParams();
  if (leagueId) params.set("league", leagueId);
  if (gameId) params.set("game", gameId);
  history.replaceState(null, "", params.size ? `#${params}` : location.pathname + location.search);
}

function selectLeague(id, initialGame = null) {
  if (!leagues.has(id)) return;
  stopGames?.(); stopPlayers?.(); stopSignups?.();
  stopGames = stopPlayers = stopSignups = null;
  leagueId = id; gameId = null; players = []; games.clear(); signups = [];
  $("league-picker").hidden = true;
  $("league-view").hidden = false;
  $("game-detail").hidden = true;
  $("league-title").textContent = leagues.get(id).title;
  setHash();
  stopPlayers = onSnapshot(collection(db, "leagues", id, "players"), (snapshot) => {
    players = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name));
  }, () => status("page-message", "Could not load this league's roster."));
  stopGames = onSnapshot(collection(db, "leagues", id, "games"), (snapshot) => {
    games.clear();
    snapshot.docs.forEach((item) => games.set(item.id, { id: item.id, ...item.data() }));
    renderGames();
    if (initialGame && games.has(initialGame)) { selectGame(initialGame); initialGame = null; }
  }, () => status("page-message", "Could not load this league's games."));
}

function selectGame(id) {
  if (!games.has(id)) return;
  stopSignups?.();
  gameId = id; signups = []; selectedPlayer = null;
  $("name-input").value = "";
  hideOptions();
  status("signup-message", "");
  $("game-detail").hidden = false;
  renderGame(); setHash();
  stopSignups = onSnapshot(collection(db, "leagues", leagueId, "games", id, "signups"), (snapshot) => {
    signups = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderGame();
  }, () => status("signup-message", "Could not load signups."));
  $("game-detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeGame() {
  stopSignups?.(); stopSignups = null; gameId = null;
  $("game-detail").hidden = true;
  setHash();
}

function hideOptions() {
  $("name-options").hidden = true;
  $("name-input").setAttribute("aria-expanded", "false");
}

function showOptions() {
  const input = $("name-input");
  const list = $("name-options");
  const term = input.value.trim().toLocaleLowerCase();
  list.replaceChildren();
  if (!term) return hideOptions();
  players.filter((player) => player.name.toLocaleLowerCase().includes(term)).slice(0, 8).forEach((player) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = player.name;
    button.addEventListener("click", () => { input.value = player.name; selectedPlayer = player; input.focus(); hideOptions(); });
    li.append(button); list.append(li);
  });
  list.hidden = !list.children.length;
  input.setAttribute("aria-expanded", String(!list.hidden));
}

$("back-leagues").addEventListener("click", () => {
  stopGames?.(); stopPlayers?.(); stopSignups?.();
  stopGames = stopPlayers = stopSignups = null;
  leagueId = gameId = null;
  $("league-view").hidden = true;
  $("league-picker").hidden = false;
  setHash();
});
$("back-games").addEventListener("click", closeGame);
$("name-input").addEventListener("input", () => { selectedPlayer = null; showOptions(); });
$("name-input").addEventListener("focus", showOptions);
$("name-input").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideOptions();
  if (event.key === "ArrowDown" && !$("name-options").hidden) { event.preventDefault(); $("name-options").querySelector("button")?.focus(); }
});
document.addEventListener("click", (event) => { if (!event.target.closest(".name-field")) hideOptions(); });

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const game = games.get(gameId);
  const player = selectedPlayer || players.find((item) => item.name.toLocaleLowerCase() === $("name-input").value.trim().toLocaleLowerCase());
  if (!game || game.status !== "open") return status("signup-message", "This game is closed.");
  if (!player) return status("signup-message", "Choose a name from this league's roster.");
  const button = $("join-button");
  button.disabled = true;
  status("signup-message", "Saving your place…");
  try {
    const gameRef = doc(db, "leagues", leagueId, "games", gameId);
    const playerRef = doc(db, "leagues", leagueId, "players", player.id);
    const signupRef = doc(db, "leagues", leagueId, "games", gameId, "signups", player.id);
    await runTransaction(db, async (tx) => {
      const [gameDoc, playerDoc, signupDoc] = await Promise.all([tx.get(gameRef), tx.get(playerRef), tx.get(signupRef)]);
      if (!gameDoc.exists() || gameDoc.data().status !== "open") throw new Error("This game is closed.");
      if (!playerDoc.exists()) throw new Error("That name is no longer on the league roster.");
      if (signupDoc.exists()) throw new Error("This name has already joined this game.");
      const position = gameDoc.data().nextPosition;
      tx.update(gameRef, { nextPosition: position + 1, lastSignupId: player.id });
      tx.set(signupRef, { playerId: player.id, name: playerDoc.data().name, position, placement: "auto", attended: false, createdAt: serverTimestamp() });
    });
    $("name-input").value = ""; selectedPlayer = null; hideOptions();
    status("signup-message", "You're on the list! Your place will appear below.", true);
  } catch (error) {
    status("signup-message", error.code === "permission-denied" ? "Signup was denied. Check the Firebase rules." : error.message || "Could not join this game.");
  } finally { button.disabled = false; }
});

onSnapshot(collection(db, "leagues"), (snapshot) => {
  leagues.clear();
  snapshot.docs.forEach((item) => leagues.set(item.id, { id: item.id, ...item.data() }));
  renderLeagues();
  if (leagueId && !leagues.has(leagueId)) $("back-leagues").click();
  if (!leagueId) {
    const params = new URLSearchParams(location.hash.slice(1));
    const initialLeague = params.get("league");
    if (initialLeague && leagues.has(initialLeague)) selectLeague(initialLeague, params.get("game"));
  }
}, () => status("page-message", "Could not load leagues. Check the Firebase setup."));
