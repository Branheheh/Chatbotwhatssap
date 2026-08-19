const express = require('express');
const { pool } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'unreachable', error: err.message });
  }
});

module.exports = router;
