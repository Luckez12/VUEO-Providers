const assert = require("node:assert");

class FakeResponse {
  constructor(body, status) {
    this.body = body;
    this.status = status == null ? 200 : status;
    this.ok =
      this.status >= 200 &&
      this.status < 300;
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

let searchCalls = 0;
let playCalls = [];

global.fetch = function (url, options) {
  options = options || {};

  if (
    url.indexOf(
      "https://www.themoviedb.org/tv/249042"
    ) === 0
  ) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head>' +
        '<meta property="og:title" ' +
        'content="Obsession (2023) - The Movie Database (TMDB)">' +
        '</head>' +
        '<script>' +
        '{"original_name":"Obsesión"}' +
        '</script></html>'
      )
    );
  }

  if (
    url.indexOf(
      "https://www.themoviedb.org/movie/550"
    ) === 0
  ) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head>' +
        '<meta property="og:title" ' +
        'content="Fight Club (1999) - The Movie Database (TMDB)">' +
        '</head></html>'
      )
    );
  }

  if (
    url.indexOf("/subject/search") >= 0 ||
    url.indexOf("/subject-api/search") >= 0
  ) {
    searchCalls += 1;

    const body =
      String(options.body || "");

    if (
      body.indexOf("Fight Club") >= 0 ||
      url.indexOf("Fight%20Club") >= 0
    ) {
      return Promise.resolve(
        new FakeResponse({
          data: {
            items: [{
              subjectId: "fc1",
              subjectType: "1",
              title: "Fight Club",
              releaseDate: "1999-10-15",
              detailPath: "fight-club"
            }]
          }
        })
      );
    }

    if (
      body.indexOf("Obsession") >= 0 ||
      url.indexOf("Obsession") >= 0
    ) {
      return Promise.resolve(
        new FakeResponse({
          data: {
            results: {
              content: [
                {
                  subjectId: "wrong-type",
                  subjectType: 1,
                  title: "Obsession",
                  releaseDate: "2023-05-02",
                  detailPath: "obsession-movie"
                },
                {
                  subjectId: "old-tv",
                  subjectType: 2,
                  title: "Obsession",
                  releaseDate: "2016-01-01",
                  detailPath: "obsession-old"
                },
                {
                  subjectId: "correct-tv",
                  subjectType: "2",
                  name: "Obsession",
                  releaseYear: 2023,
                  detailPath: "obsession"
                },
                {
                  subjectId: "partial",
                  subjectType: 2,
                  title: "Secret Obsession",
                  releaseDate: "2019-01-01",
                  detailPath: "secret-obsession"
                }
              ]
            }
          }
        })
      );
    }

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
    playCalls.push({ url, options });

    const isObsession =
      url.indexOf("correct-tv") >= 0;

    return Promise.resolve(
      new FakeResponse({
        data: {
          streams: [{
            id: "s720",
            format: "MP4",
            url:
              "https://cdn.example/video-720.mp4",
            resolutions: "720P"
          }],
          hls: {
            "1080":
              "https://cdn.example/video-1080.m3u8"
          },
          hasResource: true,
          limited: false,
          marker:
            isObsession
              ? "obsession"
              : "fight-club"
        }
      })
    );
  }

  if (
    url.indexOf(
      "/wefeed-h5api-bff/subject/caption"
    ) >= 0
  ) {
    return Promise.resolve(
      new FakeResponse({
        data: {
          captions: [
            {
              lan: "en",
              lanName: "English",
              url:
                "https://cdn.example/en.vtt"
            },
            {
              lan: "ms",
              lanName: "Malay",
              url:
                "https://cdn.example/ms.vtt"
            },
            {
              lan: "id",
              lanName: "Indonesian",
              url:
                "https://cdn.example/id.vtt"
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

function verifyStreams(streams) {
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
    "249042",
    "tv",
    1,
    2
  )
  .then(function (streams) {
    verifyStreams(streams);

    const obsessionPlay =
      playCalls.find(function (call) {
        return call.url.indexOf(
          "subjectId=correct-tv"
        ) >= 0;
      });

    assert.ok(
      obsessionPlay,
      "Expected correct Obsession TV candidate"
    );

    assert.ok(
      obsessionPlay.url.indexOf(
        "&se=1&ep=2"
      ) >= 0
    );

    assert.ok(
      obsessionPlay.url.indexOf(
        "detailPath=obsession"
      ) >= 0
    );

    return provider.getStreams(
      "550",
      "movie",
      null,
      null
    );
  })
  .then(function (streams) {
    verifyStreams(streams);

    const fightClubPlay =
      playCalls.find(function (call) {
        return call.url.indexOf(
          "subjectId=fc1"
        ) >= 0;
      });

    assert.ok(
      fightClubPlay,
      "Expected Fight Club candidate"
    );

    assert.ok(
      searchCalls >= 2,
      "Expected multi-source search discovery"
    );

    console.log(
      "MovieBox v1.2 candidate discovery tests passed."
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
