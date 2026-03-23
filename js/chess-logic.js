// Шахматная логика с поддержкой перетаскивания
class ChessGame {
    constructor() {
        this.board = Array(8).fill().map(() => Array(8).fill(null));
        this.currentTurn = 'white';
        this.gameOver = false;
        this.winner = null;
        this.enPassantTarget = null;
        this.moveHistory = [];
        this.selectedRow = null;
        this.selectedCol = null;
        this.initBoard();
    }

    initBoard() {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                this.board[i][j] = null;
            }
        }
        
        // Пешки
        for (let i = 0; i < 8; i++) {
            this.board[1][i] = { type: 'pawn', color: 'black' };
            this.board[6][i] = { type: 'pawn', color: 'white' };
        }
        
        // Фигуры
        const backRowBlack = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        const backRowWhite = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        
        for (let i = 0; i < 8; i++) {
            this.board[0][i] = { type: backRowBlack[i], color: 'black' };
            this.board[7][i] = { type: backRowWhite[i], color: 'white' };
        }
        
        this.currentTurn = 'white';
        this.gameOver = false;
        this.winner = null;
        this.enPassantTarget = null;
        this.moveHistory = [];
    }

    copyBoard() {
        const newBoard = Array(8).fill().map(() => Array(8).fill(null));
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (this.board[i][j]) {
                    newBoard[i][j] = { ...this.board[i][j] };
                }
            }
        }
        return newBoard;
    }

    restoreBoard(boardData) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                this.board[i][j] = boardData[i][j] ? { ...boardData[i][j] } : null;
            }
        }
    }

    saveState() {
        this.moveHistory.push({
            board: this.copyBoard(),
            currentTurn: this.currentTurn,
            gameOver: this.gameOver,
            winner: this.winner,
            enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null
        });
        if (this.moveHistory.length > 50) this.moveHistory.shift();
    }

    undo() {
        if (this.moveHistory.length === 0) return false;
        const last = this.moveHistory.pop();
        this.restoreBoard(last.board);
        this.currentTurn = last.currentTurn;
        this.gameOver = last.gameOver;
        this.winner = last.winner;
        this.enPassantTarget = last.enPassantTarget ? { ...last.enPassantTarget } : null;
        return true;
    }

    getPieceAt(row, col) {
        return this.board[row][col];
    }

    getPseudoMoves(row, col, piece) {
        const moves = [];
        const color = piece.color;
        const type = piece.type;

        if (type === 'pawn') {
            const dir = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            const newRow = row + dir;
            
            if (newRow >= 0 && newRow < 8 && !this.board[newRow][col]) {
                moves.push({ row: newRow, col });
                if (row === startRow && !this.board[row + dir * 2][col]) {
                    moves.push({ row: row + dir * 2, col });
                }
            }
            
            for (const dc of [-1, 1]) {
                const newCol = col + dc;
                if (newCol >= 0 && newCol < 8 && newRow >= 0 && newRow < 8) {
                    const target = this.board[newRow][newCol];
                    if (target && target.color !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                    if (this.enPassantTarget && this.enPassantTarget.x === newCol && this.enPassantTarget.y === newRow) {
                        moves.push({ row: newRow, col: newCol, enPassant: true });
                    }
                }
            }
        } 
        else if (type === 'knight') {
            const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            for (const [dr, dc] of offsets) {
                const nr = row + dr, nc = col + dc;
                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = this.board[nr][nc];
                    if (!target || target.color !== color) {
                        moves.push({ row: nr, col: nc });
                    }
                }
            }
        }
        else if (type === 'king') {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = row + dr, nc = col + dc;
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                        const target = this.board[nr][nc];
                        if (!target || target.color !== color) {
                            moves.push({ row: nr, col: nc });
                        }
                    }
                }
            }
        }
        else {
            let dirs = [];
            if (type === 'rook') dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            else if (type === 'bishop') dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            else if (type === 'queen') dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
            
            for (const [dr, dc] of dirs) {
                let nr = row + dr, nc = col + dc;
                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                    const target = this.board[nr][nc];
                    if (!target) {
                        moves.push({ row: nr, col: nc });
                    } else {
                        if (target.color !== color) moves.push({ row: nr, col: nc });
                        break;
                    }
                    nr += dr;
                    nc += dc;
                }
            }
        }
        return moves;
    }

    isSquareAttacked(row, col, attackingColor) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const piece = this.board[i][j];
                if (piece && piece.color === attackingColor) {
                    const moves = this.getPseudoMoves(i, j, piece);
                    for (const move of moves) {
                        if (move.row === row && move.col === col) return true;
                    }
                }
            }
        }
        return false;
    }

    isKingInCheck(color) {
        let kingPos = null;
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                if (this.board[i][j]?.type === 'king' && this.board[i][j].color === color) {
                    kingPos = { row: i, col: j };
                }
            }
        }
        if (!kingPos) return false;
        const opponent = color === 'white' ? 'black' : 'white';
        return this.isSquareAttacked(kingPos.row, kingPos.col, opponent);
    }

    isMoveLegal(fromRow, fromCol, toRow, toCol, isEnPassant = false) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentTurn) return false;

        const testBoard = new ChessGame();
        testBoard.restoreBoard(this.copyBoard());
        testBoard.enPassantTarget = this.enPassantTarget ? { ...this.enPassantTarget } : null;

        if (isEnPassant && testBoard.enPassantTarget && testBoard.enPassantTarget.x === toCol && testBoard.enPassantTarget.y === toRow) {
            testBoard.board[fromRow][toCol] = null;
        }

        testBoard.board[toRow][toCol] = testBoard.board[fromRow][fromCol];
        testBoard.board[fromRow][fromCol] = null;

        if (testBoard.board[toRow][toCol].type === 'pawn' && (toRow === 0 || toRow === 7)) {
            testBoard.board[toRow][toCol].type = 'queen';
        }

        return !testBoard.isKingInCheck(piece.color);
    }

    makeMove(fromRow, fromCol, toRow, toCol, isEnPassant = false) {
        if (this.gameOver) return false;
        
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentTurn) return false;
        if (!this.isMoveLegal(fromRow, fromCol, toRow, toCol, isEnPassant)) return false;

        this.saveState();

        if (isEnPassant && this.enPassantTarget && this.enPassantTarget.x === toCol && this.enPassantTarget.y === toRow) {
            this.board[fromRow][toCol] = null;
        }

        this.board[toRow][toCol] = this.board[fromRow][fromCol];
        this.board[fromRow][fromCol] = null;

        if (this.board[toRow][toCol].type === 'pawn' && (toRow === 0 || toRow === 7)) {
            this.board[toRow][toCol].type = 'queen';
        }

        let newEnPassant = null;
        if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
            newEnPassant = { x: fromCol, y: (fromRow + toRow) / 2 };
        }
        this.enPassantTarget = newEnPassant;

        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';

        // Проверка мата/пата
        let hasMoves = false;
        for (let i = 0; i < 8 && !hasMoves; i++) {
            for (let j = 0; j < 8 && !hasMoves; j++) {
                const p = this.board[i][j];
                if (p && p.color === this.currentTurn) {
                    const moves = this.getPseudoMoves(i, j, p);
                    for (const move of moves) {
                        if (this.isMoveLegal(i, j, move.row, move.col, move.enPassant)) {
                            hasMoves = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!hasMoves) {
            this.gameOver = true;
            if (this.isKingInCheck(this.currentTurn)) {
                this.winner = this.currentTurn === 'white' ? 'black' : 'white';
            }
        }

        return true;
    }

    getFEN() {
        // Упрощенная FEN для отображения
        let fen = '';
        for (let i = 0; i < 8; i++) {
            let empty = 0;
            for (let j = 0; j < 8; j++) {
                const piece = this.board[i][j];
                if (!piece) {
                    empty++;
                } else {
                    if (empty > 0) {
                        fen += empty;
                        empty = 0;
                    }
                    let symbol = '';
                    switch (piece.type) {
                        case 'king': symbol = 'k'; break;
                        case 'queen': symbol = 'q'; break;
                        case 'rook': symbol = 'r'; break;
                        case 'bishop': symbol = 'b'; break;
                        case 'knight': symbol = 'n'; break;
                        case 'pawn': symbol = 'p'; break;
                    }
                    if (piece.color === 'white') symbol = symbol.toUpperCase();
                    fen += symbol;
                }
            }
            if (empty > 0) fen += empty;
            if (i < 7) fen += '/';
        }
        return fen;
    }
}