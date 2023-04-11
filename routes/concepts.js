import express from "express"
import { conceptService } from "../services/concepts.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as conceptRouter }

router.get(
  "/data",
  config.concepts.read.auth ? auth.main : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getDetails(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

if (config.concepts.create) {
  router.post(
    "/data",
    config.concepts.create.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await conceptService.postConcept({
        bodyStream: req.anystream,
        bulk: req.query.bulk,
        scheme: req.query.scheme,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concepts.update) {
  router.put(
    "/data",
    config.concepts.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await conceptService.putConcept({
        body: req.body,
        existing: req.existing,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concepts.delete) {
  router.delete(
    "/data",
    config.concepts.delete.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await conceptService.deleteConcept({
        uri: req.query.uri,
        existing: req.existing,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

router.get(
  "/narrower",
  config.concepts.read.auth ? auth.main : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getNarrower(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/ancestors",
  config.concepts.read.auth ? auth.main : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getAncestors(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/suggest",
  config.concepts.read.auth ? auth.main : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.returnJSON,
)

router.get(
  "/search",
  config.concepts.read.auth ? auth.main : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.search(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)
