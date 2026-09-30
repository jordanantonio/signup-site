import { CAPACITY } from "./firebase.js";

export function splitSignups(signups) {
  const sorted = [...signups].sort((a, b) => a.position - b.position);
  const pinned = sorted.filter((person) => person.placement === "confirmed");
  const automatic = sorted.filter((person) => person.placement !== "confirmed" && person.placement !== "queue");
  const eligible = [...pinned, ...automatic];
  const confirmed = eligible.slice(0, CAPACITY);
  const queue = [...eligible.slice(CAPACITY), ...sorted.filter((person) => person.placement === "queue")]
    .sort((a, b) => a.position - b.position);
  return { confirmed, queue };
}
