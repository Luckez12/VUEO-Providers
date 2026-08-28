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
      typeof this.body === "string" ? this.body : JSON.stringify(this.body)
    );
  }
}

let lastPlayUrl = "";

global.fetch = function (url, options) {
  if (url.indexOf("https://www.themoviedb.org/movie/550") === 0) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head><meta property="og:title" content="Fight Club"></head></html>'
      )
    );
  }

  if (url.indexOf("https://www.themoviedb.org/tv/1396") === 0) {
    return Promise.resolve(
      new FakeResponse(
        '<html><head><meta property="og:title" content="Breaking Bad"></head></html>'
      )
    );
  }

  if (url.indexOf("/subject/search") >= 0) {
    const body = String(options && options.body || "");
    const isTv = body.indexOf("Breaking Bad") >= 0;

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

  if (url.indexOf("/subject/play") >= 0) {
    lastPlayUrl = url;
    return Promise.resolve(
      new FakeResponse({
        data: {
          streams: [
            {
              id: "s1",
              format: "HLS",
              url: "https://cdn.example/video-1080.m3u8",
              resolutions: "1080P"
            },
            {
              id: "s2",
              format: "MP4",
              url: "https://cdn.example/video-720.mp4",
              resolutions: "720P"
            }
          ]
        }
      })
    );
  }

  if (url.indexOf("/subject/caption") >= 0) {
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

  return Promise.resolve(new FakeResponse({}, 404));
};

const provider = require("../providers/moviebox.js");

function assertStreams(streams) {
  assert.equal(streams.length, 2);
  assert.equal(streams[0].name, "MovieBox");
  assert.equal(streams[0].quality, "1080p");
  assert.equal(streams[0].type, "m3u8");
  assert.equal(streams[1].quality, "720p");
  assert.equal(streams[1].type, "mp4");
  assert.ok(streams[0].headers["User-Agent"]);
  assert.ok(streams[0].headers.Referer.indexOf("https://moviebox.") === 0);
  assert.deepEqual(
    streams[0].subtitles.map(function (item) { return item.language; }).sort(),
    ["English", "Indonesian", "Malay"]
  );
}

provider.getStreams("550", "movie", null, null)
  .then(function (streams) {
    assertStreams(streams);
    assert.ok(lastPlayUrl.indexOf("&se=0&ep=0") >= 0);
    return provider.getStreams("1396", "tv", 2, 5);
  })
  .then(function (streams) {
    assertStreams(streams);
    assert.ok(lastPlayUrl.indexOf("&se=2&ep=5") >= 0);
    console.log("MovieBox mock end-to-end tests passed.");
  })
  .catch(function (error) {
    console.error(error);
    process.exit(1);
  });
