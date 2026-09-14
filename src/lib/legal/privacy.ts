import { brand } from "@/lib/brand";
import { legalContacts, type LegalDocument } from "@/lib/legal/shared";

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
      id: "messages",
      heading: "Messages",
      blocks: [
        {
          kind: "p",
          text: "If you use chat, we store what you send. Messages are held on our servers so that the conversation exists for the people in it, and we can read them — there is no end-to-end encryption here and you should not treat chat as private in that sense.",
        },
        {
          kind: "p",
          text: "Against each message we store the handle that sent it, the conversation it belongs to, and the time. Your name and email address are not attached to it and are never shown to another user.",
        },
        {
          kind: "p",
          text: "A message that our automatic checks refuse is never stored at all. What is stored instead is a record against your account: the rule it broke, a short extract of what you wrote, and the date the record stops counting. Only you can see that record. Reports you make, and reports made about you, are stored with them.",
        },
        {
          kind: "p",
          text: "Messages in the room open to everyone are deleted after thirty days. Messages in private conversations and groups are kept until the conversation or the account is deleted.",
        },
        {
          kind: "p",
          text: "When an account is closed, everything above goes with it: the handle, the messages, the records, the reports, and the list of who was blocked. Private conversations that account was part of are deleted for both people, because a conversation with a closed account has nobody on the other side of it.",
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
