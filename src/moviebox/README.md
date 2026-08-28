# MovieBox VUEO Provider v1.1

This revision focuses on real device diagnosis and resolver reliability.

Changes:

1. TMDB HTML metadata timeout increased from 5 seconds to 11 seconds.
2. Current MovieBox H5 V2 search is tried through `h5-api.aoneroom.com`.
3. Legacy web mirrors remain parallel fallback search targets.
4. Playback includes `detailPath`, `detailSe`, `detailEp`, `Origin` and the full player `Referer`.
5. Playback accepts `streams`, `hls` and `dash` response shapes, including nested quality maps.
6. The current H5 API caption endpoint is used for English, Malay and Indonesian subtitles.
7. Diagnostic stage errors are rejected intentionally so VUEO Provider Health can report the failed stage instead of only `No Results`.

Diagnostic stages are:

`tmdb` -> `search` -> `play` -> `caption` -> `provider`

After device behaviour is confirmed, diagnostic rejection can be relaxed back to an empty result for normal no-match cases.
