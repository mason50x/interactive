/**
 * The two legal documents, as data.
 *
 * They live here for the same reason the marketing copy lives in
 * `content.ts` — so the words can be revised without touching the layout
 * that sets them — but they carry one thing marketing copy does not: a
 * clause is a promise, and a page that renders a promise it invented would
 * be worse than no page. So the renderer has no prose of its own. Every
 * sentence a reader sees is in this file.
 *
 * Two rules held throughout, both of them load-bearing:
 *
 *   1. Nothing here identifies a person. The operator is "we"; the
 *      addresses are roles on the brand domain, not anyone's mailbox.
 *   2. Nothing here claims a compliance status the Service does not have.
 *      A false certification is not a shield — it is the thing a school's
 *      lawyer reads back to you. The protection in these documents comes
 *      from the clauses that are *true*: no affiliation, no institutional
 *      contract by osmosis, no education records held, and the network's
 *      own rules being a matter between the reader and their network.
 */

import { brand } from "@/lib/brand";

/** Role addresses. Deliberately not a person, on any of these. */
export const legalContacts = {
  privacy: `privacy@${brand.domain}`,
  legal: `legal@${brand.domain}`,
  copyright: `copyright@${brand.domain}`,
} as const;

/**
 * Both documents carry the same date, because they were written together
 * and a reader comparing them should not have to wonder which is current.
 */
export const LEGAL_UPDATED = "2026-08-31";

/** `YYYY-MM-DD` rendered the way a reader reads it, in a fixed zone so the
 *  server and the browser cannot disagree about which day it is. */
export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A paragraph, or a list of points under the paragraph before it.
 *
 * There is no heading block and no callout block on purpose. A legal
 * document that emphasises three of its clauses has told the reader the
 * other forty do not matter, and an emphasised clause is the first one a
 * court reads as the whole agreement. Everything here is set at one weight.
 */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: readonly string[] };

export type LegalSection = {
  /** The fragment this section answers to, so a clause can be linked. */
  id: string;
  heading: string;
  blocks: readonly LegalBlock[];
};

export type LegalDocument = {
  title: string;
  /** Shown under the title, unnumbered, and part of the agreement. */
  lede: string;
  sections: readonly LegalSection[];
};

