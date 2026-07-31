import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Input handling for the terminal view.
//!
//! WHY BehaviorDelegate RATHER THAN InputDelegate
//! ----------------------------------------------
//! The supported devices disagree fundamentally about input. An Edge 540 has
//! seven physical buttons and no touchscreen. An Edge 1040 has two buttons —
//! start and lap — and expects swipes for everything else.
//!
//! BehaviorDelegate abstracts exactly that difference: onNextPage/onPreviousPage
//! arrive from the up/down buttons on a 540 and from swipes on a 1040, and
//! onSelect arrives from the enter button or a tap. Writing against behaviours
//! means one binary genuinely works on both, rather than working on the 540 and
//! being unusable on the 1040.
//!
//! onKey is still overridden underneath, for the two buttons that have no
//! behaviour mapping (lap and start). Every such use is guarded with a `has`
//! check, because those buttons do not exist on every target.
class TerminalDelegate extends WatchUi.BehaviorDelegate {

    private var _view as TerminalView;

    //! Set when a risky action is awaiting a second confirming press.
    private var _pendingAction as String? = null;

    //! Monotonic counter making each user intent distinct on the wire, so a
    //! retry is recognised as the same press rather than a second one.
    private var _nonceCounter as Number = 0;

    public function initialize(view as TerminalView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    // ------------------------------------------------------------ behaviours

    //! Enter (right side of the device), or a tap. Confirms.
    //!
    //! The button layout this is written against, on an Edge 540:
    //!
    //!     up / down     left side    move the highlight, or scroll
    //!     enter         right side   confirm
    //!     esc           right side   back
    //!     lap / start   bottom       jump to live / refresh
    //!
    //! That mapping is the device's own — up and down carry the
    //! previousPage/nextPage behaviours, enter carries onSelect — so it matches
    //! every other app on the unit and needs no explaining to the rider.
    public function onSelect() as Boolean {
        if (_pendingAction != null) {
            var action = _pendingAction as String;
            _pendingAction = null;
            send(action);
            return true;
        }

        // With a prompt on screen, enter commits the highlighted option. The
        // rider has already moved to it with up/down, so opening a menu here
        // would add a second, redundant selection step.
        var prompt = _view.getPrompt();
        if (prompt != null) {
            answerPrompt(_view.getHighlightedOption());
            return true;
        }

        _view.forceRefresh();
        return true;
    }

    //! Back / Esc. Cancels a pending confirmation, leaves scrollback, or exits.
    public function onBack() as Boolean {
        if (_pendingAction != null) {
            _pendingAction = null;
            _view.setMessage(null);
            return true;
        }

        // Returning false here would exit the app. Jumping back to the live
        // tail first means Back reads as "undo what I was doing", and only
        // leaves once there is nothing left to undo.
        if (!_view.isLive()) {
            _view.jumpToLive();
            return true;
        }
        return false;
    }

    public function onMenu() as Boolean {
        showMainMenu();
        return true;
    }

    //! Down button (left side of the device), or a swipe up.
    //!
    //! Moves the highlight when a prompt is waiting, scrolls otherwise. The
    //! same physical button doing both is deliberate: when Claude is asking
    //! something, choosing an answer is the only thing the rider wants to do,
    //! and making them switch modes to reach it would be the wrong trade on a
    //! device operated one-handed at speed.
    public function onNextPage() as Boolean {
        if (_view.getPrompt() != null) {
            _view.moveHighlight(1);
            return true;
        }
        _view.scrollDown();
        return true;
    }

    //! Up button (left side of the device), or a swipe down.
    public function onPreviousPage() as Boolean {
        if (_view.getPrompt() != null) {
            _view.moveHighlight(-1);
            return true;
        }
        _view.scrollUp();
        return true;
    }

    // ------------------------------------------------------------------ keys

    //! Raw keys, for the buttons with no behaviour mapping.
    public function onKey(event as WatchUi.KeyEvent) as Boolean {
        var key = event.getKey();

        // Lap: jump straight back to the live tail. A dedicated button for this
        // matters when riding — it is the "show me now" escape hatch, and it
        // should not require navigating a menu.
        if ((WatchUi has :KEY_LAP) && key == WatchUi.KEY_LAP) {
            _view.jumpToLive();
            _view.forceRefresh();
            return true;
        }

        // Start: refresh immediately.
        if ((WatchUi has :KEY_START) && key == WatchUi.KEY_START) {
            _view.forceRefresh();
            return true;
        }

        return false;
    }

    // ----------------------------------------------------------------- menus

    private function showMainMenu() as Void {
        var menu = new WatchUi.Menu2({
            :title => WatchUi.loadResource(Rez.Strings.MenuTitle) as String
        });

        // Typing comes first: it is the reason to open this menu deliberately,
        // whereas refresh is also on the start button.
        if (WatchUi has :TextPicker) {
            menu.addItem(new WatchUi.MenuItem(
                WatchUi.loadResource(Rez.Strings.MenuType) as String,
                WatchUi.loadResource(Rez.Strings.MenuTypeSub) as String,
                "type",
                null
            ));
        }

        menu.addItem(new WatchUi.MenuItem(
            WatchUi.loadResource(Rez.Strings.MenuRefresh) as String,
            null,
            "refresh",
            null
        ));

        // Navigation keys, useful when Claude Code shows a list this app did
        // not manage to parse into options.
        menu.addItem(new WatchUi.MenuItem("Up", null, "up", null));
        menu.addItem(new WatchUi.MenuItem("Down", null, "down", null));
        menu.addItem(new WatchUi.MenuItem("Enter", null, "enter", null));
        menu.addItem(new WatchUi.MenuItem("Esc", null, "escape", null));
        menu.addItem(new WatchUi.MenuItem("Stop task", null, "interrupt", null));
        menu.addItem(new WatchUi.MenuItem("Continue", null, "continue", null));

        WatchUi.pushView(menu, new MenuDelegate(self), WatchUi.SLIDE_UP);
    }

    //! A menu of the options parsed from the current prompt.
    //!
    //! Options are answered by *position*, not by typing a number: Claude Code
    //! renders a cursor over a list, so selecting the third option means two
    //! cursor moves then Enter. The server computes that from the index.
    private function showPromptMenu() as Void {
        var prompt = _view.getPrompt();
        if (prompt == null) {
            return;
        }

        var options = prompt.get("o");
        if (!(options instanceof Array)) {
            return;
        }

        var question = prompt.get("q");
        var title = (question instanceof String)
            ? shorten(question as String, 40)
            : (WatchUi.loadResource(Rez.Strings.MenuTitle) as String);

        var menu = new WatchUi.Menu2({ :title => title });
        var list = options as Array;

        for (var i = 0; i < list.size(); i++) {
            var option = list[i];
            if (!(option instanceof Dictionary)) {
                continue;
            }
            var label = (option as Dictionary).get("l");
            if (label instanceof String) {
                menu.addItem(new WatchUi.MenuItem(
                    label as String,
                    null,
                    "opt:" + i.toString(),
                    null
                ));
            }
        }

        WatchUi.pushView(menu, new MenuDelegate(self), WatchUi.SLIDE_UP);
    }

    private function shorten(text as String, max as Number) as String {
        if (text.length() <= max) {
            return text;
        }
        return text.substring(0, max - 1) + "…";
    }

    // --------------------------------------------------------------- actions

    //! Handle a menu selection.
    public function onMenuItem(id as Object?) as Void {
        if (!(id instanceof String)) {
            return;
        }
        var identifier = id as String;

        if (identifier.equals("refresh")) {
            _view.forceRefresh();
            return;
        }

        if (identifier.equals("type")) {
            // Prefilled empty rather than with a canned phrase: a prefill the
            // rider has to delete is worse than none, and the canned prompts
            // are already separate menu entries.
            var opened = $.promptForText("", method(:onTextEntered));
            if (!opened) {
                _view.setMessage("No keyboard on this device");
            }
            return;
        }

        // "opt:N" answers the on-screen prompt by option index.
        if (identifier.length() > 4 && identifier.substring(0, 4).equals("opt:")) {
            var index = identifier.substring(4, identifier.length()).toNumber();
            if (index != null) {
                answerPrompt(index as Number);
            }
            return;
        }

        send(identifier);
    }

    //! Answer the current prompt by option index.
    private function answerPrompt(index as Number) as Void {
        var prompt = _view.getPrompt();
        if (prompt == null) {
            return;
        }

        var options = prompt.get("o");
        if (!(options instanceof Array)) {
            return;
        }

        var list = options as Array;
        if (index < 0 || index >= list.size()) {
            return;
        }

        // A prompt the server flagged as granting lasting permission is held
        // for a second press. Widening an agent's permissions for the rest of
        // a session is not a decision to make with one thumb at speed.
        var destructive = prompt.get("d");
        if (destructive == true && _view.getSettings().confirmDestructive) {
            _pendingAction = "opt:" + index.toString();
            _view.setMessage(WatchUi.loadResource(Rez.Strings.ConfirmTitle) as String);
            return;
        }

        sendOption(index);
    }

    private function sendOption(index as Number) as Void {
        sendWithId("select:" + index.toString());
    }

    private function send(actionId as String) as Void {
        // A pending confirmation encoded as "opt:N" resolves back to an option.
        if (actionId.length() > 4 && actionId.substring(0, 4).equals("opt:")) {
            var index = actionId.substring(4, actionId.length()).toNumber();
            if (index != null) {
                sendOption(index as Number);
            }
            return;
        }
        sendWithId(actionId);
    }

    private function sendWithId(actionId as String) as Void {
        var client = _view.getClient();
        if (client == null) {
            return;
        }

        _nonceCounter += 1;

        // The nonce must be unique per intent and stable across retries.
        // Combining the uptime timer with a counter gives both without needing
        // a random source, which Monkey C does not offer cheaply.
        var nonce = System.getTimer().toString() + "-" + _nonceCounter.toString();

        // Sending the hash of the screen the rider was looking at is what stops
        // an approval landing on a prompt that appeared after they decided.
        var expect = _view.getHash();

        var sent = client.sendAction(actionId, nonce, expect, method(:onActionResult));
        if (!sent) {
            _view.setMessage("Busy");
        }
    }

    //! Send text the rider typed on the device keyboard.
    public function onTextEntered(text as String) as Void {
        var client = _view.getClient();
        if (client == null) {
            return;
        }

        _nonceCounter += 1;
        var nonce = System.getTimer().toString() + "-" + _nonceCounter.toString();

        _view.setMessage("Sending…");

        var sent = client.sendText(text, nonce, method(:onActionResult));
        if (!sent) {
            _view.setMessage("Busy");
        }
    }

    public function onActionResult(success as Boolean, message as String?) as Void {
        if (success) {
            _view.setMessage(null);
            // Refresh promptly: the screen has just changed as a direct result
            // of what the rider did, and waiting for the next scheduled poll
            // would make the app feel unresponsive.
            _view.forceRefresh();
        } else {
            _view.setMessage(message);
        }
    }
}

//! Bridges Menu2 selections back to the terminal delegate.
class MenuDelegate extends WatchUi.Menu2InputDelegate {

    private var _owner as TerminalDelegate;

    public function initialize(owner as TerminalDelegate) {
        Menu2InputDelegate.initialize();
        _owner = owner;
    }

    public function onSelect(item as WatchUi.MenuItem) as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        _owner.onMenuItem(item.getId());
    }

    public function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
