import Toybox.Activity;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Ride data and terminal output on one screen.
//!
//! The idea is to keep the numbers a cyclist actually needs visible while
//! Claude Code's output sits behind or beside them, rather than making the
//! rider choose between the two.
//!
//! WHAT THE HARDWARE ALLOWS
//! ------------------------
//! Verified on an Edge 540 rather than taken from `compiler.json`, which claims
//! `alphaBlendingSupport: true` and is misleading about what that means:
//!
//!   Dc.setFill            absent  → no true per-pixel alpha blending
//!   Graphics.createColor  present → accepts an alpha byte
//!   BufferedBitmap        present
//!   Dc.setClip            present
//!
//! So a genuine translucent terminal floating over a map is not available. What
//! is available is a colour with an alpha component, which the platform
//! composites when a shape is filled — enough for a dimmed panel, not enough
//! for arbitrary see-through text.
//!
//! There is also a reason to be wary of transparency here beyond capability.
//! This is a transflective display read in direct sunlight at speed, and
//! reducing contrast is precisely the wrong move: whatever shows through makes
//! both layers harder to read. A rider glancing down for half a second needs
//! separation, not blending.
//!
//! So the design offers three layouts and lets the rider pick, defaulting to
//! the one that stays readable at 30 km/h.
//!
//! WHERE THE TWO HALVES COME FROM
//! ------------------------------
//! They have different sources and different truth conditions, and conflating
//! them would be the worst possible bug in this app:
//!
//!   Terminal lines   the bridge, which read them from a real tmux pane.
//!                    Never synthesised, never placeholder text. If there is
//!                    no data the screen says so rather than showing something
//!                    plausible.
//!   Ride metrics     Activity.getActivityInfo(), i.e. the device's own
//!                    sensors. "--" when a sensor is absent or no activity is
//!                    recording.
//!
//! A rider approving a permission prompt is acting on what this screen shows.
//! Anything invented here is not a cosmetic defect — it is the app lying about
//! what an agent is asking to do.
class OverlayView extends WatchUi.View {

    enum Layout {
        //! Metrics in a strip, terminal below. Highest contrast, always safe.
        LAYOUT_SPLIT = 0,
        //! Terminal full-screen, metrics in a dimmed panel over it.
        LAYOUT_PANEL = 1,
        //! Terminal only. For when stopped, or reading something long.
        LAYOUT_TERMINAL = 2
    }

    //! Which metrics to show, in order. Set from the web app.
    private var _metrics as Array<Symbol> = [:speed, :distance, :elapsedTime];

    private var _layout as Number = LAYOUT_SPLIT;

    //! Lines captured from the tmux pane, as delivered by the bridge.
    //! Empty means "nothing received yet" — which is rendered as a status
    //! message, never as filler.
    private var _lines as Array<String> = [];

    //! True once a response has actually arrived. Distinguishes "connected and
    //! the pane is genuinely empty" from "we have not heard anything".
    private var _received as Boolean = false;

    // Layout, measured in onLayout.
    private var _font as Graphics.FontType = Graphics.FONT_XTINY;
    private var _metricFont as Graphics.FontType = Graphics.FONT_TINY;
    private var _lineHeight as Number = 12;
    private var _stripHeight as Number = 28;

    public function initialize() {
        View.initialize();
    }

    public function onLayout(dc as Graphics.Dc) as Void {
        _lineHeight = dc.getFontHeight(_font);
        if (_lineHeight < 1) {
            _lineHeight = 12;
        }

        // The metric strip is sized from its own font rather than a constant,
        // so it stays proportionate from a 246 px Edge 540 to a 480 px 1050.
        _stripHeight = dc.getFontHeight(_metricFont) + 8;
    }

    //! Named setScreenLayout rather than setLayout: WatchUi.View already
    //! defines setLayout(Array<Drawable>) and overriding it with a different
    //! signature is a compile error.
    public function setScreenLayout(layout as Number) as Void {
        _layout = layout;
        WatchUi.requestUpdate();
    }

    public function setMetrics(metrics as Array<Symbol>) as Void {
        _metrics = metrics;
        WatchUi.requestUpdate();
    }

    //! Supply the lines captured from the tmux pane.
    //!
    //! Only ever called from the bridge response handler. There is deliberately
    //! no other way to put text on this screen.
    public function setLines(lines as Array<String>) as Void {
        _lines = lines;
        _received = true;
        WatchUi.requestUpdate();
    }

    public function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        if (_layout == LAYOUT_TERMINAL) {
            drawTerminal(dc, 0, dc.getHeight());
            return;
        }

        if (_layout == LAYOUT_PANEL) {
            // Terminal underneath, metrics floating over it.
            drawTerminal(dc, 0, dc.getHeight());
            drawMetricPanel(dc);
            return;
        }

