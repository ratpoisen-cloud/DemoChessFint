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