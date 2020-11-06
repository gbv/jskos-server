const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const schemeService = Container.get(require("../services/schemes"))
const conceptService = Container.get(require("../services/concepts"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

router.get(
  "/",
  config.schemes.read.auth ? auth.default : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await schemeService.getSchemes(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

if (config.schemes.create) {
  router.post(
    "/",
    config.schemes.create.auth ? auth.default : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await schemeService.postScheme({
        bodyStream: req.anystream,
        bulk: req.query.bulk,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.schemes.update) {
  router.put(
    "/",
    config.schemes.update.auth ? auth.default : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await schemeService.putScheme({
        body: req.body,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.schemes.delete) {
  router.delete(
    "/",
    config.schemes.delete.auth ? auth.default : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await schemeService.deleteScheme({
        uri: req.query.uri,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

if (config.concepts) {

  router.get(
    "/top",
    config.concepts.read.auth ? auth.default : auth.optional,
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
    config.concepts.read.auth ? auth.default : auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await conceptService.getConcepts(req.query)
    }),
    utils.addPaginationHeaders,
    utils.adjust,
    utils.returnJSON,
  )

  if (config.concepts.delete) {
    router.delete(
      "/concepts",
      config.concepts.delete.auth ? auth.default : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await conceptService.deleteConceptsFromScheme({
          uri: req.query.uri,
        })
      }),
      (req, res) => res.sendStatus(204),
    )
  }

}

router.get(
  "/suggest",
  config.schemes.read.auth ? auth.default : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await schemeService.getSuggestions(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

router.get(
  "/search",
  config.schemes.read.auth ? auth.default : auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await schemeService.search(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)

module.exports = router
