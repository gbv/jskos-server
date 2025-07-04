# [JSKOS Server](https://github.com/gbv/jskos-server)

JSKOS Server implements the JSKOS API web service and storage for [JSKOS](https://gbv.github.io/jskos/jskos.html) data such as controlled vocabularies, concepts, and concept mappings. It is part of a larger infrastructure of [Project coli-conc](https://coli-conc.gbv.de).

- See [GitHub](https://github.com/gbv/jskos-server) for more information about the tool.

**Note:** The old Docker Hub image (`coliconc/jskos-server`) is deprecated as of March 2023 and will not be updated anymore. We are moving all our Docker images to GitHub's Container Registry. From now on, **all new Docker images** will be available under `ghcr.io/gbv/jskos-server` (https://github.com/gbv/jskos-server/pkgs/container/jskos-server). Old images will still be available through Docker Hub for the foreseeable future.

## Supported Architectures
Currently, only `x86-64` is supported, but we are planning to add more architectures soon.

## Available Tags
- The current release version is available under `latest`. However, new major versions might break compatibility of the previously used config file, therefore it is recommended to use a version tag instead.
- We follow SemVer for versioning the application. Therefore, `x` offers the latest image for the major version x, `x.y` offers the latest image for the minor version x.y, and `x.y.z` offers the image for a specific patch version x.y.z.
- Additionally, the latest development version is available under `dev`.



## Usage

It is recommended to run the image using [Docker Compose](https://docs.docker.com/compose/) together with the required MongoDB database. Note that depending on your system, it might be necessary to use `sudo docker compose`. For older Docker versions, use `docker-compose` instead of `docker compose`.

JSKOS Server can run with **or without** MongoDB configured as a **replica set**, depending on whether you want to use the **Change Streams WebSocket API** (`/changes`).

If you **do not need** real-time change notifications via WebSocket, you can run MongoDB in standalone mode. This is the simplest and most common setup.


1. Create `docker-compose.yml`

##### Option 1: Without Replica Set (simpler setup)

In this setup, the Change API (`changesApi.enabled`) must remain **disabled** (default). The server will run normally without real-time WebSocket updates.

```yaml
version: "3"

services:
  jskos-server:
    image: ghcr.io/gbv/jskos-server
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
    restart: unless-stopped

  mongo:
    image: mongo:7
    # replace this with your UID/GID if necessary (id -u; id -g); remove on macOS/Windows
    user: 1000:1000
    volumes:
      - ./data/db:/data/db
    restart: unless-stopped
```

##### Option 2: With Replica Set (for Change Streams support)

If you want to use the WebSocket API for Change Streams, MongoDB must be configured as a **replica set**. You can do this with an additional setup container. In this setup, you **can enable** `changesApi.enabled` in your `config.json` to use the `/changes` WebSocket endpoint.

```yaml
version: "3"

services:
  jskos-server:
    image: ghcr.io/gbv/jskos-server
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
    restart: unless-stopped

  mongo:
    image: mongo:7
    # replace this with your UID/GID if necessary (id -u; id -g); remove on macOS/Windows
    user: 1000:1000
    entrypoint: [ "/usr/bin/mongod",  # The MongoDB server binary
    "--bind_ip_all",                  # Permit connections from any network interface
    "--replSet", "rs0"                # Start in replica‐set mode, naming the set “rs0”
    ]
    volumes:
      - ./data/db:/data/db
    restart: unless-stopped

  mongo-setup-replica-set:
    image: mongo:7
    depends_on:
      - mongo
    volumes: 
      - ./mongo-initdb.d:/docker-entrypoint-initdb.d
    restart: "no"
```

You'll also need to add a `mongo_setup.sh` script in `./mongo-initdb.d/` to initialize the replica set.


2. Create data folders:

```bash
mkdir -p ./data/{config,db}
```

3. Start the application:

```bash
docker compose up -d
```

This will create and start a jskos-server container running under host port 3000 with data persistence under `./data`:

- `./data/config`: configuration files required for jskos-server (`config.json`), see below
- `./data/db`: data of the MongoDB container (note: make sure MongoDB data persistence works with your system, see section "Where to Store Data" [here](https://hub.docker.com/_/mongo))

Note that the `user` directives in the compose file make sure that the generated files are owned by your host user account. Use `id -u`/`id -g` to find out your UID/GID respectively, or remove the directives if you are using Docker on macOS/Windows.

You can now access the application under `http://localhost:3000`.

## Application Setup
Note: After adjusting any configurations, it is required to restart or recreate the container:
- After changing configuration files, restart the container: `docker compose restart jskos-server`
- After changing `docker-compose.yml` (e.g. adjusting environment variables), recreate the container: `docker compose up -d`


### Replica Set Initialization Script

Place the following `mongo_setup.sh` (or similar) in `./mongo-initdb.d/` on the host:

```bash
#!/bin/bash

echo "🕒 Sleeping for 10 seconds to allow MongoDB to start..."
sleep 10

echo "⚙️ Initiating Replica Set at $(date)"

mongosh --host mongo:27017 <<EOF
rs.initiate({
  _id: "rs0",
  members: [ { _id: 0, host: "mongo:27017", priority: 1 } ]
});
EOF
```

* **Sleep**: ensures the `mongo` service is accepting connections.
* **`mongosh`**: connects to the `mongo` container by its Docker network alias.
* **`rs.initiate()`**: configures the single-node replica set named `rs0`.

With this setup, **jskos-server** can safely use MongoDB change streams (`db.collection.watch()`) for real-time WebSocket notifications.

### Configuration
The folder `/config` (mounted as `./data/config` if configured as above) contains the configuration file `config.json` where jskos-server is configured. Please refer to the [documentation on GitHub](https://github.com/gbv/jskos-server#configuration) to see how to configure jskos-server. Note that this image creates a configuration file if none is found on startup. By default, the MongoDB `mongo` will be used (as configured above).

### Environment Variables

| Environment Variable | Description                                                                                   | Example Value       |
|----------------------|-----------------------------------------------------------------------------------------------|---------------------|
| `NODE_ENV`           | Should be set to `production` if used in production.*                                         | production          |
| `CONFIG_FILE`        | Path to the configuration file **inside the container**. Usually does not need to be changed. | /config/config.json |

*If `NODE_ENV` is set to production (which is recommended for productive use), jskos-server expects to be run behind a proxy using HTTPS. This also means that the config option `baseUrl` is required (see [documentation on GitHub](https://github.com/gbv/jskos-server#configuration)).

### Data Import
To get your data into jskos-server, please refer to [this section](https://github.com/gbv/jskos-server#data-import) in the documentation. For those commands to work inside the Docker container, skip the linking part and replace `./bin/import.js` with `docker compose exec jskos-server /usr/src/app/bin/import.js` for each command.

**Note:** If files are imported, these have to be mounted into the container first, and the path inside the container has to be given. For example, you could mount the host folder `./data/imports` to `/imports` inside the container and then use the path `/imports/myfile.ndjson` with the import command. **We are planning to improve the import process with the 1.2.0 release, so those commands will change in the near future.** It will also be possible to upload files via a web interface so that no commands will be necessary anymore.
