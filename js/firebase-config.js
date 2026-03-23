import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
export const db = getDatabase(app);
