import express from "express"
import { MappingService } from "../services/mappings.js"
import { adjust, addPaginationHeaders } from "../utils/middleware.js"
import { wrapAsync, returnJSON } from "./utils.js"
import { readRoute, readByIdRoute, createRoute, updateByIdRoute, deleteByIdRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const service = new MappingService(config)

  const { mappings, concepts, schemes, authenticator } = config

  // order or routes matters:

  router.get(
    "/suggest",
    authenticator.authenticate(concepts?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getNotationSuggestions(req.query)
    }),
    addPaginationHeaders,
    returnJSON,
  )

  router.get(
    "/voc",
    authenticator.authenticate(schemes?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getMappingSchemes(req.query)
    }),
    addPaginationHeaders,
    adjust,
    returnJSON,
  )

  if (mappings.read) {
    router.get(
      "/infer",
      authenticator.authenticate(mappings.read.auth),
      wrapAsync(async req => service.inferMappings(req.query)),
      addPaginationHeaders,
      adjust,
      returnJSON,
    )
  }

  readRoute(router, "/", mappings.read, service, authenticator, "mappings", ["json", "ndjson", "csv", "tsv"])
  createRoute(router, "/", mappings.create, service, authenticator)

  readByIdRoute(router, mappings.read, service, authenticator, "mapping", ["json", "ndjson", "csv", "tsv"])
  updateByIdRoute(router, mappings.update, service, authenticator)

  deleteByIdRoute(router, mappings.delete, service, authenticator)

  return router
}
