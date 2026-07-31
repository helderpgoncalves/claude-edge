import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! HTTP client for the bridge server.
//!
//! ONE REQUEST AT A TIME
//! ---------------------
//! Connect IQ caps concurrent requests platform-wide and returns
//! BLE_QUEUE_FULL (-101) when that cap is exceeded. A polling app that fires on
//! a timer regardless of whether the previous response arrived will hit this
//! within seconds on a slow link, so the client tracks an in-flight flag and
//! drops ticks rather than queueing them. A skipped poll is invisible; a queue
//! full error is a broken screen.
//!
//! ERROR CODES ARE THE INTERFACE
//! -----------------------------
//! Every failure surfaces as a negative response code, and several of them are
//! ordinary conditions rather than faults — a phone out of Bluetooth range mid
//! ride is expected, not exceptional. They are translated to sentences here so
//! the view never has to render a number the rider cannot act on.
class BridgeClient {

    // Connect IQ error codes worth naming. Values are from the Communications
    // module; naming them locally keeps the switch readable.
    private const ERR_BLE_HOST_TIMEOUT = -2;
    private const ERR_BLE_QUEUE_FULL = -101;
    private const ERR_BLE_REQUEST_TOO_LARGE = -102;
    private const ERR_BLE_UNAVAILABLE = -104;
    private const ERR_TIMED_OUT = -300;
    private const ERR_RESPONSE_TOO_LARGE = -402;
    private const ERR_OUT_OF_MEMORY = -403;
    private const ERR_SECURE_REQUIRED = -1001;
    private const ERR_UNSUPPORTED_TYPE = -1002;

    private var _settings as Config.Settings;
    private var _inFlight as Boolean = false;

    //! Invoked with (success, data, message).
    //! `data` is the parsed JSON body on success, null otherwise.
    private var _onSession as Method(success as Boolean, data as Dictionary?, message as String?) as Void;

    public function initialize(
        settings as Config.Settings,
        onSession as Method(success as Boolean, data as Dictionary?, message as String?) as Void
    ) {
        _settings = settings;
        _onSession = onSession;
    }

    public function setSettings(settings as Config.Settings) as Void {
        _settings = settings;
    }

    public function isBusy() as Boolean {
        return _inFlight;
    }

