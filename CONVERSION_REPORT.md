# CloudStream to VUEO Conversion Report

Generated automatically from the current CloudStream source.

| Provider | Score | Classification | HTTP | HTML | Crypto | Extractors | WebView |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 4KHDHub | 17 | `MANUAL_RUNTIME_REQUIRED` | 11 | 119 | 0 | 18 | 1 |
| KissKH | 62 | `ADAPTERS_REQUIRED` | 7 | 0 | 7 | 1 | 0 |
| MSM21 | 10 | `MANUAL_RUNTIME_REQUIRED` | 6 | 65 | 0 | 5 | 35 |
| MovieBox | 93 | `AUTO_PORT_CANDIDATE` | 7 | 0 | 0 | 0 | 0 |
| OneTouchTV | 82 | `AUTO_PORT_CANDIDATE` | 1 | 0 | 8 | 0 | 0 |
| OppaDrama | 10 | `MANUAL_RUNTIME_REQUIRED` | 4 | 55 | 0 | 1 | 43 |
| PencuriMovie | 55 | `ADAPTERS_REQUIRED` | 6 | 62 | 0 | 5 | 0 |

## Recommended order

1. **MovieBox**: `AUTO_PORT_CANDIDATE` (93/100)
   * Adapter: Coroutine concurrency needs Promise translation
2. **OneTouchTV**: `AUTO_PORT_CANDIDATE` (82/100)
   * Adapter: AES/crypto logic needs bundled JS crypto adapter
3. **KissKH**: `ADAPTERS_REQUIRED` (62/100)
   * Adapter: CloudStream extractor calls need JS extractor adapters
   * Adapter: AES/crypto logic needs bundled JS crypto adapter
4. **PencuriMovie**: `ADAPTERS_REQUIRED` (55/100)
   * Adapter: HTML/Jsoup selectors need DOM translation
   * Adapter: CloudStream extractor calls need JS extractor adapters
   * Adapter: Coroutine concurrency needs Promise translation
5. **4KHDHub**: `MANUAL_RUNTIME_REQUIRED` (17/100)
   * Adapter: HTML/Jsoup selectors need DOM translation
   * Adapter: CloudStream extractor calls need JS extractor adapters
   * Blocker: Android WebView/network interception cannot be auto-converted to plain VUEO JS
6. **MSM21**: `MANUAL_RUNTIME_REQUIRED` (10/100)
   * Adapter: HTML/Jsoup selectors need DOM translation
   * Adapter: CloudStream extractor calls need JS extractor adapters
   * Adapter: Coroutine concurrency needs Promise translation
   * Blocker: Android WebView/network interception cannot be auto-converted to plain VUEO JS
7. **OppaDrama**: `MANUAL_RUNTIME_REQUIRED` (10/100)
   * Adapter: HTML/Jsoup selectors need DOM translation
   * Adapter: CloudStream extractor calls need JS extractor adapters
   * Adapter: Coroutine concurrency needs Promise translation
   * Blocker: Android WebView/network interception cannot be auto-converted to plain VUEO JS

## Meaning

* `AUTO_PORT_CANDIDATE`: mostly HTTP/JSON logic. This is the best automatic translation target.
* `ADAPTERS_REQUIRED`: common conversion is possible, but HTML, extractor or crypto adapters are needed.
* `MANUAL_RUNTIME_REQUIRED`: Android runtime behaviour such as WebView interception was detected.

Converter v1 writes only to `generated/`. Existing runtime files under `providers/` are never overwritten.
