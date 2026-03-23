import { db, auth } from './firebase-config.js';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const provider = new GoogleAuthProvider();
let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;

// Инициализация при старте
window.addEventListener('DOMContentLoaded', () => {
    console.log("Приложение запущено"); // Для отладки
    setupAuth(); 
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');

    if (roomId) {
        initGame(roomId); 
    } else {
        initLobby();
    }
});

// --- ЛОББИ ---
function initLobby() {
    console.log("Инициализация Лобби");
    const lobby = document.getElementById('lobby-section');
    const createBtn = document.getElementById('create-game-btn');
    
    // Показываем лобби в любом случае
    if (lobby) lobby.classList.remove('hidden');
    
    // Кнопка создания должна работать всегда!
    createBtn.onclick = () => {
        const id = Math.random().toString(36).substring(2, 8);
        const url = window.location.origin + window.location.pathname + `?room=${id}`;
        window.location.href = url;
    };
}

function loadLobby(user) {
    const list = document.getElementById('games-list');
    if (!list) return;

    console.log("Загрузка игр для пользователя:", user.uid);

    // Ограничиваем запрос, чтобы не вызывать ошибку прав доступа Firebase
    const gamesRef = ref(db, `games`);
    
    onValue(gamesRef, (snap) => {
        try {
            list.innerHTML = '';
            const games = snap.val();
            
            if (!games) {
                list.innerHTML = "<p>У вас пока нет активных игр.</p>";
                return;
            }

            let found = false;
            Object.keys(games).forEach(id => {
                const p = games[id].players;
                // Проверяем, участвует ли текущий юзер в этой игре
                if (p && (p.white === user.uid || p.black === user.uid)) {
                    found = true;
                    const item = document.createElement('div');
                    item.className = 'game-item';
                    item.innerHTML = `
                        <span>Партия: <strong>${id}</strong></span>
                        <button class="btn btn-success btn-sm">Войти</button>
                    `;
                    item.onclick = () => {
                        window.location.href = window.location.origin + window.location.pathname + `?room=${id}`;
                    };
                    list.appendChild(item);
                }
            });

            if (!found) {
                list.innerHTML = "<p>Вы еще не участвовали в партиях.</p>";
            }
        } catch (e) {
            console.error("Ошибка обработки данных лобби:", e);
            list.innerHTML = "<p>Ошибка при отображении списка игр.</p>";
        }
    }, (error) => {
        console.warn("Firebase отклонил доступ к списку всех игр (это нормально для правил безопасности):", error);
        list.innerHTML = "<p>Список игр доступен только участникам.</p>";
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
