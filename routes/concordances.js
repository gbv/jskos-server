import express from "express"
import { concordanceService } from "../services/concordances.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as concordanceRouter }

if (config.concordances.read) {
  router.get(
    "/",
    config.concordances.read.auth ? auth.main : auth.optional,
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
    config.concordances.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats(["json", "ndjson"]),
    utils.wrappers.async(async (req) => {
      return await concordanceService.get(req.params._id)
    }),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("concordance"), true),
  )
}

if (config.concordances.create) {
  router.post(
    "/",
    config.concordances.create.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await concordanceService.postConcordance({
        bodyStream: req.anystream,
        user: req.user,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concordances.update) {
  router.put(
    "/:_id",
    config.concordances.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await concordanceService.putConcordance({
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
    config.concordances.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await concordanceService.patchConcordance({
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

if (config.concordances.delete) {
  router.delete(
    "/:_id",
    config.concordances.delete.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await concordanceService.deleteConcordance({
        _id: req.params._id,
        user: req.user,
        existing: req.existing,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}
