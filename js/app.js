import { db } from './firebase-config.js';
import { ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    window.history.pushState({}, '', `?room=${roomId}`);
}

const gameRef = ref(db, 'games/' + roomId);
const playersRef = ref(db, 'games/' + roomId + '/players');

let board = null;
let game = new Chess();
let playerColor = null; // 'w', 'b' или null для зрителя

// --- 1. ОПРЕДЕЛЕНИЕ РОЛИ ИГРОКА ---
// Используем транзакцию, чтобы два игрока не заняли один цвет одновременно
runTransaction(playersRef, (currentPlayers) => {
    if (currentPlayers === null) {
        playerColor = 'w';
        return { white: true };
    } else if (!currentPlayers.black) {
        playerColor = 'b';
        return { ...currentPlayers, black: true };
    }
    return; // Зритель
}).then(() => {
    const colorText = playerColor === 'w' ? 'БЕЛЫХ' : (playerColor === 'b' ? 'ЧЕРНЫХ' : 'ЗРИТЕЛЯ');
    document.getElementById('user-color').innerText = colorText;
    if (playerColor === 'b') board.orientation('black'); // Переворачиваем доску для черных
});

// --- 2. ПРОВЕРКА ПРАВА ХОДА ---
function onDragStart (source, piece, position, orientation) {
    // Не даем двигать фигуры, если игра окончена
    if (game.game_over()) return false;

    // Зритель не может ходить
    if (!playerColor) return false;

    // Можно двигать только свои фигуры и только в свой ход
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) ||
        (playerColor === 'b' && piece.search(/^w/) !== -1) ||
        (game.turn() !== playerColor)) {
        return false;
    }
}

function onDrop(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q'
    });

    if (move === null) return 'snapback';

    updateFirebase();
}

// --- 3. ОТМЕНА ХОДА ---
document.getElementById('undo-btn').onclick = () => {
    // Отменяем ход только если сейчас ход противника (т.е. мы только что сходили)
    // Или если это дружеская игра — можно разрешить всегда
    game.undo();
    updateFirebase();
};

function updateFirebase() {
    set(gameRef, {
        fen: game.fen(),
        turn: game.turn(),
        players: { white: true, black: true } // Сохраняем состояние игроков
    });
}

onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (data && data.fen !== game.fen()) {
        game.load(data.fen);
        board.position(data.fen);
    }
    updateStatus();
});

function updateStatus() {
    const moveColor = (game.turn() === 'b') ? 'Черных' : 'Белых';
    let status = game.in_checkmate() ? `Мат! ${moveColor} проиграли.` : `Ход ${moveColor}`;
    if (game.in_check()) status += ' (Шах!)';
    document.getElementById('status').innerText = status;
}

board = Chessboard('myBoard', {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart, // Добавили проверку начала перетаскивания
    onDrop: onDrop,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
});
