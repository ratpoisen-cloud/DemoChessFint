// ==================== УПРАВЛЕНИЕ ДОСКОЙ ====================
// Отвечает за: инициализацию доски, подсветку клеток, мобильные клики

// Инициализация доски
window.initBoard = function(playerColor) {
    const boardConfig = {
        draggable: !window.isMobile && playerColor !== null,
        onDrop: window.handleDrop,
        position: 'start',
        moveSpeed: 'slow',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/alpha/{piece}.png'
    };
    
    window.board = Chessboard('myBoard', boardConfig);
    
    if (playerColor === 'b') window.board.orientation('black');
    
    if (window.isMobile && playerColor) {
        window.attachMobileClickHandler();
    }
    
    return window.board;
};

// Обновление позиции доски
window.updateBoardPosition = function(fen, animate = true) {
    if (window.board) {
        window.board.position(fen, animate);
    }
};

// Сброс подсветки
window.removeHighlights = function() {
    $('#myBoard .square-55d63').removeClass('highlight-selected highlight-possible highlight-capture');
};

// Подсветка клетки
window.highlightSquare = function(square, type) {
    $(`.square-${square}`).addClass(type);
};

// Выделение фигуры и подсветка ходов
window.selectSquare = function(square) {
    window.removeHighlights();
    window.selectedSquare = square;
    
    window.highlightSquare(square, 'highlight-selected');
    
    const moves = window.game.moves({ square: square, verbose: true });
    moves.forEach(move => {
        if (move.captured) {
            window.highlightSquare(move.to, 'highlight-capture');
        } else {
            window.highlightSquare(move.to, 'highlight-possible');
        }
    });
};

// Сброс выделения
window.clearSelection = function() {
    window.selectedSquare = null;
    window.removeHighlights();
};

// Прикрепление обработчика для мобильных устройств
window.attachMobileClickHandler = function() {
    $('#myBoard').off('click');
    $('#myBoard').on('click', '.square-55d63', function(e) {
        e.stopPropagation();
        const square = $(this).attr('data-square');
        if (square) {
            window.handleMobileClick(square);
        }
    });
};

// Обновление ориентации доски
window.setBoardOrientation = function(color) {
    if (window.board) {
        window.board.orientation(color === 'b' ? 'black' : 'white');
    }
};
