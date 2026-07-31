import { BRAND } from '@claude-edge/shared';

import styles from './page.module.css';

/**
 * Landing page.
 *
 * Written for a developer deciding whether this is worth twenty minutes, which
 * means it says what the thing does, shows it, and states plainly what it
 * cannot do. Hiding the limitations would convert slightly better and generate
 * the kind of disappointment that produces refund requests and bad issues.
 */
export default function HomePage() {
  return (
    <>
      <header className={styles.nav}>
        <div className="container">
          <div className={styles.navInner}>
            <a href="/" className={styles.brand}>
              <TerminalMark />
              <span>{BRAND.NAME}</span>
            </a>
            <nav aria-label="Main">
              <a href="#how">How it works</a>
              <a href="/docs">Docs</a>
              <a href={BRAND.REPO} rel="noreferrer">
                GitHub
              </a>
              <a href="/signup" className={styles.navCta}>
                Get started
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------------------------------------------------------- hero */}
        <section className={styles.hero}>
          <div className="container">
            <p className={styles.eyebrow}>Open source · Self-hosted</p>

            <h1>
              Your terminal,
              <br />
              on the handlebars.
            </h1>

            <p className={styles.lede}>
              Claude Code works for minutes at a stretch, then stops and waits
              for one word. If you are out riding, that pause costs you the
              whole ride. This puts the question on your Garmin, and lets you
              answer it without stopping.
            </p>

            <div className={styles.actions}>
              <a href="/signup" className={styles.primary}>
                Get started
              </a>
              <a href="/docs" className={styles.secondary}>
                Read the docs
              </a>
            </div>

            <p className={styles.note}>
              Free and open source. Runs on your own machine — nothing of yours
              passes through us.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- the screen */}
        <section className={styles.section}>
          <div className="container">
            <div className={styles.showcase}>
              <div>
                <h2>What you see at 30 km/h</h2>
                <p className={styles.body}>
                  The header turns amber the moment Claude needs you, and the
                  device buzzes once. The question and its options are parsed
                  out of the terminal, so you are reading a decision rather
                  than a screenful of output.
                </p>
                <p className={styles.body}>
                  Up and down move the highlight, the enter button confirms.
                  Three presses, eyes on the road between each one.
                </p>
              </div>

              <DeviceScreen />
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- how */}
        <section id="how" className={styles.sectionAlt}>
          <div className="container">
            <h2>How it connects</h2>
            <p className={styles.body}>
              A Garmin Edge has no WiFi. It reaches the internet through the
              Garmin Connect app on the phone you already carry, over
              Bluetooth — so there is no companion app to install and nothing
              to pay for.
            </p>

            <div className={styles.flow}>
              <FlowStep n={1} title="Your machine">
                Claude Code runs in tmux, where it already does. A small bridge
                reads the pane.
              </FlowStep>
              <FlowStep n={2} title="Your phone">
                Garmin Connect relays the request. Nothing to install — it is
                already there.
              </FlowStep>
              <FlowStep n={3} title="Your Edge">
                Shows the session and sends your answer back.
              </FlowStep>
            </div>

            <p className={styles.note}>
              The bridge runs on your machine or your own VPS. Your terminal
              never touches our servers, which is why the privacy claim is a
              property of the design rather than a promise.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- modes */}
        <section className={styles.section}>
          <div className="container">
            <h2>Two modes</h2>

            <div className={styles.modes}>
              <ModeCard mode={BRAND.MODES.dev} />
              <ModeCard mode={BRAND.MODES.coach} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- honesty */}
        <section className={styles.sectionAlt}>
          <div className="container">
            <h2>What it does not do</h2>
            <p className={styles.body}>
              Worth knowing before you spend an evening on it.
            </p>

            <ul className={styles.limits}>
              <li>
                <strong>Columns do not line up yet.</strong> Connect IQ ships no
                monospace font, so diffs and tables render in a proportional
                one. A bitmap font is the next thing being built.
              </li>
              <li>
                <strong>Long prompts belong on the phone.</strong> The Edge has
                a keyboard, but it is seven buttons. Fine for a correction, not
                for a paragraph.
              </li>
              <li>
                <strong>Two Edge models cannot run it.</strong> The 130 and 130
                Plus have no device-app support in hardware. Every other Edge
                works.
              </li>
              <li>
                <strong>You need HTTPS with a real certificate.</strong> Connect
                IQ rejects plain HTTP and self-signed certificates. A free
                Tailscale Funnel or Cloudflare Tunnel is enough.
              </li>
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- start */}
        <section className={styles.cta}>
          <div className="container">
            <h2>Start with the source</h2>
            <p className={styles.body}>
              Everything is open. Read it before you run it next to a terminal
              that holds your credentials.
            </p>
            <div className={styles.actions}>
              <a href="/signup" className={styles.primary}>
                Get started
              </a>
              <a href={BRAND.REPO} className={styles.secondary} rel="noreferrer">
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerInner}>
            <p>
              {BRAND.NAME} — {BRAND.TAGLINE}
            </p>
            <nav aria-label="Footer">
              <a href="/docs">Docs</a>
              <a href={BRAND.REPO} rel="noreferrer">
                GitHub
              </a>
              <a href="/privacy">Privacy</a>
            </nav>
          </div>
          <p className={styles.disclaimer}>
            Not affiliated with Garmin or Anthropic. Garmin, Edge and Connect IQ
            are trademarks of Garmin Ltd. Claude and Claude Code are products of
            Anthropic.
          </p>
        </div>
      </footer>
    </>
  );
}

function FlowStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.step}>
      <span className={styles.stepNumber} aria-hidden="true">
        {n}
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function ModeCard({
  mode,
}: {
  mode: { name: string; tagline: string; description: string; available: boolean };
}) {
  return (
    <div className={styles.mode}>
      <div className={styles.modeHead}>
        <h3>{mode.name}</h3>
        {/*
          The coach mode is not built. Saying "coming soon" on a card that looks
          identical to a working feature is how people end up feeling misled.
        */}
        <span className={mode.available ? styles.badgeLive : styles.badgeSoon}>
          {mode.available ? 'Available' : 'Not built yet'}
        </span>
      </div>
      <p className={styles.modeTagline}>{mode.tagline}</p>
      <p>{mode.description}</p>
    </div>
  );
}

/**
 * A mock of the device screen.
 *
 * Explicitly a mock, and labelled as one. The real app never shows invented
 * terminal content — it mirrors a live tmux pane — and it would be poor form
 * to illustrate that product with a fabricated screenshot presented as real.
 */
function DeviceScreen() {
  return (
    <figure className={styles.device}>
      <div className={styles.deviceScreen}>
        <div className={styles.deviceHeader}>
          <span>Needs you</span>
          <span>claude</span>
        </div>
        <pre className={styles.deviceBody}>
          {`Edit file
app.ts
 1  export const config = {
 2 -  timeout: 5000,
 2 +  timeout: 45000,
 3    retries: 3,
 4  };

Do you want to make this edit
to app.ts?`}
        </pre>
        <div className={styles.devicePrompt}>
          <div className={styles.optionSelected}>&gt; Yes</div>
          <div className={styles.option}>Yes, allow all edits</div>
          <div className={styles.option}>No</div>
        </div>
      </div>
      <figcaption>Edge 540 · 246 × 322</figcaption>
    </figure>
  );
}

function TerminalMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7l5 5-5 5" />
      <path d="M13 17h6" />
    </svg>
  );
}
