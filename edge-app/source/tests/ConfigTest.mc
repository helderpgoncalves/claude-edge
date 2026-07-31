import Toybox.Lang;
import Toybox.Test;

//! Unit tests for Config, run on-device (or in the simulator) by the Connect IQ
//! test runner:
//!
//!     ./scripts/test-edge.sh
//!
//! These cover the logic that decides whether the app will talk to a server at
//! all, and how often. Both are easy to get subtly wrong and awkward to notice
//! by looking at the screen: a URL validator that is too strict silently
//! refuses a working deployment, and a poll interval that is not clamped lets a
//! remote server drain the battery.
//!
//! Functions carrying (:test) are excluded from ordinary builds, so none of
//! this ships.

// ---------------------------------------------------------------- trim

(:test)
function testTrimRemovesSurroundingSpaces(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Config.trim("  hello  "), "hello", "spaces not trimmed");
    Test.assertEqualMessage(Config.trim("\thello\t"), "hello", "tabs not trimmed");
    Test.assertEqualMessage(Config.trim("hello"), "hello", "clean input was altered");
    return true;
}

(:test)
function testTrimHandlesEdgeCases(logger as Test.Logger) as Boolean {
    Test.assertEqualMessage(Config.trim(""), "", "empty string");
    Test.assertEqualMessage(Config.trim("   "), "", "all whitespace");
    // Interior spaces are content, not padding.
    Test.assertEqualMessage(Config.trim(" a b "), "a b", "interior space lost");
    return true;
}

(:test)
function testTrimStripsPastedNewlines(logger as Test.Logger) as Boolean {
    // Tokens pasted from a phone keyboard very often carry a trailing newline,
    // which would otherwise end up inside the Authorization header.
    Test.assertEqualMessage(Config.trim("token\n"), "token", "trailing newline kept");
    Test.assertEqualMessage(Config.trim("\r\ntoken\r\n"), "token", "CRLF kept");
    return true;
}

// ---------------------------------------------------------- startsWith

(:test)
function testStartsWith(logger as Test.Logger) as Boolean {
    Test.assert(Config.startsWith("https://x", "https://"));
    Test.assert(!Config.startsWith("http://x", "https://"));
    Test.assert(!Config.startsWith("", "https://"));
    // A prefix longer than the string must not read past the end.
    Test.assert(!Config.startsWith("ht", "https://"));
    return true;
}

// ------------------------------------------------------------ loopback

(:test)
function testLoopbackAccepted(logger as Test.Logger) as Boolean {
    // The simulator permits plain HTTP, and development runs against a bridge
    // on localhost. Refusing it would mean standing up TLS before seeing the
    // app do anything.
    Test.assert(Config.isLoopback("http://127.0.0.1:8787"));
    Test.assert(Config.isLoopback("http://localhost:8787"));
    Test.assert(Config.isLoopback("http://127.0.0.1"));
    Test.assert(Config.isLoopback("http://localhost/api"));
    return true;
}

(:test)
function testLoopbackRejectsImpostors(logger as Test.Logger) as Boolean {
    // The important case: a prefix match on "127." would accept a hostname
    // that merely begins with it and resolves anywhere at all.
    Test.assertMessage(
        !Config.isLoopback("http://127.0.0.1.attacker.example"),
        "a hostname beginning with 127.0.0.1 was treated as loopback"
    );
    Test.assertMessage(
        !Config.isLoopback("http://localhost.attacker.example"),
        "a hostname beginning with localhost was treated as loopback"
    );
    Test.assertMessage(
        !Config.isLoopback("http://evil.com/?x=127.0.0.1"),
        "loopback in a query string was treated as the host"
    );
    Test.assert(!Config.isLoopback("http://192.168.1.5"));
    Test.assert(!Config.isLoopback("http://example.com"));
    return true;
}

(:test)
function testLoopbackRequiresHttpScheme(logger as Test.Logger) as Boolean {
    // https loopback is fine, but it takes the ordinary https path rather than
    // the exemption, so this predicate should not claim it.
    Test.assert(!Config.isLoopback("https://127.0.0.1:8787"));
    Test.assert(!Config.isLoopback("127.0.0.1:8787"));
    Test.assert(!Config.isLoopback("ftp://127.0.0.1"));
    return true;
}

// -------------------------------------------------------- poll interval

(:test)
function testAdaptiveFollowsTheServer(logger as Test.Logger) as Boolean {
    var s = new Config.Settings();
    s.pollMode = Config.POLL_ADAPTIVE;

    // Only the server knows whether Claude is mid-task, blocked, or idle.
    Test.assertEqual(Config.nextIntervalMs(s, 3), 3000);
    Test.assertEqual(Config.nextIntervalMs(s, 15), 15000);
    return true;
}

(:test)
function testFixedModesIgnoreTheServer(logger as Test.Logger) as Boolean {
    var s = new Config.Settings();

    s.pollMode = Config.POLL_FAST;
    Test.assertEqual(Config.nextIntervalMs(s, 99), Config.FAST_INTERVAL_S * 1000);

    s.pollMode = Config.POLL_SAVER;
    Test.assertEqual(Config.nextIntervalMs(s, 1), Config.SAVER_INTERVAL_S * 1000);

    s.pollMode = Config.POLL_CUSTOM;
    s.customIntervalS = 7;
    Test.assertEqual(Config.nextIntervalMs(s, 99), 7000);
    return true;
}

(:test)
function testServerCannotSetAnArbitraryRate(logger as Test.Logger) as Boolean {
    var s = new Config.Settings();
    s.pollMode = Config.POLL_ADAPTIVE;

    // A buggy or hostile server must not be able to poll this device flat, nor
    // stall it indefinitely.
    Test.assertEqualMessage(
        Config.nextIntervalMs(s, 0),
        Config.MIN_INTERVAL_S * 1000,
        "a zero interval was not clamped"
    );
    Test.assertEqualMessage(
        Config.nextIntervalMs(s, -5),
        Config.MIN_INTERVAL_S * 1000,
        "a negative interval was not clamped"
    );
    Test.assertEqualMessage(
        Config.nextIntervalMs(s, 99999),
        Config.MAX_INTERVAL_S * 1000,
        "an enormous interval was not clamped"
    );
    return true;
}

(:test)
function testCustomIntervalIsAlsoClamped(logger as Test.Logger) as Boolean {
    var s = new Config.Settings();
    s.pollMode = Config.POLL_CUSTOM;

    s.customIntervalS = 0;
    Test.assertEqual(Config.nextIntervalMs(s, 5), Config.MIN_INTERVAL_S * 1000);

    s.customIntervalS = 100000;
    Test.assertEqual(Config.nextIntervalMs(s, 5), Config.MAX_INTERVAL_S * 1000);
    return true;
}
