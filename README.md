# VUEO Providers

Official JavaScript provider repository for VUEO.

CloudStream source reference:
`https://github.com/Luckez12/Cloudstream-Repo`

## Included port targets

- 4KHDHub
- KissKH
- MSM21
- MovieBox
- OneTouchTV
- OppaDrama
- PencuriMovie

Anichin is intentionally excluded.

## Repository URL for VUEO

`https://raw.githubusercontent.com/Luckez12/VUEO-Providers/main`

## Runtime contract

Each enabled provider must export `getStreams(tmdbId, mediaType, season, episode)` and return a Promise resolving to an array of playable stream objects.

Providers remain disabled until their JavaScript ports are implemented and playback is verified.
