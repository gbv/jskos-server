// remove object properties when its value is null
const removeNullProperties = obj => Object.keys(obj).filter(key => obj[key] === null).forEach(key => delete obj[key])

export {
  removeNullProperties,
}
