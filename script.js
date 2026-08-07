"use strict";

const FILES = "abcdefgh";
const PIECES = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
};
const PIECE_NAMES = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "" };
const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const firebaseConfig = {
  apiKey: "AIzaSyDHr0TKKvO8wVb8MBT65PPfwtel5Djegjg",
  authDomain: "chess-74f28.firebaseapp.com",
  databaseURL: "https://chess-74f28-default-rtdb.firebaseio.com",
  projectId: "chess-74f28",
  storageBucket: "chess-74f28.firebasestorage.app",
  messagingSenderId: "706064311273",
  appId: "1:706064311273:web:2beaa0fc66741e4148e178"
};
const LOCAL_SAVE_KEY = "royalBoardChessSaveV10";

const clonePiece = piece => piece ? { ...piece } : null;
const opposite = color => color === "w" ? "b" : "w";
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const squareName = (r, c) => `${FILES[c]}${8 - r}`;

class ChessGame {
  constructor() { this.reset(); }

  reset() {
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
    for (let c = 0; c < 8; c++) {
      this.board[0][c] = { type: back[c], color: "b", moved: false };
      this.board[1][c] = { type: "p", color: "b", moved: false };
      this.board[6][c] = { type: "p", color: "w", moved: false };
      this.board[7][c] = { type: back[c], color: "w", moved: false };
    }
    this.turn = "w";
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.lastMove = null;
    this.moveList = [];
    this.history = [];
    this.result = null;
    this.positionHistory = [this.positionKey()];
  }

  snapshot() {
    return {
      board: this.board.map(row => row.map(clonePiece)),
      turn: this.turn,
      enPassant: this.enPassant ? { ...this.enPassant } : null,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      lastMove: this.lastMove ? JSON.parse(JSON.stringify(this.lastMove)) : null,
      moveList: [...this.moveList],
      positionHistory: [...this.positionHistory],
      result: this.result ? { ...this.result } : null
    };
  }

