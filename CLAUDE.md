# CLAUDE.md
# BioID Photo Check — Project Context

## What This Is

A Node/Express test harness for the BioID Biometric Web Service (BWS), specifically the QualityCheck endpoint for ICAO passport/visa photo validation.

## Documentation

- Classic BWS API reference: https://developer.bioid.com/classicbws/bwsreference
- BWS Authentication (JWT): https://developer.bioid.com/bws/authentication
- QualityCheck endpoint: https://bws.bioid.com/extension/qualitycheck
- Token endpoint: https://bws.bioid.com/extension/token

## Authentication

The classic BWS extension API (`https://bws.bioid.com/extension`) supports two auth methods:

**Basic Auth (current):** `Authorization: Basic base64(APP_ID:APP_SECRET)`

**JWT Bearer (alternative):**
1. Call `GET /extension/token?id={APP_ID}&bcid={BCID}` with Basic auth to obtain a JWT
2. Use `Authorization: Bearer {token}` on subsequent calls

The QualityCheck endpoint does not require a BCID (it is not user-specific). Basic auth is the correct approach for it. If getting 401s, the issue is credential values, not auth method.

## Credentials

This app uses **Classic BWS**, NOT BWS 3. The BWS Portal supports both, and they use
different keys — do not confuse them:

- **BWS 3 keys** (Client ID + two 512-bit keys labeled 0/1): used for gRPC/REST JWT auth.
  These will NOT work against `/extension/qualitycheck` and produce a 401.
- **Classic WEB API key** (App-ID + App-Secret): what this app needs.

To generate Classic credentials in the BWS Portal:
1. On your client, click **"Show client keys"**
2. Open the **"Classic keys"** dialog (separate from the BWS 3 keys)
3. Click **"+"** to create a new **WEB API key** → yields AppId + AppSecret

Set in `.env`:
- `BIOID_APP_ID` — Classic AppId
- `BIOID_APP_SECRET` — Classic AppSecret
- `BIOID_ENDPOINT` — defaults to `https://bws.bioid.com/extension`

Note: QualityCheck is a Classic-BWS-only feature. BWS 3 has no standalone QualityCheck
endpoint (only LivenessDetection, PhotoVerify, Face Recognition).
