import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Text entry on the device, using the system keyboard.
//!
//! WatchUi.TextPicker is Connect IQ's own on-device keyboard, and it is
//! supported on every Edge this app targets. Using it rather than building a
//! character picker means the rider gets the same input surface they already
//! know from the unit's other apps, including whatever text-entry improvements
//! Garmin ships in future firmware.
//!
//! WHAT THIS IS AND IS NOT FOR
//! ---------------------------
//! Entering a sentence on a seven-button cycling computer takes a while. This
//! is genuinely useful stopped at a junction, at a café, or for a short
//! correction — "yes but use 30s", "run the tests". It is not the way to write
//! a paragraph, and it should not be used at speed.
//!
//! For anything longer the phone is the right surface, which is why the PWA is
//! on the roadmap and why the canned prompts exist: most of what a rider wants
//! to send mid-ride is one of a handful of things.
class TextEntryDelegate extends WatchUi.TextPickerDelegate {

    private var _onDone as Method(text as String) as Void;

    //! @param onDone Invoked with the entered text, after the picker closes.
    public function initialize(onDone as Method(text as String) as Void) {
        TextPickerDelegate.initialize();
        _onDone = onDone;
    }

    //! Called when the rider confirms.
    //!
    //! @param text    What they entered.
    //! @param changed True when it differs from the initial value.
    public function onTextEntered(text as String, changed as Boolean) as Boolean {
        var trimmed = trim(text);

        // Confirming an empty field is a cancel in everything but name; treating
        // it as a submission would send a bare Enter into the session.
        if (trimmed.length() == 0) {
            return true;
        }

        _onDone.invoke(trimmed);
        return true;
    }

    public function onCancel() as Boolean {
        return true;
    }

    //! Monkey C has no String.trim(), and the picker readily returns trailing
    //! spaces when the rider steps past the end of what they typed.
    private function trim(input as String) as String {
        var chars = input.toCharArray();
        var start = 0;
        var end = chars.size();

        while (start < end && (chars[start] == ' ' || chars[start] == '\t')) {
            start++;
        }
        while (end > start && (chars[end - 1] == ' ' || chars[end - 1] == '\t')) {
            end--;
        }
        if (start == 0 && end == chars.size()) {
            return input;
        }

        var out = "";
        for (var i = start; i < end; i++) {
            out += chars[i].toString();
        }
        return out;
    }
}

//! Open the system keyboard.
//!
//! @param initial Text to prefill, so a canned prompt can be edited rather
//!                than retyped.
//! @param onDone  Invoked with the result when the rider confirms.
//! @return false when the device has no text picker, so the caller can say so
//!         rather than appearing to do nothing.
function promptForText(
    initial as String,
    onDone as Method(text as String) as Void
) as Boolean {
    // Guarded rather than assumed: TextPicker is absent on some older hardware,
    // and calling a missing symbol is a crash, not a no-op.
    if (!(WatchUi has :TextPicker)) {
        return false;
    }

    var picker = new WatchUi.TextPicker(initial);
    WatchUi.pushView(picker, new TextEntryDelegate(onDone), WatchUi.SLIDE_UP);
    return true;
}
