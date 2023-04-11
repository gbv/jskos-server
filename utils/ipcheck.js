import ipaddr from "ipaddr.js"
import config from "../config/index.js"
import { ForbiddenAccessError, ConfigurationError } from "../errors/index.js"

/**
 * Middleware to check IP whitelists if configured.
 */
export const ipcheck = (req, res, next) => {

  // Determine IP whitelist from config
  let ips, action
  if (req.method == "GET") {
    action = "read"
  }
  if (req.method == "POST") {
    action = "create"
  }
  if (req.method == "PUT" || req.method == "PATCH") {
    action = "update"
  }
  if (req.method == "DELETE") {
    action = "delete"
  }
  if (action && config[req.type] && config[req.type][action]) {
    ips = config[req.type][action].ips
  }

  if (ips && ips.length) {
    // Determine client's IP address
    let ip
    try {
      ip = ipaddr.parse(req.ip)
      if (ip.kind() == "ipv6") {
        if (ip.range() == "loopback") {
          // Set IPv6 loopback addresses to 127.0.0.1
          ip = ipaddr.parse("127.0.0.1")
        } else {
          // Convert to IPv4 address
          ip = ip.toIPv4Address()
        }
      }
    } catch(error) {
      config.warn(`Could not determine client's address for IP ${ip && ip.toString && ip.toString()}.`)
      next(new ForbiddenAccessError("Access forbidden. An IP filter is in place, but the client's address could not be determined."))
      return
    }
    // Convert IP whitelist to ranges
    try {
      ips = ips.map(ip => {
        if (ip.includes("/")) {
          // Parse CIDR ranges
          return ipaddr.parseCIDR(ip)
        } else {
          // Parse normal IP address
          return [ipaddr.parse(ip), 32]
        }
      })
    } catch(error) {
      config.error("Error: Invalid IP address in config:", ips, `=> Currently denying all requests to ${action} ${req.type}.`)
      next(new ConfigurationError())
      return
    }
    for (let range of ips) {
      if (ip.match(range)) {
        // IP is on the list
        next()
        return
      }
    }
    next(new ForbiddenAccessError("Access forbidden. An IP filter is in place, but the client is not on that list."))
  } else {
    next()
  }

}
