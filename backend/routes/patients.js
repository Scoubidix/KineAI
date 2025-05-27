const express = require('express')
const router = express.Router()
const { getPatients, createPatient } = require('../controllers/patientsController')

router.get('/:kineId', getPatients)
router.post('/', createPatient)

module.exports = router
