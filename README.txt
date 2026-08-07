ROYAL BOARD CHESS
=================

Files:
- index.html
- style.css
- script.js

HOW TO RUN
1. Put the project files in the same folder.
2. For offline play, you can double-click index.html.
3. For online multiplayer, host the files on GitHub Pages or run a local web server. Online mode requires internet access and will not create a usable invite link from a file:// URL.

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


ONLINE MULTIPLAYER SETUP
1. Firebase Authentication: enable Anonymous sign-in.
2. Realtime Database: open Rules, paste firebase-database-rules.json, and Publish.
3. Add wirdan-gohar.github.io to Authentication > Settings > Authorized domains.
4. Upload index.html, style.css, and script.js to GitHub.
5. Open the site, choose Play online with friend, then Create online game.
