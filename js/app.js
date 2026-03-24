import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, GoogleAuthProvider, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null;

// Определяем мобильное устройство
const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 ('ontouchstart' in window && window.innerWidth < 768);

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

    document.getElementById('login-google').onclick = () => signInWithPopup(auth, new GoogleAuthProvider());

    const emailModal = document.getElementById('email-modal');
    document.getElementById('login-email-trigger').onclick = () => emailModal.classList.remove('hidden');
    document.getElementById('close-email-modal').onclick = () => emailModal.classList.add('hidden');
    
    document.getElementById('email-auth-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        if (!email || !pass) return alert("Введите email и пароль");

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            emailModal.classList.add('hidden');
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                try {
                    await createUserWithEmailAndPassword(auth, email, pass);
                    emailModal.classList.add('hidden');
                } catch (createErr) {
                    alert("Ошибка регистрации: " + createErr.message);
                }
            } else {
                alert("Ошибка: " + err.message);
            }
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => location.reload());
}

// --- ЛОББИ ---
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

        const sortedGames = Object.entries(games).sort((a, b) => {
            const statusA = a[1].gameState === 'game_over' ? 1 : 0;
            const statusB = b[1].gameState === 'game_over' ? 1 : 0;
            return statusA - statusB;
        });

        sortedGames.forEach(([id, data]) => {
            const p = data.players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                const isOver = data.gameState === 'game_over';
                const opponentName = (p.white === user.uid) 
                    ? (p.blackName || "Ожидание...") 
                    : (p.whiteName || "Ожидание...");

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

// --- ИГРА ---
async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('lobby-section').classList.add('hidden');

    const user = await new Promise(res => { 
        const unsub = onAuthStateChanged(auth, u => { unsub(); res(u); });
    });

    const uid = user ? user.uid : 'anon_' + Math.random().toString(36).substring(2, 9);
    const uName = user ? (user.displayName || user.email.split('@')[0]) : 'Аноним';

    const gameRef = ref(db, `games/${roomId}`);
    const playersRef = ref(db, `games/${roomId}/players`);

    await runTransaction(playersRef, (p) => {
        if (!p) return { white: uid, whiteName: uName };
        if (p.white === uid || p.black === uid) return;
        if (!p.black) return { ...p, black: uid, blackName: uName };
        return;
    });

    const p = (await get(playersRef)).val();
    playerColor = p.white === uid ? 'w' : (p.black === uid ? 'b' : null);

    board = Chessboard('myBoard', {
        draggable: !isMobile,
        onDrop: isMobile ? undefined : handleDrop,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    });

    if (playerColor === 'b') board.orientation('black');
    document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : 'Черные';

    if (isMobile) {
        $('#myBoard').on('click', '.square-55d63', function() {
            onSquareClick($(this).attr('data-square'));
        });
    }

    onValue(gameRef, (snap) => {
        const data = snap.val();
        if (!data) return;

        if (data.pgn && data.pgn !== game.pgn()) {
            game.load_pgn(data.pgn);
            board.position(game.fen());
        }

        const requestBox = document.getElementById('takeback-request-box');
        if (data.takebackRequest?.status === 'pending' && data.takebackRequest.from !== (currentUser?.uid || 'anon')) {
            requestBox.classList.remove('hidden');
        } else {
            requestBox.classList.add('hidden');
        }

        updateUI(data);
    });

    setupGameControls(gameRef, roomId);   // ← важно: вызываем после подписки
}

// ==================== ДЕСКТОП: Перетаскивание ====================
// ==================== ДЕСКТОП: Перетаскивание с поддержкой рокировки ====================
function handleDrop(source, target) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) {
        return 'snapback';
    }

    // === ОСОБАЯ ЛОГИКА ДЛЯ РОКИРОВКИ ===
    let move = null;

    // Проверяем, пытается ли игрок сделать рокировку (король перетаскивается на ладью)
    if ((source === 'e1' && target === 'h1') || (source === 'e1' && target === 'a1') || 
        (source === 'e8' && target === 'h8') || (source === 'e8' && target === 'a8')) {

        const isKingside = target === 'h1' || target === 'h8';
        const castlingMove = isKingside ? 'O-O' : 'O-O-O';

        // Пробуем выполнить рокировку через chess.js
        move = game.move(castlingMove);
    } 
    // Обычный ход
    else {
        move = game.move({ 
            from: source, 
            to: target, 
            promotion: 'q' 
        });
    }

    if (move === null) {
        return 'snapback';   // неверный ход
    }

    // Успешный ход (обычный или рокировка)
    pendingMove = move;
    board.position(game.fen());           // обновляем доску
    document.getElementById('confirm-move-box').classList.remove('hidden');

    return move;   // важно вернуть move, чтобы chessboard не делал snapback
}

