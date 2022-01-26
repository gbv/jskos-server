const validate = require("jskos-validate")
const { guessObjectType } = require("jskos-tools")
const Container = require("typedi").Container
const schemeService = Container.get(require("../services/schemes"))

module.exports = class ValidateService {

  async validate(data, { unknownFields, type, knownSchemes = false } = {}) {
    let returnArray = true
    if (!Array.isArray(data)) {
      returnArray = false
      data = [data]
    }

    // additional parameters (optional)
    type = (guessObjectType(type, true) || "").toLowerCase()

    let schemes
    if (knownSchemes) {
      // Get schemes from schemeService
      schemes = await schemeService.getSchemes({})
    }
    const validator = type ? validate[type] : validate

    const result = data.map(item => {
      const result = validator(item, { unknownFields, schemes })
      return result ? true : validator.errors
    })

    return returnArray ? result : result[0]
  }

}
