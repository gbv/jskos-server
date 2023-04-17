import express from "express"
import { conceptService } from "../services/concepts.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as dataRouter }

router.get(
  "/data",
  auth.optional,
  utils.supportDownloadFormats([]),
  utils.wrappers.async(async (req) => {
    return await conceptService.getDetails(req.query)
  }),
  utils.addPaginationHeaders,
  utils.adjust,
  utils.returnJSON,
)
