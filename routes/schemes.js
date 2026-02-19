import express from "express"
import { SchemeService } from "../services/schemes.js"
import { ConceptService } from "../services/concepts.js"
import * as utils from "../utils/middleware.js"
import { wrapAsync, wrapDownload } from "../utils/middleware.js"
import { useAuth } from "../utils/auth.js"
import { MalformedRequestError } from "../errors/index.js"
import { readRoute, createRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const service = new SchemeService(config)
  const { schemes, concepts } = config

  readRoute(router, "/", schemes.read, service, "schemes")
  createRoute(router, "/", schemes.create, service)
  updateRoute(router, "/", schemes.update, service)
  deleteRoute(router, "/", schemes.delete, service)

  suggestRoute(router, "/suggest", schemes.read, service)

  if (concepts) {
    const conceptService = new ConceptService(config)

    router.get(
      "/top",
      useAuth(concepts.read.auth),
      utils.supportDownloadFormats([]),
      wrapAsync(async (req) => {
        return await conceptService.getTop(req.query)
      }),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )

    router.get(
      "/concepts",
      useAuth(concepts.read.auth),
      utils.supportDownloadFormats(["json", "ndjson"]),
      wrapAsync(async (req) => {
        if (!req.query.uri) {
          throw new MalformedRequestError("Parameter `uri` (URI of a vocabulary) is required for endpoint /voc/concepts")
        }
        const query = { ...req.query, voc: req.query.uri }
        delete query.uri
        return await conceptService.queryItems(query)
      }),
      wrapDownload(utils.addPaginationHeaders, false),
      wrapDownload(utils.adjust, false),
      wrapDownload(utils.returnJSON, false),
      wrapDownload(utils.handleDownload("concepts"), true),
    )

    if (concepts.delete) {
      router.delete(
        "/concepts",
        useAuth(concepts.delete.auth),
        utils.bodyParser,
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
