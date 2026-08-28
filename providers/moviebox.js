// MovieBox provider for VUEO
// v1.1 diagnostic and resolver repair.
// Runtime code uses Web APIs and Promise chains only.

var MOVIEBOX_NAME = "MovieBox";
var MOVIEBOX_VERSION = "1.1.0";

var MOVIEBOX_H5_API = "https://h5-api.aoneroom.com";
var MOVIEBOX_STREAM_BASE = "https://h5.aoneroom.com";
var MOVIEBOX_WEB_HOSTS = [
  "https://moviebox.ph",
  "https://moviebox.pk",
  "https://moviebox.ng",
  "https://filmboom.top"
];

var MOVIEBOX_UA =
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";

var MOVIEBOX_COMMON_HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Request-Lang": "en",
  "X-Client-Info": "{\"timezone\":\"Asia/Kuala_Lumpur\"}",
  "User-Agent": MOVIEBOX_UA
};

var MOVIEBOX_TMDB_TIMEOUT_MS = 11000;
var MOVIEBOX_SEARCH_TIMEOUT_MS = 5200;
var MOVIEBOX_PLAY_TIMEOUT_MS = 6500;
var MOVIEBOX_CAPTION_TIMEOUT_MS = 2600;

function mbNow() {
  return Date.now ? Date.now() : 0;
}

function mbTrace(stage, status, detail, startedAt) {
  var elapsed = startedAt ? (mbNow() - startedAt) : 0;
  var line =
    "[MovieBox][diag] stage=" + stage +
    " status=" + status +
    (elapsed ? " ms=" + elapsed : "") +
    (detail ? " " + detail : "");
  console.log(line);
}

function mbError(stage, detail) {
  return new Error(
    "[MovieBox][diag] stage=" + stage +
    " " + String(detail || "failed")
  );
}

function copyHeaders(base, extra) {
  var out = {};
  Object.keys(base || {}).forEach(function (key) {
    out[key] = base[key];
  });
  Object.keys(extra || {}).forEach(function (key) {
    out[key] = extra[key];
  });
  return out;
}

function fetchTextWithTimeout(url, options, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error("timeout after " + timeoutMs + "ms"));
      }
    }, timeoutMs);

    fetch(url, options || {}).then(function (response) {
      if (!response || !response.ok) {
        throw new Error("HTTP " + (response ? response.status : "unknown"));
      }
      return response.text();
    }).then(function (text) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(text);
      }
    }, function (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function fetchJsonWithTimeout(url, options, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error("timeout after " + timeoutMs + "ms"));
      }
    }, timeoutMs);

    fetch(url, options || {}).then(function (response) {
      if (!response || !response.ok) {
        throw new Error("HTTP " + (response ? response.status : "unknown"));
      }
      return response.json();
    }).then(function (json) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(json);
      }
    }, function (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html, key) {
  var escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var patterns = [
    new RegExp(
      '<meta[^>]+(?:property|name)=["\\\']' + escaped +
      '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']',
      "i"
    ),
    new RegExp(
      '<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+' +
      '(?:property|name)=["\\\']' + escaped + '["\\\']',
      "i"
    )
  ];

  for (var i = 0; i < patterns.length; i += 1) {
    var match = html.match(patterns[i]);
    if (match && match[1]) {
      return decodeHtml(match[1]).trim();
    }
  }

  return "";
}

function cleanTmdbTitle(value) {
  var title = decodeHtml(value || "")
    .replace(/\s+/g, " ")
    .trim();

  title = title
    .replace(
      /\s*[|\-\u2013\u2014]\s*(?:The Movie Database.*|TMDB.*)$/i,
      ""
    )
    .trim();

  return title;
}

