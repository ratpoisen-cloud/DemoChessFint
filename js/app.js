import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, GoogleAuthProvider, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null;
let currentRoomId = null;
let pendingTakeback = null;

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
    const emailError = document.getElementById('email-error');
    
    const showError = (msg) => {
        emailError.innerText = msg;
        emailError.classList.remove('hidden');
    };

    document.getElementById('login-email-trigger').onclick = () => {
        emailError.classList.add('hidden');
        emailModal.classList.remove('hidden');
    };
    
    document.getElementById('close-email-modal').onclick = () => emailModal.classList.add('hidden');

    document.getElementById('login-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        if (!email || !pass) return showError("Введите почту и пароль");

        try {
            await signInWithEmailAndPassword(auth, email, pass);
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
        } catch (err) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
                showError("Неверная почта или пароль");
            } else {
                showError("Ошибка входа: " + err.message);
            }
        }
    };

    document.getElementById('register-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        
        if (!email) return showError("Введите почту");
        if (pass.length < 6) return showError("Пароль должен быть от 6 символов");

        try {
            await createUserWithEmailAndPassword(auth, email, pass);
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
            alert("Аккаунт успешно создан!");
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                showError("Эта почта уже зарегистрирована");
            } else {
                showError("Ошибка регистрации: " + err.message);
            }
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => location.href = location.origin + location.pathname);
}

function getGameResultMessage() {
    if (game.in_checkmate()) return `Мат! ${game.turn() === 'w' ? 'Черные' : 'Белые'} победили`;
    if (game.in_stalemate()) return "Пат! Ничья";
    if (game.in_threefold_repetition()) return "Ничья (троекратное повторение)";
    if (game.insufficient_material()) return "Ничья (недостаточно фигур)";
    return "Игра окончена";
}

function initLobby() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden');
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
        const sortedGames = Object.entries(games).sort((a, b) => (a[1].gameState === 'game_over' ? 1 : 0) - (b[1].gameState === 'game_over' ? 1 : 0));
        let hasGames = false;
        sortedGames.forEach(([id, data]) => {
            const p = data.players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                hasGames = true;
                const isOver = data.gameState === 'game_over';
                const opp = (p.white === user.uid) ? (p.blackName || "Ожидание...") : (p.whiteName || "Ожидание...");
                const item = document.createElement('div');
                item.className = `game-item ${isOver ? 'finished' : 'active'}`;
                item.innerHTML = `<div class="game-info"><div>Против: <b>${opp}</b></div><small>${isOver ? data.message || "Завершена" : "Идет игра"}</small></div><button class="btn btn-sm">Играть</button>`;
                item.onclick = () => location.href = location.origin + location.pathname + `?room=${id}`;
                list.appendChild(item);
            }
        });
        if (!hasGames) list.innerHTML = "Нет активных партий";
    });
}

async function initGame(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('lobby-section').classList.add('hidden');
    document.getElementById('room-link').value = window.location.href;
    
    const user = await new Promise(res => { const unsub = onAuthStateChanged(auth, u => { unsub(); res(u); }); });
    const uid = user ? user.uid : 'anon_' + Math.random().toString(36).substring(2, 9);
    const uName = user ? (user.displayName || user.email.split('@')[0]) : 'Аноним';
    const gameRef = ref(db, `games/${roomId}`);
    const playersRef = ref(db, `games/${roomId}/players`);
    
    const gameCheck = await get(gameRef);
    if (!gameCheck.exists()) {
        await set(gameRef, { 
            pgn: game.pgn(), 
            fen: game.fen(),
            gameState: 'active',
            createdAt: Date.now()
        });
    }
    
    try {
        await runTransaction(playersRef, (p) => {
            if (!p) return { white: uid, whiteName: uName };
            if (p.white === uid || p.black === uid) return;
            if (!p.black) return { ...p, black: uid, blackName: uName };
            return;
        });
    } catch (err) {
        console.error("Transaction error:", err);
    }
    
    const p = (await get(playersRef)).val();
    playerColor = p.white === uid ? 'w' : (p.black === uid ? 'b' : null);
    
    if (!playerColor) {
        document.getElementById('status').innerText = "Вы наблюдатель";
        document.getElementById('user-color').innerText = "Наблюдатель";
    } else {
        document.getElementById('user-color').innerText = playerColor === 'w' ? 'Белые' : 'Черные';
    }
    
    // Инициализация доски
    board = Chessboard('myBoard', {
        draggable: !isMobile && playerColor !== null,
        onDrop: handleDrop,
        position: 'start',
        moveSpeed: 'slow',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/alpha/{piece}.png'
    });
    
    if (playerColor === 'b') board.orientation('black');
    
    // Небольшая задержка для полной инициализации доски
    setTimeout(() => {
        if (isMobile && playerColor) {
            attachMobileClickHandler();
        }
    }, 100);
    
    // Синхронизация игры
    onValue(gameRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.pgn && data.pgn !== game.pgn()) { 
            game.load_pgn(data.pgn); 
            board.position(game.fen(), true);
            pendingMove = null;
            document.getElementById('confirm-move-box').classList.add('hidden');
            clearSelection();
        }
        updateUI(data);
    });
    
    setupGameControls(gameRef, roomId);
    currentRoomId = roomId;
}

