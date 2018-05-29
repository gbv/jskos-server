# mapping-api

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

## API Usage

* **URL**
  
  /mappings

* **Method**
  
  `GET`

* **URL Params**
  
  `from=[uri]` or `to=[uri]`
  
  Missing parameters will result in an empty response array.

* **Success Response**
  
  **Code:** 200
  
  **Concent:** JSON array of [JSKOS Concept Mappings]

* **Sample Call**
  
  ``` bash
  curl http://localhost:3000/mappings?from=http://rvk.uni-regensburg.de/nt/DD_2000
  ```

