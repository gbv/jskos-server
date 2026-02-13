import express from "express"
import StatusService from "../services/status.js"
import { wrapAsync, wrapDownload, returnJSON } from "../utils/middleware.js"

export default config => {
  const router = express.Router()
  const statusService = new StatusService(config)

  router.get(
    "/",
    wrapAsync(async () => await statusService.getStatus()),
    wrapDownload(returnJSON, false),
  )

  return router
}
