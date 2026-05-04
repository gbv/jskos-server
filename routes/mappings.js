import express from "express"
import { wrapAsync, returnJSON } from "./utils.js"
import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const service = router.services.mapping

  const { mappings, concepts, schemes } = config

  // order of routes matters:

  router.get(
    "/suggest",
    router.authenticate(concepts?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getNotationSuggestions(req.query)
    }),
    router.paginationHeaders,
    returnJSON,
  )

  router.get(
    "/voc",
    router.authenticate(schemes?.read?.auth),
    wrapAsync(async (req) => {
      return await service.getMappingSchemes(req.query)
    }),
    router.paginationHeaders,
    router.adjust,
    returnJSON,
  )

  if (mappings.read) {
    router.get(
      "/infer",
      router.authenticate(mappings.read.auth),
      wrapAsync(async req => service.inferMappings(req.query)),
      router.paginationHeaders,
      router.adjust,
      returnJSON,
    )

    router.get(
      "/apply",
      router.authenticate(mappings.read.auth),
      wrapAsync(async req => service.applyMappings(req.query)),
      returnJSON,
    )

    router.post(
      "/apply",
      router.authenticate(mappings.read.auth),
      express.json(),
      wrapAsync(async req => service.applyMappings(req.query, req.body)),
      returnJSON,
      (req, res) => {
        if (res.statusCode === 201) {
          res.status(200)
        }
      },
    )
  }

  router.read("/", mappings.read, service, "mappings", ["json", "ndjson", "csv", "tsv"])
  router.readOne(mappings.read, service, "mappings", ["json", "ndjson", "csv", "tsv"])

  router.create("/", mappings.create, service)

  router.update("/", mappings.update, service)
  router.update("/:_id", mappings.update, service)

  router.delete("/:_id", mappings.delete, service)

  return router.router
}
