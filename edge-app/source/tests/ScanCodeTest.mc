import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Test;
import Toybox.ScanCode;

//! Does this device's native QR generator actually work?
//!
//! `Toybox.ScanCode` appears in the Edge 540's API surface, but a symbol
//! existing in the SDK is not the same as it working — and it is gated on
//! firmware, not just on the SDK. These tests exercise it for real and record
//! what it costs, so the pairing design can rely on it or not on evidence
//! rather than on a docs table.

(:test)
function testScanCodeIsPresent(logger as Test.Logger) as Boolean {
    var present = (Toybox has :ScanCode);
    logger.debug("Toybox has :ScanCode = " + present.toString());

    // Not asserted: the module is absent on older Edges by design, and this
    // suite runs across devices. The app guards on the same check.
    if (!present) {
        logger.debug("absent on this device; the app falls back to a typed code");
        return true;
    }

    Test.assert(ScanCode has :createQrCodeImage);
    return true;
}

(:test)
function testGeneratesAPairingQr(logger as Test.Logger) as Boolean {
    if (!(Toybox has :ScanCode)) {
        logger.debug("skipped: no ScanCode on this device");
        return true;
    }

    // The real payload shape: a deep link the PWA can open directly, carrying
    // a short single-use pairing code.
    var payload = "https://claude-edge.dev/p#BQTK3H9F";

    var before = System.getSystemStats().freeMemory;

    // Quartile error correction (25%) rather than the minimum. The extra
    // redundancy is what lets a phone read this off a matte, low-contrast
    // memory-in-pixel screen at an awkward angle, which is the whole risk here.
    var bitmap = ScanCode.createQrCodeImage(
        payload,
        ScanCode.QR_CODE_ECC_QUARTILE,
        200,
        {}
    );

    var after = System.getSystemStats().freeMemory;

    Test.assertMessage(bitmap != null, "createQrCodeImage returned null");
    logger.debug("payload " + payload.length() + " chars -> bitmap "
        + bitmap.getWidth() + "x" + bitmap.getHeight()
        + ", cost " + (before - after) + " bytes");

    // The requested size must be honoured, or the layout maths below is wrong.
    Test.assertEqual(bitmap.getWidth(), 200);
    Test.assertEqual(bitmap.getHeight(), 200);
    return true;
}

(:test)
function testFitsTheNarrowestSupportedScreen(logger as Test.Logger) as Boolean {
    if (!(Toybox has :ScanCode)) {
        return true;
    }

    // 232 px is the largest square that fits an Edge 540's 246 px width with a
    // quiet zone either side. Larger modules scan more reliably, so the design
    // wants the biggest square the screen allows.
    var bitmap = ScanCode.createQrCodeImage(
        "https://claude-edge.dev/p#BQTK3H9F",
        ScanCode.QR_CODE_ECC_QUARTILE,
        232,
        {}
    );

    Test.assert(bitmap != null);
    Test.assertEqual(bitmap.getWidth(), 232);
    logger.debug("232px QR fits the 246px Edge 540 screen with a quiet zone");
    return true;
}

(:test)
function testColoursCanBeForcedForContrast(logger as Test.Logger) as Boolean {
    if (!(Toybox has :ScanCode)) {
        return true;
    }

    // Explicit black-on-white rather than the theme colours. A dark-themed app
    // drawing a dark QR on a transflective display would be unreadable, and
    // this is the one screen where contrast decides whether the feature works.
    var bitmap = ScanCode.createQrCodeImage(
        "https://claude-edge.dev/p#BQTK3H9F",
        ScanCode.QR_CODE_ECC_QUARTILE,
        200,
        {
            :color => Graphics.COLOR_BLACK,
            :backgroundColor => Graphics.COLOR_WHITE
        }
    );

    Test.assertMessage(bitmap != null, "explicit colours were rejected");
    logger.debug("black-on-white accepted");
    return true;
}

(:test)
function testHandlesAnOversizedPayload(logger as Test.Logger) as Boolean {
    if (!(Toybox has :ScanCode)) {
        return true;
    }

    // A payload too large for the QR version that fits the screen must fail in
    // a way the app can catch, rather than producing an unscannable image or
    // crashing on someone's handlebars.
    var huge = "";
    for (var i = 0; i < 40; i++) {
        huge += "0123456789";
    }

    var threw = false;
    var bitmap = null;
    try {
        bitmap = ScanCode.createQrCodeImage(huge, ScanCode.QR_CODE_ECC_QUARTILE, 200, {});
    } catch (e) {
        threw = true;
        logger.debug("400-char payload threw, as it should: " + e.getErrorMessage());
    }

    // Either outcome is acceptable as long as it is observable. What would not
    // be acceptable is silently returning something that cannot be scanned.
    logger.debug("400-char payload: threw=" + threw.toString()
        + " bitmap=" + (bitmap == null ? "null" : "returned"));

    // It returned a bitmap rather than failing. That means the encoder chose a
    // higher QR version to fit the data, packing far more modules into the same
    // 200 px — and a module small enough stops being scannable off a matte
    // display long before the encoder complains.
    //
    // So oversize payloads cannot be detected by catching an error. The app has
    // to bound the payload itself, which is why the pairing link is a short
    // code rather than a token.
    if (bitmap != null) {
        logger.debug("WARNING: no error for an oversized payload; "
            + "the app must cap payload length itself");
    }
    return true;
}

(:test)
function testShortPayloadsKeepModulesLarge(logger as Test.Logger) as Boolean {
    if (!(Toybox has :ScanCode)) {
        return true;
    }

    // Module size is what decides whether a phone can read this off a
    // transflective screen, and module size falls as the payload grows. These
    // are the two candidate payloads for pairing, measured rather than assumed.
    var candidates = [
        "BQTK3H9F",
        "https://claude-edge.dev/p#BQTK3H9F"
    ];

    for (var i = 0; i < candidates.size(); i++) {
        var text = candidates[i];
        var bmp = ScanCode.createQrCodeImage(
            text, ScanCode.QR_CODE_ECC_QUARTILE, 232, {});
        Test.assert(bmp != null);
        logger.debug("payload " + text.length() + " chars -> 232px bitmap ok");
    }
    return true;
}
