const config = require("./config")
const utils = require("./utils")

config.log(`Running in ${config.env} mode.`)

if (!config.auth.postAuthRequired) {
  config.log("Note: POST /mappings does not require authentication. To change this, remove `auth.postAuthRequired` from the configuration file.")
}
if (!config.baseUrl) {
  config.warn("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

// Initialize express with settings
const express = require("express")
const app = express()
app.set("json spaces", 2)

// Database connection
const mongoose = require("mongoose")
// TODO
mongoose.connect(`${config.mongo.url}/${config.mongo.db}`, config.mongo.options)
const db = mongoose.connection

// Add default headers
app.use(utils.addDefaultHeaders)

// Add body-parser middleware
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Set some properties on req that will be used by other middleware
app.use(utils.addMiddlewareProperties)

// Add routes
const path = require("path")
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html")
  res.sendFile(path.join(__dirname + "/index.html"))
})
const auth = require("./utils/auth")
app.get("/checkAuth", auth.default, (req, res) => {
  res.sendStatus(204)
})
app.use("/status", require("./routes/status"))
if (config.schemes) {
  app.use("/voc", require("./routes/schemes"))
}
if (config.mappings) {
  app.use("/concordances", require("./routes/concordances"))
  app.use("/mappings", require("./routes/mappings"))
}
if (config.annotations) {
  app.use("/annotations", require("./routes/annotations"))
}
if (config.concepts) {
  app.use(require("./routes/concepts"))
}

// Error handling
const errors = require("./errors")
app.use((error, req, res, next) => {
  config.error(error)
  // Check if error is defined in errors
  if (Object.values(errors).includes(error.constructor)) {
    res.status(error.statusCode).send({ status: error.statusCode, message: error.message })
  } else {
    next(error)
  }
})

db.once("open", async () => {
  const portfinder = require("portfinder")
  config.log("Connected to database")
  let port = config.port
  if (config.env == "test") {
    portfinder.basePort = config.port
    port = await portfinder.getPortPromise()
  }
  app.listen(port, () => {
    config.log(`Now listening on port ${port}`)
  })
})

module.exports = { db, app }
