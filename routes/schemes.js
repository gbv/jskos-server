const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const schemeService = Container.get(require("../services/schemes"))
const conceptService = Container.get(require("../services/concepts"))
const utils = require("../utils")

router.get(
  "/",
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await schemeService.getSchemes(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/top",
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getTop(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/concepts",
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getConcepts(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

module.exports = router
