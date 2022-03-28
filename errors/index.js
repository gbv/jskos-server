/**
 * Errors.
 *
 * If possible, provide a more detailed error message when one of these errors is used.
 */

class EntityNotFoundError extends Error {
  constructor(message, id) {
    message = message || `The requested entity ${id} could not be found.`
    super(message)
    this.statusCode = 404
  }
}

class MalformedBodyError extends Error {
  constructor(message) {
    message = message || "The body of the request is malformed."
    super(message)
    this.statusCode = 400
  }
}

class MalformedRequestError extends Error {
  constructor(message) {
    message = message || "The request is malformed (missing parameter etc.)."
    super(message)
    this.statusCode = 400
  }
}

class DuplicateEntityError extends Error {
  constructor(message, id) {
    message = message || `The entity ${id} already exists in the database.`
    super(message)
    this.statusCode = 422
  }
}

class InvalidBodyError extends Error {
  constructor(message) {
    message = message || "The body of the request is well formed, but could not be validated."
    super(message)
    this.statusCode = 422
  }
}

class CreatorDoesNotMatchError extends Error {
  constructor(message) {
    message = message || "Access to this ressource is not allowed for you (but might be for other users)."
    super(message)
    this.statusCode = 403
  }
}

class DatabaseAccessError extends Error {
  constructor(message) {
    message = message || "There was an error accessing the database. Please try again later."
    super(message)
    this.statusCode = 500
  }
}

class DatabaseInconsistencyError extends Error {
  constructor(message) {
    if (message) {
      message += " Please contact us with this error message at coli-conc@gbv.de or open an issue on GitHub. Thanks!"
    } else {
      message = "There was an inconsistency error with the database. Please try again later."
    }
    super(message)
    this.statusCode = 500
  }
}

class ConfigurationError extends Error {
  constructor(message) {
    message = message || "There was an error with the server configuration. Please contact the server administrator and try again later."
    super(message)
    this.statusCode = 500
  }
}

class ForbiddenAccessError extends Error {
  constructor(message) {
    message = message || "Access is forbidden."
    super(message)
    this.statusCode = 403
  }
}

module.exports = {
  EntityNotFoundError,
  MalformedBodyError,
  MalformedRequestError,
  DuplicateEntityError,
  InvalidBodyError,
  CreatorDoesNotMatchError,
  DatabaseAccessError,
  DatabaseInconsistencyError,
  ConfigurationError,
  ForbiddenAccessError,
}
