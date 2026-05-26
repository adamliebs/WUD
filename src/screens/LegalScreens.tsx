/**
 * Placeholder Privacy / Terms screens.
 *
 * Body-only — the surrounding shell/header lives wherever they're mounted
 * (SettingsScreen's page stack for the signed-in flow, or an inline modal
 * inside OnboardingScreen for the signup-time acknowledgement). This keeps
 * the legal copy in one place and avoids re-implementing the chrome twice.
 *
 * Apple's App Store Connect submission flow requires a Privacy Policy URL
 * and the app itself needs in-app surfaces (or links) that users can reach
 * without leaving the app. The text below is a starting point — REPLACE the
 * copy with legally-reviewed language before submitting, and host a public
 * version too (link it from App Store Connect).
 */

/* ─────────────────────────── Privacy Policy ─────────────────────────── */

export function PrivacyBody() {
  return (
    <LegalLayout effective="Effective: 2026-01-01" needsLegalReview>
        <Section title="Overview">
          WUD ("we", "the app") helps you discover and coordinate plans with
          friends. This policy describes what we collect, why, and your choices.
        </Section>
        <Section title="What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Account info: name, handle, profile photo, date of birth, email.</li>
            <li>Content you create: plans, RSVPs, chat messages, photos.</li>
            <li>Device + diagnostic data: app version, crash logs, push tokens.</li>
            <li>If you grant permission: camera, photo library access for uploads.</li>
          </ul>
        </Section>
        <Section title="How we use it">
          To run the service — show your plans to friends you choose, deliver
          notifications, prevent abuse, keep the app working. We do not sell
          your data.
        </Section>
        <Section title="Sharing">
          Plans and messages are visible only to the audience you set per plan
          (friends, friends-of-friends, or specific squads). We share data with
          service providers strictly to operate the app (e.g. push delivery).
        </Section>
        <Section title="Your choices">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Edit or delete your profile in Settings → Edit profile.</li>
            <li>Block another user from any plan they're hosting.</li>
            <li>Delete your account from Settings → Delete account — erases your
                profile, plans, squads, messages, and uploads.</li>
          </ul>
        </Section>
        <Section title="Children">
          WUD is not for users under 13. Accounts indicating an age under 13 are
          refused at signup.
        </Section>
        <Section title="Contact">
          Questions: <a className="text-rose-300 underline" href="mailto:privacy@wud.app">privacy@wud.app</a>
        </Section>
      </LegalLayout>
  );
}

/* ─────────────────────────── Terms of Service ─────────────────────────── */

export function TermsBody() {
  return (
    <LegalLayout effective="Effective: 2026-01-01" needsLegalReview>
        <Section title="Acceptance">
          By creating an account or using WUD, you agree to these Terms. If you
          don't agree, don't use the app.
        </Section>
        <Section title="Eligibility">
          You must be at least 13 years old. You're responsible for the security
          of your account and for activity that happens under it.
        </Section>
        <Section title="Acceptable use">
          You agree not to use WUD to harass, threaten, impersonate, post hate
          speech, share sexual content, post illegal content, spam, or interfere
          with the service. We may suspend or terminate accounts that violate
          these terms, with or without notice.
        </Section>
        <Section title="Your content">
          You keep ownership of content you post. You grant us a limited licence
          to store, display, and transmit it as needed to operate WUD. Reports
          of objectionable content are reviewed by a moderator and we may
          remove content at our discretion.
        </Section>
        <Section title="Termination">
          You can delete your account any time from Settings → Delete account.
          We may suspend or terminate accounts that violate these terms.
        </Section>
        <Section title="Disclaimers">
          The service is provided "as is." To the extent permitted by law, WUD
          disclaims warranties and is not liable for indirect or incidental
          damages arising from your use of the app.
        </Section>
        <Section title="Contact">
          Questions: <a className="text-rose-300 underline" href="mailto:hello@wud.app">hello@wud.app</a>
        </Section>
      </LegalLayout>
  );
}

/* ─────────────────────────── Shared layout ─────────────────────────── */

function LegalLayout({
  effective, needsLegalReview, children,
}: {
  effective: string;
  needsLegalReview?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 pt-4 pb-32">
      {needsLegalReview && (
        // Tiny visible reminder so we don't forget to swap this before shipping
        // a public build. Strip the banner once the real copy lands.
        <div className="mb-4 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200">
          Placeholder copy — replace with legally-reviewed text before shipping.
        </div>
      )}
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
