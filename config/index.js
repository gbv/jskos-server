import { validateConfig, setupConfig } from "../config/setup.js"
import fs from "node:fs"
import path from "node:path"
import * as dotenv from "dotenv"

// Prepare environment
const env = process.env.NODE_ENV
if (env !== "test") {
  dotenv.config()
}

// Get config file path and adjust if it's relative
let configFile = process.env.CONFIG_FILE || (env === "test" ? "./config.test.json" : "./config.json")
if (!configFile.startsWith("/")) {
  configFile = path.resolve(import.meta.dirname, configFile)
}

// Load config file
let config = {}
if (fs.existsSync(configFile)) {
  config = JSON.parse(fs.readFileSync(configFile))
  console.log(`Read configuration file ${configFile}`)
} else if ("CONFIG_FILE" in process.env) {
  console.log(`Missing configuration file ${configFile}`)
  process.exit(1)
}

try {
  validateConfig(config)
} catch(error) {
  console.error(`Could not validate configuration: ${error}`)
  process.exit(1)
}

config.env = env
setupConfig(config)

export default config
