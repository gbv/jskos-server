import { bodyParser, addPaginationHeaders, adjust } from "../utils/middleware.js"
import { wrapAsync, supportDownloadFormats, returnJSON, handleDownload, wrapDownload } from "./utils.js"

export function readRoute(router, path, config, service, authenticator, name, formats = []) {
  if (config) {
    router.get(
      path,
      authenticator.authenticate(config.auth),
      supportDownloadFormats(formats),
      wrapAsync(async req => service.queryItems(req.query)),
      wrapDownload(addPaginationHeaders, false),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload(name), true),
    )
  }
}

// TODO: merge with readRoute
export function readByIdRoute(router, config, service, authenticator, name, formats = []) {
  if (config) {
    router.get(
      "/:_id",
      authenticator.authenticate(config.auth),
      supportDownloadFormats(formats),
      wrapAsync(async req => service.getItem(req.params._id)),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload(name), true),
    )
  }
}

export function createRoute(router, path, config, service, authenticator) {
  if (config) {
    router.post(
      path,
      authenticator.authenticate(config.auth),
      bodyParser,
      wrapAsync(async req => service.createItem({
        bodyStream: req.anystream,
        user: req.user,
        bulk: req.query?.bulk,
        scheme: req.query?.scheme,
        setApi: req.query?.setApi, // TODO: this is not documented
      })),
      adjust,
      returnJSON,
    )
  }
}

export function updateRoute(router, path, config, service, authenticator) {
  if (config) {
    router.put(
      path, // "/{:_id}",
      authenticator.authenticate(config.auth),
      bodyParser,
      wrapAsync(async req => service.updateItem({
        body: req.body,
        existing: req.existing,
        setApi: req.query?.setApi, // TODO: this is not documented!
      })),
      adjust,
      returnJSON,
    )

    if (service.patch) { // TODO: implement for all services
      router.patch(
        path,
        authenticator.authenticate(config.auth),
        bodyParser,
        wrapAsync(async req => service.patch({
          body: req.body,
          existing: req.existing,
        })),
        adjust,
        returnJSON,
      )
    }
  }
}

// TODO: merge with updateRoute
export function updateByIdRoute(router, config, service, authenticator) {
  if (config) {
    updateRoute(router, "/:_id", config, service, authenticator)
  }
}

export function deleteRoute(router, path, config, service, authenticator) {
  if (config) {
    router.delete(
      path,
      authenticator.authenticate(config.auth),
      bodyParser,
      wrapAsync(async req => service.deleteItem({
        uri: req.query.uri,
        existing: req.existing,
        setApi: req.query?.setApi, // TODO: this is not documented
      })),
      (req, res) => res.sendStatus(204),
    )
  }
}

// TODO: merge with deleteRoute
export function deleteByIdRoute(router, config, service, authenticator) {
  if (config) {
    router.delete(
      "/:_id",
      authenticator.authenticate(config.auth),
      bodyParser,
      wrapAsync(async (req) => service.deleteItem({
        uri: req.params._id,
        user: req.user,
        existing: req.existing,
      })),
      (req, res) => res.sendStatus(204),
    )
  }
}

export function suggestRoute(router, path, config, service, authenticator) {
  if (config) {
    router.get(
      path,
      authenticator.authenticate(config.auth),
      supportDownloadFormats([]),
      wrapAsync(async req => service.getSuggestions(req.query)),
      addPaginationHeaders,
      returnJSON,
    )
  }
}
