import express from "express"
import { RegistryService } from "../services/registries.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const registryService = new RegistryService(config)
  const { registries } = config

  if (registries.read) {
    router.get(
      "/",
      registries.read.auth ? auth.main : auth.optional,
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
      registries.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await registryService.getSuggestions(req.query)
      }),
      utils.addPaginationHeaders,
      utils.returnJSON,
    )

    router.get(
      "/:_id",
      registries.read.auth ? auth.main : auth.optional,
      utils.wrappers.async(async (req) => {
        return await registryService.getRegistry(req.params._id)
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (registries.create) {
    router.post(
      "/",
      registries.create.auth ? auth.main : auth.optional,
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

  if (registries.update) {
    router.put(
      "/:_id",
      registries.update.auth ? auth.main : auth.optional,
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
      registries.update.auth ? auth.main : auth.optional,
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

  if (registries.delete) {
    router.delete(
      "/:_id",
      registries.delete.auth ? auth.main : auth.optional,
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

  return router
}
