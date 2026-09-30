import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, CAPACITY, formatDate } from "../firebase.js";
import { splitSignups } from "../game-utils.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const leagueId = params.get("league");
const gameId = params.get("game");
let game = null;
let players = [];
let signups = [];
let selectedPlayer = null;

function status(id, text, success = false) {
  $(id).textContent = text;
  $(id).classList.toggle("success", success);
}

function render() {
  if (!game) return;
  const { confirmed, queue } = splitSignups(signups);
  $("game-detail").hidden = false;
  $("game-heading").textContent = game.title;
  $("game-date").textContent = formatDate(game.startsAt);
  $("spot-count").textContent = `${confirmed.length} / ${CAPACITY} in game · ${queue.length} waitlisted`;
  $("signup-form").hidden = game.status !== "open";
  for (const [target, people] of [["confirmed-list", confirmed], ["waitlist-list", queue]]) {
    const list = $(target);
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
    button.addEventListener("click", () => {
      input.value = player.name;
      selectedPlayer = player;
      input.focus();
      hideOptions();
    });
    li.append(button);
    list.append(li);
  });
  list.hidden = !list.children.length;
  input.setAttribute("aria-expanded", String(!list.hidden));
}

$("name-input").addEventListener("input", () => { selectedPlayer = null; showOptions(); });
$("name-input").addEventListener("focus", showOptions);
$("name-input").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideOptions();
  if (event.key === "ArrowDown" && !$("name-options").hidden) {
    event.preventDefault();
    $("name-options").querySelector("button")?.focus();
  }
});
document.addEventListener("click", (event) => { if (!event.target.closest(".name-field")) hideOptions(); });

$("share-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); status("signup-message", "Link copied.", true); }
  catch { status("signup-message", "Copy the URL from your browser's address bar."); }
});

$("signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const player = selectedPlayer || players.find((item) => item.name.toLocaleLowerCase() === $("name-input").value.trim().toLocaleLowerCase());
  if (!game || game.status !== "open") return status("signup-message", "This game is closed.");
  if (!player) return status("signup-message", "Choose a name from the suggestions.");
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
      if (!playerDoc.exists()) throw new Error("That name is no longer available.");
      if (signupDoc.exists()) throw new Error("This name has already joined this game.");
      const position = gameDoc.data().nextPosition;
      tx.update(gameRef, { nextPosition: position + 1, lastSignupId: player.id });
      tx.set(signupRef, { playerId: player.id, name: playerDoc.data().name, position, placement: "auto", attended: false, createdAt: serverTimestamp() });
    });
    $("name-input").value = "";
    selectedPlayer = null;
    hideOptions();
    status("signup-message", "You're on the list! Your place will appear below.", true);
  } catch (error) {
    status("signup-message", error.code === "permission-denied" ? "Signup was denied. Please try again later." : error.message || "Could not join this game.");
  } finally { button.disabled = false; }
});

if (!leagueId || !gameId) {
  status("page-message", "Game link is incomplete. Go back to all games.");
} else {
  onSnapshot(doc(db, "leagues", leagueId), (snapshot) => {
    if (snapshot.exists()) $("league-name").textContent = snapshot.data().title;
  }, () => status("page-message", "Could not load the league."));
  onSnapshot(doc(db, "leagues", leagueId, "games", gameId), (snapshot) => {
    if (!snapshot.exists()) return status("page-message", "Game not found. Go back to all games.");
    game = snapshot.data();
    document.title = `${game.title} · TEAMZEUSS!!!!`;
    status("page-message", "");
    render();
  }, () => status("page-message", "Could not load this game."));
  onSnapshot(collection(db, "leagues", leagueId, "players"), (snapshot) => {
    players = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name));
  }, () => status("signup-message", "Could not load names."));
  onSnapshot(collection(db, "leagues", leagueId, "games", gameId, "signups"), (snapshot) => {
    signups = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    render();
  }, () => status("signup-message", "Could not load signups."));
}
