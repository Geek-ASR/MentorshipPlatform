/**
 * Fictional sample data for local development, E2E journeys and the static preview (docs/19 Phase
 * 15). Every person here is invented. Institutions and verification domains are the real reference
 * data already seeded (docs/05 §8); account emails use the reserved example.com domain (RFC 2606)
 * and are never deliverable. Verification-challenge emails are confirmed by token and purged from
 * the outbox by the seed script, so nothing is ever sent to an institutional address.
 */

export type LanguageSeed = { slug: string; proficiency: "native" | "fluent" | "conversational" };

export type AffiliationSeed = {
  kind: "education" | "work";
  universitySlug?: string;
  companySlug?: string;
  title: string;
  isCurrent: boolean;
  startDate: string;
  endDate?: string;
  /** When set, the seed runs the real email-challenge flow against this address's domain. */
  verifyWith?: string;
};

export type ServiceSeed = {
  title: string;
  description: string;
  prices: { durationMin: number; priceMinor: number }[];
  intakeQuestions?: string[];
};

export type MentorSeed = {
  key: string;
  name: string;
  timezone: string;
  countryIso2: string;
  residency: "citizen_or_pr" | "work_authorised" | "student_visa";
  headline: string;
  bio: string;
  affiliations: AffiliationSeed[];
  expertise: string[];
  languages: LanguageSeed[];
  /** ISO weekdays (1 = Monday) with a mentor-local window. */
  availability: { weekdays: number[]; start: string; end: string }[];
  services: ServiceSeed[];
  hostsEvents?: boolean;
};

export type StudentSeed = {
  key: string;
  name: string;
  timezone: string;
  headline?: string;
};

export const DEMO_EMAIL_DOMAIN = "example.com";

/** Shared by every demo account. Local/demo databases only — the seed refuses staging/production. */
export const DEMO_ACCOUNT_PASSWORD = "sample-password-2026";

export const TEAM = { key: "team", name: "Aheadly Team" };

