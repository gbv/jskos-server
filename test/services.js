import jskos from "jskos-tools"
import _ from "lodash"
import assert from "node:assert"

import { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, arrayToStream } from "./test-utils.js"

import { InvalidBodyError } from "../errors/index.js"

import { byType as services } from "../services/index.js"

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

  describe("Concordance Service", () => {

    const fromScheme = { uri: "test:fromScheme" }
    const toScheme = { uri: "test:toScheme" }

    it("should post schemes for testing concordances", async () => {
      await services.scheme.postScheme({ bodyStream: await arrayToStream([fromScheme, toScheme]) })
    })

    it("should post a concordance with a named contributor, then remove the contributor name, then remove the contributor", async () => {
      const concordance = {
        fromScheme,
        toScheme,
        contributor: [{
          uri: "test:user",
          prefLabel: { de: "test" },
        }],
      }
      const [postedConcordance] = await services.concordance.postConcordance({ bodyStream: await arrayToStream([concordance]) })
      const patch = {
        contributor: [{
          uri: "test:user",
        }],
      }
      const patchedConcordance = await services.concordance.patchConcordance({ body: patch, existing: postedConcordance.toObject() })
      assert.ok(!patchedConcordance.contributor[0].prefLabel, "PATCH requests should merge objects only on the top level.")
      const patch2 = {
        contributor: null,
      }
      const patchedConcordance2 = await services.concordance.patchConcordance({ body: patch2, existing: patchedConcordance })
      assert.ok(patchedConcordance2.contributor === undefined, "A field should be removed when set to `null`.")
    })

    for (const scheme of [fromScheme, toScheme]) {
      it("should delete scheme after testing concordances", async () => {
        scheme._id = scheme.uri
        scheme.concepts = []
        await services.scheme.deleteScheme({ uri: scheme.uri, existing: scheme })
      })
    }

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
          to: { memberSet: [{ uri: "urn:test:concept" }] },
          uri: "mapping:4",
        },
        {
          uri: "mapping:5",
        },
      ].map(mapping => {
        // Add fromScheme and toScheme
        mapping.fromScheme = { uri: "urn:test:fromScheme" }
        mapping.toScheme = { uri: "urn:test:toScheme" }
        // Add from if necessary
        if (!mapping.from) {
          mapping.from = { memberSet: [{ uri: "urn:test:fromConcept" }] }
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
            id: "urn:test:creator",
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

      it("should get the correct mappings when using annotatedWith param with comparison operator", async () => {
        for (let { from, to, annotatedWith } of [
          { to: "urn:test:concept", annotatedWith: ">=1" },
          { from: "urn:test:fromConcept", annotatedWith: "=0" },
        ]) {
          const result = await services.mapping.getMappings({ limit: 100, offset: 0, from, to, annotatedWith })
          // Replace = with == for later evaluation
          if (annotatedWith.startsWith("=")) {
            annotatedWith = `=${annotatedWith}`
          }
          const expected = mappings.filter(m => {
            if (from && from !== _.get(m, "from.memberSet[0].uri") || to && to !== _.get(m, "to.memberSet[0].uri")) {
              return false
            }
            const annotationSum = annotations.filter(a => a.target === m.uri).reduce((prev, cur) => {
              if (cur.motivation !== "assessing") {
                return prev
              }
              return prev + parseInt(cur.bodyValue)
            }, 0)
            return Function(`"use strict";return (${annotationSum}${annotatedWith})`)()
          })
          assert.deepStrictEqual(result.map(r => r.uri).sort(), expected.map(e => e.uri).sort())
        }
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
        const annotatedBy = "urn:test:creator|urn:other:uri"
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
        const annotatedBy = "urn:test:creator|urn:other:uri"
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
        const to = "urn:test:concept"
        result = await services.mapping.getMappings({ limit: 10, offset: 0, to, annotatedWith })
        expected = mappings.filter(m => jskos.isContainedIn({ uri: to }, jskos.conceptsOfMapping(m, "to")) && annotations.find(a => a.target === m.uri && a.bodyValue === annotatedWith))
        assert.deepStrictEqual(result.map(r => r.uri).sort(), expected.map(r => r.uri).sort())
      })

      it("should reject mappings without fromScheme/toScheme", async () => {
        for (const mapping of [
          {
            from: {
              memberSet: [{
                uri: "urn:test:concept",
              }],
            },
            to: {
              memberSet: [{
                uri: "urn:test:concept",
              }],
            },
            toScheme: { uri: "urn:test:toScheme" },
          },
          {
            from: {
              memberSet: [{
                uri: "urn:test:concept",
              }],
            },
            fromScheme: { uri: "urn:test:fromScheme" },
            to: {
              memberSet: [{
                uri: "urn:test:concept",
              }],
            },
          },
        ]) {
          try {
            await services.mapping.postMapping({ bodyStream: await arrayToStream([mapping]) })
            assert.fail("Expected postMapping to fail")
          } catch (error) {
            assert.ok(error instanceof InvalidBodyError)
          }
        }
      })

      it("should add fromScheme and toScheme fields from concepts' inScheme property", async () => {
        const mapping = {
          from: {
            memberSet: [{
              uri: "urn:test:concept",
              inScheme: [{ uri: "urn:test:fromScheme" }],
            }],
          },
          to: {
            memberSet: [{
              uri: "urn:test:concept",
              inScheme: [{ uri: "urn:test:toScheme" }],
            }],
          },
        }
        const postedMapping = (await services.mapping.postMapping({ bodyStream: await arrayToStream([mapping]) }))?.[0]
        assert.deepStrictEqual(postedMapping.fromScheme?.uri, mapping.from.memberSet[0].inScheme[0].uri)
        assert.deepStrictEqual(postedMapping.toScheme?.uri, mapping.to.memberSet[0].inScheme[0].uri)
      })
    })

  })

  describe("Annotation Service", () => {

    const mismatchTagScheme = {
      uri: "https://uri.gbv.de/terminology/mismatch/",
    }
    const mismatchTagConcept = {
      uri: "https://uri.gbv.de/terminology/mismatch/test",
      inScheme: [{uri: "https://uri.gbv.de/terminology/mismatch/"}],
    }

    it("should post tag mismatch scheme and concepts", async () => {
      await services.scheme.postScheme({ bodyStream: await arrayToStream([mismatchTagScheme]) })
      await services.concept.postConcept({ bodyStream: await arrayToStream([mismatchTagConcept]) })
      const concept = await services.concept.get(mismatchTagConcept.uri)
      assert.strictEqual(concept?.uri, mismatchTagConcept.uri)
    })

    it("should post negative assessment annotation that is correctly tagged", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "-1",
        body: [
          {
            type: "SpecificResource",
            value: mismatchTagConcept.uri,
            purpose: "tagging",
          },
        ],
      }
      const results = await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
      assert.ok(results?.[0]?.id)
    })

    it("should not post negative assessment annotation that is correctly tagged with a URI that is not explicitly allowed", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "-1",
        body: [
          {
            type: "SpecificResource",
            value: mismatchTagConcept.uri + "2",
            purpose: "tagging",
          },
        ],
      }
      try {
        await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
        assert.fail("No error was thrown even though it was expected.")
      } catch (error) {
        assert.ok(error instanceof InvalidBodyError)
      }
    })

    it("should not post positive assessment annotation that is tagged", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "+1",
        body: [
          {
            type: "SpecificResource",
            value: mismatchTagConcept.uri,
            purpose: "tagging",
          },
        ],
      }
      try {
        await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
        assert.fail("No error was thrown even though it was expected.")
      } catch (error) {
        assert.ok(error instanceof InvalidBodyError)
      }
    })

    it("should require `body` to be an array", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "-1",
        body: {
          type: "SpecificResource",
          value: mismatchTagConcept.uri,
          purpose: "tagging",
        },
      }
      try {
        await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
        assert.fail("No error was thrown even though it was expected.")
      } catch (error) {
        assert.ok(error instanceof InvalidBodyError)
      }
    })

    it("should not negative assessment annotation that is tagged incorrectly (1)", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "-1",
        body: [
          {
            type: "SpecificResources",
            value: mismatchTagConcept.uri,
            purpose: "tagging",
          },
        ],
      }
      try {
        await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
        assert.fail("No error was thrown even though it was expected.")
      } catch (error) {
        assert.ok(error instanceof InvalidBodyError)
      }
    })

    it("should not negative assessment annotation that is tagged incorrectly (2)", async () => {
      const annotation = {
        target: "abc:def",
        bodyValue: "-1",
        body: [
          {
            type: "SpecificResource",
            value: mismatchTagConcept.uri,
            purpose: "tag",
          },
        ],
      }
      try {
        await services.annotation.postAnnotation({ bodyStream: await arrayToStream([annotation]) })
        assert.fail("No error was thrown even though it was expected.")
      } catch (error) {
        assert.ok(error instanceof InvalidBodyError)
      }
    })

  })

})
