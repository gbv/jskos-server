const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const validateService = Container.get(require("../services/validate"))
const utils = require("../utils")
const axios = require("axios")
const { MalformedRequestError } = require("../errors")

router.get(
  "/",
  utils.wrappers.async(async (req) => {
    const url = req.query.url
    // Load data from url
    try {
      const data = (await axios.get(url)).data
      return await validateService.validate(data, req.query)
    } catch (error) {
      console.log(error)
      throw new MalformedRequestError(`Error loading data from URL ${url}.`)
    }
  }),
  utils.returnJSON,
)

router.post(
  "/",
  express.json(),
  utils.wrappers.async(async (req) => {
    return await validateService.validate(req.body, req.query)
  }),
  utils.returnJSON,
)

module.exports = router
