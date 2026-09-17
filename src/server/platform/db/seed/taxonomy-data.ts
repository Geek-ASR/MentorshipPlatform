import type { TaxonomyFlags } from "../tables/reference";

export type TaxonomySeedNode = {
  slug: string;
  name: string;
  flags?: TaxonomyFlags;
  children?: TaxonomySeedNode[];
};

const leaf = (slug: string, name: string, flags?: TaxonomyFlags): TaxonomySeedNode => ({
  slug,
  name,
  flags,
});

/**
 * Initial category tree (brief §2–3). Admins extend it at runtime; this seed only inserts missing
 * terms and never overwrites edits. Visa-related terms are framed as personal experience and flagged
 * so disclaimers apply (docs/12 §8, §14).
 */
export const CATEGORY_TREE: TaxonomySeedNode[] = [
  {
    slug: "career-academic",
    name: "Career & Academic",
    children: [
      leaf("job-preparation", "Job preparation"),
      leaf("internship-preparation", "Internship preparation"),
      leaf("resume-cv-review", "Resume / CV review"),
      leaf("linkedin-optimization", "LinkedIn optimization"),
      leaf("interview-preparation", "Interview preparation"),
      leaf("technical-interviews", "Technical interviews"),
      leaf("system-design", "System design"),
      leaf("software-engineering", "Software engineering"),
      leaf("web-development", "Web development"),
      leaf("ai-ml", "AI / Machine learning"),
      leaf("data-science", "Data science"),
      leaf("cybersecurity", "Cybersecurity"),
      leaf("blockchain", "Blockchain"),
      leaf("cloud-devops", "Cloud & DevOps"),
      leaf("product-management", "Product management"),
      leaf("career-switching", "Career switching"),
      leaf("freelancing", "Freelancing"),
      leaf("startup-advice", "Startup advice"),
      leaf("research-guidance", "Research guidance"),
      leaf("research-paper-guidance", "Research paper guidance"),
      leaf("academic-projects", "Academic projects"),
      leaf("final-year-projects", "Final-year projects"),
      leaf("portfolio-review", "Portfolio review"),
      leaf("github-review", "GitHub review"),
      leaf("open-source", "Open-source contribution"),
      leaf("higher-education-guidance", "Higher education guidance"),
      leaf("career-planning", "Career planning"),
    ],
  },
  {
    slug: "study-abroad",
    name: "Study Abroad",
    children: [
      {
        slug: "university-life",
        name: "University life",
        children: [
          leaf("university-experience", "University experience"),
          leaf("course-structure", "Course structure"),
          leaf("professors-teaching", "Professors & teaching"),
          leaf("academic-workload", "Academic workload"),
          leaf("exams", "Exams"),
          leaf("student-life", "Student & campus life"),
          leaf("international-student-experience", "International student experience"),
        ],
      },
      {
        slug: "admissions",
        name: "Admissions",
        children: [
          leaf("application-process", "Application process"),
          leaf("sop-feedback", "SOP feedback"),
          leaf("lor-guidance", "LOR guidance"),
          leaf("cv-for-admissions", "CV for admissions"),
          leaf("university-selection", "University selection"),
          leaf("application-strategy", "Application strategy"),
          leaf("deadlines-requirements", "Deadlines & requirements"),
          leaf("scholarships", "Scholarships"),
          leaf("aps-certificate", "APS certificate (experience)", {
            sensitiveTopic: "immigration",
          }),
          leaf("uni-assist-vpd", "uni-assist & VPD"),
        ],
      },
      {
        slug: "visa-process-experience",
        name: "Visa process — personal experience",
        flags: { sensitiveTopic: "immigration" },
        children: [
          leaf("visa-documentation-experience", "Documentation I prepared", {
            sensitiveTopic: "immigration",
          }),
          leaf("visa-interview-experience", "Visa interview experience", {
            sensitiveTopic: "immigration",
          }),
          leaf("residence-registration-experience", "Residence permit & registration experience", {
            sensitiveTopic: "immigration",
          }),
        ],
      },
      {
        slug: "accommodation",
        name: "Accommodation",
        children: [
          leaf("dormitories", "Dormitories"),
          leaf("private-accommodation", "Private accommodation"),
          leaf("shared-apartments", "Shared apartments"),
          leaf("housing-search", "Housing platforms & search"),
          leaf("rental-contracts-deposits", "Rental contracts & deposits", {
            sensitiveTopic: "legal",
          }),
        ],
      },
      {
        slug: "local-life",
        name: "Local life",
        children: [
          leaf("city-life", "City life"),
          leaf("public-transport", "Public transport"),
          leaf("cost-of-living", "Cost of living", { sensitiveTopic: "financial" }),
          leaf("groceries-food", "Groceries & food"),
          leaf("student-jobs", "Student jobs", { sensitiveTopic: "immigration" }),
          leaf("weather", "Weather"),
          leaf("safety", "Safety"),
          leaf("culture-language", "Culture & language"),
          leaf("banking", "Banking", { sensitiveTopic: "financial" }),
          leaf("sim-cards", "SIM cards"),
          leaf("healthcare-navigation", "Healthcare navigation", { sensitiveTopic: "medical" }),
        ],
      },
    ],
  },
];
