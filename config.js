const _ = require("lodash")

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

// Assemble users, provided by keys in `env` starting with `USER_`
let users = {}
_.forOwn(process.env, (value, key) => {
  let prep = "USER_"
  if (key.startsWith(prep) && key.length > prep.length) {
    let username = key.substring(prep.length).toLowerCase()
    let password = value
    if (!users[username]) {
      users[username] = password
    } else {
      log("duplicate user provided in config:", username)
    }
  }
})

module.exports = {
  env, verbosity, baseUrl, port, mongoHost, mongoPort, mongoDb, mongoUrl, mongoOptions, log, users
}
