import config from "./config/index.js"
import * as utils from "./utils/index.js"
import express from "express"
import * as db from "./utils/db.js"
import morgan from "morgan"
import nocache from "nocache"
import * as routers from "./routes/index.js"
import { ipcheck } from "./utils/ipcheck.js"
import * as auth from "./utils/auth.js"
import * as errors from "./errors/index.js"
import portfinder from "portfinder"

const __dirname = config.getDirname(import.meta.url)
const connection = db.connection

config.log(`Running in ${config.env} mode.`)

if (!config.baseUrl) {
  config.warn("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

// Initialize express with settings
const app = express()
app.set("json spaces", 2)
if (config.proxies && config.proxies.length) {
  app.set("trust proxy", config.proxies)
}

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views")
app.set("view engine", "ejs")

// Database connection
const connect = async () => {
  try {
    await db.connect(true)
    // TODO: `indexExists` causes a deprecation warning. Find a different solution.
    if (config.schemes && !(await connection.collection("terminologies").indexExists("text"))) {
      config.warn("Text index on terminologies collection missing. /voc/search and /voc/suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i schemes` to created indexes.")
      config.status["voc-search"] = null
      config.status["voc-suggest"] = null
    }
    if (config.concepts && !(await connection.collection("concepts").indexExists("text"))) {
      config.warn("Text index on concepts collection missing. /concepts/search and /concepts/suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i concepts` to created indexes.")
      config.status.search = null
      config.status.suggest = null
    }
  } catch(error) {
    config.warn("Error connecting to database, reconnect in a few seconds...")
  }
}
// Connect immediately on startup
connect()

// Logging for access logs
if (config.verbosity === true || config.verbosity === "log") {
  app.use(morgan(":date[iso] \":method :url HTTP/:http-version\" :status :res[content-length] \":referrer\" \":user-agent\""))
}

// Add default headers
app.use(utils.addDefaultHeaders)

// Disable client side caching
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
app.use("/status", routers.statusRouter)
// Database check middleware
app.use((req, res, next) => {
  if (connection.readyState === 1) {
    next()
  } else {
    // No connection to database, return error
    next(new errors.DatabaseAccessError())
  }
})
// IP check middleware
app.use(ipcheck)
// /checkAuth
app.get("/checkAuth", auth.main, (req, res) => {
  res.sendStatus(204)
})
// Scheme related endpoints
if (config.schemes) {
  app.use("/voc", routers.schemeRouter)
}
// Mapping related endpoints
if (config.mappings) {
  app.use("/mappings", routers.mappingRouter)
}
if (config.concordances) {
  app.use("/concordances", routers.concordanceRouter)
}
// Annotation related endpoints
if (config.annotations) {
  app.use("/annotations", routers.annotationRouter)
}
// Concept related endpoints
if (config.concepts) {
  app.use(routers.conceptRouter)
}
// Data endpoint
app.use(routers.dataRouter)
// Validate endpoint
app.use("/validate", routers.validateRouter)

// Error handling
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
  if (config.env == "test") {
    portfinder.basePort = config.port
    config.port = await portfinder.getPortPromise()
  }
  app.listen(config.port, () => {
    config.log(`Now listening on port ${config.port}`)
  })
}
// Start express server immediately even if database is not yet connected
start()

export {
  app,
  connection as db,
}
