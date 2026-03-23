import { db, auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const provider = new GoogleAuthProvider();
let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;

// --- ЗАПУСК ---
window.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) initGame(roomId); else initLobby();
});

// --- АВТОРИЗАЦИЯ ---
function setupAuth() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        const userInfo = document.getElementById('user-info');
        if (user) {
            userInfo.classList.remove('hidden');
            loginBtn.classList.add('hidden');
            document.getElementById('user-name').innerText = user.displayName.split(' ')[0];
            document.getElementById('user-photo').src = user.photoURL;
            if (!new URLSearchParams(window.location.search).get('room')) loadLobby(user);
        } else {
            userInfo.classList.add('hidden');
            loginBtn.classList.remove('hidden');
        }
    });

    loginBtn.onclick = () => signInWithPopup(auth, provider);
    logoutBtn.onclick = () => signOut(auth).then(() => {
        window.location.href = window.location.origin + window.location.pathname;
    });
}

// --- ЛОББИ ---
function initLobby() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('create-game-btn').onclick = () => {
        const id = Math.random().toString(36).substring(2, 8);
        window.location.href = window.location.origin + window.location.pathname + `?room=${id}`;
    };
}

function loadLobby(user) {
    const list = document.getElementById('games-list');
    onValue(ref(db, `games`), (snap) => {
        list.innerHTML = '';
        const games = snap.val();
        if (!games) { list.innerHTML = "Нет активных игр"; return; }
        
        Object.keys(games).forEach(id => {
            const p = games[id].players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                const item = document.createElement('div');
                item.className = 'game-item';
                item.innerHTML = `<span>Партия: <b>${id}</b></span> <button class="btn btn-success btn-sm">Войти</button>`;
                item.onclick = () => window.location.href = window.location.origin + window.location.pathname + `?room=${id}`;
                list.appendChild(item);
            }
        });
    });
}

// --- ИГРА ---
async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('room-link').value = window.location.href;

    // Ждем авторизации, если она в процессе
    const user = await new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, u => {
            unsubscribe();
            resolve(u);
        });
    });

    // Определяем роль в комнате
    const uid = user ? user.uid : 'anon';
    const playersRef = ref(db, `games/${roomId}/players`);
    
    await runTransaction(playersRef, (p) => {
        if (!p) return { white: uid };
        if (p.white === uid || p.black === uid) return; 
        if (!p.black) return { ...p, black: uid };
        return; 
    });

    const pSnap = await get(playersRef);
    const p = pSnap.val();
    if (p.white === uid) playerColor = 'w';
    else if (p.black === uid) playerColor = 'b';

    // Рисуем доску
    board = Chessboard('myBoard', {
        draggable: true,
        position: 'start',
        onDragStart,
        onDrop,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    if (playerColor === 'b') board.orientation('black');
    document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');

    // Синхронизация
    const gameRef = ref(db, `games/${roomId}`);
    onValue(gameRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.pgn && data.pgn !== game.pgn()) {
            game.load_pgn(data.pgn);
            board.position(game.fen());
        }
        updateUI(data);
    });

    setupGameControls(gameRef, roomId);
}

function onDragStart(source, piece) {
    if (game.game_over() || !playerColor || pendingMove) return false;
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) ||
        (playerColor === 'b' && piece.search(/^w/) !== -1) ||
        (game.turn() !== playerColor)) return false;
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';
    
    pendingMove = move;
    document.getElementById('confirm-move-box').classList.remove('hidden');
}

function setupGameControls(gameRef, roomId) {
    document.getElementById('confirm-btn').onclick = () => {
        const updateData = { 
            pgn: game.pgn(), fen: game.fen
