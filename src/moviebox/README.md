# MovieBox VUEO Provider

Status: functional v1.

This provider is ported from the MovieBox implementation in
`Luckez12/Cloudstream-Repo`.

Runtime flow:

1. Resolve the TMDB numeric ID to a title through the public TMDB media page.
2. Race MovieBox H5 mirrors for an exact or high-confidence subject match.
3. Race playback endpoints for direct stream URLs.
4. Return HLS or MP4 streams with playback headers.
5. Attach English, Malay and Indonesian captions when the MovieBox caption
   endpoint supplies them.

The distributed runtime file is `providers/moviebox.js`.

The implementation intentionally uses Promise chains and Web APIs only so it
can run in the VUEO JavaScript provider runtime.
