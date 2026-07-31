'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LOCALES, LOCALE_NAMES, localePath, type Locale } from '@/i18n/config.ts';
import type { Dictionary } from '@/i18n/dictionaries/en.ts';

import styles from './landing.module.css';

/**
 * The only client components on this page.
 *
 * Everything else is server-rendered. These four need state or a browser API,
 * and keeping them isolated means the rest of the landing page ships no
 * JavaScript at all — which is what keeps the Core Web Vitals numbers in
 * docs/saas/web-app.md achievable rather than aspirational.
 */

/* ------------------------------------------------------------------ icons */

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7M17 7H8M17 7v9" />
    </svg>
  );
}

/* ----------------------------------------------------------------- reveal */

/**
 * Fades a section in as it scrolls into view.
 *
 * Starts visible and is hidden by the observer only once we know the script is
 * running and motion is allowed. The reverse — hidden by default, revealed by
 * JS — leaves the whole page blank if the bundle fails, which is a real
 * failure mode on a flaky mobile connection and exactly the audience here.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const node = ref.current;
    if (!node) return;

    setArmed(true);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // Fires slightly before the element reaches the viewport, so the
      // transition is already finishing by the time it is properly on screen.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const className = !armed
    ? undefined
    : shown
      ? `${styles.reveal} ${styles.revealed}`
      : styles.reveal;

  return (
    <div
      ref={ref}
      className={className}
      style={armed && delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------- language switch */

export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape. Both are expected of a menu, and
  // their absence is the kind of thing that feels broken without being
  // articulable.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.langWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.langButton}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          width="14" height="14" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
        {locale.toUpperCase()}
      </button>

      {open && (
        <ul className={styles.langMenu}>
          {LOCALES.map((code) => (
            <li key={code}>
              {/*
                A plain link, not a router push. The locale is part of the URL,
                so navigating is a navigation — which also means the language
                choice is shareable and the back button behaves.

                hrefLang tells the browser and any crawler what is on the other
                end, which is a small SEO win for free.
              */}
              <a
                href={localePath(code, '/')}
                hrefLang={code}
                lang={code}
                className={code === locale ? styles.langCurrent : undefined}
                aria-current={code === locale ? 'true' : undefined}
              >
                {LOCALE_NAMES[code]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- pricing */

export function PricingPlans({ t }: { t: Dictionary }) {
  const [yearly, setYearly] = useState(false);

  const plans = [
    { key: 'free' as const, plan: t.pricing.plans.free, featured: false, href: '/docs/installation' },
    { key: 'pro' as const, plan: t.pricing.plans.pro, featured: true, href: '/signup' },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {/*
          A radio group rather than two buttons: these are mutually exclusive
          options and that is what a screen reader should hear.
        */}
        <div className={styles.toggle} role="radiogroup" aria-label={t.pricing.tag}>
          <button
            type="button"
            role="radio"
            aria-checked={!yearly}
            className={`${styles.toggleButton} ${!yearly ? styles.toggleActive : ''}`}
            onClick={() => setYearly(false)}
          >
            {t.pricing.monthly}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={yearly}
            className={`${styles.toggleButton} ${yearly ? styles.toggleActive : ''}`}
            onClick={() => setYearly(true)}
          >
            {t.pricing.yearly}
            <span className={styles.savePill}>{t.pricing.save}</span>
          </button>
        </div>
      </div>

      <div className={styles.plans}>
        {plans.map(({ key, plan, featured, href }) => {
          // The free plan has no billing period, so the toggle must not turn
          // "€0" into "€0/year" — which would imply a yearly charge of zero
          // rather than no charge at all.
          const isFree = key === 'free';
          const amount = isFree ? plan.price : yearly ? '€4' : plan.price;

          return (
            <div
              key={key}
              className={`${styles.plan} ${featured ? styles.planFeatured : ''}`}
            >
              <h3>{plan.name}</h3>
              <p className={styles.planDescription}>{plan.description}</p>

              <p className={styles.planPrice}>
                <span className={styles.planAmount}>{amount}</span>
                {!isFree && (
                  <span className={styles.planPeriod}>{t.pricing.perMonth}</span>
                )}
              </p>

              <span className={styles.featuresLabel}>{t.pricing.features}</span>

              <ul className={styles.planFeatures}>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span className={styles.check} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={href}
                className={`${featured ? styles.primary : styles.secondary} ${styles.planCta}`}
              >
                {plan.cta}
                <span className={styles.arrow} aria-hidden="true">
                  <ArrowIcon />
                </span>
              </a>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- waitlist */

export function WaitlistForm({ t }: { t: Dictionary }) {
  const c = t.modes.coach.waitlist;

  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error' | 'invalid'>('idle');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Validated on the client for the immediate feedback and again on the
    // server, because a client-side check is a courtesy and not a control.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setState('invalid');
      return;
    }

    setState('sending');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, interest: 'coach' }),
      });

      setState(response.ok ? 'ok' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'ok') {
    return (
      <p className={`${styles.formMessage} ${styles.formOk}`} role="status">
        {c.success}
      </p>
    );
  }

  return (
    <form className={styles.waitlistForm} onSubmit={onSubmit} noValidate>
      <label htmlFor="waitlist-email" className="sr-only">
        {c.placeholder}
      </label>
      <input
        id="waitlist-email"
        type="email"
        name="email"
        inputMode="email"
        autoComplete="email"
        placeholder={c.placeholder}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (state === 'invalid' || state === 'error') setState('idle');
        }}
        aria-invalid={state === 'invalid'}
        required
      />

      <button type="submit" className={styles.primary} disabled={state === 'sending'}>
        {c.cta}
        <span className={styles.arrow} aria-hidden="true">
          <ArrowIcon />
        </span>
      </button>

      {(state === 'invalid' || state === 'error') && (
        <p
          className={`${styles.formMessage} ${styles.formError}`}
          role="alert"
          style={{ flexBasis: '100%' }}
        >
          {state === 'invalid' ? c.invalid : c.error}
        </p>
      )}
    </form>
  );
}
