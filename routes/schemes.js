import { wrapAsync, wrapDownload, supportDownloadFormats, returnJSON, handleDownload } from "./utils.js"
import { MalformedRequestError } from "../errors/index.js"
import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const service = router.services.scheme
  const { schemes, concepts } = config

  router.read("/", schemes.read, service, "schemes")
  router.create("/", schemes.create, service)
  router.update("/", schemes.update, service)
  router.delete("/", schemes.delete, service)

  router.suggest("/suggest", schemes.read, service)

  if (concepts) {
    const conceptService = router.services.concept

    router.get(
      "/top",
      router.authenticate(concepts.read.auth),
      supportDownloadFormats([]),
      wrapAsync(async (req) => {
        return await conceptService.getTop(req.query)
      }),
      router.paginationHeaders,
      router.adjust,
      returnJSON,
    )

    router.get(
      "/concepts",
      router.authenticate(concepts.read.auth),
      supportDownloadFormats(["json", "ndjson"]),
      wrapAsync(async (req) => {
        if (!req.query.uri) {
          throw new MalformedRequestError("Parameter `uri` (URI of a vocabulary) is required for endpoint /voc/concepts")
        }
        const query = { ...req.query, voc: req.query.uri }
        delete query.uri
        return await conceptService.queryItems(query)
      }),
      wrapDownload(router.paginationHeaders, false),
      wrapDownload(router.adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload("concepts"), true),
    )

    if (concepts.delete) {
      router.del(
        "/concepts",
        router.authenticate(concepts.delete.auth),
        router.bodyParser,
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

  return router.router
}
