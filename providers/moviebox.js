// MovieBox provider for VUEO
// Ported from Luckez12/Cloudstream-Repo MovieBoxProvider.kt.
// Promise based for Hermes compatibility. No Node APIs are used at runtime.

var MOVIEBOX_NAME = "MovieBox";
var MOVIEBOX_HOSTS = [
  "https://moviebox.ph",
  "https://moviebox.pk",
  "https://moviebox.ng",
  "https://filmboom.top"
];
var MOVIEBOX_UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";
var MOVIEBOX_HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "X-Client-Info": "{\"timezone\":\"Asia/Kuala_Lumpur\"}",
  "User-Agent": MOVIEBOX_UA
};

function copyHeaders(extra) {
  var out = {};
  Object.keys(MOVIEBOX_HEADERS).forEach(function (key) { out[key] = MOVIEBOX_HEADERS[key]; });
  Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
  return out;
}

function fetchTextWithTimeout(url, options, timeoutMs) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error("timeout"));
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
        reject(new Error("timeout"));
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
    new RegExp('<meta[^>]+(?:property|name)=["\\\']' + escaped + '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']', "i"),
    new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']' + escaped + '["\\\']', "i")
  ];
  for (var i = 0; i < patterns.length; i += 1) {
    var match = html.match(patterns[i]);
    if (match && match[1]) return decodeHtml(match[1]).trim();
  }
  return "";
}

function cleanTmdbTitle(value) {
  var title = decodeHtml(value || "").replace(/\s+/g, " ").trim();
  title = title.replace(/\s*[|\-\u2013\u2014]\s*(?:The Movie Database.*|TMDB.*)$/i, "").trim();
  return title;
}

function resolveTmdbMetadata(tmdbId, mediaType) {
  var type = String(mediaType || "").toLowerCase() === "tv" ? "tv" : "movie";
  var url = "https://www.themoviedb.org/" + type + "/" + encodeURIComponent(String(tmdbId)) + "?language=en-US";
  return fetchTextWithTimeout(url, {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": MOVIEBOX_UA
    }
  }, 5000).then(function (html) {
    var title = cleanTmdbTitle(extractMeta(html, "og:title") || extractMeta(html, "twitter:title"));
    if (!title) {
      var titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = cleanTmdbTitle(titleTag && titleTag[1] ? titleTag[1] : "");
    }
    var year = null;
    var yearMatch = title.match(/\((19|20)\d{2}\)$/);
    if (yearMatch) {
      year = parseInt(yearMatch[0].replace(/[()]/g, ""), 10);
      title = title.replace(/\s*\((19|20)\d{2}\)$/, "").trim();
    }
    if (!title) throw new Error("TMDB title unavailable");
    return { title: title, year: year, mediaType: type };
  });
}

