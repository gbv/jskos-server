import express from "express"
import { ValidateService } from "../services/validate.js"
import { wrapAsync, returnJSON } from "./utils.js"
import axios from "axios"
import { MalformedRequestError } from "../errors/index.js"

export default config => {
  const router = express.Router()
  const service = new ValidateService(config)

  router.get(
    "/",
    wrapAsync(async req => {
      const url = req.query.url
      if (!url) {
        throw new MalformedRequestError("Please use HTTP POST or provide an URL to load data from!")
      }
      try {
        const data = (await axios.get(url)).data
        return await service.validate(data, req.query)
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
    wrapAsync(async req => service.validate(req.body, req.query)),
    returnJSON,
  )

  return router
}
