import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Test;
import Toybox.ActivityMonitor;

//! Can a device app read live ride data, and can it draw a translucent overlay?
//!
//! Both are needed for the "terminal over the ride screen" idea, and both are
//! easier to assume than to verify. `Activity.getActivityInfo()` returns null
//! outside a recording on some devices, and alpha blending is advertised in
//! compiler.json without saying which API exposes it.
//!
//! These tests record what is actually available rather than what the docs
//! imply, so the design can rest on evidence.

(:test)
function testActivityInfoIsReachable(logger as Test.Logger) as Boolean {
    var info = Activity.getActivityInfo();

    if (info == null) {
        // Expected in the simulator with no activity running, and the reason
        // the overlay has to degrade rather than assume data is present.
        logger.debug("getActivityInfo() is null — no activity in progress");
        return true;
    }

    logger.debug("getActivityInfo() returned an object");

    // Which fields exist is device- and activity-dependent, so each is probed
    // rather than assumed. A missing field is a null, not an error.
    var fields = [
        [:currentSpeed, "speed"],
        [:elapsedDistance, "distance"],
        [:currentHeartRate, "heart rate"],
        [:currentPower, "power"],
        [:currentCadence, "cadence"],
        [:altitude, "altitude"],
        [:elapsedTime, "elapsed time"],
        [:totalAscent, "ascent"]
    ];

    for (var i = 0; i < fields.size(); i++) {
        var sym = fields[i][0] as Symbol;
        var name = fields[i][1] as String;
        logger.debug("  " + name + ": " + ((info has sym) ? "available" : "absent"));
    }

    return true;
}

(:test)
function testActivityMonitorAsFallback(logger as Test.Logger) as Boolean {
    // ActivityMonitor holds day totals and works outside a recording, so it is
    // the fallback when getActivityInfo() has nothing.
    if (!(Toybox has :ActivityMonitor)) {
        logger.debug("ActivityMonitor unavailable on this device");
        return true;
    }

    var info = ActivityMonitor.getInfo();
    Test.assertMessage(info != null, "ActivityMonitor.getInfo() returned null");
    logger.debug("ActivityMonitor works outside a recording");
    return true;
}

(:test)
function testAlphaBlendingIsUsable(logger as Test.Logger) as Boolean {
    // compiler.json says alphaBlendingSupport is true for the Edge 540, but
    // that flag does not say which API surfaces it. setFill with an alpha
    // channel is the one the overlay would use.
    var supported = (Graphics.Dc has :setFill);
    logger.debug("Dc.setFill (alpha-capable fill): " + supported.toString());

    logger.debug("createColor: " + (Graphics has :createColor).toString());
    logger.debug("BufferedBitmap: " + (Graphics has :BufferedBitmap).toString());

    // Not asserted — the overlay degrades to an opaque panel where alpha is
    // unavailable, which is why this records rather than requires.
    return true;
}

(:test)
function testWhatTransparencyIsActuallyAvailable(logger as Test.Logger) as Boolean {
    // Dc.setFill is absent, so true per-pixel alpha is out. Three fallbacks
    // remain, in descending order of quality. Probe which exist rather than
    // guessing, because the answer decides how the overlay looks.

    // 1. An alpha value packed into a colour, drawn through createColor.
    logger.debug("Graphics.createColor: " + (Graphics has :createColor).toString());

    // 2. A BufferedBitmap composited with a transparent background colour.
    logger.debug("BufferedBitmap: " + (Graphics has :BufferedBitmap).toString());
    logger.debug("createBufferedBitmap: " + (Graphics has :createBufferedBitmap).toString());

    // 3. setClip, to reserve a region rather than blend into it. Always
    //    available, and the basis of the split-screen fallback.
    logger.debug("Dc.setClip: " + (Graphics.Dc has :setClip).toString());

    // Does createColor actually accept an alpha byte on this device?
    if (Graphics has :createColor) {
        try {
            var translucent = Graphics.createColor(0x80, 0x00, 0x00, 0x00);
            logger.debug("createColor with alpha=0x80 accepted: " + translucent);
        } catch (e) {
            logger.debug("createColor rejected an alpha value: " + e.getErrorMessage());
        }
    }

    return true;
}
