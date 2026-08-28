// MovieBox provider for VUEO
// v1.2 candidate discovery and smarter search matching.
// Promise based runtime for VUEO / Hermes compatibility.

var MOVIEBOX_NAME = "MovieBox";
var MOVIEBOX_VERSION = "1.2.0";

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
var MOVIEBOX_SEARCH_REQUEST_MS = 4800;
var MOVIEBOX_SEARCH_TOTAL_MS = 6200;
var MOVIEBOX_PLAY_TIMEOUT_MS = 6500;
var MOVIEBOX_CAPTION_TIMEOUT_MS = 2600;

function mbNow() {
  return Date.now ? Date.now() : 0;
}

function mbTrace(stage, status, detail, startedAt) {
  var elapsed = startedAt ? mbNow() - startedAt : 0;
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
        throw new Error(
          "HTTP " + (response ? response.status : "unknown")
        );
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
        throw new Error(
          "HTTP " + (response ? response.status : "unknown")
        );
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

function decodeJsonEscapes(value) {
  var text = String(value || "");

  return text
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/\\u0022/g, '"')
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .trim();
}

function extractMeta(html, key) {
  var escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  var patterns = [
    new RegExp(
      '<meta[^>]+(?:property|name)=["\\\']' +
      escaped +
      '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']',
      "i"
    ),
    new RegExp(
      '<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+' +
      '(?:property|name)=["\\\']' +
      escaped +
      '["\\\']',
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
  return decodeHtml(value || "")
    .replace(/\s+/g, " ")
    .replace(
      /\s*[|\-\u2013\u2014]\s*(?:The Movie Database.*|TMDB.*)$/i,
      ""
    )
    .trim();
}

function stripTitleYear(value) {
  var title = cleanTmdbTitle(value);
  var year = null;
  var match = title.match(/\((19|20)\d{2}\)\s*$/);

  if (match) {
    year = parseInt(
      match[0].replace(/[()]/g, ""),
      10
    );

    title = title
      .replace(/\s*\((19|20)\d{2}\)\s*$/, "")
      .trim();
  }

  return {
    title: title,
    year: year
  };
}

function pushUniqueText(list, value) {
  var clean = stripTitleYear(value).title;

  if (!clean) {
    return;
  }

  var normalized = normalizeTitle(clean);

  if (!normalized) {
    return;
  }

  for (var i = 0; i < list.length; i += 1) {
    if (normalizeTitle(list[i]) === normalized) {
      return;
    }
  }

  list.push(clean);
}

function extractTmdbAliases(html, primaryTitle) {
  var aliases = [];
  var patterns = [
    /"original_title"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"original_name"\s*:\s*"((?:\\.|[^"])*)"/g,
    /"alternateName"\s*:\s*"((?:\\.|[^"])*)"/g,
    /data-original-title=["']([^"']+)["']/gi
  ];

  patterns.forEach(function (pattern) {
    var match;

    while ((match = pattern.exec(html)) !== null) {
      pushUniqueText(
        aliases,
        decodeJsonEscapes(match[1])
      );

      if (aliases.length >= 5) {
        break;
      }
    }
  });

  return aliases.filter(function (value) {
    return normalizeTitle(value) !== normalizeTitle(primaryTitle);
  }).slice(0, 4);
}

