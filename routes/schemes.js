import express from "express"
import { SchemeService } from "../services/schemes.js"
import { ConceptService } from "../services/concepts.js"
import { adjust, addPaginationHeaders, bodyParser } from "../utils/middleware.js"
import { wrapAsync, wrapDownload, supportDownloadFormats, returnJSON, handleDownload } from "./utils.js"
import { MalformedRequestError } from "../errors/index.js"
import { readRoute, createRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const service = new SchemeService(config)
  const { schemes, concepts, authenticator } = config

  readRoute(router, "/", schemes.read, service, authenticator, "schemes")
  createRoute(router, "/", schemes.create, service, authenticator)
  updateRoute(router, "/", schemes.update, service, authenticator)
  deleteRoute(router, "/", schemes.delete, service, authenticator)

  suggestRoute(router, "/suggest", schemes.read, service, authenticator)

  if (concepts) {
    const conceptService = new ConceptService(config)

    router.get(
      "/top",
      authenticator.authenticate(concepts.read.auth),
      supportDownloadFormats([]),
      wrapAsync(async (req) => {
        return await conceptService.getTop(req.query)
      }),
      addPaginationHeaders,
      adjust,
      returnJSON,
    )

    router.get(
      "/concepts",
      authenticator.authenticate(concepts.read.auth),
      supportDownloadFormats(["json", "ndjson"]),
      wrapAsync(async (req) => {
        if (!req.query.uri) {
          throw new MalformedRequestError("Parameter `uri` (URI of a vocabulary) is required for endpoint /voc/concepts")
        }
        const query = { ...req.query, voc: req.query.uri }
        delete query.uri
        return await conceptService.queryItems(query)
      }),
      wrapDownload(addPaginationHeaders, false),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload("concepts"), true),
    )

    if (concepts.delete) {
      router.delete(
        "/concepts",
        authenticator.authenticate(concepts.delete.auth),
        bodyParser,
        wrapAsync(async (req) => {
          return await conceptService.deleteConceptsFromScheme({
            scheme: req.existing,
            setApi: req.query.setApi,
          })
        }),
        (req, res) => res.sendStatus(204),
      )
    }
  }

  return router
}