  restore(state) {
    const storedBoard = Array.isArray(state?.board) ? state.board : [];
    this.board = Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => clonePiece(storedBoard[r]?.[c])));
    this.turn = state?.turn === "b" ? "b" : "w";
    this.enPassant = state.enPassant ? { ...state.enPassant } : null;
    this.halfmove = Number(state.halfmove) || 0;
    this.fullmove = Number(state.fullmove) || 1;
    this.lastMove = state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null;
    this.moveList = Array.isArray(state.moveList) ? [...state.moveList] : [];
    this.positionHistory = Array.isArray(state.positionHistory) && state.positionHistory.length
      ? [...state.positionHistory]
      : [this.positionKey()];
    this.result = state.result ? { ...state.result } : null;
  }

  positionKey() {
    const placement = this.board.flat().map(p => p ? `${p.color}${p.type}` : "--").join("");
    const rights = [
      this.canCastleRight("w", "k") ? "K" : "",
      this.canCastleRight("w", "q") ? "Q" : "",
      this.canCastleRight("b", "k") ? "k" : "",
      this.canCastleRight("b", "q") ? "q" : ""
    ].join("") || "-";
    const ep = this.enPassant ? squareName(this.enPassant.r, this.enPassant.c) : "-";
    return `${placement}|${this.turn}|${rights}|${ep}`;
  }

  canCastleRight(color, side) {
    const row = color === "w" ? 7 : 0;
    const rookCol = side === "k" ? 7 : 0;
    const king = this.board[row][4];
    const rook = this.board[row][rookCol];
    return Boolean(king && king.color === color && king.type === "k" && !king.moved &&
      rook && rook.color === color && rook.type === "r" && !rook.moved);
  }

  generateLegalMoves(color = this.turn) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece || piece.color !== color) continue;
        for (const move of this.generatePseudoMoves(r, c)) {
          const state = this.snapshot();
          this.applyMove(move);
          const legal = !this.isKingInCheck(color);
          this.restore(state);
          if (legal) moves.push(move);
        }
      }
    }
    return moves;
  }

  generatePseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const moves = [];
    const push = (toR, toC, extra = {}) => {
      if (!inside(toR, toC)) return;
      const target = this.board[toR][toC];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { r, c }, to: { r: toR, c: toC }, ...extra });
      }
    };

    if (piece.type === "p") {
      const dir = piece.color === "w" ? -1 : 1;
      const startRow = piece.color === "w" ? 6 : 1;
      const promotionRow = piece.color === "w" ? 0 : 7;
      const one = r + dir;
      if (inside(one, c) && !this.board[one][c]) {
        if (one === promotionRow) {
          for (const promotion of ["q", "r", "b", "n"]) push(one, c, { promotion });
        } else {
          push(one, c);
          const two = r + dir * 2;
          if (r === startRow && !piece.moved && !this.board[two][c]) push(two, c, { special: "doublePawn" });
        }
      }
      for (const dc of [-1, 1]) {
        const tr = r + dir, tc = c + dc;
        if (!inside(tr, tc)) continue;
        const target = this.board[tr][tc];
        if (target && target.color !== piece.color) {
          if (tr === promotionRow) {
            for (const promotion of ["q", "r", "b", "n"]) push(tr, tc, { promotion });
          } else push(tr, tc);
        } else if (this.enPassant && this.enPassant.r === tr && this.enPassant.c === tc && this.enPassant.pawnColor !== piece.color) {
          push(tr, tc, { special: "enPassant" });
        }
      }
      return moves;
    }

    if (piece.type === "n") {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) push(r + dr, c + dc);
      return moves;
    }

    if (["b", "r", "q"].includes(piece.type)) {
      const directions = [];
      if (["b", "q"].includes(piece.type)) directions.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (["r", "q"].includes(piece.type)) directions.push([-1,0],[1,0],[0,-1],[0,1]);
      for (const [dr, dc] of directions) {
        let tr = r + dr, tc = c + dc;
        while (inside(tr, tc)) {
          const target = this.board[tr][tc];
          if (!target) push(tr, tc);
          else {
            if (target.color !== piece.color) push(tr, tc);
            break;
          }
          tr += dr; tc += dc;
        }
      }
      return moves;
    }

    if (piece.type === "k") {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) if (dr || dc) push(r + dr, c + dc);
      }
      const enemy = opposite(piece.color);
      if (!piece.moved && !this.isSquareAttacked(r, c, enemy)) {
        const rookK = this.board[r][7];
        if (rookK && rookK.type === "r" && rookK.color === piece.color && !rookK.moved &&
            !this.board[r][5] && !this.board[r][6] &&
            !this.isSquareAttacked(r, 5, enemy) && !this.isSquareAttacked(r, 6, enemy)) {
          push(r, 6, { special: "castleK" });
        }
        const rookQ = this.board[r][0];
        if (rookQ && rookQ.type === "r" && rookQ.color === piece.color && !rookQ.moved &&
            !this.board[r][1] && !this.board[r][2] && !this.board[r][3] &&
            !this.isSquareAttacked(r, 3, enemy) && !this.isSquareAttacked(r, 2, enemy)) {
          push(r, 2, { special: "castleQ" });
        }
      }
      return moves;
    }

    return moves;
  }

  isSquareAttacked(r, c, byColor) {
    const pawnSourceRow = r + (byColor === "w" ? 1 : -1);
    for (const dc of [-1, 1]) {
      const pc = c + dc;
      if (inside(pawnSourceRow, pc)) {
        const p = this.board[pawnSourceRow][pc];
        if (p && p.color === byColor && p.type === "p") return true;
      }
    }

    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const tr = r + dr, tc = c + dc;
      if (inside(tr, tc)) {
        const p = this.board[tr][tc];
        if (p && p.color === byColor && p.type === "n") return true;
      }
    }

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const tr = r + dr, tc = c + dc;
        if (inside(tr, tc)) {
          const p = this.board[tr][tc];
          if (p && p.color === byColor && p.type === "k") return true;
        }
      }
    }

    const rays = [
      [-1,0,["r","q"]], [1,0,["r","q"]], [0,-1,["r","q"]], [0,1,["r","q"]],
      [-1,-1,["b","q"]], [-1,1,["b","q"]], [1,-1,["b","q"]], [1,1,["b","q"]]
    ];
    for (const [dr, dc, types] of rays) {
      let tr = r + dr, tc = c + dc;
      while (inside(tr, tc)) {
        const p = this.board[tr][tc];
        if (p) {
          if (p.color === byColor && types.includes(p.type)) return true;
          break;
        }
        tr += dr; tc += dc;
      }
    }
    return false;
  }

  findKing(color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = this.board[r][c];
      if (p && p.color === color && p.type === "k") return { r, c };
    }
    return null;
  }

  isKingInCheck(color) {
    const king = this.findKing(color);
    return king ? this.isSquareAttacked(king.r, king.c, opposite(color)) : true;
  }

  applyMove(move) {
    const piece = this.board[move.from.r][move.from.c];
    if (!piece) return;
    const originalType = piece.type;
    let captured = this.board[move.to.r][move.to.c];

    this.board[move.from.r][move.from.c] = null;

    if (move.special === "enPassant") {
      captured = this.board[move.from.r][move.to.c];
      this.board[move.from.r][move.to.c] = null;
    }

    if (move.special === "castleK") {
      const rook = this.board[move.from.r][7];
      this.board[move.from.r][7] = null;
      this.board[move.from.r][5] = rook;
      if (rook) rook.moved = true;
    } else if (move.special === "castleQ") {
      const rook = this.board[move.from.r][0];
      this.board[move.from.r][0] = null;
      this.board[move.from.r][3] = rook;
      if (rook) rook.moved = true;
    }

    piece.moved = true;
    if (move.promotion) piece.type = move.promotion;
    this.board[move.to.r][move.to.c] = piece;

    this.enPassant = null;
    if (originalType === "p" && Math.abs(move.to.r - move.from.r) === 2) {
      this.enPassant = {
        r: (move.to.r + move.from.r) / 2,
        c: move.from.c,
        pawnColor: piece.color
      };
    }

    if (originalType === "p" || captured) this.halfmove = 0;
    else this.halfmove++;

    if (piece.color === "b") this.fullmove++;
    this.lastMove = { ...move, piece: { ...piece }, captured: captured ? { ...captured } : null };
    this.turn = opposite(this.turn);
  }

  commitMove(move) {
    if (this.result) return false;
    const legal = this.generateLegalMoves(this.turn).find(m =>
      m.from.r === move.from.r && m.from.c === move.from.c &&
      m.to.r === move.to.r && m.to.c === move.to.c &&
      (m.promotion || null) === (move.promotion || null)
    );
    if (!legal) return false;

    const before = this.snapshot();
    const movingPiece = { ...this.board[legal.from.r][legal.from.c] };
    const capturedBefore = legal.special === "enPassant"
      ? this.board[legal.from.r][legal.to.c]
      : this.board[legal.to.r][legal.to.c];

    this.applyMove(legal);
    this.positionHistory.push(this.positionKey());
    this.evaluateResult();
    const notation = this.moveNotation(legal, movingPiece, capturedBefore);
    this.moveList.push(notation);
    this.history.push(before);
    return true;
  }

  moveNotation(move, movingPiece, captured) {
    if (move.special === "castleK") return `O-O${this.checkSuffix()}`;
    if (move.special === "castleQ") return `O-O-O${this.checkSuffix()}`;
    const from = squareName(move.from.r, move.from.c);
    const to = squareName(move.to.r, move.to.c);
    const capture = captured || move.special === "enPassant";
    const promotion = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
    return `${PIECE_NAMES[movingPiece.type]}${from}${capture ? "x" : "-"}${to}${promotion}${this.checkSuffix()}`;
  }

  checkSuffix() {
    if (this.result?.type === "checkmate") return "#";
    return this.isKingInCheck(this.turn) ? "+" : "";
  }

  evaluateResult() {
    const legal = this.generateLegalMoves(this.turn);
    if (legal.length === 0) {
      if (this.isKingInCheck(this.turn)) this.result = { type: "checkmate", winner: opposite(this.turn) };
      else this.result = { type: "stalemate", winner: null };
      return;
    }
    if (this.halfmove >= 100) {
      this.result = { type: "fifty", winner: null };
      return;
    }
    const key = this.positionKey();
    if (this.positionHistory.filter(k => k === key).length >= 3) {
      this.result = { type: "repetition", winner: null };
      return;
    }
    if (this.isInsufficientMaterial()) this.result = { type: "insufficient", winner: null };
  }

  isInsufficientMaterial() {
    const pieces = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = this.board[r][c];
      if (p && p.type !== "k") pieces.push({ ...p, r, c });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && ["b", "n"].includes(pieces[0].type)) return true;
    if (pieces.every(p => p.type === "b")) {
      const colors = pieces.map(p => (p.r + p.c) % 2);
      return colors.every(color => color === colors[0]);
    }
    return false;
  }

  undo() {
    const state = this.history.pop();
    if (!state) return false;
    this.restore(state);
    return true;
  }
}

