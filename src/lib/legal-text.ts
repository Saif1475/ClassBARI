// The privacy policy and terms of use, in English and Bangla, as shown on /privacy and /terms.
// Written from what the software actually does (see ClassBARI-docs/ClassBARI-privacy-and-terms-DRAFT-v2.md for the
// notes for the lawyer). {company}, {email}… are filled in from legal-info.ts. Not legal advice: have it reviewed.
export type Block = string | { list: string[] } | { table: string[][] };
export type Section = { id: string; title: string; blocks: Block[] };
export type LegalDoc = { title: string; intro: string; sections: Section[] };

const en: { privacy: LegalDoc; terms: LegalDoc } = {
  privacy: {
    title: "Privacy policy",
    intro:
      "This policy explains what information ClassBARI collects, why, who can see it, and the choices you have. ClassBARI is run by {company}, {address}. If anything here is unclear, write to {email}.",
    sections: [
      {
        id: "who",
        title: "1. Who this policy is for",
        blocks: [
          "ClassBARI is software that coaching centres and teachers (\"institutes\") use to run their classes, on the website and in our five phone apps (Student, Guardian, Teacher, Institution and ClassBARI AI). It is used by:",
          { list: ["institute owners, managers and teachers (\"staff\");", "students, many of whom are under 18;", "guardians (parents or others responsible for a student);", "visitors to our public pages (course pages, teacher websites, join links)."] },
        ],
      },
      {
        id: "roles",
        title: "2. Our role and the institute's role",
        blocks: [
          { list: [
            "Each institute decides which students and guardians to add and what to record about them. The institute is responsible for having a lawful reason to do so and, for children, the guardian's consent.",
            "We store and process that information on the institute's behalf, only to provide ClassBARI to them. We do not use it for advertising and we never sell it.",
            "For our own customers, the owners and staff who sign up, we are responsible for their account information.",
          ] },
        ],
      },
      {
        id: "collect",
        title: "3. What we collect",
        blocks: [
          { table: [
            ["Who or what", "Information", "Why"],
            ["Staff", "Name, email, mobile number, role, salary or share figures entered by the owner. Passwords are kept only in scrambled (hashed) form by our login provider.", "Accounts, login, running the institute"],
            ["Students", "Name, Gmail address, mobile (optional), gender, date of birth, school, address and photo (optional), batch, roll number", "Enrolment, login, ID cards and reports"],
            ["Guardians", "Name, Gmail address, mobile number", "Guardian login, updates about their child, fee reminders"],
            ["Learning records", "Attendance, quiz answers and scores, homework photos and files with marks, teacher comments, report cards, practice progress, points, questions sent to teachers, how much of a video was watched", "Teaching, results, progress reports for guardians"],
            ["Fee records", "Fees due, discounts, payments recorded (amount, date, cash or bKash), receipts, bKash transaction IDs typed in for course orders", "Fee management and receipts. We never ask for or store PINs, passwords or card numbers."],
            ["Messages and community", "Messages between guardians and teachers; community posts, photos, files, polls, comments, likes, friend requests, a short profile, mute and block choices", "Communication, moderated by the institute"],
            ["AI study chat", "What a student types or attaches while it is being answered; how much of their allowance they used; their answer settings (language, length)", "Answering; keeping to the pack's limit"],
            ["Saved AI answers", "The first question of a chat and its answer, without the student's name or account", "Answering the same question for other students (section 6)"],
            ["Highlighted PDFs", "The PDF lessons a teacher uploads, the text read from them, the highlights, and a highlighted copy of the file", "Showing students the highlighted version"],
            ["Notifications", "For each phone or browser that turns notifications on: an address from Google, Apple or the browser maker to deliver them, the account it belongs to, the language, and which kinds of notifications the person switched off", "Sending notifications the person asked for"],
            ["Device and technical", "Login session, language, theme, text size, the institute chosen at login, the internet address of a request for a short time (to stop password guessing and overload)", "Staying logged in, settings, security"],
            ["Error reports", "Time, page and the error message, with emails, phone numbers and keys removed automatically", "Finding and fixing faults"],
            ["SMS log", "The number, text, time and result of each SMS an institute sends", "Daily limits and billing"],
          ] },
          "We do not use advertising trackers, and we do not sell or rent personal information.",
        ],
      },
      {
        id: "see",
        title: "4. Who can see what",
        blocks: [
          { list: [
            "Students see their own records, their own marks and their own rank, their batch's lessons and notices, and other students' name, batch and photo. They cannot see anyone else's marks, contact details, fees or answers.",
            "Guardians see only their own children's records. They do not see the community.",
            "Teachers see only the batches they teach. They do not see the institute's money or other teachers' pay.",
            "Owners and managers see their whole institute, except how each student voted in a poll and whom a student has muted or blocked.",
            "Visitors to a public course page see the course, its free preview lessons, the teacher's name, the number of students and the average mark. No student list and nobody's marks.",
            "Other institutes cannot see your institute's information.",
            "ClassBARI's own staff look at information only to give support, fix problems, review saved AI answers, or when the law requires it.",
          ] },
        ],
      },
      {
        id: "providers",
        title: "5. Companies that help us run ClassBARI",
        blocks: [
          "They receive only what they need to provide their service to us.",
          { table: [
            ["Company", "What for", "What they receive", "Where"],
            ["Supabase", "Database, logins, file storage, account emails", "The information in section 3, except what stays on your device", "Mumbai, India"],
            ["{hosting}", "Running the website", "All traffic to the website", "—"],
            ["{emailSender}", "Login codes and password-reset emails", "Email address and the code", "—"],
            ["Google", "\"Sign in with Google\"; phone notifications (Firebase Cloud Messaging)", "The Gmail address used to sign in; for notifications, the phone's notification address and the notification's title and text", "Global"],
            ["Google (Gemini), OpenAI, Anthropic, Alibaba Cloud", "AI study chat, \"Ask AI\" about a PDF, and reading and highlighting PDF lessons. Only the companies whose models we switch on", "The question and that chat's earlier messages, an attached photo or file text; for highlighting, the PDF file. Not the student's name or account, unless they type it", "USA, Singapore"],
            ["Jitsi", "Video for live classes, when used", "Video, sound and the name shown in the class", "Global"],
            ["YouTube", "Lesson videos a teacher adds from YouTube", "The viewer's internet address, as with any embedded video", "Global"],
            ["Browser makers (Google, Mozilla, Apple)", "Notifications in a browser, if turned on", "The notification's text", "Global"],
            ["SMS provider (when added)", "SMS from the institute", "Mobile number and the text", "Bangladesh"],
          ] },
          "Handwriting reading, the photo check for the community and the comparison of AI questions run on ClassBARI's own server and are not sent to anyone. Fonts come from our own site.",
        ],
      },
      {
        id: "ai",
        title: "6. AI study chat and highlighted PDFs",
        blocks: [
          { list: [
            "The AI study chat is an optional paid pack. Without a pack, a student cannot use it.",
            "What a student types and attaches is sent to the AI company whose model they picked, to get an answer. The chat itself is kept only on the student's own phone or browser, not on our server, and is removed when they log out.",
            "Saved answers: to answer faster and at lower cost, the first question of a chat and its answer may be kept on our server, without the student's name or account, and shown to another student who asks the same question. A question is not kept if it has a photo or file, is a follow-up, is long, looks personal, or the student chose their own answer language or length. An automatic check must find the answer correct and suitable first, and our staff can delete saved answers.",
            "For premium institutes, the PDF lessons teachers upload are sent to an AI company to be read and highlighted. The highlighted copy is kept with the original file.",
            "AI answers and highlights can be wrong. They help with study; they do not replace the teacher.",
          ] },
        ],
      },
      {
        id: "notifications",
        title: "7. Notifications",
        blocks: [
          "If you allow notifications, we send them about things that concern you: new homework, marks, notices, an absence, a payment, messages, and for staff questions, meetings and leave. You can switch each kind off in Settings, on the website or in the app; the choice applies to all your devices. You can also turn notifications off in your phone's or browser's settings. When you log out, that device stops getting them.",
        ],
      },
      {
        id: "keep",
        title: "8. How long we keep information",
        blocks: [
          { list: [
            "While an institute uses ClassBARI, we keep its information so the institute can use it.",
            "When an institute closes its account, it can download a backup first. We delete its information {closedAccountDays} days later, except records the law requires us to keep.",
            "When an institute removes a student or guardian, they can no longer log in. Their past records stay with the institute's records until the institute deletes them or closes its account.",
            "Saved AI answers carry no name and are kept until we delete them.",
            "Notification addresses are deleted when the person logs out or the phone stops accepting them; marks of notifications already sent, after 60 days.",
          ] },
        ],
      },
      {
        id: "children",
        title: "9. Children",
        blocks: [
          "Most students are under 18. ClassBARI is meant for students aged {minAge} and over, added by their institute with their guardian's consent. Joining through a public link asks for guardian details and waits until the institute accepts the student. In the community:",
          { list: [
            "there are no private messages between students;",
            "photos are checked automatically, and posts for unkind words; anything doubtful is hidden until a teacher approves it;",
            "students can mute, block and report; teachers can remove posts;",
            "a student can choose not to be findable by others.",
          ] },
        ],
      },
      {
        id: "security",
        title: "10. Security",
        blocks: [
          { list: [
            "All connections are encrypted (HTTPS).",
            "Every request is checked on our server, so each person can see and change only what they are allowed to. For example, a student cannot change marks or fees, and quizzes are marked on the server.",
            "Files are private: a file opens only for someone who is shown it, through a link that works for one hour.",
            "Passwords are never stored in readable form, and repeated wrong attempts are slowed down.",
            "Access to our systems is limited to the founders.",
          ] },
          "If a security incident affects your information, we will tell the affected institutes within {breachHours} hours and the authorities where the law requires.",
        ],
      },
      {
        id: "device",
        title: "11. Cookies and information kept on your device",
        blocks: [
          "We use only what is needed, and no advertising or tracking cookies: the login session, your settings (language, theme, text size, the institute you picked, rows per list), your AI chats, the last view of your dashboard so it opens at once, and changes made without a connection until they can be sent. AI chats and the last view are removed when you log out. On a shared phone or computer, always log out.",
        ],
      },
      {
        id: "rights",
        title: "12. Your rights",
        blocks: [
          "You can ask to see, correct or delete your information, or to stop optional messages. Students and guardians: ask your institute first, since it manages your records, or write to {email} and we will help. Staff and owners: write to us directly. We reply within {replyDays} days.",
        ],
      },
      {
        id: "delete-account",
        title: "13. Deleting your account",
        blocks: [
          { list: [
            "Institute owners: write to {email} from your account's email, or WhatsApp {whatsapp}, and say \"delete my institute\". Download a backup in Settings first. We delete the institute and all its information within {closedAccountDays} days.",
            "Students and guardians: ask your institute to remove you; you can then no longer log in. To have your records deleted as well, write to {email} with your Gmail and your institute's name, and we will arrange it with the institute.",
            "Teachers: ask the institute owner to remove you, or write to us.",
            "Your AI chats are on your own device only: logging out removes them.",
          ] },
        ],
      },
      {
        id: "changes",
        title: "14. Changes and contact",
        blocks: ["We post changes here and tell institute owners by email before important changes take effect. {company}, {address}, trade licence {licence} · {email} · WhatsApp {whatsapp}"],
      },
    ],
  },
  terms: {
    title: "Terms of use",
    intro: "These terms are an agreement between {company} (\"we\") and everyone who uses ClassBARI, on the website and in the apps. By using ClassBARI you agree to them.",
    sections: [
      { id: "service", title: "1. The service", blocks: ["ClassBARI is software for running classes: enrolment, attendance, lessons, tests, results, fee records, messages, notifications, a student community, an AI study chat and highlighted PDF lessons, on the web and in our apps. Some features may be in testing or switched off until we announce them."] },
      {
        id: "accounts",
        title: "2. Accounts",
        blocks: [
          { list: [
            "Institutes sign up with an email and a password.",
            "Students and guardians sign in with the Gmail their institute registered, either with \"Sign in with Google\" or with a password they create after confirming a code sent to that Gmail.",
            "Keep your login private. You are responsible for what happens under your account; tell us at once if you think someone else used it. Logging out ends the login on that device only.",
            "Owners are responsible for the staff they give access to.",
          ] },
        ],
      },
      {
        id: "institutes",
        title: "3. Institutes' responsibilities",
        blocks: [
          { list: [
            "Add only students and guardians you are allowed to, with guardian consent for children.",
            "Keep information accurate and remove people who leave.",
            "Look at community posts that wait for approval, and act on reports.",
            "You own the content you upload (lessons, notes, videos, questions) and must have the rights to it. You allow us to store it, show it to the people you choose and, for premium institutes, have it read and highlighted by an AI service, only to provide ClassBARI.",
            "Fees between guardians and institutes are between them. ClassBARI records payments but is not part of tuition agreements or refunds between a guardian and an institute.",
          ] },
        ],
      },
      { id: "use", title: "4. Acceptable use", blocks: ["Do not use ClassBARI to upload illegal, hateful, sexual or violent content; harass or bully anyone; share other people's information without permission; cheat or help others cheat; break into accounts or the service; or overload or copy the service. We may remove content and suspend accounts that break these rules."] },
      {
        id: "ai",
        title: "5. AI study chat and highlights",
        blocks: [
          { list: [
            "AI packs are optional and switched on by the institute. Each pack has its own models and an allowance that refills every 12 hours; unused allowance is not carried over.",
            "AI answers and PDF highlights are made by AI and can be wrong. Do not rely on them for exams, health, legal or money decisions without checking with your teacher.",
            "Do not type other people's personal details into the chat.",
          ] },
        ],
      },
      { id: "plans", title: "6. Plans and charges", blocks: ["Institute plans and prices are shown on our website and agreed when you choose a plan. If a payment is late, the account stays usable for 7 days and then becomes read-only until paid; we do not delete data for late payment. Prices may change with 30 days' notice."] },
      { id: "availability", title: "7. Availability and backups", blocks: ["We work to keep ClassBARI available but cannot promise it will never be interrupted. We do maintenance outside class hours where we can. Institutes should download a backup from Settings from time to time."] },
      { id: "ending", title: "8. Ending", blocks: ["You may stop using ClassBARI at any time and download your data first (see \"Deleting your account\" in the privacy policy). We may suspend or end an account that seriously or repeatedly breaks these terms, with notice where reasonable. After an account ends, its data is deleted as the privacy policy says."] },
      { id: "liability", title: "9. Liability", blocks: ["We provide ClassBARI with reasonable care. To the extent the law allows, we are not liable for indirect losses, for losses caused by wrong AI answers or highlights, or for more than the fees the institute paid us in the 3 months before the claim. Nothing in these terms limits liability that the law does not allow to be limited."] },
      { id: "law", title: "10. Law and disputes", blocks: ["These terms are governed by the laws of Bangladesh. Disputes go to the courts of {court}."] },
      { id: "contact", title: "11. Contact", blocks: ["{company}, {address} · {email} · WhatsApp {whatsapp}"] },
    ],
  },
};

