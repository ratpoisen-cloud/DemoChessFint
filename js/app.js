import { db } from './firebase-config.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- ИНИЦИАЛИЗАЦИЯ AUTH ---
const auth = getAuth();
const provider = new GoogleAuthProvider();
let currentUser = null;

const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');

// Логика входа
loginBtn.addEventListener('click', () => {
    console.log("Нажата кнопка входа");
    signInWithPopup(auth, provider)
        .then((result) => console.log("Успешный вход:", result.user.displayName))
        .catch((error) => console.error("Ошибка входа:", error.message));
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).then(() => console.log("Выход выполнен"));
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        document.getElementById('user-name').innerText = user.displayName.split(' ')[0];
        document.getElementById('user-photo').src = user.photoURL;
    } else {
        currentUser = null;
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
});

// --- ЛОГИКА ИГРЫ ---
const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    window.history.pushState({}, '', `?room=${roomId}`);
}
document.getElementById('room-link').value = window.location.href;

const gameRef = ref(db, 'games/' + roomId);
const playersRef = ref(db, 'games/' + roomId + '/players');

const ChessInstance = window.Chess || Chess;
let game = new ChessInstance();
let board = null;
let playerColor = null;

const statusEl = document.getElementById('status');
const modal = document.getElementById('game-modal');
const resignBtn = document.getElementById('resign-btn');
const rematchBtn = document.getElementById('rematch-btn');
const undoBtn = document.getElementById('undo-btn');

// Вход в комнату
runTransaction(playersRef, (players) => {
    if (!players) { playerColor = 'w'; return { white: true }; }
    else if (!players.black) { playerColor = 'b'; return { ...players, black: true }; }
    return;
}).then(() => {
    document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');
    if (playerColor === 'b') board.orientation('black');
    if (playerColor === 'b') update(gameRef, { gameState: 'playing' });
});

onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    if (data.fen && data.fen !== game.fen()) {
        game.load(data.fen);
        board.position(data.fen);
    }

    if (data.gameState === 'playing') {
        modal.classList.add('hidden');
        if (playerColor) resignBtn.classList.remove('hidden');
    } else if (data.gameState === 'game_over') {
        showGameOver(data.message);
    }
    updateStatusUI();
});

function onDragStart(source, piece) {
    if (game.game_over() || !playerColor) return false;
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) ||
        (playerColor === 'b' && piece.search(/^w/) !== -1) ||
        (game.turn() !== playerColor)) return false;
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';

    let newState = 'playing';
    let msg = '';
    if (game.in_checkmate()) {
        newState = 'game_over';
        msg = `Мат! Победили ${game.turn() === 'w' ? 'Черные' : 'Белые'}`;
        saveToHistory(msg);
    }
    update(gameRef, { fen: game.fen(), turn: game.turn(), gameState: newState, message: msg });
}

// ИСПРАВЛЕННАЯ ОТМЕНА ХОДА
undoBtn.addEventListener('click', () => {
    console.log("Запрос на отмену хода");
    game.undo(); // Отменяем наш ход
    game.undo(); // Отменяем ход противника (обычно в шахматах онлайн отменяют сразу пару полуходов)
    
    board.position(game.fen()); // Обновляем доску визуально у себя
    update(gameRef, { fen: game.fen(), turn: game.turn() }); // Синхронизируем с базой
});

resignBtn.onclick = () => {
    const msg = `Игрок сдался. Победили ${playerColor === 'w' ? 'Черные' : 'Белые'}!`;
    update(gameRef, { gameState: 'game_over', message: msg });
    saveToHistory(msg);
};

rematchBtn.onclick = () => {
    game.reset();
    update(gameRef, { fen: game.fen(), turn: 'w', gameState: 'playing', message: '' });
};

function saveToHistory(msg) {
    if (currentUser) {
        const historyRef = ref(db, `users/${currentUser.uid}/history`);
        push(historyRef, { result: msg, date: serverTimestamp(), roomId: roomId });
    }
}

function showGameOver(msg) {
    modal.classList.remove('hidden');
    document.getElementById('modal-title').innerText = 'Игра окончена';
    document.getElementById('modal-desc').innerText = msg;
    resignBtn.classList.add('hidden');
    if (playerColor) rematchBtn.classList.remove('hidden');
}

function updateStatusUI() {
    let status = `Ход: ${game.turn() === 'b' ? 'Черных' : 'Белых'}`;
    if (game.in_check()) status += ' (Шах!)';
    statusEl.innerText = status;
}

board = Chessboard('myBoard', {
    draggable: true, position: 'start',
    onDragStart, onDrop,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
});

document.getElementById('room-link').onclick = function() {
    this.select(); document.execCommand("copy");
    alert("Ссылка скопирована!");
};
