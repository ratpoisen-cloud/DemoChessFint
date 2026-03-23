import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, 
    GoogleAuthProvider, 
    OAuthProvider, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const provider = new GoogleAuthProvider();
let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null; 

// --- ИНИЦИАЛИЗАЦИЯ ---
window.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) initGame(roomId); else initLobby();
});

// --- АВТОРИЗАЦИЯ ---
function setupAuth() {
    const authGroup = document.getElementById('auth-buttons');
    const userInfo = document.getElementById('user-info');
    const emailModal = document.getElementById('email-modal');

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            if (authGroup) authGroup.classList.add('hidden');
            if (userInfo) userInfo.classList.remove('hidden');
            document.getElementById('user-name').innerText = user.displayName || user.email.split('@')[0];
            document.getElementById('user-photo').src = user.photoURL || 'https://via.placeholder.com/35';
            if (!new URLSearchParams(window.location.search).get('room')) loadLobby(user);
        } else {
            if (authGroup) authGroup.classList.remove('hidden');
            if (userInfo) userInfo.classList.add('hidden');
        }
    });

    // Google
    const googleBtn = document.getElementById('login-google');
    if (googleBtn) googleBtn.onclick = () => signInWithPopup(auth, new GoogleAuthProvider());

    // Apple
    const appleBtn = document.getElementById('login-apple');
    if (appleBtn) appleBtn.onclick = () => signInWithPopup(auth, new OAuthProvider('apple.com'));

    // Email
    const emailTrigger = document.getElementById('login-email-trigger');
    if (emailTrigger) emailTrigger.onclick = () => emailModal.classList.remove('hidden');
    
    const closeEmail = document.getElementById('close-email-modal');
    if (closeEmail) closeEmail.onclick = () => emailModal.classList.add('hidden');

    const emailAuthBtn = document.getElementById('email-auth-btn');
    if (emailAuthBtn) {
        emailAuthBtn.onclick = async () => {
            const email = document.getElementById('email-input').value;
            const pass = document.getElementById('password-input').value;
            const errorEl = document.getElementById('email-error');
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                emailModal.classList.add('hidden');
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    try {
                        await createUserWithEmailAndPassword(auth, email, pass);
                        emailModal.classList.add('hidden');
                    } catch (e) { errorEl.innerText = e.message; errorEl.classList.remove('hidden'); }
                } else { errorEl.innerText = err.message; errorEl.classList.remove('hidden'); }
            }
        };
    }

    // Выход
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth).then(() => {
            window.location.href = window.location.origin + window.location.pathname;
        });
    }
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
        if (!games) { list.innerHTML = "Активных игр не найдено"; return; }
        Object.keys(games).forEach(id => {
            const p = games[id].players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                const item = document.createElement('div');
                item.className = 'game-item';
                item.innerHTML = `<span>Комната: <b>${id}</b></span> <button class="btn btn-success btn-sm">Войти</button>`;
                item.onclick = () => window.location.href = window.location.origin + window.location.pathname + `?room=${id}`;
                list.appendChild(item);
            }
        });
    });
}

// --- ИГРА ---
async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    
    // Ждем авторизацию
    const user = await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
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

    board = Chessboard('myBoard', {
        draggable: false, // Клик-система
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    // Обработка кликов по доске
    $('#myBoard').on('click', '.square-55d63', function() {
        onSquareClick($(this).attr('data-square'));
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

    if (selectedSquare === square) {
        removeHighlight();
        selectedSquare = null;
        return;
    }

    if (selectedSquare) {
        const move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (move) {
            pendingMove = move;
            board.position(game.fen());
            document.getElementById('confirm-move-box').classList.remove('hidden');
            removeHighlight();
            selectedSquare = null;
        } else {
            const piece = game.get(square);
            if (piece && piece.color === playerColor) selectSquare(square);
        }
    } else {
        const piece = game.get(square);
        if (piece && piece.color === playerColor) selectSquare(square);
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
    // Подтверждение
    document.getElementById('confirm-btn').onclick = () => {
        if (!pendingMove) return;
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

    // Отмена (Undo локально)
    document.getElementById('undo-btn').onclick = () => {
        if (!pendingMove) return;
        game.undo();
        board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    // Сдаться
    document.getElementById('resign-btn').onclick = () => {
        if (confirm("Сдаться и завершить партию?")) {
            const winner = (playerColor === 'w') ? 'Черные' : 'Белые';
            update(gameRef, {
                gameState: 'game_over',
                message: `${winner} победили (соперник сдался)`
            });
        }
    };

    document.getElementById('cancel-btn').onclick = () => {
        game.undo(); board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    document.getElementById('exit-btn').onclick = () => {
        window.location.href = window.location.origin + window.location.pathname;
    };
    
    document.getElementById('room-link').value = window.location.href;
}

function updateUI(data) {
    const status = document.getElementById('status');
    if (status) status.innerText = `Ход: ${game.turn() === 'w' ? 'Белых' : 'Черных'}${game.in_check() ? ' (Шах!)' : ''}`;
    
    const moveList = document.getElementById('move-list');
    if (moveList) {
        moveList.innerHTML = game.history().map((m, i) => 
            (i % 2 === 0 ? `<span class="move-num">${Math.floor(i/2)+1}.</span>` : '') + `<span class="move-item">${m}</span>`
        ).join(' ');
        moveList.scrollTop = moveList.scrollHeight;
    }

    if (data.gameState === 'game_over') {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-desc').innerText = data.message;
    } else {
        document.getElementById('game-modal').classList.add('hidden');
    }
}
