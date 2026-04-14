import { validateConfig, setupConfig } from "../config/setup.js"
import fs from "node:fs"
import path from "node:path"

import { v4 as uuid } from "uuid"

// Prepare environment
import * as dotenv from "dotenv"
dotenv.config()
const env = process.env.NODE_ENV

// Get config file path and adjust if it's relative
let configFile = process.env.CONFIG_FILE || env === "test" ? "./config.test.json" : "./config.json"
if (!configFile.startsWith("/")) {
  configFile = path.resolve(import.meta.dirname, configFile)
}

// Load config file
let config = {}
if (fs.existsSync(configFile)) {
  config = JSON.parse(fs.readFileSync(configFile))
  console.log(`Read configuration from ${configFile}`)
} else if (env !== "test") {
// If file doesn't exist, create it with an empty array
  fs.writeFileSync(configFile, "{}")
}

try {
  validateConfig(config)
} catch(error) {
  console.error(`Could not validate configuration: ${error}`)
  process.exit(1)
}

// Check whether `namespace` exists and if not, generate a namespace and save it to config file
if (!config.namespace && env !== "test") {
  config.namespace = uuid()
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
  console.log(`Info/Config: Created a namespace and wrote it to ${configFile}.`)
}

config.env = env
setupConfig(config)

export default config