function resolveTmdbMetadata(tmdbId, mediaType) {
  var started = mbNow();
  var type = String(mediaType || "").toLowerCase() === "tv"
    ? "tv"
    : "movie";

  var url =
    "https://www.themoviedb.org/" +
    type +
    "/" +
    encodeURIComponent(String(tmdbId)) +
    "?language=en-US";

  mbTrace("tmdb", "start", "id=" + tmdbId + " type=" + type, started);

  return fetchTextWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": MOVIEBOX_UA
      }
    },
    MOVIEBOX_TMDB_TIMEOUT_MS
  ).then(function (html) {
    var raw =
      extractMeta(html, "og:title") ||
      extractMeta(html, "twitter:title");

    if (!raw) {
      var titleTag =
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      raw = titleTag && titleTag[1] ? titleTag[1] : "";
    }

    var title = cleanTmdbTitle(raw);

    if (
      !title ||
      /just a moment|attention required|access denied/i.test(title)
    ) {
      throw mbError(
        "tmdb",
        "metadata page did not expose a usable English title"
      );
    }

    var year = null;
    var yearMatch = title.match(/\((19|20)\d{2}\)$/);

    if (yearMatch) {
      year = parseInt(
        yearMatch[0].replace(/[()]/g, ""),
        10
      );
      title = title
        .replace(/\s*\((19|20)\d{2}\)$/, "")
        .trim();
    }

    mbTrace(
      "tmdb",
      "ok",
      "title=" + JSON.stringify(title) +
        (year ? " year=" + year : ""),
      started
    );

    return {
      title: title,
      year: year,
      mediaType: type
    };
  }).catch(function (error) {
    mbTrace(
      "tmdb",
      "failed",
      "error=" +
        (error && error.message ? error.message : String(error)),
      started
    );

    if (
      error &&
      String(error.message || "").indexOf(
        "[MovieBox][diag] stage=tmdb"
      ) === 0
    ) {
      throw error;
    }

    throw mbError(
      "tmdb",
      error && error.message ? error.message : String(error)
    );
  });
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAudioPenalty(value) {
  var title = String(value || "");
  if (/\bhindi\b/i.test(title)) return 18;
  if (/\bdubbed\b/i.test(title)) return 8;
  return 0;
}

function scoreCandidate(item, metadata) {
  if (!item || !item.subjectId || !item.title) {
    return -9999;
  }

  var expectedType = metadata.mediaType === "tv" ? 2 : 1;
  var actualType = parseInt(item.subjectType, 10);
  var actual = normalizeTitle(item.title);
  var target = normalizeTitle(metadata.title);
  var score = 0;

  if (actualType === expectedType) {
    score += 40;
  } else if (!isNaN(actualType)) {
    score -= 35;
  }

  if (actual === target) {
    score += 125;
  } else if (
    actual.replace(/\s/g, "") ===
    target.replace(/\s/g, "")
  ) {
    score += 110;
  } else if (
    actual.indexOf(target) >= 0 ||
    target.indexOf(actual) >= 0
  ) {
    score += 65;
  } else {
    var targetWords = target.split(" ").filter(Boolean);
    var actualWords = actual.split(" ").filter(Boolean);
    var overlap = targetWords.filter(function (word) {
      return actualWords.indexOf(word) >= 0;
    }).length;

    score += targetWords.length
      ? Math.round((overlap / targetWords.length) * 45)
      : 0;
  }

  if (metadata.year && item.releaseDate) {
    var itemYear = parseInt(
      String(item.releaseDate).slice(0, 4),
      10
    );

    if (itemYear === metadata.year) {
      score += 25;
    } else if (
      !isNaN(itemYear) &&
      Math.abs(itemYear - metadata.year) === 1
    ) {
      score += 8;
    }
  }

  score -= detectAudioPenalty(item.title);
  return score;
}

function selectCandidate(items, metadata) {
  var ranked = (items || []).map(function (item) {
    return {
      item: item,
      score: scoreCandidate(item, metadata)
    };
  }).sort(function (a, b) {
    return b.score - a.score;
  });

  if (!ranked.length || ranked[0].score < 55) {
    return null;
  }

  return ranked[0];
}

function firstSuccessful(tasks, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var finished = 0;

    if (!tasks.length) {
      resolve(null);
      return;
    }

    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    function completeEmpty() {
      finished += 1;

      if (!settled && finished >= tasks.length) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }

    tasks.forEach(function (task) {
      task().then(function (value) {
        if (!settled && value) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
          return;
        }

        completeEmpty();
      }, function () {
        completeEmpty();
      });
    });
  });
}

function extractSearchItems(json) {
  if (
    json &&
    json.data &&
    Array.isArray(json.data.items)
  ) {
    return json.data.items;
  }

  return [];
}

