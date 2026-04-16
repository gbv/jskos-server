import express from "express"
import { createBodyParser } from "../utils/body-parser.js"
import { createAdjuster } from "../utils/adjust.js"
import { addPaginationHeaders } from "../utils/pagination-headers.js"
import { wrapAsync, supportDownloadFormats, returnJSON, returnJSONCreated, handleDownload, wrapDownload } from "./utils.js"
import { Authenticator } from "../utils/auth.js"

import { createServices } from "../services/index.js"

export class Router {

  constructor(config, router = express.Router()) {
    this.services = createServices(config)
    this.router = router
    this.config = config

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
      this.router.get(
        "/:_id",
        this.authenticate(config.auth),
        supportDownloadFormats(formats),
        wrapAsync(async req => service.getItem(req.params._id)),
        wrapDownload(this.adjust, false),
        wrapDownload(returnJSON, false),
        wrapDownload(handleDownload(name), true),
      )
    }
  }

  suggest(path, config, service) {
    if (config) {
      this.router.get(
        path,
        this.authenticate(config.auth),
        supportDownloadFormats([]),
        wrapAsync(async req => service.getSuggestions(req.query)),
        this.paginationHeaders,
        returnJSON,
      )
    }
  }

  create(path, config, service) {
    if (config) {
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

  // low level
  get(...args) {
    this.router.get(...args)
  }

  post(...args) {
    this.router.post(...args)
  }

  del(...args) {
    this.router.delete(...args)
  }

}
