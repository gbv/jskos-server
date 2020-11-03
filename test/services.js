const jskos = require("jskos-tools")
const _ = require("lodash")
const assert = require("assert")

const { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, arrayToStream } = require("./test-utils")

const Container = require("typedi").Container
const services = {
  scheme: Container.get(require("../services/schemes")),
  concept: Container.get(require("../services/concepts")),
  concordance: Container.get(require("../services/concordances")),
  mapping: Container.get(require("../services/mappings")),
  annotation: Container.get(require("../services/annotations")),
}

describe("Services", () => {
  assertMongoDB()
  dropDatabaseBeforeAndAfter()
  assertIndexes()

  Object.keys(services).forEach(type => {
    const method = "get" + type.charAt(0).toUpperCase() + type.slice(1) + "s"
    it(`should return an empty array for ${method}`, async () => {
      const entities = await services[type][method]({ limit: 1, offset: 0 })
      assert.strictEqual(entities.length, 0)
    })

  })

  describe("Mapping Service", () => {

    describe("filter mappings by annotations", () => {
      const mappings = [
        {
          from: { memberSet: [] },
          to: { memberSet: [] },
          uri: "mapping:1",
        },
        {
          from: { memberSet: [] },
          to: { memberSet: [] },
          uri: "mapping:2",
        },
        {
          from: { memberSet: [] },
          to: { memberSet: [] },
          uri: "mapping:3",
        },
        {
          from: { memberSet: [] },
          to: { memberSet: [{ uri: "test:concept" }] },
          uri: "mapping:4",
        },
        {
          from: { memberSet: [] },
          to: { memberSet: [] },
          uri: "mapping:5",
        },
      ]
      const annotations = [
        {
          target: "mapping:1",
          motivation: "assessing",
          bodyValue: "+1",
        },
        {
          target: "mapping:1",
          motivation: "assessing",
          bodyValue: "-1",
        },
        {
          target: "mapping:2",
          motivation: "moderating",
          creator: {
            id: "test:creator",
          },
        },
        {
          target: "mapping:3",
          motivation: "moderating",
        },
        {
          target: "mapping:4",
          motivation: "assessing",
          bodyValue: "+1",
        },
      ]

      it("should post mappings and annotations used for tests", async () => {
        let result
        // Mappings
        result = await services.mapping.postMapping({ bodyStream: await arrayToStream(mappings) })
        assert.strictEqual(result.length, mappings.length)
        mappings.forEach(mapping => {
          // Find corresponding mapping and set identifier/uri
          const corresponding = result.find(m => jskos.compare(m, mapping))
          assert.ok(!!corresponding)
          mapping.identifier = corresponding.identifier
          mapping.uri = corresponding.uri
        })
        // Annotations
        // First adjust targets with actual URIs
        annotations.forEach(annotation => {
          const mapping = mappings.find(m => jskos.compare(m, { uri: annotation.target }))
          assert.ok(!!mapping)
          annotation.target = mapping.uri
        })
        result = await services.annotation.postAnnotation({ bodyStream: await arrayToStream(annotations), admin: true })
        assert.strictEqual(result.length, annotations.length)
      })

      it("should get correct number of mappings when using annotatedWith param", async () => {
        const annotatedWith = "-1"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedWith })
        const expected = _.uniq(annotations.filter(a => a.bodyValue === annotatedWith).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedFor param", async () => {
        const annotatedFor = "assessing"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor })
        const expected = _.uniq(annotations.filter(a => a.motivation === annotatedFor).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedBy param", async () => {
        const annotatedBy = "test:creator|other:uri"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedBy })
        const expected = _.uniq(annotations.filter(a => annotatedBy.split("|").includes(_.get(a, "creator.id"))).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedFor together with annotatedBy", async () => {
        let result, expected
        const annotatedFor = "moderating"
        // First only annotatedFor
        result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor })
        expected = _.uniq(annotations.filter(a => a.motivation === annotatedFor).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
        // Then with annotatedBy
        const annotatedBy = "test:creator|other:uri"
        result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor, annotatedBy })
        expected = _.uniq(annotations.filter(a => annotatedBy.split("|").includes(_.get(a, "creator.id")) && a.motivation === annotatedFor).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedWith together with to", async () => {
        let result, expected
        const annotatedWith = "+1"
        // First only annotatedWith
        result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedWith })
        expected = _.uniq(annotations.filter(a => a.bodyValue === annotatedWith).map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
        // Then with to
        const to = "test:concept"
        result = await services.mapping.getMappings({ limit: 10, offset: 0, to, annotatedWith })
        expected = mappings.filter(m => jskos.isContainedIn({ uri: to }, jskos.conceptsOfMapping(m, "to")) && annotations.find(a => a.target === m.uri && a.bodyValue === annotatedWith))
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected.map(r => r.uri).sort())
      })

    })

  })

})
