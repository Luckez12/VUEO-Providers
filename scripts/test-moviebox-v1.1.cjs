const assert = require("node:assert");

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status == null ? 200 : status;
    this.ok = this.status >= 200 && this.status < 300;
  }

  json() {
    return Promise.resolve(this.body);
  }

  text() {
    return Promise.resolve(
      typeof this.body === "string"
        ? this.body
        : JSON.stringify(this.body)
    );
  }
}

let playRequests = [];
let searchRequests = [];
let captionRequests = [];

global.fetch = function (url, options) {
  options = options || {};

  if (
    url.indexOf(
      "https://www.themoviedb.org/movie/550"
    ) === 0
  ) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head>' +
        '<meta property="og:title" ' +
        'content="Fight Club (1999) — The Movie Database (TMDB)">' +
        '</head></html>'
      )
    );
  }

  if (
    url.indexOf(
      "https://www.themoviedb.org/tv/1396"
    ) === 0
  ) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head>' +
        '<meta property="og:title" ' +
        'content="Breaking Bad (2008) - The Movie Database (TMDB)">' +
        '</head></html>'
      )
    );
  }

  if (
    url.indexOf(
      "https://www.themoviedb.org/movie/999999"
    ) === 0
  ) {
    return Promise.resolve(
      new FakeResponse(
        "<html><title>Just a moment...</title></html>"
      )
    );
  }

  if (
    url.indexOf(
      "https://h5-api.aoneroom.com/" +
      "wefeed-h5api-bff/subject/search"
    ) === 0
  ) {
    searchRequests.push({
      url,
      options
    });

    const body = String(options.body || "");
    const isTv =
      body.indexOf("Breaking Bad") >= 0;

    return Promise.resolve(
      new FakeResponse({
        data: {
          items: [
            isTv
              ? {
                  subjectId: "tv123",
                  subjectType: 2,
                  title: "Breaking Bad",
                  releaseDate: "2008-01-20",
                  detailPath: "breaking-bad"
                }
              : {
                  subjectId: "mb123",
                  subjectType: 1,
                  title: "Fight Club",
                  releaseDate: "1999-10-15",
                  detailPath: "fight-club"
                }
          ]
        }
      })
    );
  }

  if (
    url.indexOf(
      "/wefeed-h5-bff/web/subject/search"
    ) >= 0
  ) {
    return Promise.resolve(
      new FakeResponse({
        data: {
          items: []
        }
      })
    );
  }

  if (
    url.indexOf(
      "/wefeed-h5-bff/web/subject/play"
    ) >= 0
  ) {
    playRequests.push({
      url,
      options
    });

    if (
      url.indexOf("https://h5.aoneroom.com/") === 0
    ) {
      return Promise.resolve(
        new FakeResponse({
          data: {
            streams: [
              {
                id: "stream-720",
                format: "MP4",
                url:
                  "https://cdn.example/video-720.mp4",
                resolutions: "720P"
              }
            ],
            hls: {
              "1080":
                "https://cdn.example/video-1080.m3u8"
            },
            dash: [],
            hasResource: true,
            limited: false
          }
        })
      );
    }

    return Promise.resolve(
      new FakeResponse({
        data: {
          streams: []
        }
      })
    );
  }

  if (
    url.indexOf(
      "https://h5-api.aoneroom.com/" +
      "wefeed-h5api-bff/subject/caption"
    ) === 0
  ) {
    captionRequests.push({
      url,
      options
    });

    return Promise.resolve(
      new FakeResponse({
        data: {
          captions: [
            {
              lan: "en",
              lanName: "English",
              url: "https://cdn.example/en.vtt"
            },
            {
              lan: "ms",
              lanName: "Malay",
              url: "https://cdn.example/ms.vtt"
            },
            {
              lan: "id",
              lanName: "Indonesian",
              url: "https://cdn.example/id.vtt"
            },
            {
              lan: "fr",
              lanName: "French",
              url: "https://cdn.example/fr.vtt"
            }
          ]
        }
      })
    );
  }

  return Promise.resolve(
    new FakeResponse({}, 404)
  );
};