        // Split: metrics on top, terminal below. Nothing overlaps, so nothing
        // loses contrast.
        drawMetricStrip(dc, 0);
        drawTerminal(dc, _stripHeight, dc.getHeight() - _stripHeight);
    }

    //! Draw only the metrics strip, for use over another view's content.
    //!
    //! Public so TerminalView can add ride data to the screen it already draws,
    //! rather than duplicating the terminal renderer here.
    public function drawMetricsStrip(dc as Graphics.Dc) as Void {
        drawMetricPanel(dc);
    }

    //! Metrics in an opaque strip. The safest layout, and the default.
    private function drawMetricStrip(dc as Graphics.Dc, top as Number) as Void {
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(0, top, dc.getWidth(), _stripHeight);
        drawMetricRow(dc, top + 4);
    }

    //! Metrics over the terminal, dimmed rather than blended.
    //!
    //! `createColor` accepts an alpha byte and the platform composites the
    //! fill, so the text behind shows through faintly. That is as close to
    //! translucency as this hardware gets, and it is deliberately subtle: at
    //! more than a light dim, both layers become unreadable in sunlight.
    private function drawMetricPanel(dc as Graphics.Dc) as Void {
        var top = dc.getHeight() - _stripHeight;

        if (Graphics has :createColor) {
            // 0xC0 alpha: mostly opaque. Enough to read the numbers against
            // whatever is behind, while the terminal stays faintly visible.
            var dimmed = Graphics.createColor(0xC0, 0x00, 0x00, 0x00);
            dc.setColor(dimmed, Graphics.COLOR_TRANSPARENT);
        } else {
            dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        }

        dc.fillRectangle(0, top, dc.getWidth(), _stripHeight);

        // A hairline above the panel. Without it the boundary disappears when
        // the terminal happens to be dark there.
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(0, top, dc.getWidth(), top);

        drawMetricRow(dc, top + 4);
    }

    //! Draw the chosen metrics evenly across the width.
    private function drawMetricRow(dc as Graphics.Dc, y as Number) as Void {
        var info = Activity.getActivityInfo();
        var count = _metrics.size();
        if (count == 0) {
            return;
        }

        var cell = dc.getWidth() / count;
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);

        for (var i = 0; i < count; i++) {
            dc.drawText(
                (cell * i) + (cell / 2),
                y,
                _metricFont,
                formatMetric(info, _metrics[i]),
                Graphics.TEXT_JUSTIFY_CENTER
            );
        }
    }

    //! Format one metric for a glance.
    //!
    //! Deliberately terse: no labels, no units where the number is
    //! unambiguous. A rider reading this has under a second, and "24" in the
    //! speed position is understood instantly while "24.3 km/h" is not.
    private function formatMetric(info as Activity.Info?, metric as Symbol) as String {
        if (info == null) {
            return "--";
        }

        if (metric == :speed) {
            var v = info.currentSpeed;
            // Metres per second to km/h. Unit preference comes from device
            // settings in a later revision.
            return (v == null) ? "--" : ((v * 3.6) + 0.5).toNumber().toString();
        }

        if (metric == :distance) {
            var d = info.elapsedDistance;
            if (d == null) {
                return "--";
            }
            var km = d / 1000.0;
            return km.format("%.1f");
        }

        if (metric == :elapsedTime) {
            var t = info.timerTime;
            if (t == null) {
                return "--";
            }
            var total = t / 1000;
            var mins = total / 60;
            var secs = total % 60;
            return mins.format("%d") + ":" + secs.format("%02d");
        }

        if (metric == :heartRate) {
            var hr = info.currentHeartRate;
            return (hr == null) ? "--" : hr.toString();
        }

        if (metric == :power) {
            var p = info.currentPower;
            return (p == null) ? "--" : p.toString();
        }

        if (metric == :cadence) {
            var c = info.currentCadence;
            return (c == null) ? "--" : c.toString();
        }

        if (metric == :altitude) {
            var a = info.altitude;
            return (a == null) ? "--" : a.toNumber().toString();
        }

        return "--";
    }

    private function drawTerminal(dc as Graphics.Dc, top as Number, height as Number) as Void {
        var rows = height / _lineHeight;
        if (rows < 1) {
            return;
        }

        // Nothing has arrived from the bridge yet. Say so, rather than leaving
        // a blank area that could be mistaken for an idle session.
        if (!_received) {
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(
                dc.getWidth() / 2,
                top + (height / 2) - (_lineHeight / 2),
                _font,
                WatchUi.loadResource(Rez.Strings.Connecting) as String,
                Graphics.TEXT_JUSTIFY_CENTER
            );
            return;
        }

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);

        var start = _lines.size() > rows ? _lines.size() - rows : 0;
        var y = top;

        for (var i = start; i < _lines.size(); i++) {
            dc.drawText(2, y, _font, _lines[i], Graphics.TEXT_JUSTIFY_LEFT);
            y += _lineHeight;
        }
    }
}
