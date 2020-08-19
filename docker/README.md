# [JSKOS Server](https://github.com/gbv/jskos-server)
[![Build Status](https://travis-ci.com/gbv/jskos-server.svg?branch=master)](https://travis-ci.com/gbv/jskos-server)

JSKOS Server implements the JSKOS API web service and storage for [JSKOS](https://gbv.github.io/jskos/jskos.html) data such as controlled vocabularies, concepts, and concept mappings. It is part of a larger infrastructure of [Project coli-conc](https://coli-conc.gbv.de).

- See [GitHub](https://github.com/gbv/jskos-server) for more information about the tool.

## Supported Architectures
Currently, only `x86-64` is supported, but we are planning to add more architectures soon.

## Available Tags
- The current release version is available under `latest`. However, new major versions might break compatibility of the previously used config file, therefore it is recommended to use a version tag instead.
- We follow SemVer for versioning the application. Therefore, `x` offers the latest image for the major version x, `x.y` offers the latest image for the minor version x.y, and `x.y.z` offers the image for a specific patch version x.y.z.
- Additionally, the latest development version is available under `dev`.

## Usage
It is recommended to run the image using [Docker Compose](https://docs.docker.com/compose/) together with the required MongoDB database. Note that depending on your system, it might be necessary to use `sudo docker-compose`.

1. Create `docker-compose.yml`:

```yml
version: "3"

services:
  jskos-server:
    image: coliconc/jskos-server
    # replace this with your UID/GID if necessary (id -u; id -g); remove on macOS/Windows
    user: 1000:1000
    depends_on:
      - mongo
    volumes:
      - ./data/config:/config
    # environment:
    #   - NODE_ENV=production # note that this requires the server to be run behind a HTTPS proxy
    ports:
      - 3000:3000
    restart: always

  mongo:
    image: mongo:4
    # replace this with your UID/GID if necessary (id -u; id -g); remove on macOS/Windows
    user: 1000:1000
    volumes:
      - ./data/db:/data/db
    restart: always
```

2. Create data folders:

```bash
mkdir -p ./data/{config,db}
```

3. Start the application:

```bash
docker-compose up -d
```

This will create and start a jskos-server container running under host port 3000 with data persistence under `./data`:

- `./data/config`: configuration files required for jskos-server (`config.json`), see below
- `./data/db`: data of the MongoDB container (note: make sure MongoDB data persistence works with your system, see section "Where to Store Data" [here](https://hub.docker.com/_/mongo))

Note that the `user` directives in the compose file make sure that the generated files are owned by your host user account. Use `id -u`/`id -g` to find out your UID/GID respectively, or remove the directives if you are using Docker on macOS/Windows.

You can now access the application under `http://localhost:3000`.

## Application Setup
Note: After adjusting any configurations, it is required to restart or recreate the container:
- After changing configuration files, restart the container: `docker-compose restart jskos-server`
- After changing `docker-compose.yml` (e.g. adjusting environment variables), recreate the container: `docker-compose up -d`

### Configuration
The folder `/config` (mounted as `./data/config` if configured as above) contains the configuration file `config.json` where jskos-server is configured. Please refer to the [documentation on GitHub](https://github.com/gbv/jskos-server#configuration) to see how to configure jskos-server. Note that this image creates a configuration file if none is found on startup. By default, the MongoDB `mongo` will be used (as configured above).

### Environment Variables

| Environment Variable | Description                                                                                   | Example Value       |
|----------------------|-----------------------------------------------------------------------------------------------|---------------------|
| `NODE_ENV`           | Should be set to `production` if used in production.*                                         | production          |
| `CONFIG_FILE`        | Path to the configuration file **inside the container**. Usually does not need to be changed. | /config/config.json |

*If `NODE_ENV` is set to production (which is recommended for productive use), jskos-server expects to be run behind a proxy using HTTPS. This also means that the config option `baseUrl` is required (see [documentation on GitHub](https://github.com/gbv/jskos-server#configuration)).

### Data Import
To get your data into jskos-server, please refer to [this section](https://github.com/gbv/jskos-server#data-import) in the documentation. For those commands to work inside the Docker container, skip the linking part and replace `jskos-import` with `docker-compose exec jskos-server /usr/src/app/bin/import.js` for each command.

**Note:** We are planning to improve the import process with the 1.2.0 release, so those commands might change in the near future.
