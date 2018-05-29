Simple JSON API to retrieve [JSKOS Concept Mappings](https://gbv.github.io/jskos/jskos.html#concept-mappings) for mappings between RVK and GND.

## Prerequisites

You need to have access to a [MongoDB database](https://docs.mongodb.com/manual/installation/).

## Database Setup

``` bash
# download the mappings
wget http://coli-conc.gbv.de/concordances/csv/rvk_gnd_ubregensburg.ndjson

# import the mapping into MongoDB
mongoimport --db rvk_gnd_ubregensburg --collection mappings --file rvk_gnd_ubregensburg.ndjson
```
You can change the MongoDB database and collection for the import, but then you'll need to create a custom [configuration file](#configuration).

## Build Setup

``` bash
# install dependencies
npm install

# serve with hot reload and auto reconnect at localhost:3000 (default)
npm run start
```

## Configuration

You can customize the port and the MongoDB connection settings in config.user.js:

``` bash
cp config.sample.js config.user.js
```
