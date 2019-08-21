/**
 * Module that prepares authentication middleware via Passport.
 *
 * Exports an object { default, optional } with default and optional authentication.
 * Optional authentication should be used if `auth` is set to `false` for a particular endpoint.
 * For example: app.get("/mappings", config.mappings.read.auth ? auth.default : auth.optional, (req, res) => { ... })
 * req.user will cointain the user if authorized, otherwise stays undefined.
 */

const config = require("../config")
const _ = require("lodash")
const { ForbiddenAccessError } = require("../errors")

const passport = require("passport")

let optional = [], auth = null

// Prepare authorization via JWT
if (config.auth.algorithm && config.auth.key) {
  const JwtStrategy = require("passport-jwt").Strategy,
    ExtractJwt = require("passport-jwt").ExtractJwt
  var opts = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.auth.key,
    algorithms: [config.auth.algorithm],
  }
  try {
    passport.use(new JwtStrategy(opts, (jwt_payload, done) => {
      done(null, jwt_payload.user)
    }))
    // Use like this: app.get("/secureEndpoint", auth.default, (req, res) => { ... })
    // res.user will contain the current authorized user.
    auth = passport.authenticate("jwt", { session: false })
    optional.push("jwt")
  } catch(error) {
    config.error("Error setting up JWT authentication")
  }
} else {
  config.warn("Note: To provide authentication via JWT, please add `auth.algorithm` and `auth.key` to the configuration file!")
  // Deny all requests
  auth = (req, res) => {
    res.sendStatus(403)
  }
}

// Configure identities whitelists and identity providers
auth = [auth, (req, res, next) => {

  // Assemble user URIs
  let uris = [req.user.uri].concat(Object.values(req.user.identities || {}).map(id => id.uri)).filter(uri => uri != null)
  // User providers
  let userProviders = Object.keys((req.user && req.user.identities) || {})

  // Find whitelist to use depending on method (req.method) and endpoint (req.type)
  let whitelist, providers, action
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
    whitelist = config[req.type][action].identities
    providers = config[req.type][action].identityProviders
  }
  if (req.type == "checkAuth") {
    whitelist = config.identities
    providers = config.identityProviders
  }

  if (whitelist && _.intersection(whitelist, uris).length == 0) {
    // Deny request
    next(new ForbiddenAccessError("Access forbidden. A whitelist is in place, but authenticated user is not on the whitelist."))
  } else if (providers && _.intersection(providers, userProviders).length == 0) {
    // Deny request
    next(new ForbiddenAccessError("Access forbidden, missing identity provider. One of the following providers is necessary: " + providers.join(", ")))
  } else {
    next()
  }

}]

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
const AnonymousStrategy = require("passport-anonymous").Strategy
passport.use(new AnonymousStrategy())
optional.push("anonymous")
const authOptional = passport.authenticate(optional, { session: false })

module.exports = {
  default: auth,
  optional: authOptional,
}
