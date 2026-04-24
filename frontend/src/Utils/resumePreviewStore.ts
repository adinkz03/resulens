const PREVIEW_KEY = "resulens_resume_previews";

export interface ResumePreviewItem {
  candidate_id: string;
  resume_url?: string;
  resume_filename?: string;
}

type ResumePreviewMap = Record<string, ResumePreviewItem>;

const readStore = (): ResumePreviewMap => {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeStore = (data: ResumePreviewMap) => {
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(data));
};

export const saveResumePreview = (
  candidateId: string,
  resumeUrl?: string,
  resumeFilename?: string
) => {
  if (!candidateId) return;

  const store = readStore();
  store[candidateId] = {
    candidate_id: candidateId,
    resume_url: resumeUrl,
    resume_filename: resumeFilename
  };
  writeStore(store);
};

export const getResumePreview = (candidateId: string): ResumePreviewItem | null => {
  if (!candidateId) return null;
  const store = readStore();
  return store[candidateId] || null;
};

export const deleteResumePreview = (candidateId: string) => {
  if (!candidateId) return;
  const store = readStore();
  delete store[candidateId];
  writeStore(store);
};