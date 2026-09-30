import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db, CAPACITY, formatDate, HOST_EMAIL, HOST_UID, rosterId } from "../firebase.js";
import { splitSignups } from "../game-utils.js";

const $ = (id) => document.getElementById(id);
let leagues = [];
let players = [];
let games = [];
let leagueId = null;
let manageGameId = null;
let stopLeagues, stopPlayers, stopGames;
const signupStops = new Map();
const gameSignups = new Map();

function message(text, success = false) {
  $("host-message").textContent = text;
  $("host-message").classList.toggle("success", success);
}

function clearLeagueListeners() {
  stopPlayers?.(); stopGames?.();
  stopPlayers = stopGames = null;
  signupStops.forEach((stop) => stop());
  signupStops.clear(); gameSignups.clear();
  players = []; games = []; manageGameId = null;
  $("manage-panel").hidden = true;
}

function renderLeagueSelect() {
  const select = $("league-select");
  select.replaceChildren();
  const first = document.createElement("option");
  first.value = ""; first.textContent = "Select a league";
  select.append(first);
  leagues.forEach((league) => {
    const option = document.createElement("option");
    option.value = league.id; option.textContent = league.title;
    select.append(option);
  });
  select.value = leagueId || "";
}

function selectLeague(id) {
  clearLeagueListeners();
  leagueId = id || null;
  $("league-select").value = leagueId || "";
  $("league-admin").hidden = !leagueId;
  if (!leagueId) return;
  stopPlayers = onSnapshot(collection(db, "leagues", leagueId, "players"), (snapshot) => {
    players = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name));
    renderRoster(); renderAddPlayers();
  }, () => message("Could not load this league's roster."));
  stopGames = onSnapshot(collection(db, "leagues", leagueId, "games"), (snapshot) => {
    games = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const ids = new Set(games.map((game) => game.id));
    for (const [id, stop] of signupStops) {
      if (!ids.has(id)) { stop(); signupStops.delete(id); gameSignups.delete(id); }
    }
    games.forEach((game) => {
      if (signupStops.has(game.id)) return;
      const stop = onSnapshot(collection(db, "leagues", leagueId, "games", game.id, "signups"), (signupsSnapshot) => {
        gameSignups.set(game.id, signupsSnapshot.docs.map((item) => ({ id: item.id, ref: item.ref, ...item.data() })));
        renderGames();
        if (manageGameId === game.id) renderManagedGame();
      }, () => message(`Could not load signups for ${game.title}.`));
      signupStops.set(game.id, stop);
    });
    if (manageGameId && !ids.has(manageGameId)) { manageGameId = null; $("manage-panel").hidden = true; }
    renderGames(); renderManagedGame();
  }, () => message("Could not load games."));
}

function renderRoster() {
  const list = $("roster-list");
  list.replaceChildren();
  if (!players.length) {
    const li = document.createElement("li"); li.textContent = "No names yet."; list.append(li);
  }
  players.forEach((player) => {
    const li = document.createElement("li");
    const name = document.createElement("span"); name.textContent = player.name;
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary small"; remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!confirm(`Remove ${player.name} from this league's roster? Existing game records remain.`)) return;
      try { await deleteDoc(doc(db, "leagues", leagueId, "players", player.id)); message(`${player.name} removed.`, true); }
      catch { message("Could not remove that name."); }
    });
    li.append(name, remove); list.append(li);
  });
}

function renderAddPlayers() {
  const select = $("add-player");
  const previous = select.value;
  select.replaceChildren();
  const first = document.createElement("option"); first.value = ""; first.textContent = "Choose an approved name"; select.append(first);
  players.forEach((player) => {
    const option = document.createElement("option"); option.value = player.id; option.textContent = player.name; select.append(option);
  });
  select.value = players.some((player) => player.id === previous) ? previous : "";
}

