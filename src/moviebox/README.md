# MovieBox VUEO Provider v1.2

MovieBox v1.2 improves search resolution for ambiguous titles.

Key changes:

1. Collects candidates from all available search requests instead of accepting the first host response.
2. Searches the H5 API with the expected media type and with the all-types fallback.
3. Keeps MovieBox web mirrors as parallel fallback sources.
4. Tries the mobile BFF search endpoint as an additional discovery source.
5. Extracts candidate objects recursively, so nested response shapes such as `data.results.content` are supported.
6. Reads TMDB original title or original name values from the public metadata page when available and uses them as search aliases.
7. Scores candidates using title similarity, media type and release year.
8. Exact title plus correct media type is accepted when MovieBox does not provide a year.
9. Search failure now includes candidate count and the highest ranked candidates in the diagnostic message.

The search diagnostic contains:

`stage=search ... unique=<count> raw=<count> sources=<count> top=<candidate summary>`

This lets VUEO Provider Health show whether MovieBox returned no candidates or whether candidates were found but rejected as unsafe matches.
