# Before Build Week baseline evidence

PicSpeak's pre-event baseline is commit `b74ddfb88ae32e37965ba8b29f40c9ebcbbf77fc`, authored on `2026-07-01T20:57:01+09:00`. The Build Week submission window started later, on 2026-07-13 at 09:00 PT.

The following screenshots already existed in that baseline commit and therefore document pre-Build-Week capability rather than the Retake Coach contribution:

| Screenshot | Baseline capability shown |
|---|---|
| [`docs/assets/screenshots/home.jpg`](../assets/screenshots/home.jpg) | Existing landing page and single-photo entry |
| [`docs/assets/screenshots/review.jpg`](../assets/screenshots/review.jpg) | Existing single-photo critique result |
| [`docs/assets/screenshots/history.jpg`](../assets/screenshots/history.jpg) | Existing general review history |
| [`docs/assets/screenshots/gallery.jpg`](../assets/screenshots/gallery.jpg) | Existing public gallery |
| [`docs/assets/screenshots/mobile.jpg`](../assets/screenshots/mobile.jpg) | Existing mobile shell |

Verification command:

```powershell
git ls-tree -r --name-only b74ddfb -- docs/assets/screenshots
```

Retake Coach's paired GPT-5.6 request, structured comparison result, comparable-only progress curve, and comparison-driven GPT Image 2 brief did not exist at this baseline.
