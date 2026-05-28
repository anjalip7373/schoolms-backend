const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: [
    'http://localhost:3000',
    'https://schoolms-frontend-one.vercel.app'
  ], credentials: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', require('./routes/index'));

app.get('/', (req, res) => res.json({ message: 'School Management API is running' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
