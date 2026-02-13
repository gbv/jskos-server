import express from "express"
import { SchemeService } from "../services/schemes.js"
import { ConceptService } from "../services/concepts.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"
import { MalformedRequestError } from "../errors/index.js"

export default config => {
  const router = express.Router()
  const schemeService = new SchemeService(config)
  const conceptService = new ConceptService(config)
  const { schemes, concepts } = config

  if (schemes.read) {
    router.get(
      "/",
      schemes.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await schemeService.getSchemes(req.query)
      }),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (schemes.create) {
    router.post(
      "/",
      schemes.create.auth ? auth.main : auth.optional,
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

  if (schemes.update) {
    router.put(
      "/",
      schemes.update.auth ? auth.main : auth.optional,
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

  if (schemes.delete) {
    router.delete(
      "/",
      schemes.delete.auth ? auth.main : auth.optional,
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

  if (concepts) {

    router.get(
      "/top",
      concepts.read.auth ? auth.main : auth.optional,
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
      concepts.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats(["json", "ndjson"]),
      utils.wrappers.async(async (req) => {
        if (!req.query.uri) {
          throw new MalformedRequestError("Parameter `uri` (URI of a vocabulary) is required for endpoint /voc/concepts")
        }
        const query = { ...req.query, voc: req.query.uri }
        delete query.uri
        return await conceptService.getConcepts(query)
      }),
      utils.wrappers.download(utils.addPaginationHeaders, false),
      utils.wrappers.download(utils.adjust, false),
      utils.wrappers.download(utils.returnJSON, false),
      utils.wrappers.download(utils.handleDownload("concepts"), true),
    )

    if (concepts.delete) {
      router.delete(
        "/concepts",
        concepts.delete.auth ? auth.main : auth.optional,
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

  if (schemes.read) {
    router.get(
      "/suggest",
      schemes.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await schemeService.getSuggestions(req.query)
      }),
      utils.addPaginationHeaders,
      utils.returnJSON,
    )

    router.get(
      "/search",
      schemes.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await schemeService.search(req.query)
      }),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )
  }

  return router
}
