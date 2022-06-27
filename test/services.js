const jskos = require("jskos-tools")
const _ = require("lodash")
const assert = require("assert")

const { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, arrayToStream } = require("./test-utils")

const services = {
  scheme: require("../services/schemes"),
  concept: require("../services/concepts"),
  concordance: require("../services/concordances"),
  mapping: require("../services/mappings"),
  annotation: require("../services/annotations"),
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
          uri: "mapping:1",
        },
        {
          uri: "mapping:2",
        },
        {
          uri: "mapping:3",
        },
        {
          to: { memberSet: [{ uri: "test:concept" }] },
          uri: "mapping:4",
        },
        {
          uri: "mapping:5",
        },
      ].map(mapping => {
        // Add fromScheme and toScheme
        mapping.fromScheme = { uri: "test:fromScheme" }
        mapping.toScheme = { uri: "test:toScheme" }
        // Add from if necessary
        if (!mapping.from) {
          mapping.from = { memberSet: [{ uri: "test:fromConcept" }] }
        }
        // Add empty to if necessary
        if (!mapping.to) {
          mapping.to = { memberSet: [] }
        }
        return mapping
      })
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

      it("should get correct number of mappings when using annotatedFor param with value `any`", async () => {
        const annotatedFor = "any"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor })
        const expected = _.uniq(annotations.map(a => a.target)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedFor param with value `none`", async () => {
        const annotatedFor = "none"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor })
        const expected = mappings.map(m => m.uri).filter(uri => !annotations.find(a => a.target === uri)).sort()
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected)
      })

      it("should get correct number of mappings when using annotatedFor param with negative value", async () => {
        const annotatedFor = "!assessing"
        const result = await services.mapping.getMappings({ limit: 10, offset: 0, annotatedFor })
        const expected = mappings.map(m => m.uri).filter(uri => !annotations.find(a => a.target === uri && a.motivation === annotatedFor.slice(1))).sort()
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
