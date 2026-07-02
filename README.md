# BioID Passport Photo Quality Check — Test App

A small local test harness: upload a photo or capture one from your
device camera, and it gets run against BioID's `QualityCheck` Web API
(ICAO 9303 passport/visa photo standard).

Uses a Node/Express backend as a proxy because BioID's QualityCheck
endpoint requires HTTP Basic Auth and does not support CORS from a
browser — your App-Secret must stay server-side.

## 1. Get BioID trial credentials

1. Go to https://bwsportal.bioid.com and register for the free 30-day
   BWS trial (requires a confirmed BioID account).
2. In the portal, create a **BWS Client** app. This gives you an
   **App-ID** and **App-Secret**.

## 2. Configure

```
cp .env.example .env
```

Edit `.env` and fill in:

```
BIOID_APP_ID=...
BIOID_APP_SECRET=...
```

Leave `BIOID_ENDPOINT` as-is unless BioID gave you a dedicated host URL.

## 3. Install & run

```
npm install
npm start
```

Open http://localhost:3000

## 4. Use it

- **Upload photo** — picks an existing image file.
- **Use camera** — opens your webcam/phone camera, click **Capture**.
- Pick a **Standard** (ICAO default, or a specific country like US/GB/DE)
  from the dropdown — BioID applies slightly different thresholds per
  issuer.
- Click **Check photo**. You'll get a pass/fail banner plus a
  plain-English explanation for each failed check (blur, lighting,
  pose, head size, etc.), and the raw JSON response from BioID if you
  want to inspect exact measured values.

## Notes

- Photos are resized client-side (longest side capped at 1600px) before
  upload to keep payloads reasonable — well above BioID's ICAO minimum
  crop size of 876x1063px.
- Nothing is stored. Each check is a single stateless API call; no
  photos are saved to disk by this app. (BioID's own retention/logging
  policy is separate — check their docs/DPA if that matters for your
  use case.)
- This is a **test harness**, not production code: no rate limiting,
  auth, or queueing. Don't point it at a public URL as-is.
- Camera capture requires HTTPS in most browsers except on `localhost`.
  If you deploy this anywhere other than your own machine, you'll need
  TLS for `getUserMedia` to work.
