// 7 pages, each with its own suggested questions.
// The key (e.g. "intro", "login") is passed in by the host site.
// "default" is a fallback if the page id is missing or unknown.
export const QUESTIONS_BY_PAGE = {
  default: [
    "What is a Dropline Overdraft (OD)?",
    "How is a Dropline OD different from a normal Overdraft?",
    "What are the benefits of this product?",
    "How is interest charged?",
    "How do I contact support?",
  ],

  // Page 1 – Introduction
  intro: [
    "What is a Dropline Overdraft (OD)?",
    "How is a Dropline OD different from a normal Overdraft?",
    "What are the benefits of this product?",
    "Is this an unsecured loan?",
    "What is the maximum credit limit available?",
    "How is interest charged?",
    "What is a reducing dropline structure?",
  ],

  // Page 2 – Login
  login: [
    "I forgot my password/PIN. What should I do?",
    "Is my login secure?",
    "Can I log in using my Account Number?",
    "What happens after I log in?",
  ],

  // Page 3 – Policy Confirmation
  policy: [
    "What am I agreeing to?",
    "Can I read the policy later?",
    "Does accepting the policy activate my facility?",
    "Can I cancel after accepting the policy?",
    "What happens after clicking Continue?",
  ],

  // Page 4 – Offer Details
  offer: [
    "What is the interest rate?",
    "What is the processing fee?",
    "What is the tenure?",
    "What is facility validity?",
    "Can I change my sanctioned amount?",
    'What does "Reducing Dropline" mean?',
  ],

  // Page 5 – KFS + MITC + Aadhaar E-sign
  esign: [
    "What is the Key Fact Statement (KFS)?",
    "What is MITC?",
    "Why do I need OTP verification?",
    "I didn't receive my OTP. What should I do?",
    "What happens after successful E-sign?",
    "Can I download the KFS and MITC later?",
  ],

  // Page 6 – Congratulations
  congrats: [
    "Has my Dropline OD been activated?",
    "When can I start using my facility?",
    "Can I download my sanction letter?",
    "What should I do next?",
    "Where can I see my available limit?",
    "Will I receive a confirmation email?",
    "When will interest start getting charged?",
    "Can I start using the OD immediately?",
  ],

  // Page 7 – Dashboard
  dashboard: [
    "What is my Available Limit?",
    "What is my Utilized Amount?",
    "Why has my Available Limit reduced?",
    "What is Accrued Interest?",
    "How is my interest calculated?",
    "What is the Next Interest Debit Date?",
    "How do I repay my Dropline OD?",
    "How do I renew my facility?",
    "Can I download my sanction letter again?",
    "How do I close my Dropline OD?",
  ],
};