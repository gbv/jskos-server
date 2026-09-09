import passport from "passport"
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import { Strategy as AnonymousStrategy } from "passport-anonymous"

passport.use(new AnonymousStrategy())

import { expandIdentities } from "./users.js"
import { ForbiddenAccessError } from "../errors/index.js"
import allTypes from "../utils/types.js"


export class Authenticator {
  static actions = {
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  }

  constructor(config) {
    this.config = config // auth, [type], identityGroups
    const optional = []

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
      optional.push(name)

      this.requiredAuth = (req, res, next) => {
        passport.authenticate(name, { session: false }, (error, user) => {
          if (error || !user) {
            return next(new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT."))
          }
          req.user = user
          return next()
        })(req, res, next)
      }
    } else {
      this.requiredAuth = (req, res, next) =>
        next(new ForbiddenAccessError("Access forbidden. No authentication configured."))
    }

    // Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
    optional.push("anonymous")
    this.optionalAuth = (req, res, next) => {
      passport.authenticate(optional, { session: false }, (error, user) => {
        if (!error && user) {
          req.user = user
        }
        return next()
      })(req, res, next)
    }
  }

  /**
   * Checks if action on type is allowed, throws an execption otherwise.
   */
  checkAccess({ type, action, user }) {
    const config = this.config

    if (!config[type]?.[action]?.auth) {
      // If action does not require auth at all, the request is authorized
      return true
    } else if (!user) {
      // If action requires auth, but user isn't logged in, the request is not authorized
      // For routes using the `auth.main` middleware, this is called early, but not for routes with `auth.optional`.
      throw new ForbiddenAccessError("Access forbidden. Could not authenticate via JWT.")
    }

    const whitelist = expandIdentities(config[type]?.[action]?.identities, config.identityGroups)
    const providers = config[type]?.[action]?.identityProviders

    const uris = [user.uri].concat(Object.values(user.identities || {}).map(id => id.uri)).filter(Boolean)

    if (whitelist && !whitelist.some(uri => uris.includes(uri))) {
      throw new ForbiddenAccessError("Access forbidden. A whitelist is in place, but authenticated user is not on the whitelist.")
    }

    if (providers && !Object.keys(user.identities || {}).some(uri => providers.includes(uri))) {
      throw new ForbiddenAccessError("Access forbidden, missing identity provider. One of the following providers is necessary: " + providers.join(", "))
    }

    return true
  }

  /**
   * Returns middleware for required authentication, if enabled.
   */
  authenticate(required) {
    if (required) {
      return [
        this.requiredAuth,
        (req, res, next) => {
          try {
            this.checkAccess({
              type: req.type,
              action: Authenticator.actions[req.method] || "read",
              user: req.user,
            })
            next()
          } catch (error) {
            next(error)
          }
        },
      ]
    } else {
      return []
    }
  }

  checkAuth() {
    return [
      this.optionalAuth,
      (req, res, next) => {
        const { type, action } = req.query || {}
        const user = req.user
        if (type && action) {
          try {
            this.checkAccess({ type, action, user })
            next()
          } catch (error) {
            next(error)
          }
        } else {
          res.access = {}
          for (let t of type ? [type] : allTypes) {
            if (this.config[t]) {
              res.access[t] = {}
              for (let a of action ? [action] : ["read", "create", "update", "delete"]) {
                try {
                  this.checkAccess({ type: t, action: a, user })
                  res.access[t][a] = true
                } catch {
                  res.access[t][a] = false
                }
              }
            }
          }
          next()
        }
      },
    ]
  }
}
