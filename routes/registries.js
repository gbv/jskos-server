import express from "express"
import { RegistryService } from "../services/registries.js"
import { createRoute, readRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { registries, authenticator } = config
  if (!registries) {
    return router
  }

  const service = new RegistryService(config)

  readRoute(router, "/", registries.read, service, authenticator, "registries")
  createRoute(router, "/", registries.create, service, authenticator)
  updateRoute(router, "/", registries.update, service, authenticator)
  deleteRoute(router, "/", registries.delete, service, authenticator)

  // TODO: patchRoute

  suggestRoute(router, "/suggest", registries.read, service, authenticator)

  return router
}
