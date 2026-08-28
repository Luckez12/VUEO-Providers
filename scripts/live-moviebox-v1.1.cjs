const provider =
  require("../providers/moviebox.js");

const started = Date.now();

const watchdog =
  new Promise(function (_, reject) {
    setTimeout(function () {
      reject(
        new Error(
          "Live MovieBox v1.1 smoke test " +
          "timed out after 28 seconds"
        )
      );
    }, 28000);
  });

Promise.race([
  provider.getStreams(
    "550",
    "movie",
    null,
    null
  ),
  watchdog
]).then(function (streams) {
  if (
    !Array.isArray(streams) ||
    streams.length === 0
  ) {
    throw new Error(
      "Live test returned no streams"
    );
  }

  const first = streams[0];

  console.log(
    JSON.stringify(
      {
        elapsedMs:
          Date.now() - started,
        streamCount:
          streams.length,
        first: {
          name: first.name,
          quality: first.quality,
          type: first.type,
          hasUrl: !!first.url,
          hasHeaders:
            !!first.headers,
          subtitleCount:
            Array.isArray(first.subtitles)
              ? first.subtitles.length
              : 0
        }
      },
      null,
      2
    )
  );
}).catch(function (error) {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});
