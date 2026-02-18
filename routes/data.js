import express from "express"
import { DataService } from "../services/data.js"
import { wrapAsync, supportDownloadFormats, returnJSON } from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const dataService = new DataService(config)

  router.get(
    "/",
    auth.optional,
    supportDownloadFormats([]),
    wrapAsync(async req => dataService.getData(req)),
    returnJSON,
  )

  return router
}
