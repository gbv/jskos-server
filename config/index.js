import _ from "lodash"
import { validateConfig, setupConfig } from "../config/setup.js"
import fs from "node:fs"
import path from "node:path"

import { v4 as uuid } from "uuid"

// Prepare environment
import * as dotenv from "dotenv"
dotenv.config()
const env = process.env.NODE_ENV
const configFile = process.env.CONFIG_FILE || "./config.json"

const __dirname = import.meta.dirname

// Adjust path if it's relative
let configFilePath
if (configFile.startsWith("/")) {
  configFilePath = configFile
} else {
  configFilePath = path.resolve(__dirname, configFile)
}

// If file doesn't exist, create it with an empty array
if (env !== "test" && !fs.existsSync(configFilePath)) {
  fs.writeFileSync(configFilePath, "{}")
}

// Load environment config
let configEnv
try {
  configEnv = JSON.parse(fs.readFileSync(path.resolve(__dirname, `./config.${env}.json`)))
} catch(error) {
  configEnv = {}
}
// Load user config
let configUser = {}
try {
  configUser = JSON.parse(fs.readFileSync(configFilePath))
} catch(error) {
  if (env !== "test") {
    console.error(`Warning: Could not load configuration file from ${configFilePath}. Please check whether it is valid JSON and restart the application.`)
    process.exit(1)
  }
}

// Validate
try {
  validateConfig(configEnv)
} catch(error) {
  console.error(`Could not validate environemnt configuration: ${error}`)
  process.exit(1)
}
try {
  validateConfig(configUser)
} catch(error) {
  console.error(`Could not validate user configuration: ${error}`)
  process.exit(1)
}

// Before merging, check whether `namespace` exists in the user config and if not, generate a namespace and save it to user config
if (!configUser.namespace && env != "test") {
  configUser.namespace = uuid()
  fs.writeFileSync(configFilePath, JSON.stringify(configUser, null, 2))
  console.log(`Info/Config: Created a namespace and wrote it to ${configFilePath}.`)
}

const config = _.defaultsDeep({ env }, configEnv, configUser)
setupConfig(config)

export default config
