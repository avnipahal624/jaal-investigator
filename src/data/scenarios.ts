import type { KillChainStageId } from "@/types/investigation";

/**
 * Synthetic scenario presets.
 *
 * Every value below is fabricated for demonstration. No real person,
 * organisation, phone number, URL or payment handle is contacted or verified.
 */

export type ScenarioKey =
  | "digital-arrest"
  | "job-offer"
  | "fake-parcel"
  | "account-takeover"
  | "blackmail";

export interface ScenarioTurn {
  text: string;
  stage?: KillChainStageId;
}

export interface ScenarioDefinition {
  key: ScenarioKey;
  category: string;
  title: string;
  description: string;
  badge: string;
  turns: ScenarioTurn[];
}

export const SCENARIOS: ScenarioDefinition[] = [
  {
    key: "digital-arrest",
    category: "Digital arrest scam",
    title: "Digital arrest — parcel flag",
    description:
      "A caller claims a parcel in the recipient's name contains contraband and escalates to a fake police officer demanding a refundable verification payment.",
    badge: "Authority impersonation",
    turns: [
      {
        text: "Good morning. This is the India Post parcel tracking desk. A parcel registered under your Aadhaar number contains contraband material. Your identity has been flagged.",
      },
      {
        text: "This is Inspector Anand Kumar, Cyber Crime Division. My badge ID is DEL-4492 and this interaction is being recorded for the case file. Do not disconnect.",
        stage: "authority",
      },
      {
        text: "An FIR has already been registered. If you do not cooperate, a non-bailable warrant will be issued and every bank account linked to your PAN will be frozen.",
        stage: "fear",
      },
      {
        text: "To clear your name, a refundable KYC verification amount of ₹25,000 must be deposited today. Pay to cyber.verify@jaaldemo and send the screenshot.",
        stage: "payment",
      },
      {
        text: "The verification portal is https://secure-kyc-verification.example/pay. Complete it in the next 10 minutes or the arrest order is dispatched.",
        stage: "exploit",
      },
    ],
  },
  {
    key: "job-offer",
    category: "Job scam",
    title: "Fast-track job offer — registration fee",
    description:
      "A recruiter offers an unusually fast interview, moves the conversation to a messaging app and asks for a registration payment before any employment paperwork.",
    badge: "Fake recruiter",
    turns: [
      {
        text: "Hi, I found your profile for a work-from-home data role. The package is ₹45,000 per month and the interview is today only. Are you interested?",
      },
      {
        text: "I'm Priya from TalentBridge Solutions. We recruit for an international client. Please continue on WhatsApp so our HR team can verify you quickly.",
        stage: "authority",
      },
      {
        text: "Your profile is shortlisted. The slot closes in 20 minutes and there are three other candidates waiting for the same position.",
        stage: "fear",
      },
      {
        text: "Before onboarding, pay a refundable ₹1,999 registration fee to talentbridge.hr@jaaldemo. It covers your background verification and laptop kit.",
        stage: "payment",
      },
      {
        text: "Use this onboarding link and upload the payment receipt: https://talentbridge-jobs.example/verify. Do not contact the client directly — all offers go through me.",
        stage: "exploit",
      },
    ],
  },
  {
    key: "fake-parcel",
    category: "Fake parcel/delivery scam",
    title: "Held parcel — delivery fee",
    description:
      "A delivery message claims a parcel is held and asks for a small fee through a link, then escalates with a fake support number.",
    badge: "Delivery phishing",
    turns: [
      {
        text: "Your parcel is held at our hub because the address is incomplete. A ₹25 redelivery fee is pending. Track it here: https://parcel-redelivery.example/track",
      },
      {
        text: "This is customer support for SwiftShip Couriers. Your consignment ID is SS-884129. We attempted delivery twice and the parcel will be returned tomorrow.",
        stage: "authority",
      },
      {
        text: "If the fee is not paid in the next 30 minutes the parcel is returned to the sender and the refund will take 15 working days.",
        stage: "fear",
      },
      {
        text: "Pay the redelivery fee to swiftship.support@jaaldemo and send the receipt. Or call our priority desk on +91 90000 11223.",
        stage: "payment",
      },
      {
        text: "Open the tracking link and enter your address and card details for the ₹25 verification. Our system does not store the card.",
        stage: "exploit",
      },
    ],
  },
  {
    key: "account-takeover",
    category: "Account takeover/OTP scam",
    title: "Bank support — one-time code request",
    description:
      "A caller claims to be bank support, says the account is compromised and asks for the one-time code to secure it.",
    badge: "OTP theft",
    turns: [
      {
        text: "This is a security alert from your bank. A new device attempted a ₹18,500 transfer from your account. Did you authorise it?",
      },
      {
        text: "I'm Rohit from the fraud response team. Your case reference is FR-55291. I can block the device, but I need to verify you first.",
        stage: "authority",
      },
      {
        text: "The transfer is still pending. If we don't cancel it in the next five minutes, the money leaves your account and cannot be reversed.",
        stage: "fear",
      },
      {
        text: "A six-digit verification code has been sent to your phone. Read it to me now so I can cancel the transfer and secure the account.",
        stage: "payment",
      },
      {
        text: "Do not open the banking app while I am on the line. Share the code immediately or the fraud team will close the case as customer-authorised.",
        stage: "exploit",
      },
    ],
  },
  {
    key: "blackmail",
    category: "Sextortion/blackmail",
    title: "Private-photo blackmail demand",
    description:
      "A person threatens to share private material unless a payment is made. The demo contains no imagery and the sensitive excerpt is hidden by default.",
    badge: "Coercion",
    turns: [
      {
        text: "I have private photos of you. I will send them to your contacts unless you reply.",
        stage: "contact",
      },
      {
        text: "I know where you work and I have your family's numbers. You have one hour to respond.",
        stage: "fear",
      },
      {
        text: "Pay ₹20,000 and I will delete everything. Do not tell anyone or I will post the images tonight.",
        stage: "payment",
      },
      {
        text: "Send the money to private.settle@jaaldemo and screenshot the confirmation. After that I will remove the files.",
        stage: "payment",
      },
      {
        text: "This is your final warning. Pay now or the first set of images goes out in ten minutes.",
        stage: "exploit",
      },
    ],
  },
];

const BY_KEY = new Map(SCENARIOS.map((scenario) => [scenario.key, scenario]));

export function getScenario(key: string | null | undefined): ScenarioDefinition | undefined {
  return key ? BY_KEY.get(key as ScenarioKey) : undefined;
}

export function scenarioKeyForCategory(category: string): ScenarioKey {
  const match = SCENARIOS.find((scenario) => scenario.category === category);
  return match?.key ?? "digital-arrest";
}

export function scenarioTurn(
  key: string | null | undefined,
  cursor: number,
): ScenarioTurn | null {
  const scenario = getScenario(key);
  if (!scenario) return null;
  return scenario.turns[cursor] ?? null;
}

export function isScenarioExhausted(
  key: string | null | undefined,
  cursor: number,
): boolean {
  const scenario = getScenario(key);
  if (!scenario) return true;
  return cursor >= scenario.turns.length;
}
