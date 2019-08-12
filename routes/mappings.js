const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const mappingService = Container.get(require("../services/mappings"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

router.get(
  "/",
  utils.supportDownloadFormats(["json", "ndjson", "csv", "tsv"]),
  utils.wrappers.async(async (req) => {
    return await mappingService.getMappings(req.query)
  }),
  utils.wrappers.download(utils.addPaginationHeaders, false),
  utils.wrappers.download(utils.adjust, false),
  utils.wrappers.download(utils.returnJSON, false),
  utils.wrappers.download(utils.handleDownload("mappings"), true),
)

// /mappings/suggest and /mappings/voc need to come before /mappings/:_id!
router.get(
  "/suggest",
  utils.wrappers.async(async (req) => {
    return await mappingService.getNotationSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.returnJSON,
)
router.get(
  "/voc",
  utils.wrappers.async(async (req) => {
    return await mappingService.getMappingSchemes(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/:_id",
  utils.wrappers.async(async (req) => {
    return await mappingService.getMapping(req.params._id)
  }),
  utils.adjust,
  utils.returnJSON,
)

router.post(
  "/",
  config.auth.postAuthRequired ? auth.default : auth.optional,
  utils.wrappers.async(async (req) => {
    return await mappingService.postMapping({
      body: req.body,
      user: req.user,
      baseUrl: req.myBaseUrl,
    })
  }),
  utils.adjust,
  utils.returnJSON,
)

router.put(
  "/:_id",
  auth.default,
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
  auth.default,
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

router.delete(
  "/:_id",
  auth.default,
  utils.wrappers.async(async (req) => {
    return await mappingService.deleteMapping({
      _id: req.params._id,
      user: req.user,
    })
  }),
  (req, res) => res.sendStatus(204),
)

module.exports = router
