// ==================== ИГРОВАЯ ЛОГИКА ====================
// Отвечает за: лобби, создание/подключение к игре, ходы, синхронизацию

// Переменные состояния игры
window.game = null;
window.playerColor = null;
window.pendingMove = null;
window.selectedSquare = null;
window.currentRoomId = null;
window.pendingTakeback = null;
window.dragSourceSquare = null; // Добавляем переменную для drag-and-drop

// Лобби
window.initLobby = function() {
    document.getElementById('lobby-section').classList.remove('hidden');
    document.getElementById('game-section').classList.add('hidden');
    document.getElementById('create-game-btn').onclick = () => {
        const id = window.generateRoomId();
        location.href = location.origin + location.pathname + `?room=${id}`;
    };
};

// Загрузка игр в лобби
window.loadLobby = function(user) {
    const list = document.getElementById('games-list');
    window.watchGames((snap) => {
        list.innerHTML = '';
        const games = snap.val();
        if (!games) { 
            list.innerHTML = '<div class="empty-lobby">Нет активных партий</div>'; 
            return; 
        }
        
       // Сортировка: сначала активные по последнему ходу (сначала свежие), потом завершённые по последнему ходу
const sortedGames = Object.entries(games).sort((a, b) => {
    const aData = a[1];
    const bData = b[1];
    const aOver = aData.gameState === 'game_over';
    const bOver = bData.gameState === 'game_over';
    
    // Если обе активные или обе завершённые - сортируем по времени последнего хода (сначала свежие)
    if (aOver === bOver) {
        const aTime = aData.lastMoveTime || aData.createdAt || 0;
        const bTime = bData.lastMoveTime || bData.createdAt || 0;
        return bTime - aTime;  // По убыванию (сначала новые)
    }
    
    // Активные игры выше завершённых
    return aOver ? 1 : -1;
});
        
        let hasGames = false;
        
        sortedGames.forEach(([id, data]) => {
            const p = data.players;
            if (p && (p.white === user.uid || p.black === user.uid)) {
                hasGames = true;
                const isOver = data.gameState === 'game_over';
                const myColor = p.white === user.uid ? 'white' : 'black';
                const opponent = (myColor === 'white') ? (p.blackName || "Ожидание...") : (p.whiteName || "Ожидание...");
                
                // Получаем время последнего хода
const lastMoveTime = data.lastMoveTime || data.createdAt || 0;
const timeAgo = window.formatTimeAgo(lastMoveTime);

const item = document.createElement('div');
item.className = `game-item ${isOver ? 'finished' : 'active'}`;
item.innerHTML = `
    <div class="game-info">
        <div>Против: <b>${opponent}</b></div>
        <div class="game-meta">
            <span class="game-id">${id}</span>
            <span class="game-status">${isOver ? 'Завершена' : 'В процессе'}</span>
            <span class="game-time">${timeAgo}</span>
        </div>
        <small>Вы играете ${myColor === 'white' ? 'белыми' : 'черными'}</small>
    </div>
    <div class="game-actions">
        <button class="btn btn-sm play-btn">Играть</button>
        <button class="btn btn-sm delete-btn ${isOver ? '' : 'hidden'}" data-game-id="${id}">Удалить</button>
    </div>
`;
                
                const playBtn = item.querySelector('.play-btn');
                playBtn.onclick = (e) => {
                    e.stopPropagation();
                    location.href = location.origin + location.pathname + `?room=${id}`;
                };
                
                const deleteBtn = item.querySelector('.delete-btn');
                if (deleteBtn && isOver) {
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        window.deleteGame(id, user.uid);
                    };
                }
                
                list.appendChild(item);
            }
        });
        
        if (!hasGames) list.innerHTML = '<div class="empty-lobby">Нет активных партий<br><small>Создайте новую игру!</small></div>';
    });
};

