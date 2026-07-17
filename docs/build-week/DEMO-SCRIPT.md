# PicSpeak Retake Coach — 2:50 demo script

Language: English voiceover. Target duration: 2 minutes 50 seconds. Use only self-owned or explicitly authorized photos. Do not show API keys, private object URLs, account passwords, or the configured gateway host.

| Time | Screen action | Voiceover |
|---|---|---|
| 0:00–0:15 | Show the original critique result. | “A single AI critique can tell a photographer what to change, but it cannot prove whether the next shot actually improved. During OpenAI Build Week, I used Codex to turn PicSpeak into a measurable retake practice loop.” |
| 0:15–0:35 | Point to the original photo and choose the new-photo retake action. | “This original photo already has a PicSpeak review. I choose Compare a retake, which preserves the source review and asks for a newly captured photo.” |
| 0:35–0:55 | Upload the authorized retake; show Original and Retake labels. | “The two positions are explicit: Image A is the original and Image B is the retake. PicSpeak uploads the new photo and creates an asynchronous retake comparison task.” |
| 0:55–1:15 | Show the task loading screen, then the result. | “The backend sends both real images in one Responses API request to GPT-5.6 Terra. Strict Structured Outputs guarantee the five required photography dimensions and the action-plan shape.” |
| 1:15–1:50 | Scroll through overall and five dimension cards. | “GPT-5.6 scores both images inside the same evaluation and cites visible evidence for composition, lighting, color, impact, and technical quality. The server—not the model—calculates every delta, overall average, and trend.” |
| 1:50–2:10 | Show caveat/confidence and next-shoot actions. | “If the images are unrelated, the model marks them non-comparable and PicSpeak does not draw a false progress curve. For valid pairs, each next action includes an observable success check.” |
| 2:10–2:28 | Open Generate visual reference and show the request/result. | “The paired diagnosis and the top actions become a concise visual brief for the existing GPT Image 2 workflow, giving the photographer a concrete target for the next shoot.” |
| 2:28–2:40 | Open review history and show the retake chain curve. | “Comparison results persist in the existing Review history. The new curve connects only attempts from the same retake chain instead of mixing unrelated photo averages.” |
| 2:40–2:50 | Show README Before/During table, Build Week log, and Codex task. | “The README separates the July first baseline from the Build Week contribution, and the repository records the Codex decisions, tests, and the real GPT-5.6 call path.” |

## Recording checklist

- Record at 1080p with browser zoom at 100%.
- Keep the final cut between 2:45 and 2:55.
- Add English captions even when using English voiceover.
- Blur the account email and any private identifiers.
- Upload to YouTube as **Public**, then verify the URL while signed out.
- Capture one fallback take using the pre-populated successful comparison, but demonstrate the live path in the primary take.
