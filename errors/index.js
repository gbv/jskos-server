/**
 * Errors.
 *
 * If possible, provide a more detailed error message when one of these errors is used.
 */

class EntityNotFoundError extends Error {
  constructor(...args) {
    args[0] = args[0] || "The requested entity could not be found."
    super(...args)
    this.statusCode = 404
  }
}

class MalformedBodyError extends Error {
  constructor(...args) {
    args[0] = args[0] || "The body of the request is malformed."
    super(...args)
    this.statusCode = 400
  }
}

class MalformedRequestError extends Error {
  constructor(...args) {
    args[0] = args[0] || "The request is malformed (missing parameter etc.)."
    super(...args)
    this.statusCode = 400
  }
}

class InvalidBodyError extends Error {
  constructor(...args) {
    args[0] = args[0] || "The body of the request is well formed, but could not be validated."
    super(...args)
    this.statusCode = 422
  }
}

class CreatorDoesNotMatchError extends Error {
  constructor(...args) {
    args[0] = args[0] || "Access to this ressource is not allow for you (but might for others)."
    super(...args)
    this.statusCode = 403
  }
}

class DatabaseAccessError extends Error {
  constructor(...args) {
    args[0] = args[0] || "There was an error accessing the database."
    super(...args)
    this.statusCode = 500
  }
}

module.exports = {
  EntityNotFoundError,
  MalformedBodyError,
  MalformedRequestError,
  InvalidBodyError,
  CreatorDoesNotMatchError,
  DatabaseAccessError,
}
