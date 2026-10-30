// Outbound URLs. Dependency-free so both native.ts and updates.ts can import it without a cycle.

/** The only URLs the app may open in the browser (also scoped in the opener capability). */
export const EXTERNAL_LINKS = {
  github: 'https://github.com/tengfone/forgetools',
  releases: 'https://github.com/tengfone/forgetools/releases',
  issues: 'https://github.com/tengfone/forgetools/issues',
  coffee: 'https://www.buymeacoffee.com/tengfone',
} as const;
export type ExternalLinkId = keyof typeof EXTERNAL_LINKS | 'latestRelease';
/** Release page URLs (from GitHub's API or cache) must start with this. */
export const RELEASE_PREFIX = 'https://github.com/tengfone/forgetools/releases/';
