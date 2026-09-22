import type { MentorProfileDetail } from "./mentor-detail";

export type MentorProfilePageDto = {
  slug: string;
  displayName: string;
  headline: string | null;
  bioMd: string | null;
  countryIso2: string | null;
  isListed: boolean;
  affiliations: {
    kind: string;
    title: string;
    isCurrent: boolean;
    organizationName: string | null;
    organizationSlug: string | null;
  }[];
  expertise: { slug: string; name: string }[];
  languages: { slug: string; name: string; proficiency: string }[];
  links: { kind: string; url: string }[];
  stats: {
    sessionsCompleted: number;
    reliabilityPct: number;
    reviewCount: number;
    avgRating: string | null;
  };
};

export function toMentorProfilePageDto(detail: MentorProfileDetail): MentorProfilePageDto {
  return {
    slug: detail.profile.slug,
    displayName: detail.displayName,
    headline: detail.profile.headline,
    bioMd: detail.profile.bioMd,
    countryIso2: detail.countryIso2,
    isListed: detail.profile.isListed,
    affiliations: detail.affiliations.map((a) => ({
      kind: a.kind,
      title: a.title,
      isCurrent: a.isCurrent,
      organizationName: a.organizationName,
      organizationSlug: a.organizationSlug,
    })),
    expertise: detail.expertise.map((e) => ({ slug: e.slug, name: e.name })),
    languages: detail.languages.map((l) => ({
      slug: l.slug,
      name: l.name,
      proficiency: l.proficiency,
    })),
    links: detail.links.map((l) => ({ kind: l.kind, url: l.url })),
    stats: {
      sessionsCompleted: detail.stats?.sessionsCompleted ?? 0,
      reliabilityPct: detail.stats?.reliabilityPct ?? 100,
      reviewCount: detail.stats?.reviewCount ?? 0,
      avgRating: detail.stats?.avgRating ?? null,
    },
  };
}
