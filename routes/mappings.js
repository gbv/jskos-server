import express from "express"
import { MappingService } from "../services/mappings.js"
import * as utils from "../utils/middleware.js"
import { wrapAsync, wrapDownload } from "../utils/middleware.js"
import { useAuth } from "../utils/auth.js"
import { readRoute, createRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const service = new MappingService(config)

  // /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
  router.get(
    "/suggest",
    useAuth(config.concepts?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getNotationSuggestions(req.query)
    }),
    utils.addPaginationHeaders,
    utils.returnJSON,
  )
  router.get(
    "/voc",
    useAuth(config.schemes?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getMappingSchemes(req.query)
    }),
    utils.addPaginationHeaders,
    utils.adjust,
    utils.returnJSON,
  )

  readRoute(router, "/", config.mappings.read, service, "mappings", ["json", "ndjson", "csv", "tsv"])
  createRoute(router, "/", config.mappings.create, service)

  if (config.mappings.read) {
    router.get(
      "/infer",
      useAuth(config.mappings.read.auth),
      wrapAsync(async req => service.inferMappings(req.query)),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )

    router.get(
      "/:_id",
      useAuth(config.mappings.read.auth),
      utils.supportDownloadFormats(["json", "ndjson", "csv", "tsv"]),
      wrapAsync(async req => service.getMapping(req.params._id)),
      wrapDownload(utils.adjust, false),
      wrapDownload(utils.returnJSON, false),
      wrapDownload(utils.handleDownload("mapping"), true),
    )
  }

  if (config.mappings.update) {
    router.put(
      "/:_id",
      useAuth(config.mappings.update.auth),
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await service.putMapping({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )

    router.patch(
      "/:_id",
      useAuth(config.mappings.update.auth),
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await service.patchMapping({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (config.mappings.delete) {
    router.delete(
      "/:_id",
      useAuth(config.mappings.delete.auth),
      utils.bodyParser,
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
