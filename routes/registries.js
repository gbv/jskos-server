import express from "express"
import { registryService } from "../services/registries.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as registryRouter }

router.use((req, res, next) => {
  next()
})

if (config.registries.read) {
  router.get(
    "/",
    config.registries.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats(["json", "ndjson"]),
    utils.wrappers.async(async (req) => {
      return await registryService.getRegistries(req.query)
    }),
    utils.wrappers.download(utils.addPaginationHeaders, false),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("registries"), true),
  )

  router.get(
    "/suggest",
    config.registries.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await registryService.getSuggestions(req.query)
    }),
    utils.addPaginationHeaders,
    utils.returnJSON,
  )

  router.get(
    "/:_id",
    config.registries.read.auth ? auth.main : auth.optional,
    utils.wrappers.async(async (req) => {
      return await registryService.getRegistry(req.params._id)
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.registries.create) {
  router.post(
    "/",
    config.registries.create.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await registryService.postRegistry({
        bodyStream: req.anystream,
        bulk: req.query.bulk,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.registries.update) {
  router.put(
    "/:_id",
    config.registries.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await registryService.putRegistry({
        _id: req.params._id,
        body: req.body,
        existing: req.existing,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )

  router.patch(
    "/:_id",
    config.registries.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await registryService.patchRegistry({
        _id: req.params._id,
        body: req.body,
        existing: req.existing,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.registries.delete) {
  router.delete(
    "/:_id",
    config.registries.delete.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await registryService.deleteRegistry({
        uri: req.params._id,
        existing: req.existing,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}