function searchMovieBox(metadata) {
  var started = mbNow();
  var payload = JSON.stringify({
    keyword: metadata.title,
    page: 1,
    perPage: 24,
    subjectType: 0
  });

  mbTrace(
    "search",
    "start",
    "query=" + JSON.stringify(metadata.title),
    started
  );

  var targets = [
    {
      label: "H5API",
      url:
        MOVIEBOX_H5_API +
        "/wefeed-h5api-bff/subject/search",
      headers: copyHeaders(
        MOVIEBOX_COMMON_HEADERS,
        {
          "Content-Type": "application/json"
        }
      ),
      seedHost: MOVIEBOX_STREAM_BASE
    }
  ].concat(
    MOVIEBOX_WEB_HOSTS.map(function (host) {
      return {
        label: host
          .replace(/^https?:\/\//, "")
          .split(".")[0]
          .toUpperCase(),
        url:
          host +
          "/wefeed-h5-bff/web/subject/search",
        headers: copyHeaders(
          MOVIEBOX_COMMON_HEADERS,
          {
            "Content-Type": "application/json",
            "Referer": host + "/"
          }
        ),
        seedHost: host
      };
    })
  );

  var tasks = targets.map(function (target) {
    return function () {
      var requestStarted = mbNow();

      return fetchJsonWithTimeout(
        target.url,
        {
          method: "POST",
          headers: target.headers,
          body: payload
        },
        MOVIEBOX_SEARCH_TIMEOUT_MS - 300
      ).then(function (json) {
        var items = extractSearchItems(json);
        var selected = selectCandidate(
          items,
          metadata
        );

        mbTrace(
          "search-host",
          selected ? "match" : "empty",
          "host=" + target.label +
            " items=" + items.length +
            (selected
              ? " score=" + selected.score +
                " title=" +
                JSON.stringify(selected.item.title)
              : ""),
          requestStarted
        );

        if (!selected) {
          return null;
        }

        return {
          searchLabel: target.label,
          seedHost: target.seedHost,
          subject: selected.item,
          score: selected.score
        };
      }).catch(function (error) {
        mbTrace(
          "search-host",
          "failed",
          "host=" + target.label +
            " error=" +
            (error && error.message
              ? error.message
              : String(error)),
          requestStarted
        );

        return null;
      });
    };
  });

  return firstSuccessful(
    tasks,
    MOVIEBOX_SEARCH_TIMEOUT_MS
  ).then(function (result) {
    if (!result || !result.subject) {
      mbTrace(
        "search",
        "failed",
        "no matching MovieBox subject",
        started
      );

      throw mbError(
        "search",
        "no matching MovieBox subject for " +
          JSON.stringify(metadata.title)
      );
    }

    mbTrace(
      "search",
      "ok",
      "host=" + result.searchLabel +
        " subjectId=" + result.subject.subjectId +
        " detailPath=" +
        String(result.subject.detailPath || ""),
      started
    );

    return result;
  });
}

function absoluteStreamUrl(value) {
  var url = String(value || "").trim();

  if (
    url.indexOf("https://") === 0 ||
    url.indexOf("http://") === 0
  ) {
    return url;
  }

  return "";
}

function sourceQuality(value) {
  var text = String(value || "");
  var match =
    text.match(
      /(2160|1440|1080|720|576|540|480|360|240|144)/i
    );

  return match ? parseInt(match[1], 10) : 0;
}

function mapValueCaseInsensitive(obj, names) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  var keys = Object.keys(obj);

  for (var i = 0; i < names.length; i += 1) {
    var wanted = String(names[i]).toLowerCase();

    for (var j = 0; j < keys.length; j += 1) {
      if (String(keys[j]).toLowerCase() === wanted) {
        return obj[keys[j]];
      }
    }
  }

  return null;
}

