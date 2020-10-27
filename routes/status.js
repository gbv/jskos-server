const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const statusService = Container.get(require("../services/status"))
const utils = require("../utils")

router.get(
  "/",
  utils.wrappers.async(async () => {
    return await statusService.getStatus()
  }),
  utils.wrappers.download(utils.returnJSON, false),
)

module.exports = router
