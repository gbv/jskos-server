/**
 * Module that prepares authentication middleware via Passport.
 *
 * Exports an object { default, optional } with default and optional authentication.
 * Optional authentication can be used for POST /mappings if `config.auth.postAuthRequired` is set.
 * For example: app.get("/optionallySecureEndpoint", config.auth.postAuthRequired ? auth.default : auth.optional, (req, res) => { ... })
 * req.user will cointain the user if authorized, otherwise stays undefined.
 */

const config = require("../config")
const _ = require("lodash")

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

if (config.auth.whitelist) {
  config.log("Auth whitelist configured:", config.auth.whitelist)
  auth = [auth, (req, res, next) => {
    // Check if any of user's URIs is on the whitelist
    let uris = [req.user.uri].concat(Object.values(req.user.identities || {}).map(id => id.uri)).filter(uri => uri != null)
    if (_.intersection(config.auth.whitelist, uris).length == 0) {
      // Deny request
      res.sendStatus(403)
    } else {
      next()
    }
  }]
}

// Also use anonymous strategy for endpoints that can be used authenticated or not authenticated
const AnonymousStrategy = require("passport-anonymous").Strategy
passport.use(new AnonymousStrategy())
optional.push("anonymous")
const authOptional = passport.authenticate(optional, { session: false })

module.exports = {
  default: auth,
  optional: authOptional,
}