function resolveTmdbMetadata(tmdbId, mediaType) {
  var started = mbNow();

  var type =
    String(mediaType || "").toLowerCase() === "tv"
      ? "tv"
      : "movie";

  var url =
    "https://www.themoviedb.org/" +
    type +
    "/" +
    encodeURIComponent(String(tmdbId)) +
    "?language=en-US";

  mbTrace(
    "tmdb",
    "start",
    "id=" + tmdbId + " type=" + type,
    started
  );

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

      raw =
        titleTag && titleTag[1]
          ? titleTag[1]
          : "";
    }

    var parsed = stripTitleYear(raw);

    if (
      !parsed.title ||
      /just a moment|attention required|access denied/i.test(
        parsed.title
      )
    ) {
      throw mbError(
        "tmdb",
        "metadata page did not expose a usable English title"
      );
    }

    var aliases = extractTmdbAliases(
      html,
      parsed.title
    );

    mbTrace(
      "tmdb",
      "ok",
      "title=" + JSON.stringify(parsed.title) +
        (parsed.year ? " year=" + parsed.year : "") +
        " aliases=" + aliases.length,
      started
    );

    return {
      title: parsed.title,
      year: parsed.year,
      aliases: aliases,
      mediaType: type
    };
  }).catch(function (error) {
    var message =
      error && error.message
        ? error.message
        : String(error);

    mbTrace(
      "tmdb",
      "failed",
      "error=" + message,
      started
    );

    if (
      message.indexOf(
        "[MovieBox][diag] stage=tmdb"
      ) === 0
    ) {
      throw error;
    }

    throw mbError("tmdb", message);
  });
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateTitle(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  return String(
    item.title ||
    item.name ||
    item.subjectName ||
    item.displayName ||
    ""
  ).trim();
}

function candidateId(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  return String(
    item.subjectId ||
    item.subjectID ||
    item.id ||
    ""
  ).trim();
}

function candidateType(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  var raw =
    item.subjectType != null
      ? item.subjectType
      : item.type;

  var numeric = parseInt(raw, 10);

  return isNaN(numeric) ? null : numeric;
}

function candidateYear(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  var raw =
    item.releaseDate ||
    item.releaseYear ||
    item.year ||
    item.releaseTime ||
    "";

  var match =
    String(raw).match(/(19|20)\d{2}/);

  return match
    ? parseInt(match[0], 10)
    : null;
}

function candidateDetailPath(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  return String(
    item.detailPath ||
    item.detail_path ||
    item.path ||
    ""
  ).trim();
}

function candidateAudioPenalty(item) {
  var value = candidateTitle(item);

  if (/\bhindi\b/i.test(value)) return 18;
  if (/\bdubbed\b/i.test(value)) return 8;

  return 0;
}

function wordOverlapScore(a, b) {
  var left = normalizeTitle(a)
    .split(" ")
    .filter(Boolean);

  var right = normalizeTitle(b)
    .split(" ")
    .filter(Boolean);

  if (!left.length || !right.length) {
    return 0;
  }

  var overlap = left.filter(function (word) {
    return right.indexOf(word) >= 0;
  }).length;

  return Math.round(
    (overlap / Math.max(left.length, right.length)) * 70
  );
}

function titleScore(candidate, target) {
  var actual = normalizeTitle(candidate);
  var wanted = normalizeTitle(target);

  if (!actual || !wanted) {
    return 0;
  }

  if (actual === wanted) {
    return 145;
  }

  if (
    actual.replace(/\s/g, "") ===
    wanted.replace(/\s/g, "")
  ) {
    return 132;
  }

  if (
    actual.indexOf(wanted) >= 0 ||
    wanted.indexOf(actual) >= 0
  ) {
    return 82;
  }

  return wordOverlapScore(actual, wanted);
}

function scoreCandidate(item, metadata) {
  var id = candidateId(item);
  var title = candidateTitle(item);

  if (!id || !title) {
    return {
      score: -9999,
      exact: false,
      typeMatch: false,
      yearMatch: false,
      title: title,
      id: id
    };
  }

  var expectedType =
    metadata.mediaType === "tv"
      ? 2
      : 1;

  var actualType = candidateType(item);
  var actualYear = candidateYear(item);
  var targets =
    [metadata.title].concat(
      metadata.aliases || []
    );

  var bestTitleScore = 0;
  var exact = false;
  var matchedTarget = metadata.title;

  targets.forEach(function (target) {
    var current = titleScore(title, target);

    if (current > bestTitleScore) {
      bestTitleScore = current;
      matchedTarget = target;
    }

    if (
      normalizeTitle(title) ===
      normalizeTitle(target)
    ) {
      exact = true;
    }
  });

  var typeMatch =
    actualType == null
      ? false
      : actualType === expectedType;

  var score = bestTitleScore;

  if (actualType == null) {
    score += 4;
  } else if (typeMatch) {
    score += 48;
  } else {
    score -= 60;
  }

  var yearMatch = false;
  var yearNear = false;

  if (metadata.year && actualYear) {
    if (metadata.year === actualYear) {
      yearMatch = true;
      score += 38;
    } else if (
      Math.abs(metadata.year - actualYear) === 1
    ) {
      yearNear = true;
      score += 16;
    } else {
      score -= Math.min(
        32,
        Math.abs(metadata.year - actualYear) * 3
      );
    }
  }

  score -= candidateAudioPenalty(item);

  return {
    score: score,
    exact: exact,
    typeMatch: typeMatch,
    yearMatch: yearMatch,
    yearNear: yearNear,
    matchedTarget: matchedTarget,
    title: title,
    id: id,
    type: actualType,
    year: actualYear
  };
}

