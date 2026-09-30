import { collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, CAPACITY, formatDate } from "../firebase.js";
import { splitSignups } from "../game-utils.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const leagueId = params.get("league");
const gameId = params.get("game");
const savedNameKey = `teamzeuss:name:${leagueId}:${gameId}`;
let game = null;
let players = [];
let signups = [];
let signupsLoaded = false;
let activePlayer = null;

function status(id, text, success = false) {
  $(id).textContent = text;
  $(id).classList.toggle("success", success);
}

function currentSignup() {
  return activePlayer ? signups.find((signup) => signup.id === activePlayer.id) : null;
}

function render() {
  if (!game) return;
  const { confirmed, queue } = splitSignups(signups);
  $("game-detail").hidden = false;
  $("game-heading").textContent = game.title;
  $("game-date").textContent = formatDate(game.startsAt);
  $("spot-count").textContent = `${confirmed.length} / ${CAPACITY} playing · ${queue.length} waitlisted`;
  $("name-form").hidden = !!activePlayer;
  $("player-panel").hidden = !activePlayer;
  if (activePlayer) {
    $("selected-name").textContent = activePlayer.name;
    const signup = currentSignup();
    const place = confirmed.findIndex((person) => person.id === activePlayer.id);
    const wait = queue.findIndex((person) => person.id === activePlayer.id);
    $("my-status").textContent = !signupsLoaded ? "Checking your status…" :
      signup ? (place >= 0 ? `You are playing (#${place + 1}).` : `You are on the waitlist (#${wait + 1}).`) :
      game.status === "open" ? (confirmed.length >= CAPACITY ? "You can join the waitlist." : "You can play.") : "You did not join this game.";
    $("join-button").textContent = confirmed.length >= CAPACITY ? "Join Waitlist" : "Can Play";
    $("join-button").hidden = !signupsLoaded || !!signup || game.status !== "open";
    $("leave-button").textContent = wait >= 0 ? "Leave waitlist" : "Not Playing";
    $("leave-button").hidden = !signupsLoaded || !signup || game.status !== "open";
  }
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
      if (person.id === activePlayer?.id) li.className = "my-name";
      list.append(li);
    });
  }
}

function hideOptions() {
  $("name-options").hidden = true;
  $("name-input").setAttribute("aria-expanded", "false");
}

function selectPlayer(player) {
  activePlayer = player;
  sessionStorage.setItem(savedNameKey, player.id);
  $("name-input").value = "";
  hideOptions();
  status("signup-message", "");
  render();
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
      selectPlayer(player);
    });
    li.append(button);
    list.append(li);
  });
  list.hidden = !list.children.length;
  input.setAttribute("aria-expanded", String(!list.hidden));
}

$("name-input").addEventListener("input", showOptions);
$("name-input").addEventListener("focus", showOptions);
$("name-input").addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideOptions();
  if (event.key === "ArrowDown" && !$("name-options").hidden) {
    event.preventDefault();
    $("name-options").querySelector("button")?.focus();
  }
});
document.addEventListener("click", (event) => { if (!event.target.closest(".name-field")) hideOptions(); });

$("name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const player = players.find((item) => item.name.toLocaleLowerCase() === $("name-input").value.trim().toLocaleLowerCase());
  if (!player) return status("signup-message", "Choose a name from the suggestions.");
  selectPlayer(player);
});

$("change-name").addEventListener("click", () => {
  activePlayer = null;
  sessionStorage.removeItem(savedNameKey);
  status("signup-message", "");
  render();
  $("name-input").focus();
});

$("share-button").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); status("signup-message", "Link copied.", true); }
  catch { status("signup-message", "Copy the URL from your browser's address bar."); }
});

$("join-button").addEventListener("click", async () => {
  if (!activePlayer || !game || game.status !== "open") return;
  const player = activePlayer;
  const button = $("join-button");
  button.disabled = true;
  status("signup-message", "Saving…");
  try {
    const gameRef = doc(db, "leagues", leagueId, "games", gameId);
    const playerRef = doc(db, "leagues", leagueId, "players", player.id);
    const signupRef = doc(db, "leagues", leagueId, "games", gameId, "signups", player.id);
    const position = await runTransaction(db, async (tx) => {
      const [gameDoc, playerDoc, signupDoc] = await Promise.all([tx.get(gameRef), tx.get(playerRef), tx.get(signupRef)]);
      if (!gameDoc.exists() || gameDoc.data().status !== "open") throw new Error("This game is closed.");
      if (!playerDoc.exists()) throw new Error("That name is no longer available.");
      if (signupDoc.exists()) throw new Error("This name has already joined this game.");
      const nextPosition = gameDoc.data().nextPosition;
      tx.update(gameRef, { nextPosition: nextPosition + 1, lastSignupId: player.id });
      tx.set(signupRef, { playerId: player.id, name: playerDoc.data().name, position: nextPosition, placement: "auto", attended: false, createdAt: serverTimestamp() });
      return nextPosition;
    });
    if (!signups.some((signup) => signup.id === player.id)) {
      signups.push({ id: player.id, playerId: player.id, name: player.name, position, placement: "auto", attended: false });
    }
    render();
    status("signup-message", "Added.", true);
  } catch (error) {
    status("signup-message", error.code === "permission-denied" ? "Could not join. Please try again later." : error.message || "Could not join this game.");
  } finally { button.disabled = false; }
});

$("leave-button").addEventListener("click", async () => {
  if (!activePlayer || !currentSignup()) return;
  const player = activePlayer;
  const button = $("leave-button");
  button.disabled = true;
  status("signup-message", "Removing…");
  try {
    await deleteDoc(doc(db, "leagues", leagueId, "games", gameId, "signups", player.id));
    signups = signups.filter((signup) => signup.id !== player.id);
    render();
    status("signup-message", "Removed.", true);
  } catch (error) {
    status("signup-message", error.code === "permission-denied" ? "Could not leave. The updated Firestore rules must be published." : error.message || "Could not leave this game.");
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
    const selectedId = activePlayer?.id || sessionStorage.getItem(savedNameKey);
    activePlayer = players.find((player) => player.id === selectedId) || null;
    if (selectedId && !activePlayer) sessionStorage.removeItem(savedNameKey);
    render();
  }, () => status("signup-message", "Could not load names."));
  onSnapshot(collection(db, "leagues", leagueId, "games", gameId, "signups"), (snapshot) => {
    signups = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    signupsLoaded = true;
    render();
  }, () => status("signup-message", "Could not load signups."));
}
