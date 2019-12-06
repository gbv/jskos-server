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
  - [GET /status](#get-status)
  - [GET /checkAuth](#get-checkauth)
  - [GET /concordances](#get-concordances)
  - [GET /mappings](#get-mappings)
  - [GET /mappings/suggest](#get-mappingssuggest)
  - [GET /mappings/voc](#get-mappingsvoc)
  - [GET /mappings/:_id](#get-mappings_id)
  - [POST /mappings](#post-mappings)
  - [PUT /mappings/:_id](#put-mappings_id)
  - [PATCH /mappings/:_id](#patch-mappings_id)
  - [DELETE /mappings/:_id](#delete-mappings_id)
  - [GET /voc](#get-voc)
  - [GET /voc/top](#get-voctop)
  - [GET /voc/concepts](#get-vocconcepts)
  - [GET /data](#get-data)
  - [GET /narrower](#get-narrower)
  - [GET /ancestors](#get-ancestors)
  - [GET /suggest](#get-suggest)
  - [GET /search](#get-search)
  - [GET /annotations](#get-annotations)
  - [GET /annotations/:_id](#get-annotations_id)
  - [POST /annotations](#post-annotations)
  - [PUT /annotations/:_id](#put-annotations_id)
  - [PATCH /annotations/:_id](#patch-annotations_id)
  - [DELETE /annotations/:_id](#delete-annotations_id)
  - [Errors](#errors)
- [Deployment](#get-deployment)
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
  "version": null,
  "port": 3000,
  "mongo": {
    "user": "",
    "pass": "",
    "host": "localhost",
    "port": 27017,
    "db": "jskos-server",
    "options": {
      "reconnectTries": 5,
      "reconnectInterval": 1000,
      "useNewUrlParser": true
    }
  },
  "auth": {
    "algorithm": "HS256",
    "key": null
  },
  "schemes": true,
  "concepts": true,
  "mappings": {
    "read": {
      "auth": false
    },
    "create": {
      "auth": true
    },
    "update": {
      "auth": true,
      "crossUser": false
    },
    "delete": {
      "auth": true,
      "crossUser": false
    },
    "fromSchemeWhitelist": null,
    "toSchemeWhitelist": null,
    "anonymous": false,
    "cardinality": "1-to-n"
  },
  "concordances": true,
  "annotations": {
    "read": {
      "auth": false
    },
    "create": {
      "auth": true
    },
    "update": {
      "auth": true,
      "crossUser": false
    },
    "delete": {
      "auth": true,
      "crossUser": false
    }
  },
  "identityProviders": null,
  "identities": null
}
```

With the keys `schemes`, `concepts`, `mappings`, and `annotations`, you can configure whether endpoints related to the specific functionality should be available. A minimal configuration file to just server read-only vocabulary and concept information could look like this:

```json
{
  "mappings": false,
  "annotations": false,
  "concordances": false
}
```

Available actions for `mappings` and `annotations` are `read`, `create`, `update`, and `delete`. By default, all types can be read, while `mappings` and `annotations` can be created, updated, and deleted with authentication. Explanantions for additional options:

- **`auth`**: Boolean. Can be defined only on actions. Defines whether access will require authentication. By default `false` for `read`, and `true` for all other actions.

- **`crossUser`**: Boolean. Can be defined only on `update` and `delete` actions. Defines whether it is possible to edit an entity from a different user than the authenticated one. `false` by default.

- **`anonymous`**: Boolean. Can be defined only on type `mappings`. If `true`, the creator for mappings will not be saved. Also, `crossUser` will be implied to `true` as well. `false` by default.

- **`cardinality`**: String. Can be defined only on type `mappings`. Currently possible values: `1-to-n` (default), `1-to-1`. If `1-to-1` is configured, mappings with multiple concepts in `to` will be rejected.

- **`identities`**: List of URI strings. Can be defined on any level (deeper levels will take the values from higher levels if necessary\*). If set, an action can only be used by users with an URI given in the list. `null` by default (no restrictions).

- **`identityProviders`**: List of strings. Can be defined on any level (deeper levels will take the values from higher levels if necessary\*). If set, an action can only be used by users who have that identity associated with them. `null` by default (no restrictions).

- **`fromSchemeWhitelist`/`toSchemeWhitelist`**: Can be defined only on type `mappings`. List of scheme objects that are allowed for `fromScheme`/`toScheme` respectively. `null` allows all schemes.

\* Only applies to actions `create`, `update`, and `delete`.

Note that any properties not mentioned here are not allowed!

Here are some helpful example presets for "mappings" or "annotations".

**Read-only access (does not make sense for annotations):**
```json
{
  "read": {
    "auth": false
  }
}
```

**Anyone can create, but only logged-in users can update and delete (and only their own items):**
```json
{
  "read": {
    "auth": false
  },
  "create": {
    "auth": false
  },
  "update": {
    "auth": true,
    "crossUser": false
  },
  "delete": {
    "auth": true,
    "crossUser": false
  }
}
```

**Anyone can create, logged-in users can update (independent of creator), logged-in users can delete their own items:**
```json
{
  "read": {
    "auth": false
  },
  "create": {
    "auth": false
  },
  "update": {
    "auth": true,
    "crossUser": true
  },
  "delete": {
    "auth": true,
    "crossUser": false
  }
}
```

**Anyone can create, as well as update and delete, independent of creator:**
```json
{
  "read": {
    "auth": false
  },
  "create": {
    "auth": false
  },
  "update": {
    "auth": false,
    "crossUser": true
  },
  "delete": {
    "auth": false,
    "crossUser": true
  }
}
```

---

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

The JWT has to be provided as a Bearer token in the authentication header, e.g. `Authentication: Bearer <token>`. Currently, all authorized endpoints will be accessible (although `PUT`/`PATCH`/`DELETE` are limited to the user who created the object by default), but later it will be possible to set scopes for certain users (see [#47](https://github.com/gbv/jskos-server/issues/47)).

Note about previous additional options for `auth`:
- `postAuthRequired`: now covered by `mappings.create.auth`
- `whitelist`: now covered by `identities`
- `allowCrossUserEditing`: now covered by `mappings.update.crossUser` and `mappings.delete.crossUser`

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
- `GET` requests will return code 200 on success.
- `POST` requests will return code 201 on success.
- `DELETE` requests will return code 204 on success.
- `POST`/`PUT`/`PATCH` requests require a JSON body.
- `POST`/`PUT`/`PATCH`/`DELETE` requests require authentication via a JWT from [login-server](https://github.com/gbv/login-server) in the header. Exception: Authentication for certain actions on certain endpoints can be disabled (see [configuration](#configuration)).
- `PUT`/`PATCH`/`DELETE` requests are required to come from the owner of the entity that is being modified.
- All URL parameters are optional.
- All `GET` endpoints (except for `/status` and those with `:_id`) offer pagination via `limit=[number]` (default: 100) and `offset=[number]` (default: 0) parameters. In the response, there will be a `Link` header like described in the [GitHub API documentation](https://developer.github.com/v3/#pagination), as well as a `X-Total-Count` header containing the total number of results.
- For possible errors, see [Errors](#errors).

### GET /status
Returns a status object.

There is a [JSON Schema](https://json-schema.org) for the format of this endpoint. It is available under `/status.schema.json` for every jskos-server installation (starting from version 1.0.0). The most recent schema can be accessed here: https://gbv.github.io/jskos-server/status.schema.json

* **Success Response**

  ```json
  {
    "config": {
      "env": "development",
      "baseUrl": "http://localhost:3000/",
      "version": "1.1",
      "auth": {
        "algorithm": "HS256",
        "key": null
      },
      "schemes": {
        "read": {
          "auth": false
        }
      },
      "concepts": {
        "read": {
          "auth": false
        }
      },
      "mappings": {
        "read": {
          "auth": false
        },
        "create": {
          "auth": true
        },
        "update": {
          "auth": true,
          "crossUser": false
        },
        "delete": {
          "auth": true,
          "crossUser": false
        },
        "fromSchemeWhitelist": null,
        "toSchemeWhitelist": null,
        "anonymous": false,
        "cardinality": "1-to-n"
      },
      "concordances": {
        "read": {
          "auth": false
        }
      },
      "annotations": {
        "read": {
          "auth": false
        },
        "create": {
          "auth": true
        },
        "update": {
          "auth": true,
          "crossUser": false
        },
        "delete": {
          "auth": true,
          "crossUser": false
        }
      },
      "identityProviders": null,
      "identities": null
    },
    "schemes": "http://localhost:3000/voc",
    "top": "http://localhost:3000/voc/top",
    "concepts": "http://localhost:3000/voc/concepts",
    "data": "http://localhost:3000/data",
    "narrower": "http://localhost:3000/narrower",
    "ancestors": "http://localhost:3000/ancestors",
    "suggest": "http://localhost:3000/suggest",
    "search": "http://localhost:3000/search",
    "concordances": "http://localhost:3000/concordances",
    "mappings": "http://localhost:3000/mappings",
    "annotations": "http://localhost:3000/annotations",
    "ok": 1
  }
  ```

* **Error Response**

  ```json
  {
    "ok": 0
  }
  ```
  (other properties omitted)

### GET /checkAuth
Endpoint to check whether a user is authorized. If `type` or `action` are not set, it will use `identities`/`identityProviders` that are defined directly under config.

* **URL Params**

  `type=[type]` one of "schemes", "concepts", "mappings", "annotations" (optional)

  `action=[action]` one of "read", "create", "update", "delete" (optional)

### GET /concordances
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

### GET /mappings
Returns an array of mappings. Each mapping has a property `uri` under which the specific mapping can be accessed.

* **URL Params**

  `identifier=[identifier1|identifier2|...]` specify mapping identifiers separated by `|`

  `from=[uriOrNotation1|uriOrNotation2|...]` specify the source URI or notation (truncated search possible by appending a `*`, multiple URIs/notations separated by `|`)

  `to=[uriOrNotation1|uriOrNotation2|...]` specify the target URI or notation (truncated search possible by appending a `*`, multiple URIs/notations separated by `|`)

  `mode=[mode]` specify the mode for `from`, `to`, and `identifier`, one of `and` (default) and `or`

  `direction=[direction]` specify the direction of the mapping. Available values are: `forward` (default), `backward` (essentially swaps `from` and `to`), `both` (combines forward and backward).

  `fromScheme=[uriOrNotation1|uriOrNotation2|...]` only show mappings from concept scheme (URI or notation, multiple URIs/notations separated by `|`)

  `toScheme=[uriOrNotation1|uriOrNotation2|...]` only show mappings to concept scheme (URI or notation, multiple URIs/notations separated by `|`)

  `type=[uri1|uri2|...]` only show mappings that conform to a certain type or types (see [JSKOS Concept Mappings]) (URIs separated by `|`)

  `partOf=[uri1|uri2|...]` only show mappings that are part of certain concordances (URIs separated by `|`)

  `creator=[string1|string2|...]` only show mappings that have a certain creator (separated by `|`)

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting only `annotations` for mappings)

  `download=[type]` returns the whole result as a download (available types are `json`, `ndjson`, `csv`, and `tsv`), ignores `limit` and `offset`

  `sort=[sort]` sorts by a specific field. Available are `created` and `modified` (default).

  `order=[order]` order to use for sorting. Available are `asc` and `desc` (default).

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

### GET /mappings/suggest
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

### GET /mappings/voc
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

### GET /mappings/:_id
Returns a specific mapping.

* **URL Params**

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting only `annotations` for mappings)

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

### POST /mappings
Saves a mapping in the database.

* **Success Reponse**

  JSKOS Mapping object as it was saved in the database.

### PUT /mappings/:_id
Overwrites a mapping in the database.

* **Success Reponse**

  JSKOS Mapping object as it was saved in the database.

### PATCH /mappings/:_id
Adjusts a mapping in the database.

* **Success Reponse**

  JSKOS Mapping object as it was saved in the database.

### DELETE /mappings/:_id
Deletes a mapping from the database.

* **Success Reponse**

  Status 204, no content.

### GET /voc
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

### GET /voc/top
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

### GET /voc/concepts
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

### GET /data
Returns detailed data for concepts or concept schemes. Note that there is no certain order to the result set (but it should be consistent across requests).

* **URL Params**

  `uri=[uri]` URIs for concepts or concept schemes separated by `|`

  `notation=[notation]` notations for concepts or concept schemes separated by `|`

  `voc=[uri]` filter by concept scheme URI (note that if `voc` is given, no concept schemes will be returned)

  `properties=[list]` with `[list]` being a comma-separated list of properties (currently supporting `ancestors`, `narrower`, and `annotations`)

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

### GET /narrower
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

### GET /ancestors
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

### GET /suggest
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

### GET /search
Currently the same as `/suggest` with parameter `format=jskos`. Additionally, search supports the parameter `properties=[list]` as in the other concept methods.

### GET /annotations
Returns an array of annotations. Each annotation has a property `id` under which the specific annotation can be accessed.

* **URL Params**

  `id=[id]` specify an annotation ID

  `creator=[uriOrName]` only return annotations that have a certain creator (name or URI)

  `target=[target]` only return annotations with a specific target URI (e.g. a mapping URI)

  `bodyValue=[bodyValue]` only return annotations with a specific bodyValue (e.g. `+1`, `-1`)

  `motivation=[motivation]` only return annotations with a specific motivation (e.g. `assessing`, `moderating`, `tagging`)

* **Success Response**

  Array of annotations in [Web Annotation Data Model] format

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/annotations?bodyValue=+1&limit=1
  ```

  ```json
  [
    {
      "target": "https://coli-conc.gbv.de/api/mappings/f8eff4e2-a6df-4d2c-8382-523072c59af7",
      "motivation": "assessing",
      "bodyValue": "+1",
      "creator": "https://orcid.org/0000-0002-4087-8227",
      "created": "2019-01-31T09:44:12.699Z",
      "id": "https://coli-conc.gbv.de/api/annotations/2575e276-29c6-4d36-8477-b21be1790e64",
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "type": "Annotation"
    }
  ]
  ```

### GET /annotations/:_id
Returns a specific annotation.

* **Success Response**

  Object for annotation in [Web Annotation Data Model] format.

* **Error Response**

  If no annotation with `_id` could be found, it will return a 404 not found error.

* **Sample Call**

  ```bash
  curl https://coli-conc.gbv.de/api/annotations/5f23368f-a63b-4b69-acd6-b403110df97c
  ```

  ```json
  {
    "target": "https://coli-conc.gbv.de/api/mappings/f0cc5f65-5712-4820-9638-e662c0c4314e",
    "motivation": "assessing",
    "bodyValue": "+1",
    "creator": {
      "id": "https://coli-conc.gbv.de/login/users/722cc9c5-2ce3-4ca0-b4fb-fef1f62236af",
      "name": "Jakob Voß"
    },
    "created": "2019-03-11T09:11:10.665Z",
    "id": "https://coli-conc.gbv.de/api/annotations/5f23368f-a63b-4b69-acd6-b403110df97c",
    "@context": "http://www.w3.org/ns/anno.jsonld",
    "type": "Annotation"
  }
  ```

### POST /annotations
Saves an annotation in the database.

* **Success Reponse**

  Annotation object as it was saved in the database in [Web Annotation Data Model] format.

### PUT /annotations/:_id
Overwrites an annotation in the database.

* **Success Reponse**

  Annotation object as it was saved in the database in [Web Annotation Data Model] format.

### PATCH /annotations/:_id
Adjusts an annotation in the database.

* **Success Reponse**

  Annotation object as it was saved in the database in [Web Annotation Data Model] format.

### DELETE /annotations/:_id
Deletes an annotation from the database.

* **Success Reponse**

  Status 204, no content.

### Errors
If possible, errors will be returned as a JSON object in the following format (example):

```json
{
  error: "EntityNotFoundError",
  status: 404,
  message: "The requested entity ABC could not be found.",
}
```

The following errors are currently caught and returned as JSON:

#### EntityNotFoundError
Status code 404. Will be returned if `GET /mappings/:_id` or `GET /annotations/:_id` are requested with an unknown ID.

#### MalformedBodyError
Status code 400. Will be returned for `POST`/`PUT`/`PATCH` if the body was not JSON or missing.

#### MalformedRequestError
Status code 400. Will be returned if a required parameter is missing (currently implemented in `GET /.../:_id` endpoints, but should not be possible to reach).

#### InvalidBodyError
Status code 422. Will be returned for `POST`/`PUT`/`PATCH` if the body was valid JSON, but could not be validated (e.g. does not pass the JSKOS Schema).

#### CreatorDoesNotMatchError
Status code 403. Will be returned by `PUT`/`PATCH`/`DELETE` endpoints if the authenticated creator does not match the creator of the entity that is being edited.

#### DatabaseAccessError
Status code 500. Will be returned if the database is not available or if the current database request failed with an unknown error.

#### ForbiddenAccessError
Status code 403. Will be returned if the user is not allow access (i.e. when not on the whitelist or when an identity provider is missing).

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
[Web Annotation Data Model]: https://www.w3.org/TR/annotation-model/

## Maintainers

- [@stefandesu](https://github.com/stefandesu)
- [@nichtich](https://github.com/nichtich)

## Contribute

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2018 Verbundzentrale des GBV (VZG)
