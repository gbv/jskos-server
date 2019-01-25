const _ = require("lodash")

require("dotenv").config()
const
  env = process.env.NODE_ENV || "development",
  verbosity = process.env.VERBOSITY,
  postAuthRequired = _.get(process.env, "POST_AUTH_REQUIRED", 1) != 0,
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
// Username and password are separated by a `|`.
// They will be base64 encoded, so all authenticated requests need to base64 encode username and password as well.
let users = {}
_.forOwn(process.env, (value, key) => {
  let prep = "USER_"
  if (key.startsWith(prep)) {
    let [username, password] = value.split("|")
    if (!username || !password) {
      log("missing username or password:", username, key)
    } else {
      username64 = Buffer.from(username).toString("base64")
      password64 = Buffer.from(password).toString("base64")
      if (!users[username64]) {
        users[username64] = password64
      } else {
        log("duplicate user provided in config:", username)
      }
    }
  }
})
// For tests, add a test user
if (env == "test") {
  users.test = "test"
}
log("Users:", Object.keys(users).map(user => Buffer.from(user, "base64").toString("ascii")).join(", "))
if (!postAuthRequired) {
  log("Note: POST /mappings does not require authentication. To change this, remove POST_AUTH_REQUIRED from .env file.")
}

module.exports = {
  env, verbosity, postAuthRequired, baseUrl, port, mongoHost, mongoPort, mongoDb, mongoUrl, mongoOptions, log, users
}
