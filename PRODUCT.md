# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Developers in general. They reach for ForgeTools in the middle of everyday work (debugging, inspecting payloads, converting data, generating test values) and want one trusted place for the small utility jobs they'd otherwise scatter across many websites.

## Product Purpose
An all-in-one desktop developer toolkit: formatters, encoders/decoders, converters, generators, and text tools in a single app. Success means a developer gets the transformed result immediately, without leaving their machine or hunting for a site.

## Positioning
Every tool runs fully offline with no telemetry. Pasted data (tokens, certificates, customer payloads) never leaves the machine. It's fast, all-in-one, and pleasant to use, in contrast to ad-laden, network-dependent web utilities.

## Operating Context
Desktop app (Tauri) used alongside an editor, terminal, and browser. Input is usually pasted or typed text, files, or images; output is copied back into other tools.

## Capabilities and Constraints
- Stack: Tauri v2, Vite, TypeScript, Tailwind CSS, Monaco Editor, Vitest and WebdriverIO tests.
- Tool categories (see README.md): Formatters (JSON, XML, SQL, HTML, HTML→JSX, Markdown→HTML, Markdown preview, YAML, SVG optimizer); Encoders/Decoders (Base64, URL, JWT, backslash escape, HEX↔ASCII, X.509 certificate, hashes); Converters (YAML↔JSON, CSV↔JSON, timestamp, color, number base, image→Base64); Generators (UUID/ULID, QR, barcode, Lorem Ipsum, random string); Text tools (diff viewer). Also: HMAC, JWT signing, key pairs, CSR/SAML/PEM↔JWK, bcrypt/Argon2, password strength, JSON↔YAML/TOML/.env, JSON→types, JSONPath, JSON diff, cURL→code, docker run↔compose, Dockerfile lint, CSS/JS/GraphQL formatting, CIDR, URL/User-Agent parsing, gzip, protobuf/MessagePack, Unicode inspector, chmod, data sizes, time zones, HTTP status, cheat sheets, fake data, cron builder, .gitignore, favicons, a tool pipeline, and opt-in local per-tool history.
- Hard constraints: must work entirely offline; no telemetry or network calls with user data. The only network request is an opt-in update check (manual button, or a daily check that is off by default) that asks GitHub for the latest release version; it sends nothing about the user.
- Undecided: target OSes, distribution, brand identity, accessibility standard.

## Brand Commitments
Name: ForgeTools. No other brand commitments are confirmed yet (logo, voice, and identity are undecided).

## Evidence on Hand
- README.md feature list; assets/demo.gif.
- No testimonials, user counts, benchmarks, or press exist. Don't invent any.

## Product Principles
1. Private by construction: nothing leaves the machine, ever.
2. Instant: from paste to result with no waiting and minimal steps.
3. One place: consistent behavior across every tool so learning one teaches all.
4. Craft matters: it should look and feel good, because developers use it daily.