class ChessUI {
  constructor() {
    this.game = new ChessGame();
    this.selected = null;
    this.selectedMoves = [];
    this.pendingPromotion = null;
    this.flipped = false;
    this.mode = "computer";
    this.humanColor = "w";
    this.aiColor = "b";
    this.aiThinking = false;
    this.clockSeconds = { w: null, b: null };
    this.clockHistory = [];
    this.timer = null;
    this.toastTimer = null;
    this.audioContext = null;
    this.dragFrom = null;
    this.firebaseReady = false;
    this.firebaseReadyPromise = null;
    this.db = null;
    this.auth = null;
    this.uid = null;
    this.roomCode = null;
    this.roomRef = null;
    this.roomListener = null;
    this.roomPollTimer = null;
    this.roomPollInFlight = false;
    this.onlineColor = null;
    this.isRoomCreator = false;
    this.opponentConnected = false;
    this.applyingRemoteState = false;
    this.onlineBusy = false;
    this.onlineSyncing = false;
    this.onlineVersion = 0;
    this.hasImportedOnlineState = false;
    this.cacheDom();
    this.bindEvents();
    this.initFirebase();
    if (!this.restoreLocalGame()) this.startNewGame();
    this.startClockLoop();
    this.tryJoinFromUrl();
  }

  cacheDom() {
    const ids = [
      "chessboard","modeSelect","colorSelect","difficultySelect","clockSelect","themeSelect",
      "colorField","difficultyField","newGameBtn","undoBtn","flipBtn","drawBtn","resignBtn",
      "soundToggle","hintToggle","statusText","statusDot","lastMoveText","moveHistory","copyMovesBtn",
      "whitePlayerName","blackPlayerName","whiteCaptured","blackCaptured","whiteClock","blackClock",
      "whitePlayerCard","blackPlayerCard","thinkingBadge","promotionModal","promotionOptions","toast",
      "onlinePanel","createOnlineBtn","roomCodeInput","joinOnlineBtn","roomCard","roomCodeText",
      "copyRoomLinkBtn","exitOnlineBtn","onlineStatusText"
    ];
    for (const id of ids) this[id] = document.getElementById(id);
  }

  bindEvents() {
    this.modeSelect.addEventListener("change", () => this.updateSetupVisibility());
    this.newGameBtn.addEventListener("click", () => this.startNewGame());
    this.undoBtn.addEventListener("click", () => this.undo());
    this.flipBtn.addEventListener("click", () => { this.flipped = !this.flipped; this.render(); this.saveLocalGame(); });
    this.drawBtn.addEventListener("click", () => this.endAsDraw());
    this.resignBtn.addEventListener("click", () => this.resign());
    this.copyMovesBtn.addEventListener("click", () => this.copyMoves());
    this.themeSelect.addEventListener("change", () => { this.render(); this.saveLocalGame(); });
    this.hintToggle.addEventListener("change", () => { this.renderBoard(); this.saveLocalGame(); });
    this.createOnlineBtn.addEventListener("click", () => this.createOnlineGame());
    this.joinOnlineBtn.addEventListener("click", () => this.joinOnlineGame(this.roomCodeInput.value));
    this.roomCodeInput.addEventListener("keydown", e => { if (e.key === "Enter") this.joinOnlineGame(this.roomCodeInput.value); });
    this.roomCodeInput.addEventListener("input", () => {
      this.roomCodeInput.value = this.roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });
    this.copyRoomLinkBtn.addEventListener("click", () => this.copyRoomLink());
    this.exitOnlineBtn.addEventListener("click", () => this.exitOnlineGame());
  }

  updateSetupVisibility() {
    const vsComputer = this.modeSelect.value === "computer";
    const online = this.modeSelect.value === "online";
    this.colorField.style.display = vsComputer ? "grid" : "none";
    this.difficultyField.style.display = vsComputer ? "grid" : "none";
    this.newGameBtn.style.display = online ? "none" : "block";
    this.onlinePanel.classList.toggle("show", online);
  }

  startNewGame() {
    if (this.mode === "online" && this.roomCode) {
      this.showToast("Exit the online room before starting another game");
      return;
    }
    this.game.reset();
    this.mode = this.modeSelect.value;
    let chosen = this.colorSelect.value;
    if (chosen === "random") chosen = Math.random() < .5 ? "w" : "b";
    this.humanColor = chosen;
    this.aiColor = opposite(chosen);
    this.flipped = this.mode === "computer" && this.humanColor === "b";
    this.aiThinking = false;
    this.selected = null;
    this.selectedMoves = [];
    this.pendingPromotion = null;
    this.clockHistory = [];
    const minutes = Number(this.clockSelect.value);
    this.clockSeconds = minutes ? { w: minutes * 60, b: minutes * 60 } : { w: null, b: null };
    this.updatePlayerNames();
    this.updateSetupVisibility();
    this.render();
    this.playSound("start");
    this.saveLocalGame();
    if (this.mode === "computer" && this.game.turn === this.aiColor) this.requestAiMove();
  }

  updatePlayerNames() {
    if (this.mode === "online") {
      this.whitePlayerName.textContent = this.onlineColor === "w" ? "You • White" : "Friend • White";
      this.blackPlayerName.textContent = this.onlineColor === "b" ? "You • Black" : "Friend • Black";
    } else if (this.mode === "human") {
      this.whitePlayerName.textContent = "Player 1 • White";
      this.blackPlayerName.textContent = "Player 2 • Black";
    } else if (this.humanColor === "w") {
      this.whitePlayerName.textContent = "You • White";
      this.blackPlayerName.textContent = "Computer • Black";
    } else {
      this.whitePlayerName.textContent = "Computer • White";
      this.blackPlayerName.textContent = "You • Black";
    }
  }

  canHumanAct() {
    if (this.game.result || this.aiThinking || this.onlineSyncing) return false;
    if (this.mode === "online") return Boolean(this.roomCode && this.opponentConnected && this.onlineColor === this.game.turn);
    return this.mode === "human" || this.game.turn === this.humanColor;
  }

