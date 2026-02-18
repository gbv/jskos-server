import * as auth from "../utils/auth.js"
import { bodyParser, wrapAsync, supportDownloadFormats, returnJSON, addPaginationHeaders, handleDownload, wrapDownload, adjust } from "../utils/middleware.js"

export function readRoute(router, path, config, service, name, formats=[]) {
  if (config) {
    router.get(
      path,
      config.auth ? auth.main : auth.optional,
      supportDownloadFormats(formats),
      wrapAsync(async req => service.queryItems(req.query)),
      wrapDownload(addPaginationHeaders, false),
      wrapDownload(adjust, false),
      wrapDownload(returnJSON, false),
      wrapDownload(handleDownload(name), true),
    )
  }
}

export function createRoute(router, path, config, service) {
  if (config) {
    router.post(
      path,
      config.auth ? auth.main : auth.optional,
      bodyParser,
      wrapAsync(async (req) => {
        return await service.createItem({
          bodyStream: req.anystream,
          user: req.user,
          bulk: req.query?.bulk,
          scheme: req.query?.scheme,
          setApi: req.query?.setApi, // TODO: this is not documented
        })
      }),
      adjust,
      returnJSON,
    )
  }
}

export function updateRoute(router, path, config, service) {
  if (config) {
    router.put(
      path,
      config.auth ? auth.main : auth.optional,
      bodyParser,
      wrapAsync(async req => service.updateItems({
        body: req.body,
        existing: req.existing,
        setApi: req.query?.setApi, // TODO: this is not documented
      })),
      adjust,
      returnJSON,
    )
  }
}

export function deleteRoute(router, path, config, service) {
  if (config) {
    router.delete(
      path,
      config.auth ? auth.main : auth.optional,
      bodyParser,
      wrapAsync(async (req) => {
        return await service.deleteItem({
          uri: req.query.uri,
          existing: req.existing,
          setApi: req.query?.setApi, // TODO: this is not documented
        })
      }),
      (req, res) => res.sendStatus(204),
    )
  }
}

export function suggestRoute(router, path, config, service) {
  if (config) {
    router.get(
      path,
      config.auth ? auth.main : auth.optional,
      supportDownloadFormats([]),
      wrapAsync(async req => service.getSuggestions(req.query)),
      addPaginationHeaders,
      returnJSON,
    )
  }
}
