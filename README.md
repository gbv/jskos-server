# JSKOS Server
[![Build Status](https://travis-ci.com/gbv/jskos-server.svg?branch=master)](https://travis-ci.com/gbv/jskos-server)

Simple JSKOS Mapping Provider to retrieve [JSKOS Concept Mappings] via HTTP.

[JSKOS Concept Mappings]: https://gbv.github.io/jskos/jskos.html#concept-mappings

## Prerequisites

You need to have access to a [MongoDB database](https://docs.mongodb.com/manual/installation/).

## Database Setup

First download mappings, for instance from <https://coli-conc.gbv.de/concordances/> and import the into a MongoDB collection:

``` bash
wget http://coli-conc.gbv.de/concordances/csv/rvk_gnd_ubregensburg.ndjson
mongoimport --db rvk_gnd_ubregensburg --collection mappings --file rvk_gnd_ubregensburg.ndjson
```

You can change the MongoDB database and collection for the import, but then you'll need to create a custom configuration file (see below).

## Build Setup

``` bash
# clone the repository
git clone https://github.com/gbv/mappings-api.git
cd mappings-api/

# install dependencies
npm install

# serve with hot reload and auto reconnect at localhost:3000 (default)
npm run start

# run tests (tests will use the real MongoDB with `-test` appended to the database name)
npm test
```

## Configuration

You can customize the port and the MongoDB connection settings via environment variables, for example through a `.env` file:

```bash
PORT=__EXPRESS_PORT__
MONGO_HOST=__MONGODB_HOSTNAME__
MONGO_PORT=__MONGODB_PORT__
MONGO_DB=__MONGODB_DATABASE__
```

## API Usage

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

The application is currently deployed at http://coli-conc.gbv.de/api/mappings. At the moment, there is no automatic deployment of new versions.

### Notes about depolyment on Ubuntu
It is recommended to use a [newer version of Node.js](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions). Installing the dependencies might also require installing nodejs-legacy: `sudo apt-get install nodejs-legacy` ([more info here](https://stackoverflow.com/questions/21168141/cannot-install-packages-using-node-package-manager-in-ubuntu)). One possibility for running the application in production on Ubuntu 16.04 is described [here](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04).

### Update an instances deployed with PM2
```
# get updates from repository
git pull

# restart the process (adjust process name if needed)
pm2 restart mappings-api
```
