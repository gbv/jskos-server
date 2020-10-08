const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const conceptService = Container.get(require("../services/concepts"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

router.get(
  "/data",
  config.concepts.read.auth ? auth.default : auth.optional,
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
    config.concepts.create.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await conceptService.postConcept({
        bodyStream: req.bodyStream,
        bulk: req.query.bulk,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concepts.update) {
  router.put(
    "/data",
    config.concepts.update.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await conceptService.putConcept({
        body: req.body,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concepts.delete) {
  router.delete(
    "/data",
    config.concepts.delete.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await conceptService.deleteConcept({
        uri: req.query.uri,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

router.get(
  "/narrower",
  config.concepts.read.auth ? auth.default : auth.optional,
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
  config.concepts.read.auth ? auth.default : auth.optional,
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
  config.concepts.read.auth ? auth.default : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/search",
  config.concepts.read.auth ? auth.default : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.search(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

module.exports = router
