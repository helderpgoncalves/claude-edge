import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Reads user settings and turns them into values the rest of the app can use
//! without re-validating.
//!
//! Settings arrive from Garmin Connect Mobile as free text, so everything here
//! assumes the input is wrong until checked: a URL with a trailing slash, a
//! token pasted with a newline, an http:// address that Connect IQ will refuse
//! at request time with a bare error code. Catching these here means the app
//! can say what is wrong in words, on screen, instead of showing "-1001".
module Config {

    // Poll modes, matching the list values in properties.xml.
    enum PollMode {
        POLL_ADAPTIVE = 0,
        POLL_FAST = 1,
        POLL_SAVER = 2,
        POLL_CUSTOM = 3
    }

    // Fixed intervals, in seconds, for the non-adaptive modes.
    const FAST_INTERVAL_S = 2;
    const SAVER_INTERVAL_S = 30;

    //! Bounds on what the server may ask for. A server that returns a very
    //! small interval — through a bug or otherwise — must not be able to drain
    //! the battery of a device it does not own.
    const MIN_INTERVAL_S = 2;
    const MAX_INTERVAL_S = 300;

    //! Result of validating the configuration.
    class Settings {
        public var serverUrl as String = "";
        public var authToken as String = "";
        public var sessionName as String = "";
        public var pollMode as Number = POLL_ADAPTIVE;
        public var customIntervalS as Number = 5;
        public var fontSize as Number = 0;
        public var confirmDestructive as Boolean = true;
        public var vibrateOnPrompt as Boolean = true;

        //! Null when usable; otherwise a short message to show the rider.
        public var error as String? = null;

        public function initialize() {
        }

        public function isUsable() as Boolean {
            return error == null;
        }
    }

    //! Read a string property, tolerating an unset or wrongly-typed value.
    function readString(key as String) as String {
        var value = null;
        try {
            value = Application.Properties.getValue(key);
        } catch (e) {
            // A key missing from properties.xml throws rather than returning
            // null. Treat it as unset so a partial settings rollout cannot
            // crash the app on launch.
            return "";
        }
        if (value instanceof String) {
            return value as String;
        }
        return "";
    }

    function readNumber(key as String, fallback as Number) as Number {
        var value = null;
        try {
            value = Application.Properties.getValue(key);
        } catch (e) {
            return fallback;
        }
        if (value instanceof Number) {
            return value as Number;
        }
        return fallback;
    }

    function readBoolean(key as String, fallback as Boolean) as Boolean {
        var value = null;
        try {
            value = Application.Properties.getValue(key);
        } catch (e) {
            return fallback;
        }
        if (value instanceof Boolean) {
            return value as Boolean;
        }
        return fallback;
    }

    //! Strip surrounding whitespace. Monkey C has no String.trim(), and a token
    //! pasted from a phone keyboard very often carries a trailing space.
    function trim(input as String) as String {
        var chars = input.toCharArray();
        var start = 0;
        var end = chars.size();

        while (start < end) {
            var c = chars[start];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                start++;
            } else {
                break;
            }
        }
        while (end > start) {
            var c = chars[end - 1];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
                end--;
            } else {
                break;
            }
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

    //! True when `text` begins with `prefix`, case-sensitively.
    function startsWith(text as String, prefix as String) as Boolean {
        if (text.length() < prefix.length()) {
            return false;
        }
        return text.substring(0, prefix.length()).equals(prefix);
    }

    //! Load and validate every setting.
    function load() as Settings {
        var s = new Settings();

        s.serverUrl = trim(readString("serverUrl"));
        s.authToken = trim(readString("authToken"));
        s.sessionName = trim(readString("sessionName"));
        s.pollMode = readNumber("pollMode", POLL_ADAPTIVE);
        s.customIntervalS = readNumber("pollSeconds", 5);
        s.fontSize = readNumber("fontSize", 0);
        s.confirmDestructive = readBoolean("confirmDestructive", true);
        s.vibrateOnPrompt = readBoolean("vibrateOnPrompt", true);

        // Drop a trailing slash so paths can be appended without producing a
        // double slash, which some proxies treat as a distinct route.
        while (s.serverUrl.length() > 1 &&
               s.serverUrl.substring(s.serverUrl.length() - 1, s.serverUrl.length()).equals("/")) {
            s.serverUrl = s.serverUrl.substring(0, s.serverUrl.length() - 1);
        }

        if (s.serverUrl.length() == 0) {
            s.error = WatchUi.loadResource(Rez.Strings.ErrNoConfig) as String;
            return s;
        }

        // Connect IQ refuses plain HTTP outright, returning SECURE_CONNECTION_
        // REQUIRED (-1001). Saying so in words here is far more useful than
        // letting the rider discover a numeric code on a hillside.
        if (!startsWith(s.serverUrl, "https://")) {
            s.error = WatchUi.loadResource(Rez.Strings.ErrHttps) as String;
            return s;
        }

        if (s.authToken.length() == 0) {
            s.error = WatchUi.loadResource(Rez.Strings.ErrNoConfig) as String;
            return s;
        }

        if (s.customIntervalS < MIN_INTERVAL_S) {
            s.customIntervalS = MIN_INTERVAL_S;
        } else if (s.customIntervalS > MAX_INTERVAL_S) {
            s.customIntervalS = MAX_INTERVAL_S;
        }

        return s;
    }

    //! Decide how long to wait before the next poll.
    //!
    //! In adaptive mode the server's suggestion wins, because only the server
    //! knows whether Claude is mid-task, blocked on a prompt, or idle. It is
    //! still clamped: a remote server should not be able to set an arbitrary
    //! polling rate on someone's bike computer.
    function nextIntervalMs(settings as Settings, serverSuggestionS as Number) as Number {
        var seconds;

        if (settings.pollMode == POLL_FAST) {
            seconds = FAST_INTERVAL_S;
        } else if (settings.pollMode == POLL_SAVER) {
            seconds = SAVER_INTERVAL_S;
        } else if (settings.pollMode == POLL_CUSTOM) {
            seconds = settings.customIntervalS;
        } else {
            seconds = serverSuggestionS;
        }

        if (seconds < MIN_INTERVAL_S) {
            seconds = MIN_INTERVAL_S;
        } else if (seconds > MAX_INTERVAL_S) {
            seconds = MAX_INTERVAL_S;
        }
        return seconds * 1000;
    }
}
