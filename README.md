# JSKOS Server

[![Build Status](https://travis-ci.com/gbv/jskos-server.svg?branch=master)](https://travis-ci.com/gbv/jskos-server)

> Web service to access [JSKOS] data

JSKOS Server is a web server for [JSKOS] data. It is currently under development.

[JSKOS]: https://gbv.github.io/jskos/jskos.html

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
TODO: This section needs to be updated.

* **URL**

  /mappings

* **Method**

  `GET`

* **URL Params**

  `from=[uri]` specify the source URI

  `to=[uri]` specify the target URI

  `limit=[number]` limits the number of results (default 100)

* **Success Response**

  **Code:** 200

  **Concent:** JSON array of [JSKOS Concept Mappings]

* **Sample Call**

  ``` bash
  curl http://localhost:3000/mappings?from=http://rvk.uni-regensburg.de/nt/DD_2000
  ```

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
