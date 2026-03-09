import config from "./config/index.js"
import { addDefaultHeaders } from "./utils/middleware.js"
import { addMiddlewareProperties } from "./utils/defaults.js"
import express from "express"
import { createDatabase } from "./utils/db.js"
import morgan from "morgan"
import nocache from "nocache"

import createAnnotationRouter from "./routes/annotations.js"
import createConceptRouter from "./routes/concepts.js"
import createConcordanceRouter from "./routes/concordances.js"
import createMappingRouter from "./routes/mappings.js"
import createSchemeRouter from "./routes/schemes.js"
import createRegistryRouter from "./routes/registries.js"
import createDataRouter from "./routes/data.js"
import createValidateRouter from "./routes/validate.js"

import { serverStatus } from "./utils/status.js"

import { ipcheck } from "./utils/ipcheck.js"
import { getUser } from "./utils/users.js"
import * as errors from "./errors/index.js"
import portfinder from "portfinder"
import expressWs from "express-ws"
import { setupChangesApi, isChangesApiAvailable } from "./utils/changes.js"

const __dirname = import.meta.dirname

const db = createDatabase(config)
const connection = db.connection

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

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views")
app.set("view engine", "ejs")

// Database connection (TODO: move to db module)
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
// Connect immediately on startup
connect()

// Logging for access logs
if (config.verbosity === true || config.verbosity === "log") {
  app.use(morgan(":date[iso] \":method :url HTTP/:http-version\" :status :res[content-length] \":referrer\" \":user-agent\""))
}

// Add default headers
app.use(addDefaultHeaders)

// Disable client side caching
app.use(nocache())

// Disable ETags
app.set("etag", false)
app.use(express.urlencoded({ extended: false }))

// Set some properties on req that will be used by other middleware
app.use(addMiddlewareProperties(config))

// Add routes

// Root path for static page
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html")
  res.render("base", {
    config,
    isChangesApiAvailable,
  })
})
// JSON Schema for /status
app.use("/status.schema.json", express.static(__dirname + "/status.schema.json"))

// Status page /status
app.get("/status",
  (req, res) => {
    res.status(200).json(serverStatus(config, connection.readyState === 1))
  })

// IP check middleware
app.use(ipcheck(config))

// /checkAuth
app.get("/checkAuth", config.authenticator.authenticate(true), (req, res) => {
  res.json(getUser(req))
})

// Database check middleware
app.use((req, res, next) => {
  if (connection.readyState === 1) {
    next()
  } else {
    // No connection to database, return error
    next(new errors.DatabaseAccessError())
  }
})

// Add conditional routes
if (config.schemes) {
  app.use("/voc", createSchemeRouter(config))
}
if (config.mappings) {
  app.use("/mappings", createMappingRouter(config))
}
if (config.concordances) {
  app.use("/concordances", createConcordanceRouter(config))
}
if (config.annotations) {
  app.use("/annotations", createAnnotationRouter(config))
}
if (config.concepts) {
  app.use(createConceptRouter(config))
}
if (config.registries) {
  app.use("/registries", createRegistryRouter(config))
}

// These routes are always enabled
app.use("/data", createDataRouter(config))
app.use("/validate", createValidateRouter(config))

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

// Changes API
await setupChangesApi(app, config, db)

app.listen(config.port, () => {
  config.log(`Now listening on port ${config.port}`)
})

export {
  app,
  connection as db,
}
