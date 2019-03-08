const _ = require("lodash")

require("dotenv").config()
const
  env = process.env.NODE_ENV || "development",
  verbosity = process.env.VERBOSITY,
  postAuthRequired = _.get(process.env, "POST_AUTH_REQUIRED", 1) != 0,
  baseUrl = process.env.BASE_URL,
  port = process.env.PORT || 3000,
  mongoUser = process.env.MONGO_USER || "",
  mongoPass = process.env.MONGO_PASS || "",
  mongoAuth = mongoUser ? `${mongoUser}:${mongoPass}@` : "",
  mongoHost = process.env.MONGO_HOST || "localhost",
  mongoPort = process.env.MONGO_PORT || 27017,
  mongoDb = (process.env.MONGO_DB || "cocoda_api") + (env == "test" ? "-test" : ""),
  mongoUrl = `mongodb://${mongoAuth}${mongoHost}:${mongoPort}`,
  mongoOptions = {
    reconnectTries: 60,
    reconnectInterval: 1000,
    useNewUrlParser: true
  },
  auth = { // use specific values for test
    algorithm: env == "test" ? "HS256" : process.env.AUTH_ALGORITHM,
    key: env == "test" ? "test" : process.env.AUTH_KEY && process.env.AUTH_KEY.split("\\n").join("\n")
  }
console.log(`running in ${env} mode`)

const log = (...args) => {
  if (env != "test" || verbosity) {
    console.log(...args)
  }
}

if (!postAuthRequired) {
  log("Note: POST /mappings does not require authentication. To change this, remove POST_AUTH_REQUIRED from .env file.")
}
if (!baseUrl) {
  log("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add BASE_URL to .env!")
}

module.exports = {
  env, verbosity, postAuthRequired, baseUrl, port, mongoHost, mongoPort, mongoDb, mongoUrl, mongoOptions, log, auth
}