  selectSquare(r, c) {
    if (!this.canHumanAct()) return;
    const piece = this.game.board[r][c];
    if (this.selected) {
      const matching = this.selectedMoves.filter(m => m.to.r === r && m.to.c === c);
      if (matching.length) {
        if (matching.length > 1 && matching.some(m => m.promotion)) this.openPromotion(matching);
        else this.performMove(matching[0]);
        return;
      }
    }
    if (piece && piece.color === this.game.turn) {
      this.selected = { r, c };
      this.selectedMoves = this.game.generateLegalMoves(this.game.turn).filter(m => m.from.r === r && m.from.c === c);
    } else {
      this.selected = null;
      this.selectedMoves = [];
    }
    this.renderBoard();
  }

  openPromotion(moves) {
    this.pendingPromotion = moves;
    this.promotionOptions.innerHTML = "";
    for (const type of ["q", "r", "b", "n"]) {
      const move = moves.find(m => m.promotion === type);
      if (!move) continue;
      const button = document.createElement("button");
      button.textContent = PIECES[this.game.turn][type];
      button.title = `Promote to ${type.toUpperCase()}`;
      button.addEventListener("click", () => {
        this.promotionModal.classList.add("hidden");
        this.pendingPromotion = null;
        this.performMove(move);
      });
      this.promotionOptions.appendChild(button);
    }
    this.promotionModal.classList.remove("hidden");
  }

  async performMove(move, isAi = false) {
    if (this.game.result) return;
    const onlineRollback = this.mode === "online" ? this.exportOnlineState() : null;
    this.clockHistory.push({ ...this.clockSeconds });
    const captured = Boolean(this.game.board[move.to.r][move.to.c] || move.special === "enPassant");
    const success = this.game.commitMove(move);
    if (!success) {
      this.clockHistory.pop();
      return;
    }
    this.selected = null;
    this.selectedMoves = [];
    if (this.mode === "online") {
      this.onlineSyncing = true;
      this.onlineStatusText.textContent = "Syncing move…";
    }
    this.render();
    this.saveLocalGame();
    if (this.mode === "online" && !this.applyingRemoteState) {
      await this.syncOnlineState(onlineRollback);
      this.onlineSyncing = false;
      this.updateOnlineStatus();
      this.render();
      this.saveLocalGame();
    }

    if (this.game.result) this.playSound("end");
    else if (this.game.isKingInCheck(this.game.turn)) this.playSound("check");
    else this.playSound(captured ? "capture" : "move");

    if (!isAi && this.mode === "computer" && !this.game.result && this.game.turn === this.aiColor) this.requestAiMove();
  }

  requestAiMove() {
    if (this.game.result || this.aiThinking || this.game.turn !== this.aiColor) return;
    this.aiThinking = true;
    this.thinkingBadge.classList.add("show");
    this.renderStatus();
    window.setTimeout(() => {
      const move = this.chooseAiMove();
      this.aiThinking = false;
      this.thinkingBadge.classList.remove("show");
      if (move && !this.game.result) this.performMove(move, true);
      else this.render();
    }, 260);
  }

