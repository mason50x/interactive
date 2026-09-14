import { brand } from "@/lib/brand";
import { legalContacts, type LegalDocument } from "@/lib/legal/shared";

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
            "reverse-engineer third-party components except as permitted by their licenses or applicable law; this does not restrict rights granted under the open-source licenses for our application code",
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
      id: "chat",
      heading: "Talking to other people",
      blocks: [
        {
          kind: "p",
          text: "The Service includes chat: a room open to everyone with an account, private messages between two people, and groups. You choose a handle when you first use it, and that handle is the only thing other people see. Your name and your email address are not shown to anyone.",
        },
        { kind: "p", text: "In chat you agree not to:" },
        {
          kind: "list",
          items: [
            "use slurs, or attack anyone for their race, religion, nationality, disability, sex, gender, or sexuality",
            "post sexual content of any kind, or approach anyone sexually",
            "threaten anyone, or tell anyone to hurt or kill themselves",
            "harass anyone, follow them between conversations, or organise anyone else to",
            "share contact details, links, addresses, phone numbers, or handles for other platforms, whether your own or anybody else's",
            "impersonate another person, or pick a handle intended to be mistaken for one",
            "flood, spam, or send the same message to several conversations",
            "attempt to evade any of the above by disguising what you have written",
          ],
        },
        {
          kind: "p",
          text: "Every message is checked automatically before it is sent, and a message that breaks these rules is refused and never stored. Refusals are recorded against your account and expire after thirty days. Enough of them mutes your account for a period that lifts by itself; the most serious of them close your account permanently and immediately.",
        },
        {
          kind: "p",
          text: "This is done by a program. No person reviews it, there is no moderation queue, and there is no appeal. You can see everything currently recorded against your account, the rule each entry relates to, and the date each one stops counting, at any time from within chat.",
        },
        {
          kind: "p",
          text: "You can report a message and you can block an account. A report is counted, weighted by your own record, and acted on automatically when enough separate people report the same message; it is not read by anyone. Reports alone will never close an account. Blocking is immediate and needs no reason.",
        },
        {
          kind: "p",
          text: "We may remove any message, hide any message that has been reported, and close any account, without notice. Groups you create are yours to run: you may invite, admit, remove, and promote people within them, and that power reaches no further than the group itself.",
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