// Прикрепляем обработчик кликов для мобильных устройств
function attachMobileClickHandler() {
    // Удаляем старые обработчики
    $('#myBoard').off('click');
    
    // Добавляем новый обработчик на квадраты
    $('#myBoard .square-55d63').each(function() {
        $(this).off('click');
    });
    
    // Используем делегирование событий
    $('#myBoard').on('click', '.square-55d63', function(e) {
        e.stopPropagation();
        const square = $(this).attr('data-square');
        if (square) {
            handleMobileClick(square);
        }
    });
}

// --- МОБИЛЬНАЯ ЛОГИКА: выделение фигуры и подсветка ходов ---
function handleMobileClick(square) {
    console.log("Clicked square:", square); // Для отладки
    
    // Проверки
    if (game.game_over()) return;
    if (!playerColor) return;
    if (game.turn() !== playerColor) return;
    if (pendingMove) return;
    
    const piece = game.get(square);
    
    // Случай 1: Уже есть выбранная фигура
    if (selectedSquare) {
        // Если кликнули на ту же фигуру - снимаем выделение
        if (selectedSquare === square) {
            clearSelection();
            return;
        }
        
        // Пытаемся сделать ход
        const move = game.move({ from: selectedSquare, to: square, promotion: 'q', verbose: true });
        
        if (move) {
            // Ход валидный - сохраняем для подтверждения
            pendingMove = move;
            board.position(game.fen(), true);
            document.getElementById('confirm-move-box').classList.remove('hidden');
            clearSelection();
        } else {
            // Ход невалидный - проверяем, может кликнули на другую свою фигуру
            if (piece && piece.color === playerColor) {
                // Выбираем новую фигуру
                selectSquare(square);
            } else {
                // Кликнули на пустую клетку или фигуру соперника - сбрасываем выделение
                clearSelection();
            }
        }
    } 
    // Случай 2: Нет выбранной фигуры
    else {
        // Если кликнули на свою фигуру - выделяем её
        if (piece && piece.color === playerColor) {
            selectSquare(square);
        }
        // Если кликнули на чужую фигуру или пустую клетку - ничего не делаем
    }
}

// Выделение фигуры и подсветка доступных ходов
function selectSquare(square) {
    clearSelection();
    selectedSquare = square;
    
    // Подсветка выбранной клетки
    const selectedElement = $(`.square-${square}`);
    selectedElement.addClass('highlight-selected');
    
    // Получаем все возможные ходы для выбранной фигуры
    const moves = game.moves({ square: square, verbose: true });
    console.log("Possible moves:", moves); // Для отладки
    
    moves.forEach(move => {
        const targetSquare = $(`.square-${move.to}`);
        targetSquare.addClass('highlight-possible');
    });
}

// Сброс выделения и подсветки
function clearSelection() {
    selectedSquare = null;
    removeHighlights();
}

function removeHighlights() { 
    $('#myBoard .square-55d63').removeClass('highlight-selected highlight-possible'); 
}

// Десктопная логика через drag-and-drop
function handleDrop(source, target) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) return 'snapback';
    
    const testMove = game.move({ from: source, to: target, promotion: 'q', verbose: true });
    if (testMove === null) return 'snapback';
    
    game.undo();
    pendingMove = testMove;
    setTimeout(() => board.position(game.fen(), true), 100);
    document.getElementById('confirm-move-box').classList.remove('hidden');
    return 'snapback';
}

