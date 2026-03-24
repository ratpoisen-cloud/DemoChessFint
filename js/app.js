import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, GoogleAuthProvider, OAuthProvider, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        const authGroup = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
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

    // Google
    document.getElementById('login-google').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());
    
    // Email
    const emailModal = document.getElementById('email-modal');
    document.getElementById('login-email-trigger').onclick = () => emailModal.classList.remove('hidden');
    document.getElementById('close-email-modal').onclick = () => emailModal.classList.add('hidden');
    
    document.getElementById('email-auth-btn').onclick = async () => {
        const email = document.getElementById('email-input').value;
        const pass = document.getElementById('password-input').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            emailModal.classList.add('hidden');
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                try {
                    await createUserWithEmailAndPassword(auth, email, pass);
                    emailModal.classList.add('hidden');
                } catch (e) { alert("Ошибка: " + e.message); }
            } else { alert(err.message); }
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => location.href = location.origin + location.pathname);
}
// --- ЛОББИ (ОБНОВЛЕННОЕ) ---
function initLobby() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('create-game-btn').onclick = () => {
        const id = Math.random().toString(36).substring(2, 8);
        location.href = location.origin + location.pathname + `?room=${id}`;
    };
}

function loadLobby(user) {
    const list = document.getElementById('games-list');
    onValue(ref(db, `games`), (snap) => {
        list.innerHTML = '';
        const games = snap.val();
        if (!games) { list.innerHTML = "Нет активных партий"; return; }
        
        // Превращаем в массив для сортировки (активные выше)
        const sortedGames = Object.entries(games).sort((a, b) => {
            const statusA = a[1].gameState === 'game_over' ? 1 : 0;
            const statusB = b[1].gameState === 'game_over' ? 1 : 0;
            return statusA - statusB;
        });

        sortedGames.forEach(([id, data]) => {
            const p = data.players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                const isOver = data.gameState === 'game_over';
                
                // Определяем соперника
                const opponentName = (p.white === user.uid) 
                    ? (p.blackName || "Ожидание...") 
                    : (p.whiteName || "Ожидание...");

                // Формируем текст статуса
                let statusText = isOver ? `🏁 ${data.message}` : "🟢 Идет игра";
                if (!isOver && data.turn) {
                    const myColor = p.white === user.uid ? 'w' : 'b';
                    statusText += (data.turn === myColor) ? " (Ваш ход!)" : " (Ход соперника)";
                }

                const item = document.createElement('div');
                item.className = `game-item ${isOver ? 'finished' : 'active'}`;
                item.innerHTML = `
                    <div class="game-info">
                        <div class="game-opp">Против: <b>${opponentName}</b></div>
                        <div class="game-status">${statusText}</div>
                    </div>
                    <button class="btn btn-sm ${isOver ? 'btn-outline' : 'btn-success'}">
                        ${isOver ? 'Просмотр' : 'Играть'}
                    </button>
                `;
                item.onclick = () => location.href = location.origin + location.pathname + `?room=${id}`;
                list.appendChild(item);
            }
        });
    });
}

