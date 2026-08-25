import { wrapAsync, supportDownloadFormats, returnJSON } from "./utils.js"
import { Router } from "./router.js"

export default config => {
  const router = new Router(config)

  router.get(
    "/",
    router.authenticate(false),
    supportDownloadFormats([]),
    wrapAsync(async req => router.dataService.getData(req, router.authenticator, router.adjust)),
    returnJSON,
  )

  return router.router
}