  chooseAiMove() {
    const moves = this.game.generateLegalMoves(this.aiColor);
    if (!moves.length) return null;
    const difficulty = this.difficultySelect.value;
    if (difficulty === "easy") return moves[Math.floor(Math.random() * moves.length)];

    const depth = difficulty === "hard" ? 3 : 2;
    let bestScore = -Infinity;
    let bestMoves = [];
    const ordered = this.orderMoves(moves);
    for (const move of ordered) {
      const state = this.game.snapshot();
      this.game.applyMove(move);
      const score = this.minimax(depth - 1, -Infinity, Infinity, false);
      this.game.restore(state);
      if (score > bestScore + 0.01) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) < 0.01) bestMoves.push(move);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  minimax(depth, alpha, beta, maximizing) {
    const color = this.game.turn;
    const moves = this.game.generateLegalMoves(color);
    if (!moves.length) {
      if (this.game.isKingInCheck(color)) return color === this.aiColor ? -999999 - depth : 999999 + depth;
      return 0;
    }
    if (depth === 0) return this.evaluateBoard();

    const ordered = this.orderMoves(moves);
    if (maximizing) {
      let value = -Infinity;
      for (const move of ordered) {
        const state = this.game.snapshot();
        this.game.applyMove(move);
        value = Math.max(value, this.minimax(depth - 1, alpha, beta, false));
        this.game.restore(state);
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of ordered) {
      const state = this.game.snapshot();
      this.game.applyMove(move);
      value = Math.min(value, this.minimax(depth - 1, alpha, beta, true));
      this.game.restore(state);
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  orderMoves(moves) {
    return [...moves].sort((a, b) => this.movePriority(b) - this.movePriority(a));
  }

  movePriority(move) {
    const moving = this.game.board[move.from.r][move.from.c];
    const target = move.special === "enPassant" ? { type: "p" } : this.game.board[move.to.r][move.to.c];
    let score = 0;
    if (target) score += 10 * VALUES[target.type] - VALUES[moving.type];
    if (move.promotion) score += VALUES[move.promotion] + 800;
    if (move.special?.startsWith("castle")) score += 80;
    return score;
  }

  evaluateBoard() {
    let score = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.game.board[r][c];
        if (!p) continue;
        let value = VALUES[p.type];
        const center = 3.5 - (Math.abs(3.5 - r) + Math.abs(3.5 - c)) / 2;
        if (["n", "b"].includes(p.type)) value += center * 9;
        if (p.type === "q") value += center * 3;
        if (p.type === "p") {
          const advance = p.color === "w" ? 6 - r : r - 1;
          value += advance * 8;
          if (c >= 2 && c <= 5) value += 5;
        }
        if (p.type === "k") {
          const homeRow = p.color === "w" ? 7 : 0;
          if (r === homeRow && (c === 6 || c === 2)) value += 45;
        }
        score += p.color === this.aiColor ? value : -value;
      }
    }
    if (this.game.isKingInCheck(opposite(this.aiColor))) score += 28;
    if (this.game.isKingInCheck(this.aiColor)) score -= 32;
    return score;
  }

  undo() {
    if (this.mode === "online") {
      this.showToast("Undo is unavailable in online games");
      return;
    }
    if (this.aiThinking || !this.game.history.length) return;
    let count = this.mode === "computer" ? 2 : 1;
    while (count-- > 0 && this.game.history.length) {
      this.game.undo();
      const oldClock = this.clockHistory.pop();
      if (oldClock) this.clockSeconds = oldClock;
    }
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.playSound("move");
  }

  endAsDraw() {
    if (this.game.result) return;
    const onlineRollback = this.mode === "online" ? this.exportOnlineState() : null;
    this.game.result = { type: "agreement", winner: null };
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.playSound("end");
    this.saveLocalGame();
    if (this.mode === "online") {
      this.onlineSyncing = true;
      this.syncOnlineState(onlineRollback).finally(() => {
        this.onlineSyncing = false;
        this.updateOnlineStatus();
        this.render();
      });
    }
  }

  resign() {
    if (this.game.result) return;
    const onlineRollback = this.mode === "online" ? this.exportOnlineState() : null;
    const resigning = this.mode === "computer" ? this.humanColor :
      this.mode === "online" ? this.onlineColor : this.game.turn;
    this.game.result = { type: "resignation", winner: opposite(resigning) };
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.playSound("end");
    this.saveLocalGame();
    if (this.mode === "online") {
      this.onlineSyncing = true;
      this.syncOnlineState(onlineRollback).finally(() => {
        this.onlineSyncing = false;
        this.updateOnlineStatus();
        this.render();
      });
    }
  }

  render() {
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderCaptured();
    this.renderClocks();
    this.lastMoveText.textContent = this.game.moveList.at(-1) || "No moves yet";
    this.undoBtn.disabled = this.mode === "online" || !this.game.history.length || this.aiThinking;
    const waitingOnline = this.mode === "online" && !this.opponentConnected;
    this.drawBtn.disabled = Boolean(this.game.result) || waitingOnline || this.onlineSyncing;
    this.resignBtn.disabled = Boolean(this.game.result) || waitingOnline || this.onlineSyncing;
  }

  renderBoard() {
    this.chessboard.innerHTML = "";
    this.chessboard.dataset.theme = this.themeSelect.value;
    const rows = this.flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const cols = this.flipped ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const legalMap = new Map(this.selectedMoves.map(m => [`${m.to.r},${m.to.c}`, m]));
    const hints = this.hintToggle.checked;
    const checkedKing = this.game.isKingInCheck(this.game.turn) ? this.game.findKing(this.game.turn) : null;

    rows.forEach((r, displayR) => cols.forEach((c, displayC) => {
      const square = document.createElement("div");
      square.className = `square ${(r + c) % 2 ? "dark" : "light"}`;
      square.dataset.r = r;
      square.dataset.c = c;
      square.setAttribute("role", "button");
      square.setAttribute("aria-label", squareName(r, c));

      if (this.game.lastMove && (
        (this.game.lastMove.from.r === r && this.game.lastMove.from.c === c) ||
        (this.game.lastMove.to.r === r && this.game.lastMove.to.c === c)
      )) square.classList.add("last-move");
      if (this.selected && this.selected.r === r && this.selected.c === c) square.classList.add("selected");
      if (checkedKing && checkedKing.r === r && checkedKing.c === c) square.classList.add("in-check");

      const legalMove = legalMap.get(`${r},${c}`);
      if (hints && legalMove) {
        const occupied = this.game.board[r][c] || legalMove.special === "enPassant";
        square.classList.add(occupied ? "capture" : "legal");
      }

      const piece = this.game.board[r][c];
      if (piece) {
        const span = document.createElement("span");
        span.className = `piece ${piece.color === "w" ? "white-piece" : "black-piece"}`;
        span.textContent = PIECES[piece.color][piece.type];
        span.draggable = this.canHumanAct() && piece.color === this.game.turn;
        span.addEventListener("dragstart", event => this.onDragStart(event, r, c));
        span.addEventListener("dragend", () => this.clearDragStyles());
        square.appendChild(span);
      }

      if (displayC === 0) {
        const rank = document.createElement("span");
        rank.className = "coordinate rank";
        rank.textContent = String(8 - r);
        square.appendChild(rank);
      }
      if (displayR === 7) {
        const file = document.createElement("span");
        file.className = "coordinate file";
        file.textContent = FILES[c];
        square.appendChild(file);
      }

      square.addEventListener("click", () => this.selectSquare(r, c));
      square.addEventListener("dragover", event => {
        if (this.dragFrom) {
          event.preventDefault();
          if (this.selectedMoves.some(m => m.to.r === r && m.to.c === c)) square.classList.add("drag-over");
        }
      });
      square.addEventListener("dragleave", () => square.classList.remove("drag-over"));
      square.addEventListener("drop", event => this.onDrop(event, r, c));
      this.chessboard.appendChild(square);
    }));
  }

  onDragStart(event, r, c) {
    if (!this.canHumanAct()) { event.preventDefault(); return; }
    const piece = this.game.board[r][c];
    if (!piece || piece.color !== this.game.turn) { event.preventDefault(); return; }
    this.dragFrom = { r, c };
    this.selected = { r, c };
    this.selectedMoves = this.game.generateLegalMoves(this.game.turn).filter(m => m.from.r === r && m.from.c === c);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${r},${c}`);
  }

  onDrop(event, r, c) {
    event.preventDefault();
    const matching = this.selectedMoves.filter(m => m.to.r === r && m.to.c === c);
    this.dragFrom = null;
    this.clearDragStyles();
    if (!matching.length) { this.renderBoard(); return; }
    if (matching.length > 1 && matching.some(m => m.promotion)) this.openPromotion(matching);
    else this.performMove(matching[0]);
  }

  clearDragStyles() {
    this.dragFrom = null;
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  }

  renderStatus() {
    this.whitePlayerCard.classList.toggle("active", !this.game.result && this.game.turn === "w");
    this.blackPlayerCard.classList.toggle("active", !this.game.result && this.game.turn === "b");
    this.statusDot.className = "status-dot";

    if (this.game.result) {
      this.statusDot.classList.add("ended");
      const winner = this.game.result.winner === "w" ? "White" : this.game.result.winner === "b" ? "Black" : null;
      const messages = {
        checkmate: `Checkmate • ${winner} wins`,
        stalemate: "Draw by stalemate",
        fifty: "Draw by 50-move rule",
        repetition: "Draw by threefold repetition",
        insufficient: "Draw • insufficient material",
        agreement: "Draw by agreement",
        resignation: `${winner} wins by resignation`,
        timeout: `${winner} wins on time`
      };
      this.statusText.textContent = messages[this.game.result.type] || "Game over";
      return;
    }

    if (this.aiThinking) {
      this.statusDot.classList.add("warning");
      this.statusText.textContent = "Computer is calculating";
      return;
    }

    const color = this.game.turn === "w" ? "White" : "Black";
    if (this.game.isKingInCheck(this.game.turn)) {
      this.statusDot.classList.add("warning");
      this.statusText.textContent = `${color} is in check`;
    } else this.statusText.textContent = `${color} to move`;
  }

  renderHistory() {
    if (!this.game.moveList.length) {
      this.moveHistory.innerHTML = '<p class="empty-state">Your moves will appear here.</p>';
      return;
    }
    this.moveHistory.innerHTML = "";
    for (let i = 0; i < this.game.moveList.length; i += 2) {
      const row = document.createElement("div");
      row.className = "move-row";
      const number = document.createElement("span");
      number.className = "move-number";
      number.textContent = `${i / 2 + 1}.`;
      const white = document.createElement("span");
      white.className = "move-cell";
      white.textContent = this.game.moveList[i] || "";
      const black = document.createElement("span");
      black.className = "move-cell";
      black.textContent = this.game.moveList[i + 1] || "";
      if (i === this.game.moveList.length - 1) white.classList.add("latest");
      if (i + 1 === this.game.moveList.length - 1) black.classList.add("latest");
      row.append(number, white, black);
      this.moveHistory.appendChild(row);
    }
    this.moveHistory.scrollTop = this.moveHistory.scrollHeight;
  }

  renderCaptured() {
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const remaining = { w: { p:0,n:0,b:0,r:0,q:0 }, b: { p:0,n:0,b:0,r:0,q:0 } };
    for (const row of this.game.board) for (const p of row) {
      if (p && p.type !== "k") remaining[p.color][p.type]++;
    }
    const capturedWhite = [];
    const capturedBlack = [];
    for (const type of ["q","r","b","n","p"]) {
      for (let i = remaining.w[type]; i < initial[type]; i++) capturedWhite.push(PIECES.w[type]);
      for (let i = remaining.b[type]; i < initial[type]; i++) capturedBlack.push(PIECES.b[type]);
    }
    this.blackCaptured.textContent = capturedWhite.join("");
    this.whiteCaptured.textContent = capturedBlack.join("");
  }

  startClockLoop() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.clockSeconds.w === null || this.game.result) return;
      if (this.mode === "online" && !this.opponentConnected) return;
      const color = this.game.turn;
      this.clockSeconds[color] = Math.max(0, this.clockSeconds[color] - 1);
      if (this.clockSeconds[color] === 0) {
        this.game.result = { type: "timeout", winner: opposite(color) };
        this.aiThinking = false;
        this.thinkingBadge.classList.remove("show");
        this.playSound("end");
        this.render();
        this.saveLocalGame();
        if (this.mode === "online") this.syncOnlineState();
      } else this.renderClocks();
    }, 1000);
  }

  renderClocks() {
    for (const color of ["w", "b"]) {
      const el = color === "w" ? this.whiteClock : this.blackClock;
      const seconds = this.clockSeconds[color];
      el.textContent = seconds === null ? "--:--" : `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
      el.classList.toggle("low", seconds !== null && seconds <= 20);
    }
  }

