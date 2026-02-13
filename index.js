import { validateConfig, setupConfig } from "./config/setup.js"
import { createServices as _createServices } from "./services/index.js"

// TODO: move this into createServices
function createServices(config) {
  setupConfig(config)
  return _createServices(config)
}

export { validateConfig, createServices }
