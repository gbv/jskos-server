import express from "express"
import { conceptService } from "../services/concepts.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as conceptRouter }

if (config.concepts.read) {
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
}

if (config.concepts.create) {
  router.post(
    "/concepts",
    config.concepts.create.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await conceptService.postConcept({
        bodyStream: req.anystream,
        bulk: req.query.bulk,
        scheme: req.query.scheme,
        setApi: req.query.setApi,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.concepts.update) {
  router.put(
    "/concepts",
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
    "/concepts",
    config.concepts.delete.auth ? auth.main : auth.optional,
    utils.bodyParser,
    utils.wrappers.async(async (req) => {
      return await conceptService.deleteConcept({
        uri: req.query.uri,
        existing: req.existing,
        setApi: req.query.setApi,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

if (config.concepts.read) {
// Add these routes both with and without the /concepts prefix.
// TODO for 3.0: The routes without should be deprecated in the next major release.
// See also: https://github.com/gbv/jskos-server/issues/193#issuecomment-1508038432

  for (const prefix of ["", "/concepts"]) {

    router.get(
      prefix + "/narrower",
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
      prefix + "/ancestors",
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
      prefix + "/suggest",
      config.concepts.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await conceptService.getSuggestions(req.query)
      }),
      utils.addPaginationHeaders,
      utils.returnJSON,
    )

    router.get(
      prefix + "/search",
      config.concepts.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await conceptService.search(req.query)
      }),
      utils.addPaginationHeaders,
      utils.adjust,
      utils.returnJSON,
    )

  }

}
