ROYAL BOARD CHESS
=================

Files:
- index.html
- style.css
- script.js

HOW TO RUN
1. Put all three files in the same folder.
2. Double-click index.html.
3. The game runs completely in your browser and does not need a server or internet connection.

FEATURES
- Human vs computer
- Human vs human on one device
- Play as White, Black, or a random color
- Easy, Medium, and Hard computer levels
- Click-to-move and drag-and-drop controls
- Legal move indicators and capture indicators
- Last move highlighting
- Check, checkmate, stalemate, castling, en passant, and promotion
- Threefold repetition, 50-move rule, and insufficient-material draws
- Move history and copy button
- Undo, flip board, resign, and draw controls
- Optional 3, 5, or 10 minute clocks
- Sound effects made with the browser Web Audio API
- Responsive mobile layout
- Three board themes

NOTE
The computer opponent uses a lightweight minimax engine written in JavaScript. It is designed for smooth browser play, not grandmaster-strength analysis.

Update: Move-marker positioning fix
- Legal move dots are now explicitly centered at every board size.
- Capture rings now use fixed square-relative dimensions for consistent alignment.

Autosave
--------
The current game, move history, board orientation, settings, and clock are saved automatically. Reloading the page restores the game. Clicking Start new game replaces the saved game.
