/**
 * Module that prepares authentication middleware via Passport.
 *
 * Exports a function that return default or optional authentication.
 * Optional authentication should be used if `auth` is set to `false` for a particular endpoint.
 * For example: app.get("/mappings", useAuth(config.mappings.read.auth), (req, res) => { ... })
 * req.user will cointain the user if authorized, otherwise stays undefined.
 */

import _ from "lodash"
import { ForbiddenAccessError } from "../errors/index.js"

import config from "../config/index.js"

import passport from "passport"
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { Strategy as AnonymousStrategy } from "passport-anonymous"

passport.use(new AnonymousStrategy())

const actions = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
}

// Add some properties and methods related to authentication
// This middleware is added to both auth.main and auth.optional
const authPreparation = (req, res, next) => {
  // Add action
  req.action = actions[req.method] || "read"

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

    if (whitelist === undefined) {
      whitelist = expandWhiteList(config[type]?.[action]?.identities, config.identityGroups)
    }
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

function expandWhiteList(whitelist, identityGroups) {
  if (whitelist && identityGroups) {
    return whitelist.map(uri => uri in identityGroups ? identityGroups[uri].identities : uri).flat()
  }
  return whitelist
}

let optional = []
let auth = (req, res, next) => {
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
    const strategy = new JwtStrategy(opts, (jwt_payload, done) => done(null, jwt_payload.user))
    const strategyName = "jwt" // TODO: derive strategyName from opts

    passport.use(strategyName, strategy)
    optional.push(strategyName)

    // Use like this: app.get("/secureEndpoint", auth, (req, res) => { ... })
    // res.user will contain the current authorized user.
    auth = (req, res, next) => {
      passport.authenticate(strategyName, { session: false }, (error, user) => {
        if (error || !user) {
          return next(new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT."))
        }
        req.user = user
        return next()
      })(req, res, next)
    }
  } catch(error) {
    config.error("Error setting up JWT authentication")
  }
} else {
  config.warn("Note: To provide authentication via JWT, please add `auth.algorithm` and `auth.key` to the configuration file!")
}

// Configure identities whitelists and identity providers
const authAuthorize = (req, res, next) => {
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

  whitelist = expandWhiteList(whitelist, config.identityGroups)

  try {
    req.isAuthorizedFor({ type, action, whitelist, providers, throwError: true })
    next()
  } catch (error) {
    next(error)
  }
}

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
optional.push("anonymous")

export const useAuth = required => required
  ? [auth, authPreparation, authAuthorize]
  : [passport.authenticate(optional, { session: false }), authPreparation]
