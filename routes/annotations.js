import express from "express"
import { AnnotationService } from "../services/annotations.js"
import * as utils from "../utils/middleware.js"
import * as auth from "../utils/auth.js"

export default config => {
  const router = express.Router()
  const annotationService = new AnnotationService(config)
  const { annotations } = config

  if (annotations.read) {
    router.get(
      "/",
      annotations.read.auth ? auth.main : auth.optional,
      utils.supportDownloadFormats([]),
      utils.wrappers.async(async (req) => {
        return await annotationService.getAnnotations(req.query)
      }),
      utils.wrappers.download(utils.addPaginationHeaders, false),
      utils.wrappers.download(utils.adjust, false),
      utils.wrappers.download(utils.returnJSON, false),
    )

    router.get(
      "/:_id",
      annotations.read.auth ? auth.main : auth.optional,
      utils.wrappers.async(async (req) => {
        return await annotationService.getAnnotation(req.params._id)
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (annotations.create) {
    router.post(
      "/",
      annotations.create.auth ? auth.main : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await annotationService.postAnnotation({
          bodyStream: req.anystream,
          user: req.user,
          bulk: req.query.bulk,
        })
      }),
      utils.adjust,
      utils.returnJSON,
    )
  }

  if (annotations.update) {
    router.put(
      "/:_id",
      annotations.update.auth ? auth.main : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await annotationService.putAnnotation({
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
      annotations.update.auth ? auth.main : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await annotationService.patchAnnotation({
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
      annotations.delete.auth ? auth.main : auth.optional,
      utils.bodyParser,
      utils.wrappers.async(async (req) => {
        return await annotationService.deleteAnnotation({
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
