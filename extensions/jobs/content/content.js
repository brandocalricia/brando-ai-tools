const BUTTON_CLASS = "brando-analyze-btn";

// Site-specific selectors for extracting job text
const SITE_SELECTORS = {
  linkedin: {
    jobText: [
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".job-view-layout",
    ],
    container: [
      ".jobs-unified-top-card",
      ".job-view-layout",
      ".jobs-search__job-details",
    ],
  },
  indeed: {
    jobText: [
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      '[data-testid="jobsearch-JobComponent-description"]',
    ],
    container: [
      ".jobsearch-JobComponent",
      '[data-testid="jobsearch-ViewJobLayout"]',
      ".jobsearch-RightPane",
    ],
  },
  glassdoor: {
    jobText: [
      '[class*="JobDescription"]',
      ".desc",
      '[data-test="jobDescriptionContent"]',
    ],
    container: [
      '[class*="JobDetails"]',
      '[class*="jobDetails"]',
      ".jobDescriptionWrapper",
    ],
  },
};

function getSite() {
  const