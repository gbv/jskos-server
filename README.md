# JSKOS Server

[![Build Status](https://travis-ci.com/gbv/jskos-server.svg?branch=master)](https://travis-ci.com/gbv/jskos-server)
[![GitHub package version](https://img.shields.io/github/package-json/v/gbv/jskos-server.svg?label=version)](https://github.com/gbv/jskos-server)
[![Uptime Robot status](https://img.shields.io/uptimerobot/status/m780815088-08758d5c5193e7b25236cfd7.svg?label=%2Fapi%2F)](https://stats.uptimerobot.com/qZQx1iYZY/780815088)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg)](https://github.com/RichardLitt/standard-readme)

> Web service to access [JSKOS] data.

JSKOS Server is a web server for [JSKOS] data. It is currently under development.

## Table of Contents
- [Install](#install)
  - [Dependencies](#dependencies)
  - [Clone and Install](#clone-and-install)
  - [Configuration](#configuration)
  - [Data Import](#data-import)
- [Usage](#usage)
  - [Run Server](#run-server)
  - [Run Tests](#run-tests)
- [API](#api)
  - [/status](#status)
  - [/concordances](#concordances)
  - [/mappings](#mappings)
  - [/mappings/:_id](#mappings_id)
  - [/mappings/suggest](#mappingssuggest)
  - [/mappings/voc](#mappingsvoc)
  - [/voc](#voc)
  - [/voc/top](#voctop)
  - [/voc/concepts](#vocconcepts)
  - [/data](#data)
  - [/narrower](#narrower)
  - [/ancestors](#ancestors)
  - [/suggest](#suggest)
  - [/search](#search)
- [Deployment](#deployment)
  - [Notes about depolyment on Ubuntu](#notes-about-depolyment-on-ubuntu)
  - [Update an instances deployed with PM2](#update-an-instances-deployed-with-pm2)
  - [Daily Import](#daily-import)
- [Maintainers](#maintainers)
- [Contribute](#contribute)
- [License](#license)

## Install

### Dependencies
You need to have access to a [MongoDB database](https://docs.mongodb.com/manual/installation/).

### Clone and Install
```bash
git clone https://github.com/gbv/jskos-server.git
cd jskos-server
npm install
```

### Configuration
You can customize the application settings via a configuration file, e.g. by providing a generic `config.json` file and/or a more specific `config.{env}.json` file (where `{env}` is the environment like `development` or `production`). The latter will have precendent over the former, and all missing keys will be defaulted with values from `config.default.json`.

```json
{
  "verbosity": false,
  "baseUrl": null,
  "port": 3000,
  "mongo": {
    "user": "",
    "pass": "",
    "host": "localhost",
    "port": 27017,
    "db": "jskos-server",
    "options": {
      "reconnectTries": 60,
      "reconnectInterval": 1000,
      "useNewUrlParser": true
    }
  },
  "auth": {
    "algorithm": "HS256",
    "key": null,
    "postAuthRequired": true
  },
  "schemes": true,
  "concepts": true,
  "mappings": true,
  "annotations": true
}
```

With the keys `schemes`, `concepts`, `mappings`, and `annotations`, you can configure whether endpoints relating to the specific functionality should be available. By default, everything is available.

**If you are using jskos-server behind a proxy, it is necessary to provide the `baseUrl` key in your configuration (example for our production API):**
```json
{
  "baseUrl": "https://coli-conc.gbv.de/api/"
}
```

For authorized endpoints via JWT, you need to provide the JWT algorithm and key/secret used at the authentication server in the configuration file, like this:

```json
"auth": {
  "algorithm": "RS256",
  "key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA57ZWRoOjXYTQ9yujxAu7\ne3k4+JRBAqGdDVIRRq5vXB2D5nJBIhQjVjylumn+QnTX/MdZx8qn7X96npUwHwIh\nylCgUmsYXcjP08X/AXEcP5bPOkgBBCKjWmcm+p01RQSOM0nSptyxpyXzr2ppWe1b\nuYdRYDWj+JV7vm+jJA4NiFv4UnAhoG5lRATADzu0/6wpMK3dVMBL7L0jQoV5xBAb\nLADOy5hD9XEII3VPkUqDGIKM+Z24flkCIf0lQ7FjsoZ2mmM1SZJ5vPDcjMKreFkX\ncWlcwGHN0PUWZWLhb7c8yYa1rauMcwFwv0d2XyOEfgkqEJdCh8mVT/5jR48D2PNG\ncwIDAQAB\n-----END PUBLIC KEY-----\n"
}
```

The JWT has to be provided as a Bearer token in the authentication header, e.g. `Authentication: Bearer <token>`. Currently, all authorized endpoints will be accessible (although `PUT`/`PATCH`/`DELETE` are limited to the user who created the object), but later it will be possible to set scopes for certain users (see [#47](https://github.com/gbv/jskos-server/issues/47)).

### Data Import
JSKOS Server provides a script to import JSKOS data into the database. Right now, mappings, terminologies (concept schemes), concepts, concordances, and annotations, in JSON (array only) or [NDJSON](http://ndjson.org) format are supported.

Before you can use the script, you need to link it: `npm link`. This makes the command `jskos-import` available in your path. To see how to use the script, run `jskos-import --help`. **Note:** If you have multiple jskos-server instances running on the same machine, this command will make the import for the **current** instance available in the path. Alternatively, you can use `./bin/import.js` or `npm run import --`.

Examples:
```bash
# Linking is necessary to be able to use the `jskos-import` command.
npm link
# Alternatively, replace `jskos-import` with `./bin/import.js` or `npm run import --`. This is recommended for cronjobs etc.

# Create indexes for all types
jskos-import --indexes
# Import RVK scheme (from coli-conc API)
jskos-import schemes https://coli-conc.gbv.de/rvk/api/voc
# Import RVK concepts (this might take a while)
jskos-import concepts https://coli-conc.gbv.de/rvk/data/2019_1/rvko_2019_1.ndjson
# Import coli-conc concordances
jskos-import concordances https://coli-conc.gbv.de/concordances/csv/concordances.ndjson

# Batch import multiple files or URLs
npm run import-batch -- mappings files.txt
# files.txt should contain one file or URL per line with the full path and no escaping.
# You can, for example, store these batch import files in folder `imports` which is ignored in git.
```

## Usage

### Run Server
```bash
# Development server with hot reload and auto reconnect at localhost:3000 (default)
npm run start

# To run the server in production, run this:
NODE_ENV=production node ./server.js
```

### Run Tests
Tests will use the real MongoDB with `-test` appended to the database name.

```bash
npm test
```

## API
Unless otherwise specified:
- All endpoints are `GET` endpoints.
- All responses return code 200.
- All URL parameters are optional.
- All endpoints (except for `/status`) offer pagination via `limit=[number]` (default: 100) and `offset=[number]` (default: 0) parameters. In the response, there will be a `Link` header like described in the [GitHub API documentation](https://developer.github.com/v3/#pagination), as well as a `X-Total-Count` header containing the total number of results.

### /status
Returns a status object.

* **Success Response**

  ```json
  {
    "config": {
      "env": "development",
      "auth": {
        "algorithm": "RS256",
        "key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA57ZWRoOjXYTQ9yujxAu7\ne3k4+JRBAqGdDVIRRq5vXB2D5nJBIhQjVjylumn+QnTX/MdZx8qn7X96npUwHwIh\nylCgUmsYXcjP08X/AXEcP5bPOkgBBCKjWmcm+p01RQSOM0nSptyxpyXzr2ppWe1b\nuYdRYDWj+JV7vm+jJA4NiFv4UnAhoG5lRATADzu0/6wpMK3dVMBL7L0jQoV5xBAb\nLADOy5hD9XEII3VPkUqDGIKM+Z24flkCIf0lQ7FjsoZ2mmM1SZJ5vPDcjMKreFkX\ncWlcwGHN0PUWZWLhb7c8yYa1rauMcwFwv0d2XyOEfgkqEJdCh8mVT/5jR48D2PNG\ncwIDAQAB\n-----END PUBLIC KEY-----\n",
        "postAuthRequired": false
      },
      "baseUrl": "http://localhost:3000/",
      "schemes": true,
      "concepts": true,
      "mappings": true,
      "annotations": true
    },
    "db": "example_db",
    "collections": [
      {
        "name": "example_collection1",
        "count": 50
      },
      {
        "name": "example_collection2",
        "count": 100
      }
    ],
    "objects": 150,
    "ok": 1
  }
  ```
  (other properties omitted)

* **Error Response**

  ```json
  {
    "config": {
      "env": "development",
      "auth": {
        "algorithm": "RS256",
        "key": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA57ZWRoOjXYTQ9yujxAu7\ne3k4+JRBAqGdDVIRRq5vXB2D5nJBIhQjVjylumn+QnTX/MdZx8qn7X96npUwHwIh\nylCgUmsYXcjP08X/AXEcP5bPOkgBBCKjWmcm+p01RQSOM0nSptyxpyXzr2ppWe1b\nuYdRYDWj+JV7vm+jJA4NiFv4UnAhoG5lRATADzu0/6wpMK3dVMBL7L0jQoV5xBAb\nLADOy5hD9XEII3VPkUqDGIKM+Z24flkCIf0lQ7FjsoZ2mmM1SZJ5vPDcjMKreFkX\ncWlcwGHN0PUWZWLhb7c8yYa1rauMcwFwv0d2XyOEfgkqEJdCh8mVT/5jR48D2PNG\ncwIDAQAB\n-----END PUBLIC KEY-----\n",
        "postAuthRequired": false
      },
      "baseUrl": "http://localhost:3000/",
      "schemes": true,
      "concepts": true,
      "mappings": true,
      "annotations": true
    },
    "ok": 0
  }
  ```

### /concordances
Lists all concordances for mappings.

* **URL Params**

  `uri=[uri]` URIs for concordances separated by `|`

  `fromScheme=[uri|notation]` only show concordances from concept scheme (URI or notation), separated by `|`

  `toScheme=[uri|notation]` only show concordances to concept scheme (URI or notation), separated by `|`

  `creator=[creator]` only show concordances from creator, separated by `|`

  `mode=[mode]` specify the mode for the parameters above, one of `and` (default) and `or`

  `download=[type]` returns the whole result as a download (available types are `json` and `ndjson`), ignores `limit` and `offset`

* **Success Response**

  JSON array of [JSKOS Concordances](https://gbv.github.io/jskos/jskos.html#concordances)

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/concordances?limit=1
  ```

  ```json
  [
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "creator": [
        {
          "prefLabel": {
            "de": "VZG"
          }
        }
      ],
      "distributions": [
        {
          "download": "https://coli-conc.gbv.de/api/mappings?partOf=http://coli-conc.gbv.de/concordances/ddc_rvk_recht&download=ndjson",
          "format": "http://format.gbv.de/jskos",
          "mimetype": "application/x-ndjson; charset=utf-8"
        }
      ],
      "extent": "2267",
      "fromScheme": {
        "notation": [
          "DDC"
        ],
        "uri": "http://bartoc.org/en/node/241"
      },
      "notation": [
        "ddc_rvk_recht"
      ],
      "scopeNote": {
        "de": [
          "Recht"
        ]
      },
      "toScheme": {
        "notation": [
          "RVK"
        ],
        "uri": "http://bartoc.org/en/node/533"
      },
      "type": [
        "http://rdfs.org/ns/void#Linkset"
      ],
      "uri": "http://coli-conc.gbv.de/concordances/ddc_rvk_recht"
    }
  ]
  ```

### /mappings
Returns an array of mappings. Each mapping has a property `url` under which the specific mapping can be accessed.

* **URL Params**

  `identifier=[identifier1|identifier2|...]` specify mapping identifiers separated by `|`

  `from=[uri|notation]` specify the source URI or notation (truncated search possible by appending a `*`)

  `to=[uri|notation]` specify the target URI or notation (truncated search possible by appending a `*`)

  `mode=[mode]` specify the mode for `from`, `to`, and `identifier`, one of `and` (default) and `or`

  `direction=[direction]` specify the direction of the mapping. Available values are: `forward` (default), `backward` (essentially swaps `from` and `to`), `both` (combines forward and backward).

  `fromScheme=[uri|notation]` only show mappings from concept scheme (URI or notation)

  `toScheme=[uri|notation]` only show mappings to concept scheme (URI or notation)

  `type=[uri]` only show mappings that conform to a certain type (see [JSKOS Concept Mappings])

  `partOf=[uri1|uri2|...]` only show mappings that are part of certain concordances (URIs separated by `|`)

  `creator=[string1|string2|...]` only show mappings that have a certain creator (separated by `|`)

  `download=[type]` returns the whole result as a download (available types are `json`, `ndjson`, `csv`, and `tsv`), ignores `limit` and `offset`

* **Success Response**

  JSON array of [JSKOS Concept Mappings]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/mappings?from=http://dewey.info/class/612.116/e23/
  ```

  ```json
  [
    {
      "from": {
        "memberSet": [
          {
            "uri": "http://dewey.info/class/612.116/e23/",
            "notation": [
              "612.116"
            ]
          }
        ]
      },
      "to": {
        "memberSet": [
          {
            "uri": "http://rvk.uni-regensburg.de/nt/WW_8800-WW_8839",
            "notation": [
              "WW 8800-WW 8839"
            ]
          }
        ]
      },
      "fromScheme": {
        "uri": "http://bartoc.org/en/node/241",
        "notation": [
          "DDC"
        ]
      },
      "toScheme": {
        "uri": "http://bartoc.org/en/node/533",
        "notation": [
          "RVK"
        ]
      },
      "identifier": [
        "urn:jskos:mapping:content:fb92cbed7466764dd2ca5fdf054bf55e65ec6b87",
        "urn:jskos:mapping:members:5aa92285bba839954baccdadc7df5ef4558860ed"
      ],
      "@context": "https://gbv.github.io/jskos/context.json"
    }
  ]
  ```

### /mappings/:_id
Returns a specific mapping.

* **Success Response**

  JSKOS object for mapping.

* **Error Response**

  If no mapping with `_id` could be found, it will return a 404 not found error.

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/mappings/5c450ba1a32a4a82d0f3fbf3
  ```

  ```json
  {
    "from": {
      "memberSet": [
        {
          "uri": "http://rvk.uni-regensburg.de/nt/TA-TD",
          "notation": [
            "TA - TD"
          ]
        }
      ]
    },
    "toScheme": {
      "template": "http://dewey.info/class/(.+)/e23/",
      "pattern": "[0-9][0-9]?|[0-9]{3}(-[0-9]{3})?|[0-9]{3}\\.[0-9]+(-[0-9]{3}\\.[0-9]+)?|[1-9][A-Z]?--[0-9]+|[1-9][A-Z]?--[0-9]+(-[1-9][A-Z]?--[0-9]+)?",
      "uri": "http://bartoc.org/en/node/241",
      "notation": [
        "DDC"
      ]
    },
    "fromScheme": {
      "notation": [
        "RVK"
      ],
      "uri": "http://bartoc.org/en/node/533"
    },
    "to": {
      "memberSet": [
        {
          "uri": "http://dewey.info/class/500/e23/",
          "notation": [
            "500"
          ]
        }
      ]
    },
    "identifier": [
      "urn:jskos:mapping:content:d37d117b5e3d811447bc332b184ac6e5ac4bde6b",
      "urn:jskos:mapping:members:4c480744ea32e7e71ba39fae6cc8d8e4e0382912"
    ],
    "partOf": [
      {
        "uri": "http://coli-conc.gbv.de/concordances/rvk_ddc_ta-td"
      }
    ],
    "creator": [
      {
        "prefLabel": {
          "de": "GESIS"
        }
      }
    ],
    "url": "https://coli-conc.gbv.de/api/mappings/5c450ba1a32a4a82d0f3fbf3",
    "@context": "https://gbv.github.io/jskos/context.json"
  }
  ```

### /mappings/suggest
Suggests notations used in mappings.

* **URL Params**

  `search=[notation]` specifies the notation (prefix) to search for

* **Success Response**

  JSON array of suggestions in [OpenSearch Suggest Format](http://www.opensearch.org/Specifications/OpenSearch/Extensions/Suggestions/1.1#Response_format).

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/mappings/suggest?search=A&limit=5
  ```

  ```json
  [
    "A",
    [
      "AN 74800",
      "AN 78950",
      "AN 70000",
      "AN 71000",
      "AN 96900"
    ],
    [
      42,
      25,
      19,
      18,
      17
    ],
    []
  ]
  ```

### /mappings/voc
Lists all concept schemes used in mappings.

* **URL Params**

  `from=[uri|notation]` restrict mappings to those from a concept

  `to=[uri|notation]` restrict mappings to those to a concept

  `mode=[mode]` specify the mode for `from` and `to`, one of `and` and `or` (default)

* **Success Response**

  JSON array of [JSKOS Concept Schemes]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/mappings/voc?from=612.112&to=612.112
  ```

  ```json
  [
    {
      "uri": "http://bartoc.org/en/node/430",
      "notation": [
        "GND"
      ],
      "fromCount": 2
    },
    {
      "uri": "http://bartoc.org/en/node/241",
      "notation": [
        "DDC"
      ],
      "fromCount": 2,
      "toCount": 2
    },
    {
      "uri": "http://bartoc.org/en/node/533",
      "notation": [
        "RVK"
      ],
      "toCount": 2
    }
  ]
  ```

### /voc
Lists supported terminologies (concept schemes).

* **URL Params**

  `uri=[uri]` URIs for concept schemes separated by `|`. If `uri` is not given, all supported concept schemes are returned.

* **Success Response**

  JSON array of [JSKOS Concept Schemes]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/voc?limit=1
  ```

  ```json
  [
    {
      "uri": "http://dewey.info/scheme/edition/e23/",
      "prefLabel": {
        "de": "Dewey-Dezimalklassifikation",
        "en": "Dewey Decimal Classification"
      },
      "notation": [
        "DDC"
      ],
      "identifier": [
        "http://bartoc.org/en/node/241"
      ],
      "license": [
        {
          "uri": "http://creativecommons.org/licenses/by-nc-nd/3.0/"
        }
      ],
      "publisher": [
        {
          "uri": "http://d-nb.info/gnd/1086052218",
          "prefLabel": {
            "de": "OCLC"
          },
          "altLabel": {
            "de": [
              "OCLC Online Computer Library Center"
            ]
          },
          "url": "https://www.oclc.org/"
        }
      ],
      "@context": "https://gbv.github.io/jskos/context.json"
    }
  ]
  ```

### /voc/top
Lists top concepts for a concept scheme.

* **URL Params**

  `uri=[uri]` URI for a concept scheme

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/voc/top?uri=http://dewey.info/scheme/edition/e23/
  ```

### /voc/concepts
Lists concepts for a concept scheme.

* **URL Params**

  `uri=[uri]` URI for a concept scheme

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/voc/concepts?uri=http://dewey.info/scheme/edition/e23/
  ```

### /data
Returns detailed data for concepts (or concept schemes).

* **URL Params**

  `uri=[uri]` URIs for concepts (or concept schemes) separated by `|`

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/data?uri=http://dewey.info/class/612.112/e23/
  ```

  ```json
  [
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/612.11/e23/"
        }
      ],
      "created": "2000-02-02",
      "identifier": [
        "16d595ff-ec01-3e55-b425-016cf92bb950"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2013-12-04",
      "notation": [
        "612.112"
      ],
      "prefLabel": {
        "de": "Leukozyten (Weiße Blutkörperchen)"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/612.112/e23/",
      "narrower": [
        null
      ]
    }
  ]
  ```

### /narrower
Returns narrower concepts for a concept.

* **URL Params**

  `uri=[uri]` URI for a concept

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/narrower?uri=http://dewey.info/class/612.112/e23/
  ```

  ```json
  [
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/612.112/e23/"
        }
      ],
      "created": "2000-02-02",
      "identifier": [
        "cf6faa73-e5e7-3856-9429-611a8a39d253"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2005-11-02",
      "notation": [
        "612.1121"
      ],
      "prefLabel": {
        "de": "Biochemie"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/612.1121/e23/",
      "narrower": []
    },
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/612.112/e23/"
        }
      ],
      "created": "2000-02-02",
      "http://www.w3.org/2002/07/owl#deprecated": true,
      "identifier": [
        "23519115-b023-3812-a2c1-6fc99e169ae3"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2005-11-02",
      "notation": [
        "612.1122"
      ],
      "prefLabel": {
        "de": "Biophysik"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/612.1122/e23/",
      "narrower": []
    },
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/612.112/e23/"
        }
      ],
      "created": "2000-02-02",
      "identifier": [
        "4a070e77-094c-3638-9067-2b3625d612e9"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2005-11-02",
      "notation": [
        "612.1127"
      ],
      "prefLabel": {
        "de": "Anzahl und Auszählung"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/612.1127/e23/",
      "narrower": []
    }
  ]
  ```

### /ancestors
Returns ancestor concepts for a concept.

* **URL Params**

  `uri=[uri]` URI for a concept

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/ancestors?uri=http://dewey.info/class/61/e23/
  ```

  ```json
  [
    {
      "@context": "https://gbv.github.io/jskos/context.json",
      "created": "2000-02-02",
      "identifier": [
        "856c92e9-8b1f-3131-bfbe-f2d2266527d3"
      ],
      "modified": "2005-11-02",
      "notation": [
        "6"
      ],
      "prefLabel": {
        "de": "Technik, Medizin, angewandte Wissenschaften"
      },
      "topConceptOf": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/6/e23/",
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "narrower": [
        null
      ]
    }
  ]
  ```

### /suggest
Returns concept suggestions.

* **URL Params**

  `search=[notation]` specifies the notation (prefix) to search for

  `format=[string]` return format for suggestions: `jskos` or [`opensearch`]((http://www.opensearch.org/Specifications/OpenSearch/Extensions/Suggestions/1.1#Response_format)) (default)

* **Success Response**

  JSON array of suggestions.

* **Sample Calls**

  ```bash
  curl https://coli-conc.gbv.de/api/suggest?search=Krebs&limit=5
  ```

  ```json
  [
    "Krebs",
    [
      "133.5265 Krebs",
      "639.5 Krebstierfang",
      "639.6 Krebstierzucht",
      "616.994 Krebserkrankungen",
      "641.695 Krebstiere"
    ],
    [
      "",
      "",
      "",
      "",
      ""
    ],
    [
      "http://dewey.info/class/133.5265/e23/",
      "http://dewey.info/class/639.5/e23/",
      "http://dewey.info/class/639.6/e23/",
      "http://dewey.info/class/616.994/e23/",
      "http://dewey.info/class/641.695/e23/"
    ]
  ]
  ```

  ```bash
  curl https://coli-conc.gbv.de/api/suggest?search=Krebs&limit=2&format=jskos
  ```

  ```json
  [
    {
      "_id": "http://dewey.info/class/133.5265/e23/",
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/133.526/e23/"
        }
      ],
      "created": "2000-02-02",
      "identifier": [
        "57e89e64-9de0-35c1-88da-856529d547c8"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2005-11-02",
      "notation": [
        "133.5265"
      ],
      "prefLabel": {
        "de": "Krebs"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/133.5265/e23/",
      "narrower": [],
      "priority": 292
    },
    {
      "_id": "http://dewey.info/class/639.5/e23/",
      "@context": "https://gbv.github.io/jskos/context.json",
      "broader": [
        {
          "uri": "http://dewey.info/class/639/e23/"
        }
      ],
      "created": "2000-02-02",
      "identifier": [
        "8b1dc20e-5d1e-34f4-8478-3fa022ba6fe0"
      ],
      "inScheme": [
        {
          "uri": "http://dewey.info/scheme/edition/e23/"
        }
      ],
      "modified": "2005-11-02",
      "notation": [
        "639.5"
      ],
      "prefLabel": {
        "de": "Krebstierfang"
      },
      "type": [
        "http://www.w3.org/2004/02/skos/core#Concept"
      ],
      "uri": "http://dewey.info/class/639.5/e23/",
      "narrower": [
        null
      ],
      "priority": 195
    }
  ]
  ```

### /search
Currently the same as `/suggest` with parameter `format=jskos`. Additionally, search supports the parameter `properties=[list]` as in the other concept methods.

## Deployment
The application is currently deployed at http://coli-conc.gbv.de/api/. At the moment, there is no automatic deployment of new versions.

### Notes about depolyment on Ubuntu
It is recommended to use a [newer version of Node.js](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions). Installing the dependencies might also require installing nodejs-legacy: `sudo apt-get install nodejs-legacy` ([more info here](https://stackoverflow.com/questions/21168141/cannot-install-packages-using-node-package-manager-in-ubuntu)). One possibility for running the application in production on Ubuntu 16.04 is described [here](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04).

### Update an instances deployed with PM2
```
# get updates from repository
git pull

# restart the process (adjust process name if needed)
pm2 restart jskos-server
```

### Daily Import
If you'd like to run the import script daily to refresh current mappings, you can for example use a cronjob:

```bash
# Runs import script for jskos-server in /srv/cocoda/jskos-server at 1 AM each day.
00 01 * * * cd /srv/cocoda/jskos-server; ./scripts/import.sh
```

[JSKOS]: https://gbv.github.io/jskos/jskos.html
[JSKOS Concept Mappings]: https://gbv.github.io/jskos/jskos.html#concept-mappings
[JSKOS Concept Schemes]: https://gbv.github.io/jskos/jskos.html#concept-schemes
[JSKOS Concepts]: https://gbv.github.io/jskos/jskos.html#concept

## Maintainers

- [@stefandesu](https://github.com/stefandesu)
- [@nichtich](https://github.com/nichtich)

## Contribute

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2018 Verbundzentrale des GBV (VZG)
