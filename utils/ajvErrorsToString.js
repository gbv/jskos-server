module.exports = function ajvErrorsToString(errors) {
  let message = ""
  for (let error of errors || []) {
    switch (error.keyword) {
      case "additionalProperties":
        message += `${error.dataPath} ${error.message} (${error.params.additionalProperty})`
        break
      default:
        message += `${error.dataPath} ${error.message} (${error.schemaPath})`
    }
    message += "\n      "
  }
  return message.trimEnd()
}