function acceptCandidate(rank, metadata) {
  if (!rank || !rank.item) {
    return false;
  }

  var info = rank.info;

  if (!info || info.score < 0) {
    return false;
  }

  if (
    info.exact &&
    info.typeMatch &&
    (
      !metadata.year ||
      !info.year ||
      info.yearMatch ||
      info.yearNear
    )
  ) {
    return true;
  }

  if (
    info.exact &&
    info.type == null &&
    info.yearMatch
  ) {
    return true;
  }

  return info.score >= 112;
}

function walkForCandidates(value, output, depth) {
  if (
    value == null ||
    depth > 7
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach(function (child) {
      walkForCandidates(
        child,
        output,
        depth + 1
      );
    });

    return;
  }

  if (typeof value !== "object") {
    return;
  }

  var id = candidateId(value);
  var title = candidateTitle(value);

  if (id && title) {
    output.push(value);
  }

  Object.keys(value).forEach(function (key) {
    var child = value[key];

    if (
      child &&
      (
        Array.isArray(child) ||
        typeof child === "object"
      )
    ) {
      walkForCandidates(
        child,
        output,
        depth + 1
      );
    }
  });
}

function extractSearchCandidates(json) {
  var output = [];
  walkForCandidates(json, output, 0);

  var seen = {};

  return output.filter(function (item) {
    var id = candidateId(item);

    if (!id || seen[id]) {
      return false;
    }

    seen[id] = true;
    return true;
  });
}

function makeQueryVariants(metadata) {
  var queries = [];

  function add(value) {
    var clean =
      String(value || "")
        .replace(/\s+/g, " ")
        .trim();

    if (!clean) {
      return;
    }

    var normalized = normalizeTitle(clean);

    for (var i = 0; i < queries.length; i += 1) {
      if (
        normalizeTitle(queries[i]) ===
        normalized
      ) {
        return;
      }
    }

    queries.push(clean);
  }

  add(metadata.title);

  (metadata.aliases || []).forEach(function (alias) {
    add(alias);
  });

  if (metadata.year) {
    add(metadata.title + " " + metadata.year);
  }

  return queries.slice(0, 4);
}

