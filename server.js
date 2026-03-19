import config from "./config/index.js"
import { addMiddlewareProperties } from "./utils/defaults.js"
import express from "express"
import { createDatabase } from "./utils/db.js"
import morgan from "morgan"
import nocache from "nocache"

import createRouter from "./routes/index.js"

import { serverStatus } from "./utils/status.js"
import { Authenticator } from "./utils/auth.js"
import { urlForLinkHeader } from "./utils/url-for-link-header.js"
import { ipcheck } from "./utils/ipcheck.js"
import { getUser } from "./utils/users.js"
import * as errors from "./errors/index.js"
import portfinder from "portfinder"
import expressWs from "express-ws"
import { setupChangesApi } from "./utils/changes.js"

const __dirname = import.meta.dirname

const db = createDatabase(config)

config.log(`Running in ${config.env} mode.`)

if (config.env == "test") {
  portfinder.basePort = config.port
  // TODO: update config.baseUrl
  config.port = await portfinder.getPortPromise()
}

if (!config.baseUrl) {
  config.warn("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

// Initialize express with settings
const app = express()

// Initialize WebSocket support
expressWs(app)


app.set("json spaces", 2)
if (config.proxies && config.proxies.length) {
  app.set("trust proxy", config.proxies)
}

import ejs from "ejs"

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views")
app.set("view engine", "ejs")
app.engine("ejs", (filepath, data, callback) => {
  return ejs.renderFile(filepath, data, {
    openDelimiter: "[",
    closeDelimiter: "]",
  }, callback)
})


// Database connection (TODO: move to db module)
const connect = async () => {
  try {
    await db.connect(true)
    // TODO: `indexExists` causes a deprecation warning. Find a different solution.
    if (config.schemes && !(await db.connection.collection("terminologies").indexExists("text"))) {
      config.warn("Text index on terminologies collection missing. /voc/search and /voc/suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i schemes` to created indexes.")
      config.status["voc-search"] = null
      config.status["voc-suggest"] = null
    }
    if (config.concepts && !(await db.connection.collection("concepts").indexExists("text"))) {
      config.warn("Text index on concepts collection missing. /concepts/search and /concepts/suggest are disabled. Run `npm run import -- --indexes` or `npm run import -- -i concepts` to created indexes.")
      config.status.search = null
      config.status.suggest = null
    }
    if (config.annotations?.mismatchTagVocabulary?.uri) {
      const model = await import("./models/concepts.js")
      const concepts = await model.Concept.find({ "inScheme.uri": config.annotations.mismatchTagVocabulary.uri })
      if (concepts.length === 0) {
        config.warn("annotations.mismatchTagVocabulary is configured, but no data for that vocabulary could be found in the database. Import the vocabulary data into this instance for the setting to work.")
      }
    }
  } catch (error) {
    config.warn("Error connecting to database, reconnect in a few seconds...")
  }
}
// Logging for access logs
if (config.verbosity === true || config.verbosity === "log") {
  app.use(morgan(":date[iso] \":method :url HTTP/:http-version\" :status :res[content-length] \":referrer\" \":user-agent\""))
}

// Add default headers
app.use((req, res, next) => {
  if (req.headers.origin) {
    // Allow all origins by returning the request origin in the header
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
  } else {
    // Fallback to * if there is no origin in header
    res.setHeader("Access-Control-Allow-Origin", "*")
  }
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization")
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,PATCH,DELETE")
  res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Link")
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  // Deprecation headers for /narrower, /ancestors, /search, and /suggest
  // TODO for 3.0: Remove these headers
  if (["/narrower", "/ancestors", "/search", "/suggest"].includes(req.path)) {
    res.setHeader("Deprecation", true)
    const links = []
    links.push(urlForLinkHeader({ base: config.baseUrl, req, rel: "alternate" }))
    links[0] = links[0].replace(req.path, `/concepts${req.path}`)
    links.push("<https://github.com/gbv/jskos-server/releases/tag/v2.0.0>; rel=\"deprecation\"")
    res.set("Link", links.join(","))
  }
  next()
})

// Disable client side caching
app.use(nocache())

// Disable ETags
app.set("etag", false)
app.use(express.urlencoded({ extended: false }))

// Set some properties on req that will be used by other middleware
app.use(addMiddlewareProperties(config))

// ---- Add routes

// Root path for static page
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html")
  res.render("base", { config })
})

// JSON Schema for /status
app.use("/status.schema.json", express.static(__dirname + "/status.schema.json"))

// Status page /status
app.get("/status",
  (req, res) => {
    res.status(200).json(serverStatus(config, db.connection.readyState === 1))
  })

// IP check middleware
app.use(ipcheck(config))

// /checkAuth
const authenticator = new Authenticator(config)
app.get("/checkAuth", authenticator.authenticate(true), (req, res) => {
  res.json(getUser(req))
})

// Database check middleware
app.use((req, res, next) => {
  if (db.connection.readyState === 1) {
    next()
  } else {
    // No connection to database, return error
    next(new errors.DatabaseAccessError())
  }
})

// Add conditional routes
for (let type of ["schemes", "mappings", "concordances", "annotations", "registries"]) {
  if (config[type]) {
    const path = type === "schemes" ? "voc" : type
    app.use(`/${path}`, createRouter[type](config))
  }
}
if (config.concepts) {
  app.use(createRouter.concepts(config))
}

// These routes are always enabled
app.use("/data", createRouter.data(config))
app.use("/validate", createRouter.validate(config))

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

// Connect immediately on startup
connect()

// Changes API
if (config.changes) {
  await setupChangesApi(app, config, db)
}

app.listen(config.port, () => {
  config.log(`Now listening on port ${config.port}`)
})

app.connection = db.connection

export { app }
