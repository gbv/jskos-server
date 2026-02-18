import express from "express"
import { ConceptService } from "../services/concepts.js"
import * as utils from "../utils/middleware.js"
import { wrapAsync } from "../utils/middleware.js"
import * as auth from "../utils/auth.js"
import { readRoute, createRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { concepts } = config
  if (!concepts) {
    return concepts
  }

  const service = new ConceptService(config)

  readRoute(router, "/concepts", concepts.read, service, "concepts", ["json", "ndjson"])
  createRoute(router, "/concepts", concepts.create, service)
  updateRoute(router, "/concepts", concepts.update, service)
  deleteRoute(router, "/concepts", concepts.delete, service)

  if (concepts.read) {
    // Add these routes both with and without the /concepts prefix.
    // TODO for 3.0: The routes without should be deprecated in the next major release.
    // See also: https://github.com/gbv/jskos-server/issues/193#issuecomment-1508038432

    for (const prefix of ["", "/concepts"]) {

      router.get(
        prefix + "/narrower",
        concepts.read.auth ? auth.main : auth.optional,
        utils.supportDownloadFormats([]),
        wrapAsync(async req => service.getNarrower(req.query)),
        utils.addPaginationHeaders,
        utils.adjust,
        utils.returnJSON,
      )

      router.get(
        prefix + "/ancestors",
        concepts.read.auth ? auth.main : auth.optional,
        utils.supportDownloadFormats([]),
        wrapAsync(async req => service.getAncestors(req.query)),
        utils.addPaginationHeaders,
        utils.adjust,
        utils.returnJSON,
      )

      suggestRoute(router, prefix + "/suggest", concepts.read, service)

      router.get(
        prefix + "/search",
        concepts.read.auth ? auth.main : auth.optional,
        utils.supportDownloadFormats([]),
        wrapAsync(async req => await service.search(req.query)),
        utils.addPaginationHeaders,
        utils.adjust,
        utils.returnJSON,
      )
    }
  }

  return router
}
