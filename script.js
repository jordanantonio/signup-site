import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, formatDate } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const leagues = new Map();
const gameListeners = new Map();
const leagueGames = new Map();

const oldLink = new URLSearchParams(location.hash.slice(1));
if (oldLink.has("league") && oldLink.has("game")) {
  location.replace(`game/?${new URLSearchParams({ league: oldLink.get("league"), game: oldLink.get("game") })}`);
}

function renderGames() {
  const all = [...leagueGames.entries()].flatMap(([leagueId, games]) =>
    games.map((game) => ({ ...game, leagueId, leagueTitle: leagues.get(leagueId)?.title || "League" })));
  for (const [state, target, emptyText] of [["open", "open-games", "No open games yet."], ["closed", "past-games", "No previous games yet."]]) {
    const list = $(target);
    list.replaceChildren();
    const matching = all.filter((game) => game.status === state).sort((a, b) =>
      state === "open" ? a.startsAt.localeCompare(b.startsAt) : b.startsAt.localeCompare(a.startsAt));
    if (!matching.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = emptyText;
      list.append(p);
    }
    matching.forEach((game) => {
      const link = document.createElement("a");
      link.className = "card game-card";
      link.href = `game/?${new URLSearchParams({ league: game.leagueId, game: game.id })}`;
      const badge = document.createElement("span");
      badge.className = `badge${state === "closed" ? " closed" : ""}`;
      badge.textContent = game.leagueTitle;
      const title = document.createElement("h3");
      title.textContent = game.title;
      const date = document.createElement("p");
      date.textContent = formatDate(game.startsAt);
      link.append(badge, title, date);
      list.append(link);
    });
  }
}

onSnapshot(collection(db, "leagues"), (snapshot) => {
  leagues.clear();
  snapshot.docs.forEach((item) => leagues.set(item.id, { id: item.id, ...item.data() }));
  for (const [id, stop] of gameListeners) {
    if (!leagues.has(id)) { stop(); gameListeners.delete(id); leagueGames.delete(id); }
  }
  for (const id of leagues.keys()) {
    if (gameListeners.has(id)) continue;
    gameListeners.set(id, onSnapshot(collection(db, "leagues", id, "games"), (gamesSnapshot) => {
      leagueGames.set(id, gamesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      renderGames();
    }, () => { $("page-message").textContent = "Could not load games."; }));
  }
  renderGames();
}, () => { $("page-message").textContent = "Could not load games."; });
