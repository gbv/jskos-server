import express from "express"
import StatusService from "../services/status.js"
import { wrappers, returnJSON } from "../utils/middleware.js"

export default config => {
  const router = express.Router()
  const statusService = new StatusService(config)

  router.get(
    "/",
    wrappers.async(async () => {
      return await statusService.getStatus()
    }),
    wrappers.download(returnJSON, false),
  )

  return router
}
