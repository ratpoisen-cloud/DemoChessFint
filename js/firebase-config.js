import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_7Eh0wuaNY3eb-42uisssvOrSb6ESi_E",
  authDomain: "fentanylchess.firebaseapp.com",
  databaseURL: "https://fentanylchess-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fentanylchess",
  storageBucket: "fentanylchess.firebasestorage.app",
  messagingSenderId: "578661463625",
  appId: "1:578661463625:web:2877feb0d1a38f4961b198",
  measurementId: "G-N4HCS2P63T"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Делаем всё глобально доступным для обычных скриптов
window.db = db;
window.auth = auth;
window.ref = ref;
window.set = set;
window.onValue = onValue;
window.runTransaction = runTransaction;
window.update = update;
window.get = get;
window.signInWithPopup = signInWithPopup;
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signOut = signOut;
window.onAuthStateChanged = onAuthStateChanged;
