import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BRAND } from '@claude-edge/shared';

import {
  getDictionary,
  isLocale,
  localeParams,
  localePath,
  metadataFor,
  type Locale,
} from '@/i18n/index.ts';
import type { Dictionary } from '@/i18n/dictionaries/en.ts';

import { LanguageSwitcher, PricingPlans, Reveal, WaitlistForm } from './interactive.tsx';
import styles from './landing.module.css';

export function generateStaticParams() {
  return localeParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return metadataFor(locale, '/');
}

/**
 * Landing page.
 *
 * Structure adapted from the Payway template: pill-badged sections, a metrics
 * row, sticky stacking mode cards, a billing toggle, an accordion FAQ, and an
 * oversized wordmark in the footer.
 *
 * Three things about the template did not survive, each for a stated reason:
 *
 *   - **Its numbers and testimonials.** They described a payments company with
 *     customers. This has neither, and inventing the equivalents for a
 *     developer audience is both dishonest and ineffective — they check.
 *   - **Its video backgrounds.** Several megabytes to convey "movement", on a
 *     page whose audience notices wasted bytes. CSS gradients read the same.
 *   - **framer-motion and embla.** Replaced by an IntersectionObserver and a
 *     native `<details>`, which cost no dependency and no hydration and keep
 *     the content in the DOM for crawlers.
 *
 * What it says about the product follows one rule: describe the outcome, never
 * the implementation. The user is told they speak and it reaches the session.
 * Which vendor transcribes it is our business and it changes without notice.
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const home = localePath(locale, '/');

  return (
    <div className={styles.page}>
      {/* ------------------------------------------------------------ nav */}
      <header className={styles.nav}>
        <div className={styles.container}>
          <div className={styles.navInner}>
            <a href={home} className={styles.brand}>
              <TerminalMark />
              <span>{BRAND.NAME}</span>
            </a>

            <nav className={styles.navLinks} aria-label={t.nav.mainNav}>
              <a href="#modes">{t.nav.modes}</a>
              <a href="#how">{t.nav.how}</a>
              <a href="#pricing">{t.nav.pricing}</a>
              <a href="/docs">{t.nav.docs}</a>
            </nav>

            <div className={styles.navRight}>
              <LanguageSwitcher locale={locale} label={t.nav.language} />
              <a href="/signup" className={styles.primary}>
                {t.nav.getStarted}
                <span className={styles.arrow} aria-hidden="true">
                  <ArrowIcon />
                </span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <main id="main">
        {/* --------------------------------------------------------- hero */}
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.container}>
            <div className={styles.heroInner}>
              <div>
                <p className={styles.eyebrow}>{t.hero.eyebrow}</p>
                <h1>{t.hero.title}</h1>
                <p className={styles.lede}>{t.hero.lede}</p>

                <div className={styles.actions}>
                  <a href="/signup" className={styles.primary}>
                    {t.hero.primary}
                    <span className={styles.arrow} aria-hidden="true">
                      <ArrowIcon />
                    </span>
                  </a>
                  <a href="/docs" className={styles.secondary}>
                    {t.hero.secondary}
                    <span className={styles.arrow} aria-hidden="true">
                      <ArrowIcon />
                    </span>
                  </a>
                </div>

                <p className={styles.note}>{t.hero.note}</p>
              </div>

              <DeviceScreen />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- proof */}
        <section className={styles.sectionAlt}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.head}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.proof.tag}
                </span>
                <h2>{t.proof.title}</h2>
                <p className={styles.body}>{t.proof.body}</p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className={styles.proofGrid}>
                {Object.entries(t.proof.stats).map(([key, stat]) => (
                  <div key={key} className={styles.stat}>
                    <span className={styles.statValue}>{stat.value}</span>
                    <span className={styles.statLabel}>{stat.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- modes */}
        <section id="modes" className={styles.section}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.headCentered}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.modes.tag}
                </span>
                <h2>{t.modes.title}</h2>
                <p className={styles.body}>{t.modes.body}</p>
              </div>
            </Reveal>

            <div className={styles.modeStack}>
              {/* Dev — built and working. */}
              <article className={`${styles.modeCard} ${styles.modeDev}`}>
                <div className={styles.modeHead}>
                  <h3>{t.modes.dev.name}</h3>
                  <span className={styles.badgeLive}>{t.modes.dev.badge}</span>
                </div>
                <p className={styles.modeTagline}>{t.modes.dev.tagline}</p>
                <p className={styles.modeBody}>{t.modes.dev.body}</p>

                <ul className={styles.modePoints}>
                  {t.modes.dev.points.map((point) => (
                    <li key={point.title} className={styles.modePoint}>
                      <h4>
                        <span className={styles.pointMark} aria-hidden="true">—</span>
                        {point.title}
                      </h4>
                      <p>{point.body}</p>
                    </li>
                  ))}
                </ul>
              </article>

              {/*
                Coach — not built.

                The badge says so and the card carries a waitlist rather than a
                call to action, because a card that looks identical to a working
                feature is how people end up feeling misled. This is the same
                judgement the previous landing page made and it was right.
              */}
              <article className={`${styles.modeCard} ${styles.modeCoach}`}>
                <div className={styles.modeHead}>
                  <h3>{t.modes.coach.name}</h3>
                  <span className={styles.badgeSoon}>{t.modes.coach.badge}</span>
                </div>
                <p className={styles.modeTagline}>{t.modes.coach.tagline}</p>
                <p className={styles.modeBody}>{t.modes.coach.body}</p>

                <ul className={styles.modePoints}>
                  {t.modes.coach.points.map((point) => (
                    <li key={point.title} className={styles.modePoint}>
                      <h4>
                        <span className={styles.pointMark} aria-hidden="true">—</span>
                        {point.title}
                      </h4>
                      <p>{point.body}</p>
                    </li>
                  ))}
                </ul>

                <div className={styles.waitlist}>
                  <h4>{t.modes.coach.waitlist.title}</h4>
                  <p>{t.modes.coach.waitlist.body}</p>
                  <WaitlistForm t={t} />
                  <p className={styles.waitlistNote}>{t.modes.coach.waitlist.privacy}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- how */}
        <section id="how" className={styles.sectionAlt}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.head}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.how.tag}
                </span>
                <h2>{t.how.title}</h2>
                <p className={styles.body}>{t.how.body}</p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className={styles.flow}>
                {t.how.steps.map((step, index) => (
                  <div key={step.title} className={styles.step}>
                    <span className={styles.stepNumber} aria-hidden="true">
                      {index + 1}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <p className={styles.note}>{t.how.note}</p>
          </div>
        </section>

        {/* ------------------------------------------------------- limits */}
        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.head}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.limits.tag}
                </span>
                <h2>{t.limits.title}</h2>
                <p className={styles.body}>{t.limits.body}</p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <ul className={styles.limits}>
                {t.limits.items.map((item) => (
                  <li key={item.title} className={styles.limit}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------ pricing */}
        <section id="pricing" className={styles.sectionAlt}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.headCentered}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.pricing.tag}
                </span>
                <h2>{t.pricing.title}</h2>
                <p className={styles.body}>{t.pricing.body}</p>
              </div>
            </Reveal>

            <PricingPlans t={t} />

            <p className={styles.note} style={{ marginTop: '1.5rem' }}>
              {t.pricing.note}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------- faq */}
        <section className={styles.section}>
          <div className={styles.container}>
            <Reveal>
              <div className={styles.headCentered}>
                <span className={styles.tag}>
                  <SparkIcon />
                  {t.faq.tag}
                </span>
                <h2>{t.faq.title}</h2>
              </div>
            </Reveal>

            <div className={styles.faq}>
              {t.faq.items.map((item) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary>
                    {item.q}
                    <span className={styles.faqMark} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" width="12" height="12">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className={styles.faqAnswer}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- cta */}
        <section className={styles.cta}>
          <div className={styles.container}>
            <h2>{t.cta.title}</h2>
            <p className={styles.body}>{t.cta.body}</p>
            <div className={styles.actions}>
              <a href="/signup" className={styles.primary}>
                {t.cta.primary}
                <span className={styles.arrow} aria-hidden="true">
                  <ArrowIcon />
                </span>
              </a>
              <a href={BRAND.REPO} className={styles.secondary} rel="noreferrer">
                {t.cta.secondary}
                <span className={styles.arrow} aria-hidden="true">
                  <ArrowIcon />
                </span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------- footer */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <span className={styles.wordmark} aria-hidden="true">
            {BRAND.NAME}
          </span>

          <div className={styles.footerInner}>
            <p className={styles.footerBrand}>
              {BRAND.NAME} — {BRAND.TAGLINE}
            </p>
            <nav aria-label={t.nav.footerNav}>
              <a href="/docs">{t.footer.docs}</a>
              <a href={BRAND.REPO} rel="noreferrer">
                {t.footer.source}
              </a>
              <a href={localePath(locale, '/privacy')}>{t.footer.privacy}</a>
              <a href={localePath(locale, '/terms')}>{t.footer.terms}</a>
            </nav>
          </div>

          <p className={styles.disclaimer}>{t.footer.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------- fragments */

/**
 * A mock of the device screen at the Edge 540's real 246×322 aspect ratio.
 *
 * Explicitly a mock, and captioned as one. The product mirrors a live tmux
 * pane; illustrating it with invented terminal content presented as a
 * screenshot would misrepresent the thing being sold.
 */
function DeviceScreen() {
  return (
    <figure className={styles.device}>
      <div className={styles.deviceFrame}>
        <div className={styles.deviceHeader}>
          <span>Needs you</span>
          <span>claude</span>
        </div>

        <pre className={styles.deviceBody}>
          {'Edit file\napp.ts\n 1  export const config = {\n'}
          <span className={styles.deviceDel}>{' 2 -  timeout: 5000,\n'}</span>
          <span className={styles.deviceAdd}>{' 2 +  timeout: 45000,\n'}</span>
          {' 3    retries: 3,\n 4  };\n\nDo you want to make this\nedit to app.ts?'}
        </pre>

        <div className={styles.deviceOptions}>
          <div className={styles.optionSelected}>&gt; Yes</div>
          <div className={styles.option}>Yes, allow all edits</div>
          <div className={styles.option}>No</div>
        </div>
      </div>
      <figcaption>Edge 540 · 246 × 322 · mock-up</figcaption>
    </figure>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7M17 7H8M17 7v9" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
    </svg>
  );
}

/** The wordmark's glyph — a shell prompt, which is what this is for. */
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

export type { Dictionary, Locale };
