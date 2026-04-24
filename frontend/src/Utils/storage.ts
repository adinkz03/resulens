export interface ScoreComponent {
  label: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface ComponentScoreDetail {
  score: number;
  reason: string;
  evidence?: string[];
  missing_or_weak?: string[];
}

export interface Candidate {
  candidate_id?: string;
  name: string;
  score: number;
  match_level: 'High' | 'Medium' | 'Low';
  is_recommended: boolean;
  summary: string;
  location?: string;
  stage?: string;
  recommendation_status?: 'YES' | 'POTENTIAL' | 'REVIEW' | 'NO';
  location_fit?: string;
  experience_fit?: string;
  technical_fit?: string;
  education_fit?: string;
  about_candidate?: string;
  match_issues?: string;
  tech_score?: number;
  exp_score?: number;
  location_score?: number;
  location_explanation?: string;
  experience_explanation?: string;
  technical_explanation?: string;
  education_explanation?: string;
  resume_url?: string;
  resume_filename?: string;
  interview_questions?: string[];
  recommendation_summary?: string;
  is_new?: boolean;
  
  score_breakdown?: {
    core_requirement?: ScoreComponent;
    role_capability?: ScoreComponent;
    experience_relevance?: ScoreComponent;
    role_alignment?: ScoreComponent;
    education_credential?: ScoreComponent;
    evidence_confidence?: ScoreComponent;
  };

  component_scores?: {
    core_requirement_match?: ComponentScoreDetail;
    role_specific_capability?: ComponentScoreDetail;
    experience_relevance?: ComponentScoreDetail;
    education_credential_fit?: ComponentScoreDetail;
    evidence_quality?: ComponentScoreDetail;
  };
}

export interface Batch {
  id: string;
  date: string;
  count: number;
  status: 'Completed' | 'Failed' | 'Processing';
}

export interface Job {
  id: string;
  title: string;
  status: 'Active' | 'Closed';
  positionStatus?: 'Open' | 'On Hold' | 'Closed';
  createdAt: string;
  details: {
    basic: {
      employmentType: string;
      expLevel: string;
      location: string;
    };
    technical: {
      skills: string;
      tools: string;
      certs: string;
    };
    qualifications: {
      education: string;
      experience: string;
      languages: string;
    };
    additional: {
      responsibilities: string;
      softSkills: string;
      culturalFit: string;
    };
  };
  candidates: Candidate[];
  batches?: Batch[];
}
