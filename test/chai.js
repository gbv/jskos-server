// Setup chai and plugins

import * as chaiModule from "chai"

import chaiAsPromised from "chai-as-promised"
chaiModule.use(chaiAsPromised)

import chaiHttp from "chai-http"
const chai = chaiModule.use(chaiHttp)

// eslint-disable-next-line no-unused-vars
const should = chai.should()

export default chai