function normalizeSourceNode(node, host, referer, kind) {
  if (node == null) {
    return [];
  }

  if (typeof node === "string") {
    var direct = absoluteStreamUrl(node);

    if (!direct) {
      return [];
    }

    return [{
      host: host,
      referer: referer,
      id: null,
      format: kind,
      url: direct,
      quality: sourceQuality(direct),
      kind: kind
    }];
  }

  if (Array.isArray(node)) {
    var listOut = [];

    node.forEach(function (child) {
      listOut = listOut.concat(
        normalizeSourceNode(
          child,
          host,
          referer,
          kind
        )
      );
    });

    return listOut;
  }

  if (typeof node === "object") {
    var directUrl = absoluteStreamUrl(
      mapValueCaseInsensitive(
        node,
        ["url", "file", "src", "playUrl"]
      )
    );

    if (directUrl) {
      var rawQuality =
        mapValueCaseInsensitive(
          node,
          [
            "resolutions",
            "resolution",
            "quality",
            "height"
          ]
        );

      return [{
        host: host,
        referer: referer,
        id: mapValueCaseInsensitive(
          node,
          ["id", "streamId"]
        ),
        format:
          mapValueCaseInsensitive(
            node,
            ["format", "type"]
          ) || kind,
        url: directUrl,
        quality:
          sourceQuality(rawQuality) ||
          sourceQuality(directUrl),
        kind: kind
      }];
    }

    var objectOut = [];

    Object.keys(node).forEach(function (key) {
      var child = node[key];

      if (typeof child === "string") {
        var childUrl = absoluteStreamUrl(child);

        if (childUrl) {
          objectOut.push({
            host: host,
            referer: referer,
            id: null,
            format: kind,
            url: childUrl,
            quality:
              sourceQuality(key) ||
              sourceQuality(childUrl),
            kind: kind
          });
          return;
        }
      }

      objectOut = objectOut.concat(
        normalizeSourceNode(
          child,
          host,
          referer,
          kind
        )
      );
    });

    return objectOut;
  }

  return [];
}

function buildPlayReferer(
  host,
  subject,
  season,
  episode
) {
  var detailPath =
    subject && subject.detailPath
      ? String(subject.detailPath)
      : "";

  if (!detailPath) {
    return host + "/";
  }

  return (
    host +
    "/spa/videoPlayPage/movies/" +
    detailPath +
    "?id=" +
    encodeURIComponent(
      String(subject.subjectId)
    ) +
    "&type=/movie/detail" +
    "&detailSe=" +
    encodeURIComponent(String(season)) +
    "&detailEp=" +
    encodeURIComponent(String(episode)) +
    "&lang=en"
  );
}

function orderedPlayHosts(seedHost) {
  var output = [];

  function add(host) {
    if (
      host &&
      output.indexOf(host) < 0
    ) {
      output.push(host);
    }
  }

  add(seedHost);
  add(MOVIEBOX_STREAM_BASE);

  MOVIEBOX_WEB_HOSTS.forEach(add);
  return output;
}

function fetchPlayableStreams(
  subject,
  seedHost,
  mediaType,
  season,
  episode
) {
  var started = mbNow();
  var subjectId = String(subject.subjectId);
  var se =
    mediaType === "tv"
      ? (parseInt(season, 10) || 1)
      : 0;
  var ep =
    mediaType === "tv"
      ? (parseInt(episode, 10) || 1)
      : 0;
  var detailPath =
    subject && subject.detailPath
      ? String(subject.detailPath)
      : "";

  var hosts = orderedPlayHosts(seedHost);

  mbTrace(
    "play",
    "start",
    "subjectId=" + subjectId +
      " s=" + se +
      " e=" + ep +
      " hosts=" + hosts.length,
    started
  );

  var tasks = hosts.map(function (host) {
    return function () {
      var requestStarted = mbNow();
      var referer = buildPlayReferer(
        host,
        subject,
        se,
        ep
      );

      var url =
        host +
        "/wefeed-h5-bff/web/subject/play" +
        "?subjectId=" +
        encodeURIComponent(subjectId) +
        "&se=" +
        encodeURIComponent(String(se)) +
        "&ep=" +
        encodeURIComponent(String(ep)) +
        "&detailPath=" +
        encodeURIComponent(detailPath);

      return fetchJsonWithTimeout(
        url,
        {
          method: "GET",
          headers: copyHeaders(
            MOVIEBOX_COMMON_HEADERS,
            {
              "Accept":
                "application/json, text/plain, */*",
              "Origin": host,
              "Referer": referer
            }
          )
        },
        MOVIEBOX_PLAY_TIMEOUT_MS - 300
      ).then(function (json) {
        var data =
          json && json.data
            ? json.data
            : null;

        if (!data) {
          mbTrace(
            "play-host",
            "empty",
            "host=" + host + " no-data",
            requestStarted
          );
          return null;
        }

        var sources = [];

        sources = sources.concat(
          normalizeSourceNode(
            data.streams,
            host,
            referer,
            "MP4"
          )
        );

        sources = sources.concat(
          normalizeSourceNode(
            data.hls,
            host,
            referer,
            "HLS"
          )
        );

        sources = sources.concat(
          normalizeSourceNode(
            data.dash,
            host,
            referer,
            "DASH"
          )
        );

        var seen = {};
        sources = sources.filter(function (source) {
          if (
            !source.url ||
            seen[source.url]
          ) {
            return false;
          }

          seen[source.url] = true;
          return true;
        });

        mbTrace(
          "play-host",
          sources.length ? "match" : "empty",
          "host=" + host +
            " sources=" + sources.length +
            " hasResource=" +
            String(data.hasResource) +
            " limited=" +
            String(data.limited),
          requestStarted
        );

        if (!sources.length) {
          return null;
        }

        return {
          host: host,
          referer: referer,
          streams: sources
        };
      }).catch(function (error) {
        mbTrace(
          "play-host",
          "failed",
          "host=" + host +
            " error=" +
            (error && error.message
              ? error.message
              : String(error)),
          requestStarted
        );

        return null;
      });
    };
  });

  return firstSuccessful(
    tasks,
    MOVIEBOX_PLAY_TIMEOUT_MS
  ).then(function (result) {
    if (!result || !result.streams) {
      mbTrace(
        "play",
        "failed",
        "all playback hosts returned no sources",
        started
      );

      throw mbError(
        "play",
        "all playback hosts returned no sources"
      );
    }

    mbTrace(
      "play",
      "ok",
      "host=" + result.host +
        " sources=" + result.streams.length,
      started
    );

    return result;
  });
}

