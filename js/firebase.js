// ==================== FIREBASE ОПЕРАЦИИ ====================
// Отвечает за: все взаимодействия с Firebase (чтение, запись, транзакции)

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

// Создание игры
window.createGame = async function(roomId, pgn, fen) {
    return await set(ref(window.db, `games/${roomId}`), { 
        pgn: pgn, 
        fen: fen,
        gameState: 'active',
        createdAt: Date.now()
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
