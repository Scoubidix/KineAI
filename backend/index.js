require('dotenv').config()
const express = require('express')
const cors = require('cors')

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Bienvenue sur l’API KinéAI 🧠')
})

// Import des routes
const patientsRoutes = require('./routes/patients')
app.use('/patients', patientsRoutes)

app.listen(port, () => {
  console.log(`✅ API listening at http://localhost:${port}`)
})
