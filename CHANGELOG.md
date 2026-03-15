## ...

- Malformed configuration of JWT key/algorithm will now prevent server from starting
- Add `download` parameter for annotations
- Allow PATCH for registries (#257)
- Support `identityGroups` also for `crossUser`
- Remove automatic generation of `namespace` key in configuration. This is only required by `bin/import.js` to generate reproducible mapping URIs.

## 2.4.1

- Fix bug on `POST /voc`
- Extend `/checkAuth` endpoint to return user data
- Deprecate configuration field `closedWorldAssumption`
- Fix empty search in suggest endpoints

## 2.4.0

- update to JSKOS specification 0.7.1
- extend documentation

- support new item type: registry (#204)
- add import script option --nobulk
- increase API version to 2.2

- don't ignore missing config files
- change configuration of changes API (**breaking change**)
- introduce configuration field: identityGroups

- refactor to allow use as module (not completed yet)
- increase requried node version to 22
- allow to calculate code coverage

More release notes can be found at <https://github.com/gbv/jskos-server/releases>
