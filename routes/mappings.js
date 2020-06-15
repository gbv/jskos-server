const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const mappingService = Container.get(require("../services/mappings"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

// /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
router.get(
  "/suggest",
  config.concepts && config.concepts.read.auth ? auth.default : auth.optional,
  utils.wrappers.async(async (req) => {
    return await mappingService.getNotationSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.returnJSON,
)
router.get(
  "/voc",
  config.schemes && config.schemes.read.auth ? auth.default : auth.optional,
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
    config.mappings.read.auth ? auth.default : auth.optional,
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
    "/:_id",
    config.mappings.read.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await mappingService.getMapping(req.params._id)
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.mappings.create) {
  router.post(
    "/",
    config.mappings.create.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await mappingService.postMapping({
        body: req.body,
        user: req.user,
        bulk: req.query.bulk === "true" || req.query.bulk === "1",
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.mappings.update) {
  router.put(
    "/:_id",
    config.mappings.update.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await mappingService.putMapping({
        _id: req.params._id,
        body: req.body,
        user: req.user,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )

  router.patch(
    "/:_id",
    config.mappings.update.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await mappingService.patchMapping({
        _id: req.params._id,
        body: req.body,
        user: req.user,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.mappings.delete) {
  router.delete(
    "/:_id",
    config.mappings.delete.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await mappingService.deleteMapping({
        _id: req.params._id,
        user: req.user,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

module.exports = router
