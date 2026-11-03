import express from "express"
import morgan from "morgan"
import nocache from "nocache"

import createRouter from "../routes/index.js"
import { addMiddlewareProperties } from "../utils/defaults.js"
import { serverStatus, OpenAPI } from "../utils/status.js"
import { Authenticator } from "../utils/auth.js"
import { urlForLinkHeader } from "../utils/url-for-link-header.js"
import { ipcheck } from "../utils/ipcheck.js"
import { getUser } from "../utils/users.js"
import * as errors from "../errors/index.js"
import expressWs from "express-ws"
import { setupChangesApi } from "../utils/changes.js"

export async function createServer(config, db) {
  const app = express()
  const openapi = new OpenAPI(config)

  const __dirname = import.meta.dirname + "/.."
  app.use(express.static(__dirname + "/public")) // JS and CSS of UI at root

  // Initialize WebSocket support
  expressWs(app)

  app.set("json spaces", 2)
  if (config.proxies && config.proxies.length) {
    app.set("trust proxy", config.proxies)
  }

  // Configure view engine to render EJS templates.
  app.set("views", __dirname + "/views")
  app.set("view engine", "ejs")

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

    const links = [
      urlForLinkHeader({ base: config.baseUrl, req: { path: "/openapi.json" }, rel: "service-desc" }),
    ]
    // Deprecation headers for /narrower, /ancestors, /search, and /suggest
    // TODO for 3.0: Remove these headers
    if (["/narrower", "/ancestors", "/search", "/suggest"].includes(req.path)) {
      res.setHeader("Deprecation", true)
      links.push(urlForLinkHeader({ base: config.baseUrl, req, rel: "alternate" }))
      links[0] = links[0].replace(req.path, `/concepts${req.path}`)
      links.push("<https://github.com/gbv/jskos-server/releases/tag/v2.0.0>; rel=\"deprecation\"")
    }
    res.set("Link", links.join(","))
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
    res.render("base", openapi.description)
  })

  // JSON Schema for /status
  app.use("/status.schema.json", express.static(__dirname + "/status.schema.json"))

  const getEndpoint = (path, summary, ...callback) => {
    app.use(path, ...callback)
    openapi.getEndpoint(path, { summary })
  }

  const enableRoutes = (basePath, router) => {
    app.use(basePath, router.router)
    openapi.enableRoutes(basePath, router.spec)
  }


  getEndpoint(
    "/status",
    "Returns status of the service",
    (req, res) => {
      const status = serverStatus(config, db.connection.readyState === 1)
      status.openapi = openapi.description
      return res.json(status)
    })

  getEndpoint(
    "/openapi.json",
    "Return API specification as OpenAPI Description",
    (req, res) => res.json(openapi.description))

  // IP check middleware
  app.use(ipcheck(config))

  // /checkAuth
  const authenticator = new Authenticator(config)
  getEndpoint(
    "/checkAuth",
    "Check whether a user is authorized and which access rights are granted",
    authenticator.checkAuth(),
    (req, res) => {
      const info = { user: getUser(req) }
      if (res.access) {
        info.access = res.access
      }
      res.json(info)
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
      enableRoutes(`/${path}`, createRouter[type](config))
    }
  }
  if (config.concepts) {
    enableRoutes("", createRouter.concepts(config))
  }

  // These routes are always enabled
  enableRoutes("/data", createRouter.data(config))
  enableRoutes("/validate", createRouter.validate(config))

  // Error handling
  app.use((error, req, res, next) => {
  // Check if error is defined in errors
    if (Object.values(errors).includes(error.constructor)) {
      const body = {
        error: error.constructor.name,
        status: error.statusCode,
        message: error.message,
      }
      if (error.position !== undefined) {
        body.position = error.position
      }
      res.status(error.statusCode).send(body)
    } else {
      next(error)
    }
  })

  // Changes API
  if (config.changes) {
  // TODO: add to openapi
    await setupChangesApi(app, config, db)
  }
  app.connection = db.connection

  return app
}