const bn: typeof en = {
  privacy: {
    title: "গোপনীয়তা নীতি",
    intro: "ClassBARI কী তথ্য সংগ্রহ করে, কেন করে, কে তা দেখতে পারে এবং আপনার কী কী বেছে নেওয়ার সুযোগ আছে, এই নীতিতে তা বলা হয়েছে। ClassBARI পরিচালনা করে {company}, {address}। কিছু অস্পষ্ট লাগলে {email} ঠিকানায় লিখুন।",
    sections: [
      { id: "who", title: "১. এই নীতি কাদের জন্য", blocks: ["ClassBARI হলো একটি সফটওয়্যার, যা কোচিং সেন্টার ও শিক্ষকেরা (\"প্রতিষ্ঠান\") ক্লাস চালাতে ব্যবহার করেন, ওয়েবসাইটে ও আমাদের পাঁচটি ফোন অ্যাপে (স্টুডেন্ট, অভিভাবক, শিক্ষক, প্রতিষ্ঠান ও ClassBARI AI)। এটি ব্যবহার করেন:", { list: ["প্রতিষ্ঠানের মালিক, ম্যানেজার ও শিক্ষকেরা (\"স্টাফ\");", "শিক্ষার্থীরা, যাদের অনেকের বয়স ১৮-র কম;", "অভিভাবকেরা (বাবা-মা বা শিক্ষার্থীর দায়িত্বে থাকা অন্য কেউ);", "আমাদের পাবলিক পেজের দর্শকেরা (কোর্স পেজ, শিক্ষকের ওয়েবসাইট, যোগ দেওয়ার লিংক)।"] }] },
      { id: "roles", title: "২. আমাদের ভূমিকা ও প্রতিষ্ঠানের ভূমিকা", blocks: [{ list: ["কোন শিক্ষার্থী ও অভিভাবককে যোগ করা হবে এবং তাদের সম্পর্কে কী লেখা হবে, তা প্রতিটি প্রতিষ্ঠান ঠিক করে। এর জন্য আইনসম্মত কারণ এবং শিশুদের ক্ষেত্রে অভিভাবকের সম্মতি রাখার দায়িত্ব প্রতিষ্ঠানের।", "আমরা সেই তথ্য প্রতিষ্ঠানের পক্ষে রাখি ও ব্যবহার করি, শুধু তাদের ClassBARI দেওয়ার জন্য। বিজ্ঞাপনের কাজে ব্যবহার করি না, কখনো বিক্রি করি না।", "আমাদের নিজস্ব গ্রাহক, অর্থাৎ যে মালিক ও স্টাফেরা সাইন আপ করেন, তাঁদের অ্যাকাউন্টের তথ্যের দায়িত্ব আমাদের।"] }] },
      { id: "collect", title: "৩. আমরা কী সংগ্রহ করি", blocks: [{ table: [["কার বা কী", "তথ্য", "কেন"], ["স্টাফ", "নাম, ইমেইল, মোবাইল নম্বর, পদ, মালিকের দেওয়া বেতন বা অংশের হিসাব। পাসওয়ার্ড আমাদের লগইন সেবাদাতা শুধু এলোমেলো (হ্যাশ) রূপে রাখে।", "অ্যাকাউন্ট, লগইন, প্রতিষ্ঠান চালানো"], ["শিক্ষার্থী", "নাম, Gmail ঠিকানা, মোবাইল (ইচ্ছামতো), লিঙ্গ, জন্মতারিখ, স্কুল, ঠিকানা ও ছবি (ইচ্ছামতো), ব্যাচ, রোল নম্বর", "ভর্তি, লগইন, আইডি কার্ড ও রিপোর্ট"], ["অভিভাবক", "নাম, Gmail ঠিকানা, মোবাইল নম্বর", "অভিভাবকের লগইন, সন্তানের খবর, ফির কথা মনে করানো"], ["পড়াশোনার রেকর্ড", "উপস্থিতি, কুইজের উত্তর ও নম্বর, নম্বরসহ বাড়ির কাজের ছবি ও ফাইল, শিক্ষকের মন্তব্য, রিপোর্ট কার্ড, অনুশীলনের অগ্রগতি, পয়েন্ট, শিক্ষককে করা প্রশ্ন, ভিডিও কতটা দেখা হয়েছে", "পড়ানো, ফলাফল, অভিভাবকের জন্য অগ্রগতির রিপোর্ট"], ["ফির রেকর্ড", "বকেয়া ফি, ছাড়, জমা দেওয়া টাকা (পরিমাণ, তারিখ, নগদ বা বিকাশ), রসিদ, কোর্স অর্ডারে লেখা বিকাশ TrxID", "ফির হিসাব ও রসিদ। আমরা কখনো পিন, পাসওয়ার্ড বা কার্ড নম্বর চাই না, রাখিও না।"], ["মেসেজ ও কমিউনিটি", "অভিভাবক ও শিক্ষকের মেসেজ; কমিউনিটির পোস্ট, ছবি, ফাইল, পোল, মন্তব্য, লাইক, বন্ধুত্বের অনুরোধ, ছোট প্রোফাইল, মিউট ও ব্লক", "যোগাযোগ, প্রতিষ্ঠান দেখাশোনা করে"], ["AI স্টাডি চ্যাট", "উত্তর তৈরির সময় শিক্ষার্থী যা লেখে বা যুক্ত করে; কতটা অ্যালাউন্স ব্যবহার হলো; উত্তরের পছন্দ (ভাষা, দৈর্ঘ্য)", "উত্তর দেওয়া; প্যাকের সীমা মেনে চলা"], ["সংরক্ষিত AI উত্তর", "চ্যাটের প্রথম প্রশ্ন ও তার উত্তর, শিক্ষার্থীর নাম বা অ্যাকাউন্ট ছাড়া", "একই প্রশ্ন অন্য শিক্ষার্থী করলে উত্তর দেওয়া (৬ নম্বর অংশ)"], ["হাইলাইট করা PDF", "শিক্ষকের আপলোড করা PDF পাঠ, তা থেকে পড়া লেখা, হাইলাইট এবং ফাইলের হাইলাইট করা কপি", "শিক্ষার্থীদের হাইলাইট করা সংস্করণ দেখানো"], ["নোটিফিকেশন", "যে ফোন বা ব্রাউজারে নোটিফিকেশন চালু: পৌঁছে দেওয়ার জন্য Google, Apple বা ব্রাউজার নির্মাতার দেওয়া একটি ঠিকানা, কোন অ্যাকাউন্টের, ভাষা, এবং কোন ধরনের নোটিফিকেশন বন্ধ রাখা হয়েছে", "যে নোটিফিকেশন চাওয়া হয়েছে তা পাঠানো"], ["ডিভাইস ও প্রযুক্তিগত", "লগইন সেশন, ভাষা, থিম, লেখার আকার, লগইনে বেছে নেওয়া প্রতিষ্ঠান, অল্প সময়ের জন্য অনুরোধের ইন্টারনেট ঠিকানা (পাসওয়ার্ড আন্দাজ ও অতিরিক্ত চাপ ঠেকাতে)", "লগইন রাখা, সেটিংস, নিরাপত্তা"], ["ত্রুটির রিপোর্ট", "সময়, পেজ ও ত্রুটির বার্তা; ইমেইল, ফোন নম্বর ও কী স্বয়ংক্রিয়ভাবে মুছে ফেলা হয়", "সমস্যা খুঁজে ঠিক করা"], ["SMS লগ", "প্রতিষ্ঠানের পাঠানো প্রতিটি SMS-এর নম্বর, লেখা, সময় ও ফল", "দৈনিক সীমা ও বিল"]] }, "আমরা বিজ্ঞাপনের ট্র্যাকার ব্যবহার করি না, এবং ব্যক্তিগত তথ্য বিক্রি বা ভাড়া দিই না।"] },
      { id: "see", title: "৪. কে কী দেখতে পারে", blocks: [{ list: ["শিক্ষার্থীরা নিজের রেকর্ড, নিজের নম্বর ও নিজের অবস্থান, নিজের ব্যাচের পাঠ ও নোটিশ, এবং অন্য শিক্ষার্থীদের নাম, ব্যাচ ও ছবি দেখে। অন্যের নম্বর, যোগাযোগের তথ্য, ফি বা উত্তর দেখতে পারে না।", "অভিভাবকেরা শুধু নিজের সন্তানের রেকর্ড দেখেন। কমিউনিটি দেখেন না।", "শিক্ষকেরা শুধু নিজের পড়ানো ব্যাচ দেখেন। প্রতিষ্ঠানের টাকার হিসাব বা অন্য শিক্ষকের বেতন দেখেন না।", "মালিক ও ম্যানেজারেরা পুরো প্রতিষ্ঠান দেখেন, শুধু পোলে কে কাকে ভোট দিল এবং কে কাকে মিউট বা ব্লক করল তা ছাড়া।", "পাবলিক কোর্স পেজের দর্শকেরা কোর্স, ফ্রি প্রিভিউ পাঠ, শিক্ষকের নাম, শিক্ষার্থীর সংখ্যা ও গড় নম্বর দেখেন। কোনো শিক্ষার্থীর তালিকা বা কারও নম্বর নয়।", "অন্য প্রতিষ্ঠান আপনার প্রতিষ্ঠানের তথ্য দেখতে পারে না।", "ClassBARI-এর নিজস্ব কর্মীরা শুধু সহায়তা দিতে, সমস্যা ঠিক করতে, সংরক্ষিত AI উত্তর যাচাই করতে বা আইন চাইলে তথ্য দেখেন।"] }] },
      { id: "providers", title: "৫. যে প্রতিষ্ঠানগুলো ClassBARI চালাতে সাহায্য করে", blocks: ["তারা শুধু আমাদের সেবা দিতে যতটুকু দরকার ততটুকুই পায়।", { table: [["প্রতিষ্ঠান", "কী কাজে", "কী পায়", "কোথায়"], ["Supabase", "ডেটাবেস, লগইন, ফাইল রাখা, অ্যাকাউন্টের ইমেইল", "৩ নম্বর অংশের তথ্য, আপনার ডিভাইসে থাকা তথ্য ছাড়া", "মুম্বাই, ভারত"], ["{hosting}", "ওয়েবসাইট চালানো", "ওয়েবসাইটের সব আদান-প্রদান", "—"], ["{emailSender}", "লগইন কোড ও পাসওয়ার্ড রিসেটের ইমেইল", "ইমেইল ঠিকানা ও কোড", "—"], ["Google", "\"Google দিয়ে লগইন\"; ফোনে নোটিফিকেশন (Firebase Cloud Messaging)", "লগইনের Gmail; নোটিফিকেশনের জন্য ফোনের নোটিফিকেশন ঠিকানা এবং নোটিফিকেশনের শিরোনাম ও লেখা", "বিশ্বজুড়ে"], ["Google (Gemini), OpenAI, Anthropic, Alibaba Cloud", "AI স্টাডি চ্যাট, PDF নিয়ে \"AI-কে জিজ্ঞেস করুন\", PDF পাঠ পড়া ও হাইলাইট করা। শুধু যাদের মডেল আমরা চালু করি", "প্রশ্ন ও সেই চ্যাটের আগের মেসেজ, যুক্ত ছবি বা ফাইলের লেখা; হাইলাইটের জন্য PDF ফাইল। শিক্ষার্থী নিজে না লিখলে তার নাম বা অ্যাকাউন্ট নয়", "যুক্তরাষ্ট্র, সিঙ্গাপুর"], ["Jitsi", "লাইভ ক্লাসের ভিডিও, ব্যবহার হলে", "ভিডিও, শব্দ ও ক্লাসে দেখানো নাম", "বিশ্বজুড়ে"], ["YouTube", "শিক্ষকের যোগ করা YouTube ভিডিও", "দর্শকের ইন্টারনেট ঠিকানা, যেকোনো এম্বেড করা ভিডিওর মতো", "বিশ্বজুড়ে"], ["ব্রাউজার নির্মাতা (Google, Mozilla, Apple)", "ব্রাউজারে নোটিফিকেশন, চালু করা থাকলে", "নোটিফিকেশনের লেখা", "বিশ্বজুড়ে"], ["SMS সেবাদাতা (যুক্ত হলে)", "প্রতিষ্ঠানের SMS", "মোবাইল নম্বর ও লেখা", "বাংলাদেশ"]] }, "হাতের লেখা পড়া, কমিউনিটির ছবি যাচাই এবং AI প্রশ্নের তুলনা ClassBARI-এর নিজস্ব সার্ভারে চলে, কাউকে পাঠানো হয় না। ফন্ট আসে আমাদের নিজের সাইট থেকে।"] },
      { id: "ai", title: "৬. AI স্টাডি চ্যাট ও হাইলাইট করা PDF", blocks: [{ list: ["AI স্টাডি চ্যাট একটি ঐচ্ছিক পেইড প্যাক। প্যাক ছাড়া শিক্ষার্থী এটি ব্যবহার করতে পারে না।", "শিক্ষার্থী যা লেখে ও যুক্ত করে, উত্তর পেতে তা তার বেছে নেওয়া মডেলের AI প্রতিষ্ঠানে পাঠানো হয়। চ্যাটটি শুধু শিক্ষার্থীর নিজের ফোন বা ব্রাউজারে থাকে, আমাদের সার্ভারে নয়, এবং লগ আউট করলে মুছে যায়।", "সংরক্ষিত উত্তর: দ্রুত ও কম খরচে উত্তর দিতে, চ্যাটের প্রথম প্রশ্ন ও তার উত্তর শিক্ষার্থীর নাম বা অ্যাকাউন্ট ছাড়া আমাদের সার্ভারে রাখা হতে পারে, এবং একই প্রশ্ন অন্য শিক্ষার্থী করলে দেখানো হতে পারে। প্রশ্নে ছবি বা ফাইল থাকলে, পরের প্রশ্ন হলে, লম্বা হলে, ব্যক্তিগত মনে হলে, বা শিক্ষার্থী নিজে উত্তরের ভাষা বা দৈর্ঘ্য বেছে নিলে তা রাখা হয় না। রাখার আগে একটি স্বয়ংক্রিয় যাচাইয়ে উত্তরটি সঠিক ও উপযুক্ত পেতে হয়, এবং আমাদের কর্মীরা সংরক্ষিত উত্তর মুছে দিতে পারেন।", "প্রিমিয়াম প্রতিষ্ঠানে শিক্ষকের আপলোড করা PDF পাঠ পড়া ও হাইলাইট করার জন্য একটি AI প্রতিষ্ঠানে পাঠানো হয়। হাইলাইট করা কপি মূল ফাইলের সঙ্গে রাখা হয়।", "AI-এর উত্তর ও হাইলাইট ভুল হতে পারে। এগুলো পড়াশোনায় সাহায্য করে, শিক্ষকের জায়গা নেয় না।"] }] },
      { id: "notifications", title: "৭. নোটিফিকেশন", blocks: ["নোটিফিকেশনের অনুমতি দিলে আপনার সঙ্গে সম্পর্কিত বিষয়ে আমরা পাঠাই: নতুন বাড়ির কাজ, নম্বর, নোটিশ, অনুপস্থিতি, টাকা জমা, মেসেজ, এবং স্টাফের জন্য প্রশ্ন, মিটিং ও ছুটি। প্রতিটি ধরন সেটিংসে, ওয়েবসাইটে বা অ্যাপে বন্ধ করতে পারেন; পছন্দটি আপনার সব ডিভাইসে খাটে। ফোন বা ব্রাউজারের সেটিংসেও নোটিফিকেশন বন্ধ করতে পারেন। লগ আউট করলে সেই ডিভাইসে আর আসে না।"] },
      { id: "keep", title: "৮. কতদিন তথ্য রাখি", blocks: [{ list: ["কোনো প্রতিষ্ঠান ClassBARI ব্যবহার করলে, তাদের ব্যবহারের জন্য তথ্য রাখা হয়।", "প্রতিষ্ঠান অ্যাকাউন্ট বন্ধ করলে আগে ব্যাকআপ ডাউনলোড করতে পারে। আইন যা রাখতে বলে তা ছাড়া, {closedAccountDays} দিন পর তাদের তথ্য মুছে ফেলা হয়।", "প্রতিষ্ঠান কোনো শিক্ষার্থী বা অভিভাবককে সরিয়ে দিলে তিনি আর লগইন করতে পারেন না। প্রতিষ্ঠান মুছে না দেওয়া বা অ্যাকাউন্ট বন্ধ না করা পর্যন্ত তাঁর আগের রেকর্ড প্রতিষ্ঠানের রেকর্ডের সঙ্গে থাকে।", "সংরক্ষিত AI উত্তরে কোনো নাম থাকে না; আমরা মুছে না দেওয়া পর্যন্ত থাকে।", "লগ আউট করলে বা ফোন আর না নিলে নোটিফিকেশনের ঠিকানা মুছে যায়; পাঠানো নোটিফিকেশনের চিহ্ন ৬০ দিন পর।"] }] },
      { id: "children", title: "৯. শিশুরা", blocks: ["বেশিরভাগ শিক্ষার্থীর বয়স ১৮-র কম। ClassBARI {minAge} বছর বা তার বেশি বয়সী শিক্ষার্থীদের জন্য, যাদের প্রতিষ্ঠান অভিভাবকের সম্মতিতে যোগ করে। পাবলিক লিংক দিয়ে যোগ দিতে অভিভাবকের তথ্য লাগে, এবং প্রতিষ্ঠান গ্রহণ না করা পর্যন্ত অপেক্ষা করতে হয়। কমিউনিটিতে:", { list: ["শিক্ষার্থীদের মধ্যে কোনো ব্যক্তিগত মেসেজ নেই;", "ছবি স্বয়ংক্রিয়ভাবে যাচাই হয়, পোস্টে খারাপ কথা খোঁজা হয়; সন্দেহজনক কিছু শিক্ষক অনুমোদন না করা পর্যন্ত লুকানো থাকে;", "শিক্ষার্থীরা মিউট, ব্লক ও রিপোর্ট করতে পারে; শিক্ষকেরা পোস্ট সরাতে পারেন;", "শিক্ষার্থী চাইলে অন্যদের খোঁজে না আসার ব্যবস্থা নিতে পারে।"] }] },
      { id: "security", title: "১০. নিরাপত্তা", blocks: [{ list: ["সব সংযোগ এনক্রিপ্ট করা (HTTPS)।", "প্রতিটি অনুরোধ আমাদের সার্ভারে যাচাই হয়, তাই প্রত্যেকে শুধু অনুমতি পাওয়া জিনিস দেখতে ও বদলাতে পারে। যেমন, শিক্ষার্থী নম্বর বা ফি বদলাতে পারে না, কুইজের নম্বর সার্ভারে দেওয়া হয়।", "ফাইল ব্যক্তিগত: যাকে দেখানো হয় শুধু তার জন্যই খোলে, এক ঘণ্টা কাজ করে এমন লিংকে।", "পাসওয়ার্ড কখনো পড়া যায় এমনভাবে রাখা হয় না, এবং বারবার ভুল চেষ্টা ধীর করে দেওয়া হয়।", "আমাদের সিস্টেমে প্রবেশাধিকার শুধু প্রতিষ্ঠাতাদের।"] }, "কোনো নিরাপত্তা ঘটনা আপনার তথ্যে প্রভাব ফেললে, আমরা {breachHours} ঘণ্টার মধ্যে সংশ্লিষ্ট প্রতিষ্ঠানকে এবং আইন চাইলে কর্তৃপক্ষকে জানাব।"] },
      { id: "device", title: "১১. কুকি ও আপনার ডিভাইসে রাখা তথ্য", blocks: ["আমরা শুধু দরকারি জিনিস ব্যবহার করি, কোনো বিজ্ঞাপন বা ট্র্যাকিং কুকি নয়: লগইন সেশন, আপনার সেটিংস (ভাষা, থিম, লেখার আকার, বেছে নেওয়া প্রতিষ্ঠান, তালিকায় কয়টি সারি), আপনার AI চ্যাট, ড্যাশবোর্ডের শেষ অবস্থা যাতে সঙ্গে সঙ্গে খোলে, এবং ইন্টারনেট ছাড়া করা পরিবর্তন পাঠানো না যাওয়া পর্যন্ত। লগ আউট করলে AI চ্যাট ও শেষ অবস্থা মুছে যায়। অন্যের সঙ্গে ভাগ করা ফোন বা কম্পিউটারে সবসময় লগ আউট করুন।"] },
      { id: "rights", title: "১২. আপনার অধিকার", blocks: ["আপনি আপনার তথ্য দেখতে, ঠিক করতে বা মুছতে, অথবা ঐচ্ছিক মেসেজ বন্ধ করতে বলতে পারেন। শিক্ষার্থী ও অভিভাবক: প্রথমে আপনার প্রতিষ্ঠানকে বলুন, কারণ তারাই রেকর্ড রাখে, অথবা {email} ঠিকানায় লিখুন, আমরা সাহায্য করব। স্টাফ ও মালিক: সরাসরি আমাদের লিখুন। আমরা {replyDays} দিনের মধ্যে উত্তর দিই।"] },
      { id: "delete-account", title: "১৩. অ্যাকাউন্ট মুছে ফেলা", blocks: [{ list: ["প্রতিষ্ঠানের মালিক: অ্যাকাউন্টের ইমেইল থেকে {email} ঠিকানায় লিখুন, বা হোয়াটসঅ্যাপ {whatsapp}, এবং লিখুন \"আমার প্রতিষ্ঠান মুছে দিন\"। আগে সেটিংস থেকে ব্যাকআপ ডাউনলোড করুন। {closedAccountDays} দিনের মধ্যে প্রতিষ্ঠান ও তার সব তথ্য মুছে ফেলা হয়।", "শিক্ষার্থী ও অভিভাবক: আপনার প্রতিষ্ঠানকে আপনাকে সরিয়ে দিতে বলুন; তারপর আর লগইন করতে পারবেন না। আপনার রেকর্ডও মুছতে চাইলে আপনার Gmail ও প্রতিষ্ঠানের নামসহ {email} ঠিকানায় লিখুন, আমরা প্রতিষ্ঠানের সঙ্গে ব্যবস্থা করব।", "শিক্ষক: প্রতিষ্ঠানের মালিককে আপনাকে সরিয়ে দিতে বলুন, অথবা আমাদের লিখুন।", "আপনার AI চ্যাট শুধু আপনার নিজের ডিভাইসে থাকে: লগ আউট করলে মুছে যায়।"] }] },
      { id: "changes", title: "১৪. পরিবর্তন ও যোগাযোগ", blocks: ["পরিবর্তন এখানে প্রকাশ করা হয়, এবং বড় পরিবর্তন কার্যকর হওয়ার আগে প্রতিষ্ঠানের মালিকদের ইমেইলে জানানো হয়। {company}, {address}, ট্রেড লাইসেন্স {licence} · {email} · হোয়াটসঅ্যাপ {whatsapp}"] },
    ],
  },
  terms: {
    title: "ব্যবহারের শর্তাবলি",
    intro: "এই শর্তাবলি {company} (\"আমরা\") এবং ওয়েবসাইট ও অ্যাপে ClassBARI ব্যবহারকারী সবার মধ্যে একটি চুক্তি। ClassBARI ব্যবহার করলে আপনি এগুলো মেনে নিচ্ছেন।",
    sections: [
      { id: "service", title: "১. সেবা", blocks: ["ClassBARI হলো ক্লাস চালানোর সফটওয়্যার: ভর্তি, উপস্থিতি, পাঠ, পরীক্ষা, ফলাফল, ফির রেকর্ড, মেসেজ, নোটিফিকেশন, শিক্ষার্থীদের কমিউনিটি, AI স্টাডি চ্যাট এবং হাইলাইট করা PDF পাঠ, ওয়েবে ও আমাদের অ্যাপে। কিছু সুবিধা পরীক্ষামূলক থাকতে পারে, বা আমরা ঘোষণা না করা পর্যন্ত বন্ধ থাকতে পারে।"] },
      { id: "accounts", title: "২. অ্যাকাউন্ট", blocks: [{ list: ["প্রতিষ্ঠান ইমেইল ও পাসওয়ার্ড দিয়ে সাইন আপ করে।", "শিক্ষার্থী ও অভিভাবক প্রতিষ্ঠানের নিবন্ধিত Gmail দিয়ে লগইন করেন, \"Google দিয়ে লগইন\" অথবা সেই Gmail-এ পাঠানো কোড নিশ্চিত করে নিজের বানানো পাসওয়ার্ড দিয়ে।", "লগইন গোপন রাখুন। আপনার অ্যাকাউন্টে যা হয় তার দায়িত্ব আপনার; অন্য কেউ ব্যবহার করেছে মনে হলে সঙ্গে সঙ্গে আমাদের জানান। লগ আউট শুধু সেই ডিভাইসের লগইন শেষ করে।", "মালিকেরা যে স্টাফদের প্রবেশাধিকার দেন, তাঁদের দায়িত্ব মালিকের।"] }] },
      { id: "institutes", title: "৩. প্রতিষ্ঠানের দায়িত্ব", blocks: [{ list: ["শুধু অনুমতিপ্রাপ্ত শিক্ষার্থী ও অভিভাবককে যোগ করুন, শিশুদের ক্ষেত্রে অভিভাবকের সম্মতিতে।", "তথ্য সঠিক রাখুন এবং যারা চলে যায় তাদের সরিয়ে দিন।", "অনুমোদনের অপেক্ষায় থাকা কমিউনিটি পোস্ট দেখুন এবং রিপোর্টের ব্যবস্থা নিন।", "আপনার আপলোড করা বিষয়বস্তু (পাঠ, নোট, ভিডিও, প্রশ্ন) আপনার, এবং তার অধিকার আপনার থাকতে হবে। আপনি আমাদের তা রাখতে, আপনার বেছে নেওয়া মানুষদের দেখাতে, এবং প্রিমিয়াম প্রতিষ্ঠানের ক্ষেত্রে একটি AI সেবা দিয়ে পড়ে হাইলাইট করাতে অনুমতি দেন, শুধু ClassBARI দেওয়ার জন্য।", "অভিভাবক ও প্রতিষ্ঠানের মধ্যে ফির বিষয় তাদের নিজেদের। ClassBARI টাকা জমার হিসাব রাখে, কিন্তু অভিভাবক ও প্রতিষ্ঠানের টিউশন চুক্তি বা টাকা ফেরতের অংশ নয়।"] }] },
      { id: "use", title: "৪. গ্রহণযোগ্য ব্যবহার", blocks: ["ClassBARI ব্যবহার করে বেআইনি, ঘৃণাপূর্ণ, যৌন বা সহিংস কিছু আপলোড করবেন না; কাউকে হয়রানি বা উত্যক্ত করবেন না; অনুমতি ছাড়া অন্যের তথ্য ছড়াবেন না; নকল করবেন না বা করতে সাহায্য করবেন না; অ্যাকাউন্ট বা সেবায় অনধিকার প্রবেশ করবেন না; সেবায় অতিরিক্ত চাপ দেবেন না বা নকল করবেন না। এই নিয়ম ভাঙলে আমরা বিষয়বস্তু সরাতে ও অ্যাকাউন্ট স্থগিত করতে পারি।"] },
      { id: "ai", title: "৫. AI স্টাডি চ্যাট ও হাইলাইট", blocks: [{ list: ["AI প্যাক ঐচ্ছিক, প্রতিষ্ঠান চালু করে। প্রতিটি প্যাকের নিজস্ব মডেল ও অ্যালাউন্স আছে, যা প্রতি ১২ ঘণ্টায় আবার পূর্ণ হয়; না ব্যবহার করা অ্যালাউন্স পরের বার যোগ হয় না।", "AI-এর উত্তর ও PDF হাইলাইট AI তৈরি করে এবং ভুল হতে পারে। শিক্ষকের সঙ্গে যাচাই না করে পরীক্ষা, স্বাস্থ্য, আইন বা টাকার সিদ্ধান্তে এর ওপর নির্ভর করবেন না।", "চ্যাটে অন্যের ব্যক্তিগত তথ্য লিখবেন না।"] }] },
      { id: "plans", title: "৬. প্ল্যান ও চার্জ", blocks: ["প্রতিষ্ঠানের প্ল্যান ও দাম আমাদের ওয়েবসাইটে দেখানো থাকে, এবং প্ল্যান বেছে নেওয়ার সময় ঠিক হয়। পেমেন্ট দেরি হলে অ্যাকাউন্ট ৭ দিন পুরোপুরি চলে, তারপর পরিশোধ না হওয়া পর্যন্ত শুধু দেখা যায়; দেরিতে পেমেন্টের জন্য আমরা তথ্য মুছি না। দাম বদলালে ৩০ দিন আগে জানানো হবে।"] },
      { id: "availability", title: "৭. সেবা চালু থাকা ও ব্যাকআপ", blocks: ["আমরা ClassBARI চালু রাখতে কাজ করি, কিন্তু কখনো বাধা পড়বে না তার নিশ্চয়তা দিতে পারি না। যতটা সম্ভব ক্লাসের সময়ের বাইরে রক্ষণাবেক্ষণ করি। প্রতিষ্ঠানের মাঝে মাঝে সেটিংস থেকে ব্যাকআপ ডাউনলোড করা উচিত।"] },
      { id: "ending", title: "৮. সমাপ্তি", blocks: ["আপনি যেকোনো সময় ClassBARI ব্যবহার বন্ধ করতে পারেন, আগে আপনার তথ্য ডাউনলোড করে নিয়ে (গোপনীয়তা নীতির \"অ্যাকাউন্ট মুছে ফেলা\" দেখুন)। কেউ এই শর্ত গুরুতরভাবে বা বারবার ভাঙলে, যুক্তিসংগত হলে আগে জানিয়ে, আমরা অ্যাকাউন্ট স্থগিত বা বন্ধ করতে পারি। অ্যাকাউন্ট বন্ধ হলে গোপনীয়তা নীতি অনুযায়ী তথ্য মুছে ফেলা হয়।"] },
      { id: "liability", title: "৯. দায়", blocks: ["আমরা যুক্তিসংগত যত্নে ClassBARI দিই। আইন যতটা অনুমতি দেয়, পরোক্ষ ক্ষতি, AI-এর ভুল উত্তর বা হাইলাইটের কারণে ক্ষতি, অথবা দাবির আগের ৩ মাসে প্রতিষ্ঠান আমাদের যে ফি দিয়েছে তার বেশি কিছুর জন্য আমরা দায়ী নই। আইন যে দায় সীমিত করতে দেয় না, এই শর্তের কিছুই তা সীমিত করে না।"] },
      { id: "law", title: "১০. আইন ও বিরোধ", blocks: ["এই শর্তাবলি বাংলাদেশের আইন অনুযায়ী চলবে। বিরোধ {court}-এর আদালতে যাবে।"] },
      { id: "contact", title: "১১. যোগাযোগ", blocks: ["{company}, {address} · {email} · হোয়াটসঅ্যাপ {whatsapp}"] },
    ],
  },
};

export const LEGAL_TEXT = { en, bn };
