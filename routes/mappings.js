import express from "express"
import { mappingService } from "../services/mappings.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as mappingRouter }

// /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
router.get(
  "/suggest",
  config.concepts && config.concepts.read.auth ? auth.main : auth.optional,
  utils.wrappers.async(async (req) => {
    return await mappingService.getNotationSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.returnJSON,
)
router.get(
  "/voc",
  config.schemes && config.schemes.read.auth ? auth.main : auth.optional,
  utils.wrappers.async(async (req) => {
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
    utils.wrappers.async(async (req) => {
      return await mappingService.getMappings(req.query)
    }),
    utils.wrappers.download(utils.addPaginationHeaders, false),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("mappings"), true),
  )

  router.get(
    "/infer",
    config.mappings.read.auth ? auth.main : auth.optional,
    utils.wrappers.async(async (req) => {
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
    utils.wrappers.async(async (req) => {
      return await mappingService.getMapping(req.params._id)
    }),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("mapping"), true),
  )
}

if (config.mappings.create) {
  router.post(
    "/",
    config.mappings.create.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
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
    utils.wrappers.async(async (req) => {
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
    utils.wrappers.async(async (req) => {
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
    utils.wrappers.async(async (req) => {
      return await mappingService.deleteMapping({
        _id: req.params._id,
        user: req.user,
        existing: req.existing,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}