// --- ИГРА (С ЗАПИСЬЮ ИМЕН) ---
async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    
    const user = await new Promise(res => { const unsub = onAuthStateChanged(auth, u => { unsub(); res(u); })});
    const uid = user ? user.uid : 'anon';
    const uName = user ? (user.displayName || user.email.split('@')[0]) : 'Аноним';

    const gameRef = ref(db, `games/${roomId}`);
    const playersRef = ref(db, `games/${roomId}/players`);

    // Транзакция для корректного распределения ролей и ИМЕН
    await runTransaction(playersRef, (p) => {
        if (!p) return { white: uid, whiteName: uName };
        if (p.white === uid || p.black === uid) return;
        if (!p.black) return { ...p, black: uid, blackName: uName };
        return;
    });

    const p = (await get(playersRef)).val();
    playerColor = p.white === uid ? 'w' : (p.black === uid ? 'b' : null);

    board = Chessboard('myBoard', {
        draggable: false, 
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    $('#myBoard').on('click', '.square-55d63', function() {
        onSquareClick($(this).attr('data-square'));
    });

    if (playerColor === 'b') board.orientation('black');
    document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');

    onValue(gameRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.pgn && data.pgn !== game.pgn()) {
            game.load_pgn(data.pgn);
            board.position(game.fen());
        }
        
        // Takeback логика
        const requestBox = document.getElementById('takeback-request-box');
        if (data.takebackRequest?.status === 'pending' && data.takebackRequest.from !== auth.currentUser?.uid) {
            requestBox.classList.remove('hidden');
        } else {
            requestBox.classList.add('hidden');
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
    } else if (selectedSquare) {
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

function selectSquare(s) { removeHighlight(); selectedSquare = s; $(`.square-${s}`).addClass('highlight-selected'); }
function removeHighlight() { $('.square-55d63').removeClass('highlight-selected'); }

function setupGameControls(gameRef, roomId) {
    // Подтверждение хода
    document.getElementById('confirm-btn').onclick = () => {
        if (!pendingMove) return;
        const updateData = { pgn: game.pgn(), fen: game.fen(), turn: game.turn(), lastMoveBy: auth.currentUser?.uid };
        if (game.game_over()) { 
            updateData.gameState = 'game_over'; 
            updateData.message = game.in_checkmate() ? 'Мат!' : 'Ничья!'; 
        }
        update(gameRef, updateData);
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    // Отмена текущего выбора (✕)
    document.getElementById('undo-btn').onclick = () => {
        game.undo();
        board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    // ЗАПРОС ВОЗВРАТА ХОДА (Takeback)
    document.getElementById('takeback-btn').onclick = () => {
        if (game.history().length === 0 || pendingMove) return;
        update(gameRef, { takebackRequest: { from: auth.currentUser.uid, status: 'pending' } });
        alert("Запрос на возврат хода отправлен...");
    };

    document.getElementById('takeback-accept').onclick = () => {
        game.undo(); 
        update(gameRef, {
            pgn: game.pgn(), fen: game.fen(), turn: game.turn(),
            takebackRequest: null 
        });
    };

    document.getElementById('takeback-reject').onclick = () => {
        update(gameRef, { takebackRequest: null });
    };

    // Сдаться
    document.getElementById('resign-btn').onclick = () => {
        if (confirm("Сдаться?")) {
            const win = playerColor === 'w' ? 'Черные' : 'Белые';
            update(gameRef, { gameState: 'game_over', message: `${win} победили (соперник сдался)` });
        }
    };

    // Навигация
    document.getElementById('exit-btn').onclick = () => location.href = location.origin + location.pathname;
    document.getElementById('modal-exit-btn').onclick = () => location.href = location.origin + location.pathname;
    
    document.getElementById('modal-rematch-btn').onclick = async () => {
        const p = (await get(ref(db, `games/${roomId}/players`))).val();
        await set(ref(db, `games/${roomId}/players`), { white: p.black || 'anon', black: p.white || 'anon' });
        await update(gameRef, { pgn: '', fen: 'start', turn: 'w', gameState: 'playing', takebackRequest: null });
        location.reload();
    };

    const linkEl = document.getElementById('room-link');
    linkEl.value = window.location.href;
    linkEl.onclick = function() { this.select(); document.execCommand('copy'); alert('Ссылка скопирована!'); };
}

function updateUI(data) {
    document.getElementById('status').innerText = `Ход: ${game.turn() === 'w' ? 'Белых' : 'Черных'}${game.in_check() ? ' (Шах!)' : ''}`;
    const moves = document.getElementById('move-list');
    if (moves) moves.innerHTML = game.history().map((m, i) => (i%2===0 ? `<span>${i/2+1}.</span>` : '') + `<b>${m}</b>`).join(' ');
    
    if (data.gameState === 'game_over') {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-desc').innerText = data.message;
    } else {
        document.getElementById('game-modal').classList.add('hidden');
    }
}
