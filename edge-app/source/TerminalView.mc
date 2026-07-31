import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.Timer;
import Toybox.WatchUi;
import Toybox.Attention;

//! The main screen: a terminal mirror with a status header.
//!
//! LAYOUT IS COMPUTED, NEVER HARDCODED
//! -----------------------------------
//! The supported devices span 246x322 to 480x800 — more than three times the
//! pixel count. Every position here is derived from dc.getWidth()/getHeight()
//! and the measured font metrics, so one binary lays out correctly on all of
//! them. The number of rows and columns the screen can hold is then sent to the
//! server, which wraps the text to match. That is what makes this a mirror of
//! the terminal rather than a reflowed approximation of it.
//!
//! REDRAW ONLY ON CHANGE
//! ---------------------
//! requestUpdate() is called from the response handler when content actually
//! changed, never from the timer tick. Repainting a screen of text every two
//! seconds regardless of whether anything moved is a meaningful battery cost on
//! a device someone rides with for six hours.
class TerminalView extends WatchUi.View {

    // Session states, mirroring the server's vocabulary. An unrecognised value
    // maps to STATE_UNKNOWN rather than failing, so the server can add states
    // without breaking installed devices.
    enum State {
        STATE_WORKING = 0,
        STATE_IDLE = 1,
        STATE_AWAITING_PERMISSION = 2,
        STATE_AWAITING_INPUT = 3,
        STATE_NO_SESSION = 4,
        STATE_UNKNOWN = 5
    }

    private const HEADER_PAD = 3;
    private const SIDE_PAD = 2;

    private var _settings as Config.Settings;
    private var _client as BridgeClient?;
    private var _timer as Timer.Timer?;

    // --- Rendered state.
    private var _lines as Array<String> = [];
    private var _state as Number = STATE_UNKNOWN;
    private var _hash as String? = null;
    private var _prompt as Dictionary? = null;
    private var _message as String? = null;
    private var _sessionName as String? = null;

    // --- Layout, measured once per onLayout.
    private var _font as Graphics.FontType = Graphics.FONT_XTINY;
    private var _lineHeight as Number = 12;
    private var _charWidth as Number = 5;
    private var _rows as Number = 10;
    private var _cols as Number = 40;
    private var _headerHeight as Number = 16;

    // --- Scrollback and polling.
    private var _offset as Number = 0;
    private var _totalLines as Number = 0;
    private var _nextIntervalMs as Number = 5000;
    private var _lastUpdate as Number = 0;
    private var _everConnected as Boolean = false;
    private var _alerted as Boolean = false;

    public function initialize() {
        View.initialize();
        _settings = Config.load();
        _client = new BridgeClient(_settings, method(:onSessionData));
    }

    //! Measure the screen and decide the terminal grid.
    public function onLayout(dc as Graphics.Dc) as Void {
        _font = fontForSize(_settings.fontSize);

        _lineHeight = dc.getFontHeight(_font);
        if (_lineHeight < 1) {
            _lineHeight = 12;
        }

        // The bundled fonts are proportional, so there is no exact column
        // width. "M" is the conventional widest-common-glyph proxy; using it
        // means estimated columns are conservative and text will not overflow.
        _charWidth = dc.getTextWidthInPixels("M", _font);
        if (_charWidth < 1) {
            _charWidth = 5;
        }

        _headerHeight = _lineHeight + (HEADER_PAD * 2);

        var usableHeight = dc.getHeight() - _headerHeight;
        _rows = usableHeight / _lineHeight;
        if (_rows < 1) {
            _rows = 1;
        }

        _cols = (dc.getWidth() - (SIDE_PAD * 2)) / _charWidth;
        if (_cols < 20) {
            _cols = 20;
        } else if (_cols > 200) {
            _cols = 200;
        }
    }

    public function onShow() as Void {
        startPolling();
        poll();
    }

    public function onHide() as Void {
        stopPolling();
    }