// Инициализация игры
window.initGame = async function(roomId) {
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('lobby-section').classList.add('hidden');
    document.getElementById('room-link').value = window.location.href;
    
    const user = await new Promise(res => { 
        const unsub = onAuthStateChanged(window.auth, u => { unsub(); res(u); }); 
    });
    
    const uid = window.getUserId(user);
    const uName = window.getUserName(user);
    const gameRef = window.getGameRef(roomId);
    const playersRef = window.getPlayersRef(roomId);
    
    window.game = new Chess();
    
    const gameCheck = await get(gameRef);
    if (!gameCheck.exists()) {
        await window.createGame(roomId, window.game.pgn(), window.game.fen());
    }
    
    await window.addPlayerToGame(playersRef, uid, uName);
    
    const p = (await get(playersRef)).val() || {};
    window.playerColor = p.white === uid ? 'w' : (p.black === uid ? 'b' : null);
    
    // Обновляем UI
    window.updatePlayerBadge();
    window.initBoard(window.playerColor);
    
    if (window.playerColor === 'b') window.board.orientation('black');
    
    // Синхронизация игры
    window.watchGame(gameRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.pgn && data.pgn !== window.game.pgn()) { 
           window.game.load_pgn(data.pgn); 
window.updateBoardPosition(window.game.fen(), true);

// 🔥 ВОТ СЮДА ВСТАВЛЯЕМ
const history = window.game.history({ verbose: true });
if (history.length > 0) {
    highlightLastMove(history[history.length - 1]);
}

window.pendingMove = null;
            window.dragSourceSquare = null;
            document.getElementById('confirm-move-box').classList.add('hidden');
            window.removeHighlights();
        }
        window.updateUI(data);
    });
    
    window.setupGameControls(gameRef, roomId);
    window.currentRoomId = roomId;
};
// Функция удаления одной игры
window.deleteGame = async function(gameId, userId) {
    const gameRef = window.getGameRef(gameId);
    const gameData = (await get(gameRef)).val();
    
    if (!gameData) {
        alert("Игра не найдена");
        return;
    }
    
    const players = gameData.players;
    if (players && (players.white === userId || players.black === userId)) {
        const confirmDelete = confirm(`Удалить игру ${gameId}?\nЭто действие нельзя отменить.`);
        if (confirmDelete) {
            await set(gameRef, null);
            alert("Игра удалена");
            if (window.currentUser) {
                window.loadLobby(window.currentUser);
            }
        }
    } else {
        alert("У вас нет прав на удаление этой игры");
    }
};
// Функция отправки запроса на ничью
window.sendDrawRequest = async function(gameRef, roomId) {
    const currentTurn = window.game.turn();
    const request = {
        from: window.playerColor,
        fromName: window.currentUser?.displayName || window.currentUser?.email?.split('@')[0] || 'Игрок',
        timestamp: Date.now(),
        turn: currentTurn
    };
    
    await window.updateGame(gameRef, { drawRequest: request });
    alert("Запрос на ничью отправлен сопернику");
};

// Функция принятия ничьей
window.acceptDraw = async function(gameRef, roomId) {
    const updateData = { 
        gameState: 'game_over', 
        message: 'Ничья по соглашению',
        pgn: window.game.pgn()
    };
    await window.updateGame(gameRef, updateData);
    document.getElementById('draw-request-box').classList.add('hidden');
    window.pendingDraw = null;
    alert("Игра закончилась ничьей");
};

// Функция отклонения ничьей
window.rejectDraw = async function(gameRef, roomId) {
    await window.updateGame(gameRef, { drawRequest: null });
    document.getElementById('draw-request-box').classList.add('hidden');
    window.pendingDraw = null;
    alert("Соперник отклонил запрос на ничью");
};
// Функция массового удаления завершённых игр
window.clearFinishedGames = async function(userId) {
    const games = (await get(ref(window.db, `games`))).val();
    if (!games) return;
    
    let deletedCount = 0;
    
    for (const [gameId, data] of Object.entries(games)) {
        const players = data.players;
        const isOver = data.gameState === 'game_over';
        
        if (isOver && players && (players.white === userId || players.black === userId)) {
            await set(window.getGameRef(gameId), null);
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        alert(`Удалено ${deletedCount} завершённых игр`);
        if (window.currentUser) {
            window.loadLobby(window.currentUser);
        }
    } else {
        alert("Нет завершённых игр для удаления");
    }
};

// Инициализация кнопки массового удаления
window.initClearFinishedButton = function(userId) {
    const clearBtn = document.getElementById('clear-finished-btn');
    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm("Удалить все завершённые игры? Это действие нельзя отменить.")) {
                window.clearFinishedGames(userId);
            }
        };
    }
};