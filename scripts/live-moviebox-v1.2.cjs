const provider =
  require("../providers/moviebox.js");

const tests = [
  {
    label: "Fight Club",
    tmdbId: "550",
    mediaType: "movie",
    season: null,
    episode: null
  }
];

function runOne(test) {
  const started = Date.now();

  const watchdog =
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(
          new Error(
            test.label +
            " timed out after 28 seconds"
          )
        );
      }, 28000);
    });

  return Promise.race([
    provider.getStreams(
      test.tmdbId,
      test.mediaType,
      test.season,
      test.episode
    ),
    watchdog
  ]).then(function (streams) {
    if (
      !Array.isArray(streams) ||
      streams.length === 0
    ) {
      throw new Error(
        test.label +
        " returned no streams"
      );
    }

    console.log(
      JSON.stringify(
        {
          label: test.label,
          elapsedMs:
            Date.now() - started,
          streamCount:
            streams.length,
          first: {
            quality:
              streams[0].quality,
            type:
              streams[0].type,
            hasUrl:
              !!streams[0].url
          }
        },
        null,
        2
      )
    );
  });
}

tests.reduce(function (promise, test) {
  return promise.then(function () {
    return runOne(test);
  });
}, Promise.resolve()).catch(function (error) {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );

  process.exit(1);
});
