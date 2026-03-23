import { db, auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const provider = new GoogleAuthProvider();
let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null; // Храним выбранное поле

// --- ЗАПУСК ---
window.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) initGame(roomId); else initLobby();
});

// --- АВТОРИЗАЦИЯ (с модалкой Email) ---
function setupAuth() {
    const authGroup = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');
    const emailModal = document.getElementById('email-modal');
    
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            authGroup?.classList.add('hidden');
            userInfo?.classList.remove('hidden');
            document.getElementById('user-name').innerText = user.displayName || user.email.split('@')[0];
            document.getElementById('user-photo').src = user.photoURL || 'https://via.placeholder.com/35';
            if (!new URLSearchParams(window.location.search).get('room')) loadLobby(user);
        } else {
            authGroup?.classList.remove('hidden');
            userInfo?.classList.add('hidden');
        }
    });

    document.getElementById('login-google').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
    document.getElementById('login-apple').onclick = () => signInWithPopup(auth, new OAuthProvider('apple.com'));
    document.getElementById('login-email-trigger').onclick = () => emailModal.classList.remove('hidden');
    document.getElementById('close-email-modal').onclick = () => emailModal.classList.add('hidden');

    document.getElementById('email-auth-btn').onclick = async () => {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            emailModal.classList.add('hidden');
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                await createUserWithEmailAndPassword(auth, email, pass);
                emailModal.classList.add('hidden');
            } else { alert(err.message); }
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => {
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

// --- ИГРА (НОВАЯ ЛОГИКА КЛИКОВ) ---
async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('room-link').value = window.location.href;

    const user = await new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, u => { unsubscribe(); resolve(u); });
    });

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
    playerColor = (p.white === uid) ? 'w' : (p.black === uid ? 'b' : null);

    // Настройка доски БЕЗ перетаскивания
    board = Chessboard('myBoard', {
        draggable: false, // ОТКЛЮЧАЕМ ТАЩЕНИЕ
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    // Добавляем обработчик клика на поля
    $('#myBoard').on('click', '.square-55d63', function() {
        const square = $(this).attr('data-square');
        onSquareClick(square);
    });

    if (playerColor === 'b') board.orientation('black');
    document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');

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

function onSquareClick(square) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) return;

    // 1. Если мы нажимаем на ту же фигуру — снимаем выделение
    if (selectedSquare === square) {
        removeHighlight();
        selectedSquare = null;
        return;
    }

    // 2. Пробуем сделать ход
    if (selectedSquare) {
        const move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        
        if (move) {
            // Ход возможен!
            pendingMove = move;
            board.position(game.fen());
            document.getElementById('confirm-move-box').classList.remove('hidden');
            removeHighlight();
            selectedSquare = null;
        } else {
            // Если ход невозможен, проверяем, не выбрали ли мы другую свою фигуру
            const piece = game.get(square);
            if (piece && piece.color === playerColor) {
                selectSquare(square);
            }
        }
    } else {
        // 3. Выбираем фигуру своего цвета
        const piece = game.get(square);
        if (piece && piece.color === playerColor) {
            selectSquare(square);
        }
    }
}

function selectSquare(square) {
    removeHighlight();
    selectedSquare = square;
    $(`#myBoard .square-${square}`).addClass('highlight-selected');
}

function removeHighlight() {
    $('#myBoard .square-55d63').removeClass('highlight-selected');
}

function setupGameControls(gameRef, roomId) {
    document.getElementById('confirm-btn').onclick = () => {
        const updateData = { 
            pgn: game.pgn(), fen: game.fen(), turn: game.turn(), 
            lastMoveBy: auth.currentUser?.uid 
        };
        if (game.game_over()) {
            updateData.gameState = 'game_over';
            updateData.message = game.in_checkmate() ? 'Мат!' : 'Ничья!';
        }
        update(gameRef, updateData);
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    document.getElementById('cancel-btn').onclick = () => {
        game.undo(); board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    document.getElementById('exit-btn').onclick = () => {
        window.location.href = window.location.origin + window.location.pathname;
    };
}

function updateUI(data) {
    const status = document.getElementById('status');
    if (status) status.innerText = `Ход: ${game.turn() === 'w' ? 'Белых' : 'Черных'}`;
    
    if (data.gameState === 'game_over') {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-desc').innerText = data.message;
    } else {
        document.getElementById('game-modal').classList.add('hidden');
    }
}
