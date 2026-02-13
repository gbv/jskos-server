import express from "express"
import { ConcordanceService } from "../services/concordances.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const concordanceService = new ConcordanceService(config)
  const { concordances } = config

  if (concordances.read) {
    router.get(
      "/",
      concordances.read.auth ? auth.main : auth.optional,
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
      concordances.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats(["json", "ndjson"]),
      utils.wrappers.async(async (req) => {
        return await concordanceService.get(req.params._id)
      }),
      utils.wrappers.download(utils.adjust, false),
      utils.wrappers.download(utils.returnJSON, false),
      utils.wrappers.download(utils.handleDownload("concordance"), true),
    )
  }

  if (concordances.create) {
    router.post(
      "/",
      concordances.create.auth ? auth.main : auth.optional,
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

  if (concordances.update) {
    router.put(
      "/:_id",
      concordances.update.auth ? auth.main : auth.optional,
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
      concordances.update.auth ? auth.main : auth.optional,
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

  if (concordances.delete) {
    router.delete(
      "/:_id",
      concordances.delete.auth ? auth.main : auth.optional,
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

  return router
}
