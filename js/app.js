import { db, auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, push } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const provider = new GoogleAuthProvider();
let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) initGame(roomId); else initLobby();
    
    if (Notification.permission === "default") Notification.requestPermission();
});

function setupAuth() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');

    loginBtn.onclick = () => signInWithPopup(auth, provider);
    logoutBtn.onclick = () => signOut(auth).then(() => location.reload());

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
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
}

function initLobby() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('create-game-btn').onclick = () => {
        const id = Math.random().toString(36).substring(2, 8);
        window.location.search = `?room=${id}`;
    };
}

function loadLobby(user) {
    onValue(ref(db, `games`), (snap) => {
        const list = document.getElementById('games-list');
        list.innerHTML = '';
        const games = snap.val();
        if (!games) { list.innerHTML = "Активных игр нет"; return; }
        
        Object.keys(games).forEach(id => {
            const p = games[id].players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                const item = document.createElement('div');
                item.className = 'game-item';
                item.innerHTML = `<span>Комната: <b>${id}</b></span> <button class="btn btn-success btn-sm">Войти</button>`;
                item.onclick = () => window.location.search = `?room=${id}`;
                list.appendChild(item);
            }
        });
    });
}

function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('room-link').value = window.location.href;

    board = Chessboard('myBoard', {
        draggable: true, position: 'start', onDragStart, onDrop,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

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

    runTransaction(ref(db, `games/${roomId}/players`), (p) => {
        const uid = auth.currentUser?.uid || 'anon';
        if (!p) { playerColor = 'w'; return { white: uid }; }
        if (!p.black && p.white !== uid) { playerColor = 'b'; return { ...p, black: uid }; }
        playerColor = (p.white === uid) ? 'w' : (p.black === uid ? 'b' : null);
        return;
    }).then(() => {
        if (playerColor === 'b') board.orientation('black');
        document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');
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

    document.getElementById('modal-rematch-btn').onclick = () => {
        runTransaction(ref(db, `games/${roomId}/players`), (p) => {
            if (!p) return p;
            return { white: p.black, black: p.white }; // Смена сторон
        }).then(() => {
            update(gameRef, { pgn: '', fen: 'start', turn: 'w', gameState: 'playing' });
            location.reload();
        });
    };

    const toLobby = () => window.location.href = window.location.pathname;
    document.getElementById('exit-btn').onclick = toLobby;
    document.getElementById('modal-exit-btn').onclick = toLobby;
    
    document.getElementById('room-link').onclick = function() {
        this.select(); document.execCommand('copy');
        alert('Ссылка скопирована!');
    };
}

function updateUI(data) {
    const status = document.getElementById('status');
    const moveList = document.getElementById('move-list');
    
    if (data.gameState === 'game_over') {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-desc').innerText = data.message;
    } else {
        document.getElementById('game-modal').classList.add('hidden');
    }

    status.innerText = `Ход: ${game.turn() === 'w' ? 'Белых' : 'Черных'}${game.in_check() ? ' (Шах!)' : ''}`;
    
    // Отрисовка истории ходов
    moveList.innerHTML = game.history().map((m, i) => 
        (i % 2 === 0 ? `<div class="move-num">${Math.floor(i/2)+1}.</div>` : '') + `<div class="move-item">${m}</div>`
    ).join('');
    moveList.scrollTop = moveList.scrollHeight;

    if (data.turn === playerColor && data.lastMoveBy && data.lastMoveBy !== auth.currentUser?.uid) {
        if (document.hidden) new Notification("Твой ход в Fentanyl Chess!");
    }
}
