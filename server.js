const config = require("./config")
const utils = require("./utils")

config.log(`Running in ${config.env} mode.`)

if (!config.baseUrl) {
  config.warn("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

// Initialize express with settings
const express = require("express")
const app = express()
app.set("json spaces", 2)
if (config.proxies && config.proxies.length) {
  app.set("trust proxy", config.proxies)
}

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views")
app.set("view engine", "ejs")

// Database connection
const db = require("./utils/db")
const connect = async () => {
  try {
    await db.connect()
    config.log("Connected to database")
    // TODO: `indexExists` causes a deprecation warning. Find a different solution.
    if (config.schemes && !(await db.connection.collection("terminologies").indexExists("text"))) {
      config.warn("Text index on terminologies collection missing. /voc/search and /voc/suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i schemes` to created indexes.")
      config.status["voc-search"] = null
      config.status["voc-suggest"] = null
    }
    if (config.concepts && !(await db.connection.collection("concepts").indexExists("text"))) {
      config.warn("Text index on concepts collection missing. /search and /suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i concepts` to created indexes.")
      config.status.search = null
      config.status.suggest = null
    }
  } catch(error) {
    config.log("Error connecting to database, reconnect in a few seconds...")
  }
}
// Connect immediately on startup
connect()

db.connection.on("error", () => {
  db.disconnect()
})
db.connection.on("disconnected", () => {
  setTimeout(connect, 2500)
})

// Add default headers
app.use(utils.addDefaultHeaders)

// Disable client side caching
const nocache = require("nocache")
app.use(nocache())

// Disable ETags
app.set("etag", false)
app.use(express.urlencoded({ extended: false }))

// Set some properties on req that will be used by other middleware
app.use(utils.addMiddlewareProperties)

// Add routes

// Root path for static page
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html")
  res.render("base", {
    config,
  })
})
// JSON Schema for /status
app.use("/status.schema.json", express.static(__dirname + "/status.schema.json"))
// Status page /status
app.use("/status", require("./routes/status"))
// Database check middleware
const { DatabaseAccessError } = require("./errors")
app.use((req, res, next) => {
  if (db.connection.readyState === 1) {
    next()
  } else {
    // No connection to database, return error
    next(new DatabaseAccessError())
  }
})
// IP check middleware
app.use(require("./utils/ipcheck"))
// /checkAuth
const auth = require("./utils/auth")
app.get("/checkAuth", auth.default, (req, res) => {
  res.sendStatus(204)
})
// Scheme related endpoints
if (config.schemes) {
  app.use("/voc", require("./routes/schemes"))
}
// Mapping related endpoints
if (config.mappings) {
  app.use("/mappings", require("./routes/mappings"))
}
if (config.concordances) {
  app.use("/concordances", require("./routes/concordances"))
}
// Annotation related endpoints
if (config.annotations) {
  app.use("/annotations", require("./routes/annotations"))
}
// Concept related endpoints
if (config.concepts) {
  app.use(require("./routes/concepts"))
}

// Error handling
const errors = require("./errors")
app.use((error, req, res, next) => {
  // Check if error is defined in errors
  if (Object.values(errors).includes(error.constructor)) {
    res.status(error.statusCode).send({
      error: error.constructor.name,
      status: error.statusCode,
      message: error.message,
    })
  } else {
    next(error)
  }
})

const start = async () => {
  let port = config.port
  if (config.env == "test") {
    const portfinder = require("portfinder")
    portfinder.basePort = config.port
    port = await portfinder.getPortPromise()
  }
  app.listen(port, () => {
    config.log(`Now listening on port ${port}`)
  })
}
// Start express server immediately even if database is not yet connected
start()

module.exports = { db: db.connection, app }