// ==================== МОБИЛЬНЫЙ: Выбор + подсветка ====================
function onSquareClick(square) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) return;

    if (selectedSquare === square) {
        removeHighlights();
        selectedSquare = null;
        return;
    }

    if (selectedSquare) {
        const move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        if (move) {
            pendingMove = move;
            board.position(game.fen());
            document.getElementById('confirm-move-box').classList.remove('hidden');
            removeHighlights();
            selectedSquare = null;
        } else {
            const piece = game.get(square);
            if (piece && piece.color === playerColor) {
                selectSquare(square);
            } else {
                removeHighlights();
                selectedSquare = null;
            }
        }
    } else {
        const piece = game.get(square);
        if (piece && piece.color === playerColor) {
            selectSquare(square);
        }
    }
}

function selectSquare(square) {
    removeHighlights();
    selectedSquare = square;
    $(`.square-${square}`).addClass('highlight-selected');

    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(m => {
        $(`.square-${m.to}`).addClass('highlight-possible');
    });
}

function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected highlight-possible');
}

// ==================== Управление игрой ====================
function setupGameControls(gameRef, roomId) {
    // Подтверждение хода
    document.getElementById('confirm-btn').onclick = () => {
        if (!pendingMove) return;
        const updateData = { pgn: game.pgn(), fen: game.fen(), turn: game.turn() };
        if (game.game_over()) {
            updateData.gameState = 'game_over';
            updateData.message = getGameResultMessage();
        }
        update(gameRef, updateData);
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
    };

    // Отмена хода
    document.getElementById('undo-btn').onclick = () => {
        game.undo();
        board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
        removeHighlights();
    };

    // Запрос takeback
    document.getElementById('takeback-btn').onclick = () => {
        if (game.history().length === 0 || pendingMove) return;
        update(gameRef, { takebackRequest: { from: currentUser?.uid || 'anon', status: 'pending' } });
        alert("Запрос на возврат хода отправлен...");
    };

    document.getElementById('takeback-accept').onclick = () => {
        game.undo();
        update(gameRef, { pgn: game.pgn(), fen: game.fen(), turn: game.turn(), takebackRequest: null });
    };

    document.getElementById('takeback-reject').onclick = () => update(gameRef, { takebackRequest: null });

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

    // === НОВОЕ: Поделиться ссылкой ===
    const linkEl = document.getElementById('room-link');
    const shareBtn = document.getElementById('share-btn');

    linkEl.value = window.location.href;

    // Клик по полю — копирование (fallback)
    linkEl.onclick = () => {
        linkEl.select();
        document.execCommand('copy');
        alert('Ссылка скопирована в буфер обмена!');
    };

    // Основная кнопка "Поделиться"
    shareBtn.onclick = async () => {
        const shareData = {
            title: 'Приглашение в Fentanyl Chess',
            text: 'Присоединяйся ко мне в шахматы!',
            url: window.location.href
        };

        try {
            // Современный способ (мобильные + Chrome)
            if (navigator.share && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                // Fallback для десктопа и старых браузеров
                linkEl.select();
                document.execCommand('copy');
                alert('Ссылка скопирована! Теперь можешь отправить её в мессенджер.');
            }
        } catch (err) {
            // Если пользователь отменил шаринг
            if (err.name !== 'AbortError') {
                alert('Не удалось поделиться. Ссылка скопирована в буфер.');
                linkEl.select();
                document.execCommand('copy');
            }
        }
    };
}

// ==================== Обновление UI ====================
function updateUI(data) {
    const currentTurn = game.turn();
    const isMyTurn = (playerColor === currentTurn);

    document.getElementById('status').innerText = 
        `Ход: ${currentTurn === 'w' ? 'Белых' : 'Черных'}${game.in_check() ? ' (Шах!)' : ''}`;

    updateTurnIndicator(isMyTurn);

    const moves = document.getElementById('move-list');
    moves.innerHTML = game.history().map((m, i) => 
        (i % 2 === 0 ? `<span>${Math.floor(i/2) + 1}.</span>` : '') + `<b>${m}</b>`
    ).join(' ');

    if (data.gameState === 'game_over') {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-desc').innerText = data.message || getGameResultMessage();
    } else {
        document.getElementById('game-modal').classList.add('hidden');
    }
}

function updateTurnIndicator(isMyTurn) {
    const indicator = document.getElementById('turn-indicator');
    const textEl = document.getElementById('turn-text');
    if (!indicator || !textEl) return;

    if (isMyTurn) {
        indicator.classList.remove('opponent-turn');
        indicator.classList.add('my-turn');
        textEl.innerHTML = '🎯 ВАШ ХОД';
    } else {
        indicator.classList.remove('my-turn');
        indicator.classList.add('opponent-turn');
        textEl.innerHTML = '⏳ Ход соперника';
    }
}
