# Judge testing instructions

Do not place credentials in this repository. Copy the private values into the Devpost “Testing instructions” field immediately before submission.

## Private values to provide in Devpost

- Public deployment URL: **pending deployment**
- Dedicated judge email/username: **pending account creation**
- Dedicated judge password or access method: **pending account creation**
- Access expiry: later than 2026-08-05 17:00 PT

## Reproduction steps

1. Open the deployment in a private/incognito browser window.
2. Sign in with the dedicated judge account. No payment, phone number, or personal email verification should be required.
3. Open the pre-populated original portrait review.
4. Choose the new-photo retake path and upload the supplied authorized retake sample.
5. Confirm that the workspace labels the source as **Original** and the new upload as **Retake**.
6. Start the review and wait for the asynchronous comparison to finish.
7. Verify the overall before/after result, all five dimension deltas, visible evidence, remaining gaps, and next-shoot actions with success checks.
8. Choose **Generate visual reference** and verify that the generated reference uses the paired visual target.
9. Open Review History and confirm that the new attempt appears in the retake-chain progress curve.

## Account quota target

The judge account must have enough quota for at least:

- 3 paired GPT-5.6 comparisons.
- 2 GPT Image 2 reference generations.
- 1 retry of each operation without payment.

## Clean-browser acceptance

- No cached login or local storage is required.
- The deployment URL opens without VPN or allowlisting.
- The original pre-populated comparison remains viewable if a live upstream call is temporarily unavailable.
- Credentials are tested from a signed-out browser on a second network.
