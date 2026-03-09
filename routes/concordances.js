import express from "express"
import { ConcordanceService } from "../services/concordances.js"
import { adjust, bodyParser } from "../utils/middleware.js"
import { wrapAsync, wrapDownload, supportDownloadFormats, returnJSON, handleDownload } from "./utils.js"
import { readRoute, createRoute, updateRoute, deleteRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { concordances, authenticator } = config
  if (!concordances) {
    return router
  }

  const service = new ConcordanceService(config)

  readRoute(router, "/", concordances.read, service, authenticator, "concordances", ["json", "ndjson"])

  if (concordances.read) {
    router.get(
      "/:_id",
      authenticator.authenticate(concordances.read.auth),
      supportDownloadFormats(["json", "ndjson"]),
      wrapAsync(async req => service.getItem(req.params._id)),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload("concordance"), true),
    )
  }

  createRoute(router, "/", concordances.create, service, authenticator)
  updateRoute(router, "/", concordances.update, service, authenticator)
  deleteRoute(router, "/", concordances.delete, service, authenticator)

  if (concordances.update) {
    router.put(
      "/:_id",
      authenticator.authenticate(concordances.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.putConcordance({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )

    router.patch(
      "/:_id",
      authenticator.authenticate(concordances.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.patch({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )
  }

  if (concordances.delete) {
    router.delete(
      "/:_id",
      authenticator.authenticate(concordances.delete.auth),
      bodyParser,
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
