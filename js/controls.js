// ==================== КНОПКИ УПРАВЛЕНИЯ ====================
// Отвечает за: подтверждение хода, сдачу, выход, реванш, отмену хода

// Импорт Firebase функций (будут доступны из глобальной области после загрузки)
// Функции ref, set, onValue, get доступны из firebase-config.js

window.setupGameControls = function(gameRef, roomId) {
    // Подтверждение хода
    document.getElementById('confirm-btn').onclick = () => {
        if (!window.pendingMove) return;
        
        window.game.move({
            from: window.pendingMove.from,
            to: window.pendingMove.to,
            promotion: 'q'
        });
        
        const updateData = { 
            pgn: window.game.pgn(), 
            fen: window.game.fen(), 
            turn: window.game.turn(), 
            lastMove: Date.now() 
        };
        
        if (window.game.game_over()) { 
            updateData.gameState = 'game_over'; 
            updateData.message = window.getGameResultMessage(window.game); 
        }
        
        window.updateGame(gameRef, updateData);
        
        window.pendingMove = null;
        document.getElementById('confirm-move-box')?.classList.add('hidden');
        window.clearSelection();
    };
    
    // Отмена неподтвержденного хода
    document.getElementById('cancel-move-btn').onclick = () => {
        if (window.pendingMove) {
            window.pendingMove = null;
            document.getElementById('confirm-move-box')?.classList.add('hidden');
            window.updateBoardPosition(window.game.fen(), false);
            window.clearSelection();
        }
    };
    
    // Сдача
    document.getElementById('resign-btn').onclick = () => {
        if (window.game.game_over()) {
            alert("Игра уже окончена");
            return;
        }
        if (confirm("Вы уверены, что хотите сдаться?")) {
            const winner = window.playerColor === 'w' ? 'Черные' : 'Белые';
            window.updateGame(gameRef, { 
                gameState: 'game_over', 
                message: `${winner} победили (сдача)`,
                pgn: window.game.pgn(),
                resign: window.playerColor
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
        if (window.game.history().length === 0) {
            alert("Нет ходов для отмены");
            return;
        }
        if (window.game.game_over()) {
            alert("Игра уже окончена");
            return;
        }
        window.updateGame(gameRef, { takebackRequest: { from: window.playerColor, timestamp: Date.now() } });
        alert("Запрос отправлен сопернику");
    };
    
    // Слушатель запроса отмены
    const takebackRef = window.getTakebackRef(roomId);
    if (typeof onValue !== 'undefined') {
        onValue(takebackRef, (snap) => {
            const request = snap.val();
            if (!request) {
                document.getElementById('takeback-request-box').classList.add('hidden');
                window.pendingTakeback = null;
                return;
            }
            
            if (request.from !== window.playerColor && !request.answered) {
                document.getElementById('takeback-request-box').classList.remove('hidden');
                window.pendingTakeback = request;
            }
        });
    }
    
    // Принять отмену
    document.getElementById('takeback-accept').onclick = () => {
        if (window.pendingTakeback) {
            window.game.undo();
            window.updateGame(gameRef, { 
                pgn: window.game.pgn(), 
                fen: window.game.fen(), 
                takebackRequest: null 
            });
            document.getElementById('takeback-request-box').classList.add('hidden');
            window.pendingTakeback = null;
            window.clearSelection();
        }
    };
    
    // Отклонить отмену
    document.getElementById('takeback-reject').onclick = () => {
        window.updateGame(gameRef, { takebackRequest: null });
        document.getElementById('takeback-request-box').classList.add('hidden');
        window.pendingTakeback = null;
    };
    
    // Реванш
    document.getElementById('modal-rematch-btn').onclick = async () => {
        const modal = document.getElementById('game-modal');
        modal.classList.add('hidden');
        
        const playersData = (await get(window.getPlayersRef(roomId))).val();
        const newId = window.generateRoomId();
        
        await set(window.getGameRef(newId), {
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
    
    // Выход из модального окна
    document.getElementById('modal-exit-btn').onclick = () => {
        document.getElementById('game-modal').classList.add('hidden');
        location.href = location.origin + location.pathname;
    };
};