  async copyMoves() {
    if (!this.game.moveList.length) { this.showToast("No moves to copy yet"); return; }
    const lines = [];
    for (let i = 0; i < this.game.moveList.length; i += 2) {
      lines.push(`${i / 2 + 1}. ${this.game.moveList[i] || ""} ${this.game.moveList[i + 1] || ""}`.trim());
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Move history copied");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      this.showToast(copied ? "Move history copied" : "Copy blocked by the browser");
    }
  }

  showToast(message) {
    clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.add("show");
    this.toastTimer = setTimeout(() => this.toast.classList.remove("show"), 1800);
  }

  initFirebase() {
    try {
      if (!window.firebase) throw new Error("Firebase SDK did not load");
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      this.auth = firebase.auth();
      this.db = firebase.database();
      this.firebaseReadyPromise = this.auth.signInAnonymously().then(credential => {
        this.uid = credential.user.uid;
        this.firebaseReady = true;
        return true;
      }).catch(error => {
        console.error(error);
        this.showToast(`Firebase auth error: ${error.message}`);
        return false;
      });
    } catch (error) {
      console.error(error);
      this.showToast("Online mode could not start");
    }
  }

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  async ensureFirebaseReady() {
    if (this.firebaseReady && this.uid) return true;
    if (this.firebaseReadyPromise) return this.firebaseReadyPromise;
    this.showToast("Online mode could not connect to Firebase");
    return false;
  }

  async createOnlineGame() {
    if (this.roomRef) {
      this.showToast("Leave the current online game first");
      return;
    }
    if (!await this.ensureFirebaseReady()) return;
    this.setOnlineBusy(true);
    try {
      let code;
      for (let tries = 0; tries < 8; tries++) {
        code = this.generateRoomCode();
        const snap = await this.db.ref(`rooms/${code}`).once("value");
        if (!snap.exists()) break;
        code = null;
      }
      if (!code) throw new Error("No unused room code was available");

      this.game.reset();
      this.modeSelect.value = "online";
      this.mode = "online";
      this.roomCode = code;
      this.roomRef = this.db.ref(`rooms/${code}`);
      this.onlineColor = "w";
      this.isRoomCreator = true;
      this.opponentConnected = false;
      this.onlineVersion = 0;
      this.hasImportedOnlineState = true;
      this.flipped = false;
      this.selected = null;
      this.selectedMoves = [];
      this.pendingPromotion = null;
      this.clockHistory = [];
      const minutes = Number(this.clockSelect.value);
      this.clockSeconds = minutes ? { w: minutes * 60, b: minutes * 60 } : { w: null, b: null };

      const room = {
        creatorUid: this.uid,
        whiteUid: this.uid,
        active: true,
        status: "waiting",
        stateVersion: 0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        state: this.exportOnlineState()
      };
      await this.roomRef.set(room);
      this.attachRoomListener();
      this.showRoomCard();
      this.updatePlayerNames();
      this.updateSetupVisibility();
      this.render();
      history.replaceState({}, "", `${location.pathname}?game=${code}`);
      this.showToast("Online room created");
    } catch (error) {
      console.error(error);
      await this.detachOnlineRoom(false);
      this.showToast("Could not create the online room");
    } finally {
      this.setOnlineBusy(false);
    }
  }