export const MENTORS: MentorSeed[] = [
  {
    key: "ananya",
    name: "Ananya Iyer",
    timezone: "Europe/Berlin",
    countryIso2: "DE",
    residency: "work_authorised",
    headline: "MSc Informatics, TU Munich · Software engineer in Munich",
    bio: `I moved from Pune to Munich in 2021 for the MSc Informatics at TUM and stayed on as a software engineer. Most students I talk to are where I was four years ago: a long list of programmes, unclear requirements and a lot of conflicting advice online.

In a session we can shortlist universities against your actual transcript, walk through the APS and uni-assist steps as I experienced them, tighten your statement of purpose, or talk honestly about the first few months here. For anything visa-related I'll share what I did and point you to the official source.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "technical-university-of-munich",
        title: "MSc Informatics",
        isCurrent: false,
        startDate: "2021-10-01",
        endDate: "2023-09-30",
        verifyWith: "ananya.iyer@alumni.tum.de",
      },
      {
        kind: "work",
        companySlug: "sap",
        title: "Software Engineer",
        isCurrent: true,
        startDate: "2023-11-01",
        verifyWith: "ananya.iyer@sap.com",
      },
    ],
    expertise: [
      "university-selection",
      "application-strategy",
      "aps-certificate",
      "sop-feedback",
      "international-student-experience",
      "software-engineering",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "hindi", proficiency: "native" },
      { slug: "marathi", proficiency: "native" },
      { slug: "german", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [1, 2, 3, 4, 5], start: "17:00", end: "20:30" },
      { weekdays: [6], start: "10:00", end: "13:00" },
    ],
    services: [
      {
        title: "Germany MSc application review",
        description:
          "We go through your shortlist, transcript and documents together, and you leave with a clear plan and a list of deadlines.",
        prices: [
          { durationMin: 30, priceMinor: 90_000 },
          { durationMin: 60, priceMinor: 150_000 },
        ],
        intakeQuestions: [
          "Which universities and programmes are you considering?",
          "Where are you in the process — shortlisting, documents, or applications sent?",
        ],
      },
      {
        title: "Intro call",
        description:
          "A short call to see whether I'm the right person for your questions. No preparation needed.",
        prices: [{ durationMin: 30, priceMinor: 0 }],
      },
    ],
    hostsEvents: true,
  },
  {
    key: "rohan",
    name: "Rohan Mehta",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Senior software engineer · System design and interview practice",
    bio: `I studied computer science at IIT Bombay and have spent the last seven years building backend systems. I've been on both sides of the interview table many times, and I've watched good engineers struggle with system design simply because nobody showed them how to structure the conversation.

My sessions are practical: a realistic mock interview, then a written debrief with the two or three changes that will make the biggest difference. I'm equally happy to review a resume or talk through whether a job change makes sense right now.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "iit-bombay",
        title: "B.Tech, Computer Science and Engineering",
        isCurrent: false,
        startDate: "2012-07-15",
        endDate: "2016-05-31",
        verifyWith: "rohan.mehta@iitb.ac.in",
      },
      {
        kind: "work",
        companySlug: "microsoft",
        title: "Senior Software Engineer",
        isCurrent: true,
        startDate: "2021-04-01",
        verifyWith: "rohan.mehta@microsoft.com",
      },
    ],
    expertise: [
      "system-design",
      "technical-interviews",
      "interview-preparation",
      "software-engineering",
      "resume-cv-review",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "hindi", proficiency: "native" },
      { slug: "gujarati", proficiency: "native" },
    ],
    availability: [
      { weekdays: [1, 2, 3, 4, 5], start: "19:30", end: "22:00" },
      { weekdays: [6, 7], start: "10:00", end: "13:00" },
    ],
    services: [
      {
        title: "System design mock interview",
        description:
          "A realistic interview on a problem suited to your target level, followed by a structured debrief and written notes.",
        prices: [{ durationMin: 60, priceMinor: 180_000 }],
        intakeQuestions: ["What level are you interviewing for, and at which companies?"],
      },
      {
        title: "Resume review for software roles",
        description:
          "Line-by-line feedback on your resume for the roles you're targeting, with a rewritten summary and example bullets.",
        prices: [{ durationMin: 30, priceMinor: 70_000 }],
        intakeQuestions: ["Which roles are you applying for?"],
      },
    ],
    hostsEvents: true,
  },
  {
    key: "sneha",
    name: "Sneha Kulkarni",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Data scientist · M.Tech, IISc Bangalore",
    bio: `I did my M.Tech at IISc and now work as a data scientist, mostly on forecasting and experimentation. Before that I switched from mechanical engineering, so I know how confusing the path into data science can look from the outside.

I can help you build a realistic learning plan, choose projects that actually show skill, review your portfolio, or prepare for data science interviews — including the statistics questions people tend to skip.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "iisc-bangalore",
        title: "M.Tech, Computational and Data Sciences",
        isCurrent: false,
        startDate: "2017-08-01",
        endDate: "2019-07-31",
        verifyWith: "sneha.kulkarni@iisc.ac.in",
      },
      {
        kind: "work",
        companySlug: "flipkart",
        title: "Data Scientist",
        isCurrent: true,
        startDate: "2019-09-01",
        verifyWith: "sneha.kulkarni@flipkart.com",
      },
    ],
    expertise: [
      "data-science",
      "ai-ml",
      "career-switching",
      "portfolio-review",
      "interview-preparation",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "marathi", proficiency: "native" },
      { slug: "hindi", proficiency: "fluent" },
      { slug: "kannada", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [1, 2, 3, 4, 5], start: "19:00", end: "21:30" },
      { weekdays: [7], start: "09:30", end: "12:30" },
    ],
    services: [
      {
        title: "Data science career roadmap",
        description:
          "A personalised plan based on your background: what to learn, in what order, and which projects to build.",
        prices: [{ durationMin: 45, priceMinor: 100_000 }],
      },
      {
        title: "ML project and portfolio review",
        description:
          "Detailed feedback on one or two projects, from problem framing to how you present your results.",
        prices: [{ durationMin: 60, priceMinor: 130_000 }],
      },
    ],
    hostsEvents: true,
  },
  {
    key: "arjun",
    name: "Arjun Nair",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Product manager · MBA, IIM Ahmedabad",
    bio: `I started as a software engineer after NIT Trichy, did my MBA at IIM Ahmedabad, and have worked as a product manager at two consumer-tech companies since. A lot of my mentoring is with engineers and analysts trying to move into product, and with MBA students preparing for product interviews.

We can run a product-sense or execution interview, work on how you tell your story, or plan a realistic switch from your current role.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "iim-ahmedabad",
        title: "MBA (PGP)",
        isCurrent: false,
        startDate: "2017-06-01",
        endDate: "2019-03-31",
        verifyWith: "arjun.nair@iima.ac.in",
      },
      {
        kind: "education",
        universitySlug: "nit-trichy",
        title: "B.Tech, Electronics and Communication",
        isCurrent: false,
        startDate: "2011-07-15",
        endDate: "2015-05-31",
      },
    ],
    expertise: [
      "product-management",
      "career-switching",
      "interview-preparation",
      "job-preparation",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "malayalam", proficiency: "native" },
      { slug: "hindi", proficiency: "fluent" },
      { slug: "tamil", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [2, 4], start: "19:00", end: "21:30" },
      { weekdays: [6], start: "10:00", end: "14:00" },
    ],
    services: [
      {
        title: "Product manager interview practice",
        description:
          "A mock product-sense or execution interview with detailed feedback on structure and communication.",
        prices: [{ durationMin: 60, priceMinor: 160_000 }],
      },
      {
        title: "Moving into product management",
        description:
          "An honest look at your background, the gaps to close, and a plan for landing your first product role.",
        prices: [{ durationMin: 30, priceMinor: 80_000 }],
      },
    ],
  },
  {
    key: "meera",
    name: "Meera Pillai",
    timezone: "Europe/Berlin",
    countryIso2: "DE",
    residency: "student_visa",
    headline: "MSc student at RWTH Aachen · Volunteer mentor",
    bio: `I'm in the second year of my MSc in Computational Engineering Science at RWTH Aachen. I mentor as a volunteer, so my sessions are free.

I'm happy to talk about what student life here is really like: finding a dorm or shared flat, registering your address, the course workload, and making friends when you don't speak much German yet. I'll share my own experience and always point you to official sources for rules and deadlines.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "rwth-aachen-university",
        title: "MSc Computational Engineering Science",
        isCurrent: true,
        startDate: "2024-10-01",
        verifyWith: "meera.pillai@rwth-aachen.de",
      },
    ],
    expertise: [
      "student-life",
      "dormitories",
      "housing-search",
      "international-student-experience",
      "academic-workload",
      "residence-registration-experience",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "malayalam", proficiency: "native" },
      { slug: "tamil", proficiency: "conversational" },
      { slug: "german", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [3], start: "18:00", end: "20:00" },
      { weekdays: [6], start: "11:00", end: "13:00" },
    ],
    services: [
      {
        title: "Student life in Aachen",
        description:
          "Ask me anything about studying and living in Aachen as an international student.",
        prices: [{ durationMin: 30, priceMinor: 0 }],
      },
    ],
    hostsEvents: true,
  },
  {
    key: "kabir",
    name: "Kabir Singh",
    timezone: "Europe/Berlin",
    countryIso2: "DE",
    residency: "work_authorised",
    headline: "MSc, TU Berlin · Data engineer in Berlin",
    bio: `I finished my MSc at TU Berlin in 2022 and now work as a data engineer here. Berlin is a great city to study in, but the first ninety days can be hard: finding a flat, the address registration appointment, a bank account, health insurance and a tax ID all depend on each other.

I'll walk you through the order I did things in, what I'd do differently, and how to spot common rental scams.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "technical-university-of-berlin",
        title: "MSc Computer Engineering",
        isCurrent: false,
        startDate: "2020-10-01",
        endDate: "2022-09-30",
        verifyWith: "kabir.singh@tu-berlin.de",
      },
    ],
    expertise: [
      "city-life",
      "housing-search",
      "rental-contracts-deposits",
      "banking",
      "residence-registration-experience",
      "cost-of-living",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "punjabi", proficiency: "native" },
      { slug: "hindi", proficiency: "fluent" },
      { slug: "german", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [1, 3, 5], start: "18:30", end: "21:00" },
      { weekdays: [7], start: "10:00", end: "12:00" },
    ],
    services: [
      {
        title: "Moving to Berlin: your first 90 days",
        description:
          "A practical walkthrough of flat hunting, registration, banking and insurance, in the order that worked for me.",
        prices: [{ durationMin: 45, priceMinor: 90_000 }],
      },
    ],
  },
  {
    key: "divya",
    name: "Divya Reddy",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Security engineer · IIIT Hyderabad",
    bio: `I work as a security engineer on cloud infrastructure, after studying computer science at IIIT Hyderabad. Security careers can look like a wall of certifications from the outside; in practice, the people who get hired can show they understand how systems break.

I help students and early-career engineers choose a direction — application security, cloud security or security operations — build a small portfolio of real work, and prepare for security interviews.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "iiit-hyderabad",
        title: "B.Tech and MS by Research, Computer Science",
        isCurrent: false,
        startDate: "2014-08-01",
        endDate: "2019-06-30",
        verifyWith: "divya.reddy@iiit.ac.in",
      },
      {
        kind: "work",
        companySlug: "siemens",
        title: "Security Engineer",
        isCurrent: true,
        startDate: "2021-01-11",
        verifyWith: "divya.reddy@siemens.com",
      },
    ],
    expertise: [
      "cybersecurity",
      "career-planning",
      "internship-preparation",
      "interview-preparation",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "telugu", proficiency: "native" },
      { slug: "hindi", proficiency: "fluent" },
    ],
    availability: [
      { weekdays: [1, 2, 4], start: "20:00", end: "22:00" },
      { weekdays: [6], start: "16:00", end: "19:00" },
    ],
    services: [
      {
        title: "Breaking into security",
        description:
          "Where to start, what to build, and how to present your work for a first security role.",
        prices: [{ durationMin: 45, priceMinor: 110_000 }],
      },
    ],
  },
  {
    key: "vikram",
    name: "Vikram Joshi",
    timezone: "Europe/Berlin",
    countryIso2: "DE",
    residency: "work_authorised",
    headline: "Doctoral researcher, LMU Munich · Research and PhD applications",
    bio: `I'm a doctoral researcher in computational biology at LMU Munich, after an M.Tech at IIT Madras. I help with research-focused applications: finding the right groups, writing to potential supervisors, research statements and statements of purpose, and preparing for PhD interviews.

I'm also happy to talk about what a doctorate in Germany is like day to day — funding, contracts and supervision styles vary a lot between groups.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "lmu-munich",
        title: "Doctoral candidate, Computational Biology",
        isCurrent: true,
        startDate: "2023-01-09",
        verifyWith: "vikram.joshi@lmu.de",
      },
      {
        kind: "education",
        universitySlug: "iit-madras",
        title: "M.Tech, Biotechnology",
        isCurrent: false,
        startDate: "2019-07-15",
        endDate: "2021-06-30",
      },
    ],
    expertise: [
      "research-guidance",
      "research-paper-guidance",
      "higher-education-guidance",
      "sop-feedback",
      "lor-guidance",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "marathi", proficiency: "native" },
      { slug: "hindi", proficiency: "fluent" },
      { slug: "german", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [2, 4], start: "17:00", end: "19:30" },
      { weekdays: [6], start: "10:00", end: "12:00" },
    ],
    services: [
      {
        title: "Research statements and PhD applications",
        description:
          "Feedback on your research statement or SOP, and a strategy for contacting potential supervisors.",
        prices: [{ durationMin: 60, priceMinor: 140_000 }],
      },
    ],
  },
  {
    key: "aisha",
    name: "Aisha Khan",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Frontend engineer · BITS Pilani",
    bio: `I've been building web applications professionally for six years, mostly with React and TypeScript, after studying at BITS Pilani. I review a lot of portfolios and GitHub profiles, and the same few changes make most of the difference.

Book me for a portfolio or GitHub review, frontend interview practice (JavaScript, React and a small UI exercise), or advice on contributing to open source for the first time.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "bits-pilani",
        title: "B.E. Computer Science",
        isCurrent: false,
        startDate: "2014-08-01",
        endDate: "2018-06-30",
        verifyWith: "aisha.khan@pilani.bits-pilani.ac.in",
      },
    ],
    expertise: [
      "web-development",
      "portfolio-review",
      "github-review",
      "open-source",
      "resume-cv-review",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "hindi", proficiency: "native" },
      { slug: "urdu", proficiency: "native" },
    ],
    availability: [
      { weekdays: [1, 3], start: "19:00", end: "21:30" },
      { weekdays: [6, 7], start: "11:00", end: "14:00" },
    ],
    services: [
      {
        title: "Portfolio and GitHub review",
        description:
          "Concrete feedback on your portfolio and two or three repositories, with a prioritised list of changes.",
        prices: [{ durationMin: 45, priceMinor: 90_000 }],
      },
      {
        title: "Frontend interview practice",
        description:
          "JavaScript and React questions plus a small UI exercise, followed by a debrief.",
        prices: [{ durationMin: 60, priceMinor: 120_000 }],
      },
    ],
  },
  {
    key: "nikhil",
    name: "Nikhil Bansal",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Cloud engineer · IIT Delhi",
    bio: `I work on cloud infrastructure after studying at IIT Delhi, and I mentor students and developers who want to move into cloud or DevOps roles.

We can map the skills that matter for entry-level roles, decide which certifications are worth your time, review a hands-on project, or practise the infrastructure and troubleshooting questions that come up in interviews.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "iit-delhi",
        title: "B.Tech, Electrical Engineering",
        isCurrent: false,
        startDate: "2013-07-15",
        endDate: "2017-05-31",
        verifyWith: "nikhil.bansal@iitd.ac.in",
      },
      {
        kind: "work",
        companySlug: "amazon",
        title: "Cloud Engineer",
        isCurrent: true,
        startDate: "2019-02-04",
        verifyWith: "nikhil.bansal@amazon.com",
      },
    ],
    expertise: ["cloud-devops", "software-engineering", "job-preparation", "interview-preparation"],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "hindi", proficiency: "native" },
      { slug: "punjabi", proficiency: "fluent" },
    ],
    availability: [
      { weekdays: [2, 3, 5], start: "20:00", end: "22:00" },
      { weekdays: [7], start: "10:00", end: "13:00" },
    ],
    services: [
      {
        title: "Cloud and DevOps career guidance",
        description:
          "Which skills and certifications matter for your first cloud role, and a hands-on project to prove them.",
        prices: [{ durationMin: 45, priceMinor: 100_000 }],
      },
    ],
  },
  {
    key: "pooja",
    name: "Pooja Srinivasan",
    timezone: "Europe/Berlin",
    countryIso2: "DE",
    residency: "work_authorised",
    headline: "MSc, KIT Karlsruhe · Engineer near Stuttgart",
    bio: `I did my MSc in Mechanical Engineering at KIT in Karlsruhe and now work in the automotive industry near Stuttgart. I help students compare German universities and programmes beyond the rankings: course structure, how much is taught in English, practical components and where graduates actually end up.

I can also help you plan applications through uni-assist or direct university portals, and think through scholarship options.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "karlsruhe-institute-of-technology",
        title: "MSc Mechanical Engineering",
        isCurrent: false,
        startDate: "2019-10-01",
        endDate: "2022-03-31",
        verifyWith: "pooja.srinivasan@kit.edu",
      },
    ],
    expertise: [
      "university-selection",
      "application-process",
      "scholarships",
      "uni-assist-vpd",
      "course-structure",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "tamil", proficiency: "native" },
      { slug: "german", proficiency: "conversational" },
    ],
    availability: [
      { weekdays: [2, 4], start: "18:00", end: "20:30" },
      { weekdays: [6], start: "09:30", end: "12:30" },
    ],
    services: [
      {
        title: "Choosing the right German programme",
        description:
          "A structured comparison of your shortlisted programmes, and an application plan with deadlines.",
        prices: [{ durationMin: 45, priceMinor: 100_000 }],
      },
    ],
  },
  {
    key: "rahul",
    name: "Rahul Deshpande",
    timezone: "Asia/Kolkata",
    countryIso2: "IN",
    residency: "citizen_or_pr",
    headline: "Software engineer · NIT Karnataka · Projects and internships",
    bio: `I graduated from NIT Karnataka in 2022 and work as a software engineer in Bengaluru. I mentor second- and third-year students on the things I wish I'd started earlier: choosing a final-year project that's worth putting on a resume, reaching out for internships, and a LinkedIn profile that recruiters actually read.`,
    affiliations: [
      {
        kind: "education",
        universitySlug: "nit-karnataka",
        title: "B.Tech, Information Technology",
        isCurrent: false,
        startDate: "2018-07-15",
        endDate: "2022-05-31",
        verifyWith: "rahul.deshpande@nitk.edu.in",
      },
    ],
    expertise: [
      "final-year-projects",
      "academic-projects",
      "internship-preparation",
      "linkedin-optimization",
    ],
    languages: [
      { slug: "english", proficiency: "fluent" },
      { slug: "kannada", proficiency: "native" },
      { slug: "marathi", proficiency: "fluent" },
      { slug: "hindi", proficiency: "fluent" },
    ],
    availability: [
      { weekdays: [1, 4], start: "19:00", end: "21:00" },
      { weekdays: [6, 7], start: "10:00", end: "12:00" },
    ],
    services: [
      {
        title: "Final-year project guidance",
        description:
          "Choose a project you can finish and explain well, then break it into weekly milestones.",
        prices: [{ durationMin: 45, priceMinor: 60_000 }],
      },
      {
        title: "LinkedIn and internship outreach",
        description: "A sharper LinkedIn profile and an outreach message that gets replies.",
        prices: [{ durationMin: 30, priceMinor: 50_000 }],
      },
    ],
  },
];

export const STUDENTS: StudentSeed[] = [
  {
    key: "ishaan",
    name: "Ishaan Verma",
    timezone: "Asia/Kolkata",
    headline: "Final-year B.Tech student in Pune · Planning an MSc in Germany",
  },
  { key: "kavya", name: "Kavya Rao", timezone: "Asia/Kolkata" },
  { key: "tanvi", name: "Tanvi Deshmukh", timezone: "Asia/Kolkata" },
  { key: "farhan", name: "Farhan Sheikh", timezone: "Asia/Kolkata" },
  { key: "riya", name: "Riya Chatterjee", timezone: "Asia/Kolkata" },
  { key: "siddharth", name: "Siddharth Menon", timezone: "Asia/Kolkata" },
  { key: "neha", name: "Neha Gupta", timezone: "Asia/Kolkata" },
  { key: "aarav", name: "Aarav Patel", timezone: "Asia/Kolkata" },
  { key: "zoya", name: "Zoya Mirza", timezone: "Europe/Berlin" },
  { key: "manav", name: "Manav Shah", timezone: "Asia/Kolkata" },
];

/** Past sessions, completed through the real attendance flow; `review: null` leaves it unreviewed. */
export type PastSessionSeed = {
  mentor: string;
  student: string;
  daysAgo: number;
  service: number;
  durationMin: number;
  rating?: number;
  review?: string | null;
};

export const PAST_SESSIONS: PastSessionSeed[] = [
  {
    mentor: "rohan",
    student: "siddharth",
    daysAgo: 56,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "The mock felt like a real interview. The debrief notes were the most useful part — three concrete things to fix, not a vague 'communicate more'.",
  },
  {
    mentor: "ananya",
    student: "kavya",
    daysAgo: 52,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Ananya went through my shortlist line by line and caught two programmes where my credits wouldn't meet the entry requirements. That alone saved me two application fees. Calm, organised and honest about what she didn't know.",
  },
  {
    mentor: "sneha",
    student: "zoya",
    daysAgo: 50,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "As someone switching from civil engineering, I needed a realistic plan, not a list of fifty courses. Sneha gave me exactly that.",
  },
  {
    mentor: "arjun",
    student: "tanvi",
    daysAgo: 47,
    service: 1,
    durationMin: 30,
    rating: 5,
    review:
      "Arjun was candid about what a move into product would take from my analyst role — and what it wouldn't. Refreshingly free of hype.",
  },
  {
    mentor: "aisha",
    student: "zoya",
    daysAgo: 45,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Aisha reviewed three of my repositories and gave me a prioritised list of changes. My portfolio finally looks professional.",
  },
  {
    mentor: "rohan",
    student: "aarav",
    daysAgo: 44,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Rohan picked a problem at exactly my level and pushed back on my database choice in a way that taught me something. Worth every rupee.",
  },
  {
    mentor: "meera",
    student: "riya",
    daysAgo: 42,
    service: 0,
    durationMin: 30,
    rating: 5,
    review:
      "So kind and so practical. Meera told me exactly how she found her room in a shared flat and what to watch out for in the contract.",
  },
  {
    mentor: "kabir",
    student: "siddharth",
    daysAgo: 40,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Kabir's order of operations for the first weeks in Berlin was gold. I had my registration appointment booked before I even landed.",
  },
  {
    mentor: "rahul",
    student: "neha",
    daysAgo: 39,
    service: 0,
    durationMin: 45,
    rating: 4,
    review:
      "Rahul helped me pick a project I can actually finish this semester and explain in interviews.",
  },
  {
    mentor: "ananya",
    student: "tanvi",
    daysAgo: 38,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Really practical session. I came in overwhelmed by the APS process and left with a checklist in the right order. It felt much less abstract afterwards.",
  },
  {
    mentor: "nikhil",
    student: "farhan",
    daysAgo: 37,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Nikhil helped me stop collecting certifications and build one real project instead. Clear, grounded advice.",
  },
  {
    mentor: "vikram",
    student: "tanvi",
    daysAgo: 36,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Detailed, kind feedback on my research statement. The advice on writing to supervisors got me two replies within a week.",
  },
  {
    mentor: "sneha",
    student: "kavya",
    daysAgo: 35,
    service: 1,
    durationMin: 60,
    rating: 4,
    review:
      "Detailed feedback on my forecasting project. Some of it was hard to hear, but she was right about the evaluation section.",
  },
  {
    mentor: "pooja",
    student: "riya",
    daysAgo: 34,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Pooja compared my three shortlisted programmes on things I hadn't even considered, like the internship component. Very well prepared.",
  },
  {
    mentor: "divya",
    student: "aarav",
    daysAgo: 33,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Divya helped me choose between application security and cloud security with real examples of what each job looks like.",
  },
  {
    mentor: "rohan",
    student: "neha",
    daysAgo: 31,
    service: 1,
    durationMin: 30,
    rating: 4,
    review:
      "Quick, direct resume feedback. My bullets are much stronger now — I just wish we'd had a little more time for the projects section.",
  },
  {
    mentor: "arjun",
    student: "manav",
    daysAgo: 29,
    service: 0,
    durationMin: 60,
    rating: 4,
    review:
      "A useful product-sense mock. His feedback on structuring my answer was spot on; the second half felt a little rushed.",
  },
  {
    mentor: "aisha",
    student: "siddharth",
    daysAgo: 28,
    service: 1,
    durationMin: 60,
    rating: 5,
    review:
      "A realistic frontend mock with a small UI task. Her debrief on accessibility covered things nobody had mentioned to me before.",
  },
  {
    mentor: "meera",
    student: "zoya",
    daysAgo: 26,
    service: 0,
    durationMin: 30,
    rating: 5,
    review:
      "Meera answered every question about Aachen honestly, including the hard parts. I feel much more prepared.",
  },
  {
    mentor: "ananya",
    student: "farhan",
    daysAgo: 24,
    service: 0,
    durationMin: 30,
    rating: 4,
    review:
      "Good feedback on the structure of my statement of purpose. I would have liked more time on the motivation section, but the half hour was well used.",
  },
  {
    mentor: "rahul",
    student: "manav",
    daysAgo: 23,
    service: 1,
    durationMin: 30,
    rating: 5,
    review:
      "My LinkedIn headline and outreach message are so much better now. Two replies from recruiters in the first week.",
  },
  {
    mentor: "nikhil",
    student: "aarav",
    daysAgo: 22,
    service: 0,
    durationMin: 45,
    rating: 4,
    review:
      "A good overview of entry-level cloud roles and what the interviews actually look like.",
  },
  {
    mentor: "sneha",
    student: "ishaan",
    daysAgo: 21,
    service: 0,
    durationMin: 45,
    rating: 5,
    review:
      "Sneha asked what I actually enjoy before suggesting anything. I left with a three-month plan I believe I can stick to.",
  },
  {
    mentor: "kabir",
    student: "neha",
    daysAgo: 19,
    service: 0,
    durationMin: 45,
    rating: 4,
    review:
      "Very helpful on flat hunting and scam red flags. A few banking details had changed since his move, which he pointed out himself.",
  },
  {
    mentor: "rohan",
    student: "manav",
    daysAgo: 17,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Structured, patient and realistic. I cleared my next onsite system design round two weeks later.",
  },
  {
    mentor: "divya",
    student: "kavya",
    daysAgo: 15,
    service: 0,
    durationMin: 45,
    rating: 4,
    review:
      "Good guidance on building a small portfolio. I'd have liked more interview-specific tips, so I'll book again for that.",
  },
  {
    mentor: "sneha",
    student: "aarav",
    daysAgo: 13,
    service: 1,
    durationMin: 60,
    rating: 5,
    review: "Very thorough. She spotted data leakage in my model that I'd completely missed.",
  },
  {
    mentor: "rahul",
    student: "zoya",
    daysAgo: 12,
    service: 0,
    durationMin: 45,
    rating: 5,
    review: "Very approachable, and great at breaking a big project into weekly milestones.",
  },
  {
    mentor: "ananya",
    student: "riya",
    daysAgo: 11,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Honest and specific. She told me my first-choice programme was a long shot and helped me find two that fit my background much better.",
  },
  {
    mentor: "vikram",
    student: "manav",
    daysAgo: 10,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "An honest perspective on doing a doctorate in Germany, including contracts and funding. Exactly the conversation I needed.",
  },
  {
    mentor: "rohan",
    student: "ishaan",
    daysAgo: 9,
    service: 1,
    durationMin: 30,
    rating: 5,
    review:
      "Rohan rewrote two of my bullet points live and the difference was obvious. Clear about what recruiters actually skim for.",
  },
  {
    mentor: "arjun",
    student: "neha",
    daysAgo: 8,
    service: 0,
    durationMin: 60,
    rating: 5,
    review:
      "Two mocks in, my answers finally have a clear structure. Great at explaining why an answer works, not just what to say.",
  },
  {
    mentor: "aisha",
    student: "riya",
    daysAgo: 7,
    service: 0,
    durationMin: 45,
    rating: 4,
    review:
      "Helpful and specific. A couple of suggestions were beyond my current level, but she explained them well.",
  },
  { mentor: "meera", student: "farhan", daysAgo: 6, service: 0, durationMin: 30, review: null },
  {
    mentor: "pooja",
    student: "kavya",
    daysAgo: 5,
    service: 0,
    durationMin: 45,
    rating: 5,
    review: "Thoughtful and organised. I left with a clear application order and deadlines.",
  },
  { mentor: "kabir", student: "ishaan", daysAgo: 3, service: 0, durationMin: 45, review: null },
];

export type UpcomingSessionSeed = {
  mentor: string;
  student: string;
  inDays: number;
  service: number;
  durationMin: number;
  /** The student cancels it well in advance, so the full-refund path shows in their history. */
  cancelled?: boolean;
};

export const UPCOMING_SESSIONS: UpcomingSessionSeed[] = [
  { mentor: "ananya", student: "ishaan", inDays: 1, service: 1, durationMin: 30 },
  { mentor: "sneha", student: "zoya", inDays: 2, service: 0, durationMin: 45 },
  { mentor: "rohan", student: "ishaan", inDays: 3, service: 0, durationMin: 60 },
  { mentor: "ananya", student: "kavya", inDays: 4, service: 0, durationMin: 60 },
  { mentor: "kabir", student: "farhan", inDays: 5, service: 0, durationMin: 45 },
  { mentor: "aisha", student: "ishaan", inDays: 5, service: 0, durationMin: 45, cancelled: true },
  { mentor: "rohan", student: "siddharth", inDays: 6, service: 1, durationMin: 30 },
  { mentor: "meera", student: "neha", inDays: 7, service: 0, durationMin: 30 },
  { mentor: "pooja", student: "ishaan", inDays: 8, service: 0, durationMin: 45 },
  { mentor: "ananya", student: "tanvi", inDays: 9, service: 0, durationMin: 30 },
];

export type EventSeed = {
  host: string;
  title: string;
  description: string;
  inDays: number;
  localStart: string;
  durationMin: number;
  capacity: number;
  attendees: string[];
};

export const EVENTS: EventSeed[] = [
  {
    host: "ananya",
    title: "Germany MSc applications for winter 2027: open Q&A",
    description: `An open Q&A for students applying to German master's programmes for the winter 2027 intake. We'll cover shortlisting, the APS and uni-assist steps as I experienced them, statements of purpose and timelines. Bring your questions — there are no slides.

This is personal experience, not official advice. Always confirm requirements with the university and official sources.`,
    inDays: 6,
    localStart: "16:00",
    durationMin: 60,
    capacity: 50,
    attendees: ["ishaan", "kavya", "tanvi", "farhan", "riya", "zoya", "siddharth"],
  },
  {
    host: "meera",
    title: "Student life in Aachen: housing, dorms and your first month",
    description: `A relaxed session on what my first month in Aachen looked like: finding a room, registering my address, getting around, and settling into the course. There's plenty of time for questions at the end.`,
    inDays: 11,
    localStart: "18:00",
    durationMin: 45,
    capacity: 25,
    attendees: ["riya", "zoya", "neha", "manav", "aarav"],
  },
  {
    host: "rohan",
    title: "Approaching a system design interview: a live walkthrough",
    description: `I'll work through a realistic system design problem from start to finish — clarifying requirements, rough capacity estimates, the high-level design and one or two deep dives — and explain my thinking as I go. The last fifteen minutes are for questions.`,
    inDays: 13,
    localStart: "19:30",
    durationMin: 60,
    capacity: 12,
    attendees: [
      "ishaan",
      "siddharth",
      "aarav",
      "neha",
      "manav",
      "kavya",
      "farhan",
      "tanvi",
      "riya",
    ],
  },
];

