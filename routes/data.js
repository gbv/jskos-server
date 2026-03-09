import { DataService } from "../services/data.js"
import { wrapAsync, supportDownloadFormats, returnJSON } from "./utils.js"
import { Router } from "./router.js"

export default config => {
  const router = new Router(config)
  const dataService = new DataService(config)

  router.get(
    "/",
    router.authenticate(false),
    supportDownloadFormats([]),
    wrapAsync(async req => dataService.getData(req)),
    returnJSON,
  )

  return router.router
}