function searchRequestDefinitions(metadata) {
  var expectedType =
    metadata.mediaType === "tv"
      ? 2
      : 1;

  var queries = makeQueryVariants(metadata);
  var definitions = [];

  queries.forEach(function (query, index) {
    definitions.push({
      label:
        "H5API:" +
        (index === 0 ? "title" : "variant" + index) +
        ":type",
      query: query,
      seedHost: MOVIEBOX_STREAM_BASE,
      method: "POST",
      url:
        MOVIEBOX_H5_API +
        "/wefeed-h5api-bff/subject/search",
      headers: copyHeaders(
        MOVIEBOX_COMMON_HEADERS,
        {
          "Content-Type": "application/json"
        }
      ),
      body: JSON.stringify({
        keyword: query,
        page: 1,
        perPage: 30,
        subjectType: expectedType
      })
    });

    definitions.push({
      label:
        "H5API:" +
        (index === 0 ? "title" : "variant" + index) +
        ":all",
      query: query,
      seedHost: MOVIEBOX_STREAM_BASE,
      method: "POST",
      url:
        MOVIEBOX_H5_API +
        "/wefeed-h5api-bff/subject/search",
      headers: copyHeaders(
        MOVIEBOX_COMMON_HEADERS,
        {
          "Content-Type": "application/json"
        }
      ),
      body: JSON.stringify({
        keyword: query,
        page: 1,
        perPage: 30,
        subjectType: 0
      })
    });
  });

  MOVIEBOX_WEB_HOSTS.forEach(function (host) {
    definitions.push({
      label:
        "WEB:" +
        host.replace(/^https?:\/\//, ""),
      query: metadata.title,
      seedHost: host,
      method: "POST",
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
      body: JSON.stringify({
        keyword: metadata.title,
        page: 1,
        perPage: 30,
        subjectType: expectedType
      })
    });
  });

  definitions.push({
    label: "MOBILE:H5API",
    query: metadata.title,
    seedHost: MOVIEBOX_STREAM_BASE,
    method: "GET",
    url:
      MOVIEBOX_H5_API +
      "/wefeed-mobile-bff/subject-api/search" +
      "?q=" +
      encodeURIComponent(metadata.title) +
      "&page=1&pageSize=30",
    headers: MOVIEBOX_COMMON_HEADERS,
    body: null
  });

  return definitions;
}

function promiseAllWithin(tasks, totalTimeoutMs) {
  return new Promise(function (resolve) {
    var completed = 0;
    var results = [];
    var settled = false;

    if (!tasks.length) {
      resolve([]);
      return;
    }

    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        resolve(results);
      }
    }, totalTimeoutMs);

    tasks.forEach(function (task) {
      task().then(function (value) {
        if (settled) {
          return;
        }

        results.push(value);
        completed += 1;

        if (completed >= tasks.length) {
          settled = true;
          clearTimeout(timer);
          resolve(results);
        }
      }, function (error) {
        if (settled) {
          return;
        }

        results.push({
          ok: false,
          error:
            error && error.message
              ? error.message
              : String(error)
        });

        completed += 1;

        if (completed >= tasks.length) {
          settled = true;
          clearTimeout(timer);
          resolve(results);
        }
      });
    });
  });
}

function diagnosticCandidateText(ranked) {
  if (!ranked || !ranked.length) {
    return "none";
  }

  return ranked.slice(0, 5).map(function (entry) {
    var info = entry.info;

    return (
      JSON.stringify(info.title) +
      "(score=" + info.score +
      ",type=" +
      (info.type == null ? "?" : info.type) +
      ",year=" +
      (info.year || "?") +
      ")"
    );
  }).join("; ");
}

