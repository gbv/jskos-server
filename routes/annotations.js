import express from "express"
import { AnnotationService } from "../services/annotations.js"
import { readRoute, readByIdRoute, createRoute, updateRoute, updateByIdRoute, deleteRoute, deleteByIdRoute } from "./common.js"

export default config => {
  const router = express.Router()
  const { annotations, authenticator } = config

  if (annotations) {
    const service = new AnnotationService(config)

    readRoute(router, "/", annotations.read, service, authenticator, "annotations")
    readByIdRoute(router, annotations.read, service, authenticator, "annotation")

    createRoute(router, "/", annotations.create, service, authenticator)

    updateRoute(router, "/", annotations.update, service, authenticator)
    updateByIdRoute(router, annotations.update, service, authenticator)

    deleteRoute(router, "/", annotations.delete, service, authenticator)
    deleteByIdRoute(router, annotations.delete, service, authenticator)
  }

  return router
}
