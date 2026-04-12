require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Facturo API démarrée sur le port ${PORT}`);
  console.log(`📄 Environnement : ${process.env.NODE_ENV}`);
});
