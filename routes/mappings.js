import express from "express"
import { MappingService } from "../services/mappings.js"
import { adjust, addPaginationHeaders, bodyParser } from "../utils/middleware.js"
import { wrapAsync, wrapDownload, supportDownloadFormats, returnJSON, handleDownload } from "./utils.js"
import { readRoute, createRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const service = new MappingService(config)

  const { mappings, concepts, schemes, authenticator } = config

  // /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
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

  readRoute(router, "/", mappings.read, service, authenticator, "mappings", ["json", "ndjson", "csv", "tsv"])
  createRoute(router, "/", mappings.create, service, authenticator)

  if (mappings.read) {
    router.get(
      "/infer",
      authenticator.authenticate(mappings.read.auth),
      wrapAsync(async req => service.inferMappings(req.query)),
      addPaginationHeaders,
      adjust,
      returnJSON,
    )

    router.get(
      "/:_id",
      authenticator.authenticate(mappings.read.auth),
      supportDownloadFormats(["json", "ndjson", "csv", "tsv"]),
      wrapAsync(async req => service.getMapping(req.params._id)),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload("mapping"), true),
    )
  }

  if (mappings.update) {
    router.put(
      "/:_id",
      authenticator.authenticate(mappings.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.putMapping({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )

    router.patch(
      "/:_id",
      authenticator.authenticate(mappings.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.patch({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )
  }

  if (mappings.delete) {
    router.delete(
      "/:_id",
      authenticator.authenticate(mappings.delete.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.deleteItem({
          _id: req.params._id,
          user: req.user,
          existing: req.existing,
        })
      }),
      (req, res) => res.sendStatus(204),
    )
  }

  return router
}