function action(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button"; button.className = className; button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderGames() {
  const list = $("admin-game-list");
  list.replaceChildren();
  if (!games.length) {
    const li = document.createElement("li"); li.textContent = "No games yet."; list.append(li);
  }
  games.forEach((game) => {
    const { confirmed, queue } = splitSignups(gameSignups.get(game.id) || []);
    const played = (gameSignups.get(game.id) || []).filter((person) => person.attended === true).length;
    const li = document.createElement("li");
    const details = document.createElement("span");
    details.textContent = `${game.title} · ${formatDate(game.startsAt)} · ${game.status} · ${confirmed.length} playing · ${queue.length} waitlisted · ${played} played`;
    const buttons = document.createElement("div");
    buttons.append(action("Manage", "secondary small", () => manageGame(game.id)));
    buttons.append(action(game.status === "open" ? "Close" : "Reopen", "secondary small", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await updateDoc(doc(db, "leagues", leagueId, "games", game.id), { status: game.status === "open" ? "closed" : "open" }); message("Game updated.", true); }
      catch { message("Could not update this game."); button.disabled = false; }
    }));
    const view = document.createElement("a");
    view.href = `../game/?${new URLSearchParams({ league: leagueId, game: game.id })}`;
    view.className = "subtle-link small"; view.textContent = "Public view";
    buttons.append(view); li.append(details, buttons); list.append(li);
  });
}

function manageGame(id) {
  manageGameId = id;
  $("manage-panel").hidden = false;
  renderManagedGame();
  $("manage-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderManagedGame() {
  if (!manageGameId) return;
  const game = games.find((item) => item.id === manageGameId);
  if (!game) return;
  $("manage-title").textContent = `${game.title} · ${formatDate(game.startsAt)}`;
  const { confirmed, queue } = splitSignups(gameSignups.get(game.id) || []);
  for (const [target, people, placement] of [["manage-confirmed", confirmed, "confirmed"], ["manage-queue", queue, "queue"]]) {
    const list = $(target); list.replaceChildren();
    if (!people.length) { const li = document.createElement("li"); li.textContent = "No one yet."; list.append(li); }
    people.forEach((person) => {
      const li = document.createElement("li");
      const label = document.createElement("span"); label.textContent = `${person.name}${person.attended ? " · played" : ""}`;
      const buttons = document.createElement("div");
      buttons.append(action(person.attended ? "Undo played" : "Mark played", "secondary small", async () => {
        try { await updateDoc(person.ref, { attended: !person.attended }); message("Attendance updated.", true); }
        catch { message("Could not update attendance."); }
      }));
      buttons.append(action(placement === "confirmed" ? "To waitlist" : "To playing", "secondary small", async () => {
        if (placement === "queue" && confirmed.filter((item) => item.placement === "confirmed").length >= CAPACITY) return message("All 15 playing spots are pinned. Move someone to the waitlist first.");
        try { await updateDoc(person.ref, { placement: placement === "confirmed" ? "queue" : "confirmed" }); message("Placement updated.", true); }
        catch { message("Could not move that person."); }
      }));
      buttons.append(action("Remove", "danger small", async () => {
        if (!confirm(`Remove ${person.name} from this game?`)) return;
        try { await deleteDoc(person.ref); message("Signup removed.", true); }
        catch { message("Could not remove signup."); }
      }));
      li.append(label, buttons); list.append(li);
    });
  }
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (HOST_EMAIL === "REPLACE_WITH_HOST_EMAIL" || HOST_UID === "REPLACE_WITH_HOST_UID") return message("Set the host email and UID in firebase.js first.");
  const button = event.currentTarget.querySelector("button"); button.disabled = true; message("");
  try {
    const result = await signInWithEmailAndPassword(auth, HOST_EMAIL, $("password").value);
    if (result.user.uid !== HOST_UID) { await signOut(auth); message("This account is not the designated admin."); }
  } catch { message("Wrong password or Firebase Authentication is not configured."); }
  finally { button.disabled = false; $("password").value = ""; }
});
$("signout-button").addEventListener("click", () => signOut(auth));
$("league-select").addEventListener("change", (event) => selectLeague(event.target.value));
$("manage-close").addEventListener("click", () => { manageGameId = null; $("manage-panel").hidden = true; });

$("league-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = $("league-title-input").value.trim(); if (!title) return;
  const button = form.querySelector("button"); button.disabled = true;
  try {
    const ref = await addDoc(collection(db, "leagues"), { title, createdAt: serverTimestamp() });
    form.reset(); selectLeague(ref.id); message("League created.", true);
  } catch (error) {
    const code = error.code || "unknown error";
    message(`Could not create league (${code}). ${code === "permission-denied" ? "Publish the updated firestore.rules in Firebase." : "Check the browser console for details."}`);
    console.error("Create league failed:", error);
  }
  finally { button.disabled = false; }
});

