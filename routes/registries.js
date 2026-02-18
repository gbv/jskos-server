import express from "express"
import { RegistryService } from "../services/registries.js"
import { createRoute, readRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { registries } = config
  if (!registries) {
    return router
  }

  const service = new RegistryService(config)

  readRoute(router, "/", registries.read, service, "registries")
  createRoute(router, "/", registries.create, service)
  updateRoute(router, "/", registries.update, service)
  deleteRoute(router, "/", registries.delete, service)

  // TODO: patchRoute

  suggestRoute(router, "/suggest", registries.read, service)

  return router
}
