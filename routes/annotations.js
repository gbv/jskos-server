const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const annotationService = Container.get(require("../services/annotations"))
const config = require("../config")
const utils = require("../utils")
const auth = require("../utils/auth")

if (config.annotations.read) {
  router.get(
    "/",
    config.annotations.read.auth ? auth.default : auth.optional,
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
    config.annotations.read.auth ? auth.default : auth.optional,
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
    config.annotations.create.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await annotationService.postAnnotation({
        body: req.body,
        user: req.user,
        bulk: req.query.bulk === "true" || req.query.bulk === "1",
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.annotations.update) {
  router.put(
    "/:_id",
    config.annotations.update.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await annotationService.putAnnotation({
        _id: req.params._id,
        body: req.body,
        user: req.user,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )

  router.patch(
    "/:_id",
    config.annotations.update.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await annotationService.patchAnnotation({
        _id: req.params._id,
        body: req.body,
        user: req.user,
      })
    }),
    utils.adjust,
    utils.returnJSON,
  )
}

if (config.annotations.delete) {
  router.delete(
    "/:_id",
    config.annotations.delete.auth ? auth.default : auth.optional,
    utils.wrappers.async(async (req) => {
      return await annotationService.deleteAnnotation({
        _id: req.params._id,
        user: req.user,
      })
    }),
    (req, res) => res.sendStatus(204),
  )
}

module.exports = router
