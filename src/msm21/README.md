# MSM21 VUEO port

Source reference: `reference/cloudstream/MSM21/`

Target runtime contract:

```js
function getStreams(tmdbId, mediaType, season, episode) {
  return Promise.resolve([]);
}
```

Port search, episode resolution, stream extraction, headers and subtitles into JavaScript before enabling this provider in `manifest.json`.
