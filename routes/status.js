import express from "express"
import { wrapAsync, wrapDownload, returnJSON } from "../utils/middleware.js"

import { connection } from "../utils/db.js"

export default config => {
  const router = express.Router()

  router.get(
    "/",
    wrapAsync(async () => {
      const status = config.status
      status.ok = connection.readyState === 1 ? 1 : 0
      return status
    }),
    wrapDownload(returnJSON, false),
  )

  return router
}
