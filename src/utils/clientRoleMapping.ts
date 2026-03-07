// Client role mapping utility
// This file contains the mapping between internal roles and client-facing roles
// Based on the prisma/client_roles.json file

export interface ClientRoleMapping {
  Role: string;
  "Naming in PM": string;
  "Client role": string;
}

export const clientRolesMapping: ClientRoleMapping[] = [
  {
    "Role": "Associate Software Developer L1, Core Technologies",
    "Naming in PM": "Junior",
    "Client role": "Junior Developer"
  },
  {
    "Role": "Associate Software Developer L2, Core Technologies",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Developer"
  },
  {
    "Role": "Software Developer, Core Technologies",
    "Naming in PM": "Middle",
    "Client role": "Middle Developer"
  },
  {
    "Role": "Senior Software Developer, Core Technologies",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Developer"
  },
  {
    "Role": "Principal Software Developer, Core Technologies",
    "Naming in PM": "Senior",
    "Client role": "Senior Developer"
  },
  {
    "Role": "Team Lead, Core Technologies",
    "Naming in PM": "Team lead",
    "Client role": "Team Lead, Core Technologies"
  },
  {
    "Role": "Technical Architect, Core Technologies",
    "Naming in PM": "Middle Architect",
    "Client role": "Middle Architect"
  },
  {
    "Role": "Senior Technical Architect, Core Technologies",
    "Naming in PM": "Senior Architect",
    "Client role": "Senior Architect"
  },
  {
    "Role": "Associate Software Developer L1, Advanced Technologies",
    "Naming in PM": "Junior",
    "Client role": "Junior Developer"
  },
  {
    "Role": "Associate Software Developer L2, Advanced Technologies",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Developer"
  },
  {
    "Role": "Software Developer, Advanced Technologies",
    "Naming in PM": "Middle",
    "Client role": "Middle Developer"
  },
  {
    "Role": "Senior Software Developer, Advanced Technologies",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Developer"
  },
  {
    "Role": "Principal Software Developer, Advanced Technologies",
    "Naming in PM": "Senior",
    "Client role": "Senior Developer"
  },
  {
    "Role": "Team Lead, Advanced Technologies",
    "Naming in PM": "Team lead",
    "Client role": "Team Lead, Advanced Technologies"
  },
  {
    "Role": "Technical Architect, Advanced Technologies",
    "Naming in PM": "Middle Architect",
    "Client role": "Middle Architect"
  },
  {
    "Role": "Senior Technical Architect, Advanced Technologies",
    "Naming in PM": "Senior Architect",
    "Client role": "Senior Architect"
  },
  {
    "Role": "Associate DevOps Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Developer"
  },
  {
    "Role": "Associate DevOps Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Developer"
  },
  {
    "Role": "DevOps Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle Developer"
  },
  {
    "Role": "Senior DevOps Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Developer"
  },
  {
    "Role": "Principal DevOps Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior Developer"
  },
  {
    "Role": "DevOps Team Lead",
    "Naming in PM": "",
    "Client role": "DevOps Team Lead"
  },
  {
    "Role": "DevOps Architect",
    "Naming in PM": "",
    "Client role": "DevOps Architect"
  },
  {
    "Role": "Senior DevOps Architect",
    "Naming in PM": "",
    "Client role": "Senior DevOps Architect"
  },
  {
    "Role": "Associate QA Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior QA Engineer"
  },
  {
    "Role": "Associate QA Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior QA Engineer"
  },
  {
    "Role": "QA Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle QA Engineer"
  },
  {
    "Role": "Senior QA Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle QA Engineer"
  },
  {
    "Role": "Principal QA Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior QA Engineer"
  },
  {
    "Role": "QA Manager",
    "Naming in PM": "Expert/Lead",
    "Client role": "Lead QA Manager"
  },
  {
    "Role": "Associate Performance Test Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Performance Test Engineer"
  },
  {
    "Role": "Associate Performance Test Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Performance Test Engineer"
  },
  {
    "Role": "Performance Test Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle Performance Test Engineer"
  },
  {
    "Role": "Senior Performance Test Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Performance Test Engineer"
  },
  {
    "Role": "Principal Performance Test Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior Performance Test Engineer"
  },
  {
    "Role": "Associate Test Automation Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior QA Automation"
  },
  {
    "Role": "Associate Test Automation Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior QA Automation"
  },
  {
    "Role": "Test Automation Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle QA Automation"
  },
  {
    "Role": "Senior Automation Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle QA Automation"
  },
  {
    "Role": "Principal Automation Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior QA Automation"
  },
  {
    "Role": "Test Automation Architect",
    "Naming in PM": "Expert/Lead",
    "Client role": "QA Automation Architect"
  },
  {
    "Role": "Technical Writer",
    "Naming in PM": "Tech Writer",
    "Client role": "Tech Writer Technical Writer"
  },
  {
    "Role": "Associate Business Analyst",
    "Naming in PM": "Junior - Strong Junior",
    "Client role": "Strong Junior Business Analyst"
  },
  {
    "Role": "Business Analyst",
    "Naming in PM": "Middle",
    "Client role": "Middle Business Analyst"
  },
  {
    "Role": "Senior Business Analyst",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Business Analyst"
  },
  {
    "Role": "Principal Business Analyst",
    "Naming in PM": "Senior",
    "Client role": "Senior Business Analyst"
  },
  {
    "Role": "Discovery Business Analyst",
    "Naming in PM": "Middle Discovery",
    "Client role": "Middle Discovery Business Analyst"
  },
  {
    "Role": "Senior Discovery Business Analyst",
    "Naming in PM": "Senior Discovery",
    "Client role": "Senior Discovery Business Analyst"
  },
  {
    "Role": "Solution Architect",
    "Naming in PM": "Middle",
    "Client role": "Middle Architect"
  },
  {
    "Role": "Senior Solution Architect",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Architect"
  },
  {
    "Role": "Principal Solution Architect",
    "Naming in PM": "Senior",
    "Client role": "Senior Architect"
  },
  {
    "Role": "Solution Consultant",
    "Naming in PM": "Middle",
    "Client role": "Middle Solution Consultant"
  },
  {
    "Role": "Senior Solution Consultant",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Solution Consultant"
  },
  {
    "Role": "Principal Solution Consultant",
    "Naming in PM": "Senior",
    "Client role": "Senior Solution Consultant"
  },
  {
    "Role": "Associate Project Manager L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Project Manager"
  },
  {
    "Role": "Associate Project Manager L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Project Manager"
  },
  {
    "Role": "Project Manager",
    "Naming in PM": "Middle",
    "Client role": "Middle Project Manager"
  },
  {
    "Role": "Senior Project Manager",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Project Manager"
  },
  {
    "Role": "Principal Project Manager",
    "Naming in PM": "Senior",
    "Client role": "Senior Project Manager"
  },
  {
    "Role": "Program Manager",
    "Naming in PM": "",
    "Client role": "Program Manager"
  },
  {
    "Role": "Senior Program Manager",
    "Naming in PM": "",
    "Client role": "Senior Program Manager"
  },
  {
    "Role": "Principal Program Manager",
    "Naming in PM": "",
    "Client role": "Principal Program Manager"
  },
  {
    "Role": "Delivery Manager",
    "Naming in PM": "",
    "Client role": "Delivery Manager"
  },
  {
    "Role": "Senior Delivery Manager",
    "Naming in PM": "",
    "Client role": "Senior Delivery Manager"
  },
  {
    "Role": "Engagement Manager",
    "Naming in PM": "",
    "Client role": "Engagement Manager"
  },
  {
    "Role": "Senior Engagement Manager",
    "Naming in PM": "",
    "Client role": "Senior Engagement Manager"
  },
  {
    "Role": "Associate Product Owner",
    "Naming in PM": "Junior/Strong Junior",
    "Client role": "Strong Junior Product Owner"
  },
  {
    "Role": "Product Owner",
    "Naming in PM": "Middle",
    "Client role": "Middle Product Owner"
  },
  {
    "Role": "Senior Product Owner",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Product Owner"
  },
  {
    "Role": "Principal Product Owner",
    "Naming in PM": "Senior",
    "Client role": "Senior Product Owner"
  },
  {
    "Role": "Associate Developer, ML/Data Science",
    "Naming in PM": "Junior/Strong Junior",
    "Client role": "Strong Junior AI/ML Engineer"
  },
  {
    "Role": "Developer, ML/Data Science",
    "Naming in PM": "Middle",
    "Client role": "Middle AI/ML Engineer"
  },
  {
    "Role": "Senior Developer, ML/Data Science",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle AI/ML Engineer"
  },
  {
    "Role": "Principal Developer, ML/Data Science",
    "Naming in PM": "Senior",
    "Client role": "Senior AI/ML Engineer"
  },
  {
    "Role": "Team Lead, ML/Data Science",
    "Naming in PM": "",
    "Client role": "Team Lead AI/ML Engineer"
  },
  {
    "Role": "Technical Architect, ML/Data Science",
    "Naming in PM": "",
    "Client role": "Technical Architect AI/ML Engineer"
  },
  {
    "Role": "Senior Technical Architect, ML/Data Science",
    "Naming in PM": "",
    "Client role": "Senior Technical Architect AI/ML"
  },
  {
    "Role": "Associate Data Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Data Engineer"
  },
  {
    "Role": "Associate Data Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Data Engineer"
  },
  {
    "Role": "Data Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle Data Engineer"
  },
  {
    "Role": "Senior Data Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Data Engineer"
  },
  {
    "Role": "Principal Data Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior Data Engineer"
  },
  {
    "Role": "Team Lead, Data & Analytics",
    "Naming in PM": "",
    "Client role": "Team Lead Data & Analytics"
  },
  {
    "Role": "Associate BI Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior BI Engineer"
  },
  {
    "Role": "Associate BI Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior BI Engineer"
  },
  {
    "Role": "BI Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle BI Engineer"
  },
  {
    "Role": "Senior BI Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle BI Engineer"
  },
  {
    "Role": "Principal BI Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior BI Engineer"
  },
  {
    "Role": "Associate Data Analyst L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Data Analyst"
  },
  {
    "Role": "Associate Data Analyst L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Data Analyst"
  },
  {
    "Role": "Data Analyst",
    "Naming in PM": "Middle",
    "Client role": "Middle Data Analyst"
  },
  {
    "Role": "Senior Data Analyst",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Data Analyst"
  },
  {
    "Role": "Principal Data Analyst",
    "Naming in PM": "Senior",
    "Client role": "Senior Data Analyst"
  },
  {
    "Role": "Associate Data Architect L2, Data & Analytics",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Architect Data & Analytics"
  },
  {
    "Role": "Data Architect, Data & Analytics",
    "Naming in PM": "Middle",
    "Client role": "Middle Architect Data & Analytics"
  },
  {
    "Role": "Senior Data Architect, Data & Analytics",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Architect Data & Analytics"
  },
  {
    "Role": "Principal Data Architect, Data & Analytics",
    "Naming in PM": "Senior",
    "Client role": "Senior Architect Data & Analytics"
  },
  {
    "Role": "Solution Consultant, Data & Analytics",
    "Naming in PM": "Solution consultant",
    "Client role": "Solution Consultant, Data & Analytics"
  },
  {
    "Role": "Associate DB Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior DB Engineer"
  },
  {
    "Role": "Associate DB Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior DB Engineer"
  },
  {
    "Role": "DB Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle DB Engineer"
  },
  {
    "Role": "Senior DB Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle DB Engineer"
  },
  {
    "Role": "Principal DB Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior DB Engineer"
  },
  {
    "Role": "Associate DB Administrator L1",
    "Naming in PM": "Junior",
    "Client role": "Junior DB Administrator"
  },
  {
    "Role": "Associate DB Administrator L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior DB Administrator"
  },
  {
    "Role": "DB Administrator",
    "Naming in PM": "Middle",
    "Client role": "Middle DB Administrator"
  },
  {
    "Role": "Senior DB Administrator",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle DB Administrator"
  },
  {
    "Role": "Principal DB Administrator",
    "Naming in PM": "Senior",
    "Client role": "Senior Principal DB Administrator"
  },
  {
    "Role": "Associate Data QA L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Data QA"
  },
  {
    "Role": "Associate Data QA L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Data QA"
  },
  {
    "Role": "Data QA",
    "Naming in PM": "Middle",
    "Client role": "Middle Data QA"
  },
  {
    "Role": "Senior Data QA",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Data QA"
  },
  {
    "Role": "Principal Data QA",
    "Naming in PM": "Senior",
    "Client role": "Senior Principal Data QA"
  },
  {
    "Role": "Associate Developer L1, Blockchain",
    "Naming in PM": "Junior",
    "Client role": "Junior Developer Blockchain"
  },
  {
    "Role": "Associate Developer L2, Blockchain",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Developer Blockchain"
  },
  {
    "Role": "Developer, Blockchain",
    "Naming in PM": "Middle",
    "Client role": "Middle Developer Blockchain"
  },
  {
    "Role": "Senior Developer, Blockchain",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Developer Blockchain"
  },
  {
    "Role": "Principal Developer, Blockchain",
    "Naming in PM": "Senior",
    "Client role": "Senior Developer Blockchain"
  },
  {
    "Role": "Team Lead, Blockchain",
    "Naming in PM": "Team lead",
    "Client role": "Team Lead, Blockchain"
  },
  {
    "Role": "Technical Architect, Blockchain",
    "Naming in PM": "",
    "Client role": "Technical Architect, Blockchain"
  },
  {
    "Role": "Senior Technical Architect, Blockchain",
    "Naming in PM": "",
    "Client role": "Senior Technical Architect, Blockchain"
  },
  {
    "Role": "Associate Designer",
    "Naming in PM": "Junior/Strong Junior",
    "Client role": "Strong Junior Designer"
  },
  {
    "Role": "Designer",
    "Naming in PM": "Middle",
    "Client role": "Middle Designer"
  },
  {
    "Role": "Senior Designer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Designer"
  },
  {
    "Role": "Principal Designer",
    "Naming in PM": "Senior",
    "Client role": "Senior Designer"
  },
  {
    "Role": "Lead Designer",
    "Naming in PM": "Senior lead",
    "Client role": "Lead Designer"
  },
  {
    "Role": "UX Researcher",
    "Naming in PM": "",
    "Client role": "UX Researcher"
  },
  {
    "Role": "Senior UX Researcher",
    "Naming in PM": "",
    "Client role": "Senior UX Researcher"
  },
  {
    "Role": "Associate Security Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Security Engineer"
  },
  {
    "Role": "Associate Security Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Security Developer"
  },
  {
    "Role": "Security Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle Security Engineer"
  },
  {
    "Role": "Senior Security Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Security Engineer"
  },
  {
    "Role": "Principal Security Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior Security Engineer"
  },
  {
    "Role": "Software Security Architect",
    "Naming in PM": "Architect",
    "Client role": "Software Security Architect"
  },
  {
    "Role": "Associate Penetration Tester L1",
    "Naming in PM": "Junior",
    "Client role": "Junior Penetration Tester"
  },
  {
    "Role": "Associate Penetration Tester L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Penetration Tester"
  },
  {
    "Role": "Penetration Tester",
    "Naming in PM": "Middle",
    "Client role": "Middle Penetration Tester"
  },
  {
    "Role": "Senior Penetration Tester",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Penetration Tester"
  },
  {
    "Role": "Principal Penetration Tester",
    "Naming in PM": "Senior",
    "Client role": "Senior Penetration Tester"
  },
  {
    "Role": "Penetration Tester Team Lead",
    "Naming in PM": "Team Lead",
    "Client role": "Lead Penetration Tester"
  },
  {
    "Role": "Associate Software Developer L1, Salesforce",
    "Naming in PM": "Junior",
    "Client role": "Junior Developer, Salesforce"
  },
  {
    "Role": "Associate Software Developer L2, Salesforce",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior Developer, Salesforce"
  },
  {
    "Role": "Software Developer, Salesforce",
    "Naming in PM": "Middle",
    "Client role": "Middle Developer, Salesforce"
  },
  {
    "Role": "Senior Software Developer, Salesforce",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle Developer, Salesforce"
  },
  {
    "Role": "Principal Software Developer, Salesforce",
    "Naming in PM": "Senior",
    "Client role": "Senior Developer, Salesforce"
  },
  {
    "Role": "Associate Administrator, Salesforce",
    "Naming in PM": "Junior/Strong Junior",
    "Client role": "Strong Junior Administrator, Salesforce"
  },
  {
    "Role": "Administrator, Salesforce",
    "Naming in PM": "Middle",
    "Client role": "Middle Administrator, Salesforce"
  },
  {
    "Role": "Senior Administrator, Salesforce",
    "Naming in PM": "Strong Middle/Senior",
    "Client role": "Strong Middle Administrator, Salesforce"
  },
  {
    "Role": "Technical Architect, Salesforce",
    "Naming in PM": "",
    "Client role": "Technical Architect, Salesforce"
  },
  {
    "Role": "Solution Consultant, Salesforce",
    "Naming in PM": "",
    "Client role": "Solution Consultant, Salesforce"
  },
  {
    "Role": "Associate AEM Backend Developer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior AEM Backend Develop"
  },
  {
    "Role": "Associate AEM Backend Developer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior AEM Backend Develop"
  },
  {
    "Role": "AEM Backend Developer",
    "Naming in PM": "Middle",
    "Client role": "Middle AEM Backend Develop"
  },
  {
    "Role": "Senior AEM Backend Developer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle AEM Backend Develop"
  },
  {
    "Role": "Principal AEM Backend Developer",
    "Naming in PM": "Senior",
    "Client role": "AEM Backend Develope"
  },
  {
    "Role": "AEM Backend Team Lead",
    "Naming in PM": "",
    "Client role": "AEM Backend Team Lead"
  },
  {
    "Role": "Associate AEM Frontend Developer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior AEM Frontend Developer"
  },
  {
    "Role": "Associate AEM Frontend Developer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior AEM Frontend Developer"
  },
  {
    "Role": "AEM Frontend Developer",
    "Naming in PM": "Middle",
    "Client role": "Middle AEM Frontend Developer"
  },
  {
    "Role": "Senior AEM Frontend Developer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle AEM Frontend Developer"
  },
  {
    "Role": "Principal AEM Frontend Developer",
    "Naming in PM": "Senior",
    "Client role": "Senior AEM Frontend Developer"
  },
  {
    "Role": "AEM Frontend Team Lead",
    "Naming in PM": "",
    "Client role": "AEM Frontend Team Lead"
  },
  {
    "Role": "Associate AEM Content Manager L1",
    "Naming in PM": "Junior",
    "Client role": "Junior AEM Content Manager"
  },
  {
    "Role": "Associate AEM Content Manager L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior AEM Content Manager"
  },
  {
    "Role": "AEM Content Manager",
    "Naming in PM": "Middle",
    "Client role": "Middle AEM Content Manager"
  },
  {
    "Role": "Senior AEM Content Manager",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle AEM Content Manager"
  },
  {
    "Role": "Principal  AEM Content Manager",
    "Naming in PM": "Senior",
    "Client role": "Senior AEM Content Manager"
  },
  {
    "Role": "AEM Content Manager Lead",
    "Naming in PM": "",
    "Client role": "AEM Content Manager Lead"
  },
  {
    "Role": "Associate SRE Engineer L1",
    "Naming in PM": "Junior",
    "Client role": "Junior SRE"
  },
  {
    "Role": "Associate SRE Engineer L2",
    "Naming in PM": "Strong Junior",
    "Client role": "Strong Junior SRE"
  },
  {
    "Role": "SRE Engineer",
    "Naming in PM": "Middle",
    "Client role": "Middle SRE"
  },
  {
    "Role": "Senior SRE Engineer",
    "Naming in PM": "Strong Middle",
    "Client role": "Strong Middle SRE"
  },
  {
    "Role": "Principal SRE Engineer",
    "Naming in PM": "Senior",
    "Client role": "Senior SRE"
  },
  {
    "Role": "SRE Team Lead",
    "Naming in PM": "",
    "Client role": "SRE Team Lead"
  },
  {
    "Role": "SRE Architect",
    "Naming in PM": "",
    "Client role": "SRE Architect"
  },
  {
    "Role": "Senior SRE Architect",
    "Naming in PM": "",
    "Client role": "Senior SRE Architect"
  }
];

/**
 * Get the client role from the internal role name
 * @param role - The internal role name
 * @returns The corresponding client role, or the original role if no mapping found
 */
export const getClientRoleFromRole = (role: string): string => {
  const matchingRole = clientRolesMapping.find(mapping => 
    mapping.Role === role
  );
  
  return matchingRole ? matchingRole["Client role"] : role;
};
