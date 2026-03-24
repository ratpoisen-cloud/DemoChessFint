import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, GoogleAuthProvider, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged, sendEmailVerification,
    signInWithRedirect, getRedirectResult, browserSessionPersistence, setPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null;
let currentRoomId = null;
let pendingTakeback = null;

// Определение устройства
const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 ('ontouchstart' in window && window.innerWidth < 768);
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);

// --- ИНИЦИАЛИЗАЦИЯ ---
window.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) initGame(roomId); else initLobby();
});

// Проверка приватного режима на iOS
async function isPrivateMode() {
    return new Promise((resolve) => {
        try {
            const test = localStorage;
            test.setItem('test', '1');
            test.removeItem('test');
            resolve(false);
        } catch (e) {
            resolve(true);
        }
    });
}

// --- АВТОРИЗАЦИЯ ---
function setupAuth() {
    // Установка персистентности сессии для iOS
    setPersistence(auth, browserSessionPersistence).catch(console.error);
    
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

    // Обработка redirect авторизации для iOS
    getRedirectResult(auth).then((result) => {
        if (result) {
            console.log("Redirect login success:", result.user);
            window.location.reload();
        }
    }).catch((error) => {
        console.error("Redirect error:", error);
    });

    // Google Login с выбором метода для iOS
    document.getElementById('login-google').onclick = async () => {
        try {
            const provider = new GoogleAuthProvider();
            if (isIOS) {
                // На iOS используем redirect вместо popup
                await signInWithRedirect(auth, provider);
            } else {
                await signInWithPopup(auth, provider);
            }
        } catch (err) {
            console.error("Google login error:", err);
            alert("Ошибка входа. Попробуйте войти через Email");
        }
    };

    const emailModal = document.getElementById('email-modal');
    const emailError = document.getElementById('email-error');
    const authLoader = document.getElementById('auth-loader');
    
    const showError = (msg) => {
        emailError.innerText = msg;
        emailError.classList.remove('hidden');
        if (authLoader) authLoader.classList.add('hidden');
    };
    
    const showLoader = () => {
        if (authLoader) authLoader.classList.remove('hidden');
        emailError.classList.add('hidden');
    };
    
    const hideLoader = () => {
        if (authLoader) authLoader.classList.add('hidden');
    };

    document.getElementById('login-email-trigger').onclick = () => {
        emailError.classList.add('hidden');
        emailModal.classList.remove('hidden');
        hideLoader();
    };
    
    document.getElementById('close-email-modal').onclick = () => {
        emailModal.classList.add('hidden');
        hideLoader();
    };

    // Кнопка: ВОЙТИ
    document.getElementById('login-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        
        if (!email || !pass) {
            showError("Введите почту и пароль");
            return;
        }

        showLoader();

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            
            // Проверка верификации email (если включено)
            if (!userCredential.user.emailVerified) {
                await signOut(auth);
                showError("Пожалуйста, подтвердите email. Проверьте вашу почту!");
                return;
            }
            
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
            hideLoader();
            
        } catch (err) {
            console.error("Login Error:", err.code);
            switch (err.code) {
                case 'auth/invalid-credential':
                case 'auth/user-not-found':
                    showError("Неверная почта или пароль");
                    break;
                case 'auth/wrong-password':
                    showError("Неверный пароль");
                    break;
                case 'auth/invalid-email':
                    showError("Некорректный формат почты");
                    break;
                case 'auth/too-many-requests':
                    showError("Слишком много попыток. Попробуйте позже");
                    break;
                default:
                    showError("Ошибка входа: " + err.message);
            }
        }
    };

    // Кнопка: РЕГИСТРАЦИЯ
    document.getElementById('register-email-btn').onclick = async () => {
        const email = document.getElementById('email-input').value.trim();
        const pass = document.getElementById('password-input').value;
        
        if (!email) {
            showError("Введите почту");
            return;
        }
        
        if (pass.length < 6) {
            showError("Пароль должен быть не менее 6 символов");
            return;
        }

        showLoader();

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            
            // Отправка письма для подтверждения email
            await sendEmailVerification(userCredential.user);
            
            emailModal.classList.add('hidden');
            document.getElementById('email-input').value = '';
            document.getElementById('password-input').value = '';
            hideLoader();
            
            alert("Аккаунт успешно создан! Проверьте почту для подтверждения.");
            
        } catch (err) {
            console.error("Registration Error:", err.code);
            switch (err.code) {
                case 'auth/email-already-in-use':
                    showError("Эта почта уже зарегистрирована. Войдите или используйте другую");
                    break;
                case 'auth/invalid-email':
                    showError("Некорректный формат почты");
                    break;
                case 'auth/weak-password':
                    showError("Пароль слишком простой. Используйте минимум 6 символов");
                    break;
                default:
                    showError("Ошибка регистрации: " + err.message);
            }
        }
    };

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => location.href = location.origin + location.pathname);
    
    // Проверка приватного режима на iOS
    isPrivateMode().then(isPrivate => {
        if (isPrivate && isIOS) {
            setTimeout(() => {
                alert("Внимание: Приватный режим в Safari может ограничивать функциональность. Рекомендуем отключить его для лучшей работы.");
            }, 1000);
        }
    });
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
    
    // Инициализация доски с оптимизациями для iOS
    const boardConfig = {
        draggable: !isMobile && playerColor !== null,
        onDrop: handleDrop,
        position: 'start',
        moveSpeed: 200,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        showNotation: true
    };
    
    // Для iOS отключаем анимации для производительности
    if (isIOS) {
        boardConfig.moveSpeed = 0;
    }
    
    board = Chessboard('myBoard', boardConfig);
    
    if (playerColor === 'b') board.orientation('black');
    
    // Оптимизированная обработка тач-событий для iOS
    if (isMobile && playerColor) {
        attachMobileClickHandler();
    }
    
    // Предотвращение скролла при таче на доске
    $('#myBoard').on('touchmove', function(e) {
        e.preventDefault();
    });
    
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
    // Отключаем drag-and-drop на мобильных
    if (board && board.destroy && isMobile) {
        const config = board.getConfig();
        config.draggable = false;
        board.destroy();
        board = Chessboard('myBoard', config);
    }
    
    // Удаляем старые обработчики
    $('#myBoard').off('click touchstart');
    
    // Используем touchstart для iOS для лучшей отзывчивости
    const eventType = isIOS ? 'touchstart' : 'click';
    
    $('#myBoard').on(eventType, '.square-55d63', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const square = $(this).attr('data-square');
        if (square) {
            handleMobileClick(square);
        }
    });
    
    // Отключаем перетаскивание изображений
    $('#myBoard').on('dragstart', 'img', function(e) {
        e.preventDefault();
        return false;
    });
}

