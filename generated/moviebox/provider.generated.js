// AUTO-GENERATED VUEO conversion scaffold.
// Source: CloudStream/MovieBox
// Status: AUTO_PORT_CANDIDATE | score=93
// Kotlin files: src/main/kotlin/com/moviebox/MovieboxPlugin.kt, src/main/kotlin/com/moviebox/MovieboxProvider.kt
// Do not promote this file to providers/ until runtime tests pass.

var CS_PROVIDER_ID = "moviebox";
var CS_BASE_URLS = [
  "https://moviebox.ph"
];

// TODO: Coroutine concurrency needs Promise translation

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[VUEO converter] provider=" + CS_PROVIDER_ID + " status=AUTO_PORT_CANDIDATE tmdbId=" + tmdbId);
  return Promise.resolve([]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
