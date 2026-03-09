import _ from "lodash"

import passport from "passport"
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { Strategy as AnonymousStrategy } from "passport-anonymous"

passport.use(new AnonymousStrategy())

function expandWhiteList(whitelist, identityGroups) {
  if (whitelist && identityGroups) {
    return whitelist.map(uri => uri in identityGroups ? identityGroups[uri].identities : uri).flat()
  }
  return whitelist
}

import { ForbiddenAccessError } from "../errors/index.js"


export class Authenticator {
  static actions = {
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  }

  constructor(config) {
    this.optional = []
    this.config = config // auth, [type], identityGroups

    // Prepare authorization via JWT
    if (config.auth) {
      const { algorithm, key } = config.auth

      const strategy = new JwtStrategy({
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: key,
        algorithms: [algorithm],
      }, (jwt_payload, done) => done(null, jwt_payload.user))

      // unique name derived from configuration, to avoid overwriting strategies can be registered globally
      const hash = `${algorithm}${key}`.split("").reduce((a,b) => (((a << 5) - a) + b.charCodeAt(0))|0, 0).toString(16)
      const name = `jwt-${hash}`

      passport.use(name, strategy)
      this.optional.push(name)

      this.auth = (req, res, next) => {
        passport.authenticate(name, { session: false }, (error, user) => {
          if (error || !user) {
            return next(new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT."))
          }
          req.user = user
          return next()
        })(req, res, next)
      }
    }

    // Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
    this.optional.push("anonymous")
  }

  /**
   * Checks if action on type is allowed, throws an execption otherwise.
   */
  checkAccess({ type, action, whitelist, providers, user }) {
    const config = this.config

    if (!config[type]?.[action]?.auth && type !== "checkAuth") {
      // If action does not require auth at all, the request is authorized
      return true
    } else if (!user) {
      // If action requires auth, but user isn't logged in, the request is not authorized
      // For routes using the `auth.main` middleware, this is called early, but not for routes with `auth.optional`.
      throw new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT.")
    }

    if (whitelist === undefined) {
      whitelist = expandWhiteList(config[type]?.[action]?.identities, config.identityGroups)
    }
    providers = providers ?? config[type]?.[action]?.identityProviders

    const uris = [user.uri].concat(Object.values(user.identities || {}).map(id => id.uri)).filter(Boolean)
    if (whitelist && _.intersection(whitelist, uris).length == 0) {
      throw new ForbiddenAccessError("Access forbidden. A whitelist is in place, but authenticated user is not on the whitelist.")
    }

    if (providers && !_.intersection(providers, Object.keys(user?.identities || {})).length) {
      throw new ForbiddenAccessError("Access forbidden, missing identity provider. One of the following providers is necessary: " + providers.join(", "))
    }

    return true
  }

  /**
   * Returns middleware for required or optional authentication.
   */
  authenticate(required) {
    if (required) {
      const auth = this.auth || ((req, res, next) => {
        next(new ForbiddenAccessError("Access forbidden. No authentication configured."))
      })
      return [
        auth, // sets req.user on success
        (req, res, next) => this._authAuthorize(req, res, next),
      ]
    } else {
      return [passport.authenticate(this.optional, { session: false })]
    }
  }

  _authAuthorize(req, res, next) {
    let whitelist, providers

    let action = Authenticator.actions[req.method] || "read"
    let type = req.type

    if (req.type == "checkAuth") {
      ({ type, action } = req.query || {})
      if (type && action && this.config[type][action]) {
        whitelist = this.config[type][action].identities
        providers = this.config[type][action].identityProviders
      } else {
        whitelist = this.config.identities
        providers = this.config.identityProviders
      }
    }

    whitelist = expandWhiteList(whitelist, this.config.identityGroups)

    try {
      type = type || req.type
      action = action || "read"
      this.checkAccess({ type, action, whitelist, providers, user: req.user })
      next()
    } catch (error) {
      next(error)
    }
  }
}
