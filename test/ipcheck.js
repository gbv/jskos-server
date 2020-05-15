const proxyquire =  require("proxyquire").noCallThru()
const assert = require("assert")
const { ForbiddenAccessError } = require("../errors")

describe("IP Check Middleware", () => {

  it("should allow all requests if no IPs are given", (done) => {
    const config = {
      mappings: {
        read: {},
      },
    }
    const ipcheck = proxyquire("../utils/ipcheck", {
      "../config": config,
    })
    let count = 0
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert.equal(error, undefined)
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should allow a single IP address", (done) => {
    const config = {
      mappings: {
        read: {
          ips: ["1.2.3.4"],
        },
      },
    }
    const ipcheck = proxyquire("../utils/ipcheck", {
      "../config": config,
    })
    let count = 0
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly recognize IPv6 loopback address", (done) => {
    const config = {
      mappings: {
        read: {
          ips: ["127.0.0.1"],
        },
      },
    }
    const ipcheck = proxyquire("../utils/ipcheck", {
      "../config": config,
    })
    let count = 0
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly handle CIDR ranges", (done) => {
    const config = {
      mappings: {
        read: {
          ips: ["192.168.0.1/24"],
        },
      },
    }
    const ipcheck = proxyquire("../utils/ipcheck", {
      "../config": config,
    })
    let count = 0
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

  it("should correctly handle multiple ranges and addresses", (done) => {
    const config = {
      mappings: {
        read: {
          ips: ["192.168.1.1/24", "127.0.0.1", "1.2.3.4"],
        },
      },
    }
    const ipcheck = proxyquire("../utils/ipcheck", {
      "../config": config,
    })
    let count = 0
    const tests = [
      {
        req: {
          method: "GET",
          type: "mappings",
          ip: null,
        },
        next: (error) => {
          assert(error instanceof ForbiddenAccessError)
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
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
          count += 1
          if (count == tests.length) {
            done()
          }
        },
      },
    ]
    for (let { req, next } of tests) {
      ipcheck(req, null, next)
    }
  })

})
