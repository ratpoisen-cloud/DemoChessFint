// ==================== УТИЛИТЫ ====================
// Отвечает за: вспомогательные функции, определение устройства, генерацию ID

// Определение мобильного устройства
window.isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                   ('ontouchstart' in window && window.innerWidth < 768);

// Генерация ID комнаты
window.generateRoomId = function() {
    return Math.random().toString(36).substring(2, 8);
};

// Получение имени пользователя
window.getUserName = function(user) {
    return user ? (user.displayName || user.email.split('@')[0]) : 'Аноним';
};

// Получение ID пользователя
window.getUserId = function(user) {
    return user ? user.uid : 'anon_' + Math.random().toString(36).substring(2, 9);
};

// Сообщение о результате игры
window.getGameResultMessage = function(game) {
    if (game.in_checkmate()) return `Мат! ${game.turn() === 'w' ? 'Черные' : 'Белые'} победили`;
    if (game.in_stalemate()) return "Пат! Ничья";
    if (game.in_threefold_repetition()) return "Ничья (троекратное повторение)";
    if (game.insufficient_material()) return "Ничья (недостаточно фигур)";
    return "Игра окончена";
};
// Форматирование времени для отображения в лобби
window.formatTimeAgo = function(timestamp) {
    if (!timestamp) return "неизвестно";
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) {
        return "только что";
    } else if (minutes < 60) {
        return `${minutes} мин. назад`;
    } else if (hours < 24) {
        return `${hours} ч. назад`;
    } else if (days < 7) {
        return `${days} дн. назад`;
    } else {
        const date = new Date(timestamp);
        return `${date.getDate()}.${date.getMonth() + 1}`;
    }
};