function subtitleLanguage(caption) {
  var value = String(
    (
      caption &&
      (
        caption.lanName ||
        caption.languageName ||
        caption.name ||
        caption.lan ||
        caption.lang ||
        caption.language
      )
    ) || ""
  )
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();

  if (!value) return null;

  if (
    /^(ms|msa|may)(-|\s|$)/.test(value) ||
    /bahasa melayu|bahasa malaysia|malay|melayu|malaysian/.test(value)
  ) {
    return "Malay";
  }

  if (
    /^(en|eng)(-|\s|$)/.test(value) ||
    /english/.test(value)
  ) {
    return "English";
  }

  if (
    /^(id|ind|in)(-|\s|$)/.test(value) ||
    /bahasa indonesia|indonesian/.test(value)
  ) {
    return "Indonesian";
  }

  return null;
}

function normalizeCaptions(node) {
  if (node == null) {
    return [];
  }

  if (Array.isArray(node)) {
    var out = [];

    node.forEach(function (child) {
      out = out.concat(
        normalizeCaptions(child)
      );
    });

    return out;
  }

  if (typeof node === "object") {
    var nested =
      mapValueCaseInsensitive(
        node,
        ["captions", "items", "list"]
      );

    if (
      nested != null &&
      nested !== node
    ) {
      return normalizeCaptions(nested);
    }

    var url = absoluteStreamUrl(
      mapValueCaseInsensitive(
        node,
        ["url", "file", "src"]
      )
    );

    if (url) {
      return [{
        url: url,
        lan:
          mapValueCaseInsensitive(
            node,
            ["lan", "lang", "language"]
          ),
        lanName:
          mapValueCaseInsensitive(
            node,
            ["lanName", "languageName", "name"]
          )
      }];
    }
  }

  return [];
}

function fetchCaptions(
  subject,
  seedStream
) {
  if (
    !seedStream ||
    !seedStream.id
  ) {
    return Promise.resolve([]);
  }

  var started = mbNow();
  var subjectId = String(subject.subjectId);
  var detailPath = String(
    subject.detailPath || ""
  );
  var streamId = String(seedStream.id);
  var format = String(
    seedStream.format ||
    seedStream.kind ||
    "HLS"
  );

  var url =
    MOVIEBOX_H5_API +
    "/wefeed-h5api-bff/subject/caption" +
    "?format=" +
    encodeURIComponent(format) +
    "&id=" +
    encodeURIComponent(streamId) +
    "&subjectId=" +
    encodeURIComponent(subjectId) +
    "&detailPath=" +
    encodeURIComponent(detailPath);

  return fetchJsonWithTimeout(
    url,
    {
      method: "GET",
      headers: copyHeaders(
        MOVIEBOX_COMMON_HEADERS,
        {
          "Referer": "https://moviebox.ph/"
        }
      )
    },
    MOVIEBOX_CAPTION_TIMEOUT_MS
  ).then(function (json) {
    var captions =
      normalizeCaptions(
        json && json.data
          ? json.data
          : null
      );

    var seen = {};

    var selected = captions
      .map(function (caption) {
        var language =
          subtitleLanguage(caption);

        return {
          url: caption.url,
          language: language,
          label: language
        };
      })
      .filter(function (caption) {
        if (
          !caption.url ||
          !caption.language ||
          seen[caption.url]
        ) {
          return false;
        }

        seen[caption.url] = true;
        return true;
      });

    mbTrace(
      "caption",
      "ok",
      "count=" + selected.length,
      started
    );

    return selected;
  }).catch(function (error) {
    mbTrace(
      "caption",
      "skipped",
      "error=" +
        (error && error.message
          ? error.message
          : String(error)),
      started
    );

    return [];
  });
}

