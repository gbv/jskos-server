import express from "express"
import { statusService } from "../services/status.js"
import * as utils from "../utils/index.js"

const router = express.Router()
export { router as statusRouter }

router.get(
  "/",
  utils.wrappers.async(async () => {
    return await statusService.getStatus()
  }),
  utils.wrappers.download(utils.returnJSON, false),
)
