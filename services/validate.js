const validate = require("jskos-validate")
const { guessObjectType } = require("jskos-tools")
const Container = require("typedi").Container
const schemeService = Container.get(require("../services/schemes"))

module.exports = class ValidateService {

  async validate(data, { unknownFields, type, knownSchemes = false } = {}) {
    if (!Array.isArray(data)) {
      data = [data]
    }

    // additional parameters (optional)
    type = (guessObjectType(type, true) || "").toLowerCase()

    const rememberSchemes = type ? null : []
    if (knownSchemes) {
      // Get schemes from schemeService
      knownSchemes = await schemeService.getSchemes({})
      type = "concept"
    }
    const validator = type ? validate[type] : validate

    const result = data.map(item => {
      const result = validator(item, { unknownFields, knownSchemes, rememberSchemes })
      return result ? true : validator.errors
    })

    return result
  }

}
