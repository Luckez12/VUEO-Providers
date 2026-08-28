const provider = require("../providers/moviebox.js");

const timeout = new Promise(function (_, reject) {
  setTimeout(function () {
    reject(new Error("Live MovieBox smoke test timed out"));
  }, 30000);
});

Promise.race([
  provider.getStreams("550", "movie", null, null),
  timeout
]).then(function (streams) {
  if (!Array.isArray(streams) || streams.length === 0) {
    console.error("Live smoke test returned no streams.");
    process.exit(2);
  }

  const first = streams[0];
  console.log("Live MovieBox streams:", streams.length);
  console.log(
    JSON.stringify(
      {
        name: first.name,
        quality: first.quality,
        type: first.type,
        hasUrl: !!first.url,
        hasHeaders: !!first.headers
      },
      null,
      2
    )
  );
}).catch(function (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
