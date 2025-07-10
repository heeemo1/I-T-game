const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_PASSWORD = '141722'; // عدّل كلمة السر هنا

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// توجيه الصفحة الرئيسية إلى صفحة تسجيل الدخول
app.get('/', (req, res) => {
  res.redirect('/login');
});

// عرض صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// معالجة بيانات تسجيل الدخول
app.post('/login', (req, res) => {
  const pass = req.body.password;
  if (pass === ADMIN_PASSWORD) {
    // كلمة السر صحيحة -> توجه لصفحة الادمن
    res.redirect('/admin');
  } else {
    // كلمة السر خطأ -> تعيد لصفحة تسجيل الدخول مع علامة خطأ
    res.redirect('/login?error=1');
  }
});

// صفحة الادمن
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// صفحة العرض للاعبين
app.get('/view/:sessionId', (req, res) => {
  res.sendFile(__dirname + '/public/view.html');
});

const sessions = {};

io.on('connection', (socket) => {
  socket.on('joinSession', ({ sessionId, role }) => {
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        secretNumber: Math.floor(Math.random() * 100) + 1,
        players: [],
        guesses: {},
        currentIndex: 0,
        roundActive: false,
        adminSocket: null,
        viewers: new Set(),
      };
    }

    socket.join(sessionId);
    const session = sessions[sessionId];

    if (role === 'viewer') {
      session.viewers.add(socket.id);
    } else if (role === 'admin') {
      session.adminSocket = socket.id;
    }

    sendGameState(sessionId);
  });

  socket.on('addPlayers', ({ sessionId, names }) => {
    const session = sessions[sessionId];
    if (!session) return;

    session.players = names.map(n => n.trim()).filter(n => n.length > 0);
    session.guesses = {};
    session.currentIndex = 0;
    session.secretNumber = Math.floor(Math.random() * 100) + 1;
    session.roundActive = true;

    sendGameState(sessionId);
    io.to(sessionId).emit('result', '✨ جولة جديدة بدأت!');
  });

  socket.on('guess', ({ sessionId, player, guess }) => {
    const session = sessions[sessionId];
    if (!session || !session.roundActive) return;

    if (player !== session.players[session.currentIndex]) {
      io.to(socket.id).emit('errorMsg', 'ليس دورك الآن!');
      return;
    }

    if (session.guesses[player]) {
      io.to(socket.id).emit('errorMsg', 'لقد حاولت بالفعل في هذه الجولة!');
      return;
    }

    session.guesses[player] = guess;

    if (guess === session.secretNumber) {
      session.roundActive = false;
      io.to(sessionId).emit('result', `🎉 ${player} فاز! الرقم الصحيح هو ${guess}`);
      sendGameState(sessionId);
      return;
    } else {
      const diff = Math.abs(guess - session.secretNumber);
      let msg = guess < session.secretNumber ? `🔺 الرقم أكبر من ${guess}` : `🔻 الرقم أصغر من ${guess}`;
      if (diff <= 5) msg += ' 🔥 قريب جداً!';
      io.to(sessionId).emit('result', `💡 ${player}: ${msg}`);
    }

    session.currentIndex++;

    if (session.currentIndex >= session.players.length) {
      session.currentIndex = 0;
      session.guesses = {};
      io.to(sessionId).emit('result', '🔁 لم ينجح أحد، تبدأ دورة جديدة!');
    }

    sendGameState(sessionId);
  });

  socket.on('startRound', ({ sessionId }) => {
    const session = sessions[sessionId];
    if (!session) return;

    session.secretNumber = Math.floor(Math.random() * 100) + 1;
    session.guesses = {};
    session.currentIndex = 0;
    session.roundActive = true;

    sendGameState(sessionId);
    io.to(sessionId).emit('result', '✨ تم بدء جولة جديدة!');
  });

  function sendGameState(sessionId) {
    const session = sessions[sessionId];
    if (!session) return;

    const state = {
      players: session.players,
      guesses: session.guesses,
      currentPlayer: session.players[session.currentIndex] || null,
      roundActive: session.roundActive,
    };

    io.to(sessionId).emit('gameState', state);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
});
server.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل على المنفذ ${PORT}`);
});
