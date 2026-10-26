# 010 — Rendering share videos in the browser over a server or screen recording

## Context

The diagrams people share most on X and LinkedIn are posters with motion: stage columns, official cloud icons and dashed lines that flow. A screenshot of the editor doesn't travel like that. Recording the editor's screen is worse still, because it captures the panels, the cursor and the window size of whoever recorded it.

The goal was a button that turns any design into an MP4 that X, LinkedIn and Reels will accept, with nothing for the user to install and no upload.

## Options

- **Screen-record the canvas** with `MediaRecorder`. Real-time only, so a 12-second clip takes 12 seconds or more. It drops frames under load, and Chrome records WebM, which X refuses.
- **Render on a server** with headless Chrome and ffmpeg. That gives full control, but it means a queue, compute bills, and users' designs leaving their browser.
- **Draw each frame on a canvas and encode with WebCodecs.** Faster than real time, deterministic, and private. It needs a muxer for MP4.

## Decision

Frames are drawn by a small canvas renderer and encoded in the browser with WebCodecs through [Mediabunny](https://mediabunny.dev), which writes H.264 MP4. If the browser can't encode H.264, it falls back to VP9 or AV1 WebM and says the file may not post to X.

The work is split so the hard part is testable:

- [layout.ts](../../src/export/layout.ts) is pure: where each component, link, label and stage goes, and when each appears. It is unit-tested without a browser, covering reading order, links drawn only after both ends exist, label placement that avoids captions, and fitting to each frame size.
- [renderer.ts](../../src/export/renderer.ts) draws one frame for a time `t`. The live preview and the encoder call the same function, so the preview is exactly what gets encoded.
- [encode.ts](../../src/export/encode.ts) steps `t` at 30 fps and feeds the encoder.

Particle density comes from a 4-second headless run of the real simulator, so busy links look busy in the video too.

## Consequences

- An 8-second 1080p clip renders in about 4 to 9 seconds on a laptop, and the smoke test renders one in headless Chrome on every push.
- Video is drawn separately from the editor, so it can use poster styling (bigger icons, right-angle lines, captions under icons) without touching the editor. The cost is a second renderer to keep in step with new drawing features.
- Vertical video doesn't squash the flow axis the way the phone editor does, because a 9:16 frame has the height a phone screen lacks.
- No audio. Users add music in the app they post from, which is what most people do anyway.
- The export code (about 30 KB gzipped) loads only when someone opens the dialog.