function qualityLabel(stream) {
  var quality =
    sourceQuality(
      stream && stream.quality
    ) ||
    sourceQuality(
      stream && stream.resolutions
    ) ||
    sourceQuality(
      stream && stream.url
    );

  if (quality >= 2160) {
    return "4K";
  }

  if (quality) {
    return quality + "p";
  }

  return "Auto";
}

function streamType(stream) {
  var url = String(
    (stream && stream.url) || ""
  ).toLowerCase();

  var format = String(
    (stream && (
      stream.format ||
      stream.kind
    )) || ""
  ).toLowerCase();

  if (
    url.indexOf(".m3u8") >= 0 ||
    format.indexOf("hls") >= 0 ||
    format.indexOf("m3u8") >= 0
  ) {
    return "m3u8";
  }

  if (
    url.indexOf(".mpd") >= 0 ||
    format.indexOf("dash") >= 0
  ) {
    return "dash";
  }

  if (
    url.indexOf(".mp4") >= 0 ||
    format.indexOf("mp4") >= 0
  ) {
    return "mp4";
  }

  return "auto";
}

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  var started = mbNow();
  var type =
    String(mediaType || "").toLowerCase() === "tv"
      ? "tv"
      : "movie";

  mbTrace(
    "provider",
    "start",
    "version=" + MOVIEBOX_VERSION +
      " tmdbId=" + tmdbId +
      " type=" + type +
      " season=" + String(season || "") +
      " episode=" + String(episode || ""),
    started
  );

  var resolvedSubject = null;

  return resolveTmdbMetadata(
    tmdbId,
    type
  ).then(function (metadata) {
    return searchMovieBox(metadata);
  }).then(function (match) {
    resolvedSubject = match.subject;

    return fetchPlayableStreams(
      match.subject,
      match.seedHost,
      type,
      season,
      episode
    );
  }).then(function (playResult) {
    var streams =
      (playResult.streams || [])
        .slice()
        .sort(function (a, b) {
          return (
            sourceQuality(b.quality || b.url) -
            sourceQuality(a.quality || a.url)
          );
        });

    var seed =
      streams.filter(function (stream) {
        return !!stream.id;
      })[0] || null;

    return fetchCaptions(
      resolvedSubject,
      seed
    ).then(function (subtitles) {
      var seen = {};

      var output = streams
        .filter(function (stream) {
          if (
            !stream.url ||
            seen[stream.url]
          ) {
            return false;
          }

          seen[stream.url] = true;
          return true;
        })
        .map(function (stream) {
          var quality =
            qualityLabel(stream);

          return {
            name: MOVIEBOX_NAME,
            title:
              MOVIEBOX_NAME +
              " " +
              quality,
            url: stream.url,
            quality: quality,
            provider: "moviebox",
            type: streamType(stream),
            headers: {
              "User-Agent": MOVIEBOX_UA,
              "Accept": "*/*",
              "Referer":
                stream.referer ||
                playResult.referer ||
                (playResult.host + "/"),
              "Origin":
                stream.host ||
                playResult.host
            },
            subtitles: subtitles
          };
        });

      if (!output.length) {
        throw mbError(
          "output",
          "playback response contained no usable URLs"
        );
      }

      mbTrace(
        "provider",
        "ok",
        "streams=" + output.length,
        started
      );

      return output;
    });
  }).catch(function (error) {
    var message =
      error && error.message
        ? error.message
        : String(error);

    mbTrace(
      "provider",
      "failed",
      "error=" + message,
      started
    );

    // Diagnostic v1.1 deliberately rejects on a failed stage.
    // VUEO health can then surface which resolver stage failed
    // instead of reporting only a generic empty result.
    throw error;
  });
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams: getStreams
  };
} else {
  global.getStreams = getStreams;
}
