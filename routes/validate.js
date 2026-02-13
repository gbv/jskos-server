import express from "express"
import { ValidateService } from "../services/validate.js"
import { wrappers, returnJSON } from "../utils/middleware.js"
import axios from "axios"
import { MalformedRequestError } from "../errors/index.js"

export default config => {
  const router = express.Router()
  const validateService = new ValidateService(config)

  router.get(
    "/",
    wrappers.async(async (req) => {
      const url = req.query.url
      if (!url) {
        throw new MalformedRequestError("Please use HTTP POST or provide an URL to load data from!")
      }
      // Load data from url
      try {
        const data = (await axios.get(url)).data
        return await validateService.validate(data, req.query)
      } catch (error) {
        console.log(error)
        throw new MalformedRequestError(`Error loading data from URL ${url}.`)
      }
    }),
    returnJSON,
  )

  router.post(
    "/",
    express.json(),
    wrappers.async(async (req) => {
      return await validateService.validate(req.body, req.query)
    }),
    returnJSON,
  )

  return router
}
