require("dotenv").config();
const express = require("express");
const path = require("path");
const piexif = require("piexifjs");

const app = express();
const PORT = process.env.PORT || 3000;

// Data-URLs of resized photos (now capped at 3000px longest side, see
// MAX_DIMENSION in app.js) can run a few MB larger than before; 16mb
// leaves comfortable headroom.
app.use(express.json({ limit: "16mb" }));
app.use(express.static(path.join(__dirname, "public")));

const BIOID_ENDPOINT =
  process.env.BIOID_ENDPOINT || "https://bws.bioid.com/extension";
const APP_ID = process.env.BIOID_APP_ID;
const APP_SECRET = process.env.BIOID_APP_SECRET;

// Friendly, non-jargon explanations for the ICAO error codes BioID returns.
// Falls back to BioID's own Message field if a code isn't in this map.
const ERROR_EXPLANATIONS = {
  NoFaceFound:
    "We couldn't detect a face in this photo. Make sure your face is clearly visible and well lit.",
  MultipleFacesFound:
    "More than one face was detected. Only one person should be in the photo.",
  IrisNotFound:
    "We couldn't clearly locate one or both eyes. Try removing tinted glasses or improving lighting.",
  CannotCropImage:
    "There isn't enough space around your head in the frame. Step back slightly or use a wider shot.",
  ImageTooSmall:
    "The photo resolution is too low, or your face is too small in the frame. Move closer to the camera or use a higher-resolution image.",
  ImageWayTooSmall:
    "This image is far too small to use. Please upload a higher-resolution photo.",
  WrongViewingDirection: "Please look straight ahead directly into the camera.",
  HeadRotatedTooFar:
    "Your head is tilted too much. Keep your head level and facing forward.",
  FaceAsymmetry:
    "Uneven lighting or an angled pose is making your face look asymmetric. Face the camera directly with even lighting on both sides.",
  ImageTooBlurry:
    "The photo is too blurry. Hold the camera steady, make sure focus is sharp, and avoid heavy compression.",
  BadFaceBrightness:
    "The brightness on your face is uneven. Use soft, even, front-facing light and avoid strong shadows.",
  FaceContrastTooHigh:
    "There is too much contrast on your face. Avoid harsh direct lighting.",
  FaceContrastTooLow:
    "There is too little contrast on your face. Increase lighting or avoid a washed-out camera setting.",
  ImageOverExposure:
    "The photo is overexposed (too many very bright pixels). Reduce lighting or camera exposure.",
  ImageUnderExposure:
    "The photo is underexposed (too many very dark pixels). Add more lighting.",
  FaceTooDark:
    "Your face is too dark in this photo. Add more front-facing light.",
  FaceTooBright:
    "Your face is too bright / washed out in this photo. Reduce lighting or move away from direct light.",
  BadGrayscaleDensity:
    "The photo lacks tonal variation. Improve lighting so facial detail is clearly visible.",
  ImageTooOld:
    "This photo appears to be older than 6 months based on its file metadata. Use a recent photo.",
  MissingTimeStamp:
    "This photo has no date information attached, so we can't confirm how recent it is.",
  ImageContrastTooHigh: "The overall image has too much contrast.",
  ImageContrastTooLow: "The overall image has too little contrast.",
  BadImageBrightness: "The overall image brightness distribution is off.",
  ImageTooDark: "The overall image is too dark.",
  ImageTooBright: "The overall image is too bright.",
};

// Canvas-generated JPEGs (both the camera-capture and upload-resize paths in
// app.js draw through <canvas>.toDataURL) carry no EXIF at all, so BioID's
// MissingTimeStamp check always fires. Stamp a DateTimeOriginal of "now"
// before forwarding -- this is a live check, so "now" is the correct value
// regardless of whether the source was the camera or an uploaded file.
function stampExifDateTime(imageDataUrl) {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const exifDate = `${now.getFullYear()}:${pad(now.getMonth() + 1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const exifObj = {
    "0th": {},
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: exifDate },
    GPS: {},
  };
  const exifStr = piexif.dump(exifObj);
  return piexif.insert(exifStr, imageDataUrl);
}

function friendlyErrors(errors) {
  return (errors || []).map((e) => ({
    code: e.Code,
    message: ERROR_EXPLANATIONS[e.Code] || e.Message,
    details: e.Details || null,
  }));
}

app.post("/api/quality-check", async (req, res) => {
  if (!APP_ID || !APP_SECRET) {
    return res.status(500).json({
      error:
        "Server is not configured with BIOID_APP_ID / BIOID_APP_SECRET. Copy .env.example to .env and fill in your BWS credentials.",
    });
  }

  const { imageDataUrl, issuer } = req.body || {};
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
    return res.status(400).json({
      error: "imageDataUrl must be a data:image/... base64 data URL.",
    });
  }

  const chosenIssuer = issuer || "ICAO";
  const url = `${BIOID_ENDPOINT}/qualitycheck?full=true&issuer=${encodeURIComponent(chosenIssuer)}`;
  const basicAuth = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");

  let stampedImageDataUrl = imageDataUrl;
  try {
    stampedImageDataUrl = stampExifDateTime(imageDataUrl);
  } catch (exifErr) {
    console.warn("Could not stamp EXIF DateTimeOriginal:", exifErr);
  }

  // DEBUG: log auth details to help diagnose 401s
  console.debug("[BioID DEBUG] APP_ID       :", APP_ID);
  console.debug(
    "[BioID DEBUG] APP_SECRET   :",
    APP_SECRET ? `"${APP_SECRET}" (length=${APP_SECRET.length})` : "(not set)",
  );
  console.debug("[BioID DEBUG] Authorization: Basic", basicAuth);
  console.debug("[BioID DEBUG] URL          :", url);

  try {
    const bioidResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "text/plain",
      },
      body: stampedImageDataUrl,
    });

    const text = await bioidResponse.text();

    // DEBUG: log response metadata
    console.debug(
      "[BioID DEBUG] Response status :",
      bioidResponse.status,
      bioidResponse.statusText,
    );
    console.debug(
      "[BioID DEBUG] Response headers:",
      Object.fromEntries(bioidResponse.headers.entries()),
    );
    console.debug("[BioID DEBUG] Response body   :", text.slice(0, 500));

    if (!bioidResponse.ok) {
      return res.status(bioidResponse.status).json({
        error: `Scan service returned ${bioidResponse.status}`,
        details: text,
      });
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (parseErr) {
      return res
        .status(502)
        .json({ error: "Could not parse scan service response", raw: text });
    }

    res.json({
      success: result.Success,
      issuer: chosenIssuer,
      errors: friendlyErrors(result.Errors),
      rawErrors: result.Errors || [],
      eyeCenters: result.EyeCenters || null,
    });
  } catch (err) {
    console.error("BioID request failed:", err);
    res.status(502).json({
      error: "Failed to reach the accreditation scan service",
      details: String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`BioID photo check test app running at http://localhost:${PORT}`);
  if (!APP_ID || !APP_SECRET) {
    console.warn(
      "WARNING: BIOID_APP_ID / BIOID_APP_SECRET not set. Copy .env.example to .env and fill in your BWS trial credentials.",
    );
  }
});
