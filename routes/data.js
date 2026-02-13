import express from "express"
import { DataService } from "../services/data.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const dataService = new DataService(config)

  router.get(
    "/",
    auth.optional,
    utils.supportDownloadFormats([]),
    utils.wrappers.async(async (req) => {
      return await dataService.getData(req)
    }),
    utils.returnJSON,
  )

  return router
}
