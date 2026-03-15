/* Load and export configuration */

import _ from "lodash"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import * as dotenv from "dotenv"
import { loadConfig } from "./setup.js"

dotenv.config()
const env = process.env.NODE_ENV
const __dirname = import.meta.dirname

let config = { env }

// Load environment config
const configEnvFile = resolve(__dirname, `./config.${env}.json`)
if (existsSync(configEnvFile)) {
  config = { env, ...loadConfig(configEnvFile) }
}

// Load user config
if (env !== "test") {
  let configFile = process.env.CONFIG_FILE || "./config.json"
  if (!configFile.startsWith("/")) {
    configFile = resolve(__dirname, configFile)
  }

  if (existsSync(configFile)) {
    _.defaultsDeep(config, ...loadConfig(configFile))
  }
}

export default config
