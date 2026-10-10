const { createApp } = require('./app');

const PORT = process.env.PORT || 5000;
const { app } = createApp({
  dbPath: process.env.DB_PATH
});

const server = app.listen(PORT, () => {
  console.log(`Bank Fund Transfer Backend listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server terminated cleanly.');
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server interrupted cleanly.');
  });
});

module.exports = { app, server };
