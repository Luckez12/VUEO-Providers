// MSM21 for VUEO
// Bootstrap stub generated from Luckez12/Cloudstream-Repo.
// Intentionally disabled until the CloudStream logic is ported and verified.

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[MSM21] provider not ported yet");
  return Promise.resolve([]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
