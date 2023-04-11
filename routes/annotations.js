import express from "express"
import { annotationService } from "../services/annotations.js"
import config from "../config/index.js"
import * as utils from "../utils/index.js"
import * as auth from "../utils/auth.js"

const router = express.Router()
export { router as annotationRouter }

if (config.annotations.read) {
  router.get(
    "/",
    config.annotations.read.auth ? auth.main : auth.optional,
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
    config.annotations.read.auth ? auth.main : auth.optional,
    utils.wrappers.async(async (req) => {
      return await annotationService.getAnnotation(req.params._id)
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.annotations.create) {
  router.post(
    "/",
    config.annotations.create.auth ? auth.main : auth.optional,
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

if (config.annotations.update) {
  router.put(
    "/:_id",
    config.annotations.update.auth ? auth.main : auth.optional,
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
    config.annotations.update.auth ? auth.main : auth.optional,
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

if (config.annotations.delete) {
  router.delete(
    "/:_id",
    config.annotations.delete.auth ? auth.main : auth.optional,
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
