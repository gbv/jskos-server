require("dotenv").config()
const
  env = process.env.NODE_ENV || "development",
  port = process.env.PORT || 3000,
  mongoHost = process.env.MONGO_HOST || "localhost",
  mongoPort = process.env.MONGO_PORT || 27017,
  mongoDb = (process.env.MONGO_DB || "cocoda_api") + (env == "test" ? "-test" : ""),
  mongoUrl = `mongodb://${mongoHost}:${mongoPort}`,
  mongoOptions = {
    reconnectTries: 60,
    reconnectInterval: 1000,
    useNewUrlParser: true
  }
console.log(`running in ${env} mode`)

const log = (...args) => {
  if (env != "test") {
    console.log(...args)
  }
}

module.exports = {
  env, port, mongoHost, mongoPort, mongoDb, mongoUrl, mongoOptions, log
}
