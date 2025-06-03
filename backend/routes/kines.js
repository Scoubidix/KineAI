const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/authenticate');
const { createKine } = require('../controllers/kineController');

router.post('/', createKine);

module.exports = router;
