# 4KHDHub VUEO port

Source reference: `reference/cloudstream/4KHDHub/`

Target runtime contract:

```js
function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.resolve([]);
}
```

Port search, episode resolution, stream extraction, headers and subtitles into JavaScript before enabling this provider in `manifest.json`.