    //! Re-read settings after Garmin Connect Mobile pushes a change.
    public function onSettingsChanged() as Void {
        _settings = Config.load();
        var client = _client;
        if (client != null) {
            client.setSettings(_settings);
        }
        // A font-size change alters the grid, so the cached view is stale and
        // the next fetch must not be short-circuited by a matching hash.
        _hash = null;
        _message = null;
        WatchUi.requestUpdate();
        poll();
    }

    private function fontForSize(size as Number) as Graphics.FontType {
        if (size == 1) {
            return Graphics.FONT_TINY;
        }
        if (size >= 2) {
            return Graphics.FONT_SMALL;
        }
        return Graphics.FONT_XTINY;
    }

    // ---------------------------------------------------------------- polling

    private function startPolling() as Void {
        stopPolling();
        var timer = new Timer.Timer();
        // Non-repeating: each tick reschedules itself with an interval chosen
        // from the current state. A repeating timer could not adapt without
        // being torn down and rebuilt anyway.
        timer.start(method(:onTick), _nextIntervalMs, false);
        _timer = timer;
    }

    private function stopPolling() as Void {
        var timer = _timer;
        if (timer != null) {
            timer.stop();
            _timer = null;
        }
    }

    public function onTick() as Void {
        poll();
        startPolling();
    }

    public function poll() as Void {
        var client = _client;
        if (client == null) {
            return;
        }
        // Sending the hash lets the server answer 304 when nothing moved, which
        // is most polls on an idle session.
        client.fetchSession(_rows, _cols, _offset, _hash);
    }

    //! Force a fetch that cannot be answered from cache.
    public function forceRefresh() as Void {
        _hash = null;
        poll();
    }

    // ------------------------------------------------------------- responses

    public function onSessionData(
        success as Boolean,
        data as Dictionary?,
        message as String?
    ) as Void {
        if (!success) {
            _message = message;
            WatchUi.requestUpdate();
            return;
        }

        _message = null;
        _everConnected = true;

        // A 304 arrives as success with no body: nothing changed, so there is
        // nothing to redraw and no reason to spend the battery doing it.
        if (data == null) {
            return;
        }

        var lines = data.get("L");
        if (lines instanceof Array) {
            _lines = lines as Array<String>;
        }

        var hash = data.get("h");
        if (hash instanceof String) {
            _hash = hash as String;
        }

        var state = data.get("s");
        if (state instanceof String) {
            _state = parseState(state as String);
        }

        var total = data.get("tl");
        if (total instanceof Number) {
            _totalLines = total as Number;
        }

        var name = data.get("name");
        if (name instanceof String) {
            _sessionName = name as String;
        }

        var prompt = data.get("p");
        _prompt = (prompt instanceof Dictionary) ? prompt as Dictionary : null;

        var suggestion = data.get("n");
        var suggestionS = (suggestion instanceof Number) ? suggestion as Number : 5;
        _nextIntervalMs = Config.nextIntervalMs(_settings, suggestionS);

        _lastUpdate = System.getTimer();

        maybeAlert();
        WatchUi.requestUpdate();
    }

