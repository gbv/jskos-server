import express from "express"
import { AnnotationService } from "../services/annotations.js"
import { adjust, bodyParser } from "../utils/middleware.js"
import { wrapAsync, returnJSON } from "./utils.js"
import { readRoute, createRoute, updateRoute, deleteRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { annotations, authenticator } = config
  if (!annotations) {
    return router
  }

  const service = new AnnotationService(config)

  readRoute(router, "/", annotations.read, service, authenticator, "annotations")
  createRoute(router, "/", annotations.create, service, authenticator)
  updateRoute(router, "/", annotations.update, service, authenticator)
  deleteRoute(router, "/", annotations.delete, service, authenticator)

  if (annotations.read) {
    router.get(
      "/:_id",
      authenticator.authenticate(annotations.read.auth),
      wrapAsync(async req => service.getItem(req.params._id)),
      adjust,
      returnJSON,
    )
  }

  if (annotations.update) {
    router.put(
      "/:_id",
      authenticator.authenticate(annotations.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.updateItem({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )

    router.patch(
      "/:_id",
      authenticator.authenticate(annotations.update.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.patch({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      adjust,
      returnJSON,
    )
  }

  if (annotations.delete) {
    router.delete(
      "/:_id",
      authenticator.authenticate(annotations.delete.auth),
      bodyParser,
      wrapAsync(async (req) => {
        return await service.deleteItem({
          uri: req.params._id,
          user: req.user,
          existing: req.existing,
        })
      }),
      (req, res) => res.sendStatus(204),
    )
  }

  return router
}
