import express from "express"
import { MappingService } from "../services/mappings.js"
import * as utils from "../utils/middleware.js"
import { wrapAsync, wrapDownload } from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const mappingService = new MappingService(config)

  // /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
  router.get(
    "/suggest",
    config.concepts && config.concepts.read?.auth ? auth.main : auth.optional,
    wrapAsync(async (req) => {
      return await mappingService.getNotationSuggestions(req.query)
    }),
    utils.addPaginationHeaders,
    utils.returnJSON,
  )
  router.get(
    "/voc",
    config.schemes && config.schemes.read?.auth ? auth.main : auth.optional,
    wrapAsync(async (req) => {
      return await mappingService.getMappingSchemes(req.query)
    }),
    utils.addPaginationHeaders,
    utils.adjust,
    utils.returnJSON,
  )

  if (config.mappings.read) {
    router.get(
      "/",
      config.mappings.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats(["json", "ndjson", "csv", "tsv"]),
      wrapAsync(async (req) => {
        return await mappingService.getMappings(req.query)
      }),
      wrapDownload(utils.addPaginationHeaders, false),
      wrapDownload(utils.adjust, false),
      wrapDownload(utils.returnJSON, false),
      wrapDownload(utils.handleDownload("mappings"), true),
    )

    router.get(
      "/infer",
      config.mappings.read.auth ? auth.main : auth.optional,
      wrapAsync(async (req) => {
        return await mappingService.inferMappings(req.query)
      }),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )

    router.get(
      "/:_id",
      config.mappings.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats(["json", "ndjson", "csv", "tsv"]),
      wrapAsync(async (req) => {
        return await mappingService.getMapping(req.params._id)
      }),
      wrapDownload(utils.adjust, false),
      wrapDownload(utils.returnJSON, false),
      wrapDownload(utils.handleDownload("mapping"), true),
    )
  }

  if (config.mappings.create) {
    router.post(
      "/",
      config.mappings.create.auth ? auth.main : auth.optional,
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await mappingService.postMapping({
          bodyStream: req.anystream,
          user: req.user,
          bulk: req.query.bulk,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (config.mappings.update) {
    router.put(
      "/:_id",
      config.mappings.update.auth ? auth.main : auth.optional,
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await mappingService.putMapping({
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
      config.mappings.update.auth ? auth.main : auth.optional,
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await mappingService.patchMapping({
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
      config.mappings.delete.auth ? auth.main : auth.optional,
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await mappingService.deleteMapping({
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
