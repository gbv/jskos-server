const express = require("express")
const router = express.Router()
const Container = require("typedi").Container
const annotationService = Container.get(require("../services/annotations"))
const utils = require("../utils")
const auth = require("../utils/auth")

router.get(
  "/",
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
  utils.wrappers.async(async (req) => {
    return await annotationService.getAnnotation(req.params._id)
  }),
  utils.adjust,
  utils.returnJSON,
)

// TODO: Add authentication
router.post(
  "/",
  auth.default,
  utils.wrappers.async(async (req) => {
    return await annotationService.postAnnotation({
      body: req.body,
      user: req.user,
      baseUrl: req.myBaseUrl,
    })
  }),
  utils.adjust,
  utils.returnJSON,
)

// TODO: Add authentication
router.put(
  "/:_id",
  auth.default,
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

// TODO: Add authentication
router.patch(
  "/:_id",
  auth.default,
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

// TODO: Add authentication
router.delete(
  "/:_id",
  auth.default,
  utils.wrappers.async(async (req) => {
    return await annotationService.deleteAnnotation({
      _id: req.params._id,
      user: req.user,
    })
  }),
  (req, res) => res.sendStatus(204),
)

module.exports = router