const provider =
  require("../providers/moviebox.js");

function verifyCommon(streams) {
  assert.ok(Array.isArray(streams));
  assert.equal(streams.length, 2);

  assert.equal(
    streams[0].quality,
    "1080p"
  );

  assert.equal(
    streams[0].type,
    "m3u8"
  );

  assert.equal(
    streams[1].quality,
    "720p"
  );

  assert.equal(
    streams[1].type,
    "mp4"
  );

  assert.ok(
    streams[0].headers["User-Agent"]
  );

  assert.equal(
    streams[0].headers.Origin,
    "https://h5.aoneroom.com"
  );

  assert.ok(
    streams[0].headers.Referer.indexOf(
      "https://h5.aoneroom.com/" +
      "spa/videoPlayPage/movies/"
    ) === 0
  );

  assert.deepEqual(
    streams[0].subtitles
      .map(function (item) {
        return item.language;
      })
      .sort(),
    [
      "English",
      "Indonesian",
      "Malay"
    ]
  );
}

provider
  .getStreams(
    "550",
    "movie",
    null,
    null
  )
  .then(function (streams) {
    verifyCommon(streams);

    assert.equal(
      searchRequests.length > 0,
      true
    );

    assert.equal(
      searchRequests[0].url,
      "https://h5-api.aoneroom.com/" +
      "wefeed-h5api-bff/subject/search"
    );

    const moviePlay =
      playRequests.find(function (request) {
        return request.url.indexOf(
          "subjectId=mb123"
        ) >= 0;
      });

    assert.ok(moviePlay);
    assert.ok(
      moviePlay.url.indexOf(
        "detailPath=fight-club"
      ) >= 0
    );

    assert.ok(
      moviePlay.url.indexOf(
        "&se=0&ep=0"
      ) >= 0
    );

    assert.equal(
      moviePlay.options.headers.Origin,
      "https://h5.aoneroom.com"
    );

    assert.ok(
      moviePlay.options.headers.Referer.indexOf(
        "detailSe=0"
      ) >= 0
    );

    assert.ok(
      moviePlay.options.headers.Referer.indexOf(
        "detailEp=0"
      ) >= 0
    );

    assert.ok(
      captionRequests[0].url.indexOf(
        "detailPath=fight-club"
      ) >= 0
    );

    return provider.getStreams(
      "1396",
      "tv",
      2,
      5
    );
  })
  .then(function (streams) {
    verifyCommon(streams);

    const tvPlay =
      playRequests.find(function (request) {
        return request.url.indexOf(
          "subjectId=tv123"
        ) >= 0;
      });

    assert.ok(tvPlay);

    assert.ok(
      tvPlay.url.indexOf(
        "&se=2&ep=5"
      ) >= 0
    );

    assert.ok(
      tvPlay.url.indexOf(
        "detailPath=breaking-bad"
      ) >= 0
    );

    assert.ok(
      tvPlay.options.headers.Referer.indexOf(
        "detailSe=2"
      ) >= 0
    );

    assert.ok(
      tvPlay.options.headers.Referer.indexOf(
        "detailEp=5"
      ) >= 0
    );

    return provider.getStreams(
      "999999",
      "movie",
      null,
      null
    ).then(
      function () {
        throw new Error(
          "Expected diagnostic failure"
        );
      },
      function (error) {
        assert.ok(
          String(error.message).indexOf(
            "[MovieBox][diag] stage=tmdb"
          ) === 0
        );
      }
    );
  })
  .then(function () {
    console.log(
      "MovieBox v1.1 mock tests passed."
    );
  })
  .catch(function (error) {
    console.error(
      error && error.stack
        ? error.stack
        : error
    );
    process.exit(1);
  });
