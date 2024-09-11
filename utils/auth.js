/**
 * Module that prepares authentication middleware via Passport.
 *
 * Exports an object { main, optional } with default (main) and optional authentication.
 * Optional authentication should be used if `auth` is set to `false` for a particular endpoint.
 * For example: app.get("/mappings", config.mappings.read.auth ? auth.main : auth.optional, (req, res) => { ... })
 * req.user will cointain the user if authorized, otherwise stays undefined.
 */

import config from "../config/index.js"
import _ from "lodash"
import { ForbiddenAccessError } from "../errors/index.js"

import passport from "passport"

import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { Strategy as AnonymousStrategy } from "passport-anonymous"

// Add some properties and methods related to authentication
// This middleware is added to both auth.main and auth.optional
const authPreparation = (req, res, next) => {
  // Add req.action
  switch (req.method) {
    case "POST":
      req.action = "create"
      break
    case "PUT":
      req.action = "update"
      break
    case "PATCH":
      req.action = "update"
      break
    case "DELETE":
      req.action = "detele"
      break
    default:
      req.action = "read"
      break
  }

  // Add user URIs and providers
  req.uris = [req.user?.uri].concat(Object.values(req.user?.identities || {}).map(id => id.uri)).filter(Boolean)
  req.userProviders = Object.keys(req.user?.identities || {})

  // Add isAuthorizedFor method
  req.isAuthorizedFor = function ({ type, action, whitelist, providers, throwError = false } = {}) {
    type = type ?? this.type
    action = action ?? this.action

    if (!config[type]?.[action]?.auth && type !== "checkAuth") {
      // If action does not require auth at all, the request is authorized
      return true
    } else if (!this.user) {
      // If action requires auth, but user isn't logged in, the request is not authorized
      // For routes using the `auth.main` middleware, this is called early, but not for routes with `auth.optional`.
      if (throwError) {
        throw new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT.")
      }
      return false
    }

    whitelist = whitelist ?? config[type]?.[action]?.identities
    providers = providers ?? config[type]?.[action]?.identityProviders

    if (whitelist && _.intersection(whitelist, this.uris).length == 0) {
      if (throwError) {
        throw new ForbiddenAccessError("Access forbidden. A whitelist is in place, but authenticated user is not on the whitelist.")
      }
      return false
    }

    if (providers && _.intersection(providers, this.userProviders).length == 0) {
      if (throwError) {
        throw new ForbiddenAccessError("Access forbidden, missing identity provider. One of the following providers is necessary: " + providers.join(", "))
      }
      return false
    }

    return true
  }

  next()
}

let optional = [], auth = (req, res, next) => {
  next(new ForbiddenAccessError("Access forbidden. No authentication configured."))
}

// Prepare authorization via JWT
if (config.auth.algorithm && config.auth.key) {
  const opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.auth.key,
    algorithms: [config.auth.algorithm],
  }
  try {
    passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
      done(null, jwt_payload.user)
    }))
    // Use like this: app.get("/secureEndpoint", auth.main, (req, res) => { ... })
    // res.user will contain the current authorized user.
    auth = (req, res, next) => {
      passport.authenticate("jwt", { session: false }, (error, user) => {
        if (error || !user) {
          return next(new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT."))
        }
        req.user = user
        return next()
      })(req, res, next)
    }
    optional.push("jwt")
  } catch(error) {
    config.error("Error setting up JWT authentication")
  }
} else {
  config.warn("Note: To provide authentication via JWT, please add `auth.algorithm` and `auth.key` to the configuration file!")
}

// Configure identities whitelists and identity providers
auth = [auth, authPreparation, (req, res, next) => {

  let whitelist, providers, type, action

  if (req.type == "checkAuth") {
    ({ type, action } = req.query || {})
    if (type && action && config[type][action]) {
      whitelist = config[type][action].identities
      providers = config[type][action].identityProviders
    } else {
      whitelist = config.identities
      providers = config.identityProviders
    }
  }

  try {
    req.isAuthorizedFor({ type, action, whitelist, providers, throwError: true })
    next()
  } catch (error) {
    next(error)
  }

}]

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
passport.use(new AnonymousStrategy())
optional.push("anonymous")
const authOptional = [passport.authenticate(optional, { session: false }), authPreparation]

export {
  auth as main,
  authOptional as optional,
}