  async joinOnlineGame(rawCode) {
    if (this.roomRef) {
      this.showToast("Leave the current online game first");
      return;
    }
    if (!await this.ensureFirebaseReady()) return;
    const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) { this.showToast("Enter a valid 6-character code"); return; }
    this.setOnlineBusy(true);
    try {
      const ref = this.db.ref(`rooms/${code}`);
      const snap = await ref.once("value");
      if (!snap.exists() || snap.val().active === false) throw new Error("expired");
      const room = snap.val();
      let color = "w";

      if (room.whiteUid !== this.uid) {
        color = "b";
        const claim = await ref.child("blackUid").transaction(currentUid => {
          if (currentUid === null || currentUid === this.uid) return this.uid;
          return undefined;
        });
        if (!claim.committed || claim.snapshot.val() !== this.uid) throw new Error("full");
      }

      this.modeSelect.value = "online";
      this.mode = "online";
      this.roomCode = code;
      this.roomRef = ref;
      this.isRoomCreator = room.creatorUid === this.uid;
      this.onlineColor = color;
      this.onlineVersion = Number(room.stateVersion) || 0;
      if (room.state) this.importOnlineState(room.state);
      this.hasImportedOnlineState = Boolean(room.state);
      this.opponentConnected = Boolean(room.whiteUid);
      if (color === "b") {
        try { await ref.child("blackUid").onDisconnect().remove(); }
        catch (error) { console.warn("Could not register room disconnect cleanup", error); }
      }
      this.flipped = color === "b";
      this.showRoomCard();
      this.updatePlayerNames();
      this.updateOnlineStatus();
      this.render();
      this.attachRoomListener();
      history.replaceState({}, "", `${location.pathname}?game=${code}`);
      this.showToast(`Joined room ${code}`);
    } catch (error) {
      console.error(error);
      await this.detachOnlineRoom(false);
      this.showToast(error.message === "full" ? "This room already has two players" :
        error.message === "expired" ? "This game link has expired" : "Could not join this room");
    } finally {
      this.setOnlineBusy(false);
    }
  }

  attachRoomListener() {
    if (!this.roomRef) return;
    const listener = snapshot => this.applyRoomSnapshot(snapshot);
    this.roomListener = this.roomRef.on("value", listener, error => {
      console.error(error);
      this.onlineStatusText.textContent = "Realtime connection interrupted; reconnecting…";
      this.showToast("Realtime connection interrupted");
    });

    // Safari can occasionally stall Firebase's long-lived localhost transport.
    // An immediate read and a small polling fallback keep both boards converged;
    // the normal listener still delivers moves instantly when available.
    this.roomRef.once("value").then(snapshot => this.applyRoomSnapshot(snapshot)).catch(error => {
      console.error(error);
      this.onlineStatusText.textContent = "Could not read the online room.";
    });
    this.startRoomPolling();
  }

  applyRoomSnapshot(snapshot) {
    if (!snapshot.exists() || snapshot.val().active === false) {
      this.handleExpiredRoom();
      return;
    }

    const room = snapshot.val();
    const wasConnected = this.opponentConnected;
    const opponentUid = this.onlineColor === "w" ? room.blackUid : room.whiteUid;
    this.opponentConnected = Boolean(opponentUid);
    const incomingVersion = Number(room.stateVersion) || 0;
    const shouldImportState = room.state &&
      (!this.hasImportedOnlineState || incomingVersion > this.onlineVersion) &&
      !(this.onlineSyncing && incomingVersion === this.onlineVersion);

    if (shouldImportState) {
      this.applyingRemoteState = true;
      this.importOnlineState(room.state);
      this.onlineVersion = incomingVersion;
      this.hasImportedOnlineState = true;
      this.applyingRemoteState = false;
    }

    this.updateOnlineStatus();
    this.updatePlayerNames();
    if (shouldImportState || wasConnected !== this.opponentConnected) {
      this.render();
      this.saveLocalGame();
    }
  }

  startRoomPolling() {
    clearInterval(this.roomPollTimer);
    this.roomPollTimer = setInterval(async () => {
      if (!this.roomRef || this.roomPollInFlight) return;
      const activeRef = this.roomRef;
      this.roomPollInFlight = true;
      try {
        const snapshot = await activeRef.once("value");
        if (this.roomRef === activeRef) this.applyRoomSnapshot(snapshot);
      } catch (error) {
        console.error(error);
        if (this.roomRef === activeRef) {
          this.onlineStatusText.textContent = "Reconnecting to online game…";
        }
      } finally {
        this.roomPollInFlight = false;
      }
    }, 1000);
  }

  exportOnlineState() {
    const game = this.game.snapshot();
    // Realtime Database deletes null array entries. False is a stable empty-
    // square sentinel and ChessGame.restore converts it back to null.
    game.board = game.board.map(row => row.map(piece => piece || false));
    return {
      game,
      clockSeconds: {
        w: this.clockSeconds.w ?? false,
        b: this.clockSeconds.b ?? false
      }
    };
  }

  importOnlineState(data) {
    if (data.game) this.game.restore(data.game);
    this.game.history = [];
    const clocks = data.clockSeconds || {};
    this.clockSeconds = {
      w: typeof clocks.w === "number" ? clocks.w : null,
      b: typeof clocks.b === "number" ? clocks.b : null
    };
    this.clockHistory = [];
    this.selected = null;
    this.selectedMoves = [];
  }

  async syncOnlineState(rollbackState = null) {
    if (!this.roomRef || !this.roomCode) return;
    const expectedVersion = this.onlineVersion;
    const nextState = this.exportOnlineState();
    try {
      const result = await this.roomRef.transaction(room => {
        if (!room || room.active === false) return undefined;
        const isParticipant = room.whiteUid === this.uid || room.blackUid === this.uid;
        const currentVersion = Number(room.stateVersion) || 0;
        if (!isParticipant || currentVersion !== expectedVersion) return undefined;

        const oldMoveCount = room.state?.game?.moveList?.length || 0;
        const newMoveCount = nextState.game?.moveList?.length || 0;
        if (newMoveCount > oldMoveCount && room.state?.game?.turn !== this.onlineColor) {
          return undefined;
        }

        room.state = nextState;
        room.stateVersion = expectedVersion + 1;
        room.status = nextState.game?.result ? "finished" : "playing";
        room.updatedAt = firebase.database.ServerValue.TIMESTAMP;
        room.lastMoverUid = this.uid;
        return room;
      }, undefined, false);

      if (!result.committed) {
        const serverRoom = result.snapshot.val();
        if (serverRoom?.state) {
          this.importOnlineState(serverRoom.state);
          this.onlineVersion = Number(serverRoom.stateVersion) || this.onlineVersion;
        } else if (rollbackState) {
          this.importOnlineState(rollbackState);
        }
        this.showToast("Move was not accepted. Board refreshed.");
        return false;
      }

      this.onlineVersion = expectedVersion + 1;
      return true;
    } catch (error) {
      console.error(error);
      if (rollbackState) this.importOnlineState(rollbackState);
      this.showToast("Move could not be synced. Please try again.");
      return false;
    }
  }

  setOnlineBusy(busy) {
    this.onlineBusy = busy;
    this.createOnlineBtn.disabled = busy;
    this.joinOnlineBtn.disabled = busy;
  }

  updateOnlineStatus() {
    if (!this.roomCode) return;
    if (this.onlineSyncing) {
      this.onlineStatusText.textContent = "Syncing move…";
    } else if (!this.opponentConnected) {
      this.onlineStatusText.textContent = this.isRoomCreator
        ? "Waiting for your friend to join…"
        : "Waiting for the creator to reconnect…";
    } else if (this.game.result) {
      this.onlineStatusText.textContent = "Game finished";
    } else if (this.game.turn === this.onlineColor) {
      this.onlineStatusText.textContent = `${this.onlineColor === "w" ? "You are White" : "You are Black"} • Your move`;
    } else {
      this.onlineStatusText.textContent = this.onlineColor === "b"
        ? "You are Black • Creator's move"
        : "You are White • Friend's move";
    }
  }

  showRoomCard() {
    this.roomCard.classList.remove("hidden");
    this.roomCodeText.textContent = this.roomCode || "------";
    this.exitOnlineBtn.textContent = this.isRoomCreator ? "Exit & expire room" : "Leave online game";
  }

  async copyRoomLink() {
    if (!this.roomCode) return;
    if (location.protocol === "file:") {
      this.showToast("Open the game from a web server to share it");
      return;
    }
    const link = `${location.origin}${location.pathname}?game=${this.roomCode}`;
    try { await navigator.clipboard.writeText(link); this.showToast("Invite link copied"); }
    catch { this.showToast(link); }
  }

  async exitOnlineGame() {
    if (!this.roomRef) return;
    try {
      if (this.isRoomCreator) await this.roomRef.remove();
      else {
        await this.roomRef.child("blackUid").transaction(currentUid =>
          currentUid === this.uid ? null : undefined);
      }
    } catch (error) { console.error(error); }
    await this.detachOnlineRoom(false);
    history.replaceState({}, "", location.pathname);
    this.modeSelect.value = "computer";
    this.mode = "computer";
    this.roomCard.classList.add("hidden");
    this.updateSetupVisibility();
    this.startNewGame();
  }

  async detachOnlineRoom(releaseSeat = true) {
    clearInterval(this.roomPollTimer);
    this.roomPollTimer = null;
    if (this.roomRef && this.roomListener) this.roomRef.off("value", this.roomListener);
    if (releaseSeat && this.roomRef && this.uid && this.onlineColor === "b") {
      try {
        await this.roomRef.child("blackUid").transaction(currentUid =>
          currentUid === this.uid ? null : undefined);
      } catch {}
    }
    this.roomListener = null;
    this.roomRef = null;
    this.roomCode = null;
    this.onlineColor = null;
    this.isRoomCreator = false;
    this.opponentConnected = false;
    this.onlineSyncing = false;
    this.onlineVersion = 0;
    this.hasImportedOnlineState = false;
  }

  handleExpiredRoom() {
    clearInterval(this.roomPollTimer);
    this.roomPollTimer = null;
    if (this.roomRef && this.roomListener) this.roomRef.off("value", this.roomListener);
    this.roomRef = null;
    this.roomCode = null;
    this.opponentConnected = false;
    this.onlineStatusText.textContent = "This room has expired.";
    this.showToast("The creator ended this online game");
    this.render();
  }

  async tryJoinFromUrl() {
    const code = new URLSearchParams(location.search).get("game");
    if (!code) return;
    this.modeSelect.value = "online";
    this.updateSetupVisibility();
    this.roomCodeInput.value = code.toUpperCase();
    await this.joinOnlineGame(code);
  }

  saveLocalGame() {
    if (this.applyingRemoteState) return;
    try {
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify({
        game: this.game.snapshot(), history: this.game.history,
        mode: this.mode, humanColor: this.humanColor, aiColor: this.aiColor,
        flipped: this.flipped, clockSeconds: this.clockSeconds, clockHistory: this.clockHistory,
        settings: { mode: this.modeSelect.value, color: this.colorSelect.value, difficulty: this.difficultySelect.value,
          clock: this.clockSelect.value, theme: this.themeSelect.value, sound: this.soundToggle.checked, hints: this.hintToggle.checked }
      }));
    } catch (error) { console.warn("Could not save game", error); }
  }

  restoreLocalGame() {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data.game) return false;
      this.game.restore(data.game);
      this.game.history = Array.isArray(data.history) ? data.history : [];
      this.mode = data.mode === "online" ? "computer" : (data.mode || "computer");
      this.humanColor = data.humanColor || "w";
      this.aiColor = data.aiColor || opposite(this.humanColor);
      this.flipped = Boolean(data.flipped);
      this.clockSeconds = data.clockSeconds || { w: null, b: null };
      this.clockHistory = data.clockHistory || [];
      if (data.settings) {
        this.modeSelect.value = this.mode;
        this.colorSelect.value = data.settings.color || "w";
        this.difficultySelect.value = data.settings.difficulty || "medium";
        this.clockSelect.value = data.settings.clock || "0";
        this.themeSelect.value = data.settings.theme || "classic";
        this.soundToggle.checked = data.settings.sound !== false;
        this.hintToggle.checked = data.settings.hints !== false;
      }
      this.updatePlayerNames();
      this.updateSetupVisibility();
      this.render();
      return true;
    } catch (error) { console.warn("Could not restore game", error); return false; }
  }

  playSound(type) {
    if (!this.soundToggle.checked) return;
    try {
      this.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const patterns = {
        start: [[330,.05],[440,.09]],
        move: [[270,.055]],
        capture: [[180,.06],[130,.07]],
        check: [[520,.06],[650,.09]],
        end: [[420,.08],[330,.1],[220,.16]]
      };
      let offset = 0;
      for (const [frequency, duration] of patterns[type] || patterns.move) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(.12, now + offset + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + duration + .02);
        offset += duration * .78;
      }
    } catch { /* Sound is optional. */ }
  }
}

window.addEventListener("DOMContentLoaded", () => { window.chessApp = new ChessUI(); });