function handleMobileClick(square) {
    // Проверки
    if (game.game_over()) return;
    if (!playerColor) return;
    if (game.turn() !== playerColor) return;
    if (pendingMove) return;
    
    const piece = game.get(square);
    
    // Случай 1: Уже есть выбранная фигура
    if (selectedSquare) {
        if (selectedSquare === square) {
            clearSelection();
            return;
        }
        
        const move = game.move({ from: selectedSquare, to: square, promotion: 'q', verbose: true });
        
        if (move) {
            pendingMove = move;
            board.position(game.fen(), true);
            document.getElementById('confirm-move-box').classList.remove('hidden');
            clearSelection();
        } else {
            if (piece && piece.color === playerColor) {
                selectSquare(square);
            } else {
                clearSelection();
            }
        }
    } 
    else {
        if (piece && piece.color === playerColor) {
            selectSquare(square);
        }
    }
}

function selectSquare(square) {
    clearSelection();
    selectedSquare = square;
    
    const selectedElement = $(`.square-${square}`);
    selectedElement.addClass('highlight-selected');
    
    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        $(`.square-${move.to}`).addClass('highlight-possible');
    });
}

function clearSelection() {
    selectedSquare = null;
    removeHighlights();
}

function removeHighlights() { 
    $('#myBoard .square-55d63').removeClass('highlight-selected highlight-possible'); 
}

function handleDrop(source, target) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) return 'snapback';
    
    const testMove = game.move({ from: source, to: target, promotion: 'q', verbose: true });
    if (testMove === null) return 'snapback';
    
    game.undo();
    pendingMove = testMove;
    setTimeout(() => board.position(game.fen(), true), 50);
    document.getElementById('confirm-move-box').classList.remove('hidden');
    return 'snapback';
}

function setupGameControls(gameRef, roomId) {
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
    
    document.getElementById('cancel-move-btn').onclick = () => {
        if (pendingMove) {
            pendingMove = null;
            document.getElementById('confirm-move-box').classList.add('hidden');
            board.position(game.fen(), true);
            clearSelection();
        }
    };
    
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
    
    document.getElementById('exit-btn').onclick = () => {
        if (confirm("Выйти в лобби?")) {
            location.href = location.origin + location.pathname;
        }
    };
    
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