export type GroupSessionSeed = {
  host: string;
  title: string;
  description: string;
  inDays: number;
  localStart: string;
  durationMin: number;
  capacity: number;
  minParticipants: number;
  targetTotalMinor: number;
  attendees: string[];
};

export const GROUP_SESSIONS: GroupSessionSeed[] = [
  {
    host: "sneha",
    title: "Data science portfolio clinic (small group)",
    description: `A small-group session for up to six people. Each participant gets about ten minutes of focused feedback on one data science project, and everyone learns from the others' reviews. Share a link to your project when you book.`,
    inDays: 9,
    localStart: "19:00",
    durationMin: 90,
    capacity: 6,
    minParticipants: 3,
    targetTotalMinor: 300_000,
    attendees: ["zoya", "aarav"],
  },
];

export const SAVED_MENTORS: { student: string; mentors: string[] }[] = [
  { student: "ishaan", mentors: ["ananya", "vikram", "pooja"] },
];

export type GuideSeed = {
  author: string;
  title: string;
  dek: string;
  categorySlug: string;
  countryIso2: string | null;
  disclaimerKind: "immigration" | "legal" | "financial" | "medical" | null;
  appliesToIntake: string | null;
  sources: { url: string; publisher: string; isOfficial: boolean }[];
  body: string;
};

