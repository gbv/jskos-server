import { wrapAsync, supportDownloadFormats, returnJSON } from "./utils.js"
import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const { concepts } = config

  if (concepts) {
    const service = router.services.concept

    router.read("/concepts", concepts.read, service, "concepts", ["json", "ndjson"])
    router.create("/concepts", concepts.create, service)
    router.update("/concepts", concepts.update, service)
    router.delete("/concepts", concepts.delete, service)

    if (concepts.read) {
    // Add these routes both with and without the /concepts prefix.
    // TODO for 3.0: The routes without should be deprecated in the next major release.
    // Maybe add redirects
    // See also: https://github.com/gbv/jskos-server/issues/193#issuecomment-1508038432

      for (const prefix of ["", "/concepts"]) {

        router.get(
          prefix + "/narrower",
          router.authenticate(concepts.read.auth),
          supportDownloadFormats([]),
          wrapAsync(async req => service.getNarrower(req.query)),
          router.paginationHeaders,
          router.adjust,
          returnJSON,
        )

        router.get(
          prefix + "/ancestors",
          router.authenticate(concepts.read.auth),
          supportDownloadFormats([]),
          wrapAsync(async req => service.getAncestors(req.query)),
          router.paginationHeaders,
          router.adjust,
          returnJSON,
        )

        router.suggest(prefix + "/suggest", concepts.read, service)

        router.get(
          prefix + "/search",
          router.authenticate(concepts.read.auth),
          supportDownloadFormats([]),
          wrapAsync(async req => await service.search(req.query)),
          router.paginationHeaders,
          router.adjust,
          returnJSON,
        )
      }
    }
  }

  return router.router
}
