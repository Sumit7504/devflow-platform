import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const routeTitles = [
  { pattern: /^\/$/, title: "DevFlow — Hiring & Assessment Platform" },
  { pattern: /^\/login$/, title: "DevFlow — Log In" },
  { pattern: /^\/register$/, title: "DevFlow — Register" },
  { pattern: /^\/unauthorized$/, title: "DevFlow — Unauthorized" },
  { pattern: /^\/notifications$/, title: "DevFlow — Notifications" },

  // Candidate routes
  { pattern: /^\/candidate$/, title: "DevFlow — Candidate Dashboard" },
  { pattern: /^\/candidate\/jobs\/[^/]+\/assessment$/, title: "DevFlow — Assessment Intro" },
  { pattern: /^\/candidate\/jobs\/[^/]+$/, title: "DevFlow — Job Details" },
  { pattern: /^\/candidate\/jobs$/, title: "DevFlow — Browse Jobs" },
  { pattern: /^\/candidate\/applications\/[^/]+$/, title: "DevFlow — Application Details" },
  { pattern: /^\/candidate\/applications$/, title: "DevFlow — My Applications" },
  { pattern: /^\/candidate\/attempts\/[^/]+$/, title: "DevFlow — Assessment Attempt" },
  { pattern: /^\/candidate\/attempts$/, title: "DevFlow — My Assessments" },
  { pattern: /^\/candidate\/interviews$/, title: "DevFlow — My Interviews" },

  // Recruiter routes
  { pattern: /^\/recruiter$/, title: "DevFlow — Recruiter Dashboard" },
  { pattern: /^\/recruiter\/company$/, title: "DevFlow — Company Profile" },
  { pattern: /^\/recruiter\/jobs\/new$/, title: "DevFlow — Post New Job" },
  { pattern: /^\/recruiter\/jobs\/[^/]+\/edit$/, title: "DevFlow — Edit Job" },
  { pattern: /^\/recruiter\/jobs\/[^/]+\/applicants$/, title: "DevFlow — Job Applicants" },
  { pattern: /^\/recruiter\/jobs\/[^/]+\/assessment$/, title: "DevFlow — Manage Assessment" },
  { pattern: /^\/recruiter\/jobs$/, title: "DevFlow — Manage Jobs" },
  { pattern: /^\/recruiter\/applications\/[^/]+\/interview\/new$/, title: "DevFlow — Propose Interview" },
  { pattern: /^\/recruiter\/applications\/[^/]+$/, title: "DevFlow — Review Application" },
  { pattern: /^\/recruiter\/assessments\/[^/]+\/attempts$/, title: "DevFlow — Assessment Submissions" },
  { pattern: /^\/recruiter\/attempts\/[^/]+$/, title: "DevFlow — Candidate Attempt" },
  { pattern: /^\/recruiter\/interviews\/[^/]+$/, title: "DevFlow — Interview Details" },
  { pattern: /^\/recruiter\/interviews$/, title: "DevFlow — Manage Interviews" },

  // Admin routes
  { pattern: /^\/admin$/, title: "DevFlow — Admin Dashboard" },
  { pattern: /^\/admin\/users\/[^/]+$/, title: "DevFlow — User Details" },
  { pattern: /^\/admin\/users$/, title: "DevFlow — User Management" },
  { pattern: /^\/admin\/jobs$/, title: "DevFlow — Platform Jobs" },
];

export default function RouteTitle() {
  const location = useLocation();

  useEffect(() => {
    const match = routeTitles.find((item) => item.pattern.test(location.pathname));
    document.title = match ? match.title : "DevFlow — Hiring & Assessment Platform";
  }, [location.pathname]);

  return null;
}