    //! Fetch the current session state.
    //!
    //! @param lines  Rows the device can draw, so the server truncates to fit.
    //! @param width  Columns the device can draw, so the server wraps for us.
    //! @param offset Scrollback offset; 0 is the live tail.
    //! @param etag   Last known content hash, for a 304 short-circuit.
    //! @return false when a request was already in flight and this was dropped.
    public function fetchSession(
        lines as Number,
        width as Number,
        offset as Number,
        etag as String?
    ) as Boolean {
        if (_inFlight) {
            return false;
        }
        if (!_settings.isUsable()) {
            _onSession.invoke(false, null, _settings.error);
            return false;
        }

        var params = {
            "lines" => lines,
            "width" => width,
            "offset" => offset
        };
        if (etag != null) {
            params["etag"] = etag;
        }
        if (_settings.sessionName.length() > 0) {
            params["session"] = _settings.sessionName;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => {
                "Authorization" => "Bearer " + _settings.authToken
            },
            // Declared explicitly rather than relying on the server's
            // Content-Type: an unexpected type would otherwise fail with
            // UNSUPPORTED_CONTENT_TYPE_IN_RESPONSE and no useful detail.
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _inFlight = true;
        Communications.makeWebRequest(
            _settings.serverUrl + "/api/v1/session",
            params,
            options,
            method(:onSessionResponse)
        );
        return true;
    }

    //! Send an allowlisted action.
    //!
    //! @param actionId One of the ids the server advertised in /meta.
    //! @param nonce    Unique per user intent, so a retry is not a second press.
    //! @param expect   Hash of the screen the rider was looking at. The server
    //!                 refuses the action if the pane has moved on, which is
    //!                 what stops an approval landing on the wrong prompt.
    public function sendAction(
        actionId as String,
        nonce as String,
        expect as String?,
        callback as Method(success as Boolean, message as String?) as Void
    ) as Boolean {
        if (_inFlight) {
            return false;
        }
        if (!_settings.isUsable()) {
            callback.invoke(false, _settings.error);
            return false;
        }

        var body = {
            "action" => actionId,
            "nonce" => nonce
        };
        if (expect != null) {
            body["expect"] = expect;
        }
        if (_settings.sessionName.length() > 0) {
            body["session"] = _settings.sessionName;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Authorization" => "Bearer " + _settings.authToken,
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _actionCallback = callback;
        _inFlight = true;
        Communications.makeWebRequest(
            _settings.serverUrl + "/api/v1/action",
            body,
            options,
            method(:onActionResponse)
        );
        return true;
    }

    //! Send free text typed on the device keyboard.
    //!
    //! Goes to /text rather than /action because the two are different
    //! capabilities: /action can only trigger entries from a fixed allowlist,
    //! while this carries arbitrary content and is disabled by default on the
    //! server. A deployment can therefore allow approvals from the handlebars
    //! while refusing free text, which is the sensible default pairing.
    public function sendText(
        text as String,
        nonce as String,
        callback as Method(success as Boolean, message as String?) as Void
    ) as Boolean {
        if (_inFlight) {
            return false;
        }
        if (!_settings.isUsable()) {
            callback.invoke(false, _settings.error);
            return false;
        }

        var body = {
            "text" => text,
            "nonce" => nonce,
            "submit" => true
        };
        if (_settings.sessionName.length() > 0) {
            body["session"] = _settings.sessionName;
        }

        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Authorization" => "Bearer " + _settings.authToken,
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        _actionCallback = callback;
        _inFlight = true;
        Communications.makeWebRequest(
            _settings.serverUrl + "/api/v1/text",
            body,
            options,
            method(:onActionResponse)
        );
        return true;
    }

    private var _actionCallback as Method(success as Boolean, message as String?) as Void or Null;

    public function onSessionResponse(code as Number, data as Dictionary or String or Null) as Void {
        _inFlight = false;

        if (code == 200 && data instanceof Dictionary) {
            _onSession.invoke(true, data as Dictionary, null);
            return;
        }

        // 304 means the pane is unchanged. This is a success — the device keeps
        // what it has — and is the common case on an idle session, so it must
        // not be rendered as an error.
        if (code == 304) {
            _onSession.invoke(true, null, null);
            return;
        }

        _onSession.invoke(false, null, describeError(code));
    }

    public function onActionResponse(code as Number, data as Dictionary or String or Null) as Void {
        _inFlight = false;

        var callback = _actionCallback;
        _actionCallback = null;
        if (callback == null) {
            return;
        }

        if (code == 200) {
            callback.invoke(true, null);
            return;
        }

        // The server refuses free text unless the operator enabled it. Saying
        // which setting is at fault is far more use than "403".
        if (code == 403 && data instanceof Dictionary) {
            var errCode = (data as Dictionary).get("code");
            if (errCode instanceof String && (errCode as String).equals("FREE_TEXT_DISABLED")) {
                callback.invoke(false, WatchUi.loadResource(Rez.Strings.ErrTextDisabled) as String);
                return;
            }
        }

        // 409 carries a specific, actionable meaning: the screen moved, or the
        // pane is in scroll mode. Prefer the server's own wording, which was
        // written for this screen width.
        if (code == 409 && data instanceof Dictionary) {
            var message = (data as Dictionary).get("m");
            if (message instanceof String) {
                callback.invoke(false, message as String);
                return;
            }
        }

        callback.invoke(false, describeError(code));
    }

    //! Turn a response code into something a rider can act on.
    public function describeError(code as Number) as String {
        if (code == 401 || code == 403) {
            return WatchUi.loadResource(Rez.Strings.ErrAuth) as String;
        }
        if (code == 429) {
            return WatchUi.loadResource(Rez.Strings.ErrServer) as String;
        }

        switch (code) {
            case ERR_BLE_UNAVAILABLE:
            case ERR_BLE_HOST_TIMEOUT:
                // Expected mid-ride whenever the phone is out of range or its
                // Garmin Connect app has been backgrounded away.
                return WatchUi.loadResource(Rez.Strings.ErrNoPhone) as String;

            case ERR_TIMED_OUT:
                return WatchUi.loadResource(Rez.Strings.ErrTimeout) as String;

            case ERR_SECURE_REQUIRED:
                return WatchUi.loadResource(Rez.Strings.ErrHttps) as String;

            case ERR_RESPONSE_TOO_LARGE:
            case ERR_OUT_OF_MEMORY:
            case ERR_BLE_REQUEST_TOO_LARGE:
                // Recoverable by the rider: a larger font means fewer rows,
                // which means a smaller payload.
                return WatchUi.loadResource(Rez.Strings.ErrTooBig) as String;

            case ERR_BLE_QUEUE_FULL:
                // Transient. The next tick will succeed once the queue drains.
                return WatchUi.loadResource(Rez.Strings.ErrTimeout) as String;

            case ERR_UNSUPPORTED_TYPE:
                return WatchUi.loadResource(Rez.Strings.ErrServer) as String;
        }

        if (code >= 500) {
            return WatchUi.loadResource(Rez.Strings.ErrServer) as String;
        }
        return (WatchUi.loadResource(Rez.Strings.ErrServer) as String) + " " + code.toString();
    }
}
