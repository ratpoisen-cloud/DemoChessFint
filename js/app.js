import { db, auth } from './firebase-config.js';
import { 
    signInWithPopup, GoogleAuthProvider, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { ref, set, onValue, runTransaction, update, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

let board, game = new Chess(), playerColor = null, pendingMove = null, currentUser = null;
let selectedSquare = null;

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

    document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => location.href = location.origin + location.pathname);
}

// --- ЛОББИ ---
function initLobby() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden'); // Гарантированно прячем игру
    
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

        const gameSection = document.getElementById('game-section');
        const isGameActive = gameSection && !gameSection.classList.contains('hidden');
        
        const requestBox = document.getElementById('takeback-request-box');
        if (isGameActive && data.takebackRequest?.status === 'pending' && data.takebackRequest.from !== (currentUser?.uid || 'anon')) {
            requestBox.classList.remove('hidden');
        } else {
            requestBox.classList.add('hidden');
        }

        updateUI(data);
    });

    setupGameControls(gameRef, roomId);
}

// ==================== ДЕСКТОП: Перетаскивание ====================
function handleDrop(source, target) {
    if (game.game_over() || !playerColor || game.turn() !== playerColor || pendingMove) return 'snapback';

    let move = null;

    if ((source === 'e1' && (target === 'h1' || target === 'a1')) || 
        (source === 'e8' && (target === 'h8' || target === 'a8'))) {
        const isKingside = target === 'h1' || target === 'h8';
        move = game.move(isKingside ? 'O-O' : 'O-O-O');
    } else {
        move = game.move({ from: source, to: target, promotion: 'q' });
    }

    if (move === null) return 'snapback';

    pendingMove = move;
    board.position(game.fen());
    document.getElementById('confirm-move-box').classList.remove('hidden');
    return move;
}

// ==================== МОБИЛЬНЫЙ ====================
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
            if (piece && piece.color === playerColor) selectSquare(square);
            else { removeHighlights(); selectedSquare = null; }
        }
    } else {
        const piece = game.get(square);
        if (piece && piece.color === playerColor) selectSquare(square);
    }
}

function selectSquare(square) {
    removeHighlights();
    selectedSquare = square;
    $(`.square-${square}`).addClass('highlight-selected');

    const moves = game.moves({ square: square, verbose: true });
    moves.forEach(m => $(`.square-${m.to}`).addClass('highlight-possible'));
}

function removeHighlights() {
    $('.square-55d63').removeClass('highlight-selected highlight-possible');
}

// ==================== Управление ====================
function setupGameControls(gameRef, roomId) {
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

    document.getElementById('undo-btn').onclick = () => {
        game.undo();
        board.position(game.fen());
        pendingMove = null;
        document.getElementById('confirm-move-box').classList.add('hidden');
        removeHighlights();
    };

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

    document.getElementById('resign-btn').onclick = () => {
        if (confirm("Сдаться?")) {
            const win = playerColor === 'w' ? 'Черные' : 'Белые';
            update(gameRef, { gameState: 'game_over', message: `${win} победили (соперник сдался)` });
        }
    };

    document.getElementById('exit-btn').onclick = () => location.href = location.origin + location.pathname;
    document.getElementById('modal-exit-btn').onclick = () => location.href = location.origin + location.pathname;

    document.getElementById('modal-rematch-btn').onclick = async () => {
        const p = (await get(ref(db, `games/${roomId}/players`))).val();
        await set(ref(db, `games/${roomId}/players`), { white: p.black || 'anon', black: p.white || 'anon' });
        await update(gameRef, { pgn: '', fen: 'start', turn: 'w', gameState: 'playing', takebackRequest: null });
        location.reload();
    };

    const linkEl = document.getElementById('room-link');
    const shareBtn = document.getElementById('share-btn');
    linkEl.value = window.location.href;

    linkEl.onclick = () => {
        linkEl.select();
        document.execCommand('copy');
        alert('Ссылка скопирована!');
    };

    shareBtn.onclick = async () => {
        const shareData = { title: 'Fentanyl Chess', text: 'Присоединяйся!', url: window.location.href };
        try {
            if (navigator.share && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                linkEl.select();
                document.execCommand('copy');
                alert('Ссылка скопирована!');
            }
        } catch (err) {
            if (err.name !== 'AbortError') alert('Ссылка скопирована!');
        }
    };
}

function getGameResultMessage() {
    if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'Черные' : 'Белые';
        return `Мат! ${winner} победили`;
    }
    if (game.in_draw()) {
        if (game.in_stalemate()) return "Ничья (пат)";
        if (game.in_threefold_repetition()) return "Ничья (повторение)";
        if (game.insufficient_material()) return "Ничья (недостаточно материала)";
        return "Ничья";
    }
    return "Игра окончена";
}

function updateUI(data) {
    const currentTurn = game.turn();
    const isMyTurn = (playerColor === currentTurn);

    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = `Ход: ${currentTurn === 'w' ? 'Белых' : 'Черных'}${game.in_check() ? ' (Шах!)' : ''}`;
    }

    updateTurnIndicator(isMyTurn);

    const moves = document.getElementById('move-list');
    if (moves) {
        moves.innerHTML = game.history().map((m, i) => 
            (i % 2 === 0 ? `<span>${Math.floor(i/2)+1}.</span>` : '') + `<b>${m}</b>`
        ).join(' ');
    }

    const gameSection = document.getElementById('game-section');
    const isGameActive = gameSection && !gameSection.classList.contains('hidden');

    if (data.gameState === 'game_over' && isGameActive) {
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
