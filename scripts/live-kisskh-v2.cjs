const provider = require("../generated/kisskh/provider.generated.js");

const watchdog = new Promise(function(_, reject) {
  setTimeout(function() {
    reject(new Error("KissKH live smoke test timed out"));
  }, 30000);
});

Promise.race([
  provider.getStreams("1396", "tv", 1, 1),
  watchdog
]).then(function(streams) {
  if (!Array.isArray(streams) || streams.length === 0) {
    throw new Error("KissKH returned no direct streams");
  }

  console.log(JSON.stringify({
    streamCount: streams.length,
    first: {
      quality: streams[0].quality,
      type: streams[0].type,
      hasUrl: !!streams[0].url,
      subtitleCount: Array.isArray(streams[0].subtitles)
        ? streams[0].subtitles.length
        : 0
    }
  }, null, 2));
}).catch(function(error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
