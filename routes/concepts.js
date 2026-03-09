import express from "express"
import { ConceptService } from "../services/concepts.js"
import { adjust, addPaginationHeaders } from "../utils/middleware.js"
import { wrapAsync, supportDownloadFormats, returnJSON } from "./utils.js"
import { readRoute, createRoute, updateRoute, deleteRoute, suggestRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { concepts, authenticator } = config
  if (!concepts) {
    return concepts
  }

  const service = new ConceptService(config)

  readRoute(router, "/concepts", concepts.read, service, authenticator, "concepts", ["json", "ndjson"])

  createRoute(router, "/concepts", concepts.create, service, authenticator)

  updateRoute(router, "/concepts", concepts.update, service, authenticator)

  deleteRoute(router, "/concepts", concepts.delete, service, authenticator)

  if (concepts.read) {
    // Add these routes both with and without the /concepts prefix.
    // TODO for 3.0: The routes without should be deprecated in the next major release.
    // See also: https://github.com/gbv/jskos-server/issues/193#issuecomment-1508038432

    for (const prefix of ["", "/concepts"]) {

      router.get(
        prefix + "/narrower",
        authenticator.authenticate(concepts.read.auth),
        supportDownloadFormats([]),
        wrapAsync(async req => service.getNarrower(req.query)),
        addPaginationHeaders,
        adjust,
        returnJSON,
      )

      router.get(
        prefix + "/ancestors",
        authenticator.authenticate(concepts.read.auth),
        supportDownloadFormats([]),
        wrapAsync(async req => service.getAncestors(req.query)),
        addPaginationHeaders,
        adjust,
        returnJSON,
      )

      suggestRoute(router, prefix + "/suggest", concepts.read, service, authenticator)

      router.get(
        prefix + "/search",
        authenticator.authenticate(concepts.read.auth),
        supportDownloadFormats([]),
        wrapAsync(async req => await service.search(req.query)),
        addPaginationHeaders,
        adjust,
        returnJSON,
      )
    }
  }

  return router
}
