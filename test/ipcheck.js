import esmock from "esmock"
import assert from "assert"
import { ForbiddenAccessError } from "../errors/index.js"

const baseConfig = {
  log: () => {},
  warn: () => {},
  error: () => {},
}

async function getIpCheck(config) {
  return (await esmock("../utils/ipcheck.js", {
    "../config/index.js": Object.assign({}, baseConfig, config),
  })).ipcheck
}

describe("IP Check Middleware", () => {

  it("should allow all requests if no IPs are given", async () => {
    const config = {
      mappings: {
        read: {},
      },
    }
    const ipcheck = await getIpCheck(config)
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "127.0.0.1",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should allow a single IP address", async () => {
    const config = {
      mappings: {
        read: {
          ips: ["1.2.3.4"],
        },
      },
    }
    const ipcheck = await getIpCheck(config)
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "127.0.0.1",
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "1.2.3.4",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly recognize IPv6 loopback address", async () => {
    const config = {
      mappings: {
        read: {
          ips: ["127.0.0.1"],
        },
      },
    }
    const ipcheck = await getIpCheck(config)
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "127.0.0.1",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "::1",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly handle CIDR ranges", async () => {
    const config = {
      mappings: {
        read: {
          ips: ["192.168.0.1/24"],
        },
      },
    }
    const ipcheck = await getIpCheck(config)
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "127.0.0.1",
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "192.168.0.5",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "192.168.0.254",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "192.168.1.1",
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly handle multiple ranges and addresses", async () => {
    const config = {
      mappings: {
        read: {
          ips: ["192.168.1.1/24", "127.0.0.1", "1.2.3.4"],
        },
      },
    }
    const ipcheck = await getIpCheck(config)
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "127.0.0.1",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "1.2.3.4",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "1.2.3.5",
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "192.168.0.5",
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
        },
      },
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: "192.168.1.1",
        },
        next: (error) => {
          assert.equal(error, undefined)
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

})
