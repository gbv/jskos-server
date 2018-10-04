require("dotenv").config()
const
  env = process.env.NODE_ENV || "development",
  verbosity = process.env.VERBOSITY,
  baseUrl = "https://coli-conc.gbv.de/api",
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
  }
console.log(`running in ${env} mode`)

const log = (...args) => {
  if (env != "test" || verbosity) {
    console.log(...args)
  }
}

module.exports = {
  env, verbosity, baseUrl, port, mongoHost, mongoPort, mongoDb, mongoUrl, mongoOptions, log
}
