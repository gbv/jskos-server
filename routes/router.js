import express from "express"
import { createBodyParser } from "../utils/body-parser.js"
import { createAdjuster } from "../utils/adjust.js"
import { addPaginationHeaders } from "../utils/pagination-headers.js"
import { wrapAsync, supportDownloadFormats, returnJSON, returnJSONCreated, handleDownload, wrapDownload } from "./utils.js"
import { Authenticator } from "../utils/auth.js"

import { createServices, DataService, ValidateService } from "../services/index.js"

export class Router {

  constructor(config, router = express.Router()) {
    this.services = createServices(config)
    this.dataService = new DataService(config)
    this.validateService = new ValidateService(config)

    this.router = router
    this.config = config
    this.spec = {} // OpenAPI Paths Object

    // middleware
    this.adjust = createAdjuster(config, this.services)
    this.paginationHeaders = addPaginationHeaders(config.baseUrl)
    this.bodyParser = createBodyParser(this.services)
    this.authenticator = new Authenticator(config)
  }

  // middleware

  authenticate(required) {
    return this.authenticator.authenticate(required)
  }

  // action methods

  read(path, config, service, name, formats = []) {
    if (config) {
      const name = service.modelName[1]
      this.about("get", path, `Returns details of ${name}`)
      this.router.get(
        path,
        this.authenticate(config.auth),
        supportDownloadFormats(formats),
        wrapAsync(async req => service.queryItems(req.query)),
        wrapDownload(this.paginationHeaders, false),
        wrapDownload(this.adjust, false),
        wrapDownload(returnJSON, false),
        wrapDownload(handleDownload(name), true),
      )
    }
  }

  readOne(config, service, name, formats = []) {
    if (config) {
      const name = service.modelName[0]
      const path = "/:_id"
      this.about("get", path, `Returns ${name}`)
      this.router.get(
        path,
        this.authenticate(config.auth),
        supportDownloadFormats(formats),
        wrapAsync(async req => service.getItem(req.params._id)),
        wrapDownload(this.adjust, false),
        wrapDownload(returnJSON, false),
        wrapDownload(handleDownload(name.split(" ")[1]), true),
      )
    }
  }

  suggest(path, config, service) {
    if (config) {
      this.about("get", path, `Returns suggestions for ${service.modelName[1]} OpenSearch Suggest Format`)
      this.router.get(
        path,
        this.authenticate(config.auth),
        supportDownloadFormats([]),
        wrapAsync(async req => service.getSuggestions(req.query)),
        this.paginationHeaders,
        returnJSON,
      )
      this.about("put", path, `Update ${service.modelName[0]} in the database`)
    }
  }

  create(path, config, service) {
    if (config) {
      this.about("post", path, `Save ${service.modelName[1]} in the database`)
      this.router.post(
        path,
        this.authenticate(config.auth),
        this.bodyParser,
        wrapAsync(async req => service.createItem({
          bodyStream: req.anystream,
          user: req.user,
          bulk: req.query?.bulk,
          scheme: req.query?.scheme,
          setApi: req.query?.setApi, // TODO: this is not documented and should not come from query
        })),
        this.adjust,
        returnJSONCreated,
      )
    }
  }

  update(path, config, service) {
    if (config) {
      this.about("put", path, `Update ${service.modelName[0]} in the database`)
      this.router.put(
        path,
        this.authenticate(config.auth),
        this.bodyParser,
        wrapAsync(async req => service.updateItem({
          body: req.body,
          existing: req.existing,
          setApi: req.query?.setApi, // TODO: this is not documented and should not come from query
        })),
        this.adjust,
        returnJSON,
      )
      if (service.patch) { // TODO: implement for all services
        this.about("patch", path, `Adjust ${service.modelName[0]} in the database`)
        this.router.patch(
          path,
          this.authenticate(config.auth),
          this.bodyParser,
          wrapAsync(async req => service.patch({
            body: req.body,
            existing: req.existing,
          })),
          this.adjust,
          returnJSON,
        )
      }
    }
  }

  delete(path, config, service) {
    if (config) {
      this.about("delete", path, `Deletes ${service.modelName[0]} from the database`)
      this.router.delete(
        path,
        this.authenticate(config.auth),
        this.bodyParser,
        wrapAsync(async req => service.deleteItem({
          uri: req.query.uri,
          existing: req.existing,
          setApi: req.query?.setApi, // TODO: this is not documented
        })),
        (req, res) => res.sendStatus(204),
      )
    }
  }

  // low level registering of an endpoint operation
  endpoint(method, path, operation, ...args) {
    this.about(method, path, operation)
    this.router[method](path, ...args)
  }

  // add documentation of an endpoint operation
  about(method, path, operation) {
    path = path.replace(":_id","{id}")
    ;(this.spec[path] ??= {})[method] =
      typeof operation === "string" ? { summary: operation } : operation
  }
}
