// Shared compatibility helpers for generated VUEO providers.
function csHeaders(base, extra) {
  var out = {};
  Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
  Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
  return out;
}
function csGet(url, headers) {
  return fetch(url, { method: "GET", headers: headers || {} });
}
function csPost(url, body, headers) {
  return fetch(url, { method: "POST", headers: headers || {}, body: body });
}
function csJson(response) {
  if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : "unknown"));
  return response.json();
}
function csText(response) {
  if (!response || !response.ok) throw new Error("HTTP " + (response ? response.status : "unknown"));
  return response.text();
}
function csStream(name, url, quality, headers, subtitles) {
  return { name: name, title: name + (quality ? " " + quality : ""), url: url, quality: quality || "Auto", headers: headers || {}, subtitles: subtitles || [] };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { csHeaders: csHeaders, csGet: csGet, csPost: csPost, csJson: csJson, csText: csText, csStream: csStream };
}
