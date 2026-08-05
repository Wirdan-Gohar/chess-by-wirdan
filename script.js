"use strict";

const FILES = "abcdefgh";
const PIECES = {
  w: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
};
const PIECE_NAMES = { k: "K", q: "Q", r: "R", b: "B", n: "N", p: "" };
const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const STORAGE_KEY = "royal-board-chess-save-v5";
const WINDOW_NAME_PREFIX = "ROYAL_BOARD_CHESS_V5:";

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
    this.board = state.board.map(row => row.map(clonePiece));
    this.turn = state.turn;
    this.enPassant = state.enPassant ? { ...state.enPassant } : null;
    this.halfmove = state.halfmove;
    this.fullmove = state.fullmove;
    this.lastMove = state.lastMove ? JSON.parse(JSON.stringify(state.lastMove)) : null;
    this.moveList = [...state.moveList];
    this.positionHistory = [...state.positionHistory];
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
    this.checkBannerTimer = null;
    this.lastShownResultKey = null;
    this.audioContext = null;
    this.dragFrom = null;
    this.cacheDom();
    this.bindEvents();
    const restored = this.loadSavedGame();
    if (!restored) this.startNewGame();
    else {
      this.updatePlayerNames();
      this.updateSetupVisibility();
      this.render();
      window.setTimeout(() => this.showToast("Saved game restored"), 150);
      if (this.mode === "computer" && !this.game.result && this.game.turn === this.aiColor) {
        this.requestAiMove();
      }
    }
    this.startClockLoop();
  }

  cacheDom() {
    const ids = [
      "chessboard","modeSelect","colorSelect","difficultySelect","clockSelect","themeSelect",
      "colorField","difficultyField","newGameBtn","undoBtn","flipBtn","drawBtn","resignBtn",
      "soundToggle","hintToggle","statusText","statusDot","lastMoveText","moveHistory","copyMovesBtn",
      "whitePlayerName","blackPlayerName","whiteCaptured","blackCaptured","whiteClock","blackClock",
      "whitePlayerCard","blackPlayerCard","thinkingBadge","promotionModal","promotionOptions","toast",
      "checkBanner","gameOverModal","gameOverIcon","gameOverLabel","gameOverTitle","gameOverMessage",
      "modalNewGameBtn","closeGameOverBtn"
    ];
    for (const id of ids) this[id] = document.getElementById(id);
  }

  bindEvents() {
    this.modeSelect.addEventListener("change", () => {
      this.updateSetupVisibility();
      this.saveGame();
    });
    this.newGameBtn.addEventListener("click", () => this.startNewGame());
    this.undoBtn.addEventListener("click", () => this.undo());
    this.flipBtn.addEventListener("click", () => {
      this.flipped = !this.flipped;
      this.render();
      this.saveGame();
    });
    this.drawBtn.addEventListener("click", () => this.endAsDraw());
    this.resignBtn.addEventListener("click", () => this.resign());
    this.copyMovesBtn.addEventListener("click", () => this.copyMoves());
    this.themeSelect.addEventListener("change", () => {
      this.render();
      this.saveGame();
    });
    this.hintToggle.addEventListener("change", () => {
      this.renderBoard();
      this.saveGame();
    });
    this.soundToggle.addEventListener("change", () => this.saveGame());
    this.colorSelect.addEventListener("change", () => this.saveGame());
    this.difficultySelect.addEventListener("change", () => this.saveGame());
    this.clockSelect.addEventListener("change", () => this.saveGame());
    window.addEventListener("beforeunload", () => this.saveGame());
    this.modalNewGameBtn.addEventListener("click", () => {
      this.hideGameOver();
      this.startNewGame();
    });
    this.closeGameOverBtn.addEventListener("click", () => this.hideGameOver());
  }

  writeSavedData(raw) {
    let stored = false;
    try {
      localStorage.setItem(STORAGE_KEY, raw);
      stored = true;
    } catch { /* Local storage may be restricted for local files. */ }

    try {
      window.name = `${WINDOW_NAME_PREFIX}${raw}`;
      stored = true;
    } catch { /* window.name is only a reload fallback. */ }
    return stored;
  }

  readSavedData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return raw;
    } catch { /* Try the reload fallback below. */ }

    try {
      if (typeof window.name === "string" && window.name.startsWith(WINDOW_NAME_PREFIX)) {
        return window.name.slice(WINDOW_NAME_PREFIX.length);
      }
    } catch { /* No available persistence storage. */ }
    return null;
  }

  saveGame() {
    try {
      const payload = {
        version: 5,
        savedAt: Date.now(),
        game: this.game.snapshot(),
        history: this.game.history,
        mode: this.mode,
        humanColor: this.humanColor,
        aiColor: this.aiColor,
        flipped: this.flipped,
        clockSeconds: this.clockSeconds,
        clockHistory: this.clockHistory,
        settings: {
          mode: this.modeSelect.value,
          color: this.colorSelect.value,
          difficulty: this.difficultySelect.value,
          clock: this.clockSelect.value,
          theme: this.themeSelect.value,
          sound: this.soundToggle.checked,
          hints: this.hintToggle.checked
        }
      };
      return this.writeSavedData(JSON.stringify(payload));
    } catch (error) {
      console.warn("Could not save chess game:", error);
      return false;
    }
  }

  loadSavedGame() {
    try {
      const raw = this.readSavedData();
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 5 || !saved.game || !Array.isArray(saved.game.board)) return false;
      if (saved.game.board.length !== 8 || saved.game.board.some(row => !Array.isArray(row) || row.length !== 8)) return false;

      this.game.restore(saved.game);
      this.game.history = Array.isArray(saved.history) ? saved.history : [];
      this.mode = saved.mode === "human" ? "human" : "computer";
      this.humanColor = saved.humanColor === "b" ? "b" : "w";
      this.aiColor = opposite(this.humanColor);
      this.flipped = Boolean(saved.flipped);
      this.clockSeconds = saved.clockSeconds && typeof saved.clockSeconds === "object"
        ? { w: saved.clockSeconds.w ?? null, b: saved.clockSeconds.b ?? null }
        : { w: null, b: null };
      this.clockHistory = Array.isArray(saved.clockHistory) ? saved.clockHistory : [];

      const settings = saved.settings || {};
      if (["computer", "human"].includes(settings.mode)) this.modeSelect.value = settings.mode;
      if (["w", "b", "random"].includes(settings.color)) this.colorSelect.value = settings.color;
      if (["easy", "medium", "hard"].includes(settings.difficulty)) this.difficultySelect.value = settings.difficulty;
      if (["0", "3", "5", "10"].includes(String(settings.clock))) this.clockSelect.value = String(settings.clock);
      if (["classic", "ocean", "forest"].includes(settings.theme)) this.themeSelect.value = settings.theme;
      if (typeof settings.sound === "boolean") this.soundToggle.checked = settings.sound;
      if (typeof settings.hints === "boolean") this.hintToggle.checked = settings.hints;

      this.selected = null;
      this.selectedMoves = [];
      this.pendingPromotion = null;
      this.aiThinking = false;
      this.promotionModal.classList.add("hidden");
      this.thinkingBadge.classList.remove("show");
      return true;
    } catch (error) {
      console.warn("Could not restore chess game:", error);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore storage errors. */ }
      try {
        if (window.name.startsWith(WINDOW_NAME_PREFIX)) window.name = "";
      } catch { /* Ignore fallback-storage errors. */ }
      return false;
    }
  }

  updateSetupVisibility() {
    const vsComputer = this.modeSelect.value === "computer";
    this.colorField.style.display = vsComputer ? "grid" : "none";
    this.difficultyField.style.display = vsComputer ? "grid" : "none";
  }

  startNewGame() {
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
    this.saveGame();
    this.playSound("start");
    if (this.mode === "computer" && this.game.turn === this.aiColor) this.requestAiMove();
  }

  updatePlayerNames() {
    if (this.mode === "human") {
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
    if (this.game.result || this.aiThinking) return false;
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

  performMove(move, isAi = false) {
    if (this.game.result) return;
    this.clockHistory.push({ ...this.clockSeconds });
    const captured = Boolean(this.game.board[move.to.r][move.to.c] || move.special === "enPassant");
    const success = this.game.commitMove(move);
    if (!success) {
      this.clockHistory.pop();
      return;
    }
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.saveGame();

    if (this.game.result) {
      this.playSound("end");
      this.showGameOver();
    } else if (this.game.isKingInCheck(this.game.turn)) {
      this.playSound("check");
      this.showCheckBanner(this.game.turn);
    } else this.playSound(captured ? "capture" : "move");

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
    this.saveGame();
    this.playSound("move");
  }

  endAsDraw() {
    if (this.game.result) return;
    this.game.result = { type: "agreement", winner: null };
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.saveGame();
    this.playSound("end");
  }

  resign() {
    if (this.game.result) return;
    const resigning = this.mode === "computer" ? this.humanColor : this.game.turn;
    this.game.result = { type: "resignation", winner: opposite(resigning) };
    this.selected = null;
    this.selectedMoves = [];
    this.render();
    this.saveGame();
    this.playSound("end");
  }

  render() {
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderCaptured();
    this.renderClocks();
    this.lastMoveText.textContent = this.game.moveList.at(-1) || "No moves yet";
    this.undoBtn.disabled = !this.game.history.length || this.aiThinking;
    this.drawBtn.disabled = Boolean(this.game.result);
    this.resignBtn.disabled = Boolean(this.game.result);
    if (this.game.result) this.showGameOver();
  }

  showCheckBanner(color) {
    clearTimeout(this.checkBannerTimer);
    const name = color === "w" ? "WHITE" : "BLACK";
    this.checkBanner.textContent = `${name} IS IN CHECK!`;
    this.checkBanner.classList.add("show");
    this.checkBannerTimer = window.setTimeout(() => this.checkBanner.classList.remove("show"), 2200);
  }

  resultDetails() {
    const result = this.game.result;
    const winner = result?.winner === "w" ? "White" : result?.winner === "b" ? "Black" : null;
    const map = {
      checkmate: ["CHECKMATE", "Checkmate", `${winner} wins. The opposing king has no legal escape.`],
      stalemate: ["DRAW", "Stalemate", "The player to move has no legal move and is not in check."],
      fifty: ["DRAW", "50-move rule", "The game is drawn after fifty moves without a pawn move or capture."],
      repetition: ["DRAW", "Threefold repetition", "The same position occurred three times."],
      insufficient: ["DRAW", "Insufficient material", "Neither side has enough material to force checkmate."],
      agreement: ["DRAW", "Draw agreed", "Both players agreed to a draw."],
      resignation: ["GAME OVER", `${winner} wins`, "The opponent resigned."],
      timeout: ["TIME", `${winner} wins on time`, "The opponent's clock reached zero."]
    };
    return map[result?.type] || ["GAME OVER", "Game over", "The game has ended."];
  }

  showGameOver() {
    if (!this.game.result) return;
    const key = `${this.game.result.type}:${this.game.result.winner || "draw"}:${this.game.moveList.length}`;
    if (this.lastShownResultKey === key && !this.gameOverModal.classList.contains("hidden")) return;
    this.lastShownResultKey = key;
    const [label, title, message] = this.resultDetails();
    this.gameOverLabel.textContent = label;
    this.gameOverTitle.textContent = title;
    this.gameOverMessage.textContent = message;
    this.gameOverIcon.textContent = this.game.result.winner === "w" ? "♚" : this.game.result.winner === "b" ? "♚" : "½";
    this.gameOverModal.classList.remove("hidden");
  }

  hideGameOver() {
    if (this.gameOverModal) this.gameOverModal.classList.add("hidden");
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
      square.style.setProperty("--board-row", String(displayR));
      square.style.setProperty("--board-col", String(displayC));
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
      const color = this.game.turn;
      this.clockSeconds[color] = Math.max(0, this.clockSeconds[color] - 1);
      if (this.clockSeconds[color] === 0) {
        this.game.result = { type: "timeout", winner: opposite(color) };
        this.aiThinking = false;
        this.thinkingBadge.classList.remove("show");
        this.playSound("end");
        this.render();
        this.saveGame();
      } else {
        this.renderClocks();
        this.saveGame();
      }
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
