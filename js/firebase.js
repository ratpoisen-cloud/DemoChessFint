// ==================== FIREBASE ОПЕРАЦИИ ====================
// Отвечает за: все взаимодействия с Firebase (чтение, запись, транзакции)

// Импортируем Firebase функции из глобального объекта window
// Они доступны после загрузки firebase-config.js (type="module")

// Ссылки на Firebase
window.getGameRef = function(roomId) {
    return ref(window.db, `games/${roomId}`);
};

window.getPlayersRef = function(roomId) {
    return ref(window.db, `games/${roomId}/players`);
};

window.getTakebackRef = function(roomId) {
    return ref(window.db, `games/${roomId}/takebackRequest`);
};
// Ссылка на запрос ничьей
window.getDrawRef = function(roomId) {
    return ref(window.db, `games/${roomId}/drawRequest`);
};
// Создание игры
window.createGame = async function(roomId, pgn, fen) {
    const now = Date.now();
    return await set(ref(window.db, `games/${roomId}`), { 
        pgn: pgn, 
        fen: fen,
        gameState: 'active',
        createdAt: now,
        lastMoveTime: now  // Добавляем время последнего хода (при создании = время создания)
    });
};
// Обновление игры
window.updateGame = function(gameRef, data) {
    return update(gameRef, data);
};

// Добавление игрока (транзакция)
window.addPlayerToGame = async function(playersRef, uid, uName) {
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
};

// Слежение за играми в лобби
window.watchGames = function(callback) {
    return onValue(ref(window.db, `games`), callback);
};

// Слежение за конкретной игрой
window.watchGame = function(gameRef, callback) {
    return onValue(gameRef, callback);
};

// Дожидаемся загрузки Firebase функций
window.waitForFirebase = function() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (typeof ref !== 'undefined' && typeof set !== 'undefined' && 
                typeof onValue !== 'undefined' && typeof runTransaction !== 'undefined' &&
                typeof update !== 'undefined' && typeof get !== 'undefined') {
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
};
