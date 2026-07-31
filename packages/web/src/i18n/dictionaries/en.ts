/**
 * English — the canonical dictionary.
 *
 * This file is the source of truth for the shape of a translation. `pt.ts` and
 * `es.ts` are typed against it (`satisfies Dictionary`), so adding a key here
 * and forgetting to translate it is a compile error rather than a page that
 * renders "hero.title" to a customer.
 *
 * ON THE COPY ITSELF
 * ------------------
 * Two rules the whole site follows:
 *
 *   1. **No implementation detail.** The user is told what happens — they
 *      speak and it reaches the session — never which vendor transcribes it or
 *      which model runs. That is our business and it changes without notice.
 *
 *   2. **No invented proof.** Every number on this page is checkable against
 *      the repository. There are no customer counts, no ratings and no
 *      testimonials, because there are no customers yet. The credibility comes
 *      from the honesty, which is also the documented positioning.
 */

export const en = {
  meta: {
    title: 'Train and ship at the same time',
    description:
      'Your coding session waits for one word while you are out riding. See it on ' +
      'your Garmin, answer with your voice, and keep pedalling.',
  },

  nav: {
    how: 'How it works',
    modes: 'Modes',
    pricing: 'Pricing',
    docs: 'Docs',
    signIn: 'Sign in',
    getStarted: 'Get started',
    skipToContent: 'Skip to content',
    mainNav: 'Main',
    footerNav: 'Footer',
    language: 'Language',
  },

  hero: {
    eyebrow: 'Open source · Self-hosted',
    title: 'Train and ship at the same time.',
    lede:
      'A coding session runs for minutes, then stops and waits for one word. ' +
      'If you are on the bike, that pause costs you the whole ride. Put the ' +
      'question on your handlebars and answer it out loud, without stopping.',
    primary: 'Get started',
    secondary: 'Read the docs',
    note: 'Free and open source. Run it on your own machine — nothing of yours passes through us.',
  },

  /**
   * Real figures only, each verifiable in the repository. The template these
   * sections came from used payment volumes and app-store ratings; inventing
   * the equivalents here would be a lie told to developers, who check.
   */
  proof: {
    tag: 'Where it stands',
    title: 'Built and working, with the limits stated.',
    body:
      'This is a working tool, not a landing page for something that does not ' +
      'exist yet. The numbers below come from the repository and you can check ' +
      'every one of them.',
    stats: {
      devices: { value: '18/20', label: 'Garmin Edge models supported' },
      tests: { value: '127', label: 'Tests, including against real tmux' },
      size: { value: '122 KB', label: 'On-device, of a 1 MB budget' },
      cost: { value: '€0', label: 'To self-host, permanently' },
    },
  },

  modes: {
    tag: 'Two modes',
    title: 'One device on the bars. Two jobs.',
    body:
      'The same app, doing the thing you need depending on why you are out ' +
      'there. Neither one asks you to stop.',

    dev: {
      name: 'Dev',
      badge: 'Available',
      tagline: 'Keep shipping while you train.',
      body:
        'You no longer choose between the ride and the work. The session runs ' +
        'while you do, and when it needs a decision the question appears on ' +
        'your Edge — parsed down to the choice itself, not a screen of output.',
      points: [
        {
          title: 'Answer without stopping',
          body: 'Up and down move the highlight, one press confirms. Eyes back on the road between each one.',
        },
        {
          title: 'Speak instead of typing',
          body:
            'Press the headphone button and talk. What you say arrives as text in the ' +
            'open session, so you can steer the work with a sentence rather than seven buttons.',
        },
        {
          title: 'You review before it sends',
          body:
            'Voice reaches a session that edits files and runs commands, so nothing ' +
            'is sent until you have seen the text and confirmed it.',
        },
      ],
    },

    coach: {
      name: 'Coach',
      badge: 'Waitlist',
      tagline: 'A riding buddy who actually watches.',
      body:
        'It follows the ride as it happens — your effort against what is still ' +
        'ahead, against what you have done before — and talks to you through ' +
        'your headphones. Not a screen you have to read at 30 km/h.',
      points: [
        {
          title: 'Effort, read in real time',
          body: 'Going too hard for what is left, or sitting up when there is more in you. It says so.',
        },
        {
          title: 'The climb before you reach it',
          body: 'It knows the route. You hear about the gradient while there is still time to change gear.',
        },
        {
          title: 'Eat now, not in twenty minutes',
          body: 'Fuelling reminders timed to the effort you have actually spent, which is when they matter.',
        },
        {
          title: 'The voice you need at hour three',
          body: 'It has your history. When you are further along than you feel, hearing that is worth something.',
        },
      ],
      waitlist: {
        title: 'Coach is not built yet.',
        body:
          'It is the next thing being made, and it is honest to say so rather ' +
          'than show you a card that looks the same as a working feature. ' +
          'Leave your email and you will hear when it is real.',
        placeholder: 'you@example.com',
        cta: 'Join the waitlist',
        privacy: 'One email when it ships. Nothing else, and no sharing with anyone.',
        success: 'You are on the list. You will hear from us once, when it works.',
        error: 'That did not go through. Try again in a moment.',
        invalid: 'That does not look like an email address.',
      },
    },
  },

  how: {
    tag: 'How it connects',
    title: 'Three parts, and two of them you already own.',
    body:
      'A Garmin Edge has no WiFi of its own. It reaches the internet through ' +
      'the Garmin Connect app on the phone already in your pocket, over ' +
      'Bluetooth — so there is nothing extra to install and nothing extra to pay for.',
    steps: [
      {
        title: 'Your machine',
        body: 'The session runs in tmux, where it already runs. A small bridge reads the pane.',
      },
      {
        title: 'Your phone',
        body: 'Garmin Connect relays the request and carries your voice. Already installed.',
      },
      {
        title: 'Your Edge',
        body: 'Shows what is being asked and sends your answer back.',
      },
    ],
    note:
      'The bridge runs on your machine or your own VPS. Terminal content is ' +
      'encrypted on your devices before it goes anywhere, which is why the ' +
      'privacy claim is a property of the design rather than a promise.',
  },

  limits: {
    tag: 'Before you spend an evening on it',
    title: 'What it does not do.',
    body:
      'Stated here rather than discovered later. This converts worse and ' +
      'refunds better, which is the correct trade.',
    items: [
      {
        title: 'Columns do not line up yet.',
        body:
          'Connect IQ ships no monospace font, so diffs and tables render in a ' +
          'proportional one. A bitmap font is the next thing being built.',
      },
      {
        title: 'Long prompts belong on the phone.',
        body:
          'The Edge has a keyboard, but it is seven buttons. Fine for a ' +
          'correction, hopeless for a paragraph — which is what voice is for.',
      },
      {
        title: 'Two Edge models cannot run it.',
        body:
          'The 130 and 130 Plus have no device-app support in hardware. That is ' +
          'a limit of the device, not a decision. Every other Edge works.',
      },
      {
        title: 'You need HTTPS with a real certificate.',
        body:
          'Connect IQ rejects plain HTTP and self-signed certificates. A free ' +
          'tunnel is enough, and the docs walk through it.',
      },
    ],
  },

  pricing: {
    tag: 'Pricing',
    title: 'One price, or none at all.',
    body:
      'Self-hosting is complete and free, permanently. The paid plan sells ' +
      'convenience — it does not unlock capability that is otherwise withheld.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    save: 'Save 20%',
    perMonth: '/month',
    features: 'What you get',

    plans: {
      free: {
        name: 'Self-hosted',
        description:
          'The whole thing, running on your own machine. No account, nothing ' +
          'through us, no limit that expires.',
        price: '€0',
        cta: 'Read the setup guide',
        features: [
          'Every feature of Dev mode',
          'Unlimited sessions',
          'Your own machine, your own network',
          'Full source, AGPL-3.0',
          'Community support on GitHub',
        ],
      },
      pro: {
        name: 'Hosted',
        description:
          'The same product without the setup. We carry the connection so you ' +
          'do not have to configure a tunnel.',
        price: '€5',
        cta: 'Get 14 days free',
        features: [
          'Everything in self-hosted',
          'Nothing to configure — it connects itself',
          'Voice, so you can talk instead of type',
          'Up to 5 sessions',
          'Coach mode when it ships',
        ],
      },
    },

    note:
      'Terminal content is encrypted on your own devices either way. On the ' +
      'hosted plan it passes through us as bytes we cannot read.',
  },

  faq: {
    tag: 'FAQ',
    title: 'The questions worth answering.',
    items: [
      {
        q: 'Do I have to stop riding to use it?',
        a:
          'No — that is the entire point. Answering takes two presses of a button ' +
          'already under your thumb, and speaking takes one. If a thing cannot be ' +
          'done safely while moving, it is not on the device.',
      },
      {
        q: 'Can you read my terminal?',
        a:
          'No. Content is encrypted on your own devices with a key derived from a ' +
          'passphrase you set, and that passphrase never reaches us. On the hosted ' +
          'plan we route bytes we cannot open. The consequence is real and worth ' +
          'knowing: if you forget the passphrase, we cannot recover it for you.',
      },
      {
        q: 'Which Garmin Edge models work?',
        a:
          'Eighteen of the twenty that exist. The Edge 130 and 130 Plus cannot run ' +
          'any device app at all — that is a hardware limitation rather than ' +
          'something we chose. Every other Edge is supported.',
      },
      {
        q: 'Do I need a phone as well?',
        a:
          'Yes. The Edge has no WiFi and reaches the internet through Garmin ' +
          'Connect on your phone over Bluetooth. You almost certainly already have ' +
          'it installed, and it can stay in your pocket.',
      },
      {
        q: 'Is self-hosting a limited version?',
        a:
          'No. It is the same software with nothing withheld, and it stays that ' +
          'way. The paid plan removes setup work; it does not unlock features that ' +
          'were being held back.',
      },
      {
        q: 'What happens if it cannot understand what I said?',
        a:
          'You see the text before anything is sent, and you confirm it. Wind and ' +
          'breathing hard are exactly the conditions where recognition struggles, ' +
          'and the destination is a session that can edit files — so a review step ' +
          'is not optional.',
      },
    ],
  },

  cta: {
    title: 'Go for a ride. Keep working.',
    body:
      'Everything is open source. Read it before you run it next to a terminal ' +
      'that holds your credentials — that is the correct instinct, and we ' +
      'built for it.',
    primary: 'Get started',
    secondary: 'View the source',
  },

  footer: {
    docs: 'Docs',
    privacy: 'Privacy',
    terms: 'Terms',
    source: 'Source',
    disclaimer:
      'Not affiliated with Garmin or Anthropic. Garmin, Edge and Connect IQ are ' +
      'trademarks of Garmin Ltd. Claude and Claude Code are products of Anthropic.',
    rights: 'All rights reserved.',
  },
};

/**
 * Recursively widens string literals to `string`.
 *
 * Without this the English object's inferred type is a tree of literal types —
 * `title: "Train and ship at the same time"` — and `pt satisfies Dictionary`
 * then demands the Portuguese title be that exact English sentence. Widening
 * keeps what is actually wanted (every key present, correctly nested, nothing
 * extra) while letting the values differ, which is the point of a translation.
 *
 * WHAT THIS DOES NOT CATCH
 * ------------------------
 * Array *length*. A translation with five FAQ entries where English has six
 * type-checks cleanly, because these arrays are not tuples. That is a real gap
 * and it is covered by a test instead — see `test/i18n.test.ts`, which compares
 * the parallel arrays across all three dictionaries. Verified: removing an item
 * passes `tsc` and fails that test.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? readonly Widen<Item>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

/** The shape every other dictionary must satisfy. */
export type Dictionary = Widen<typeof en>;