$("roster-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!leagueId) return;
  const names = $("roster-names").value.split(/\r?\n/).map((name) => name.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!names.length) return;
  if (names.some((name) => name.length > 80)) return message("Each name must be 80 characters or fewer.");
  const existing = new Set(players.map((person) => person.id));
  const additions = [];
  for (const name of names) {
    const id = rosterId(name);
    if (!existing.has(id)) { additions.push({ id, name }); existing.add(id); }
  }
  if (!additions.length) return message("All of those names are already on this roster.");
  const button = form.querySelector("button"); button.disabled = true;
  try {
    for (let offset = 0; offset < additions.length; offset += 400) {
      const batch = writeBatch(db);
      additions.slice(offset, offset + 400).forEach(({ id, name }) => batch.set(doc(db, "leagues", leagueId, "players", id), { name, createdAt: serverTimestamp() }));
      await batch.commit();
    }
    form.reset(); message(`${additions.length} name${additions.length === 1 ? "" : "s"} added.`, true);
  } catch { message("Could not add all names. Refresh the roster before trying again."); }
  finally { button.disabled = false; }
});

$("game-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = $("game-title").value.trim(), startsAt = $("game-time").value;
  if (!title || !startsAt || !leagueId) return;
  const button = form.querySelector("button"); button.disabled = true;
  try {
    await addDoc(collection(db, "leagues", leagueId, "games"), { title, startsAt, status: "open", capacity: CAPACITY, nextPosition: 0, lastSignupId: "", createdAt: serverTimestamp() });
    form.reset(); message("Game created.", true);
  } catch { message("Could not create game."); }
  finally { button.disabled = false; }
});

$("add-signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const game = games.find((item) => item.id === manageGameId);
  const player = players.find((item) => item.id === $("add-player").value);
  const placement = $("add-placement").value;
  if (!game || !player) return message("Choose an approved name.");
  if (placement === "confirmed" && splitSignups(gameSignups.get(game.id) || []).confirmed.filter((item) => item.placement === "confirmed").length >= CAPACITY) return message("All 15 playing spots are pinned. Move someone to the waitlist first.");
  const button = event.currentTarget.querySelector("button"); button.disabled = true;
  try {
    const gameRef = doc(db, "leagues", leagueId, "games", game.id);
    const playerRef = doc(db, "leagues", leagueId, "players", player.id);
    const signupRef = doc(db, "leagues", leagueId, "games", game.id, "signups", player.id);
    await runTransaction(db, async (tx) => {
      const [gameDoc, playerDoc, signupDoc] = await Promise.all([tx.get(gameRef), tx.get(playerRef), tx.get(signupRef)]);
      if (!gameDoc.exists() || !playerDoc.exists()) throw new Error("Game or player no longer exists.");
      if (signupDoc.exists()) throw new Error("This person is already on this game.");
      const position = gameDoc.data().nextPosition;
      tx.update(gameRef, { nextPosition: position + 1, lastSignupId: player.id });
      tx.set(signupRef, { playerId: player.id, name: playerDoc.data().name, position, placement, attended: false, createdAt: serverTimestamp() });
    });
    $("add-player").value = ""; message(`${player.name} added to ${placement === "confirmed" ? "playing" : "the waitlist"}.`, true);
  } catch (error) { message(error.message || "Could not add person."); }
  finally { button.disabled = false; }
});

onAuthStateChanged(auth, (user) => {
  stopLeagues?.(); stopLeagues = null; clearLeagueListeners(); leagueId = null;
  const isHost = user?.uid === HOST_UID && HOST_UID !== "REPLACE_WITH_HOST_UID";
  $("login-panel").hidden = isHost;
  $("admin-panel").hidden = !isHost;
  if (!isHost) return;
  message("");
  stopLeagues = onSnapshot(collection(db, "leagues"), (snapshot) => {
    leagues = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => a.title.localeCompare(b.title));
    if (leagueId && !leagues.some((league) => league.id === leagueId)) selectLeague("");
    renderLeagueSelect();
  }, () => message("Could not load leagues."));
});