function setupGameControls(gameRef, roomId) {
    // Подтверждение хода
    document.getElementById('confirm-btn').onclick = () => {
        if (!pendingMove) return;
        
        game.move(pendingMove);
        const updateData = { pgn: game.pgn(), fen: game.fen(), turn: game.turn(), lastMove: Date.now() };
        
        if (game.game_over()) { 
            updateData.gameState = 'game_over'; 
            updateData.message = getGameResultMessage(); 
        }
        
        update(gameRef, updateData);
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
        clearSelection();
    };
    
    // Отмена неподтвержденного хода
    document.getElementById('cancel-move-btn').onclick = () => {
        if (pendingMove) {
            pendingMove = null;
            document.getElementById('confirm-move-box').classList.add('hidden');
            board.position(game.fen(), true);
            clearSelection();
        }
    };
    
    // Сдача
    document.getElementById('resign-btn').onclick = () => {
        if (game.game_over()) {
            alert("Игра уже окончена");
            return;
        }
        if (confirm("Вы уверены, что хотите сдаться?")) {
            const winner = playerColor === 'w' ? 'Черные' : 'Белые';
            update(gameRef, { 
                gameState: 'game_over', 
                message: `${winner} победили (сдача)`,
                pgn: game.pgn(),
                resign: playerColor
            });
        }
    };
    
    // Выход в лобби
    document.getElementById('exit-btn').onclick = () => {
        if (confirm("Выйти в лобби?")) {
            location.href = location.origin + location.pathname;
        }
    };
    
    // Поделиться ссылкой
    document.getElementById('share-btn').onclick = async () => {
        const link = document.getElementById('room-link').value;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Шахматная партия', url: link });
            } catch (err) {
                console.log('Sharing cancelled');
            }
        } else {
            navigator.clipboard.writeText(link);
            alert('Ссылка скопирована!');
        }
    };
    
    // Запрос отмены хода
    document.getElementById('takeback-btn').onclick = () => {
        if (game.history().length === 0) {
            alert("Нет ходов для отмены");
            return;
        }
        if (game.game_over()) {
            alert("Игра уже окончена");
            return;
        }
        update(gameRef, { takebackRequest: { from: playerColor, timestamp: Date.now() } });
        alert("Запрос отправлен сопернику");
    };
    
    const takebackRef = ref(db, `games/${roomId}/takebackRequest`);
    onValue(takebackRef, (snap) => {
        const request = snap.val();
        if (!request) {
            document.getElementById('takeback-request-box').classList.add('hidden');
            pendingTakeback = null;
            return;
        }
        
        if (request.from !== playerColor && !request.answered) {
            document.getElementById('takeback-request-box').classList.remove('hidden');
            pendingTakeback = request;
        }
    });
    
    document.getElementById('takeback-accept').onclick = () => {
        if (pendingTakeback) {
            game.undo();
            update(gameRef, { 
                pgn: game.pgn(), 
                fen: game.fen(), 
                takebackRequest: null 
            });
            document.getElementById('takeback-request-box').classList.add('hidden');
            pendingTakeback = null;
            clearSelection();
        }
    };
    
    document.getElementById('takeback-reject').onclick = () => {
        update(gameRef, { takebackRequest: null });
        document.getElementById('takeback-request-box').classList.add('hidden');
        pendingTakeback = null;
    };
    
    // Реванш
    document.getElementById('modal-rematch-btn').onclick = async () => {
        const modal = document.getElementById('game-modal');
        modal.classList.add('hidden');
        
        const playersData = (await get(ref(db, `games/${roomId}/players`))).val();
        const newId = Math.random().toString(36).substring(2, 8);
        
        await set(ref(db, `games/${newId}`), {
            players: {
                white: playersData.black,
                whiteName: playersData.blackName,
                black: playersData.white,
                blackName: playersData.whiteName
            },
            pgn: new Chess().pgn(),
            fen: 'start',
            gameState: 'active',
            createdAt: Date.now()
        });
        
        location.href = location.origin + location.pathname + `?room=${newId}`;
    };
    
    document.getElementById('modal-exit-btn').onclick = () => {
        document.getElementById('game-modal').classList.add('hidden');
        location.href = location.origin + location.pathname;
    };
}

function updateUI(data) {
    if (!data) return;
    
    const isMyTurn = (playerColor === game.turn());
    const statusEl = document.getElementById('status');
    if (statusEl) {
        if (game.game_over()) {
            statusEl.innerText = data.message || getGameResultMessage();
        } else {
            statusEl.innerText = `Ход: ${game.turn() === 'w' ? 'Белых' : 'Черных'}`;
        }
    }
    
    updateTurnIndicator(isMyTurn);
    
    const history = game.history();
    const moveListDiv = document.getElementById('move-list');
    if (moveListDiv) {
        moveListDiv.innerHTML = '';
        if (history.length === 0) {
            moveListDiv.innerHTML = '<div style="grid-column: span 3; text-align: center; color: var(--text-secondary);">Нет ходов</div>';
        } else {
            for (let i = 0; i < history.length; i += 2) {
                const moveNum = Math.floor(i / 2) + 1;
                const whiteMove = history[i] || '';
                const blackMove = history[i + 1] || '';
                moveListDiv.innerHTML += `
                    <div style="color: var(--text-secondary);">${moveNum}.</div>
                    <div>${whiteMove}</div>
                    <div>${blackMove}</div>
                `;
            }
        }
        moveListDiv.scrollTop = moveListDiv.scrollHeight;
    }
    
    if (data.gameState === 'game_over' && document.getElementById('game-modal').classList.contains('hidden')) {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-title').innerHTML = '🏆 Игра окончена';
        document.getElementById('modal-desc').innerHTML = data.message || getGameResultMessage();
    }
}

function updateTurnIndicator(isMyTurn) {
    const indicator = document.getElementById('turn-indicator');
    const textEl = document.getElementById('turn-text');
    if (!indicator || !textEl) return;
    
    if (game.game_over()) {
        indicator.className = 'turn-indicator';
        textEl.innerText = '🏁 ИГРА ОКОНЧЕНА';
        return;
    }
    
    if (!playerColor) {
        indicator.className = 'turn-indicator opponent-turn';
        textEl.innerText = '👁️ РЕЖИМ НАБЛЮДАТЕЛЯ';
        return;
    }
    
    indicator.className = isMyTurn ? 'turn-indicator my-turn' : 'turn-indicator opponent-turn';
    textEl.innerText = isMyTurn ? '🎯 ВАШ ХОД' : '⏳ Ход соперника';
}