export const GUIDES: GuideSeed[] = [
  {
    author: "ananya",
    title: "The APS certificate, as I experienced it",
    dek: "What the APS verification looked like for me as an Indian applicant to German master's programmes — the order of steps, the documents, and what I'd do differently.",
    categorySlug: "aps-certificate",
    countryIso2: "DE",
    disclaimerKind: "immigration",
    appliesToIntake: "Winter 2027",
    sources: [
      {
        url: "https://aps-india.de/",
        publisher: "Akademische Prüfstelle (APS) India",
        isOfficial: true,
      },
      { url: "https://india.diplo.de/", publisher: "German Missions in India", isOfficial: true },
    ],
    body: `If you're applying to German universities with an Indian bachelor's degree, you will very likely need an APS certificate. For me it was the first real step — both my universities and my visa appointment expected it — so I wish I had started earlier.

What the process looked like for me
I created an account on the APS India website, filled in the application, uploaded my documents and paid the fee. The review then took several weeks. Friends who applied in the peak months before winter-semester deadlines waited noticeably longer than I did.

Documents I prepared
My degree certificate and semester transcripts, school-leaving certificates, and a passport copy. The exact list, the required format and the fee change from time to time, so please work from the current checklist on the official APS India website rather than from this list.

What I'd do differently
Start as soon as your transcripts are available. Keep every scan in one folder with clear file names. Read the official instructions twice before uploading — small mistakes caused delays for two of my friends. And plan your university deadlines around the APS timeline, not the other way round.

This is my personal experience, not official advice. Requirements, fees and processing times change; always confirm with APS India and the German Missions in India.`,
  },
  {
    author: "kabir",
    title: "Opening a blocked account for a German student visa: what to expect",
    dek: "Why most applicants need one, how I compared providers, and the paperwork that depends on it.",
    categorySlug: "banking",
    countryIso2: "DE",
    disclaimerKind: "financial",
    appliesToIntake: null,
    sources: [
      { url: "https://india.diplo.de/", publisher: "German Missions in India", isOfficial: true },
      {
        url: "https://www.study-in-germany.de/en/",
        publisher: "Study in Germany (DAAD)",
        isOfficial: true,
      },
    ],
    body: `A blocked account (Sperrkonto) is the most common way to show that you can support yourself while studying in Germany. You deposit the required amount before your visa appointment, and once you arrive you can withdraw a fixed amount each month.

The amount is set by the German government and is updated regularly, so check the current figure with the German Missions in India before you transfer anything. Don't rely on a number from a blog post — including this one.

Choosing a provider
Several providers offer blocked accounts for international students. When I compared them I looked at the one-time setup fee, the monthly fee, how quickly they issued the confirmation letter I needed for my visa application, and how easy it was to activate the account after arriving.

What depends on it
The confirmation letter goes into your visa application. After you arrive, activating the account usually needs your German address, which means your address registration and your blocked account are linked — so plan your first weeks with that in mind.

This is my experience from my own move, not financial or legal advice. Rules and amounts change; confirm the current requirements with official sources.`,
  },
  {
    author: "ananya",
    title: "Budgeting for student life in Munich",
    dek: "Where my money actually went in my first year, and the decisions that made the biggest difference.",
    categorySlug: "cost-of-living",
    countryIso2: "DE",
    disclaimerKind: "financial",
    appliesToIntake: null,
    sources: [
      {
        url: "https://www.study-in-germany.de/en/",
        publisher: "Study in Germany (DAAD)",
        isOfficial: true,
      },
      { url: "https://www.muenchen.de/", publisher: "City of Munich", isOfficial: true },
    ],
    body: `Munich is one of the more expensive cities to study in Germany, and almost all of that difference comes from rent. Everything else felt manageable once I had a routine.

Rent was my biggest cost by far
In my first year, rent took up about half of my monthly spending. Student residences are the most affordable option, but the waiting lists can be long, so apply as early as the halls allow. I lived in a shared flat for a year before a dorm room became available.

Costs that surprised me
Health insurance is mandatory and is a fixed monthly amount. The deposit for a room can equal several months of rent, and you'll pay it at the same time as your first rent — plan for that. The semester contribution you pay the university includes a public transport ticket, which saves a lot.

What helped
Cooking most meals, buying second-hand furniture, and tracking everything in a simple spreadsheet for the first three months. After that I knew my real monthly number and stopped worrying.

This reflects my own spending, not advice. Prices change every year; use official sources and current listings when you plan.`,
  },
  {
    author: "rohan",
    title: "Preparing for a system design interview in six weeks",
    dek: "A week-by-week plan I give to engineers with two to five years of experience.",
    categorySlug: "system-design",
    countryIso2: null,
    disclaimerKind: null,
    appliesToIntake: null,
    sources: [
      {
        url: "https://github.com/donnemartin/system-design-primer",
        publisher: "The System Design Primer",
        isOfficial: false,
      },
      {
        url: "https://www.techinterviewhandbook.org/",
        publisher: "Tech Interview Handbook",
        isOfficial: false,
      },
    ],
    body: `System design interviews reward structure more than memorised architectures. Six focused weeks is enough to get comfortable if you practise out loud.

Weeks 1–2: fundamentals
Load balancing, caching, databases and when to shard them, queues, and consistency trade-offs. For each topic, be able to explain when you would not use it.

Weeks 3–4: one problem every two days
Pick common problems — a URL shortener, a news feed, a chat system, a rate limiter. Time yourself: five minutes on requirements, five on estimates, fifteen on the high-level design, fifteen on deep dives. Write down what you skipped.

Week 5: mock interviews
Do at least three mocks with someone who will interrupt you. Interviewers care about how you respond to new constraints far more than whether your first design was perfect.

Week 6: review and rest
Revisit your notes, redo your two weakest problems, and don't cram the night before.

The most common mistake I see is jumping straight to boxes and arrows. Clarify the requirements first — it changes everything that follows.`,
  },
  {
    author: "vikram",
    title: "Writing a statement of purpose for a German master's programme",
    dek: "How to make your SOP specific to the programme, and the mistakes I see most often.",
    categorySlug: "sop-feedback",
    countryIso2: "DE",
    disclaimerKind: null,
    appliesToIntake: null,
    sources: [
      { url: "https://www.daad.de/en/", publisher: "DAAD", isOfficial: true },
      {
        url: "https://www.study-in-germany.de/en/",
        publisher: "Study in Germany (DAAD)",
        isOfficial: true,
      },
    ],
    body: `A strong statement of purpose answers three questions: why this subject, why this programme, and why now. Admissions committees read hundreds of them, so specificity is what makes yours memorable.

Start from the programme, not from yourself
Read the curriculum and module handbook. Name two or three modules or research areas that genuinely match your background, and explain what you would bring to them. Generic praise of the university's reputation adds nothing.

Show, don't list
Instead of listing skills, describe one project or experience in enough detail that the reader understands what you did and what you learned from it.

Respect the format
Follow the length and format each university asks for exactly. If they ask for a letter of motivation rather than an essay, write a letter.

Mistakes I see often
Opening with a childhood story, repeating the CV, and sending the same text to every programme with only the name changed.

Every university sets its own requirements. Check each programme's official page for the current guidelines.`,
  },
];
