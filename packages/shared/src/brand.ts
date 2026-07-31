/**
 * brand.ts — every user-visible name, in one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The project's name is not settled. "Claude" is Anthropic's trademark and has
 * to go before this is sold, so a rename is coming — and a rename that means
 * grepping through a marketing site, a device app, a server, and a set of
 * container labels is the kind of change that gets deferred forever and then
 * done badly.
 *
 * So the name lives here and nowhere else. Renaming is editing `NAME` and the
 * two or three fields under it. Everything downstream reads from this object.
 *
 * WHAT BELONGS HERE
 * -----------------
 * Anything a user could read: product name, tagline, domain, support address,
 * store listing text. Anything a machine reads and a human never sees — an
 * environment variable, a database column — does not, because renaming those
 * is a migration rather than a text change and conflating the two makes the
 * rename look riskier than it is.
 *
 * WHAT CANNOT READ FROM HERE
 * --------------------------
 * Three places hold the name in a form this file cannot reach:
 *
 *   - `edge-app/resources/strings/strings.xml` — Monkey C cannot import
 *     TypeScript. Its `AppName` string must be updated by hand.
 *   - `package.json` names and the pnpm workspace scope.
 *   - The Connect IQ store listing and the app's manifest UUID, which is
 *     permanent regardless of what the app is called.
 *
 * `scripts/rename.sh` handles all three, and is the reason a rename stays a
 * single operation rather than a scavenger hunt.
 */

export const BRAND = {
  /**
   * The product name, as written in prose and shown to users.
   * Change this and run `scripts/rename.sh`.
   */
  NAME: 'Claude Edge',

  /** Lowercase, hyphenated. Used for package names, repo, container labels. */
  SLUG: 'claude-edge',

  /** One line, under 60 characters. Used as the HTML title suffix and in the store. */
  TAGLINE: 'Your terminal on the handlebars',

  /**
   * What it does, in one sentence. Used as the meta description, so it is
   * written for someone deciding whether to click rather than for someone who
   * already knows what this is.
   */
  DESCRIPTION:
    'Watch and steer a Claude Code session from your Garmin Edge. Approve prompts ' +
    'from the handlebars instead of stopping to unlock your phone.',

  /** Primary domain, without protocol or trailing slash. */
  DOMAIN: 'edge.heldergoncalves.io',

  /** Where the source lives. */
  REPO: 'https://github.com/helderpgoncalves/claude-edge',

  /** Contact for support and for security reports. */
  SUPPORT_EMAIL: 'support@heldergoncalves.io',

  /**
   * The two things this product does. Both are the same product; the second is
   * not built yet, and the marketing site says so rather than implying it is
   * available.
   */
  MODES: {
    dev: {
      name: 'Dev',
      tagline: 'Keep shipping while you train',
      description:
        'See what your session is doing and answer it from the handlebars — by ' +
        'button, or by speaking. You stop choosing between the ride and the work.',
      available: true,
    },
    coach: {
      name: 'Coach',
      tagline: 'A riding buddy who actually watches',
      description:
        'Reads your effort against what is still ahead and against your history, ' +
        'and talks to you through your headphones: the climb before you reach it, ' +
        'when to eat, and when you have more left than you think.',
      available: false,
    },
  },
} as const;

/** Full origin, for building absolute URLs. */
export function origin(): string {
  return `https://${BRAND.DOMAIN}`;
}

/** An absolute URL on the primary domain. */
export function url(path = '/'): string {
  return `${origin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Page title, in the conventional "Page · Product" form.
 * The bare product name is returned for the home page rather than
 * "Home · Product", which reads badly and wastes the title's first words.
 */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${BRAND.NAME}` : `${BRAND.NAME} — ${BRAND.TAGLINE}`;
}
