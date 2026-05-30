/**
 * Privacy Policy and Terms of Service screens.
 *
 * Body-only — the surrounding shell/header lives wherever they're mounted
 * (SettingsScreen's page stack for the signed-in flow, or an inline modal
 * inside OnboardingScreen for the signup-time acknowledgement).
 *
 * The text below is the operating policy for WUD. It is written to satisfy
 * the App Store Review Guidelines (5.1 Legal), the Protection of Personal
 * Information Act 4 of 2013 ("POPIA") under South African law, and the
 * baseline disclosures users reasonably expect. It is not legal advice —
 * have a South African attorney review before any major release.
 */

const EFFECTIVE_DATE = '2026-05-30';

/* ─────────────────────────── Privacy Policy ─────────────────────────── */

export function PrivacyBody() {
  return (
    <LegalLayout effective={`Effective: ${EFFECTIVE_DATE}`}>
      <Section title="Overview">
        WUD ("WUD", "we", "us") is a social planning app that lets you share
        what you're doing with friends. This Privacy Policy explains what
        personal information we collect, why we collect it, how we use it,
        with whom we share it, and the choices you have. It applies to your
        use of the WUD mobile app and any related services.
      </Section>

      <Section title="Who is responsible">
        WUD is operated from the Republic of South Africa. For the purposes
        of POPIA, WUD is the Responsible Party for personal information
        processed through the app. You can reach us at{' '}
        <a className="text-rose-300 underline" href="mailto:adam@lieberman.co.za">adam@lieberman.co.za</a>.
      </Section>

      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><b>Account info</b> — name, handle, profile photo, date of birth, email address, and (if you sign in with Apple or Google) a federated identifier from that provider.</li>
          <li><b>Phone number (optional)</b> — if you add one in onboarding or Edit profile. We store the normalized number plus a salted one-way hash. The raw number is never shown to other users; the hash is only used to match against contact lookups.</li>
          <li><b>Content you create</b> — plans, RSVPs, reactions, floats, chat messages, photos, and squad memberships.</li>
          <li><b>Social graph</b> — your friends, blocked users, friend requests sent and received.</li>
          <li><b>Device + diagnostic data</b> — app version, device model, OS version, crash reports, and (with your permission) a push notification token.</li>
          <li><b>Permission-gated data</b> — if you grant the relevant permission: camera and photo library access for uploads, and email addresses + phone numbers from your device contacts (only used to find friends already on WUD; contact entries you don't match are processed in memory and not stored).</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To run the service — show your plans to the audience you choose, deliver in-app and push notifications, sync chat messages.</li>
          <li>To keep you safe — apply blocks, action user reports, prevent spam and abuse.</li>
          <li>To diagnose and fix problems — review crash logs and server logs.</li>
          <li>To communicate with you about your account or material changes to the service.</li>
        </ul>
        We do not sell your personal information, and we do not use it for
        third-party advertising.
      </Section>

      <Section title="Who we share it with">
        Plans, floats, and chat messages are visible only to the audience
        you choose per item (the host, friends you select, friends-of-friends
        if you allow it, or specific squads). Beyond that audience, we share
        personal information only with:
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li><b>Hosting infrastructure</b> — Render (United States) hosts our backend and database.</li>
          <li><b>Authentication</b> — Firebase Authentication (Google LLC) verifies sign-in with Apple, Google, or email and password.</li>
          <li><b>Push delivery</b> — Firebase Cloud Messaging (Google LLC) and Apple Push Notification service deliver notifications to your device.</li>
          <li><b>Law enforcement</b> — when required by valid legal process and only to the extent we are legally compelled.</li>
        </ul>
        These providers act as Operators (under POPIA) or Processors (under
        equivalent foreign law) and are contractually bound to handle data
        only on our instructions.
      </Section>

      <Section title="Where we store it + cross-border transfer">
        Our database is hosted by Render in the United States. Push tokens
        and authentication metadata are processed by Google's global
        Firebase infrastructure. By using WUD you consent to your personal
        information being transferred to and stored in jurisdictions
        outside South Africa for the purposes set out above.
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Account info, plans, floats, and chat messages — until you delete the item, or until you delete your account.</li>
          <li>Deleted accounts — purged from the active database immediately; copies in encrypted backups roll off within 30 days.</li>
          <li>Diagnostic and server logs — retained for up to 30 days.</li>
          <li>Push tokens — pruned automatically when the device de-registers or the OS reports the token as invalid.</li>
        </ul>
      </Section>

      <Section title="Your rights (POPIA)">
        POPIA gives you the right to:
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>Know what personal information we hold about you and how it's processed.</li>
          <li>Request a copy of your personal information.</li>
          <li>Correct or update information that is wrong.</li>
          <li>Object to processing, or request that we delete or destroy your information.</li>
          <li>Complain to the Information Regulator of South Africa if you believe we have not handled your information lawfully (<a className="text-rose-300 underline" href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>).</li>
        </ul>
        You can exercise most of these rights directly in Settings → Edit
        profile and Settings → Delete account, or by emailing{' '}
        <a className="text-rose-300 underline" href="mailto:adam@lieberman.co.za">adam@lieberman.co.za</a>.
      </Section>

      <Section title="Children">
        WUD is not directed at children under 13, and we do not knowingly
        collect personal information from anyone under 13. Accounts that
        indicate an age under 13 at signup are refused. If you believe a
        child under 13 has provided us with personal information, contact us
        and we will delete it.
      </Section>

      <Section title="Security">
        We use industry-standard measures — encrypted transport (TLS),
        password hashing, signed access tokens, and access controls on our
        infrastructure — to protect your information. No system is perfect;
        if a breach affects your personal information we will notify you and
        the Information Regulator in accordance with POPIA.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy from time to time. If we make a material
        change we will notify you in-app or by email before the change takes
        effect. The "Effective" date above always reflects the latest
        version.
      </Section>

      <Section title="Contact">
        Questions, requests, or complaints:{' '}
        <a className="text-rose-300 underline" href="mailto:adam@lieberman.co.za">adam@lieberman.co.za</a>
      </Section>
    </LegalLayout>
  );
}

/* ─────────────────────────── Terms of Service ─────────────────────────── */

export function TermsBody() {
  return (
    <LegalLayout effective={`Effective: ${EFFECTIVE_DATE}`}>
      <Section title="Acceptance">
        By creating an account or using WUD, you agree to these Terms of
        Service and to our Privacy Policy. If you don't agree, don't use the
        app.
      </Section>

      <Section title="Eligibility">
        You must be at least 13 years old to use WUD. You are responsible
        for the security of your account and for activity that happens
        under it. You agree to provide accurate information when you sign
        up and to keep it current.
      </Section>

      <Section title="Your account">
        You sign in with Apple, Google, or email and password. You may not
        share your account or use someone else's. We may suspend or
        terminate accounts that violate these Terms, with or without
        notice.
      </Section>

      <Section title="Acceptable use">
        You agree not to use WUD to:
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>Harass, threaten, impersonate, dox, or stalk any person.</li>
          <li>Post hate speech or content that incites violence.</li>
          <li>Post sexual content involving minors, or any other content that is illegal in South Africa or in your jurisdiction.</li>
          <li>Spam, scrape, or interfere with the service or with other users.</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code from the app, except to the extent that applicable law expressly permits.</li>
        </ul>
        WUD enforces a zero-tolerance policy for objectionable content and
        abusive users. Reports are reviewed and actioned, typically within
        24 hours.
      </Section>

      <Section title="Your content">
        You keep ownership of the content you post. You grant WUD a
        worldwide, non-exclusive, royalty-free licence to host, store,
        reproduce, display, and transmit your content as needed to operate
        the service for you and the audience you choose. You represent that
        you have the rights to the content you post and that it does not
        infringe anyone else's rights.
      </Section>

      <Section title="Reports, blocks, and moderation">
        Any user can report another user or any content from inside the
        app, and block any user. We review reports and may remove content
        or restrict accounts at our discretion to keep the service safe.
      </Section>

      <Section title="Termination">
        You can delete your account at any time from Settings → Delete
        account. Deletion permanently erases your profile, plans, floats,
        squads, chat messages, and uploads. We may suspend or terminate
        accounts that violate these Terms, fail to verify their email, or
        remain inactive for an extended period.
      </Section>

      <Section title="Disclaimers">
        The service is provided "as is" and "as available". To the maximum
        extent permitted by South African law, WUD disclaims all warranties,
        whether express, implied, statutory, or otherwise. We do not
        warrant that the service will be uninterrupted, error-free, or meet
        your particular requirements.
      </Section>

      <Section title="Limitation of liability">
        To the maximum extent permitted by South African law, WUD is not
        liable for any indirect, incidental, special, consequential, or
        punitive damages, or for any loss of profits, revenue, data, or
        goodwill, arising from your use of the service. Our total
        cumulative liability for any claim relating to the service is
        limited to the amount you paid us for the service in the twelve
        months before the claim (which, for free use, is zero).
      </Section>

      <Section title="Apple App Store">
        These Terms are between you and WUD only — not with Apple Inc.
        Apple is not responsible for the app or its content. To the extent
        these Terms conflict with Apple's standard Licensed Application
        End User License Agreement, that EULA governs your use of the app.
        Apple has no obligation to provide support or maintenance for the
        app. In the event the app fails to conform to any applicable
        warranty, you may notify Apple, and Apple will refund the purchase
        price (if any); Apple has no other warranty obligation. WUD is
        responsible for addressing any claims relating to the app,
        including product-liability, regulatory, and intellectual-property
        claims. Apple and its subsidiaries are third-party beneficiaries
        of these Terms, with the right to enforce them against you.
      </Section>

      <Section title="Changes to these Terms">
        We may update these Terms from time to time. If we make a material
        change we will notify you in-app or by email before the change
        takes effect. Continuing to use WUD after a change takes effect
        means you accept the new Terms.
      </Section>

      <Section title="Governing law and jurisdiction">
        These Terms are governed by the laws of the Republic of South
        Africa. You and WUD submit to the exclusive jurisdiction of the
        courts of South Africa for any dispute arising out of or relating
        to these Terms or the service, except that either party may seek
        injunctive relief in any court of competent jurisdiction to
        protect its intellectual property.
      </Section>

      <Section title="Severability + entire agreement">
        If any provision of these Terms is found to be unenforceable, the
        remaining provisions stay in full force. These Terms, together with
        the Privacy Policy, are the entire agreement between you and WUD
        regarding the service.
      </Section>

      <Section title="Contact">
        Questions: <a className="text-rose-300 underline" href="mailto:adam@lieberman.co.za">adam@lieberman.co.za</a>
      </Section>
    </LegalLayout>
  );
}

/* ─────────────────────────── Shared layout ─────────────────────────── */

function LegalLayout({
  effective, children,
}: {
  effective: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 pt-4 pb-32">
      <div className="text-[11px] text-zinc-500 mb-4">{effective}</div>
      <div className="flex flex-col gap-5 text-[13px] leading-relaxed text-zinc-200">
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold mb-1.5">
        {title}
      </div>
      <div className="text-zinc-200">{children}</div>
    </div>
  );
}
