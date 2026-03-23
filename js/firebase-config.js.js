// Firebase конфигурация
// Создайте свой проект в Firebase Console и замените эти значения
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDummyKeyForDemoReplaceWithYourOwn",
    authDomain: "chess-online-demo.firebaseapp.com",
    databaseURL: "https://chess-online-demo-default-rtdb.firebaseio.com",
    projectId: "chess-online-demo",
    storageBucket: "chess-online-demo.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};

let firebaseApp = null;
let database = null;
let firebaseInitialized = false;

function initFirebase() {
    try {
        if (firebase.apps.length) {
            firebaseApp = firebase.app();
        } else {
            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        }
        database = firebase.database(firebaseApp);
        
        // Проверка подключения
        database.ref('.info/connected').on('value', (snap) => {
            firebaseInitialized = snap.val() === true;
            updateFirebaseStatus(firebaseInitialized);
        });
        
        return true;
    } catch (e) {
        console.warn('Firebase initialization failed:', e);
        firebaseInitialized = false;
        updateFirebaseStatus(false);
        return false;
    }
}

function updateFirebaseStatus(connected) {
    const statusEl = document.getElementById('tokenStatus');
    const tokenInput = document.getElementById('tokenInput');
    
    if (statusEl) {
        if (connected) {
            statusEl.innerHTML = '<span class="status-dot online"></span> Firebase подключен';
            statusEl.style.color = '#10b981';
        } else {
            statusEl.innerHTML = '<span class="status-dot offline"></span> Локальный режим';
            statusEl.style.color = '#6b6b6b';
        }
    }
    
    if (tokenInput) {
        tokenInput.disabled = !connected;
    }
}

// Экспорт для использования в main.js
window.FirebaseAPI = {
    init: initFirebase,
    getDatabase: () => database,
    isConnected: () => firebaseInitialized
};