import { urlForLinkHeader } from "./url-for-link-header.js"

/**
 * Sets pagination headers (X-Total-Count, Link) for a response.
 * See also: https://developer.github.com/v3/#pagination
 * For Link header rels:
 * - first and last are always set
 * - prev will be set if previous page exists (i.e. if offset > 0)
 * - next will be set if next page exists (i.e. if offset + limit < total)
 *
 * Requires req.data to be set.
 */
export function addPaginationHeaders(base) {
  return (req, res, next) => {
    const limit = req.query.limit
    const offset = req.query.offset
    const total = req.data?.totalCount ?? req.data?.length ?? null

    if (req == null || res == null || limit == null || offset == null) {
      next()
      return
    }

    if (total === null) {
      // FIXME: workaround! We don't know the total number, so we just return an unreasonably high number here. See #176.
      res.set("X-Total-Count", 9999999)
    } else {
      res.set("X-Total-Count", total)
    }

    let links = []
    let query = { ...req.query }
    // rel: first
    query.offset = 0
    links.push(urlForLinkHeader({ base, req, query, rel: "first" }))
    // rel: prev
    if (offset > 0) {
      query.offset = Math.max(offset - limit, 0)
      links.push(urlForLinkHeader({ base, req, query, rel: "prev" }))
    }
    // rel: next
    if (total && limit + offset < total || req.data && req.data.length === limit) {
      query.offset = offset + limit
      links.push(urlForLinkHeader({ base, req, query, rel: "next" }))
    }
    // rel: last
    if (total !== null) {
      let current = 0
      while (current + limit < total) {
        current += limit
      }
      query.offset = current
      links.push(urlForLinkHeader({ base, req, query, rel: "last" }))
    } else if (req.data.length < limit) {
    // Current page is last
      links.push(urlForLinkHeader({ base, req, query, rel: "last" }))
    }
    // Push existing Link header to the back
    links.push(res.get("Link"))
    // Set Link header
    res.set("Link", links.join(","))
    next()
  }
}