function searchMovieBox(metadata) {
  var started = mbNow();
  var definitions =
    searchRequestDefinitions(metadata);

  mbTrace(
    "search",
    "start",
    "query=" + JSON.stringify(metadata.title) +
      " year=" + String(metadata.year || "?") +
      " aliases=" +
      JSON.stringify(metadata.aliases || []) +
      " requests=" + definitions.length,
    started
  );

  var tasks = definitions.map(function (definition) {
    return function () {
      var requestStarted = mbNow();

      var options = {
        method: definition.method,
        headers: definition.headers
      };

      if (definition.body != null) {
        options.body = definition.body;
      }

      return fetchJsonWithTimeout(
        definition.url,
        options,
        MOVIEBOX_SEARCH_REQUEST_MS
      ).then(function (json) {
        var candidates =
          extractSearchCandidates(json);

        mbTrace(
          "search-host",
          candidates.length ? "candidates" : "empty",
          "source=" + definition.label +
            " query=" +
            JSON.stringify(definition.query) +
            " count=" + candidates.length,
          requestStarted
        );

        return {
          ok: true,
          label: definition.label,
          query: definition.query,
          seedHost: definition.seedHost,
          candidates: candidates
        };
      }).catch(function (error) {
        mbTrace(
          "search-host",
          "failed",
          "source=" + definition.label +
            " error=" +
            (error && error.message
              ? error.message
              : String(error)),
          requestStarted
        );

        return {
          ok: false,
          label: definition.label,
          query: definition.query,
          seedHost: definition.seedHost,
          candidates: [],
          error:
            error && error.message
              ? error.message
              : String(error)
        };
      });
    };
  });

  return promiseAllWithin(
    tasks,
    MOVIEBOX_SEARCH_TOTAL_MS
  ).then(function (results) {
    var merged = {};
    var candidateCount = 0;
    var successfulSources = 0;

    results.forEach(function (result) {
      if (result && result.ok) {
        successfulSources += 1;
      }

      (result && result.candidates || [])
        .forEach(function (item) {
          candidateCount += 1;

          var id = candidateId(item);

          if (!id) {
            return;
          }

          if (!merged[id]) {
            merged[id] = {
              item: item,
              sources: [],
              seedHosts: []
            };
          }

          if (
            result.label &&
            merged[id].sources.indexOf(
              result.label
            ) < 0
          ) {
            merged[id].sources.push(
              result.label
            );
          }

          if (
            result.seedHost &&
            merged[id].seedHosts.indexOf(
              result.seedHost
            ) < 0
          ) {
            merged[id].seedHosts.push(
              result.seedHost
            );
          }
        });
    });

    var ranked =
      Object.keys(merged)
        .map(function (id) {
          var entry = merged[id];

          return {
            item: entry.item,
            info: scoreCandidate(
              entry.item,
              metadata
            ),
            sources: entry.sources,
            seedHosts: entry.seedHosts
          };
        })
        .sort(function (a, b) {
          return b.info.score - a.info.score;
        });

    ranked.slice(0, 5).forEach(function (entry, index) {
      mbTrace(
        "candidate",
        "ranked",
        "rank=" + (index + 1) +
          " title=" +
          JSON.stringify(entry.info.title) +
          " score=" + entry.info.score +
          " type=" +
          String(
            entry.info.type == null
              ? "?"
              : entry.info.type
          ) +
          " year=" +
          String(entry.info.year || "?") +
          " id=" + entry.info.id,
        started
      );
    });

    var selected = null;

    for (var i = 0; i < ranked.length; i += 1) {
      if (
        acceptCandidate(
          ranked[i],
          metadata
        )
      ) {
        selected = ranked[i];
        break;
      }
    }

    if (!selected) {
      var diagnostics =
        diagnosticCandidateText(ranked);

      var detail =
        "no accepted subject for " +
        JSON.stringify(metadata.title) +
        " year=" +
        String(metadata.year || "?") +
        " unique=" + ranked.length +
        " raw=" + candidateCount +
        " sources=" + successfulSources +
        " top=" + diagnostics;

      mbTrace(
        "search",
        "failed",
        detail,
        started
      );

      throw mbError(
        "search",
        detail
      );
    }

    var subject = selected.item;

    if (
      !subject.detailPath &&
      candidateDetailPath(subject)
    ) {
      subject.detailPath =
        candidateDetailPath(subject);
    }

    var seedHost =
      selected.seedHosts &&
      selected.seedHosts.length
        ? selected.seedHosts[0]
        : MOVIEBOX_STREAM_BASE;

    mbTrace(
      "search",
      "ok",
      "subjectId=" +
        candidateId(subject) +
        " title=" +
        JSON.stringify(
          candidateTitle(subject)
        ) +
        " score=" +
        selected.info.score +
        " type=" +
        String(
          selected.info.type == null
            ? "?"
            : selected.info.type
        ) +
        " year=" +
        String(selected.info.year || "?"),
      started
    );

    return {
      subject: subject,
      seedHost: seedHost,
      score: selected.info.score
    };
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

  return match
    ? parseInt(match[1], 10)
    : 0;
}

function mapValueCaseInsensitive(obj, names) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  var keys = Object.keys(obj);

  for (var i = 0; i < names.length; i += 1) {
    var wanted =
      String(names[i]).toLowerCase();

    for (var j = 0; j < keys.length; j += 1) {
      if (
        String(keys[j]).toLowerCase() ===
        wanted
      ) {
        return obj[keys[j]];
      }
    }
  }

  return null;
}

function normalizeSourceNode(
  node,
  host,
  referer,
  kind
) {
  if (node == null) {
    return [];
  }

  if (typeof node === "string") {
    var direct =
      absoluteStreamUrl(node);

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
    var directUrl =
      absoluteStreamUrl(
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
        id:
          mapValueCaseInsensitive(
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
        var childUrl =
          absoluteStreamUrl(child);

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
    candidateDetailPath(subject);

  if (!detailPath) {
    return host + "/";
  }

  return (
    host +
    "/spa/videoPlayPage/movies/" +
    detailPath +
    "?id=" +
    encodeURIComponent(
      candidateId(subject)
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

function firstSuccessful(tasks, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var finished = 0;

    if (!tasks.length) {
      resolve(null);
      return;
    }

    var timer =
      setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);

    function completeEmpty() {
      finished += 1;

      if (
        !settled &&
        finished >= tasks.length
      ) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }

    tasks.forEach(function (task) {
      task().then(function (value) {
        if (
          !settled &&
          value
        ) {
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

function fetchPlayableStreams(
  subject,
  seedHost,
  mediaType,
  season,
  episode
) {
  var started = mbNow();

  var subjectId =
    candidateId(subject);

  var se =
    mediaType === "tv"
      ? (parseInt(season, 10) || 1)
      : 0;

  var ep =
    mediaType === "tv"
      ? (parseInt(episode, 10) || 1)
      : 0;

  var detailPath =
    candidateDetailPath(subject);

  var hosts =
    orderedPlayHosts(seedHost);

  mbTrace(
    "play",
    "start",
    "subjectId=" + subjectId +
      " s=" + se +
      " e=" + ep +
      " hosts=" + hosts.length,
    started
  );

  var tasks =
    hosts.map(function (host) {
      return function () {
        var requestStarted = mbNow();

        var referer =
          buildPlayReferer(
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

          sources =
            sources.filter(function (source) {
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
            sources.length
              ? "match"
              : "empty",
            "host=" + host +
              " sources=" +
              sources.length +
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
              (
                error && error.message
                  ? error.message
                  : String(error)
              ),
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
    if (
      !result ||
      !result.streams
    ) {
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
        " sources=" +
        result.streams.length,
      started
    );

    return result;
  });
}

function subtitleLanguage(caption) {
  var value =
    String(
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
    /bahasa melayu|bahasa malaysia|malay|melayu|malaysian/.test(
      value
    )
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
      out =
        out.concat(
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

    var url =
      absoluteStreamUrl(
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
            [
              "lanName",
              "languageName",
              "name"
            ]
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

  var url =
    MOVIEBOX_H5_API +
    "/wefeed-h5api-bff/subject/caption" +
    "?format=" +
    encodeURIComponent(
      String(
        seedStream.format ||
        seedStream.kind ||
        "HLS"
      )
    ) +
    "&id=" +
    encodeURIComponent(
      String(seedStream.id)
    ) +
    "&subjectId=" +
    encodeURIComponent(
      candidateId(subject)
    ) +
    "&detailPath=" +
    encodeURIComponent(
      candidateDetailPath(subject)
    );

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

    var selected =
      captions
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
        (
          error && error.message
            ? error.message
            : String(error)
        ),
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
  var url =
    String(
      (stream && stream.url) || ""
    ).toLowerCase();

  var format =
    String(
      (
        stream &&
        (
          stream.format ||
          stream.kind
        )
      ) || ""
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
      " season=" +
      String(season || "") +
      " episode=" +
      String(episode || ""),
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
            sourceQuality(
              b.quality || b.url
            ) -
            sourceQuality(
              a.quality || a.url
            )
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

      var output =
        streams
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
                "User-Agent":
                  MOVIEBOX_UA,
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
