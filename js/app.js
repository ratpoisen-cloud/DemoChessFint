// ==================== ГЛАВНЫЙ ФАЙЛ ====================
// Отвечает за: инициализацию приложения, последовательную загрузку модулей

// Инициализация приложения
window.addEventListener('DOMContentLoaded', () => {
    // Инициализируем авторизацию
    window.setupAuth();
    
    // Загружаем тему
    window.loadTheme();
    
    // Инициализируем кнопки тем
    window.initThemeButtons();
    // Ждем авторизации для инициализации кнопки очистки
    const checkUser = setInterval(() => {
        if (window.currentUser) {
            clearInterval(checkUser);
            window.initClearFinishedButton(window.currentUser.uid);
        }
    }, 500);
    // Проверяем, есть ли комната в URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        window.initGame(roomId);
    } else {
        window.initLobby();
    }
});

// Обработка изменения размера окна (адаптивность доски)
window.addEventListener('resize', () => {
    if (window.board) {
        requestAnimationFrame(() => window.board.resize());
    }
});