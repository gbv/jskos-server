import express from "express"
import { ConceptService } from "../services/concepts.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const conceptService = new ConceptService(config)
  const { concepts } = config

  if (concepts.read) {
    router.get(
      "/concepts",
      concepts.read.auth ? auth.main : auth.optional,
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

  if (concepts.create) {
    router.post(
      "/concepts",
      concepts.create.auth ? auth.main : auth.optional,
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

  if (concepts.update) {
    router.put(
      "/concepts",
      concepts.update.auth ? auth.main : auth.optional,
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

  if (concepts.delete) {
    router.delete(
      "/concepts",
      concepts.delete.auth ? auth.main : auth.optional,
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

  if (concepts.read) {
    // Add these routes both with and without the /concepts prefix.
    // TODO for 3.0: The routes without should be deprecated in the next major release.
    // See also: https://github.com/gbv/jskos-server/issues/193#issuecomment-1508038432

    for (const prefix of ["", "/concepts"]) {

      router.get(
        prefix + "/narrower",
        concepts.read.auth ? auth.main : auth.optional,
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
        concepts.read.auth ? auth.main : auth.optional,
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
        concepts.read.auth ? auth.main : auth.optional,
        utils.supportDownloadFormats([]),
        utils.wrappers.async(async (req) => {
          return await conceptService.getSuggestions(req.query)
        }),
        utils.addPaginationHeaders,
        utils.returnJSON,
      )

      router.get(
        prefix + "/search",
        concepts.read.auth ? auth.main : auth.optional,
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

  return router
}
