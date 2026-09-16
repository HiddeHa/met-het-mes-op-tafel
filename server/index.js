const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('New client connected', socket.id);

  // Placeholder for game logic
  socket.on('joinGame', (data) => {
    console.log('Player joined:', data);
    socket.join(data.roomId);
    io.to(data.roomId).emit('playerJoined', { playerId: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));