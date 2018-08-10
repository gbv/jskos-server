# JSKOS Server

[![Build Status](https://travis-ci.com/gbv/jskos-server.svg?branch=master)](https://travis-ci.com/gbv/jskos-server)
[![Uptime Robot status](https://img.shields.io/uptimerobot/status/m780815088-08758d5c5193e7b25236cfd7.svg?label=%2Fapi%2F)](https://stats.uptimerobot.com/qZQx1iYZY/780815088)
[![Uptime Robot status](https://img.shields.io/uptimerobot/status/m780815090-86af901a732dc41e3a48cd8c.svg?label=%2Fdev-api%2F)](https://stats.uptimerobot.com/qZQx1iYZY/780815090)

> Web service to access [JSKOS] data

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
  - [/mappings](#mappings)
  - [/mappings/suggest](#mappingssuggest)
  - [/mappings/voc](#mappingsvoc)
  - [/voc](#voc)
  - [/voc/top](#voctop)
  - [/data](#data)
  - [/narrower](#narrower)
  - [/ancestors](#ancestors)
  - [/suggest](#suggest)
  - [/search](#search)
- [Deployment](#deployment)
  - [Notes about depolyment on Ubuntu](#notes-about-depolyment-on-ubuntu)
  - [Update an instances deployed with PM2](#update-an-instances-deployed-with-pm2)

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
You can customize the port and the MongoDB connection settings via environment variables, for example through a `.env` file:

```bash
PORT=__EXPRESS_PORT__
MONGO_HOST=__MONGODB_HOSTNAME__
MONGO_PORT=__MONGODB_PORT__
MONGO_DB=__MONGODB_DATABASE__
```

### Data Import
JSKOS Server provides a script to import JSKOS data into the database. Right now, mappings, terminologies (concept schemes), and concepts in JSON or [NDJSON](http://ndjson.org) format are supported.

For a one-time import, you can use `npm run import`. For usage, see `npm run import -- -h`.

For a regular import, you can use `./scripts/import.sh`. See the top of the file for instructions.

## Usage

### Run Server
```bash
# serve with hot reload and auto reconnect at localhost:3000 (default)
npm run start
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

### /status
Returns a status object.

* **Success Response**

  ```json
  {
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
    "ok": 0
  }
  ```

### /mappings
Returns an array of mappings.

* **URL Params**

  `from=[uri|notation]` specify the source URI or notation

  `to=[uri|notation]` specify the target URI or notation

  `mode=[mode]` specify the mode for `from` and `to`, one of `and` (default) and `or`

  `fromScheme=[uri|notation]` only show mappings from concept scheme (URI or notation)

  `toScheme=[uri|notation]` only show mappings to concept scheme (URI or notation)

  `limit=[number]` limits the number of results (default 100)

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
      "@context": "https://gbv.github.io/jskos/context.json"
    }
  ]
  ```

### /mappings/suggest
Suggests notations used in mappings.

* **URL Params**

  `search=[notation]` specifies the notation (prefix) to search for

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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
Lists all supported terminologies (concept schemes).

* **URL Params**

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors` and `narrower`)

* **Success Response**

  JSON array of [JSKOS Concepts]

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/voc/top?uri=http://dewey.info/scheme/edition/e23/
  ```

### /data
Returns detailed data for concepts.

* **URL Params**

  `uri=[uri]` URIs for concepts separated by `|`

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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

  `limit=[number]` limits the number of results (default: 100)

  `offset=[number]` number of results to be skipped (use in combination with `limit`) (default: 0)

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

[JSKOS]: https://gbv.github.io/jskos/jskos.html
[JSKOS Concept Mappings]: https://gbv.github.io/jskos/jskos.html#concept-mappings
[JSKOS Concept Schemes]: https://gbv.github.io/jskos/jskos.html#concept-schemes
[JSKOS Concepts]: https://gbv.github.io/jskos/jskos.html#concept
