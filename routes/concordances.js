const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const concordanceService = Container.get(require("../services/concordances"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

if (config.concordances.read) {
  router.get(
    "/",
    config.concordances.read.auth ? auth.default : auth.optional,
    utils.supportDownloadFormats(["json", "ndjson"]),
    utils.wrappers.async(async (req) => {
      return await concordanceService.getConcordances(req.query)
    }),
    utils.wrappers.download(utils.addPaginationHeaders, false),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("concordances"), true),
  )

  router.get(
    "/:_id",
    config.concordances.read.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await concordanceService.get(req.params._id)
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

module.exports = router
