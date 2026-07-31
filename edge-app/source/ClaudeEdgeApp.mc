import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Application entry point.
//!
//! Responsibilities are deliberately thin: own the view, and react to settings
//! changes pushed from Garmin Connect Mobile. Everything else lives in the
//! view, the client, or the model, so that this class stays readable.
class ClaudeEdgeApp extends Application.AppBase {

    private var _view as TerminalView?;

    public function initialize() {
        AppBase.initialize();
    }

    public function onStart(state as Dictionary?) as Void {
    }

    public function onStop(state as Dictionary?) as Void {
    }

    //! Build the initial view and its delegate.
    //!
    //! The delegate is given the view rather than the reverse: input arrives at
    //! the delegate and must reach the view, but the view never needs to call
    //! back into input handling.
    public function getInitialView() as [Views] or [Views, InputDelegates] {
        var view = new TerminalView();
        _view = view;
        return [view, new TerminalDelegate(view)];
    }

    //! Called when settings are edited in Garmin Connect Mobile while the app
    //! is running. Re-reading immediately means a corrected URL or token takes
    //! effect without the rider having to restart the app mid-ride.
    public function onSettingsChanged() as Void {
        var view = _view;
        if (view != null) {
            view.onSettingsChanged();
        }
        WatchUi.requestUpdate();
    }
}

//! Global accessor used by the view and delegate.
//! Monkey C has no dependency injection; this is the idiomatic pattern.
function getApp() as ClaudeEdgeApp {
    return Application.getApp() as ClaudeEdgeApp;
}
