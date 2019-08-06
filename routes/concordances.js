const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const concordanceService = Container.get(require("../services/concordances"))
const utils = require("../utils")

router.get(
  "/",
  utils.supportDownloadFormats(["json", "ndjson"]),
  utils.wrappers.async(async (req) => {
    return await concordanceService.getConcordances(req.query)
  }),
  utils.wrappers.download(utils.addPaginationHeaders, false),
  utils.wrappers.download(utils.adjust, false),
  utils.wrappers.download(utils.returnJSON, false),
  utils.wrappers.download(utils.handleDownload("concordances"), true),
)

module.exports = router
