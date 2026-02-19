import express from "express"
import { AnnotationService } from "../services/annotations.js"
import * as utils from "../utils/middleware.js"
import { wrapAsync } from "../utils/middleware.js"
import { useAuth } from "../utils/auth.js"
import { readRoute, createRoute, updateRoute, deleteRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { annotations } = config
  if (!annotations) {
    return router
  }

  const service = new AnnotationService(config)

  readRoute(router, "/", annotations.read, service, "annotations")
  createRoute(router, "/", annotations.create, service)
  updateRoute(router, "/", annotations.update, service)
  deleteRoute(router, "/", annotations.delete, service)

  if (annotations.read) {
    router.get(
      "/:_id",
      useAuth(annotations.read.auth),
      wrapAsync(async req => service.getItem(req.params._id)),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (annotations.update) {
    router.put(
      "/:_id",
      useAuth(annotations.update.auth),
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await service.updateItem({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )

    router.patch(
      "/:_id",
      useAuth(annotations.update.auth),
      utils.bodyParser,
      wrapAsync(async (req) => {
        return await service.patchAnnotation({
          _id: req.params._id,
          body: req.body,
          user: req.user,
          existing: req.existing,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (annotations.delete) {
    router.delete(
      "/:_id",
      useAuth(annotations.delete.auth),
      utils.bodyParser,
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