function raceHosts(hosts, makeRequest, isValid, timeoutMs) {
  return new Promise(function (resolve) {
    if (!hosts || hosts.length === 0) return resolve(null);
    var finished = 0;
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    function done() {
      finished += 1;
      if (!settled && finished >= hosts.length) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }

    hosts.forEach(function (host) {
      makeRequest(host).then(function (value) {
        if (!settled && isValid(value)) {
          settled = true;
          clearTimeout(timer);
          resolve({ host: host, value: value });
          return;
        }
        done();
      }, function () {
        done();
      });
    });
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

function scoreCandidate(item, metadata) {
  if (!item || !item.subjectId || !item.title) return -9999;
  var expectedType = metadata.mediaType === "tv" ? 2 : 1;
  var actual = normalizeTitle(item.title);
  var target = normalizeTitle(metadata.title);
  var score = 0;

  if (item.subjectType === expectedType) score += 40;
  else if (item.subjectType != null) score -= 30;

  if (actual === target) score += 120;
  else if (actual.replace(/\s/g, "") === target.replace(/\s/g, "")) score += 105;
  else if (actual.indexOf(target) >= 0 || target.indexOf(actual) >= 0) score += 65;
  else {
    var targetWords = target.split(" ").filter(Boolean);
    var actualWords = actual.split(" ").filter(Boolean);
    var overlap = targetWords.filter(function (word) { return actualWords.indexOf(word) >= 0; }).length;
    score += targetWords.length ? Math.round((overlap / targetWords.length) * 45) : 0;
  }

  if (metadata.year && item.releaseDate) {
    var itemYear = parseInt(String(item.releaseDate).slice(0, 4), 10);
    if (itemYear === metadata.year) score += 25;
    else if (Math.abs(itemYear - metadata.year) === 1) score += 8;
  }

  return score;
}

function selectCandidate(items, metadata) {
  var ranked = (items || []).map(function (item) {
    return { item: item, score: scoreCandidate(item, metadata) };
  }).sort(function (a, b) { return b.score - a.score; });
  if (!ranked.length || ranked[0].score < 55) return null;
  return ranked[0].item;
}

function searchMovieBox(metadata) {
  var payload = JSON.stringify({
    keyword: metadata.title,
    page: 1,
    perPage: 24,
    subjectType: 0
  });

  return raceHosts(MOVIEBOX_HOSTS, function (host) {
    return fetchJsonWithTimeout(host + "/wefeed-h5-bff/web/subject/search", {
      method: "POST",
      headers: copyHeaders({
        "Content-Type": "application/json",
        "Referer": host + "/"
      }),
      body: payload
    }, 4000).then(function (json) {
      return json && json.data && Array.isArray(json.data.items) ? json.data.items : [];
    });
  }, function (items) {
    return !!selectCandidate(items, metadata);
  }, 4300).then(function (winner) {
    if (!winner) return null;
    var candidate = selectCandidate(winner.value, metadata);
    return candidate ? { host: winner.host, subject: candidate } : null;
  });
}

function buildPlayReferer(host, subject) {
  var detailPath = subject && subject.detailPath ? String(subject.detailPath) : "";
  if (detailPath) {
    return host + "/spa/videoPlayPage/movies/" + detailPath + "?id=" + encodeURIComponent(String(subject.subjectId)) + "&type=/movie/detail&lang=en";
  }
  return host + "/";
}

function fetchPlayableStreams(subject, seedHost, mediaType, season, episode) {
  var hosts = [seedHost].concat(MOVIEBOX_HOSTS.filter(function (host) { return host !== seedHost; }));
  var subjectId = String(subject.subjectId);
  var se = mediaType === "tv" ? (parseInt(season, 10) || 1) : 0;
  var ep = mediaType === "tv" ? (parseInt(episode, 10) || 1) : 0;

  return raceHosts(hosts, function (host) {
    var referer = buildPlayReferer(host, subject);
    var url = host + "/wefeed-h5-bff/web/subject/play?subjectId=" + encodeURIComponent(subjectId) + "&se=" + se + "&ep=" + ep;
    return fetchJsonWithTimeout(url, {
      method: "GET",
      headers: copyHeaders({ "Referer": referer })
    }, 5200).then(function (json) {
      var streams = json && json.data && Array.isArray(json.data.streams) ? json.data.streams : [];
      return streams.filter(function (stream) { return stream && stream.url; });
    });
  }, function (streams) {
    return Array.isArray(streams) && streams.length > 0;
  }, 5500).then(function (winner) {
    return winner ? { host: winner.host, streams: winner.value } : null;
  });
}

function subtitleLanguage(caption) {
  var value = ((caption && (caption.lanName || caption.lan)) || "").toLowerCase().replace(/_/g, "-").trim();
  if (!value) return null;
  if (/^(ms|msa|may)(-|\s|$)/.test(value) || /bahasa melayu|bahasa malaysia|malay|melayu|malaysian/.test(value)) return "Malay";
  if (/^(en|eng)(-|\s|$)/.test(value) || /english/.test(value)) return "English";
  if (/^(id|ind|in)(-|\s|$)/.test(value) || /bahasa indonesia|indonesian/.test(value)) return "Indonesian";
  return null;
}

function fetchCaptions(subjectId, seedStream, winningHost) {
  if (!seedStream || !seedStream.id || !seedStream.format) return Promise.resolve([]);
  var hosts = [winningHost].concat(MOVIEBOX_HOSTS.filter(function (host) { return host !== winningHost; }));
  var streamId = String(seedStream.id);
  var format = String(seedStream.format);

  return raceHosts(hosts, function (host) {
    var url = host + "/wefeed-h5-bff/web/subject/caption?format=" + encodeURIComponent(format) + "&id=" + encodeURIComponent(streamId) + "&subjectId=" + encodeURIComponent(String(subjectId));
    return fetchJsonWithTimeout(url, {
      method: "GET",
      headers: copyHeaders({ "Referer": host + "/" })
    }, 2800).then(function (json) {
      var captions = json && json.data && Array.isArray(json.data.captions) ? json.data.captions : [];
      return captions.filter(function (caption) { return caption && caption.url && subtitleLanguage(caption); });
    });
  }, function (captions) {
    return Array.isArray(captions) && captions.length > 0;
  }, 3000).then(function (winner) {
    var captions = winner ? winner.value : [];
    var seen = {};
    return captions.map(function (caption) {
      var language = subtitleLanguage(caption);
      return {
        url: caption.url,
        language: language,
        label: language
      };
    }).filter(function (caption) {
      if (!caption.url || seen[caption.url]) return false;
      seen[caption.url] = true;
      return true;
    });
  });
}

function qualityValue(label) {
  var text = String(label || "").toLowerCase();
  if (/2160|4k/.test(text)) return 2160;
  var match = text.match(/(1440|1080|720|576|540|480|360|240)/);
  return match ? parseInt(match[1], 10) : 0;
}

function qualityLabel(stream) {
  var raw = stream && stream.resolutions ? String(stream.resolutions) : "";
  var value = qualityValue(raw);
  if (value >= 2160) return "4K";
  if (value) return value + "p";
  return raw || "Auto";
}

function streamType(stream) {
  var url = String((stream && stream.url) || "").toLowerCase();
  var format = String((stream && stream.format) || "").toLowerCase();
  if (url.indexOf(".m3u8") >= 0 || format.indexOf("hls") >= 0 || format.indexOf("m3u8") >= 0) return "m3u8";
  if (url.indexOf(".mp4") >= 0 || format.indexOf("mp4") >= 0) return "mp4";
  return "auto";
}

function uniqueStreams(streams) {
  var seen = {};
  return (streams || []).filter(function (stream) {
    var url = stream && stream.url ? String(stream.url) : "";
    if (!url || seen[url]) return false;
    seen[url] = true;
    return true;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var type = String(mediaType || "").toLowerCase() === "tv" ? "tv" : "movie";
  console.log("[MovieBox] Resolving " + type + " TMDB " + tmdbId);

  return resolveTmdbMetadata(tmdbId, type)
    .then(function (metadata) {
      return searchMovieBox(metadata);
    })
    .then(function (match) {
      if (!match || !match.subject) return [];
      return fetchPlayableStreams(match.subject, match.host, type, season, episode)
        .then(function (playResult) {
          if (!playResult || !playResult.streams || !playResult.streams.length) return [];
          var streams = uniqueStreams(playResult.streams).sort(function (a, b) {
            return qualityValue(b.resolutions) - qualityValue(a.resolutions);
          });
          var seed = streams.filter(function (stream) { return stream.id && stream.format; })[0] || null;
          return fetchCaptions(match.subject.subjectId, seed, playResult.host)
            .catch(function () { return []; })
            .then(function (subtitles) {
              return streams.map(function (stream) {
                var quality = qualityLabel(stream);
                return {
                  name: MOVIEBOX_NAME,
                  title: MOVIEBOX_NAME + " " + quality,
                  url: stream.url,
                  quality: quality,
                  provider: "moviebox",
                  type: streamType(stream),
                  headers: {
                    "User-Agent": MOVIEBOX_UA,
                    "Referer": playResult.host + "/"
                  },
                  subtitles: subtitles
                };
              });
            });
        });
    })
    .catch(function (error) {
      console.log("[MovieBox] Error: " + (error && error.message ? error.message : String(error)));
      return [];
    });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
