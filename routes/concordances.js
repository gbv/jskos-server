import express from "express"
import { ConcordanceService } from "../services/concordances.js"
import { readRoute, readByIdRoute, createRoute, updateRoute, updateByIdRoute, deleteRoute, deleteByIdRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { concordances, authenticator } = config

  if (concordances) {
    const service = new ConcordanceService(config)

    readRoute(router, "/", concordances.read, service, authenticator, "concordances", ["json", "ndjson"])
    readByIdRoute(router, concordances.read, service, authenticator, "concordance", ["json", "ndjson"])

    createRoute(router, "/", concordances.create, service, authenticator)

    updateRoute(router, "/", concordances.update, service, authenticator)
    updateByIdRoute(router, concordances.update, service, authenticator)

    deleteRoute(router, "/", concordances.delete, service, authenticator)
    deleteByIdRoute(router, concordances.delete, service, authenticator)
  }

  return router
}
