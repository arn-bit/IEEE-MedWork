# Rep counter validation traces

Put `*.json` traces recorded with the dev-only page `/dev/record` (run `npm run dev`, then open
http://localhost:5180/dev/record) in this folder. `src/pose/replay.test.ts` (part of `npm test`) and
`npm run eval:counters` replay every trace here through `RepCounter` and compare counted reps with the
"Rep done" taps.

A trace holds only pose landmarks (33 points × x, y, z, visibility per frame), relative timestamps,
the tap times and coarse setup labels (camera view, lighting, mobility). No video, images, names or dates.
Even so, a trace is a recording of how someone's body moves: only add traces from people who agreed to
have them stored in this repository, and delete them if they withdraw consent.

Follow the recording protocol in TEST_PLAN.md §8. A few traces are a smoke test, not clinical validation.
