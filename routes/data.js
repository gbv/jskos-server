import express from "express"
import { DataService } from "../services/data.js"
import { wrapAsync, supportDownloadFormats, returnJSON } from "./utils.js"

export default config => {
  const router = express.Router()
  const dataService = new DataService(config)

  router.get(
    "/",
    config.authenticator.authenticate(false),
    supportDownloadFormats([]),
    wrapAsync(async req => dataService.getData(req)),
    returnJSON,
  )

  return router
}
