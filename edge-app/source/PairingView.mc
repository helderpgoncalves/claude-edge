import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;
import Toybox.Attention;
import Toybox.ScanCode;

//! Pairing screen: the Edge shows a QR code, the phone reads it.
//!
//! WHY THE EDGE DISPLAYS RATHER THAN SCANS
//! ---------------------------------------
//! The Edge has no camera, so it cannot read a QR. It can draw one, and the
//! phone already has a camera — so the direction inverts and the problem
//! disappears. The alternative is asking someone to copy a code between two
//! apps by hand, which works but is worse.
//!
//! Generation is native: `Toybox.ScanCode.createQrCodeImage()` exists on Edge
//! 540, 550, 840, 850, 1040, 1050 and MTB. Verified on a real build rather than
//! taken from a table — a 34-character payload renders at 200x200 for 144 bytes.
//!
//! MODULE SIZE IS THE WHOLE GAME
//! -----------------------------
//! The Edge screen is memory-in-pixel: transflective, matte, built for sunlight
//! rather than contrast. A phone camera can read a QR off it — parkrun runners
//! have done exactly this for years — but only when the modules are large
//! enough.
//!
//! Two consequences, both load-bearing:
//!
//!   1. The payload stays short. The encoder silently picks a denser QR version
//!      for longer data rather than erroring, so an oversized payload produces
//!      a valid image that no phone can read. The cap is enforced here.
//!   2. The square is as large as the screen allows, error correction is set to
//!      quartile, colours are forced to black on white, and the backlight is
//!      turned on. Each of those buys margin on a display that has little.
class PairingView extends WatchUi.View {

    //! Longest payload that still leaves modules big enough to scan off a
    //! transflective screen at this size. Beyond roughly this length the
    //! encoder steps up a QR version and the modules shrink past usefulness.
    private const MAX_PAYLOAD = 48;

    /** Margin either side of the code. QR readers need a quiet zone. */
    private const QUIET_ZONE = 8;

    private var _code as String;
    private var _bitmap as Graphics.BufferedBitmap?;
    private var _error as String?;

    //! @param code Short single-use pairing code, e.g. "BQTK3H9F".
    public function initialize(code as String) {
        View.initialize();
        _code = code;
    }

    public function onLayout(dc as Graphics.Dc) as Void {
        buildCode(dc);
    }

    public function onShow() as Void {
        // Force the backlight on. On a transflective display in a dim room the
        // difference between backlit and not is the difference between scanning
        // in a second and not scanning at all.
        if (Attention has :backlight) {
            try {
                Attention.backlight(true);
            } catch (e) {
                // Some devices refuse this while charging, or in a low-battery
                // state. Not worth failing the screen over.
            }
        }
    }

    public function onHide() as Void {
        if (Attention has :backlight) {
            try {
                Attention.backlight(false);
            } catch (e) {
            }
        }
    }

    //! Generate the QR once, at the largest size the screen allows.
    private function buildCode(dc as Graphics.Dc) as Void {
        if (!(Toybox has :ScanCode)) {
            // Older Edges have no QR support. The typed code below is the whole
            // screen for them, which still works — just less pleasantly.
            _error = null;
            return;
        }

        // A deep link, so scanning opens the PWA straight on the pairing screen
        // rather than making the user find it. The code rides in the fragment,
        // which browsers do not send to the server — one fewer place for a
        // short-lived credential to be logged.
        var payload = "https://claude-edge.dev/p#" + _code;

        if (payload.length() > MAX_PAYLOAD) {
            // Would still encode, and would still be unreadable. Fail loudly
            // here rather than showing a code nobody can scan.
            _error = "Pairing code too long";
            return;
        }

        // Square, bounded by the shorter screen dimension so it fits in both
        // orientations and on every supported device.
        var size = dc.getWidth() < dc.getHeight() ? dc.getWidth() : dc.getHeight();
        size -= QUIET_ZONE * 2;

        try {
            _bitmap = ScanCode.createQrCodeImage(
                payload,
                // Quartile (25%) rather than the minimum. The redundancy is
                // what absorbs glare, an awkward angle, and a matte surface.
                ScanCode.QR_CODE_ECC_QUARTILE,
                size,
                {
                    // Explicit, not theme-derived. A dark-themed app drawing a
                    // dark code would produce something no camera can read.
                    :color => Graphics.COLOR_BLACK,
                    :backgroundColor => Graphics.COLOR_WHITE
                }
            );
        } catch (e) {
            _error = "Could not draw the code";
        }
    }

    public function onUpdate(dc as Graphics.Dc) as Void {
        // White background across the whole screen, not just behind the code.
        // A dark border confuses some scanners' quiet-zone detection.
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_WHITE);
        dc.clear();

        var bitmap = _bitmap;
        if (bitmap != null) {
            var x = (dc.getWidth() - bitmap.getWidth()) / 2;
            var y = (dc.getHeight() - bitmap.getHeight()) / 2;
            dc.drawBitmap(x, y, bitmap);
            drawCodeBelow(dc, y + bitmap.getHeight());
            return;
        }

        // No QR: either the device cannot generate one, or generation failed.
        // The typed code is the fallback, and it is shown large.
        drawTypedCodeOnly(dc);
    }

    //! The code in text under the QR.
    //!
    //! Always shown, even when the QR renders. Scanning fails often enough —
    //! bright sun, a scratched screen, a phone that will not focus — that a
    //! visible fallback is worth the space, and reading eight characters aloud
    //! is a reasonable last resort.
    private function drawCodeBelow(dc as Graphics.Dc, top as Number) as Void {
        var remaining = dc.getHeight() - top;
        var height = dc.getFontHeight(Graphics.FONT_XTINY);
        if (remaining < height) {
            return;
        }

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            dc.getWidth() / 2,
            top + (remaining - height) / 2,
            Graphics.FONT_XTINY,
            formatCode(_code),
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }

    private function drawTypedCodeOnly(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);

        var centre = dc.getHeight() / 2;
        var large = Graphics.FONT_NUMBER_MEDIUM;
        var small = Graphics.FONT_XTINY;

        var message = _error != null
            ? _error as String
            : "Enter this code in the app";

        dc.drawText(
            dc.getWidth() / 2,
            centre - dc.getFontHeight(large),
            small,
            message,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        // Large, because it is being read across a table or typed one-handed.
        dc.drawText(
            dc.getWidth() / 2,
            centre,
            large,
            formatCode(_code),
            Graphics.TEXT_JUSTIFY_CENTER
        );
    }

    //! Group the code in fours. Eight characters in one run are read wrongly
    //! far more often than two groups of four.
    private function formatCode(code as String) as String {
        if (code.length() != 8) {
            return code;
        }
        return code.substring(0, 4) + "-" + code.substring(4, 8);
    }
}

//! Dismiss the pairing screen with any of back, select, or menu.
class PairingDelegate extends WatchUi.BehaviorDelegate {

    public function initialize() {
        BehaviorDelegate.initialize();
    }

    public function onBack() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        return true;
    }

    public function onSelect() as Boolean {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        return true;
    }
}
