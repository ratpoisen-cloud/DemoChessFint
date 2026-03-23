import { db } from './firebase-config.js';
import { ref, set, onValue, runTransaction, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');
if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    window.history.pushState({}, '', `?room=${roomId}`);
}
document.getElementById('room-link').value = window.location.href;

const gameRef = ref(db, 'games/' + roomId);
const playersRef = ref(db, 'games/' + roomId + '/players');

const ChessInstance = window.Chess || Chess;
let game = new ChessInstance();
let board = null;
let playerColor = null; 

// Элементы UI
const statusEl = document.getElementById('status');
const modal = document.getElementById('game-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalBtn = document.getElementById('modal-btn');
const resignBtn = document.getElementById('resign-btn');
const rematchBtn = document.getElementById('rematch-btn');

// 1. ВХОД В КОМНАТУ И ВЫБОР ЦВЕТА
runTransaction(playersRef, (players) => {
    if (!players) {
        playerColor = 'w';
        return { white: true }; // Первый игрок - белый
    } else if (!players.black) {
        playerColor = 'b';
        return { ...players, black: true }; // Второй - черный
    }
    return; // Третий - зритель
}).then(() => {
    const colorText = playerColor === 'w' ? 'Белые' : (playerColor === 'b' ? 'Черные' : 'Зритель');
    document.getElementById('user-color').innerText = colorText;
    
    // ПЕРЕВОРОТ ДОСКИ ДЛЯ ЧЕРНЫХ!
    if (playerColor === 'b') {
        board.orientation('black');
    }

    // Если мы зашли вторыми (черными), отправляем в базу сигнал, что игра началась
    if (playerColor === 'b') {
        update(gameRef, { gameState: 'playing' });
    }
});

// 2. СЛУШАЕМ ИЗМЕНЕНИЯ В FIREBASE
onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Синхронизация доски
    if (data.fen && data.fen !== game.fen()) {
        game.load(data.fen);
        board.position(data.fen);
    }

    // Обработка состояний (UI)
    if (data.gameState === 'waiting' || !data.gameState) {
        showModal('Ожидание соперника...', 'Отправь ссылку другу. Игра начнется, когда он зайдет.');
        resignBtn.classList.add('hidden');
    } 
    else if (data.gameState === 'playing') {
        hideModal();
        if (playerColor) resignBtn.classList.remove('hidden');
        rematchBtn.classList.add('hidden');
    } 
    else if (data.gameState === 'game_over') {
        showModal('Игра окончена!', data.message);
        resignBtn.classList.add('hidden');
        if (playerColor) rematchBtn.classList.remove('hidden');
    }

    updateStatusUI();
});

// 3. ПРАВИЛА ПЕРЕТАСКИВАНИЯ
function onDragStart(source, piece) {
    if (game.game_over() || !playerColor) return false;
    
    // Проверка: можно двигать только свои фигуры и только в свой ход
    if ((playerColor === 'w' && piece.search(/^b/) !== -1) ||
        (playerColor === 'b' && piece.search(/^w/) !== -1) ||
        (game.turn() !== playerColor)) {
        return false;
    }
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';

    // Проверяем, не закончилась ли игра после нашего хода
    let newState = 'playing';
    let msg = '';
    if (game.in_checkmate()) {
        newState = 'game_over';
        msg = `Мат! Победили ${(game.turn() === 'w' ? 'Черные' : 'Белые')}`;
    } else if (game.in_draw()) {
        newState = 'game_over';
        msg = 'Ничья!';
    }

    update(gameRef, { fen: game.fen(), turn: game.turn(), gameState: newState, message: msg });
}

// 4. КНОПКИ (Сдаться и Реванш)
resignBtn.onclick = () => {
    const winner = playerColor === 'w' ? 'Черные' : 'Белые';
    update(gameRef, { 
        gameState: 'game_over', 
        message: `Игрок сдался. Победили ${winner}!` 
    });
};

rematchBtn.onclick = () => {
    game.reset(); // Сброс логики
    update(gameRef, { 
        fen: game.fen(), 
        turn: 'w', 
        gameState: 'playing', 
        message: '' 
    });
};

// Вспомогательные функции UI
function showModal(title, desc) {
    modal.classList.remove('hidden');
    modalTitle.innerText = title;
    modalDesc.innerText = desc;
}
function hideModal() { modal.classList.add('hidden'); }

function updateStatusUI() {
    let status = `Ход: ${(game.turn() === 'b') ? 'Черных' : 'Белых'}`;
    if (game.in_check()) status += ' (Шах!)';
    statusEl.innerText = status;
}

// Инициализация доски
board = Chessboard('myBoard', {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
});

document.getElementById('room-link').onclick = function() {
    this.select(); document.execCommand("copy");
    alert("Ссылка скопирована!");
};
