import express from "express"
import { schemeService } from "../services/schemes.js"
import { conceptService } from "../services/concepts.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as schemeRouter }

if (config.schemes.read) {
  router.get(
    "/",
    config.schemes.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await schemeService.getSchemes(req.query)
    }),
    utils.addPaginationHeaders,
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.schemes.create) {
  router.post(
    "/",
    config.schemes.create.auth ? auth.main : auth.optional,
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
    config.schemes.update.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await schemeService.putScheme({
        body: req.body,
        existing: req.existing,
        setApi: req.query.setApi,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.schemes.delete) {
  router.delete(
    "/",
    config.schemes.delete.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await schemeService.deleteScheme({
        uri: req.query.uri,
        existing: req.existing,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

if (config.concepts) {

  router.get(
    "/top",
    config.concepts.read.auth ? auth.main : auth.optional,
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
    config.concepts.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats(["json", "ndjson"]),
    utils.wrappers.async(async (req) => {
      return await conceptService.getConcepts(req.query)
    }),
    utils.wrappers.download(utils.addPaginationHeaders, false),
    utils.wrappers.download(utils.adjust, false),
    utils.wrappers.download(utils.returnJSON, false),
    utils.wrappers.download(utils.handleDownload("concepts"), true),
  )

  if (config.concepts.delete) {
    router.delete(
      "/concepts",
      config.concepts.delete.auth ? auth.main : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await conceptService.deleteConceptsFromScheme({
          scheme: req.existing,
          setApi: req.query.setApi,
        })
      }),
      (req, res) => res.sendStatus(204),
    )
  }

}

if (config.schemes.read) {
  router.get(
    "/suggest",
    config.schemes.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await schemeService.getSuggestions(req.query)
    }),
    utils.addPaginationHeaders,
    utils.returnJSON,
  )

  router.get(
    "/search",
    config.schemes.read.auth ? auth.main : auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await schemeService.search(req.query)
    }),
    utils.addPaginationHeaders,
    utils.adjust,
    utils.returnJSON,
  )
}
