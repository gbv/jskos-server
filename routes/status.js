import express from "express"
import StatusService from "../services/status.js"
import * as utils from "../utils/index.js"

export default config => {
  const router = express.Router()
  const statusService = new StatusService(config)

  router.get(
    "/",
    utils.wrappers.async(async () => {
      return await statusService.getStatus()
    }),
    utils.wrappers.download(utils.returnJSON, false),
  )

  return router
}