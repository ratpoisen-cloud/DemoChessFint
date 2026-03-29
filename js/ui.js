// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================
// Отвечает за: статус игры, индикатор хода, историю ходов, модальные окна

// Обновление UI
window.updateUI = function(data) {
    if (!data) return;
    
    const isMyTurn = window.playerColor && (window.playerColor === window.game.turn());
    
    window.updateTurnIndicator(isMyTurn);
    window.updateGameStatus(data);
    window.updateMoveHistory();
    window.updateGameModal(data);
};

// Обновление индикатора хода
window.updateTurnIndicator = function(isMyTurn) {
    const turnStatus = document.getElementById('turn-status');
    const turnText = document.getElementById('turn-text');
    
    if (!turnStatus || !turnText) return;
    
    if (window.game.game_over()) {
        turnStatus.className = 'turn-status opponent-turn';
        turnText.innerText = 'ИГРА ОКОНЧЕНА';
        return;
    }
    
    if (!window.playerColor) {
        turnStatus.className = 'turn-status opponent-turn';
        turnText.innerHTML = 'НАБЛЮДАТЕЛЬ';
        return;
    }
    
    if (isMyTurn) {
        turnStatus.className = 'turn-status my-turn';
        turnText.innerHTML = 'ВАШ ХОД';
    } else {
        turnStatus.className = 'turn-status opponent-turn';
        turnText.innerHTML = 'Ход соперника';
    }
};

// Обновление текстового статуса игры
window.updateGameStatus = function(data) {
    const statusText = document.getElementById('game-status-text');
    if (!statusText) return;
    
    if (window.game.game_over()) {
        statusText.innerHTML = data.message || window.getGameResultMessage(window.game);
    } else if (window.game.in_check()) {
        statusText.innerHTML = `ШАХ! ${window.game.turn() === 'w' ? 'Белым' : 'Чёрным'}`;
    } else {
        statusText.innerHTML = '♟️ Игра активна';
    }
};

// Обновление истории ходов
window.updateMoveHistory = function() {
    const history = window.game.history({ verbose: true });
    const moveListDiv = document.getElementById('move-list');
    
    if (!moveListDiv) return;
    
    moveListDiv.innerHTML = '';
    
    if (history.length === 0) {
        moveListDiv.innerHTML = '<div style="grid-column: span 3; text-align: center; color: var(--text-secondary);">Нет ходов</div>';
        return;
    }
    
    for (let i = 0; i < history.length; i++) {
        const moveNum = Math.floor(i / 2) + 1;
        const isWhiteMove = i % 2 === 0;
        
        if (isWhiteMove) {
            moveListDiv.innerHTML += `
                <div style="color: var(--text-secondary);">${moveNum}.</div>
                <div>${history[i].san || history[i]}</div>
                <div></div>
            `;
        } else {
            const lastRow = moveListDiv.lastElementChild;
            if (lastRow && lastRow.children.length === 3) {
                lastRow.children[2].innerHTML = history[i].san || history[i];
            } else {
                moveListDiv.innerHTML += `
                    <div style="color: var(--text-secondary);">${moveNum}</div>
                    <div></div>
                    <div>${history[i].san || history[i]}</div>
                `;
            }
        }
    }
    
    moveListDiv.scrollTop = moveListDiv.scrollHeight;
};

// Обновление модального окна окончания игры
window.updateGameModal = function(data) {
    if (data.gameState === 'game_over' && document.getElementById('game-modal').classList.contains('hidden')) {
        document.getElementById('game-modal').classList.remove('hidden');
        document.getElementById('modal-title').innerHTML = '🏆 Игра окончена';
        document.getElementById('modal-desc').innerHTML = data.message || window.getGameResultMessage(window.game);
        if (data.players) {
        window.game.header('White', data.players.whiteName || 'Unknown');
        window.game.header('Black', data.players.blackName || 'Unknown');
    }
    window.game.header('Result', window.game.in_draw() ? '1/2-1/2' : (window.game.turn() === 'w' ? '0-1' : '1-0'));
        document.getElementById('confirm-move-box').classList.add('hidden');
        window.pendingMove = null;
        window.clearSelection();
    }
};

// Обновление бейджа игрока
window.updatePlayerBadge = function() {
    const userColorEl = document.getElementById('user-color');
    const playerBadge = document.querySelector('.player-badge');
    
    if (userColorEl) {
        userColorEl.innerText = window.playerColor 
            ? (window.playerColor === 'w' ? 'Белые' : 'Чёрные') 
            : 'Наблюдатель';
    }
    
    if (playerBadge) {
        playerBadge.className = `player-badge ${
            window.playerColor === 'w' ? 'white-piece' : 
            window.playerColor === 'b' ? 'black-piece' : ''
        }`;
    }
};