export const terms: LegalDocument = {
  title: "Terms of Service",
  lede: `These terms are the agreement between you and ${brand.name} for your use of this site and everything on it. By creating an account or using the Service you accept them. If you do not accept them, do not use the Service.`,
  sections: [
    {
      id: "the-service",
      heading: "What the Service is",
      blocks: [
        {
          kind: "p",
          text: `${brand.name} provides access to interactive activities and learning material made available through the Service. What is available changes over time. We add things, remove things, and change how they work, without being obliged to keep any particular activity available.`,
        },
        {
          kind: "p",
          text: "The Service is provided for personal, non-commercial use. It is not a course, a curriculum, a tutoring service, or a substitute for instruction, and completing anything on it does not earn credit, certification, or any qualification.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "Who may use it",
      blocks: [
        {
          kind: "p",
          text: "You must be at least 13 years old to use the Service. If you are between 13 and 18, or under the age of majority where you live, you may use the Service only with the agreement of a parent or legal guardian who accepts these terms on your behalf and takes responsibility for your use of it.",
        },
        {
          kind: "p",
          text: "The Service is not directed to children under 13, and we do not knowingly permit them to create accounts. If we learn that an account belongs to someone under 13, we close it and delete the information held for it.",
        },
        {
          kind: "p",
          text: "Accounts are personal and are created by invitation. One account belongs to one person. Do not share your account, your password, or your invitations with anyone you are not willing to be responsible for, because everything done through your account is treated as done by you.",
        },
      ],
    },
    {
      id: "invitations",
      heading: "Invitations",
      blocks: [
        {
          kind: "p",
          text: "Each account can invite a limited number of other people. An invitation is sent to an email address you supply, which means you are handing us someone else's address: only invite people who would expect to hear from you, and only at an address you have a reason to use.",
        },
        {
          kind: "p",
          text: "We may withdraw unspent invitations, refuse to send one, or revoke one that has already been sent, at our discretion and without notice.",
        },
      ],
    },
    {
      id: "your-network",
      heading: "Where you use it, and whose rules apply there",
      blocks: [
        {
          kind: "p",
          text: "The Service is available over the public internet. Whether you are permitted to reach it from a particular network or on a particular device is a separate question, and it is yours to answer before you do.",
        },
        {
          kind: "p",
          text: "Networks and devices belonging to schools, districts, universities, employers, libraries, and public providers are usually governed by rules of their own: acceptable-use policies, filtering and monitoring, device-management profiles, and codes of conduct. Those rules are an agreement between you and whoever runs that network or issued that device. They are not ours.",
        },
        {
          kind: "p",
          text: "Nothing in these terms and nothing on the Service grants you permission that the operator of your network or the owner of your device has not given you. We do not interpret, waive, override, or vouch for anyone else's policy, and access to the Service is not evidence that using it is permitted where you are.",
        },
        {
          kind: "p",
          text: "You are responsible for what follows from your own use of the Service on a network or device you do not control. That includes any loss of access, any disciplinary or employment consequence, any action taken by an institution or its administrators, and any device or account restriction imposed on you. We are not a party to any of it.",
        },
        {
          kind: "p",
          text: "We do not undertake to keep the Service reachable from any particular network, and we may be blocked, filtered, or made unavailable at any time by someone other than us. That is outside our control and is not a failure to provide the Service.",
        },
      ],
    },
    {
      id: "no-affiliation",
      heading: "We are independent of any institution",
      blocks: [
        {
          kind: "p",
          text: `${brand.name} is operated independently. We are not affiliated with, endorsed by, sponsored by, accredited by, approved by, or acting on behalf of any school, school district, university, education authority, examination board, employer, or government body.`,
        },
        {
          kind: "p",
          text: "Nothing on the Service is a representation that any institution has reviewed, approved, adopted, licensed, or procured it. Where the Service is described in the language of learning, that describes what it is for, not an endorsement by anyone.",
        },
        {
          kind: "p",
          text: "No contract arises between us and an institution because a student, teacher, or member of staff uses the Service. An individual account is not an institutional account. An institution's own policies, procurement terms, vendor agreements, data-processing addenda, purchase orders, and terms of business do not bind us, and are of no effect against us, unless we have signed them.",
        },
        {
          kind: "p",
          text: "You may not present the Service to anyone as approved by, affiliated with, supplied by, or required by a school, employer, or any other institution.",
        },
      ],
    },
    {
      id: "not-a-school-official",
      heading: "We hold no education records",
      blocks: [
        {
          kind: "p",
          text: "We provide the Service directly to individuals who sign up for themselves. We do not act as a school official, do not perform any institutional function on anyone's behalf, and do not receive, create, hold, or maintain education records or student information on behalf of an institution.",
        },
        {
          kind: "p",
          text: "We offer no rostering, no cohort administration, no reporting to administrators, and no oversight tools of any kind, and we are not a party to any student-data agreement unless one has been separately signed by us.",
        },
        {
          kind: "p",
          text: "Where a law governing student records or children's privacy applies to an institution's own use of an online service, meeting it is that institution's responsibility, and an institution that requires such an arrangement should not direct anyone to use the Service without one.",
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        { kind: "p", text: "You agree not to:" },
        {
          kind: "list",
          items: [
            "use the Service where you are not permitted to use it, or in any way that breaks a law that applies to you",
            "use another person's account, sell or transfer your own, or resell or commercialise access to the Service",
            "probe, scan, or test the security of the Service, or defeat, work around, or interfere with any limit, gate, or protection built into it",
            "access the Service by automated means, scrape it, or copy any substantial part of it",
            "reverse-engineer, decompile, or attempt to derive the source of the Service, except where a law gives you a right that cannot be waived",
            "upload, submit, or transmit anything unlawful, infringing, malicious, or harmful to other people",
            "misrepresent who you are, how old you are, or your relationship to us or to any institution",
            "interfere with anyone else's use of the Service, or place an unreasonable load on it",
          ],
        },
        {
          kind: "p",
          text: "We may investigate suspected breaches and take any step we consider appropriate, including removing material, suspending or closing accounts, and reporting conduct to the authorities where we are required to.",
        },
      ],
    },
    {
      id: "content",
      heading: "Content and ownership",
      blocks: [
        {
          kind: "p",
          text: `The Service, and the design, text, graphics, and software that make it up, belong to us or to our licensors and are protected by intellectual property law. You get permission to use the Service personally, for as long as these terms are kept. Nothing else is granted.`,
        },
        {
          kind: "p",
          text: "Some activities available through the Service are the work of third parties and remain the property of their owners. Product names, titles, characters, logos, and trademarks that appear are the property of their respective owners, and their appearance is not a claim of ownership by us, nor an indication of affiliation, sponsorship, or endorsement by them.",
        },
        {
          kind: "p",
          text: "Third-party material is made available as we find it, and we do not warrant that any of it is free of the rights of others.",
        },
      ],
    },
    {
      id: "copyright",
      heading: "Copyright complaints",
      blocks: [
        {
          kind: "p",
          text: `If you own rights in material available through the Service and believe it is there without authorisation, write to ${legalContacts.copyright} and we will act on it.`,
        },
        { kind: "p", text: "Please include:" },
        {
          kind: "list",
          items: [
            "identification of the work you say has been infringed",
            "identification of the material you are complaining about, and where on the Service it can be found",
            "contact details we can reach you at",
            "a statement that you believe in good faith that the use is not authorised by the owner, its agent, or the law",
            "a statement that the information in your notice is accurate, and that you are the owner or authorised to act for the owner",
            "your signature, electronic or physical",
          ],
        },
        {
          kind: "p",
          text: "We remove or disable material where a notice warrants it, and we close the accounts of repeat infringers. If material of yours was removed and you believe that was wrong, write to the same address and say so.",
        },
      ],
    },
    {
      id: "availability",
      heading: "Availability, suspension, and ending your access",
      blocks: [
        {
          kind: "p",
          text: "The Service is offered as it is and as it happens to be available. We do not promise it will be uninterrupted, error-free, secure, or available at any particular time, and we may change, suspend, or discontinue any part of it, or all of it, at any time and without notice.",
        },
        {
          kind: "p",
          text: "We may suspend or close your account at any time, with or without reason and with or without notice, including at the request of a rights holder or the operator of a network. You may stop using the Service and close your account whenever you like.",
        },
        {
          kind: "p",
          text: "When an account is closed, the material it held may be deleted and cannot be recovered. The sections of these terms which by their nature should survive the end of your access do survive it.",
        },
      ],
    },
    {
      id: "no-warranty",
      heading: "No warranties",
      blocks: [
        {
          kind: "p",
          text: 'The Service is provided "as is" and "as available", without warranty of any kind. To the fullest extent the law allows, we disclaim all warranties, express or implied, including any implied warranty of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, and any warranty arising from a course of dealing or usage of trade.',
        },
        {
          kind: "p",
          text: "In particular, we make no promise that the Service will improve any academic result, teach anything correctly, meet any curriculum or standard, be suitable for any assignment, classroom, or age group, or be appropriate for any purpose an institution might have. Nothing on the Service is professional, educational, medical, legal, or financial advice.",
        },
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      blocks: [
        {
          kind: "p",
          text: "To the fullest extent the law allows, we are not liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of data, goodwill, opportunity, standing, or profits, arising out of or connected with your use of the Service, however caused and on any theory of liability.",
        },
        {
          kind: "p",
          text: "This includes, without limiting it, any consequence arising from a school, employer, network operator, or other institution restricting your access, disciplining you, or taking any other action in connection with your use of the Service.",
        },
        {
          kind: "p",
          text: "To the fullest extent the law allows, our total liability for all claims relating to the Service is limited to the greater of the amount you paid us for the Service in the twelve months before the claim arose, or one hundred United States dollars.",
        },
        {
          kind: "p",
          text: "Some jurisdictions do not allow certain exclusions or limitations, so parts of this section may not apply to you. Where that is so, the exclusions and limitations apply to the greatest extent permitted.",
        },
      ],
    },
    {
      id: "indemnity",
      heading: "Indemnity",
      blocks: [
        {
          kind: "p",
          text: "You agree to indemnify and hold us harmless from any claim, demand, loss, liability, and expense, including reasonable legal fees, arising out of your use of the Service, your breach of these terms, your breach of any rule or policy of a network, device owner, or institution, or your infringement of anyone's rights.",
        },
      ],
    },
    {
      id: "law",
      heading: "Governing law and disputes",
      blocks: [
        {
          kind: "p",
          text: "These terms are governed by the laws of the State of [STATE], United States, without regard to its conflict of laws rules, and you and we submit to the exclusive jurisdiction of the state and federal courts located there.",
        },
        {
          kind: "p",
          text: "Any claim relating to the Service must be brought within one year after it arises, or it is permanently barred, to the extent the law allows such a limit. You and we agree that claims will be brought individually, and not as a plaintiff or class member in any class or representative proceeding.",
        },
      ],
    },
    {
      id: "general",
      heading: "The rest",
      blocks: [
        {
          kind: "p",
          text: "We may change these terms. When we do, we change the date at the top, and continuing to use the Service after that is your acceptance of the revised terms. If a change is one you do not accept, stop using the Service.",
        },
        {
          kind: "p",
          text: "If any part of these terms is found unenforceable, the rest stays in force. Our not enforcing a provision is not a waiver of it. These terms, with the privacy policy, are the whole agreement between you and us about the Service, and replace anything said before. You may not assign them; we may.",
        },
        {
          kind: "p",
          text: `Questions about these terms go to ${legalContacts.legal}.`,
        },
      ],
    },
  ],
};

export const privacy: LegalDocument = {
  title: "Privacy Policy",
  lede: `This policy describes what ${brand.name} collects, why, who it goes to, and what you can do about it. It covers the site and the signed-in app.`,
  sections: [
    {
      id: "what-we-collect",
      heading: "What we collect",
      blocks: [
        {
          kind: "p",
          text: "Your account. When you sign up we receive an account identifier, your email address, and any name and profile picture attached to the account you signed up with. Sign-up and sign-in are handled by our authentication provider, which is where your password lives — we never see it.",
        },
        {
          kind: "p",
          text: "Invitations. If you invite someone, we store the email address you gave us and whether the invitation was sent, accepted, or revoked. If you arrived by invitation, the address it was sent to is linked to your account when you sign up, which is how the person who invited you learns their invitation was used.",
        },
        {
          kind: "p",
          text: "Your settings. The choices you make in the app — the accent colour, whether the background animates, and the shortcut settings — are stored against your account so they follow you to another browser. A copy is also kept in your own browser's storage, which is what the page actually reads.",
        },
        {
          kind: "p",
          text: "Your streak. We store how many days in a row you have visited, your best run, and the date of the last one. To count a day in your own time rather than in UTC, your browser tells us its time-zone offset. We do not keep a log of individual visits.",
        },
        {
          kind: "p",
          text: "Analytics. We use Google Analytics to understand how the site is used in aggregate: pages viewed, roughly where in the world a visit came from, what kind of device and browser it was, and how visits move through the site. This is collected with cookies and is not something we use to build a profile of you as an individual.",
        },
        {
          kind: "p",
          text: "Technical records. Like any site, ours receives an IP address and browser details with each request, and our hosting and infrastructure providers keep short-lived operational logs to run the service and keep it secure.",
        },
        {
          kind: "p",
          text: "We do not collect payment details, we do not ask for your address or phone number, and we do not want documents, coursework, or anything you would mind us holding. Please do not send us any.",
        },
      ],
    },
    {
      id: "why",
      heading: "Why we collect it",
      blocks: [
        {
          kind: "list",
          items: [
            "to give you an account, sign you in, and keep you signed in",
            "to run the invitation system and count what each account has used",
            "to remember your settings and your streak",
            "to keep the Service working, diagnose faults, and protect it from abuse",
            "to understand in aggregate how the Service is used, so we can decide what to work on",
            "to meet a legal obligation where one applies to us",
          ],
        },
        {
          kind: "p",
          text: "We do not sell personal information, we do not share it for cross-context behavioural advertising, and we do not run advertising on the Service.",
        },
      ],
    },
    {
      id: "not-shared-with-institutions",
      heading: "We do not report to schools or employers",
      blocks: [
        {
          kind: "p",
          text: "We provide the Service to individuals, and an account belongs to the person who holds it. We do not give any school, district, university, employer, network operator, or other institution access to your account, your activity, your settings, your streak, or any report about your use of the Service.",
        },
        {
          kind: "p",
          text: "There is no administrator view, no institutional dashboard, no rostering, and no mechanism by which anyone can be shown what an individual has done on the Service. We do not build one on request.",
        },
        {
          kind: "p",
          text: "An institution asking us for information about a user is a third party making a request, and we treat it as one. We disclose personal information to an outside party only where we are required to by valid legal process, or where it is necessary to protect someone's safety or to establish or defend a legal claim, and then only so far as that requires.",
        },
      ],
    },
    {
      id: "what-your-network-sees",
      heading: "What we cannot make private",
      blocks: [
        {
          kind: "p",
          text: "This policy governs what we collect and what we do with it. It cannot govern what other people observe on their own equipment, and it is worth being clear about that rather than leaving you to assume otherwise.",
        },
        {
          kind: "p",
          text: "Whoever runs the network you are on — a school, an employer, an internet provider — can generally see the addresses your device connects to, whatever a site's own privacy practices are. A device that someone else owns or manages can go further: management software can record activity, capture screens, log keystrokes, and report all of it, and nothing a website does changes that.",
        },
        {
          kind: "p",
          text: "If that matters to you, the thing to understand is that it is a question about the network and the device, not about us, and we cannot answer it for you.",
        },
      ],
    },
    {
      id: "processors",
      heading: "Who else handles it",
      blocks: [
        {
          kind: "p",
          text: "We keep the list of companies involved short, and each of them handles data only to provide their part of the Service:",
        },
        {
          kind: "list",
          items: [
            "our authentication provider, which holds accounts and credentials and signs you in",
            "our database and backend platform, which stores your account record, invitations, settings, and streak",
            "our hosting and content delivery providers, which serve the site and store the files the activities are made of",
            "Google Analytics, for aggregate usage measurement",
          ],
        },
        {
          kind: "p",
          text: "These providers operate in the United States and elsewhere, so your information may be transferred to and processed in countries other than the one you live in.",
        },
      ],
    },
    {
      id: "cookies",
      heading: "Cookies and local storage",
      blocks: [
        {
          kind: "p",
          text: "Session cookies set by our authentication provider are what keep you signed in. They are necessary — without them the app cannot tell who you are.",
        },
        {
          kind: "p",
          text: "Google Analytics sets its own cookies for measurement. You can block these with a browser setting or an extension, and the Service continues to work normally without them.",
        },
        {
          kind: "p",
          text: "Your browser's local storage holds your theme and a copy of your settings, so the page can paint correctly before it has spoken to a server. Clearing your browser data clears it.",
        },
      ],
    },
    {
      id: "children",
      heading: "Children",
      blocks: [
        {
          kind: "p",
          text: "The Service is not directed to children under 13 and we do not knowingly collect personal information from them. Accounts are created by invitation and require the account holder to be 13 or older.",
        },
        {
          kind: "p",
          text: `If you believe a child under 13 has given us information, write to ${legalContacts.privacy} and we will delete the account and the information held for it.`,
        },
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      blocks: [
        {
          kind: "p",
          text: "We keep your account information for as long as your account exists. Aggregate analytics are kept according to the retention period set in the analytics service and are not tied to your identity.",
        },
        {
          kind: "p",
          text: "When your account is deleted, we delete the record we hold for it, together with your settings and the invitation records belonging to it. Deletion is not reversible and we cannot restore an account afterwards. An invitation already sitting in someone else's inbox is addressed to that person rather than to your account, and is not withdrawn by your account going away.",
        },
      ],
    },
    {
      id: "your-choices",
      heading: "Your choices and your rights",
      blocks: [
        {
          kind: "p",
          text: "You can change or clear your settings in the app at any time, correct your name and email through your account, block analytics cookies in your browser, and delete your account, which deletes what we hold for it.",
        },
        {
          kind: "p",
          text: "Depending on where you live, you may also have the right to ask what we hold about you, to have it corrected or deleted, to receive a copy of it, to object to or restrict how we use it, and not to be treated differently for exercising any of these. We do not charge for any of it and we do not require an account in good standing to honour it.",
        },
        {
          kind: "p",
          text: `To make a request, write to ${legalContacts.privacy} from the address on your account, which is how we confirm the request is yours.`,
        },
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        {
          kind: "p",
          text: "Traffic is encrypted in transit, credentials are held by our authentication provider rather than by us, and the activities themselves run on a separate origin from the app so that code inside one cannot reach your session in the other.",
        },
        {
          kind: "p",
          text: "No service can promise perfect security, and we do not. Use a password you have not used elsewhere, and tell us if you think something is wrong with your account.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: [
        {
          kind: "p",
          text: "We may update this policy. When we do, the date at the top changes, and where a change materially affects how we handle your information we will make that clear rather than relying on the date alone.",
        },
        {
          kind: "p",
          text: `Questions about this policy go to ${legalContacts.privacy}.`,
        },
      ],
    },
  ],
};