    //! Vibrate once when the session starts needing a human.
    //!
    //! Guarded by _alerted so a session that sits blocked for minutes buzzes
    //! once rather than on every poll — the difference between a useful nudge
    //! and something the rider disables immediately.
    private function maybeAlert() as Void {
        var blocking = (_state == STATE_AWAITING_PERMISSION) || (_state == STATE_AWAITING_INPUT);

        if (!blocking) {
            _alerted = false;
            return;
        }
        if (_alerted || !_settings.vibrateOnPrompt) {
            return;
        }
        _alerted = true;

        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(75, 300)]);
        }
    }

    private function parseState(value as String) as Number {
        if (value.equals("working")) { return STATE_WORKING; }
        if (value.equals("idle")) { return STATE_IDLE; }
        if (value.equals("awaiting_permission")) { return STATE_AWAITING_PERMISSION; }
        if (value.equals("awaiting_input")) { return STATE_AWAITING_INPUT; }
        if (value.equals("no_session")) { return STATE_NO_SESSION; }
        return STATE_UNKNOWN;
    }

    // ------------------------------------------------------------- scrolling

    public function scrollUp() as Void {
        _offset += _rows / 2;
        var maxOffset = _totalLines > _rows ? _totalLines - _rows : 0;
        if (_offset > maxOffset) {
            _offset = maxOffset;
        }
        forceRefresh();
    }

    public function scrollDown() as Void {
        _offset -= _rows / 2;
        if (_offset < 0) {
            _offset = 0;
        }
        forceRefresh();
    }

    public function isLive() as Boolean {
        return _offset == 0;
    }

    public function jumpToLive() as Void {
        if (_offset != 0) {
            _offset = 0;
            forceRefresh();
        }
    }

    // --------------------------------------------------------------- drawing

    public function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        drawHeader(dc);

        if (_message != null && !_everConnected) {
            drawCentredMessage(dc, _message as String);
            return;
        }

        drawTerminal(dc);

        if (_message != null) {
            drawToast(dc, _message as String);
        }
    }

    private function drawHeader(dc as Graphics.Dc) as Void {
        var width = dc.getWidth();

        dc.setColor(stateColour(), Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(0, 0, width, _headerHeight);

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(
            SIDE_PAD + 1,
            HEADER_PAD,
            _font,
            stateLabel(),
            Graphics.TEXT_JUSTIFY_LEFT
        );

        // Right side carries either the scroll position or the data age. Both
        // answer the same question — "is what I am looking at current?" — and
        // only one can be true at a time, so they share the space.
        var right = "";
        if (!isLive()) {
            right = "^" + _offset.toString();
        } else if (_lastUpdate > 0) {
            var ageS = (System.getTimer() - _lastUpdate) / 1000;
            if (ageS > 3) {
                right = ageS.toString() + "s";
            }
        }

        // With nothing more urgent to report, name the session being mirrored.
        // It only matters when more than one is configured, which is exactly
        // when showing it prevents acting on the wrong machine.
        var name = _sessionName;
        if (right.length() == 0 && name != null) {
            right = name;
        }

        if (right.length() > 0) {
            dc.drawText(
                width - SIDE_PAD - 1,
                HEADER_PAD,
                _font,
                right,
                Graphics.TEXT_JUSTIFY_RIGHT
            );
        }
    }

    private function drawTerminal(dc as Graphics.Dc) as Void {
        var promptRows = 0;
        var prompt = _prompt;
        if (prompt != null) {
            promptRows = promptHeightRows(prompt);
        }

        var textRows = _rows - promptRows;
        if (textRows < 1) {
            textRows = 1;
        }

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);

        var y = _headerHeight;
        var start = _lines.size() > textRows ? _lines.size() - textRows : 0;

        for (var i = start; i < _lines.size(); i++) {
            dc.drawText(SIDE_PAD, y, _font, _lines[i], Graphics.TEXT_JUSTIFY_LEFT);
            y += _lineHeight;
        }

        if (prompt != null) {
            drawPrompt(dc, prompt, dc.getHeight() - (promptRows * _lineHeight));
        }
    }

    private function promptHeightRows(prompt as Dictionary) as Number {
        var options = prompt.get("o");
        var count = (options instanceof Array) ? (options as Array).size() : 0;
        // One row for the question, one per option, capped so the prompt can
        // never crowd out the terminal text entirely on a short screen.
        var rows = 1 + count;
        var cap = _rows / 2;
        if (cap < 2) {
            cap = 2;
        }
        return rows > cap ? cap : rows;
    }

    private function drawPrompt(dc as Graphics.Dc, prompt as Dictionary, top as Number) as Void {
        var width = dc.getWidth();
        var height = dc.getHeight() - top;

        dc.setColor(Graphics.COLOR_DK_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(0, top, width, height);

        var y = top;

        var question = prompt.get("q");
        if (question instanceof String) {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(
                SIDE_PAD,
                y,
                _font,
                truncate(question as String, _cols),
                Graphics.TEXT_JUSTIFY_LEFT
            );
            y += _lineHeight;
        }

        var options = prompt.get("o");
        if (!(options instanceof Array)) {
            return;
        }

        var list = options as Array;
        for (var i = 0; i < list.size() && y < dc.getHeight(); i++) {
            var option = list[i];
            if (!(option instanceof Dictionary)) {
                continue;
            }
            var label = (option as Dictionary).get("l");
            if (!(label instanceof String)) {
                continue;
            }

            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            dc.drawText(
                SIDE_PAD,
                y,
                _font,
                (i + 1).toString() + " " + truncate(label as String, _cols - 2),
                Graphics.TEXT_JUSTIFY_LEFT
            );
            y += _lineHeight;
        }
    }

    //! A transient message drawn over the bottom of the screen.
    private function drawToast(dc as Graphics.Dc, text as String) as Void {
        var y = dc.getHeight() - _lineHeight - 2;
        dc.setColor(Graphics.COLOR_DK_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(0, y, dc.getWidth(), _lineHeight + 2);
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(SIDE_PAD, y + 1, _font, truncate(text, _cols), Graphics.TEXT_JUSTIFY_LEFT);
    }

    private function drawCentredMessage(dc as Graphics.Dc, text as String) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);

        // Wrap by hand: this path shows setup errors, which are full sentences
        // rather than the pre-wrapped lines the server sends.
        var words = splitWords(text);
        var y = dc.getHeight() / 3;
        var line = "";

        for (var i = 0; i < words.size(); i++) {
            var candidate = line.length() == 0 ? words[i] : line + " " + words[i];
            if (candidate.length() > _cols && line.length() > 0) {
                dc.drawText(dc.getWidth() / 2, y, _font, line, Graphics.TEXT_JUSTIFY_CENTER);
                y += _lineHeight;
                line = words[i];
            } else {
                line = candidate;
            }
        }
        if (line.length() > 0) {
            dc.drawText(dc.getWidth() / 2, y, _font, line, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    private function splitWords(text as String) as Array<String> {
        var words = [] as Array<String>;
        var current = "";
        var chars = text.toCharArray();

        for (var i = 0; i < chars.size(); i++) {
            if (chars[i] == ' ') {
                if (current.length() > 0) {
                    words.add(current);
                    current = "";
                }
            } else {
                current += chars[i].toString();
            }
        }
        if (current.length() > 0) {
            words.add(current);
        }
        return words;
    }

    private function truncate(text as String, max as Number) as String {
        if (max < 1) {
            return "";
        }
        if (text.length() <= max) {
            return text;
        }
        return text.substring(0, max - 1) + "…";
    }

    private function stateColour() as Graphics.ColorType {
        switch (_state) {
            case STATE_WORKING:
                return Graphics.COLOR_BLUE;
            case STATE_AWAITING_PERMISSION:
            case STATE_AWAITING_INPUT:
                // Amber: the one state that demands the rider do something.
                return Graphics.COLOR_ORANGE;
            case STATE_IDLE:
                return Graphics.COLOR_GREEN;
            case STATE_NO_SESSION:
                return Graphics.COLOR_DK_GRAY;
            default:
                return Graphics.COLOR_LT_GRAY;
        }
    }

    private function stateLabel() as String {
        var resource;
        switch (_state) {
            case STATE_WORKING:
                resource = Rez.Strings.StateWorking;
                break;
            case STATE_AWAITING_PERMISSION:
            case STATE_AWAITING_INPUT:
                resource = Rez.Strings.StateWaiting;
                break;
            case STATE_IDLE:
                resource = Rez.Strings.StateIdle;
                break;
            case STATE_NO_SESSION:
                resource = Rez.Strings.StateNoSession;
                break;
            default:
                resource = Rez.Strings.StateUnknown;
                break;
        }
        return WatchUi.loadResource(resource) as String;
    }

    // ----------------------------------------------------------- accessors

    public function getClient() as BridgeClient? {
        return _client;
    }

    public function getHash() as String? {
        return _hash;
    }

    public function getPrompt() as Dictionary? {
        return _prompt;
    }

    public function getSettings() as Config.Settings {
        return _settings;
    }

    public function setMessage(text as String?) as Void {
        _message = text;
        WatchUi.requestUpdate();
    }
}
