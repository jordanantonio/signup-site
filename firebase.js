import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCzD1IZmJbr9sWzPtk-FVRLIfZC2rf1TqQ",
  authDomain: "signup-site-58aa3.firebaseapp.com",
  projectId: "signup-site-58aa3",
  storageBucket: "signup-site-58aa3.firebasestorage.app",
  messagingSenderId: "414154078576",
  appId: "1:414154078576:web:7542f7063d9f935909f7b5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const CAPACITY = 15;
export const HOST_EMAIL = "zeus@gmail.com";
export const HOST_UID = "mnUKdjfR8HWqUmBERvgF7G82heh2";

export function rosterId(name) {
  return encodeURIComponent(name.trim().replace(/\s+/g, " ").toLocaleLowerCase());
}

export function formatDate(value) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
